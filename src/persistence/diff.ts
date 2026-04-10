import type { InfraGraph, InfraNode, InfraEdge } from '../types'

export interface GraphDiff {
  addedNodes: InfraNode[]
  removedNodes: InfraNode[]
  modifiedNodes: Array<{ before: InfraNode; after: InfraNode }>
  addedEdges: InfraEdge[]
  removedEdges: InfraEdge[]
}

/**
 * Compute the diff between two InfraGraph snapshots.
 * Node identity is tracked by `id`. Modification is detected by comparing
 * every scalar field and the JSON-serialised `metadata` object.
 * Edge identity is tracked by `id`.
 */
export function diffGraphs(before: InfraGraph, after: InfraGraph): GraphDiff {
  const beforeNodeMap = new Map(before.nodes.map((n) => [n.id, n]))
  const afterNodeMap = new Map(after.nodes.map((n) => [n.id, n]))
  const beforeEdgeMap = new Map(before.edges.map((e) => [e.id, e]))
  const afterEdgeMap = new Map(after.edges.map((e) => [e.id, e]))

  const addedNodes: InfraNode[] = []
  const removedNodes: InfraNode[] = []
  const modifiedNodes: Array<{ before: InfraNode; after: InfraNode }> = []

  for (const [id, afterNode] of afterNodeMap) {
    if (!beforeNodeMap.has(id)) {
      addedNodes.push(afterNode)
    } else {
      const beforeNode = beforeNodeMap.get(id)!
      if (!nodesEqual(beforeNode, afterNode)) {
        modifiedNodes.push({ before: beforeNode, after: afterNode })
      }
    }
  }

  for (const [id, beforeNode] of beforeNodeMap) {
    if (!afterNodeMap.has(id)) {
      removedNodes.push(beforeNode)
    }
  }

  const addedEdges: InfraEdge[] = []
  const removedEdges: InfraEdge[] = []

  for (const [id, afterEdge] of afterEdgeMap) {
    if (!beforeEdgeMap.has(id)) {
      addedEdges.push(afterEdge)
    }
  }

  for (const [id, beforeEdge] of beforeEdgeMap) {
    if (!afterEdgeMap.has(id)) {
      removedEdges.push(beforeEdge)
    }
  }

  return { addedNodes, removedNodes, modifiedNodes, addedEdges, removedEdges }
}

function nodesEqual(a: InfraNode, b: InfraNode): boolean {
  return (
    a.label === b.label &&
    a.provider === b.provider &&
    a.type === b.type &&
    a.category === b.category &&
    a.region === b.region &&
    a.status === b.status &&
    a.importance === b.importance &&
    (a.parent ?? null) === (b.parent ?? null) &&
    JSON.stringify(a.metadata) === JSON.stringify(b.metadata)
  )
}
