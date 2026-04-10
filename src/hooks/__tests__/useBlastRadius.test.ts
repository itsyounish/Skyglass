import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBlastRadius } from '../useBlastRadius'
import type { InfraGraph } from '../../types'

// BLAST_HOP_DELAY_MS is 350 ms in constants.ts — use a value that exceeds it
const HOP_DELAY = 400

function advanceHops(count: number) {
  for (let i = 0; i < count; i++) {
    act(() => { vi.advanceTimersByTime(HOP_DELAY) })
  }
}

describe('useBlastRadius', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const linearGraph: InfraGraph = {
    nodes: [
      { id: 'A', label: 'A', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 5 },
      { id: 'B', label: 'B', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 5 },
      { id: 'C', label: 'C', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 5 },
    ],
    edges: [
      { id: 'e-AB', source: 'A', target: 'B', type: 'network' },
      { id: 'e-BC', source: 'B', target: 'C', type: 'network' },
    ],
  }

  const cycleGraph: InfraGraph = {
    nodes: [
      { id: 'X', label: 'X', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 5 },
      { id: 'Y', label: 'Y', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 5 },
      { id: 'Z', label: 'Z', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 5 },
    ],
    edges: [
      { id: 'e-XY', source: 'X', target: 'Y', type: 'network' },
      { id: 'e-YZ', source: 'Y', target: 'Z', type: 'network' },
      { id: 'e-ZX', source: 'Z', target: 'X', type: 'network' }, // back-edge closes the cycle
    ],
  }

  const dependencyGraph: InfraGraph = {
    nodes: [
      { id: 'svc', label: 'Service', provider: 'aws', type: 'ec2', category: 'compute', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 5 },
      { id: 'db', label: 'Database', provider: 'aws', type: 'rds', category: 'database', region: 'us-east-1', metadata: {}, status: 'healthy', importance: 8 },
    ],
    edges: [
      // svc depends on db (forward direction: svc → db)
      { id: 'e-dep', source: 'svc', target: 'db', type: 'dependency' },
    ],
  }

  // ------------------------------------------------------------------
  // Tests
  // ------------------------------------------------------------------

  it('returns empty sets when disabled', () => {
    const { result } = renderHook(() =>
      useBlastRadius(linearGraph, false, 'A'),
    )
    expect(result.current.affectedNodes.size).toBe(0)
    expect(result.current.affectedEdges.size).toBe(0)
  })

  it('returns empty sets when sourceNodeId is null', () => {
    const { result } = renderHook(() =>
      useBlastRadius(linearGraph, true, null),
    )
    expect(result.current.affectedNodes.size).toBe(0)
    expect(result.current.affectedEdges.size).toBe(0)
  })

  it('immediately marks the source node as affected', () => {
    const { result } = renderHook(() =>
      useBlastRadius(linearGraph, true, 'A'),
    )
    // Source is set synchronously before any timer fires
    expect(result.current.affectedNodes.has('A')).toBe(true)
  })

  it('propagates through a linear chain A→B→C', () => {
    const { result } = renderHook(() =>
      useBlastRadius(linearGraph, true, 'A'),
    )

    // Hop 1: A → B
    advanceHops(1)
    expect(result.current.affectedNodes.has('B')).toBe(true)
    expect(result.current.affectedEdges.has('e-AB')).toBe(true)

    // Hop 2: B → C
    advanceHops(1)
    expect(result.current.affectedNodes.has('C')).toBe(true)
    expect(result.current.affectedEdges.has('e-BC')).toBe(true)
  })

  it('does not infinite-loop on a cycle graph', () => {
    const { result } = renderHook(() =>
      useBlastRadius(cycleGraph, true, 'X'),
    )

    // Advance well beyond 6 hops — should settle without hanging
    advanceHops(10)

    // All three nodes in the cycle must be reachable
    expect(result.current.affectedNodes.has('X')).toBe(true)
    expect(result.current.affectedNodes.has('Y')).toBe(true)
    expect(result.current.affectedNodes.has('Z')).toBe(true)

    // No node should appear more than once (Set semantics guarantee uniqueness)
    expect(result.current.affectedNodes.size).toBe(3)
  })

  it('reverses dependency edges — blasting the dependency target also reaches the source', () => {
    // If svc → db is a "dependency" edge, blasting "db" should reach "svc" (reverse)
    const { result } = renderHook(() =>
      useBlastRadius(dependencyGraph, true, 'db'),
    )

    advanceHops(1)

    expect(result.current.affectedNodes.has('svc')).toBe(true)
    expect(result.current.affectedEdges.has('e-dep')).toBe(true)
  })

  it('does not exceed 6 hops', () => {
    // Build a chain longer than 6 hops
    const longGraph: InfraGraph = {
      nodes: Array.from({ length: 10 }, (_, i) => ({
        id: `n${i}`,
        label: `Node${i}`,
        provider: 'aws' as const,
        type: 'ec2',
        category: 'compute' as const,
        region: 'us-east-1',
        metadata: {},
        status: 'healthy' as const,
        importance: 5,
      })),
      edges: Array.from({ length: 9 }, (_, i) => ({
        id: `e${i}`,
        source: `n${i}`,
        target: `n${i + 1}`,
        type: 'network' as const,
      })),
    }

    const { result } = renderHook(() =>
      useBlastRadius(longGraph, true, 'n0'),
    )

    // Advance enough hops to surpass the 6-hop limit
    advanceHops(10)

    // Node n0 starts at hop 0; max propagation is 6 additional hops → n6 at most
    expect(result.current.affectedNodes.has('n6')).toBe(true)

    // n7 through n9 must NOT be reached
    expect(result.current.affectedNodes.has('n7')).toBe(false)
    expect(result.current.affectedNodes.has('n8')).toBe(false)
    expect(result.current.affectedNodes.has('n9')).toBe(false)
  })

  it('clears affected sets when disabled prop is toggled off', () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useBlastRadius(linearGraph, enabled, 'A'),
      { initialProps: { enabled: true } },
    )

    advanceHops(2)
    expect(result.current.affectedNodes.size).toBeGreaterThan(0)

    rerender({ enabled: false })
    expect(result.current.affectedNodes.size).toBe(0)
    expect(result.current.affectedEdges.size).toBe(0)
  })

  it('clears affected sets when sourceNodeId becomes null', () => {
    const { result, rerender } = renderHook(
      ({ sourceNodeId }: { sourceNodeId: string | null }) =>
        useBlastRadius(linearGraph, true, sourceNodeId),
      { initialProps: { sourceNodeId: 'A' as string | null } },
    )

    advanceHops(2)
    expect(result.current.affectedNodes.size).toBeGreaterThan(0)

    rerender({ sourceNodeId: null })
    expect(result.current.affectedNodes.size).toBe(0)
    expect(result.current.affectedEdges.size).toBe(0)
  })
})
