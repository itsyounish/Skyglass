import type { LayoutNode2D } from './types2d'

/**
 * Check if a world-space point is inside a node orb.
 * Orbs are circles centered on the node position with radius based on importance.
 * Generous hit area (1.5x visual radius) for easy interaction.
 */
export function hitTestNodes(
  worldX: number,
  worldY: number,
  nodes: LayoutNode2D[],
): string | null {
  // Reverse iteration: last-drawn nodes are on top visually
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    const orbR = (6 + node.importance * 1.8) * 1.5 // generous hit area
    const dx = worldX - node.x
    const dy = worldY - node.y
    if (dx * dx + dy * dy <= orbR * orbR) {
      return node.id
    }
  }

  return null
}
