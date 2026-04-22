import type { Provider, NodeCategory } from './types'

export const PROVIDER_COLORS: Record<Provider, { primary: string; glow: string; dim: string; hex: number }> = {
  aws: { primary: '#ff9900', glow: '#ffcc66', dim: '#663d00', hex: 0xff9900 },
  azure: { primary: '#0078d4', glow: '#66b2ff', dim: '#003366', hex: 0x0078d4 },
  gcp: { primary: '#34a853', glow: '#80e09a', dim: '#1a5429', hex: 0x34a853 },
}

// Edge type colors (GitNexus-inspired distinct coloring)
export const EDGE_TYPE_COLORS: Record<string, string> = {
  network: '#10b981',      // emerald
  data: '#06b6d4',         // cyan
  dependency: '#8b5cf6',   // violet
  'cross-cloud': '#ffffff', // white
}

export const CATEGORY_GEOMETRY: Record<NodeCategory, string> = {
  compute: 'box',
  database: 'cylinder',
  storage: 'icosahedron',
  network: 'torus',
  serverless: 'octahedron',
  container: 'dodecahedron',
  cdn: 'torusKnot',
  messaging: 'cone',
  analytics: 'sphere',
  security: 'tetrahedron',
  ml: 'capsule',
  iot: 'ring',
  devops: 'box',
  management: 'tetrahedron',
  integration: 'torusKnot',
  media: 'sphere',
  migration: 'octahedron',
}

export const CATEGORY_SCALE: Record<NodeCategory, number> = {
  network: 1.3,
  compute: 1.0,
  container: 1.1,
  database: 1.0,
  storage: 0.9,
  serverless: 0.8,
  cdn: 0.85,
  messaging: 0.85,
  analytics: 1.05,
  security: 0.9,
  ml: 1.0,
  iot: 0.85,
  devops: 0.8,
  management: 0.75,
  integration: 0.9,
  media: 0.9,
  migration: 0.8,
}

// Y-axis architectural layers (CDN top → Storage bottom)
export const CATEGORY_Y_LAYER: Record<NodeCategory, number> = {
  cdn: 8,
  management: 7,
  network: 5,
  devops: 4,
  security: 3,
  serverless: 2,
  iot: 1,
  compute: 0,
  container: 0,
  messaging: -1,
  integration: -2,
  analytics: -3,
  ml: -4,
  database: -5,
  media: -6,
  storage: -8,
  migration: -9,
}

// Scene
export const BG_COLOR = '#000008'
export const BG_COLOR_VEC3 = [0, 0, 8 / 255] as const
export const NODE_BASE_SIZE = 0.35
export const EDGE_OPACITY = 0.3
export const CROSS_CLOUD_EDGE_OPACITY = 0.55

// Force layout
export const FORCE_LINK_DISTANCE = 7
export const FORCE_CHARGE_STRENGTH = -35
export const FORCE_CENTER_STRENGTH = 0.04
export const PROVIDER_CLUSTER_STRENGTH = 0.25
export const Y_LAYER_STRENGTH = 0.15

// Animation
export const ENTRANCE_STAGGER_MS = 50
export const ENTRANCE_DURATION_MS = 1000
export const IDLE_ROTATION_SPEED = 0.06
export const PULSE_SPEED = 2.0
export const EDGE_FLOW_SPEED = 0.35

// Idle floating (subtle breathing motion after simulation settles)
export const IDLE_FLOAT_AMPLITUDE = 0.08
export const IDLE_FLOAT_SPEED = 0.25

// Hierarchy (parent-child clustering)
export const PARENT_CHILD_STRENGTH = 0.35

// Blast radius
export const BLAST_HOP_DELAY_MS = 350
export const BLAST_COLOR = '#ef4444'
/** Hot → cool gradient: epicenter is white-hot, outer hops shift toward amber */
export const BLAST_HOP_COLORS = [
  '#fff5f0', // 0 — epicenter, white-hot
  '#ff2e2e', // 1 — bright red
  '#ef4444', // 2 — red
  '#e85d3c', // 3 — red-orange
  '#f07a3a', // 4 — orange
  '#f59e0b', // 5 — amber
  '#eab308', // 6 — yellow (outermost)
] as const

// Camera fly-to
export const CAMERA_FLY_DURATION = 1.2

// Cost heat map
export const COST_HEAT_COLORS = {
  low: '#34a853',     // green, < $50/mo
  medium: '#fbbc04',  // yellow, $50-200/mo
  high: '#ea4335',    // red, > $200/mo
}

export const COST_THRESHOLDS = {
  low: 50,
  high: 200,
}
