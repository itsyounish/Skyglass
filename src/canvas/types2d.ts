import type { InfraNode, Provider, NodeCategory } from '../types'

export interface LayoutNode2D extends InfraNode {
  x: number
  y: number
}

export type ZoomTier = 'macro' | 'cluster' | 'node' | 'detail'

export interface GroupHull {
  id: string
  label: string
  provider: Provider
  points: [number, number][]   // convex hull points
  smooth: [number, number][]   // Catmull-Rom smoothed points
  centroid: [number, number]
  nodeCount: number
}

export interface CategoryPill {
  category: NodeCategory
  provider: Provider
  centroid: [number, number]
  count: number
  healthySummary: { healthy: number; warning: number; error: number }
}
