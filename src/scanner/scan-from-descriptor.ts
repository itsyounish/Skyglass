/**
 * Generic Scanner from Service Descriptor
 *
 * Takes an AWSServiceDescriptor and produces InfraNodes by:
 * 1. Dynamically importing the SDK package
 * 2. Instantiating the client class
 * 3. Sending the list command with pagination
 * 4. Mapping each raw resource through the descriptor's mapResource function
 *
 * This eliminates repetitive scanner boilerplate — each new service only needs
 * a descriptor entry in descriptors.ts.
 */

import type { InfraNode, InfraGraph } from '../types'
import type { AWSServiceDescriptor } from './descriptors'

// ---------------------------------------------------------------------------
// Scan a single descriptor for a given region
// ---------------------------------------------------------------------------

export async function scanFromDescriptor(
  descriptor: AWSServiceDescriptor,
  region: string,
): Promise<InfraNode[]> {
  const nodes: InfraNode[] = []

  try {
    // Dynamic import of the SDK package
    const sdkModule = await import(descriptor.sdkPackage)

    // Instantiate the client
    const ClientClass = sdkModule[descriptor.clientClass]
    if (!ClientClass) {
      console.warn(`[Descriptor Scanner] Client class ${descriptor.clientClass} not found in ${descriptor.sdkPackage}`)
      return nodes
    }
    const client = new ClientClass({ region })

    // Get the command class
    const CommandClass = sdkModule[descriptor.listCommand]
    if (!CommandClass) {
      console.warn(`[Descriptor Scanner] Command class ${descriptor.listCommand} not found in ${descriptor.sdkPackage}`)
      return nodes
    }

    // Paginate through results
    let paginationValue: string | undefined
    let pageCount = 0
    const maxPages = 100 // Safety limit

    do {
      pageCount++
      if (pageCount > maxPages) {
        console.warn(`[Descriptor Scanner] ${descriptor.type}: Hit max pagination limit (${maxPages} pages)`)
        break
      }

      // Build the command input with pagination token
      const input: Record<string, any> = {}
      if (paginationValue && descriptor.paginationToken) {
        const inputTokenKey = descriptor.paginationInputToken || descriptor.paginationToken
        input[inputTokenKey] = paginationValue
      }

      const response = await client.send(new CommandClass(input))

      // Extract the resource array from the response using the dot-separated path
      const resources = getNestedValue(response, descriptor.listResponsePath)
      if (!Array.isArray(resources) || resources.length === 0) break

      // Map each resource to an InfraNode
      for (const resource of resources) {
        try {
          const partialNode = descriptor.mapResource(resource, region)
          // mapResource may return null to indicate the resource should be filtered out
          // (e.g. IAM service-linked roles)
          if (!partialNode) continue
          nodes.push({
            ...partialNode,
            provider: 'aws',
          } as InfraNode)
        } catch (mapErr: any) {
          console.warn(`[Descriptor Scanner] ${descriptor.type}: Failed to map resource: ${mapErr.message}`)
        }
      }

      // Get the next pagination token from the response
      if (descriptor.paginationToken) {
        paginationValue = response[descriptor.paginationToken]
        // Some services (DynamoDB ListTables) use a different field name
        if (!paginationValue && descriptor.paginationToken !== descriptor.paginationInputToken) {
          paginationValue = undefined
        }
      } else {
        paginationValue = undefined
      }
    } while (paginationValue)

  } catch (err: any) {
    // Graceful degradation: if an SDK package isn't installed, just skip
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('Cannot find module') || err.message?.includes('Cannot find package')) {
      console.warn(`[Descriptor Scanner] ${descriptor.type}: SDK package ${descriptor.sdkPackage} not installed (skipping)`)
    } else if (err.name === 'CredentialsProviderError' || err.message?.includes('Could not load credentials')) {
      console.warn(`[Descriptor Scanner] ${descriptor.type}: No AWS credentials available (skipping)`)
    } else {
      console.warn(`[Descriptor Scanner] ${descriptor.type}: Scan failed: ${err.message}`)
    }
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Scan all descriptors for a region and return a merged graph
// ---------------------------------------------------------------------------

export async function scanAllDescriptors(
  descriptors: AWSServiceDescriptor[],
  region: string,
): Promise<InfraGraph> {
  const allNodes: InfraNode[] = []

  // Run all descriptor scans in parallel
  const results = await Promise.allSettled(
    descriptors.map(async (desc) => {
      const nodes = await scanFromDescriptor(desc, region)
      if (nodes.length > 0) {
        console.log(`[Descriptor Scanner] ${desc.type}: ${nodes.length} resources in ${region}`)
      }
      return nodes
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allNodes.push(...result.value)
    }
    // Rejected promises are already logged in scanFromDescriptor
  }

  return {
    nodes: allNodes,
    edges: [], // Edges are detected later in the orchestrator
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get a nested value from an object using a dot-separated path.
 * e.g. getNestedValue(obj, 'DistributionList.Items') -> obj.DistributionList.Items
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}
