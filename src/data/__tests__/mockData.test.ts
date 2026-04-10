import { describe, it, expect } from 'vitest'
import { awsNodes, awsEdges } from '../mock-aws'
import { azureNodes, azureEdges } from '../mock-azure'
import { gcpNodes, gcpEdges } from '../mock-gcp'
import { getMultiCloudGraph } from '../index'

describe('mock data integrity', () => {
  const graph = getMultiCloudGraph()
  const allNodes = graph.nodes
  const allEdges = graph.edges
  const nodeIdSet = new Set(allNodes.map((n) => n.id))

  // ------------------------------------------------------------------
  // Provider-level counts
  // ------------------------------------------------------------------

  it('has at least 15 AWS nodes', () => {
    expect(awsNodes.length).toBeGreaterThanOrEqual(15)
  })

  it('has at least 10 Azure nodes', () => {
    expect(azureNodes.length).toBeGreaterThanOrEqual(10)
  })

  it('has at least 11 GCP nodes', () => {
    expect(gcpNodes.length).toBeGreaterThanOrEqual(11)
  })

  // ------------------------------------------------------------------
  // Node field completeness
  // ------------------------------------------------------------------

  it('all nodes have the required fields', () => {
    for (const node of allNodes) {
      expect(node.id, `node.id missing`).toBeTruthy()
      expect(node.label, `node ${node.id}: label missing`).toBeTruthy()
      expect(['aws', 'azure', 'gcp'], `node ${node.id}: invalid provider`).toContain(node.provider)
      expect(node.type, `node ${node.id}: type missing`).toBeTruthy()
      expect(node.category, `node ${node.id}: category missing`).toBeTruthy()
      expect(node.region, `node ${node.id}: region missing`).toBeTruthy()
      expect(node.metadata, `node ${node.id}: metadata missing`).toBeDefined()
      expect(['healthy', 'warning', 'error'], `node ${node.id}: invalid status`).toContain(node.status)
      expect(typeof node.importance, `node ${node.id}: importance must be a number`).toBe('number')
      expect(node.importance, `node ${node.id}: importance must be 1-10`).toBeGreaterThanOrEqual(1)
      expect(node.importance, `node ${node.id}: importance must be 1-10`).toBeLessThanOrEqual(10)
    }
  })

  // ------------------------------------------------------------------
  // Node uniqueness
  // ------------------------------------------------------------------

  it('has no duplicate node IDs', () => {
    const ids = allNodes.map((n) => n.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  // ------------------------------------------------------------------
  // Edge uniqueness
  // ------------------------------------------------------------------

  it('has no duplicate edge IDs', () => {
    const ids = allEdges.map((e) => e.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  // ------------------------------------------------------------------
  // Edge referential integrity
  // ------------------------------------------------------------------

  it('all edge source IDs reference existing nodes', () => {
    for (const edge of allEdges) {
      expect(
        nodeIdSet.has(edge.source),
        `edge ${edge.id}: source "${edge.source}" not found in node set`,
      ).toBe(true)
    }
  })

  it('all edge target IDs reference existing nodes', () => {
    for (const edge of allEdges) {
      expect(
        nodeIdSet.has(edge.target),
        `edge ${edge.id}: target "${edge.target}" not found in node set`,
      ).toBe(true)
    }
  })

  // ------------------------------------------------------------------
  // Edge field completeness
  // ------------------------------------------------------------------

  it('all edges have valid type fields', () => {
    const validTypes = new Set(['network', 'data', 'dependency', 'cross-cloud'])
    for (const edge of allEdges) {
      expect(
        validTypes.has(edge.type),
        `edge ${edge.id}: invalid type "${edge.type}"`,
      ).toBe(true)
    }
  })

  // ------------------------------------------------------------------
  // Cross-cloud edge semantics
  // ------------------------------------------------------------------

  it('cross-cloud edges reference nodes from different providers', () => {
    const nodeProviderMap = new Map(allNodes.map((n) => [n.id, n.provider]))

    const crossCloudEdges = allEdges.filter((e) => e.type === 'cross-cloud')
    expect(crossCloudEdges.length).toBeGreaterThan(0)

    for (const edge of crossCloudEdges) {
      const sourceProvider = nodeProviderMap.get(edge.source)
      const targetProvider = nodeProviderMap.get(edge.target)
      expect(
        sourceProvider,
        `cross-cloud edge ${edge.id}: source provider not found`,
      ).toBeDefined()
      expect(
        targetProvider,
        `cross-cloud edge ${edge.id}: target provider not found`,
      ).toBeDefined()
      expect(
        sourceProvider,
        `cross-cloud edge ${edge.id}: source and target are on the same provider`,
      ).not.toBe(targetProvider)
    }
  })

  // ------------------------------------------------------------------
  // Provider assignment consistency
  // ------------------------------------------------------------------

  it('all AWS nodes in mock-aws.ts have provider === "aws"', () => {
    for (const node of awsNodes) {
      expect(node.provider).toBe('aws')
    }
  })

  it('all Azure nodes in mock-azure.ts have provider === "azure"', () => {
    for (const node of azureNodes) {
      expect(node.provider).toBe('azure')
    }
  })

  it('all GCP nodes in mock-gcp.ts have provider === "gcp"', () => {
    for (const node of gcpNodes) {
      expect(node.provider).toBe('gcp')
    }
  })

  // ------------------------------------------------------------------
  // No self-referencing edges
  // ------------------------------------------------------------------

  it('no edge has the same source and target', () => {
    for (const edge of allEdges) {
      expect(
        edge.source,
        `edge ${edge.id} is a self-loop`,
      ).not.toBe(edge.target)
    }
  })

  // ------------------------------------------------------------------
  // AWS-specific edges use only AWS-sourced or known cross-cloud targets
  // ------------------------------------------------------------------

  it('AWS edges connect to nodes that exist in the full graph', () => {
    for (const edge of awsEdges) {
      expect(nodeIdSet.has(edge.source), `awsEdge ${edge.id}: source ${edge.source} missing`).toBe(true)
      expect(nodeIdSet.has(edge.target), `awsEdge ${edge.id}: target ${edge.target} missing`).toBe(true)
    }
  })

  it('Azure edges connect to nodes that exist in the full graph', () => {
    for (const edge of azureEdges) {
      expect(nodeIdSet.has(edge.source), `azureEdge ${edge.id}: source ${edge.source} missing`).toBe(true)
      expect(nodeIdSet.has(edge.target), `azureEdge ${edge.id}: target ${edge.target} missing`).toBe(true)
    }
  })

  it('GCP edges connect to nodes that exist in the full graph', () => {
    for (const edge of gcpEdges) {
      expect(nodeIdSet.has(edge.source), `gcpEdge ${edge.id}: source ${edge.source} missing`).toBe(true)
      expect(nodeIdSet.has(edge.target), `gcpEdge ${edge.id}: target ${edge.target} missing`).toBe(true)
    }
  })
})
