import { describe, it, expect } from 'vitest'
import { filterGraph, applyFilter } from '../filter'
import type { InfraGraph, InfraNode, InfraEdge } from '../../types'

// ---------------------------------------------------------------------------
// Shared fixture graph
// ---------------------------------------------------------------------------

const nodes: InfraNode[] = [
  { id: 'aws-1', label: 'api-server', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', metadata: { env: 'production' }, status: 'healthy', importance: 8 },
  { id: 'aws-2', label: 'postgres-prod', provider: 'aws', type: 'rds', category: 'database', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 10 },
  { id: 'aws-3', label: 'broken-lambda', provider: 'aws', type: 'lambda', category: 'serverless', region: 'us-west-2', metadata: {}, status: 'error', importance: 4 },
  { id: 'az-1', label: 'aks-cluster', provider: 'azure', type: 'aks', category: 'container', region: 'westeurope', metadata: { team: 'platform' }, status: 'healthy', importance: 9 },
  { id: 'az-2', label: 'cosmos-sessions', provider: 'azure', type: 'cosmosdb', category: 'database', region: 'westeurope', metadata: {}, status: 'warning', importance: 7 },
  { id: 'gcp-1', label: 'ingestion-api', provider: 'gcp', type: 'cloud-run', category: 'container', region: 'us-central1', metadata: {}, status: 'healthy', importance: 7 },
  { id: 'gcp-2', label: 'bq-warehouse', provider: 'gcp', type: 'bigquery', category: 'analytics', region: 'us-central1', metadata: {}, status: 'healthy', importance: 10 },
]

const edges: InfraEdge[] = [
  { id: 'e1', source: 'aws-1', target: 'aws-2', type: 'data' },
  { id: 'e2', source: 'az-1', target: 'az-2', type: 'data' },
  { id: 'e3', source: 'aws-1', target: 'az-1', type: 'cross-cloud' },
  { id: 'e4', source: 'gcp-1', target: 'gcp-2', type: 'data' },
]

const graph: InfraGraph = { nodes, edges }

// ---------------------------------------------------------------------------
// filterGraph (v1 API)
// ---------------------------------------------------------------------------

describe('filterGraph (v1 API)', () => {
  it('returns all nodes and edges when criteria is empty', () => {
    const result = filterGraph(graph, {})
    expect(result.nodes).toHaveLength(nodes.length)
    expect(result.edges).toHaveLength(edges.length)
  })

  it('filters by provider — only AWS nodes returned', () => {
    const result = filterGraph(graph, { provider: 'aws' })
    expect(result.nodes).toHaveLength(3)
    result.nodes.forEach((n) => expect(n.provider).toBe('aws'))
  })

  it('filters by provider — only Azure nodes returned', () => {
    const result = filterGraph(graph, { provider: 'azure' })
    expect(result.nodes).toHaveLength(2)
    result.nodes.forEach((n) => expect(n.provider).toBe('azure'))
  })

  it('filters by category — only database nodes returned', () => {
    const result = filterGraph(graph, { category: 'database' })
    expect(result.nodes).toHaveLength(2)
    result.nodes.forEach((n) => expect(n.category).toBe('database'))
  })

  it('filters by status — only error nodes returned', () => {
    const result = filterGraph(graph, { status: 'error' })
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('aws-3')
  })

  it('filters by status — healthy nodes only', () => {
    const result = filterGraph(graph, { status: 'healthy' })
    result.nodes.forEach((n) => expect(n.status).toBe('healthy'))
  })

  it('text search matches on label', () => {
    const result = filterGraph(graph, { search: 'api' })
    const ids = result.nodes.map((n) => n.id)
    expect(ids).toContain('aws-1')   // "api-server"
    expect(ids).toContain('gcp-1')   // "ingestion-api"
  })

  it('text search is case-insensitive', () => {
    const lower = filterGraph(graph, { search: 'postgres' })
    const upper = filterGraph(graph, { search: 'POSTGRES' })
    expect(lower.nodes).toHaveLength(upper.nodes.length)
    expect(lower.nodes[0].id).toBe(upper.nodes[0].id)
  })

  it('text search matches on type', () => {
    const result = filterGraph(graph, { search: 'rds' })
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].type).toBe('rds')
  })

  it('text search matches on region', () => {
    const result = filterGraph(graph, { search: 'westeurope' })
    result.nodes.forEach((n) => expect(n.region).toBe('westeurope'))
  })

  it('empty search string returns full graph', () => {
    const result = filterGraph(graph, { search: '   ' })
    expect(result.nodes).toHaveLength(nodes.length)
  })

  it('multiple criteria are ANDed — AWS + database', () => {
    const result = filterGraph(graph, { provider: 'aws', category: 'database' })
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('aws-2')
  })

  it('edges whose endpoints are removed by filtering are also removed', () => {
    // Keep only AWS nodes — cross-cloud edge e3 (aws-1 → az-1) must disappear
    const result = filterGraph(graph, { provider: 'aws' })
    const edgeIds = result.edges.map((e) => e.id)
    expect(edgeIds).toContain('e1')   // both endpoints are AWS
    expect(edgeIds).not.toContain('e3') // az-1 filtered out
  })

  it('returns zero nodes when no nodes match', () => {
    const result = filterGraph(graph, { provider: 'gcp', category: 'database' })
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// applyFilter (v2 FilterSpec API, works on v1 InfraGraph)
// ---------------------------------------------------------------------------

describe('applyFilter (v2 FilterSpec API)', () => {
  it('empty spec returns the full graph unchanged', () => {
    const result = applyFilter(graph, {})
    expect(result.nodes).toHaveLength(nodes.length)
    expect(result.edges).toHaveLength(edges.length)
  })

  it('filters by providers array', () => {
    const result = applyFilter(graph, { providers: ['aws', 'azure'] })
    result.nodes.forEach((n) => expect(['aws', 'azure']).toContain(n.provider))
    expect(result.nodes.some((n) => n.provider === 'gcp')).toBe(false)
  })

  it('filters by regions array', () => {
    const result = applyFilter(graph, { regions: ['us-east-1'] })
    result.nodes.forEach((n) => expect(n.region).toBe('us-east-1'))
  })

  it('filters by categories array', () => {
    const result = applyFilter(graph, { categories: ['compute', 'container'] })
    result.nodes.forEach((n) => expect(['compute', 'container']).toContain(n.category))
  })

  it('filters by types array', () => {
    const result = applyFilter(graph, { types: ['bigquery', 'rds'] })
    result.nodes.forEach((n) => expect(['bigquery', 'rds']).toContain(n.type))
    expect(result.nodes).toHaveLength(2)
  })

  it('filters by statuses array', () => {
    const result = applyFilter(graph, { statuses: ['warning', 'error'] })
    result.nodes.forEach((n) => expect(['warning', 'error']).toContain(n.status))
  })

  it('filters by minImportance', () => {
    const result = applyFilter(graph, { minImportance: 9 })
    result.nodes.forEach((n) => expect(n.importance).toBeGreaterThanOrEqual(9))
  })

  it('searchText matches across id, label, type, region', () => {
    const byLabel = applyFilter(graph, { searchText: 'warehouse' })
    expect(byLabel.nodes.some((n) => n.id === 'gcp-2')).toBe(true)

    const byType = applyFilter(graph, { searchText: 'cloud-run' })
    expect(byType.nodes.some((n) => n.id === 'gcp-1')).toBe(true)

    const byRegion = applyFilter(graph, { searchText: 'us-central1' })
    byRegion.nodes.forEach((n) => expect(n.region).toBe('us-central1'))
  })

  it('multiple spec fields are ANDed together', () => {
    const result = applyFilter(graph, { providers: ['azure'], statuses: ['healthy'] })
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('az-1')
  })

  it('subtreeRootId returns the root and all its children', () => {
    // Build a graph with parent pointers: root → child1, root → child2, child1 → grandchild
    const hierarchyGraph: InfraGraph = {
      nodes: [
        { id: 'root', label: 'root', provider: 'aws', type: 'vpc', category: 'network', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 9 },
        { id: 'child1', label: 'c1', provider: 'aws', type: 'subnet', category: 'network', region: 'us-east-1', parent: 'root', metadata: {}, status: 'healthy', importance: 5 },
        { id: 'child2', label: 'c2', provider: 'aws', type: 'subnet', category: 'network', region: 'us-east-1', parent: 'root', metadata: {}, status: 'healthy', importance: 5 },
        { id: 'grandchild', label: 'gc', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', parent: 'child1', metadata: {}, status: 'healthy', importance: 6 },
        { id: 'unrelated', label: 'other', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 4 },
      ],
      edges: [],
    }

    const result = applyFilter(hierarchyGraph, { subtreeRootId: 'root' })
    const resultIds = result.nodes.map((n) => n.id)
    expect(resultIds).toContain('root')
    expect(resultIds).toContain('child1')
    expect(resultIds).toContain('child2')
    expect(resultIds).toContain('grandchild')
    expect(resultIds).not.toContain('unrelated')
  })
})
