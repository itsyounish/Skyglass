/**
 * Snapshot diff engine.
 *
 * Compares two InfraGraph snapshots (v1) and surfaces what changed.
 * Works with v2 graphs too — cast InfraGraphV2 to InfraGraph before calling,
 * or use the diffGraphsV2 variant.
 */

import type { InfraNode, InfraEdge, InfraGraph } from '../types'
import type { InfraNodeV2, InfraEdgeV2, InfraGraphV2 } from '../types-v2'

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface NodeChange {
  field: string
  old: string
  new: string
}

export interface ModifiedNode {
  id: string
  /** Human-readable label from the "after" snapshot */
  label: string
  changes: Record<string, NodeChange>
}

export interface GraphDiff {
  addedNodes: InfraNode[]
  removedNodes: InfraNode[]
  modifiedNodes: ModifiedNode[]
  addedEdges: InfraEdge[]
  removedEdges: InfraEdge[]
  summary: {
    added: number
    removed: number
    modified: number
    edgesAdded: number
    edgesRemoved: number
  }
}

// ---------------------------------------------------------------------------
// v2-specific diff (richer change set)
// ---------------------------------------------------------------------------

export interface ModifiedNodeV2 {
  id: string
  label: string
  changes: Record<string, NodeChange>
}

export interface GraphDiffV2 {
  addedNodes: InfraNodeV2[]
  removedNodes: InfraNodeV2[]
  modifiedNodes: ModifiedNodeV2[]
  addedEdges: InfraEdgeV2[]
  removedEdges: InfraEdgeV2[]
  summary: {
    added: number
    removed: number
    modified: number
    edgesAdded: number
    edgesRemoved: number
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scalar fields to compare on InfraNode (excludes composite objects) */
const NODE_SCALAR_FIELDS = [
  'label',
  'provider',
  'type',
  'category',
  'region',
  'parent',
  'status',
  'importance',
] as const

type ScalarField = (typeof NODE_SCALAR_FIELDS)[number]

function diffNodes(before: InfraNode, after: InfraNode): Record<string, NodeChange> {
  const changes: Record<string, NodeChange> = {}

  for (const field of NODE_SCALAR_FIELDS) {
    const oldVal = String(before[field] ?? '')
    const newVal = String(after[field] ?? '')
    if (oldVal !== newVal) {
      changes[field] = { field, old: oldVal, new: newVal }
    }
  }

  // Diff flat metadata (string key→value record)
  const oldMeta = before.metadata
  const newMeta = after.metadata
  const metaKeys = new Set([...Object.keys(oldMeta), ...Object.keys(newMeta)])

  for (const key of metaKeys) {
    const oldVal = oldMeta[key] ?? ''
    const newVal = newMeta[key] ?? ''
    if (oldVal !== newVal) {
      changes[`metadata.${key}`] = { field: `metadata.${key}`, old: oldVal, new: newVal }
    }
  }

  return changes
}

function edgeKey(edge: InfraEdge): string {
  return `${edge.source}→${edge.target}:${edge.type}`
}

// ---------------------------------------------------------------------------
// diffGraphs — v1 InfraGraph
// ---------------------------------------------------------------------------

/**
 * Compares two snapshots and returns the diff.
 *
 * Node identity is determined by `id`.
 * Edge identity is determined by the composite key `source→target:type`.
 * The `edge.id` field is intentionally ignored as it may differ between scans.
 */
export function diffGraphs(before: InfraGraph, after: InfraGraph): GraphDiff {
  const beforeNodeMap = new Map(before.nodes.map((n) => [n.id, n]))
  const afterNodeMap = new Map(after.nodes.map((n) => [n.id, n]))

  const addedNodes: InfraNode[] = []
  const removedNodes: InfraNode[] = []
  const modifiedNodes: ModifiedNode[] = []

  // Nodes in "after" but not in "before" → added
  for (const [id, node] of afterNodeMap) {
    if (!beforeNodeMap.has(id)) {
      addedNodes.push(node)
    }
  }

  // Nodes in "before" but not in "after" → removed
  for (const [id, node] of beforeNodeMap) {
    if (!afterNodeMap.has(id)) {
      removedNodes.push(node)
    }
  }

  // Nodes in both → check for field-level changes
  for (const [id, afterNode] of afterNodeMap) {
    const beforeNode = beforeNodeMap.get(id)
    if (!beforeNode) continue // already counted as added
    const changes = diffNodes(beforeNode, afterNode)
    if (Object.keys(changes).length > 0) {
      modifiedNodes.push({ id, label: afterNode.label, changes })
    }
  }

  // Edge diff
  const beforeEdgeKeys = new Map(before.edges.map((e) => [edgeKey(e), e]))
  const afterEdgeKeys = new Map(after.edges.map((e) => [edgeKey(e), e]))

  const addedEdges: InfraEdge[] = []
  const removedEdges: InfraEdge[] = []

  for (const [key, edge] of afterEdgeKeys) {
    if (!beforeEdgeKeys.has(key)) addedEdges.push(edge)
  }
  for (const [key, edge] of beforeEdgeKeys) {
    if (!afterEdgeKeys.has(key)) removedEdges.push(edge)
  }

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    summary: {
      added: addedNodes.length,
      removed: removedNodes.length,
      modified: modifiedNodes.length,
      edgesAdded: addedEdges.length,
      edgesRemoved: removedEdges.length,
    },
  }
}

// ---------------------------------------------------------------------------
// diffGraphsV2 — InfraGraphV2 with richer change tracking
// ---------------------------------------------------------------------------

const NODE_V2_EXTRA_FIELDS = [
  'accountId',
  'resourceArn',
  'discoveredAt',
  'updatedAt',
] as const

function diffNodesV2(before: InfraNodeV2, after: InfraNodeV2): Record<string, NodeChange> {
  // Reuse v1 scalar diff (InfraNodeV2 is structurally compatible with InfraNode for those fields)
  const changes = diffNodes(before as unknown as InfraNode, after as unknown as InfraNode)

  // Extra v2-only scalar fields
  for (const field of NODE_V2_EXTRA_FIELDS) {
    const oldVal = String(before[field] ?? '')
    const newVal = String(after[field] ?? '')
    if (oldVal !== newVal) {
      changes[field] = { field, old: oldVal, new: newVal }
    }
  }

  // Status change (health status comparison)
  if (before.status !== after.status) {
    changes['status'] = { field: 'status', old: before.status, new: after.status }
  }

  // Cost change
  const oldCost = String(before.cost?.monthlyUsd ?? '')
  const newCost = String(after.cost?.monthlyUsd ?? '')
  if (oldCost !== newCost) {
    changes['cost.monthlyUsd'] = { field: 'cost.monthlyUsd', old: oldCost, new: newCost }
  }

  // Tag index change (flat comparison via JSON)
  const oldTags = JSON.stringify(
    (before.tags ?? []).map((t) => `${t.key}=${t.value}`).sort(),
  )
  const newTags = JSON.stringify(
    (after.tags ?? []).map((t) => `${t.key}=${t.value}`).sort(),
  )
  if (oldTags !== newTags) {
    changes['tags'] = { field: 'tags', old: oldTags, new: newTags }
  }

  return changes
}

function edgeV2Key(edge: InfraEdgeV2): string {
  return `${edge.source}→${edge.target}:${edge.relationType}`
}

export function diffGraphsV2(before: InfraGraphV2, after: InfraGraphV2): GraphDiffV2 {
  const beforeNodeMap = new Map(before.nodes.map((n) => [n.id, n]))
  const afterNodeMap = new Map(after.nodes.map((n) => [n.id, n]))

  const addedNodes: InfraNodeV2[] = []
  const removedNodes: InfraNodeV2[] = []
  const modifiedNodes: ModifiedNodeV2[] = []

  for (const [id, node] of afterNodeMap) {
    if (!beforeNodeMap.has(id)) addedNodes.push(node)
  }

  for (const [id, node] of beforeNodeMap) {
    if (!afterNodeMap.has(id)) removedNodes.push(node)
  }

  for (const [id, afterNode] of afterNodeMap) {
    const beforeNode = beforeNodeMap.get(id)
    if (!beforeNode) continue
    const changes = diffNodesV2(beforeNode, afterNode)
    if (Object.keys(changes).length > 0) {
      modifiedNodes.push({ id, label: afterNode.label, changes })
    }
  }

  const beforeEdgeKeys = new Map(before.edges.map((e) => [edgeV2Key(e), e]))
  const afterEdgeKeys = new Map(after.edges.map((e) => [edgeV2Key(e), e]))

  const addedEdges: InfraEdgeV2[] = []
  const removedEdges: InfraEdgeV2[] = []

  for (const [key, edge] of afterEdgeKeys) {
    if (!beforeEdgeKeys.has(key)) addedEdges.push(edge)
  }
  for (const [key, edge] of beforeEdgeKeys) {
    if (!afterEdgeKeys.has(key)) removedEdges.push(edge)
  }

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    summary: {
      added: addedNodes.length,
      removed: removedNodes.length,
      modified: modifiedNodes.length,
      edgesAdded: addedEdges.length,
      edgesRemoved: removedEdges.length,
    },
  }
}
