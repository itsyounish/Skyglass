/**
 * GCP Infrastructure Scanner
 *
 * Scans real Google Cloud resources and maps them to InfraNode/InfraEdge.
 * Uses Application Default Credentials (ADC).
 * Run `gcloud auth application-default login` or set GOOGLE_APPLICATION_CREDENTIALS.
 */

import type { InfraNode, InfraEdge, InfraGraph, HealthStatus } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gcpStatusHealth(status: string | undefined): HealthStatus {
  if (!status) return 'warning'
  const s = status.toUpperCase()
  if (s === 'RUNNING' || s === 'READY' || s === 'ACTIVE' || s === 'UP_TO_DATE') return 'healthy'
  if (s === 'STAGING' || s === 'PROVISIONING' || s === 'REPAIRING' || s === 'PENDING') return 'warning'
  return 'error'
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

export async function scanGCP(projectId: string): Promise<InfraGraph> {
  const nodes: InfraNode[] = []
  const edges: InfraEdge[] = []

  // Tracking maps for edge detection
  const vpcNameToNodeId: Record<string, string> = {}
  const subnetNameToNodeId: Record<string, string> = {}
  const instanceNodeIds: string[] = []
  const instanceNetworks: Record<string, string[]> = {} // nodeId -> [network names]
  const cloudRunNodeIds: string[] = []
  const bucketNameToNodeId: Record<string, string> = {}
  const pubsubTopicToNodeId: Record<string, string> = {}
  const pubsubSubscriptions: Array<{ nodeId: string; topicNodeId: string; pushEndpoint?: string }> = []
  const bigqueryNodeIds: string[] = []

  // -----------------------------------------------------------------------
  // 1. VPCs (Networks) and Subnets
  // -----------------------------------------------------------------------
  try {
    const computeModule = await import('@google-cloud/compute')
    // The compute SDK exports NetworksClient and SubnetworksClient
    const networksClient = new computeModule.NetworksClient()
    const subnetworksClient = new computeModule.SubnetworksClient()

    // List networks
    const [networks] = await networksClient.list({ project: projectId })
    for (const network of networks ?? []) {
      const networkName = network.name ?? 'unknown'
      const nodeId = `gcp-vpc-${networkName}`
      const selfLink = network.selfLink ?? ''

      vpcNameToNodeId[networkName] = nodeId
      // Also map by selfLink for matching
      vpcNameToNodeId[selfLink] = nodeId

      nodes.push({
        id: nodeId,
        label: `VPC: ${networkName}`,
        provider: 'gcp',
        type: 'vpc',
        category: 'network',
        region: 'global',
        metadata: {
          selfLink,
          name: networkName,
          autoCreateSubnetworks: String(network.autoCreateSubnetworks ?? false),
          routingMode: network.routingConfig?.routingMode ?? '',
          mtu: String(network.mtu ?? 1460),
          description: network.description ?? '',
        },
        status: 'healthy',
        importance: 7,
      })
    }

    // List subnets across all regions
    const [subnets] = await subnetworksClient.aggregatedList({ project: projectId })
    // aggregatedList returns a map of region -> SubnetworksScopedList
    if (subnets && typeof subnets[Symbol.iterator] === 'function') {
      for (const [regionScope, scopedList] of subnets as any) {
        const subnetworks = scopedList?.subnetworks ?? []
        for (const subnet of subnetworks) {
          const subnetName = subnet.name ?? 'unknown'
          const subnetRegion = subnet.region?.split('/').pop() ?? regionScope.replace('regions/', '')
          const subnetNodeId = `gcp-subnet-${subnetName}`

          subnetNameToNodeId[subnetName] = subnetNodeId

          // Find parent VPC
          const networkLink = subnet.network ?? ''
          const networkName = networkLink.split('/').pop() ?? ''
          const parent = vpcNameToNodeId[networkName] || vpcNameToNodeId[networkLink]

          nodes.push({
            id: subnetNodeId,
            label: subnetName,
            provider: 'gcp',
            type: 'subnet',
            category: 'network',
            region: subnetRegion,
            parent,
            metadata: {
              selfLink: subnet.selfLink ?? '',
              ipCidrRange: subnet.ipCidrRange ?? '',
              gatewayAddress: subnet.gatewayAddress ?? '',
              privateIpGoogleAccess: String(subnet.privateIpGoogleAccess ?? false),
              purpose: subnet.purpose ?? 'PRIVATE',
              stackType: subnet.stackType ?? '',
            },
            status: 'healthy',
            importance: 4,
          })
        }
      }
    }
  } catch (err: any) {
    console.warn(`[GCP Scanner] VPC/Subnet scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 2. Compute Engine Instances
  // -----------------------------------------------------------------------
  try {
    const computeModule = await import('@google-cloud/compute')
    const instancesClient = new computeModule.InstancesClient()

    const [instances] = await instancesClient.aggregatedList({ project: projectId })
    if (instances && typeof instances[Symbol.iterator] === 'function') {
      for (const [zone, scopedList] of instances as any) {
        const instanceList = scopedList?.instances ?? []
        for (const instance of instanceList) {
          const instanceName = instance.name ?? 'unknown'
          const zoneName = zone.replace('zones/', '')
          const regionName = zoneName.replace(/-[a-z]$/, '')
          const nodeId = `gcp-instance-${instanceName}`

          instanceNodeIds.push(nodeId)

          // Track network interfaces for edge detection
          const networkNames: string[] = []
          let parent: string | undefined
          for (const iface of instance.networkInterfaces ?? []) {
            const netName = iface.network?.split('/').pop() ?? ''
            networkNames.push(netName)
            const subnetName = iface.subnetwork?.split('/').pop() ?? ''
            if (subnetName && subnetNameToNodeId[subnetName]) {
              parent = subnetNameToNodeId[subnetName]
            } else if (netName && vpcNameToNodeId[netName]) {
              parent = vpcNameToNodeId[netName]
            }
          }
          instanceNetworks[nodeId] = networkNames

          const machineType = instance.machineType?.split('/').pop() ?? ''
          const status = instance.status ?? ''

          nodes.push({
            id: nodeId,
            label: instanceName,
            provider: 'gcp',
            type: 'gce',
            category: 'compute',
            region: regionName,
            parent,
            metadata: {
              selfLink: instance.selfLink ?? '',
              resourcePath: `projects/${projectId}/zones/${zoneName}/instances/${instanceName}`,
              machineType,
              status,
              zone: zoneName,
              cpuPlatform: instance.cpuPlatform ?? '',
              canIpForward: String(instance.canIpForward ?? false),
              deletionProtection: String(instance.deletionProtection ?? false),
              creationTimestamp: instance.creationTimestamp ?? '',
              externalIp: instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? '',
              internalIp: instance.networkInterfaces?.[0]?.networkIP ?? '',
            },
            status: gcpStatusHealth(status),
            importance: 7,
          })
        }
      }
    }
  } catch (err: any) {
    console.warn(`[GCP Scanner] Compute Engine scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 3. Cloud Run Services
  // -----------------------------------------------------------------------
  try {
    // Cloud Run Admin API v2
    const { ServicesClient } = await import('@google-cloud/run')
    const runClient = new ServicesClient()

    const [services] = await runClient.listServices({
      parent: `projects/${projectId}/locations/-`,
    })

    for (const service of services ?? []) {
      const serviceName = service.name?.split('/').pop() ?? 'unknown'
      const location = service.name?.split('/')[3] ?? 'unknown'
      const nodeId = `gcp-run-${serviceName}`

      cloudRunNodeIds.push(nodeId)

      // Find parent VPC connector if configured
      const template = service.template
      const vpcConnector = template?.vpcAccess?.connector ?? ''
      let parent: string | undefined
      if (vpcConnector) {
        const vpcName = vpcConnector.split('/').pop() ?? ''
        parent = vpcNameToNodeId[vpcName]
      }

      const container = template?.containers?.[0]
      // Names only — never capture env var VALUES (they may contain secrets).
      const envVarNames = (container?.env ?? []).map((e: any) => e.name ?? '').filter(Boolean).join(', ')

      nodes.push({
        id: nodeId,
        label: `Run: ${serviceName}`,
        provider: 'gcp',
        type: 'cloud-run',
        category: 'container',
        region: location,
        parent,
        metadata: {
          resourcePath: service.name ?? '',
          uri: service.uri ?? '',
          image: container?.image ?? '',
          cpu: container?.resources?.limits?.cpu ?? '',
          memory: container?.resources?.limits?.memory ?? '',
          maxInstances: String(template?.scaling?.maxInstanceCount ?? 'auto'),
          concurrency: String(template?.maxInstanceRequestConcurrency ?? 80),
          ingress: service.ingress ?? '',
          launchStage: service.launchStage ?? '',
          lastModifier: service.lastModifier ?? '',
          createTime: service.createTime?.toISOString?.() ?? '',
          envVarNames,
        },
        status: gcpStatusHealth(service.reconciling ? 'PENDING' : 'READY'),
        importance: 6,
      })

      // Check env vars for references to other services
      for (const envVar of container?.env ?? []) {
        const val = envVar.value ?? ''
        // Detect Pub/Sub topic references
        if (val.includes('projects/') && val.includes('/topics/')) {
          const topicName = val.split('/topics/').pop() ?? ''
          if (topicName) {
            // Will resolve edge after Pub/Sub scan
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[GCP Scanner] Cloud Run scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 4. BigQuery Datasets
  // -----------------------------------------------------------------------
  try {
    const { BigQuery } = await import('@google-cloud/bigquery')
    const bq = new BigQuery({ projectId })

    const [datasets] = await bq.getDatasets()
    for (const dataset of datasets ?? []) {
      const datasetId = dataset.id ?? 'unknown'
      const nodeId = `gcp-bq-${datasetId}`
      bigqueryNodeIds.push(nodeId)

      let tableCount = 0
      let location = 'US'
      try {
        const [metadata] = await dataset.getMetadata()
        location = metadata.location ?? 'US'
        const [tables] = await dataset.getTables()
        tableCount = tables?.length ?? 0
      } catch {
        // metadata or tables may fail due to permissions
      }

      nodes.push({
        id: nodeId,
        label: `BQ: ${datasetId}`,
        provider: 'gcp',
        type: 'bigquery',
        category: 'analytics',
        region: location.toLowerCase(),
        metadata: {
          projectId,
          datasetId,
          tables: String(tableCount),
          location,
          resourcePath: `projects/${projectId}/datasets/${datasetId}`,
        },
        status: 'healthy',
        importance: 8,
      })
    }
  } catch (err: any) {
    console.warn(`[GCP Scanner] BigQuery scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 5. Cloud Storage Buckets
  // -----------------------------------------------------------------------
  try {
    const { Storage } = await import('@google-cloud/storage')
    const storage = new Storage({ projectId })

    const [buckets] = await storage.getBuckets()
    for (const bucket of buckets ?? []) {
      const bucketName = bucket.name ?? 'unknown'
      const nodeId = `gcp-gcs-${bucketName}`
      bucketNameToNodeId[bucketName] = nodeId

      let location = 'us'
      let storageClass = 'STANDARD'
      try {
        const [metadata] = await bucket.getMetadata()
        location = metadata.location ?? 'us'
        storageClass = metadata.storageClass ?? 'STANDARD'
      } catch {
        // metadata may fail
      }

      nodes.push({
        id: nodeId,
        label: bucketName,
        provider: 'gcp',
        type: 'gcs',
        category: 'storage',
        region: location.toLowerCase(),
        metadata: {
          bucketName,
          storageClass,
          location,
          resourcePath: `projects/${projectId}/buckets/${bucketName}`,
          selfLink: `https://storage.googleapis.com/${bucketName}`,
        },
        status: 'healthy',
        importance: 6,
      })
    }
  } catch (err: any) {
    console.warn(`[GCP Scanner] Cloud Storage scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // 6. Pub/Sub Topics & Subscriptions
  // -----------------------------------------------------------------------
  try {
    const { PubSub } = await import('@google-cloud/pubsub')
    const pubsub = new PubSub({ projectId })

    // Topics
    const [topics] = await pubsub.getTopics()
    for (const topic of topics ?? []) {
      const topicName = topic.name?.split('/').pop() ?? 'unknown'
      const nodeId = `gcp-pubsub-topic-${topicName}`
      pubsubTopicToNodeId[topicName] = nodeId
      // Also map by full resource path
      pubsubTopicToNodeId[topic.name ?? ''] = nodeId

      nodes.push({
        id: nodeId,
        label: `Topic: ${topicName}`,
        provider: 'gcp',
        type: 'pubsub-topic',
        category: 'messaging',
        region: 'global',
        metadata: {
          resourcePath: topic.name ?? '',
          projectId,
          topicName,
        },
        status: 'healthy',
        importance: 7,
      })
    }

    // Subscriptions
    const [subscriptions] = await pubsub.getSubscriptions()
    for (const sub of subscriptions ?? []) {
      const subName = sub.name?.split('/').pop() ?? 'unknown'
      const nodeId = `gcp-pubsub-sub-${subName}`

      // Get topic for this subscription
      let topicNodeId: string | undefined
      let pushEndpoint: string | undefined
      try {
        const [metadata] = await sub.getMetadata()
        const topicPath = metadata.topic ?? ''
        const topicName = topicPath.split('/').pop() ?? ''
        topicNodeId = pubsubTopicToNodeId[topicName] || pubsubTopicToNodeId[topicPath]
        pushEndpoint = metadata.pushConfig?.pushEndpoint ?? undefined
      } catch {
        // metadata may fail
      }

      if (topicNodeId) {
        pubsubSubscriptions.push({ nodeId, topicNodeId, pushEndpoint })
      }

      nodes.push({
        id: nodeId,
        label: `Sub: ${subName}`,
        provider: 'gcp',
        type: 'pubsub-subscription',
        category: 'messaging',
        region: 'global',
        metadata: {
          resourcePath: sub.name ?? '',
          projectId,
          subscriptionName: subName,
        },
        status: 'healthy',
        importance: 5,
      })
    }
  } catch (err: any) {
    console.warn(`[GCP Scanner] Pub/Sub scan failed: ${err.message}`)
  }

  // -----------------------------------------------------------------------
  // Edge detection
  // -----------------------------------------------------------------------

  // Topic -> Subscription edges
  for (const sub of pubsubSubscriptions) {
    edges.push({
      id: `edge-${sub.topicNodeId}-${sub.nodeId}`,
      source: sub.topicNodeId,
      target: sub.nodeId,
      type: 'data',
      label: 'subscription',
    })

    // If push subscription targets a Cloud Run URL, add edge
    if (sub.pushEndpoint) {
      for (const runNodeId of cloudRunNodeIds) {
        const runNode = nodes.find(n => n.id === runNodeId)
        if (runNode && sub.pushEndpoint.includes(runNode.metadata.uri || '---never---')) {
          edges.push({
            id: `edge-${sub.nodeId}-${runNodeId}`,
            source: sub.nodeId,
            target: runNodeId,
            type: 'data',
            label: 'push delivery',
          })
        }
      }
    }
  }

  // Cloud Run -> BigQuery (common data pipeline pattern)
  // Heuristic: services in the same project are likely connected in data pipelines
  for (const runNodeId of cloudRunNodeIds) {
    for (const bqNodeId of bigqueryNodeIds) {
      const runNode = nodes.find(n => n.id === runNodeId)
      if (runNode) {
        // Check if the Cloud Run service env vars reference BigQuery
        const envs = runNode.metadata.envVarNames ?? ''
        if (envs.toLowerCase().includes('bigquery') || envs.toLowerCase().includes('dataset')) {
          edges.push({
            id: `edge-${runNodeId}-${bqNodeId}`,
            source: runNodeId,
            target: bqNodeId,
            type: 'data',
            label: 'BigQuery write',
          })
        }
      }
    }
  }

  // Instances in the same VPC network get network edges
  const instancesByNetwork: Record<string, string[]> = {}
  for (const [nodeId, networks] of Object.entries(instanceNetworks)) {
    for (const net of networks) {
      if (!instancesByNetwork[net]) instancesByNetwork[net] = []
      instancesByNetwork[net].push(nodeId)
    }
  }
  for (const [, instances] of Object.entries(instancesByNetwork)) {
    for (let i = 0; i < instances.length; i++) {
      for (let j = i + 1; j < instances.length; j++) {
        edges.push({
          id: `edge-${instances[i]}-${instances[j]}`,
          source: instances[i],
          target: instances[j],
          type: 'network',
          label: 'same VPC',
        })
      }
    }
  }

  return { nodes, edges }
}
