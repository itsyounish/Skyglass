import { useEffect, useRef, useState, useMemo } from 'react'
import type { InfraGraph, Provider, NodeCategory } from '../types'
import type { LayoutNode2D } from '../canvas/types2d'
import {
  FORCE_LINK_DISTANCE_2D, FORCE_CHARGE_STRENGTH_2D, FORCE_CENTER_STRENGTH_2D,
  PROVIDER_CLUSTER_STRENGTH_2D, GROUP_CONTAINMENT_STRENGTH,
  CATEGORY_LANE_STRENGTH, PROVIDER_CENTERS_2D, CATEGORY_LANES,
} from '../constants-2d'

// ---------------------------------------------------------------------------
// Types matching worker protocol
// ---------------------------------------------------------------------------

interface SimNodeData2D {
  provider: string
  category: string
  parent: string | undefined
  x: number
  y: number
}

interface LinkData {
  source: number
  target: number
}

interface ForceConfig2D {
  chargeStrength: number
  linkDistance: number
  centerStrength: number
  clusterStrength: number
  groupContainmentStrength: number
  categoryLaneStrength: number
  providerCenters: Record<string, [number, number]>
  categoryLanes: Record<string, number>
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function graphKey(graph: InfraGraph): string {
  return graph.nodes.map(n => n.id).join(',')
}

function serializeNodes(graph: InfraGraph): SimNodeData2D[] {
  return graph.nodes.map((gn) => {
    const center = PROVIDER_CENTERS_2D[gn.provider] || [0, 0]
    return {
      provider: gn.provider,
      category: gn.category,
      parent: gn.parent,
      x: center[0] + (Math.random() - 0.5) * 100,
      y: (CATEGORY_LANES[gn.category] ?? 0) + (Math.random() - 0.5) * 50,
    }
  })
}

function serializeLinks(graph: InfraGraph): LinkData[] {
  const nodeIndex = new Map(graph.nodes.map((gn, i) => [gn.id, i]))
  return graph.edges
    .map((e) => ({
      source: nodeIndex.get(e.source)!,
      target: nodeIndex.get(e.target)!,
    }))
    .filter((l) => l.source !== undefined && l.target !== undefined)
}

function buildConfig(): ForceConfig2D {
  return {
    chargeStrength: FORCE_CHARGE_STRENGTH_2D,
    linkDistance: FORCE_LINK_DISTANCE_2D,
    centerStrength: FORCE_CENTER_STRENGTH_2D,
    clusterStrength: PROVIDER_CLUSTER_STRENGTH_2D,
    groupContainmentStrength: GROUP_CONTAINMENT_STRENGTH,
    categoryLaneStrength: CATEGORY_LANE_STRENGTH,
    providerCenters: PROVIDER_CENTERS_2D,
    categoryLanes: CATEGORY_LANES,
  }
}

// ---------------------------------------------------------------------------
// Main-thread fallback (O(n^2) charge repulsion)
// ---------------------------------------------------------------------------

interface SimNode2D {
  x: number; y: number
  vx: number; vy: number
  provider: string
  category: string
  parent: string | undefined
}

function runMainThread(
  graph: InfraGraph,
  posRef: React.MutableRefObject<Float32Array>,
  settledRef: React.MutableRefObject<boolean>,
  setNodes: React.Dispatch<React.SetStateAction<LayoutNode2D[]>>,
): () => void {
  const n = graph.nodes.length
  posRef.current = new Float32Array(n * 2)

  const nodes: SimNode2D[] = graph.nodes.map((gn) => {
    const center = PROVIDER_CENTERS_2D[gn.provider] || [0, 0]
    return {
      x: center[0] + (Math.random() - 0.5) * 100,
      y: (CATEGORY_LANES[gn.category] ?? 0) + (Math.random() - 0.5) * 50,
      vx: 0, vy: 0,
      provider: gn.provider,
      category: gn.category,
      parent: gn.parent,
    }
  })

  const nodeIndex = new Map(graph.nodes.map((gn, i) => [gn.id, i]))
  const links = graph.edges
    .map(e => ({ source: nodeIndex.get(e.source)!, target: nodeIndex.get(e.target)! }))
    .filter(l => l.source !== undefined && l.target !== undefined)

  // Write initial
  for (let i = 0; i < n; i++) {
    posRef.current[i * 2] = nodes[i].x
    posRef.current[i * 2 + 1] = nodes[i].y
  }
  setNodes(graph.nodes.map((gn, i) => ({ ...gn, x: nodes[i].x, y: nodes[i].y })))

  let alpha = 1
  let frameId = 0
  let ticksSinceUpdate = 0
  const chargeStr = Math.abs(FORCE_CHARGE_STRENGTH_2D)
  const config = buildConfig()

  // Pre-compute parent groups for containment force
  const parentGroups = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const p = nodes[i].parent
    if (p) {
      if (!parentGroups.has(p)) parentGroups.set(p, [])
      parentGroups.get(p)!.push(i)
    }
  }

