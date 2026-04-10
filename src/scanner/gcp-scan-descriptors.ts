/**
 * Generic Scanner for GCP Service Descriptors
 *
 * Takes a GCPServiceDescriptor and produces InfraNodes by:
 * 1. Dynamically importing the SDK package
 * 2. Instantiating the client class
 * 3. Calling the list method
 * 4. Mapping each raw resource through the descriptor's mapResource function
 *
 * GCP SDK patterns differ from AWS SDK v3:
 * - Clients are instantiated with { projectId } instead of { region }
 * - Most list methods return [array] or use async iteration
 * - Some services (Spanner, Firestore, DNS) have non-standard client patterns
 * - Error handling must account for missing optional packages
 */

import type { InfraNode, InfraGraph } from '../types'
import type { GCPServiceDescriptor } from './gcp-descriptors'

// ---------------------------------------------------------------------------
// Scan a single descriptor for a given project
// ---------------------------------------------------------------------------

export async function scanGCPFromDescriptor(
  descriptor: GCPServiceDescriptor,
  projectId: string,
): Promise<InfraNode[]> {
  const nodes: InfraNode[] = []

  try {
    // Dynamic import of the SDK package
    const sdkModule = await import(descriptor.sdkPackage)

    // Instantiate the client -- GCP SDK patterns vary per service
    const ClientClass = sdkModule[descriptor.clientClass]
    if (!ClientClass) {
      console.warn(`[GCP Descriptor Scanner] Client class ${descriptor.clientClass} not found in ${descriptor.sdkPackage}`)
      return nodes
    }

    const client = new ClientClass({ projectId })

    // Resolve the list method
    const listMethod = client[descriptor.listMethod]
    if (typeof listMethod !== 'function') {
      console.warn(`[GCP Descriptor Scanner] Method ${descriptor.listMethod} not found on ${descriptor.clientClass}`)
      return nodes
    }

    // Build the request -- varies by service type
    const resources = await callListMethod(descriptor, client, projectId)

    // Map each resource to an InfraNode
    for (const resource of resources) {
      try {
        const partialNode = descriptor.mapResource(resource, projectId)
        nodes.push({
          ...partialNode,
          provider: 'gcp',
        } as InfraNode)
      } catch (mapErr: any) {
        console.warn(`[GCP Descriptor Scanner] ${descriptor.type}: Failed to map resource: ${mapErr.message}`)
      }
    }
  } catch (err: any) {
    // Graceful degradation: if an SDK package isn't installed, just skip
    if (
      err.code === 'ERR_MODULE_NOT_FOUND' ||
      err.message?.includes('Cannot find module') ||
      err.message?.includes('Cannot find package')
    ) {
      console.warn(`[GCP Descriptor Scanner] ${descriptor.type}: SDK package ${descriptor.sdkPackage} not installed (skipping)`)
    } else if (
      err.message?.includes('Could not load the default credentials') ||
      err.message?.includes('GOOGLE_APPLICATION_CREDENTIALS')
    ) {
      console.warn(`[GCP Descriptor Scanner] ${descriptor.type}: No GCP credentials available (skipping)`)
    } else {
      console.warn(`[GCP Descriptor Scanner] ${descriptor.type}: Scan failed: ${err.message}`)
    }
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Call the list method with the appropriate request shape per service
// ---------------------------------------------------------------------------

async function callListMethod(
  descriptor: GCPServiceDescriptor,
  client: any,
  projectId: string,
): Promise<any[]> {
  const resources: any[] = []

  switch (descriptor.type) {
    // Cloud Armor uses the Compute SDK pattern: list({ project })
    case 'cloud-armor': {
      const [items] = await client.list({ project: projectId })
      if (Array.isArray(items)) {
        resources.push(...items)
      }
      break
    }

    // GKE listClusters requires { parent: "projects/{project}/locations/-" }
    case 'gke': {
      const [response] = await client.listClusters({
        parent: `projects/${projectId}/locations/-`,
      })
      const clusters = response?.clusters ?? response ?? []
      if (Array.isArray(clusters)) {
        resources.push(...clusters)
      }
      break
    }

    // Cloud SQL uses { project } parameter
    case 'cloud-sql': {
      const [response] = await client.list({ project: projectId })
      const items = response?.items ?? response ?? []
      if (Array.isArray(items)) {
        resources.push(...items)
      }
      break
    }

    // Cloud DNS uses the high-level getZones() method
    case 'cloud-dns': {
      const [zones] = await client.getZones()
      if (Array.isArray(zones)) {
        resources.push(...zones)
      }
      break
    }

    // Spanner uses getInstances() on a high-level client
    case 'cloud-spanner': {
      const [instances] = await client.getInstances()
      if (Array.isArray(instances)) {
        resources.push(...instances)
      }
      break
    }

    // Firestore listCollections returns root collections
    case 'firestore': {
      const collections = await client.listCollections()
      if (Array.isArray(collections)) {
        resources.push(...collections)
      }
      break
    }

    // Standard gRPC pattern: listXxx({ parent: "projects/{project}/locations/-" })
    // Used by: Cloud Functions, Memorystore Redis, Artifact Registry, Cloud Tasks,
    // Cloud Scheduler
    default: {
      const parent = `projects/${projectId}/locations/-`
      const request = { parent }

      // Many GCP gRPC clients return async iterables for list methods
      const result = client[descriptor.listMethod](request)

      if (result && typeof result[Symbol.asyncIterator] === 'function') {
        // Async iterable (auto-paginated)
        for await (const item of result) {
          resources.push(item)
        }
      } else if (result && typeof result.then === 'function') {
        // Promise-based: [resources] or [resources, nextPageToken, fullResponse]
        const response = await result
        if (Array.isArray(response)) {
          // Typical gRPC pattern: [array, ...]
          const items = response[0]
          if (Array.isArray(items)) {
            resources.push(...items)
          } else if (items && typeof items === 'object') {
            // Single response object with nested items
            resources.push(items)
          }
        }
      } else if (Array.isArray(result)) {
        resources.push(...result)
      }
      break
    }
  }

  return resources
}

// ---------------------------------------------------------------------------
// Scan all GCP descriptors for a project and return a merged graph
// ---------------------------------------------------------------------------

export async function scanAllGCPDescriptors(
  descriptors: GCPServiceDescriptor[],
  projectId: string,
): Promise<InfraGraph> {
  const allNodes: InfraNode[] = []

  // Run all descriptor scans in parallel
  const results = await Promise.allSettled(
    descriptors.map(async (desc) => {
      const nodes = await scanGCPFromDescriptor(desc, projectId)
      if (nodes.length > 0) {
        console.log(`[GCP Descriptor Scanner] ${desc.type}: ${nodes.length} resources in project ${projectId}`)
      }
      return nodes
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allNodes.push(...result.value)
    }
    // Rejected promises are already logged in scanGCPFromDescriptor
  }

  return {
    nodes: allNodes,
    edges: [], // Edges are detected later in the orchestrator
  }
}
