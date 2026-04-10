import { describe, it, expect } from 'vitest'
import { diffGraphs } from '../diff.ts'
import type { InfraGraph, InfraNode, InfraEdge } from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<InfraNode> = {}): InfraNode {
  return {
    id,
    label: `Label-${id}`,
    provider: 'aws',
    type: 'ec2',
    category: 'compute',
    region: 'us-east-1',
    metadata: { env: 'production' },
    status: 'healthy',
    importance: 5,
    ...overrides,
  }
}

function makeEdge(id: string, source: string, target: string, overrides: Partial<InfraEdge> = {}): InfraEdge {
  return { id, source, target, type: 'network', ...overrides }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('diffGraphs', () => {
  // ------------------------------------------------------------------
  // Identity cases
  // ------------------------------------------------------------------

  it('returns zero changes for two identical empty graphs', () => {
    const empty: InfraGraph = { nodes: [], edges: [] }
    const diff = diffGraphs(empty, empty)
    expect(diff.addedNodes).toHaveLength(0)
    expect(diff.removedNodes).toHaveLength(0)
    expect(diff.modifiedNodes).toHaveLength(0)
    expect(diff.addedEdges).toHaveLength(0)
    expect(diff.removedEdges).toHaveLength(0)
  })

  it('returns zero changes for identical non-empty graphs', () => {
    const graph: InfraGraph = {
      nodes: [makeNode('n1'), makeNode('n2')],
      edges: [makeEdge('e1', 'n1', 'n2')],
    }
    const diff = diffGraphs(graph, graph)
    expect(diff.addedNodes).toHaveLength(0)
    expect(diff.removedNodes).toHaveLength(0)
    expect(diff.modifiedNodes).toHaveLength(0)
    expect(diff.addedEdges).toHaveLength(0)
    expect(diff.removedEdges).toHaveLength(0)
  })

  // ------------------------------------------------------------------
  // Node additions
  // ------------------------------------------------------------------

  it('detects a newly added node', () => {
    const before: InfraGraph = { nodes: [makeNode('n1')], edges: [] }
    const after: InfraGraph = { nodes: [makeNode('n1'), makeNode('n2')], edges: [] }

    const diff = diffGraphs(before, after)
    expect(diff.addedNodes).toHaveLength(1)
    expect(diff.addedNodes[0].id).toBe('n2')
    expect(diff.removedNodes).toHaveLength(0)
  })

  it('detects multiple added nodes', () => {
    const before: InfraGraph = { nodes: [], edges: [] }
    const after: InfraGraph = {
      nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
      edges: [],
    }

    const diff = diffGraphs(before, after)
    expect(diff.addedNodes).toHaveLength(3)
    expect(diff.removedNodes).toHaveLength(0)
  })

  // ------------------------------------------------------------------
  // Node removals
  // ------------------------------------------------------------------

  it('detects a removed node', () => {
    const before: InfraGraph = {
      nodes: [makeNode('n1'), makeNode('n2')],
      edges: [],
    }
    const after: InfraGraph = { nodes: [makeNode('n1')], edges: [] }

    const diff = diffGraphs(before, after)
    expect(diff.removedNodes).toHaveLength(1)
    expect(diff.removedNodes[0].id).toBe('n2')
    expect(diff.addedNodes).toHaveLength(0)
  })

  // ------------------------------------------------------------------
  // Node modifications
  // ------------------------------------------------------------------

  it('detects a node with a changed status', () => {
    const before: InfraGraph = {
      nodes: [makeNode('n1', { status: 'healthy' })],
      edges: [],
    }
    const after: InfraGraph = {
      nodes: [makeNode('n1', { status: 'error' })],
      edges: [],
    }

    const diff = diffGraphs(before, after)
    expect(diff.modifiedNodes).toHaveLength(1)
    expect(diff.modifiedNodes[0].before.status).toBe('healthy')
    expect(diff.modifiedNodes[0].after.status).toBe('error')
    expect(diff.addedNodes).toHaveLength(0)
    expect(diff.removedNodes).toHaveLength(0)
  })

  it('detects a node with changed metadata', () => {
    const before: InfraGraph = {
      nodes: [makeNode('n1', { metadata: { env: 'staging' } })],
      edges: [],
    }
    const after: InfraGraph = {
      nodes: [makeNode('n1', { metadata: { env: 'production', version: '2.0' } })],
      edges: [],
    }

    const diff = diffGraphs(before, after)
    expect(diff.modifiedNodes).toHaveLength(1)
    expect(diff.modifiedNodes[0].before.metadata.env).toBe('staging')
    expect(diff.modifiedNodes[0].after.metadata.version).toBe('2.0')
  })

  it('detects a node with changed importance', () => {
    const before: InfraGraph = {
      nodes: [makeNode('n1', { importance: 5 })],
      edges: [],
    }
    const after: InfraGraph = {
      nodes: [makeNode('n1', { importance: 9 })],
      edges: [],
    }

    const diff = diffGraphs(before, after)
    expect(diff.modifiedNodes).toHaveLength(1)
  })

  it('detects a node with a changed label', () => {
    const before: InfraGraph = {
      nodes: [makeNode('n1', { label: 'old-name' })],
      edges: [],
    }
    const after: InfraGraph = {
      nodes: [makeNode('n1', { label: 'new-name' })],
      edges: [],
    }

    const diff = diffGraphs(before, after)
    expect(diff.modifiedNodes).toHaveLength(1)
    expect(diff.modifiedNodes[0].before.label).toBe('old-name')
    expect(diff.modifiedNodes[0].after.label).toBe('new-name')
  })

  it('detects a node with a changed region', () => {
    const before: InfraGraph = {
      nodes: [makeNode('n1', { region: 'us-east-1' })],
      edges: [],
    }
    const after: InfraGraph = {
      nodes: [makeNode('n1', { region: 'eu-west-1' })],
      edges: [],
    }

    const diff = diffGraphs(before, after)
    expect(diff.modifiedNodes).toHaveLength(1)
  })

  it('reports both before and after snapshots for a modified node', () => {
    const n1Before = makeNode('n1', { status: 'healthy', label: 'old' })
    const n1After = makeNode('n1', { status: 'warning', label: 'new' })
    const before: InfraGraph = { nodes: [n1Before], edges: [] }
    const after: InfraGraph = { nodes: [n1After], edges: [] }

    const diff = diffGraphs(before, after)
    expect(diff.modifiedNodes[0].before).toEqual(n1Before)
    expect(diff.modifiedNodes[0].after).toEqual(n1After)
  })

  // ------------------------------------------------------------------
  // Edge additions
  // ------------------------------------------------------------------

  it('detects a newly added edge', () => {
    const sharedNodes = [makeNode('n1'), makeNode('n2')]
    const before: InfraGraph = { nodes: sharedNodes, edges: [] }
    const after: InfraGraph = {
      nodes: sharedNodes,
      edges: [makeEdge('e1', 'n1', 'n2')],
    }

    const diff = diffGraphs(before, after)
    expect(diff.addedEdges).toHaveLength(1)
    expect(diff.addedEdges[0].id).toBe('e1')
    expect(diff.removedEdges).toHaveLength(0)
  })

  // ------------------------------------------------------------------
  // Edge removals
  // ------------------------------------------------------------------

  it('detects a removed edge', () => {
    const sharedNodes = [makeNode('n1'), makeNode('n2')]
    const before: InfraGraph = {
      nodes: sharedNodes,
      edges: [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n1')],
    }
    const after: InfraGraph = {
      nodes: sharedNodes,
      edges: [makeEdge('e1', 'n1', 'n2')],
    }

    const diff = diffGraphs(before, after)
    expect(diff.removedEdges).toHaveLength(1)
    expect(diff.removedEdges[0].id).toBe('e2')
    expect(diff.addedEdges).toHaveLength(0)
  })

  // ------------------------------------------------------------------
  // Combined changes
  // ------------------------------------------------------------------

  it('handles simultaneous adds, removes, and modifications', () => {
    const before: InfraGraph = {
      nodes: [
        makeNode('existing', { status: 'healthy' }),
        makeNode('to-remove'),
      ],
      edges: [makeEdge('old-edge', 'existing', 'to-remove')],
    }
    const after: InfraGraph = {
      nodes: [
        makeNode('existing', { status: 'error' }), // modified
        makeNode('new-node'),                        // added
      ],
      edges: [makeEdge('new-edge', 'existing', 'new-node')], // added
    }

    const diff = diffGraphs(before, after)
    expect(diff.addedNodes.map((n) => n.id)).toContain('new-node')
    expect(diff.removedNodes.map((n) => n.id)).toContain('to-remove')
    expect(diff.modifiedNodes.length).toBe(1)
    expect(diff.modifiedNodes[0].before.status).toBe('healthy')
    expect(diff.addedEdges.map((e) => e.id)).toContain('new-edge')
    expect(diff.removedEdges.map((e) => e.id)).toContain('old-edge')
  })

  // ------------------------------------------------------------------
  // No false positives
  // ------------------------------------------------------------------

  it('does not report an unchanged node as modified', () => {
    const node = makeNode('n1', { metadata: { key: 'val' } })
    const before: InfraGraph = { nodes: [node], edges: [] }
    const after: InfraGraph = { nodes: [{ ...node }], edges: [] }

    const diff = diffGraphs(before, after)
    expect(diff.modifiedNodes).toHaveLength(0)
  })

  it('treats nodes with the same id but different parent as modified', () => {
    const before: InfraGraph = {
      nodes: [makeNode('n1', { parent: 'vpc-a' })],
      edges: [],
    }
    const after: InfraGraph = {
      nodes: [makeNode('n1', { parent: 'vpc-b' })],
      edges: [],
    }

    const diff = diffGraphs(before, after)
    expect(diff.modifiedNodes).toHaveLength(1)
  })
})
