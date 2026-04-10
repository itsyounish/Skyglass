import type { LayoutNode2D, GroupHull, CategoryPill } from './types2d'
import type { Provider, NodeCategory } from '../types'
import type { Theme } from '../theme'
import { darkTheme } from '../theme'
import { PROVIDER_COLORS } from '../constants'
import { convexHull } from '../utils/convexHull'
import { smoothClosedCurve } from '../utils/catmullRom'

// ---------------------------------------------------------------------------
// Theme (mutable module-level ref, updated by Renderer2D)
// ---------------------------------------------------------------------------

let _theme: Theme = darkTheme

export function setGroupRendererTheme(theme: Theme) { _theme = theme }

// ---------------------------------------------------------------------------
// Compute group hulls from layout nodes
// ---------------------------------------------------------------------------

export function computeProviderHulls(nodes: LayoutNode2D[]): GroupHull[] {
  // Group by provider + region
  const groups = new Map<string, LayoutNode2D[]>()
  for (const node of nodes) {
    const key = `${node.provider}:${node.region}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(node)
  }

  const hulls: GroupHull[] = []
  for (const [key, groupNodes] of groups) {
    if (groupNodes.length < 2) continue
    const [provider, region] = key.split(':') as [Provider, string]

    const points: [number, number][] = groupNodes.map(n => [n.x, n.y])

    // Add padding around each point
    const pad = 60
    const expanded: [number, number][] = []
    for (const [px, py] of points) {
      expanded.push([px - pad, py - pad])
      expanded.push([px + pad, py - pad])
      expanded.push([px + pad, py + pad])
      expanded.push([px - pad, py + pad])
    }

    const hull = convexHull(expanded)
    if (hull.length < 3) continue

    const smooth = smoothClosedCurve(hull, 6, 0)

    // Centroid
    let cx = 0, cy = 0
    for (const n of groupNodes) { cx += n.x; cy += n.y }
    cx /= groupNodes.length
    cy /= groupNodes.length

    hulls.push({
      id: key,
      label: `${provider.toUpperCase()} ${region}`,
      provider,
      points: hull,
      smooth,
      centroid: [cx, cy],
      nodeCount: groupNodes.length,
    })
  }

  return hulls
}

export function computeVpcHulls(nodes: LayoutNode2D[]): GroupHull[] {
  // Group by parent (VPC/VNet)
  const groups = new Map<string, LayoutNode2D[]>()
  for (const node of nodes) {
    if (!node.parent) continue
    if (!groups.has(node.parent)) groups.set(node.parent, [])
    groups.get(node.parent)!.push(node)
  }

  const hulls: GroupHull[] = []
  for (const [parentId, groupNodes] of groups) {
    if (groupNodes.length < 2) continue

    const points: [number, number][] = groupNodes.map(n => [n.x, n.y])
    const pad = 40
    const expanded: [number, number][] = []
    for (const [px, py] of points) {
      expanded.push([px - pad, py - pad])
      expanded.push([px + pad, py - pad])
      expanded.push([px + pad, py + pad])
      expanded.push([px - pad, py + pad])
    }

    const hull = convexHull(expanded)
    if (hull.length < 3) continue
    const smooth = smoothClosedCurve(hull, 6, 0)

    let cx = 0, cy = 0
    for (const n of groupNodes) { cx += n.x; cy += n.y }
    cx /= groupNodes.length
    cy /= groupNodes.length

    hulls.push({
      id: parentId,
      label: parentId.replace(/^(aws-|az-|gcp-)/, ''),
      provider: groupNodes[0].provider,
      points: hull,
      smooth,
      centroid: [cx, cy],
      nodeCount: groupNodes.length,
    })
  }

  return hulls
}

// ---------------------------------------------------------------------------
// Draw group hulls
// ---------------------------------------------------------------------------

export function drawProviderHull(
  ctx: CanvasRenderingContext2D,
  hull: GroupHull,
  opacity: number,
) {
  const colors = PROVIDER_COLORS[hull.provider]
  const pts = hull.smooth.length > 0 ? hull.smooth : hull.points
  if (pts.length < 3) return

  const m = _theme.hullAlphaMultiplier

  ctx.save()
  ctx.globalAlpha = opacity

  // Fill
  ctx.fillStyle = colors.primary
  ctx.globalAlpha = opacity * 0.04 * m
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0], pts[i][1])
  }
  ctx.closePath()
  ctx.fill()

  // Stroke
  ctx.globalAlpha = opacity * 0.12 * m
  ctx.strokeStyle = colors.primary
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0], pts[i][1])
  }
  ctx.closePath()
  ctx.stroke()

  // Label
  ctx.globalAlpha = opacity * 0.5
  ctx.fillStyle = colors.dim
  ctx.font = '10px "IBM Plex Mono", monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.letterSpacing = '2px'
  const labelText = hull.label.toUpperCase()
  // Position at top-left of hull
  let minX = Infinity, minY = Infinity
  for (const [px, py] of pts) {
    if (py < minY || (py === minY && px < minX)) { minX = px; minY = py }
  }
  ctx.fillText(labelText, minX + 8, minY + 6)
  ctx.letterSpacing = '0px'

  ctx.restore()
}

export function drawVpcHull(
  ctx: CanvasRenderingContext2D,
  hull: GroupHull,
  opacity: number,
) {
  const colors = PROVIDER_COLORS[hull.provider]
  const pts = hull.smooth.length > 0 ? hull.smooth : hull.points
  if (pts.length < 3) return

  const m = _theme.hullAlphaMultiplier

  ctx.save()

  // Fill
  ctx.fillStyle = colors.primary
  ctx.globalAlpha = opacity * 0.025 * m
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0], pts[i][1])
  }
  ctx.closePath()
  ctx.fill()

  // Dashed stroke
  ctx.globalAlpha = opacity * 0.08 * m
  ctx.strokeStyle = colors[_theme.providerColorKey]
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0], pts[i][1])
  }
  ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])

  // VPC label
  ctx.globalAlpha = opacity * 0.35
  ctx.fillStyle = _theme.textTertiary
  ctx.font = '9px "IBM Plex Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(hull.label, hull.centroid[0], hull.centroid[1] - hull.nodeCount * 12)

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Category pills (cluster zoom tier)
// ---------------------------------------------------------------------------

export function computeCategoryPills(nodes: LayoutNode2D[]): CategoryPill[] {
  const groups = new Map<string, LayoutNode2D[]>()
  for (const node of nodes) {
    const key = `${node.provider}:${node.category}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(node)
  }

  const pills: CategoryPill[] = []
  for (const [key, groupNodes] of groups) {
    const [provider, category] = key.split(':') as [Provider, NodeCategory]
    let cx = 0, cy = 0
    let healthy = 0, warning = 0, error = 0
    for (const n of groupNodes) {
      cx += n.x; cy += n.y
      if (n.status === 'healthy') healthy++
      else if (n.status === 'warning') warning++
      else error++
    }
    cx /= groupNodes.length
    cy /= groupNodes.length

    pills.push({
      category,
      provider,
      centroid: [cx, cy],
      count: groupNodes.length,
      healthySummary: { healthy, warning, error },
    })
  }

  return pills
}

