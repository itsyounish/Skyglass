/**
 * Generate a smooth closed curve from control points using Catmull-Rom
 * spline interpolation.
 *
 * The standard Catmull-Rom basis matrix (with tension parameter `s`) is:
 *
 *   M = | 0    1    0      0   |
 *       | -s   0    s      0   |
 *       | 2s   s-3  3-2s  -s   |
 *       | -s   2-s  s-2    s   |
 *
 * where s = (1 - tension) / 2. At tension=0 this gives classic Catmull-Rom;
 * at tension=1 it collapses to linear interpolation.
 *
 * For a closed curve, the control point sequence wraps around so that the
 * segment between points[i] and points[i+1] uses points[i-1] as P0 and
 * points[i+2] as P3 (all indices modulo N).
 *
 * @param points          - Control points forming a closed polygon
 * @param segmentsPerEdge - Interpolated segments between each pair of
 *                          control points (default: 8)
 * @param tension         - 0 = Catmull-Rom, 1 = straight lines (default: 0)
 * @returns Interpolated points forming a smooth closed curve. The last point
 *          coincides with the first so the caller can stroke the path directly.
 */
export function smoothClosedCurve(
  points: [number, number][],
  segmentsPerEdge: number = 8,
  tension: number = 0,
): [number, number][] {
  const n = points.length
  if (n === 0) return []
  if (n === 1) return [points[0]]
  if (n === 2) {
    // With only two points we cannot form a meaningful spline -- return a
    // straight-line loop through both.
    return [points[0], points[1], points[0]]
  }

  const s = (1 - tension) / 2
  const result: [number, number][] = []

  for (let i = 0; i < n; i++) {
    // Four control points for this segment, wrapping around for closure
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]

    for (let j = 0; j < segmentsPerEdge; j++) {
      const t = j / segmentsPerEdge
      const t2 = t * t
      const t3 = t2 * t

      // Catmull-Rom basis functions evaluated at parameter t
      const b0 = -s * t3 + 2 * s * t2 - s * t
      const b1 = (2 - s) * t3 + (s - 3) * t2 + 1
      const b2 = (s - 2) * t3 + (3 - 2 * s) * t2 + s * t
      const b3 = s * t3 - s * t2

      const x = b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0]
      const y = b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]

      result.push([x, y])
    }
  }

  // Close the curve by appending the first point
  result.push(result[0])

  return result
}
