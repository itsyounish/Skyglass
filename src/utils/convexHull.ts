/**
 * Compute the convex hull of a set of 2D points.
 * Returns points in counter-clockwise order.
 * Uses Andrew's monotone chain algorithm -- O(n log n).
 *
 * Edge cases:
 *  - 0 points -> empty array
 *  - 1 point  -> that single point
 *  - 2 points -> both points (degenerate hull)
 *  - Collinear points -> the two extreme endpoints
 */
export function convexHull(points: [number, number][]): [number, number][] {
  const n = points.length
  if (n <= 1) return points.slice()
  if (n === 2) {
    // Return both; avoid duplicates if they are the same point
    if (points[0][0] === points[1][0] && points[0][1] === points[1][1]) {
      return [points[0]]
    }
    return points.slice()
  }

  // Sort by x, then by y (lexicographic)
  const sorted = points
    .slice()
    .sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]))

  // Cross product of vectors OA and OB where O is origin, A and B are points.
  // Positive => counter-clockwise turn, negative => clockwise, zero => collinear.
  function cross(
    o: [number, number],
    a: [number, number],
    b: [number, number],
  ): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  }

  // Build lower hull
  const lower: [number, number][] = []
  for (let i = 0; i < sorted.length; i++) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0
    ) {
      lower.pop()
    }
    lower.push(sorted[i])
  }

  // Build upper hull
  const upper: [number, number][] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0
    ) {
      upper.pop()
    }
    upper.push(sorted[i])
  }

  // Remove the last point of each half because it is repeated at the
  // beginning of the other half.
  lower.pop()
  upper.pop()

  const hull = lower.concat(upper)

  // Deduplicate in case all points are collinear (hull collapses to a segment)
  if (hull.length >= 2) {
    const deduplicated: [number, number][] = [hull[0]]
    for (let i = 1; i < hull.length; i++) {
      const prev = deduplicated[deduplicated.length - 1]
      if (hull[i][0] !== prev[0] || hull[i][1] !== prev[1]) {
        deduplicated.push(hull[i])
      }
    }
    return deduplicated
  }

  return hull
}
