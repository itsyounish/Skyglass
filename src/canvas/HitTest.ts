import type { LayoutNode2D } from './types2d'

// Minimum hit radius in screen pixels. At low zoom (macro/cluster tiers) the
// world-space orb is a few pixels across — without this floor, targeting is
// near-impossible. 14px ≈ a comfortable tap target.
const MIN_SCREEN_HIT_PX = 14

/**
 * Return the node whose orb is closest to (worldX, worldY), within a generous
 * hit radius. Picks the closest — not the last-drawn — so overlapping orbs
 * hand the click to the orb the user was actually aiming at.
 *
 * The hit radius is max(visual radius, MIN_SCREEN_HIT_PX / zoom) so clicks
 * stay easy even when zoomed far out.
 */
export function hitTestNodes(
  worldX: number,
  worldY: number,
  nodes: LayoutNode2D[],
  zoom: number = 1,
): string | null {
  const minWorldR = MIN_SCREEN_HIT_PX / Math.max(zoom, 0.0001)

  let bestId: string | null = null
  let bestDistSq = Infinity

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    const visualR = (6 + node.importance * 1.8) * 1.5
    const hitR = Math.max(visualR, minWorldR)
    const dx = worldX - node.x
    const dy = worldY - node.y
    const distSq = dx * dx + dy * dy
    if (distSq <= hitR * hitR && distSq < bestDistSq) {
      bestDistSq = distSq
      bestId = node.id
    }
  }

  return bestId
}
