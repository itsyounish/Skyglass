import { useState, useEffect, useMemo } from 'react'
import type { InfraGraph } from '../types'
import { BLAST_HOP_DELAY_MS } from '../constants'

export interface BlastState {
  affectedNodes: Set<string>
  /** Every edge between two affected nodes — rendered red (BFS tree + lateral). */
  affectedEdges: Set<string>
  nodeHops: Map<string, number>
  /** Hop number per affected edge (max of endpoint hops) — drives the color gradient. */
  edgeHops: Map<string, number>
  /** Subset of affectedEdges: only the edges the BFS actually crossed to discover a new node.
   *  Cascade-packet animation is emitted only on these, to avoid visual noise. */
  bfsEdges: Set<string>
  maxHop: number
}

const EMPTY_STATE: BlastState = {
  affectedNodes: new Set(),
  affectedEdges: new Set(),
  nodeHops: new Map(),
  edgeHops: new Map(),
  bfsEdges: new Set(),
  maxHop: 0,
}

export function useBlastRadius(graph: InfraGraph, enabled: boolean, sourceNodeId: string | null): BlastState {
  const [state, setState] = useState<BlastState>(EMPTY_STATE)

  // Build directed adjacency (source → targets)
  const adjacency = useMemo(() => {
    const adj = new Map<string, Array<{ nodeId: string; edgeId: string }>>()
    for (const e of graph.edges) {
      if (!adj.has(e.source)) adj.set(e.source, [])
      adj.get(e.source)!.push({ nodeId: e.target, edgeId: e.id })
      // Also add reverse for dependency edges (if A depends on B, B failing affects A)
      if (e.type === 'dependency') {
        if (!adj.has(e.target)) adj.set(e.target, [])
        adj.get(e.target)!.push({ nodeId: e.source, edgeId: e.id })
      }
    }
    return adj
  }, [graph.edges])

  useEffect(() => {
    if (!enabled || !sourceNodeId) {
      setState(EMPTY_STATE)
      return
    }

    const nodeHops = new Map<string, number>([[sourceNodeId, 0]])
    const bfsEdges = new Set<string>()
    let frontier = [sourceNodeId]
    let hop = 0
    const timers: ReturnType<typeof setTimeout>[] = []

    /** Recompute lateral edges: every edge whose both endpoints are affected. */
    function buildFullEdgeSet(): { affectedEdges: Set<string>; edgeHops: Map<string, number> } {
      const affected = new Set<string>()
      const hops = new Map<string, number>()
      for (const e of graph.edges) {
        const hs = nodeHops.get(e.source)
        const ht = nodeHops.get(e.target)
        if (hs === undefined || ht === undefined) continue
        affected.add(e.id)
        hops.set(e.id, Math.max(hs, ht))
      }
      return { affectedEdges: affected, edgeHops: hops }
    }

    function emit() {
      const { affectedEdges, edgeHops } = buildFullEdgeSet()
      setState({
        affectedNodes: new Set(nodeHops.keys()),
        affectedEdges,
        nodeHops: new Map(nodeHops),
        edgeHops,
        bfsEdges: new Set(bfsEdges),
        maxHop: hop,
      })
    }

    // Immediately show source
    emit()

    function propagateHop() {
      const nextFrontier: string[] = []
      const nextHop = hop + 1
      for (const nodeId of frontier) {
        const neighbors = adjacency.get(nodeId) || []
        for (const { nodeId: neighbor, edgeId } of neighbors) {
          if (!nodeHops.has(neighbor)) {
            nodeHops.set(neighbor, nextHop)
            bfsEdges.add(edgeId)
            nextFrontier.push(neighbor)
          }
        }
      }
      frontier = nextFrontier

      if (nextFrontier.length > 0) {
        hop = nextHop
        emit()
        if (hop < 6) { // Max 6 hops
          timers.push(setTimeout(propagateHop, BLAST_HOP_DELAY_MS))
        }
      }
    }

    timers.push(setTimeout(propagateHop, BLAST_HOP_DELAY_MS))

    return () => { timers.forEach(clearTimeout) }
  }, [enabled, sourceNodeId, adjacency, graph.edges])

  return state
}
