/**
 * Multi-Cloud Infrastructure Scanner
 *
 * Orchestrates AWS, Azure, and GCP scanners in parallel, merges the resulting
 * graphs, and detects cross-cloud edges by analysing resource names, tags,
 * endpoints, and network configurations.
 *
 * AWS scanning combines:
 * - Imperative scanners (aws.ts) for EC2, RDS, Lambda, S3, CloudFront, ECS, EKS
 * - Declarative descriptor-based scanners (descriptors.ts + scan-from-descriptor.ts)
 *   for SQS, SNS, DynamoDB, ElastiCache, API Gateway, Route53, ELBv2, Step Functions,
 *   EventBridge
 *
 * Azure scanning combines:
 * - Imperative scanners (azure.ts) for VNets, AKS, CosmosDB, Web/Function Apps,
 *   CDN/Front Door, Storage Accounts
 * - Declarative descriptor-based scanners (azure-descriptors.ts + azure-scan-descriptors.ts)
 *   for SQL Database, Redis Cache, Service Bus, Event Hubs, Key Vault, App Configuration,
 *   Container Registry, PostgreSQL Flexible, Application Gateway, Load Balancers
 *
 * GCP scanning combines:
 * - Imperative scanners (gcp.ts) for VPC, Compute Engine, Cloud Run, BigQuery,
 *   Cloud Storage, Pub/Sub
 * - Declarative descriptor-based scanners (gcp-descriptors.ts + gcp-scan-descriptors.ts)
 *   for Cloud SQL, Cloud Functions, Memorystore Redis, Artifact Registry, Cloud Armor,
 *   Cloud DNS, GKE, Cloud Spanner, Firestore, Cloud Tasks, Cloud Scheduler
 */

import type {
  Provider,
  InfraNode,
  InfraEdge,
  InfraGraph,
  ScanConfig,
  ProviderConfig,
  AWSProviderConfig,
  AzureProviderConfig,
  GCPProviderConfig,
} from '../types'

export type { ScanConfig, ProviderConfig }

// ---------------------------------------------------------------------------
// Cross-cloud edge detection
// ---------------------------------------------------------------------------

