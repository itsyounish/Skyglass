// Force layout — maximum breathing room
export const FORCE_LINK_DISTANCE_2D = 450
export const FORCE_CHARGE_STRENGTH_2D = -2500
export const FORCE_CENTER_STRENGTH_2D = 0.008
export const PROVIDER_CLUSTER_STRENGTH_2D = 0.05
export const GROUP_CONTAINMENT_STRENGTH = 0.04
export const CATEGORY_LANE_STRENGTH = 0.015

// Provider centers (2D world-space)
export const PROVIDER_CENTERS_2D: Record<string, [number, number]> = {
  aws: [-1500, 0],
  azure: [1500, -800],
  gcp: [300, 1500],
}

// Category Y lanes (2D world-space)
export const CATEGORY_LANES: Record<string, number> = {
  cdn: -1200,
  network: -900,
  security: -600,
  serverless: -200,
  compute: 0,
  container: 100,
  messaging: 400,
  analytics: 700,
  database: 1000,
  storage: 1400,
}

// Node card dimensions (used by detail zoom)
export const CARD_WIDTH = 200
export const CARD_HEIGHT = 56
export const CARD_RADIUS = 8
export const CARD_BG = '#13131d'
export const CARD_BORDER = '#1e1e2e'
export const CARD_ACCENT_WIDTH = 3

// Semantic zoom thresholds
export const ZOOM_MACRO = 0.15
export const ZOOM_CLUSTER = 0.35
export const ZOOM_DETAIL = 1.8

// Animation
export const ENTRANCE_STAGGER = 30
export const ENTRANCE_DURATION = 600
export const CAMERA_FLY_DURATION = 600
export const CROSSFADE_DURATION = 200

// Canvas
export const BG_COLOR_2D = '#06060a'
export const VIGNETTE_STRENGTH = 0.25

// Edge flow
export const EDGE_PARTICLE_COUNT = 3
export const EDGE_PARTICLE_SPEED = 0.0004
export const EDGE_PARTICLE_SIZE = 2
