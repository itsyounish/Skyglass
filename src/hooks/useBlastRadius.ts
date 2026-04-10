import { useState, useEffect, useCallback, useMemo } from 'react'
import type { InfraGraph } from '../types'
import { BLAST_HOP_DELAY_MS } from '../constants'

export function useBlastRadius(graph: InfraGraph, enabled: boolean, sourceNodeId: string | null) {
  const [affectedNodes, setAffectedNodes] = useState<Set<string>>(new Set())
  const [affectedEdges, setAffectedEdges] = useState<Set<string>>(new Set())

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
      setAffectedNodes(new Set())
      setAffectedEdges(new Set())
      return
    }

    // BFS cascade with timed propagation
    const visited = new Set<string>([sourceNodeId])
    const visitedEdges = new Set<string>()
    let frontier = [sourceNodeId]
    let hop = 0
    const timers: ReturnType<typeof setTimeout>[] = []

    // Immediately show source
    setAffectedNodes(new Set([sourceNodeId]))
    setAffectedEdges(new Set())

    function propagateHop() {
      const nextFrontier: string[] = []
      for (const nodeId of frontier) {
        const neighbors = adjacency.get(nodeId) || []
        for (const { nodeId: neighbor, edgeId } of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            visitedEdges.add(edgeId)
            nextFrontier.push(neighbor)
          }
        }
      }
      frontier = nextFrontier

      if (nextFrontier.length > 0) {
        setAffectedNodes(new Set(visited))
        setAffectedEdges(new Set(visitedEdges))
        hop++
        if (hop < 6) { // Max 6 hops
          timers.push(setTimeout(propagateHop, BLAST_HOP_DELAY_MS))
        }
      }
    }

    timers.push(setTimeout(propagateHop, BLAST_HOP_DELAY_MS))

    return () => { timers.forEach(clearTimeout) }
  }, [enabled, sourceNodeId, adjacency])

  return { affectedNodes, affectedEdges }
}