function detectCrossCloudEdges(nodes: InfraNode[], existingEdges: InfraEdge[]): InfraEdge[] {
  const crossEdges: InfraEdge[] = []
  const existingEdgeIds = new Set(existingEdges.map(e => e.id))

  // Index nodes by provider for O(n) traversal
  const nodesByProvider: Record<Provider, InfraNode[]> = {
    aws: [],
    azure: [],
    gcp: [],
  }
  for (const node of nodes) {
    nodesByProvider[node.provider].push(node)
  }

  // Helper to avoid duplicates
  function addEdge(source: string, target: string, label: string) {
    const id = `xc-${source}-${target}`
    const reverseId = `xc-${target}-${source}`
    if (!existingEdgeIds.has(id) && !existingEdgeIds.has(reverseId)) {
      crossEdges.push({ id, source, target, type: 'cross-cloud', label })
      existingEdgeIds.add(id)
    }
  }

  // Strategy 1: Matching names / tags that reference other clouds
  // Look for nodes whose metadata values reference resources in other providers
  const allNodeLabels: Record<string, string> = {} // label -> nodeId
  const allNodeEndpoints: Record<string, string> = {} // endpoint/url -> nodeId
  for (const node of nodes) {
    allNodeLabels[node.label.toLowerCase()] = node.id
    // Index interesting metadata values
    for (const [key, val] of Object.entries(node.metadata)) {
      const lk = key.toLowerCase()
      if (lk.includes('endpoint') || lk.includes('uri') || lk.includes('url') || lk.includes('hostname') || lk.includes('fqdn')) {
        if (val) allNodeEndpoints[val.toLowerCase()] = node.id
      }
    }
  }

  for (const node of nodes) {
    const metaValues = Object.values(node.metadata).join(' ').toLowerCase()

    // Check if metadata references S3 buckets from another provider
    if (node.provider !== 'aws') {
      for (const awsNode of nodesByProvider.aws) {
        if (awsNode.type === 's3' && metaValues.includes(awsNode.metadata.bucketName?.toLowerCase() ?? '---')) {
          addEdge(node.id, awsNode.id, 'cross-cloud S3 reference')
        }
      }
    }

    // Check if metadata references GCS buckets from another provider
    if (node.provider !== 'gcp') {
      for (const gcpNode of nodesByProvider.gcp) {
        if (gcpNode.type === 'gcs' && metaValues.includes(gcpNode.metadata.bucketName?.toLowerCase() ?? '---')) {
          addEdge(node.id, gcpNode.id, 'cross-cloud GCS reference')
        }
      }
    }

    // Check if metadata references Azure CosmosDB endpoints
    if (node.provider !== 'azure') {
      for (const azNode of nodesByProvider.azure) {
        if (azNode.type === 'cosmosdb') {
          const endpoint = azNode.metadata.documentEndpoint?.toLowerCase() ?? ''
          if (endpoint && metaValues.includes(endpoint)) {
            addEdge(node.id, azNode.id, 'cross-cloud CosmosDB reference')
          }
        }
      }
    }

    // Check for RDS endpoint references from non-AWS providers
    if (node.provider !== 'aws') {
      for (const awsNode of nodesByProvider.aws) {
        if (awsNode.type === 'rds') {
          const endpoint = awsNode.metadata.endpoint?.toLowerCase() ?? ''
          if (endpoint && metaValues.includes(endpoint)) {
            addEdge(node.id, awsNode.id, 'cross-cloud RDS reference')
          }
        }
      }
    }
  }

  // Strategy 2: Tag-based matching
  // Look for "partner" or "sync" or "replicate" tags
  const crossCloudTagKeys = ['partner', 'sync-target', 'replicate-to', 'cross-cloud', 'failover', 'mirror']

  for (const node of nodes) {
    for (const tagKey of crossCloudTagKeys) {
      const tagVal = node.metadata[tagKey]
      if (!tagVal) continue

      // Try to find a node whose id or label matches the tag value
      const matchById = nodes.find(n => n.id === tagVal && n.provider !== node.provider)
      if (matchById) {
        addEdge(node.id, matchById.id, `tag: ${tagKey}`)
        continue
      }
      const matchByLabel = nodes.find(n =>
        n.label.toLowerCase() === tagVal.toLowerCase() && n.provider !== node.provider
      )
      if (matchByLabel) {
        addEdge(node.id, matchByLabel.id, `tag: ${tagKey}`)
      }
    }
  }

  // Strategy 3: CDN / Front Door -> resources in other clouds (origin detection)
  for (const node of nodes) {
    if (node.category !== 'cdn') continue
    const origins = node.metadata.origins ?? ''
    // Check if any origin domain points to a resource in another cloud
    for (const otherNode of nodes) {
      if (otherNode.provider === node.provider) continue
      const endpoint = otherNode.metadata.endpoint ||
                       otherNode.metadata.documentEndpoint ||
                       otherNode.metadata.uri ||
                       otherNode.metadata.defaultHostName ||
                       otherNode.metadata.fqdn || ''
      if (endpoint && origins.toLowerCase().includes(endpoint.toLowerCase())) {
        addEdge(node.id, otherNode.id, 'CDN cross-cloud origin')
      }
    }
  }

  // Strategy 4: Same-named storage buckets across clouds (data replication pattern)
  for (const awsNode of nodesByProvider.aws.filter(n => n.type === 's3')) {
    const bucket = awsNode.metadata.bucketName?.toLowerCase() ?? ''
    if (!bucket) continue
    for (const gcpNode of nodesByProvider.gcp.filter(n => n.type === 'gcs')) {
      const gcsBucket = gcpNode.metadata.bucketName?.toLowerCase() ?? ''
      // Fuzzy match: strip provider-specific suffixes
      const awsBase = bucket.replace(/-aws$/, '').replace(/-s3$/, '')
      const gcpBase = gcsBucket.replace(/-gcp$/, '').replace(/-gcs$/, '')
      if (awsBase === gcpBase && awsBase.length > 3) {
        addEdge(awsNode.id, gcpNode.id, 'data replication (name match)')
      }
    }
  }

  return crossEdges
}

// ---------------------------------------------------------------------------
// Multi-profile helpers
// ---------------------------------------------------------------------------

/**
 * Prefix all node IDs and edge source/targets with a profile name.
 * This avoids collisions when scanning the same AWS region under
 * multiple IAM profiles (e.g. prod/aws-ec2-i-123, staging/aws-ec2-i-456).
 * Also sets the `account` field on each node.
 */
