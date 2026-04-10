/**
 * Azure Infrastructure Scanner
 *
 * Scans real Azure resources using Azure SDK for JS and maps them to InfraNode/InfraEdge.
 * Uses DefaultAzureCredential (env vars, managed identity, Azure CLI, etc.)
 */

import type { InfraNode, InfraEdge, InfraGraph, HealthStatus } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function provisioningHealth(state: string | undefined): HealthStatus {
  if (!state) return 'warning'
  const s = state.toLowerCase()
  if (s === 'succeeded' || s === 'running') return 'healthy'
  if (s === 'creating' || s === 'updating' || s === 'starting') return 'warning'
  return 'error'
}

function extractResourceGroup(resourceId: string): string {
  const match = resourceId.match(/\/resourceGroups\/([^/]+)/i)
  return match ? match[1] : 'unknown'
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

export async function scanAzure(subscriptionId: string): Promise<InfraGraph> {
  const nodes: InfraNode[] = []
  const edges: InfraEdge[] = []

  // Dynamic imports so Vite never bundles these server-only SDKs
  const [
    { DefaultAzureCredential },
    { NetworkManagementClient },
    { ContainerServiceClient },
    { CosmosDBManagementClient },
    { WebSiteManagementClient },
    { CdnManagementClient },
  ] = await Promise.all([
    import('@azure/identity'),
    import('@azure/arm-network'),
    import('@azure/arm-containerservice'),
    import('@azure/arm-cosmosdb'),
    import('@azure/arm-appservice'),
    import('@azure/arm-cdn'),
  ])

  const credential = new DefaultAzureCredential()

  const networkClient = new NetworkManagementClient(credential, subscriptionId)
  const aksClient = new ContainerServiceClient(credential, subscriptionId)
  const cosmosClient = new CosmosDBManagementClient(credential, subscriptionId)
  const webClient = new WebSiteManagementClient(credential, subscriptionId)
  const cdnClient = new CdnManagementClient(credential, subscriptionId)

  // Tracking maps for edge detection
  const vnetIdToNodeId: Record<string, string> = {}
  const subnetIdToNodeId: Record<string, string> = {}
  const aksNodeIds: string[] = []
  const cosmosNodeIds: string[] = []
  const cosmosEndpoints: Record<string, string> = {} // endpoint -> nodeId
  const functionAppNodeIds: string[] = []
  const webAppNodeIds: string[] = []
  const storageAccountNodeIds: string[] = []

  // -----------------------------------------------------------------------
  // 1. Virtual Networks & Subnets
  // -----------------------------------------------------------------------
  try {
    for await (const vnet of networkClient.virtualNetworks.listAll()) {
      const vnetId = vnet.id ?? 'unknown'
      const vnetName = vnet.name ?? 'unknown'
      const nodeId = `az-vnet-${vnetName}`
      const rg = extractResourceGroup(vnetId)
      const location = vnet.location ?? 'unknown'

      vnetIdToNodeId[vnetId] = nodeId

      const addressSpaces = vnet.addressSpace?.addressPrefixes?.join(', ') ?? ''

      nodes.push({
        id: nodeId,
        label: vnetName,
        provider: 'azure',
        type: 'vnet',
        category: 'network',
        region: location,
        metadata: {
          resourceId: vnetId,
          resourceGroup: rg,
          addressSpace: addressSpaces,
          provisioningState: vnet.provisioningState ?? '',
          enableDdosProtection: String(vnet.enableDdosProtection ?? false),
        },
        status: provisioningHealth(vnet.provisioningState),
        importance: 8,
      })

      // Subnets
      for (const subnet of vnet.subnets ?? []) {
        const subnetId = subnet.id ?? 'unknown'
        const subnetName = subnet.name ?? 'unknown'
        const subnetNodeId = `az-subnet-${vnetName}-${subnetName}`

        subnetIdToNodeId[subnetId] = subnetNodeId

        nodes.push({
          id: subnetNodeId,
          label: `${vnetName}/${subnetName}`,
          provider: 'azure',
          type: 'subnet',
          category: 'network',
          region: location,
          parent: nodeId,
          metadata: {
            resourceId: subnetId,
            addressPrefix: subnet.addressPrefix ?? '',
            provisioningState: subnet.provisioningState ?? '',
            nsg: subnet.networkSecurityGroup?.id ?? 'none',
            delegations: (subnet.delegations ?? []).map((d: any) => d.serviceName ?? '').join(', ') || 'none',
          },
          status: provisioningHealth(subnet.provisioningState),
          importance: 4,
        })
      }

      // VNet peerings -> cross-VNet edges
      for (const peering of vnet.virtualNetworkPeerings ?? []) {
        const remoteVnetId = peering.remoteVirtualNetwork?.id
        if (remoteVnetId) {
          // We'll add the edge even if the remote vnet hasn't been scanned yet
          edges.push({
            id: `edge-peering-${vnetName}-${peering.name}`,
            source: nodeId,
            target: `az-vnet-${remoteVnetId.split('/').pop() ?? 'unknown'}`,
            type: 'network',
            label: `VNet peering: ${peering.peeringState ?? ''}`,
          })
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Azure Scanner] VNet scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 2. AKS Clusters
  // -----------------------------------------------------------------------
  try {
    for await (const cluster of aksClient.managedClusters.list()) {
      const clusterName = cluster.name ?? 'unknown'
      const clusterId = cluster.id ?? 'unknown'
      const nodeId = `az-aks-${clusterName}`
      const rg = extractResourceGroup(clusterId)
      const location = cluster.location ?? 'unknown'

      aksNodeIds.push(nodeId)

      // Find parent VNet from agent pool subnet
      let parent: string | undefined
      const defaultPool = cluster.agentPoolProfiles?.[0]
      if (defaultPool?.vnetSubnetID) {
        parent = subnetIdToNodeId[defaultPool.vnetSubnetID]
        // Also try to link to VNet
        const vnetMatch = defaultPool.vnetSubnetID.match(/\/virtualNetworks\/([^/]+)/)
        if (vnetMatch) {
          const vnetName = vnetMatch[1]
          const vnetNodeId = `az-vnet-${vnetName}`
          if (vnetIdToNodeId[vnetNodeId] || nodes.find(n => n.id === vnetNodeId)) {
            parent = parent || vnetNodeId
          }
        }
      }

      const totalNodes = (cluster.agentPoolProfiles ?? []).reduce(
        (sum: number, p: any) => sum + (p.count ?? 0), 0
      )

      nodes.push({
        id: nodeId,
        label: `AKS: ${clusterName}`,
        provider: 'azure',
        type: 'aks',
        category: 'container',
        region: location,
        parent,
        metadata: {
          resourceId: clusterId,
          resourceGroup: rg,
          kubernetesVersion: cluster.kubernetesVersion ?? '',
          provisioningState: cluster.provisioningState ?? '',
          powerState: cluster.powerState?.code ?? '',
          nodeCount: String(totalNodes),
          agentPools: String(cluster.agentPoolProfiles?.length ?? 0),
          vmSize: defaultPool?.vmSize ?? '',
          fqdn: cluster.fqdn ?? '',
          networkPlugin: cluster.networkProfile?.networkPlugin ?? '',
          networkPolicy: cluster.networkProfile?.networkPolicy ?? '',
        },
        status: provisioningHealth(cluster.provisioningState),
        importance: 9,
      })
    }
  } catch (err: any) {
    console.warn(`[Azure Scanner] AKS scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 3. CosmosDB Accounts
  // -----------------------------------------------------------------------
  try {
    for await (const account of cosmosClient.databaseAccounts.list()) {
      const accountName = account.name ?? 'unknown'
      const accountId = account.id ?? 'unknown'
      const nodeId = `az-cosmos-${accountName}`
      const rg = extractResourceGroup(accountId)
      const location = account.location ?? 'unknown'

      cosmosNodeIds.push(nodeId)
      if (account.documentEndpoint) {
        cosmosEndpoints[account.documentEndpoint] = nodeId
      }

      const locations = (account.readLocations ?? []).map((l: any) => l.locationName ?? '').join(', ')
      const consistencyLevel = account.consistencyPolicy?.defaultConsistencyLevel ?? ''

      nodes.push({
        id: nodeId,
        label: `CosmosDB: ${accountName}`,
        provider: 'azure',
        type: 'cosmosdb',
        category: 'database',
        region: location,
        metadata: {
          resourceId: accountId,
          resourceGroup: rg,
          kind: account.kind ?? '',
          api: account.databaseAccountOfferType ?? '',
          documentEndpoint: account.documentEndpoint ?? '',
          consistencyLevel,
          readLocations: locations,
          enableAutomaticFailover: String(account.enableAutomaticFailover ?? false),
          enableMultipleWriteLocations: String(account.enableMultipleWriteLocations ?? false),
          provisioningState: account.provisioningState ?? '',
        },
        status: provisioningHealth(account.provisioningState),
        importance: 8,
      })
    }
  } catch (err: any) {
    console.warn(`[Azure Scanner] CosmosDB scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 4. Function Apps & Web Apps
  // -----------------------------------------------------------------------
  try {
    for await (const app of webClient.webApps.list()) {
      const appName = app.name ?? 'unknown'
      const appId = app.id ?? 'unknown'
      const rg = extractResourceGroup(appId)
      const location = app.location ?? 'unknown'
      const kind = app.kind ?? ''

      const isFunctionApp = kind.includes('functionapp')
      const nodeId = isFunctionApp ? `az-func-${appName}` : `az-webapp-${appName}`
      const type = isFunctionApp ? 'function' : 'webapp'
      const category = isFunctionApp ? 'serverless' as const : 'compute' as const

      if (isFunctionApp) {
        functionAppNodeIds.push(nodeId)
      } else {
        webAppNodeIds.push(nodeId)
      }

      nodes.push({
        id: nodeId,
        label: appName,
        provider: 'azure',
        type,
        category,
        region: location,
        metadata: {
          resourceId: appId,
          resourceGroup: rg,
          kind,
          state: app.state ?? '',
          defaultHostName: app.defaultHostName ?? '',
          httpsOnly: String(app.httpsOnly ?? false),
          repositorySiteName: app.repositorySiteName ?? '',
          usageState: app.usageState ?? '',
          availabilityState: app.availabilityState ?? '',
        },
        status: app.state === 'Running' ? 'healthy' : 'warning',
        importance: isFunctionApp ? 5 : 7,
      })
    }
  } catch (err: any) {
    console.warn(`[Azure Scanner] Web Apps scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 5. CDN Profiles & Front Door
  // -----------------------------------------------------------------------
  try {
    for await (const profile of cdnClient.profiles.list()) {
      const profileName = profile.name ?? 'unknown'
      const profileId = profile.id ?? 'unknown'
      const rg = extractResourceGroup(profileId)
      const location = profile.location ?? 'global'
      const sku = profile.sku?.name ?? ''

      const isFrontDoor = sku.toLowerCase().includes('azurefrontdoor') ||
                          sku.toLowerCase().includes('premium_azurefrontdoor') ||
                          sku.toLowerCase().includes('standard_azurefrontdoor')

      const nodeId = isFrontDoor ? `az-fd-${profileName}` : `az-cdn-${profileName}`

      nodes.push({
        id: nodeId,
        label: isFrontDoor ? `Front Door: ${profileName}` : `CDN: ${profileName}`,
        provider: 'azure',
        type: isFrontDoor ? 'frontdoor' : 'cdn',
        category: 'cdn',
        region: location,
        metadata: {
          resourceId: profileId,
          resourceGroup: rg,
          sku,
          provisioningState: profile.provisioningState ?? '',
          resourceState: profile.resourceState ?? '',
        },
        status: provisioningHealth(profile.provisioningState),
        importance: 7,
      })

      // Try to list endpoints for this CDN profile to discover origins
      try {
        const endpoints = cdnClient.afdEndpoints.listByProfile(rg, profileName)
        for await (const ep of endpoints) {
          // Front Door endpoints route to AKS, Web Apps, etc.
          // Create edges for known backend types
          for (const aksNodeId of aksNodeIds) {
            edges.push({
              id: `edge-${nodeId}-${aksNodeId}`,
              source: nodeId,
              target: aksNodeId,
              type: 'network',
              label: `CDN ingress via ${ep.hostName ?? 'endpoint'}`,
            })
          }
          for (const webAppNodeId of webAppNodeIds) {
            edges.push({
              id: `edge-${nodeId}-${webAppNodeId}`,
              source: nodeId,
              target: webAppNodeId,
              type: 'network',
              label: `CDN ingress via ${ep.hostName ?? 'endpoint'}`,
            })
          }
        }
      } catch {
        // afdEndpoints may not exist for classic CDN profiles
      }
    }
  } catch (err: any) {
    console.warn(`[Azure Scanner] CDN scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 6. Storage Accounts (via ARM, not data-plane blob SDK)
  // -----------------------------------------------------------------------
  try {
    // Use the Storage Management client for listing accounts
    const { StorageManagementClient } = await import('@azure/arm-storage')
    const storageClient = new StorageManagementClient(credential, subscriptionId)

    for await (const account of storageClient.storageAccounts.list()) {
      const accountName = account.name ?? 'unknown'
      const accountId = account.id ?? 'unknown'
      const nodeId = `az-storage-${accountName}`
      const rg = extractResourceGroup(accountId)
      const location = account.location ?? 'unknown'

      storageAccountNodeIds.push(nodeId)

      nodes.push({
        id: nodeId,
        label: `Storage: ${accountName}`,
        provider: 'azure',
        type: 'blob',
        category: 'storage',
        region: location,
        metadata: {
          resourceId: accountId,
          resourceGroup: rg,
          kind: account.kind ?? '',
          sku: account.sku?.name ?? '',
          tier: account.sku?.tier ?? '',
          accessTier: account.accessTier ?? '',
          httpsOnly: String(account.enableHttpsTrafficOnly ?? true),
          provisioningState: account.provisioningState ?? '',
          primaryEndpoint: account.primaryEndpoints?.blob ?? '',
          encryption: account.encryption?.services?.blob?.enabled ? 'enabled' : 'disabled',
        },
        status: provisioningHealth(account.provisioningState),
        importance: 6,
      })
    }
  } catch (err: any) {
    console.warn(`[Azure Scanner] Storage Accounts scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // Edge detection: AKS -> CosmosDB (common pattern)
  // -----------------------------------------------------------------------
  for (const aksNodeId of aksNodeIds) {
    for (const cosmosNodeId of cosmosNodeIds) {
      // Heuristic: if they share the same resource group or region, likely connected
      const aksNode = nodes.find(n => n.id === aksNodeId)
      const cosmosNode = nodes.find(n => n.id === cosmosNodeId)
      if (aksNode && cosmosNode && aksNode.metadata.resourceGroup === cosmosNode.metadata.resourceGroup) {
        edges.push({
          id: `edge-${aksNodeId}-${cosmosNodeId}`,
          source: aksNodeId,
          target: cosmosNodeId,
          type: 'data',
          label: 'DB connection (same RG)',
        })
      }
    }
  }

  // Edge detection: Function Apps -> CosmosDB (common binding pattern)
  for (const funcNodeId of functionAppNodeIds) {
    for (const cosmosNodeId of cosmosNodeIds) {
      const funcNode = nodes.find(n => n.id === funcNodeId)
      const cosmosNode = nodes.find(n => n.id === cosmosNodeId)
      if (funcNode && cosmosNode && funcNode.metadata.resourceGroup === cosmosNode.metadata.resourceGroup) {
        edges.push({
          id: `edge-${funcNodeId}-${cosmosNodeId}`,
          source: funcNodeId,
          target: cosmosNodeId,
          type: 'data',
          label: 'CosmosDB binding',
        })
      }
    }
  }

  // Edge detection: Web Apps / Function Apps -> Storage (common pattern)
  for (const appNodeId of [...functionAppNodeIds, ...webAppNodeIds]) {
    for (const storageNodeId of storageAccountNodeIds) {
      const appNode = nodes.find(n => n.id === appNodeId)
      const storageNode = nodes.find(n => n.id === storageNodeId)
      if (appNode && storageNode && appNode.metadata.resourceGroup === storageNode.metadata.resourceGroup) {
        edges.push({
          id: `edge-${appNodeId}-${storageNodeId}`,
          source: appNodeId,
          target: storageNodeId,
          type: 'data',
          label: 'storage access',
        })
      }
    }
  }

  return { nodes, edges }
}