export function drawCategoryPill(
  ctx: CanvasRenderingContext2D,
  pill: CategoryPill,
  opacity: number,
) {
  const colors = PROVIDER_COLORS[pill.provider]
  const text = `${pill.category} (${pill.count})`
  ctx.save()
  ctx.font = '11px "IBM Plex Mono", monospace'
  const tw = ctx.measureText(text).width + 24
  const h = 28
  const x = pill.centroid[0] - tw / 2
  const y = pill.centroid[1] - h / 2

  ctx.globalAlpha = opacity

  // Background
  ctx.fillStyle = _theme.groupPillBg
  ctx.beginPath()
  ctx.roundRect(x, y, tw, h, 14)
  ctx.fill()

  // Border
  ctx.strokeStyle = colors.primary
  ctx.globalAlpha = opacity * 0.4
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x, y, tw, h, 14)
  ctx.stroke()

  // Text
  ctx.globalAlpha = opacity * 0.8
  ctx.fillStyle = _theme.groupPillText
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, pill.centroid[0], pill.centroid[1])

  // Status dots
  const dotX = x + tw - 8
  const { healthy, warning, error } = pill.healthySummary
  if (error > 0) {
    ctx.fillStyle = '#ea4335'
    ctx.globalAlpha = opacity * 0.8
    ctx.beginPath()
    ctx.arc(dotX, pill.centroid[1], 3, 0, Math.PI * 2)
    ctx.fill()
  } else if (warning > 0) {
    ctx.fillStyle = _theme.warningColor
    ctx.globalAlpha = opacity * 0.6
    ctx.beginPath()
    ctx.arc(dotX, pill.centroid[1], 3, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Macro view: provider blobs
// ---------------------------------------------------------------------------

export function drawProviderBlob(
  ctx: CanvasRenderingContext2D,
  provider: Provider,
  centroid: [number, number],
  radius: number,
  nodeCount: number,
  totalCost: string | null,
  opacity: number,
) {
  const colors = PROVIDER_COLORS[provider]

  ctx.save()
  ctx.globalAlpha = opacity

  // Soft radial gradient
  const grad = ctx.createRadialGradient(
    centroid[0], centroid[1], 0,
    centroid[0], centroid[1], radius,
  )
  grad.addColorStop(0, colors.primary + '18')
  grad.addColorStop(0.7, colors.primary + '08')
  grad.addColorStop(1, 'transparent')

  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(centroid[0], centroid[1], radius, 0, Math.PI * 2)
  ctx.fill()

  // Label
  ctx.fillStyle = colors[_theme.providerColorKey]
  ctx.globalAlpha = opacity * 0.8
  ctx.font = 'bold 14px "IBM Plex Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(provider.toUpperCase(), centroid[0], centroid[1] - 12)

  ctx.font = '11px "IBM Plex Mono", monospace'
  ctx.globalAlpha = opacity * 0.5
  ctx.fillStyle = _theme.textTertiary
  ctx.fillText(`${nodeCount} resources`, centroid[0], centroid[1] + 8)

  if (totalCost) {
    ctx.fillStyle = _theme.costColor
    ctx.fillText(totalCost, centroid[0], centroid[1] + 24)
  }

  ctx.restore()
}
