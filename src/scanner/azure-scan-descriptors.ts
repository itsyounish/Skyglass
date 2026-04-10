/**
 * Generic Scanner from Azure Service Descriptor
 *
 * Takes an AzureServiceDescriptor and produces InfraNodes by:
 * 1. Dynamically importing the SDK package
 * 2. Instantiating the client with DefaultAzureCredential + subscriptionId
 * 3. Iterating the async-iterable list method
 * 4. Mapping each raw resource through the descriptor's mapResource function
 *
 * This is the Azure equivalent of scan-from-descriptor.ts (AWS).
 * Azure ARM SDKs follow a consistent pattern:
 *   new Client(credential, subscriptionId) -> client.resource.list() -> async iterable
 */

import type { InfraNode, InfraGraph } from '../types'
import type { AzureServiceDescriptor } from './azure-descriptors'

// ---------------------------------------------------------------------------
// Scan a single descriptor for a given subscription
// ---------------------------------------------------------------------------

export async function scanAzureFromDescriptor(
  descriptor: AzureServiceDescriptor,
  subscriptionId: string,
  credential: any,
): Promise<InfraNode[]> {
  const nodes: InfraNode[] = []

  try {
    // Dynamic import of the SDK package
    const sdkModule = await import(descriptor.sdkPackage)

    // Instantiate the client with credential + subscriptionId
    const ClientClass = sdkModule[descriptor.clientClass]
    if (!ClientClass) {
      console.warn(`[Azure Descriptor Scanner] Client class ${descriptor.clientClass} not found in ${descriptor.sdkPackage}`)
      return nodes
    }
    const client = new ClientClass(credential, subscriptionId)

    // Navigate to the list method using the dot-separated path
    // e.g. 'servers.list' -> client.servers.list()
    const methodParts = descriptor.listMethod.split('.')
    let target: any = client
    for (let i = 0; i < methodParts.length - 1; i++) {
      target = target[methodParts[i]]
      if (!target) {
        console.warn(`[Azure Descriptor Scanner] ${descriptor.type}: Property '${methodParts[i]}' not found on client`)
        return nodes
      }
    }

    const methodName = methodParts[methodParts.length - 1]
    const listFn = target[methodName]
    if (typeof listFn !== 'function') {
      console.warn(`[Azure Descriptor Scanner] ${descriptor.type}: Method '${methodName}' not found`)
      return nodes
    }

    // Call the list method — Azure ARM SDKs return async iterables
    const iterable = listFn.call(target)

    // Safety limit to avoid infinite loops
    const maxResources = 5000
    let count = 0

    for await (const resource of iterable) {
      count++
      if (count > maxResources) {
        console.warn(`[Azure Descriptor Scanner] ${descriptor.type}: Hit max resource limit (${maxResources})`)
        break
      }

      try {
        const partialNode = descriptor.mapResource(resource, subscriptionId)
        nodes.push({
          ...partialNode,
          provider: 'azure',
        } as InfraNode)
      } catch (mapErr: any) {
        console.warn(`[Azure Descriptor Scanner] ${descriptor.type}: Failed to map resource: ${mapErr.message}`)
      }
    }

  } catch (err: any) {
    // Graceful degradation: if an SDK package isn't installed, just skip
    if (
      err.code === 'ERR_MODULE_NOT_FOUND' ||
      err.message?.includes('Cannot find module') ||
      err.message?.includes('Cannot find package')
    ) {
      console.warn(`[Azure Descriptor Scanner] ${descriptor.type}: SDK package ${descriptor.sdkPackage} not installed (skipping)`)
    } else if (
      err.name === 'CredentialUnavailableError' ||
      err.message?.includes('DefaultAzureCredential') ||
      err.message?.includes('CredentialUnavailableError')
    ) {
      console.warn(`[Azure Descriptor Scanner] ${descriptor.type}: No Azure credentials available (skipping)`)
    } else if (
      err.statusCode === 403 ||
      err.code === 'AuthorizationFailed'
    ) {
      console.warn(`[Azure Descriptor Scanner] ${descriptor.type}: Authorization failed (skipping) — ensure the identity has Reader role`)
    } else {
      console.warn(`[Azure Descriptor Scanner] ${descriptor.type}: Scan failed: ${err.message}`)
    }
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Scan all descriptors for a subscription and return a merged graph
// ---------------------------------------------------------------------------

export async function scanAllAzureDescriptors(
  descriptors: AzureServiceDescriptor[],
  subscriptionId: string,
): Promise<InfraGraph> {
  const allNodes: InfraNode[] = []

  // Obtain the credential once and share across all descriptors
  let credential: any
  try {
    const { DefaultAzureCredential } = await import('@azure/identity')
    credential = new DefaultAzureCredential()
  } catch (err: any) {
    console.warn(`[Azure Descriptor Scanner] @azure/identity not available: ${err.message}`)
    return { nodes: [], edges: [] }
  }

  // Group descriptors by SDK package to share client instances
  // (e.g. arm-network is used for both applicationGateways and loadBalancers)
  const byPackage: Record<string, AzureServiceDescriptor[]> = {}
  for (const desc of descriptors) {
    const key = `${desc.sdkPackage}::${desc.clientClass}`
    if (!byPackage[key]) byPackage[key] = []
    byPackage[key].push(desc)
  }

  // Run all descriptor scans in parallel
  const results = await Promise.allSettled(
    descriptors.map(async (desc) => {
      const nodes = await scanAzureFromDescriptor(desc, subscriptionId, credential)
      if (nodes.length > 0) {
        console.log(`[Azure Descriptor Scanner] ${desc.type}: ${nodes.length} resources`)
      }
      return nodes
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allNodes.push(...result.value)
    }
    // Rejected promises are already logged in scanAzureFromDescriptor
  }

  return {
    nodes: allNodes,
    edges: [], // Edges are detected later in the orchestrator
  }
}