  function tick() {
    // Forces
    for (let i = 0; i < n; i++) {
      const node = nodes[i]
      // Center
      node.vx -= node.x * config.centerStrength * alpha
      node.vy -= node.y * config.centerStrength * alpha
      // Provider cluster
      const center = PROVIDER_CENTERS_2D[node.provider]
      if (center) {
        node.vx += (center[0] - node.x) * config.clusterStrength * alpha
        node.vy += (center[1] - node.y) * config.clusterStrength * alpha
      }
      // Category lane
      const targetY = CATEGORY_LANES[node.category] ?? 0
      node.vy += (targetY - node.y) * config.categoryLaneStrength * alpha
    }

    // Group containment
    for (const [, indices] of parentGroups) {
      if (indices.length < 2) continue
      let cx = 0, cy = 0
      for (const i of indices) { cx += nodes[i].x; cy += nodes[i].y }
      cx /= indices.length; cy /= indices.length
      for (const i of indices) {
        nodes[i].vx += (cx - nodes[i].x) * config.groupContainmentStrength * alpha
        nodes[i].vy += (cy - nodes[i].y) * config.groupContainmentStrength * alpha
      }
    }

    // O(n^2) charge
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = nodes[j].x - nodes[i].x
        const dy = nodes[j].y - nodes[i].y
        const dist2 = dx * dx + dy * dy + 1
        const dist = Math.sqrt(dist2)
        const force = (-chargeStr * alpha) / dist2
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        nodes[i].vx += fx; nodes[i].vy += fy
        nodes[j].vx -= fx; nodes[j].vy -= fy
      }
    }

    // Link spring
    for (const link of links) {
      const s = nodes[link.source], t = nodes[link.target]
      const dx = t.x - s.x, dy = t.y - s.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = ((dist - config.linkDistance) / dist) * 0.05 * alpha
      s.vx += dx * force; s.vy += dy * force
      t.vx -= dx * force; t.vy -= dy * force
    }

    // Integrate
    for (let i = 0; i < n; i++) {
      nodes[i].vx *= 0.55; nodes[i].vy *= 0.55
      nodes[i].x += nodes[i].vx; nodes[i].y += nodes[i].vy
      posRef.current[i * 2] = nodes[i].x
      posRef.current[i * 2 + 1] = nodes[i].y
    }

    alpha = Math.max(alpha - 0.005, 0)

    if (alpha > 0) {
      // Update React state every ~6 frames (deterministic throttle)
      ticksSinceUpdate++
      if (ticksSinceUpdate >= 6) {
        ticksSinceUpdate = 0
        setNodes(graph.nodes.map((gn, i) => ({ ...gn, x: nodes[i].x, y: nodes[i].y })))
      }
      frameId = requestAnimationFrame(tick)
    } else {
      settledRef.current = true
      setNodes(graph.nodes.map((gn, i) => ({ ...gn, x: nodes[i].x, y: nodes[i].y })))
    }
  }

  frameId = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frameId)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useForceLayout2D(graph: InfraGraph) {
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode2D[]>([])
  const positionsRef = useRef<Float32Array>(new Float32Array(0))
  const settledRef = useRef(false)
  const key = useMemo(() => graphKey(graph), [graph])

  useEffect(() => {
    settledRef.current = false
    const n = graph.nodes.length
    positionsRef.current = new Float32Array(n * 2)

    const simNodes = serializeNodes(graph)
    const simLinks = serializeLinks(graph)
    const forceConfig = buildConfig()

    // Initial positions
    for (let i = 0; i < n; i++) {
      positionsRef.current[i * 2] = simNodes[i].x
      positionsRef.current[i * 2 + 1] = simNodes[i].y
    }
    setLayoutNodes(graph.nodes.map((gn, i) => ({
      ...gn, x: simNodes[i].x, y: simNodes[i].y,
    })))

    // Try worker
    let worker: Worker | null = null
    let fallbackCleanup: (() => void) | null = null

    try {
      worker = new Worker(
        new URL('../workers/forceLayout2D.worker.ts', import.meta.url),
        { type: 'module' },
      )

      // Throttle React state updates to ~10 Hz during simulation
      // (worker posts at ~60 Hz — updating React that fast triggers hull
      // recomputation every 16ms which causes jank)
      let lastStateUpdate = 0
      const STATE_UPDATE_INTERVAL = 100 // ms

      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data
        if (msg.type === 'positions') {
          const incoming = msg.positions as Float32Array
          if (incoming.length === positionsRef.current.length) {
            positionsRef.current.set(incoming)
            // Throttle: only update React state at ~10 Hz
            const now = performance.now()
            if (now - lastStateUpdate > STATE_UPDATE_INTERVAL) {
              lastStateUpdate = now
              setLayoutNodes(graph.nodes.map((gn, i) => ({
                ...gn,
                x: positionsRef.current[i * 2],
                y: positionsRef.current[i * 2 + 1],
              })))
            }
          }
        } else if (msg.type === 'settled') {
          settledRef.current = true
          setLayoutNodes(graph.nodes.map((gn, i) => ({
            ...gn,
            x: positionsRef.current[i * 2],
            y: positionsRef.current[i * 2 + 1],
          })))
        }
      }

      worker.onerror = () => {
        worker?.terminate()
        fallbackCleanup = runMainThread(graph, positionsRef, settledRef, setLayoutNodes)
      }

      worker.postMessage({
        type: 'init',
        nodes: simNodes,
        links: simLinks,
        config: forceConfig,
      })
    } catch {
      fallbackCleanup = runMainThread(graph, positionsRef, settledRef, setLayoutNodes)
    }

    return () => {
      if (worker) { worker.postMessage({ type: 'stop' }); worker.terminate() }
      if (fallbackCleanup) fallbackCleanup()
    }
  }, [key])

  return { layoutNodes, positionsRef, settled: settledRef.current }
}
