export interface BundledEdge {
  sourceId: string
  targetId: string
  controlPoints: [number, number][]
  count: number // how many original edges were bundled
}

/**
 * Derive the cloud provider prefix from a node ID.
 *
 * Convention used in the mock data and scanner output:
 *   "aws-ec2-001"   -> "aws"
 *   "azure-vm-001"  -> "azure"
 *   "gcp-gce-001"   -> "gcp"
 *
 * Falls back to the full ID if no hyphen is found (should not happen in
 * practice but keeps the function total).
 */
function providerFromId(id: string): string {
  const idx = id.indexOf('-')
  return idx > 0 ? id.slice(0, idx) : id
}

/**
 * Compute the 2D centroid of a list of positions.
 */
function centroid(positions: [number, number][]): [number, number] {
  let sx = 0
  let sy = 0
  for (const [x, y] of positions) {
    sx += x
    sy += y
  }
  const n = positions.length
  return [sx / n, sy / n]
}

/**
 * Bundle edges that share similar source/target regions.
 *
 * Algorithm:
 *  1. Group edges by a composite key:
 *       (sourceCategory, targetCategory, sourceProvider, targetProvider)
 *     This ensures that edges connecting the same *kinds* of resources
 *     across the same provider pair are merged into a single thick arc.
 *
 *  2. For each group, compute the centroid of all source-node positions and
 *     the centroid of all target-node positions.
 *
 *  3. Emit a single BundledEdge whose `controlPoints` array contains three
 *     entries: the source centroid, a quadratic-bezier control point that
 *     bows the curve away from the straight line, and the target centroid.
 *     The bow direction is the perpendicular of the source->target vector,
 *     scaled by the bundle size so thicker bundles bow further (improving
 *     visual separation).
 *
 *  4. The `count` field equals the number of original edges in the group,
 *     which the renderer uses to set stroke width.
 *
 * Edges whose source or target has no known position are silently dropped.
 */
export function bundleEdges(
  edges: Array<{ source: string; target: string; type: string }>,
  nodePositions: Map<string, [number, number]>,
  nodeCategories: Map<string, string>,
): BundledEdge[] {
  // ---- Step 1: group by composite key ----

  interface GroupEntry {
    sourcePositions: [number, number][]
    targetPositions: [number, number][]
    sourceIds: string[]
    targetIds: string[]
    count: number
  }

  const groups = new Map<string, GroupEntry>()

  for (const edge of edges) {
    const srcPos = nodePositions.get(edge.source)
    const tgtPos = nodePositions.get(edge.target)
    if (!srcPos || !tgtPos) continue

    const srcCategory = nodeCategories.get(edge.source) ?? 'unknown'
    const tgtCategory = nodeCategories.get(edge.target) ?? 'unknown'
    const srcProvider = providerFromId(edge.source)
    const tgtProvider = providerFromId(edge.target)

    // Normalise the key so that (A->B) and (B->A) between the same
    // category/provider pair do NOT merge -- directionality matters for
    // data-flow visualizations.
    const key = `${srcCategory}:${tgtCategory}:${srcProvider}:${tgtProvider}`

    let group = groups.get(key)
    if (!group) {
      group = {
        sourcePositions: [],
        targetPositions: [],
        sourceIds: [],
        targetIds: [],
        count: 0,
      }
      groups.set(key, group)
    }

    group.sourcePositions.push(srcPos)
    group.targetPositions.push(tgtPos)
    group.sourceIds.push(edge.source)
    group.targetIds.push(edge.target)
    group.count++
  }

  // ---- Steps 2-4: emit bundled edges ----

  const result: BundledEdge[] = []

  // Base bow distance in world units. Multiplied by log(count) so that
  // larger bundles curve further outward without growing unboundedly.
  const BOW_BASE = 30

  for (const group of groups.values()) {
    const srcCentroid = centroid(group.sourcePositions)
    const tgtCentroid = centroid(group.targetPositions)

    // Direction vector from source centroid to target centroid
    const dx = tgtCentroid[0] - srcCentroid[0]
    const dy = tgtCentroid[1] - srcCentroid[1]
    const length = Math.sqrt(dx * dx + dy * dy)

    let controlPoint: [number, number]

    if (length < 1e-6) {
      // Source and target centroids coincide -- place control point
      // slightly offset so the curve is still visible as a small loop.
      controlPoint = [srcCentroid[0] + BOW_BASE, srcCentroid[1] + BOW_BASE]
    } else {
      // Perpendicular unit vector (rotated 90 degrees CCW)
      const px = -dy / length
      const py = dx / length

      // Scale the bow by bundle size (log scale to avoid extreme curves)
      const bowDistance = BOW_BASE * Math.log2(1 + group.count)

      // Midpoint of the straight line, then offset along the perpendicular
      const mx = (srcCentroid[0] + tgtCentroid[0]) / 2
      const my = (srcCentroid[1] + tgtCentroid[1]) / 2

      controlPoint = [mx + px * bowDistance, my + py * bowDistance]
    }

    // Pick representative IDs: first source and first target in the group.
    // This gives the renderer stable identifiers for hover/selection.
    const sourceId = group.sourceIds[0]
    const targetId = group.targetIds[0]

    result.push({
      sourceId,
      targetId,
      controlPoints: [srcCentroid, controlPoint, tgtCentroid],
      count: group.count,
    })
  }

  return result
}