function prefixGraphIds(graph: InfraGraph, profile: string): InfraGraph {
  const pfx = `${profile}/`
  const nodes = graph.nodes.map(n => ({
    ...n,
    id: `${pfx}${n.id}`,
    parent: n.parent ? `${pfx}${n.parent}` : undefined,
    account: profile,
  }))
  const edges = graph.edges.map(e => ({
    ...e,
    id: `${pfx}${e.id}`,
    source: `${pfx}${e.source}`,
    target: `${pfx}${e.target}`,
  }))
  return { nodes, edges }
}

/**
 * Detect cross-profile edges for nodes that share the same provider
 * but belong to different accounts. Matched via VPC peering CIDRs,
 * shared RDS endpoints, or matching metadata references.
 */
function detectCrossProfileEdges(nodes: InfraNode[], existingEdges: InfraEdge[]): InfraEdge[] {
  const crossEdges: InfraEdge[] = []
  const existingEdgeIds = new Set(existingEdges.map(e => e.id))

  // Index nodes by account
  const nodesByAccount: Record<string, InfraNode[]> = {}
  for (const node of nodes) {
    if (!node.account) continue
    if (!nodesByAccount[node.account]) nodesByAccount[node.account] = []
    nodesByAccount[node.account].push(node)
  }

  const accounts = Object.keys(nodesByAccount)
  if (accounts.length < 2) return crossEdges

  function addEdge(source: string, target: string, label: string) {
    const id = `xp-${source}-${target}`
    const reverseId = `xp-${target}-${source}`
    if (!existingEdgeIds.has(id) && !existingEdgeIds.has(reverseId)) {
      crossEdges.push({ id, source, target, type: 'cross-cloud', label })
      existingEdgeIds.add(id)
    }
  }

  // Strategy: matching RDS/database endpoints referenced across accounts
  const endpointToNode: Record<string, string> = {}
  for (const node of nodes) {
    if (!node.account) continue
    const ep = node.metadata.endpoint?.toLowerCase()
    if (ep) endpointToNode[ep] = node.id
  }

  for (const node of nodes) {
    if (!node.account) continue
    const metaValues = Object.values(node.metadata).join(' ').toLowerCase()
    for (const [ep, epNodeId] of Object.entries(endpointToNode)) {
      if (epNodeId === node.id) continue
      // Check that they are from different accounts
      const epNode = nodes.find(n => n.id === epNodeId)
      if (!epNode || epNode.account === node.account) continue
      if (metaValues.includes(ep)) {
        addEdge(node.id, epNodeId, 'cross-account endpoint reference')
      }
    }
  }

  return crossEdges
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function scanInfrastructure(config: ScanConfig): Promise<InfraGraph> {
  const scanPromises: Array<Promise<{ graph: InfraGraph; provider: string }>> = []

  for (const providerConfig of config.providers) {
    switch (providerConfig.type) {
      case 'aws': {
        const regions = [
          providerConfig.config.region,
          ...(providerConfig.config.additionalRegions ?? []),
        ]
        // Support multi-profile scanning: each profile scans independently
        const profiles: Array<string | undefined> = providerConfig.config.profiles && providerConfig.config.profiles.length > 0
          ? providerConfig.config.profiles
          : [undefined] // undefined = default credential chain

        for (const profile of profiles) {
          for (const region of regions) {
            const label = profile ? `${profile}/${region}` : region

            // Imperative scanner (EC2, RDS, Lambda, S3, CloudFront, ECS, EKS)
            scanPromises.push(
              (async () => {
                try {
                  // Set AWS_PROFILE env var for this scan if a profile is specified
                  const prevProfile = process.env.AWS_PROFILE
                  if (profile) {
                    process.env.AWS_PROFILE = profile
                  }

                  const { scanAWS } = await import('./aws')
                  const graph = await scanAWS(region)

                  // Restore previous profile
                  if (profile) {
                    if (prevProfile !== undefined) {
                      process.env.AWS_PROFILE = prevProfile
                    } else {
                      delete process.env.AWS_PROFILE
                    }
                  }

                  // Prefix node IDs for multi-profile disambiguation
                  if (profile) {
                    const prefixed = prefixGraphIds(graph, profile)
                    console.log(`[Scanner] AWS ${label}: ${prefixed.nodes.length} nodes, ${prefixed.edges.length} edges`)
                    return { graph: prefixed, provider: `aws:${label}` }
                  }

                  console.log(`[Scanner] AWS ${label}: ${graph.nodes.length} nodes, ${graph.edges.length} edges`)
                  return { graph, provider: `aws:${label}` }
                } catch (err: any) {
                  console.error(`[Scanner] AWS ${label} scan failed: ${err.message}`)
                  if (err.message?.includes('Could not load credentials') ||
                      err.message?.includes('CredentialsProviderError') ||
                      err.name === 'CredentialsProviderError') {
                    console.error('[Scanner] Hint: Configure AWS credentials via environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY), ~/.aws/credentials, or IAM role.')
                  }
                  return { graph: { nodes: [], edges: [] }, provider: `aws:${label}` }
                }
              })()
            )

            // Declarative descriptor-based scanners (SQS, SNS, DynamoDB, ElastiCache,
            // API Gateway, Route53, ELBv2, Step Functions, EventBridge)
            scanPromises.push(
              (async () => {
                try {
                  const prevProfile = process.env.AWS_PROFILE
                  if (profile) {
                    process.env.AWS_PROFILE = profile
                  }

                  const { AWS_SERVICE_DESCRIPTORS } = await import('./descriptors')
                  const { scanAllDescriptors } = await import('./scan-from-descriptor')
                  const graph = await scanAllDescriptors(AWS_SERVICE_DESCRIPTORS, region)

                  if (profile) {
                    if (prevProfile !== undefined) {
                      process.env.AWS_PROFILE = prevProfile
                    } else {
                      delete process.env.AWS_PROFILE
                    }
                  }

                  if (profile && graph.nodes.length > 0) {
                    const prefixed = prefixGraphIds(graph, profile)
                    console.log(`[Scanner] AWS ${label} (descriptors): ${prefixed.nodes.length} additional nodes`)
                    return { graph: prefixed, provider: `aws:${label}:descriptors` }
                  }

                  if (graph.nodes.length > 0) {
                    console.log(`[Scanner] AWS ${label} (descriptors): ${graph.nodes.length} additional nodes`)
                  }
                  return { graph, provider: `aws:${label}:descriptors` }
                } catch (err: any) {
                  console.error(`[Scanner] AWS ${label} descriptor scan failed: ${err.message}`)
                  return { graph: { nodes: [], edges: [] }, provider: `aws:${label}:descriptors` }
                }
              })()
            )
          }
        }
        break
      }

      case 'azure': {
        // Azure: imperative (existing) + descriptor-based (new)
        scanPromises.push(
          (async () => {
            try {
              const { scanAzure } = await import('./azure')
              const graph = await scanAzure(providerConfig.config.subscriptionId)
              console.log(`[Scanner] Azure: ${graph.nodes.length} nodes, ${graph.edges.length} edges`)
              return { graph, provider: 'azure' }
            } catch (err: any) {
              console.error(`[Scanner] Azure scan failed: ${err.message}`)
              if (err.message?.includes('DefaultAzureCredential') ||
                  err.message?.includes('CredentialUnavailableError') ||
                  err.name === 'CredentialUnavailableError') {
                console.error('[Scanner] Hint: Configure Azure credentials via environment variables (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET), Azure CLI (`az login`), or managed identity.')
              }
              return { graph: { nodes: [], edges: [] }, provider: 'azure' }
            }
          })()
        )

        // Declarative descriptor-based scanners (SQL, Redis, Service Bus, Event Hubs,
        // Key Vault, App Configuration, Container Registry, PostgreSQL, App Gateway, LB)
        scanPromises.push(
          (async () => {
            try {
              const { AZURE_SERVICE_DESCRIPTORS } = await import('./azure-descriptors')
              const { scanAllAzureDescriptors } = await import('./azure-scan-descriptors')
              const graph = await scanAllAzureDescriptors(
                AZURE_SERVICE_DESCRIPTORS,
                providerConfig.config.subscriptionId,
              )
              if (graph.nodes.length > 0) {
                console.log(`[Scanner] Azure (descriptors): ${graph.nodes.length} additional nodes`)
              }
              return { graph, provider: 'azure:descriptors' }
            } catch (err: any) {
              console.error(`[Scanner] Azure descriptor scan failed: ${err.message}`)
              return { graph: { nodes: [], edges: [] }, provider: 'azure:descriptors' }
            }
          })()
        )
        break
      }

      case 'gcp': {
        // GCP: imperative (existing) + descriptor-based (new)
        scanPromises.push(
          (async () => {
            try {
              const { scanGCP } = await import('./gcp')
              const graph = await scanGCP(providerConfig.config.projectId)
              console.log(`[Scanner] GCP: ${graph.nodes.length} nodes, ${graph.edges.length} edges`)
              return { graph, provider: 'gcp' }
            } catch (err: any) {
              console.error(`[Scanner] GCP scan failed: ${err.message}`)
              if (err.message?.includes('Could not load the default credentials') ||
                  err.message?.includes('GOOGLE_APPLICATION_CREDENTIALS') ||
                  err.code === 'ENOENT') {
                console.error('[Scanner] Hint: Configure GCP credentials via `gcloud auth application-default login` or the GOOGLE_APPLICATION_CREDENTIALS environment variable.')
              }
              return { graph: { nodes: [], edges: [] }, provider: 'gcp' }
            }
          })()
        )

        // Declarative descriptor-based scanners (Cloud SQL, Cloud Functions,
        // Memorystore Redis, Artifact Registry, Cloud Armor, Cloud DNS, GKE,
        // Cloud Spanner, Firestore, Cloud Tasks, Cloud Scheduler)
        scanPromises.push(
          (async () => {
            try {
              const { GCP_SERVICE_DESCRIPTORS } = await import('./gcp-descriptors')
              const { scanAllGCPDescriptors } = await import('./gcp-scan-descriptors')
              const graph = await scanAllGCPDescriptors(
                GCP_SERVICE_DESCRIPTORS,
                providerConfig.config.projectId,
              )
              if (graph.nodes.length > 0) {
                console.log(`[Scanner] GCP (descriptors): ${graph.nodes.length} additional nodes`)
              }
              return { graph, provider: 'gcp:descriptors' }
            } catch (err: any) {
              console.error(`[Scanner] GCP descriptor scan failed: ${err.message}`)
              return { graph: { nodes: [], edges: [] }, provider: 'gcp:descriptors' }
            }
          })()
        )
        break
      }

      default:
        console.warn(`[Scanner] Unknown provider type: ${(providerConfig as any).type}`)
    }
  }

  // Run all scans in parallel
  const results = await Promise.all(scanPromises)

  // Merge graphs
  const allNodes: InfraNode[] = []
  const allEdges: InfraEdge[] = []
  const seenNodeIds = new Set<string>()
  const seenEdgeIds = new Set<string>()

  for (const { graph } of results) {
    for (const node of graph.nodes) {
      if (!seenNodeIds.has(node.id)) {
        allNodes.push(node)
        seenNodeIds.add(node.id)
      }
    }
    for (const edge of graph.edges) {
      if (!seenEdgeIds.has(edge.id)) {
        // Only include edges whose source and target exist
        if (seenNodeIds.has(edge.source) && seenNodeIds.has(edge.target)) {
          allEdges.push(edge)
          seenEdgeIds.add(edge.id)
        }
      }
    }
  }

  // Detect cross-cloud edges
  const crossEdges = detectCrossCloudEdges(allNodes, allEdges)
  // Only include cross-cloud edges whose endpoints exist
  for (const edge of crossEdges) {
    if (seenNodeIds.has(edge.source) && seenNodeIds.has(edge.target)) {
      allEdges.push(edge)
    }
  }

  // Detect cross-profile edges (same provider, different accounts)
  const crossProfileEdges = detectCrossProfileEdges(allNodes, allEdges)
  for (const edge of crossProfileEdges) {
    if (seenNodeIds.has(edge.source) && seenNodeIds.has(edge.target)) {
      allEdges.push(edge)
    }
  }

  const totalCross = crossEdges.length + crossProfileEdges.length
  console.log(`[Scanner] Total: ${allNodes.length} nodes, ${allEdges.length} edges (${totalCross} cross-cloud/cross-account)`)

  return { nodes: allNodes, edges: allEdges }
}
