import type { LayoutNode2D } from './types2d'
import type { Theme } from '../theme'
import { darkTheme } from '../theme'
import { PROVIDER_COLORS } from '../constants'
import { drawServiceLogo } from './ServiceLogos'

// ---------------------------------------------------------------------------
// Theme (mutable module-level ref, updated by Renderer2D)
// ---------------------------------------------------------------------------

let _theme: Theme = darkTheme

export function setNodeRendererTheme(theme: Theme) { _theme = theme }

// ---------------------------------------------------------------------------
// Color utilities (GitNexus-style dimming — blend toward bg, not opacity)
// ---------------------------------------------------------------------------

function getBgRgb() { return _theme.canvasBgRgb }

function hexToRgb(hex: string) {
  const v = parseInt(hex.slice(1), 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

export function dimColor(hex: string, amount: number): string {
  const bg = getBgRgb()
  const c = hexToRgb(hex)
  return rgbToHex(
    bg.r + (c.r - bg.r) * amount,
    bg.g + (c.g - bg.g) * amount,
    bg.b + (c.b - bg.b) * amount,
  )
}

// ---------------------------------------------------------------------------
// Node — clean circles. Size = importance. Color = provider.
// ---------------------------------------------------------------------------

export function drawNodeOrb(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode2D,
  isSelected: boolean,
  isHovered: boolean,
  isFaded: boolean,
  isConnected: boolean,
  opacity: number,
  time: number,
) {
  const colors = PROVIDER_COLORS[node.provider]

  // Size: importance drives radius. Bigger = more important.
  const baseSize = 6 + node.importance * 1.8
  const sizeMult = isSelected ? 1.6 : (isHovered ? 1.4 : (isConnected ? 1.2 : (isFaded ? 0.7 : 1)))
  const r = baseSize * sizeMult

  // Color: full or dimmed toward background
  const nodeColor = isFaded ? dimColor(colors.primary, 0.2) : colors.primary

  ctx.save()
  ctx.globalAlpha = opacity

  // ── Drop shadow (light mode: adds depth against pale background) ──
  if (_theme.nodeDropShadow && !isFaded) {
    ctx.shadowColor = 'rgba(0, 0, 30, 0.15)'
    ctx.shadowBlur = r * 0.8
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = r * 0.15
  }

  // ── Circle background (so logo has contrast) ──────────────────────
  ctx.fillStyle = isFaded ? _theme.nodeCircleBgFaded : _theme.nodeCircleBg
  ctx.beginPath()
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
  ctx.fill()

  // Reset shadow before stroke (avoids double shadow)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0

  // ── Colored ring border ───────────────────────────────────────────
  ctx.strokeStyle = nodeColor
  ctx.lineWidth = isFaded ? 0.5 : (isHovered || isSelected ? 2.5 : 1.5)
  ctx.beginPath()
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
  ctx.stroke()

  // ── Service logo inside the circle ────────────────────────────────
  if (!isFaded) {
    const logoSize = r * 1.2
    const drawn = drawServiceLogo(ctx, node.provider, node.type, node.x, node.y, logoSize)
    if (!drawn) {
      // Fallback: provider initial letter
      ctx.fillStyle = nodeColor
      ctx.font = `bold ${Math.max(8, r * 0.8)}px "IBM Plex Mono", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(node.type.slice(0, 2).toUpperCase(), node.x, node.y)
    }
  }

  // ── Hover: glow ring ──────────────────────────────────────────────
  if (isHovered && !isFaded) {
    const ringColor = colors[_theme.providerColorKey]
    ctx.strokeStyle = ringColor
    ctx.lineWidth = 2
    ctx.globalAlpha = opacity * (_theme.useGlowComposite ? 0.4 : 0.55)
    ctx.beginPath()
    ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = opacity
  }

  // ── Selected: bright ring ─────────────────────────────────────────
  if (isSelected) {
    ctx.strokeStyle = colors[_theme.providerColorKey]
    ctx.lineWidth = 2.5
    ctx.globalAlpha = opacity * 0.6
    ctx.beginPath()
    ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = opacity
  }

  // ── Error: subtle red pulse ring ──────────────────────────────────
  if (node.status === 'error' && !isFaded) {
    const p = (Math.sin(time * 4) + 1) * 0.5
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 1.5
    ctx.globalAlpha = opacity * (0.2 + p * 0.3)
    ctx.beginPath()
    ctx.arc(node.x, node.y, r + 2 + p * 3, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = opacity
  }

  // ── Warning: tiny amber dot ───────────────────────────────────────
  if (node.status === 'warning' && !isFaded) {
    ctx.fillStyle = _theme.warningColor
    ctx.beginPath()
    ctx.arc(node.x + r * 0.65, node.y - r * 0.65, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // ── Label: only for important/active nodes ────────────────────────
  // GitNexus: labelRenderedSizeThreshold = 8 → only big nodes get labels
  const showLabel = !isFaded && (isHovered || isSelected || (r >= 8 && !isFaded))
  if (showLabel) {
    ctx.globalAlpha = opacity * (isHovered || isSelected ? 0.9 : 0.4)
    ctx.fillStyle = _theme.textPrimary
    ctx.font = '9px "IBM Plex Mono", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const label = node.label.length > 18 ? node.label.slice(0, 17) + '\u2026' : node.label
    ctx.fillText(label, node.x, node.y + r + 5)
  }

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Hover tooltip — dark pill ABOVE the node (GitNexus style)
// ---------------------------------------------------------------------------

export function drawHoverTooltip(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode2D,
  opacity: number,
) {
  const colors = PROVIDER_COLORS[node.provider]
  const nodeSize = 6 + node.importance * 1.8
  const r = nodeSize * 1.4

  const label = node.label
  const subtitle = `${node.type} · ${node.region}`
  const cost = node.metadata?.cost

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.font = '500 11px "IBM Plex Mono", monospace'

  // Measure text
  const labelW = ctx.measureText(label).width
  ctx.font = '9px "IBM Plex Mono", monospace'
  const subtitleW = ctx.measureText(subtitle).width
  const costW = cost ? ctx.measureText(cost).width + 12 : 0
  const maxW = Math.max(labelW, subtitleW + costW) + 20
  const h = cost ? 52 : 40
  const px = node.x - maxW / 2
  const py = node.y - r - 14 - h
  const rr = 6

  // Background pill
  ctx.fillStyle = _theme.groupPillBg
  ctx.beginPath()
  ctx.roundRect(px, py, maxW, h, rr)
  ctx.fill()

  // Colored border (matches node color)
  ctx.strokeStyle = colors.primary
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(px, py, maxW, h, rr)
  ctx.stroke()

  // Label
  ctx.fillStyle = _theme.textPrimary
  ctx.font = '500 11px "IBM Plex Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(label.length > 28 ? label.slice(0, 27) + '\u2026' : label, node.x, py + 8)

  // Subtitle
  ctx.fillStyle = _theme.textTertiary
  ctx.font = '9px "IBM Plex Mono", monospace'
  ctx.fillText(subtitle, node.x, py + 24)

  // Cost
  if (cost) {
    ctx.fillStyle = _theme.costColorMuted
    ctx.fillText(cost, node.x, py + 37)
  }

  // Small arrow pointing down to node
  ctx.fillStyle = _theme.groupPillBg
  ctx.beginPath()
  ctx.moveTo(node.x - 5, py + h)
  ctx.lineTo(node.x + 5, py + h)
  ctx.lineTo(node.x, py + h + 5)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = colors.primary
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(node.x - 5, py + h)
  ctx.lineTo(node.x, py + h + 5)
  ctx.lineTo(node.x + 5, py + h)
  ctx.stroke()

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Macro dot (zoomed out)
// ---------------------------------------------------------------------------

export function drawNodeDot(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode2D,
  opacity: number,
) {
  const colors = PROVIDER_COLORS[node.provider]
  const r = 1.5 + node.importance * 0.5
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = colors.primary
  ctx.beginPath()
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Detail view (deep zoom) — orb + metadata below
// ---------------------------------------------------------------------------

export function drawNodeCardDetail(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode2D,
  isSelected: boolean,
  isHovered: boolean,
  isFaded: boolean,
  opacity: number,
  time: number,
) {
  drawNodeOrb(ctx, node, isSelected, isHovered, isFaded, true, opacity, time)
  if (isFaded) return

  const orbR = 6 + node.importance * 1.8
  ctx.save()
  ctx.globalAlpha = opacity * 0.6
  ctx.fillStyle = _theme.textTertiary
  ctx.font = '8px "IBM Plex Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`${node.type} · ${node.region}`, node.x, node.y + orbR + 16)
  const cost = node.metadata?.cost
  if (cost) {
    ctx.fillStyle = _theme.costColorMuted
    ctx.fillText(cost, node.x, node.y + orbR + 28)
  }
  ctx.restore()
}
