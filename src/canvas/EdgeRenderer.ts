import type { InfraEdge } from '../types'
import type { LayoutNode2D } from './types2d'
import type { Theme } from '../theme'
import { darkTheme } from '../theme'
import { EDGE_TYPE_COLORS, BLAST_HOP_DELAY_MS } from '../constants'
import { EDGE_PARTICLE_SPEED } from '../constants-2d'

const HOP_DELAY_SEC = BLAST_HOP_DELAY_MS / 1000

// ---------------------------------------------------------------------------
// Theme (mutable module-level ref, updated by Renderer2D)
// ---------------------------------------------------------------------------

let _theme: Theme = darkTheme

export function setEdgeRendererTheme(theme: Theme) { _theme = theme }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function quadBezier(t: number, p0: number, p1: number, p2: number): number {
  const inv = 1 - t
  return inv * inv * p0 + 2 * inv * t * p1 + t * t * p2
}

// ---------------------------------------------------------------------------
// Pre-rendered particle sprites (eliminates createRadialGradient per frame)
// ---------------------------------------------------------------------------

const _spriteCache = new Map<string, CanvasImageSource>()

function getParticleSprite(color: string, size: number): CanvasImageSource {
  const key = `${color}:${size}`
  let sprite = _spriteCache.get(key)
  if (sprite) return sprite

  const d = Math.ceil(size * 4)
  const offscreen = document.createElement('canvas')
  offscreen.width = d
  offscreen.height = d
  const octx = offscreen.getContext('2d')!
  const cx = d / 2
  const grad = octx.createRadialGradient(cx, cx, 0, cx, cx, cx)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  octx.fillStyle = grad
  octx.fillRect(0, 0, d, d)

  _spriteCache.set(key, offscreen)
  return offscreen
}

// Pre-build sprites for all edge type colors at common sizes
const PARTICLE_SIZES = [1.5, 2.5, 3.5] as const
for (const [, color] of Object.entries(EDGE_TYPE_COLORS)) {
  for (const s of PARTICLE_SIZES) {
    getParticleSprite(color, s)
  }
}
getParticleSprite('#ef4444', 3.5) // blast color
getParticleSprite('#2a2a3a', 1.5) // default edge color
getParticleSprite('#fff5f0', 4)   // cascade-packet core (white-hot)
getParticleSprite('#ff3e3e', 7)   // cascade-packet halo

// ---------------------------------------------------------------------------
// Edge drawing
// ---------------------------------------------------------------------------

export function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: InfraEdge,
  source: LayoutNode2D,
  target: LayoutNode2D,
  isFaded: boolean,
  isBlastPath: boolean,
  isHighlighted: boolean,
  time: number,
  blastHop: number = -1,
  blastDirectionForward: boolean = true,
  blastElapsed: number = 0,
  emitCascadePacket: boolean = false,
) {
  const isCrossCloud = edge.type === 'cross-cloud'

  const typeColor = EDGE_TYPE_COLORS[edge.type] || _theme.edgeDefaultColor
  const defaultColor = _theme.edgeDefaultColor
  // Brighter red at low hops, shifts toward orange/amber at the edge of the blast
  const blastColor = isBlastPath ? (blastHop <= 1 ? '#ff2e2e' : (blastHop <= 3 ? '#ef4444' : '#f59e0b')) : '#ef4444'
  const color = isBlastPath ? blastColor : (isHighlighted ? typeColor : defaultColor)

  // Orb edge offsets
  const r1 = 6 + source.importance * 1.8 + 2
  const r2 = 6 + target.importance * 1.8 + 2
  const dx = target.x - source.x
  const dy = target.y - source.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = dx / dist
  const ny = dy / dist
  const sx = source.x + nx * r1
  const sy = source.y + ny * r1
  const ex = target.x - nx * r2
  const ey = target.y - ny * r2

  // Bezier control point
  const mx = (sx + ex) / 2
  const my = (sy + ey) / 2
  const len = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2) || 1
  const perpX = -(ey - sy) / len
  const perpY = (ex - sx) / len
  const curveAmt = isCrossCloud ? len * 0.18 : len * 0.06
  const cpx = mx + perpX * curveAmt
  const cpy = my + perpY * curveAmt

  ctx.save()

  // Opacity/width
  let lineAlpha: number
  let lineWidth: number
  if (isFaded) {
    lineAlpha = 0.08
    lineWidth = 0.3
  } else if (isBlastPath) {
    lineAlpha = 1
    lineWidth = 3.5
  } else if (isHighlighted) {
    lineAlpha = 0.7
    lineWidth = isCrossCloud ? 1.5 : 1
  } else {
    lineAlpha = 0.5
    lineWidth = 0.4
  }

  ctx.globalAlpha = lineAlpha
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'

  if (isCrossCloud && !isBlastPath) {
    ctx.setLineDash([4, 3])
  }

  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.quadraticCurveTo(cpx, cpy, ex, ey)
  ctx.stroke()

  if (isCrossCloud && !isBlastPath) {
    ctx.setLineDash([])
  }

  // Glow on highlighted edges
  if (isHighlighted && !isFaded) {
    ctx.globalAlpha = lineAlpha * 0.3
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    ctx.stroke()
  }

  // Outer glow on blast edges (additive on dark, extra stroke on light)
  if (isBlastPath && !isFaded) {
    if (_theme.useGlowComposite) ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35
    ctx.strokeStyle = color
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    ctx.stroke()
    ctx.globalAlpha = 0.2
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(cpx, cpy, ex, ey)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'

    // Directional chevron — points in the direction the blast travels
    const arrowT = 0.58
    const ax = quadBezier(arrowT, sx, cpx, ex)
    const ay = quadBezier(arrowT, sy, cpy, ey)
    // Tangent at t
    const tx = 2 * (1 - arrowT) * (cpx - sx) + 2 * arrowT * (ex - cpx)
    const ty = 2 * (1 - arrowT) * (cpy - sy) + 2 * arrowT * (ey - cpy)
    const tLen = Math.sqrt(tx * tx + ty * ty) || 1
    const dirX = (tx / tLen) * (blastDirectionForward ? 1 : -1)
    const dirY = (ty / tLen) * (blastDirectionForward ? 1 : -1)
    const size = 7
    const nxp = -dirY
    const nyp = dirX
    ctx.globalAlpha = 0.95
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(ax + dirX * size, ay + dirY * size)
    ctx.lineTo(ax - dirX * size * 0.4 + nxp * size * 0.7, ay - dirY * size * 0.4 + nyp * size * 0.7)
    ctx.lineTo(ax - dirX * size * 0.4 - nxp * size * 0.7, ay - dirY * size * 0.4 - nyp * size * 0.7)
    ctx.closePath()
    ctx.fill()

    // ── Cascade packet: bright pulse that travels this edge exactly once,
    // when the blast crosses it. Emitted between hop-1 and hop, in the
    // direction of propagation. Only on BFS-tree edges — lateral/redundant
    // edges between already-affected nodes get the red styling but no packet.
    if (emitCascadePacket && blastHop >= 1) {
      const packetStart = (blastHop - 1) * HOP_DELAY_SEC
      const packetDuration = HOP_DELAY_SEC
      const packetAge = blastElapsed - packetStart
      if (packetAge >= 0 && packetAge < packetDuration) {
        const rawT = packetAge / packetDuration
        const t = blastDirectionForward ? rawT : 1 - rawT
        const pxp = quadBezier(t, sx, cpx, ex)
        const pyp = quadBezier(t, sy, cpy, ey)
        // Bright white-hot core
        if (_theme.useGlowComposite) ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.95 * (1 - rawT * 0.3)
        const coreSprite = getParticleSprite('#fff5f0', 4)
        const coreD = Math.ceil(4 * 4)
        ctx.drawImage(coreSprite, pxp - coreD / 2, pyp - coreD / 2, coreD, coreD)
        // Red halo
        ctx.globalAlpha = 0.85 * (1 - rawT * 0.3)
        const haloSprite = getParticleSprite('#ff3e3e', 7)
        const haloD = Math.ceil(7 * 4)
        ctx.drawImage(haloSprite, pxp - haloD / 2, pyp - haloD / 2, haloD, haloD)
        ctx.globalCompositeOperation = 'source-over'
      }
    }
  }

  // Flow particles — using pre-rendered sprites instead of per-frame gradients
  if (!isFaded) {
    const count = isBlastPath ? 8 : (isHighlighted ? 3 : 1)
    const speedMult = isBlastPath
      ? 3
      : (edge.type === 'data' ? 1.5 : (edge.type === 'network' ? 1.2 : 0.8))
    const speed = EDGE_PARTICLE_SPEED * speedMult

    const pSize = isBlastPath ? 3.5 : (isHighlighted ? 2.5 : 1.5)
    const pAlpha = isBlastPath ? 0.85 : (isHighlighted ? 0.35 : 0.12)
    const pColor = isHighlighted || isBlastPath ? color : (EDGE_TYPE_COLORS[edge.type] || _theme.edgeDefaultColor)
    const sprite = getParticleSprite(pColor, pSize)
    const spriteD = Math.ceil(pSize * 4)
    const halfD = spriteD / 2

    if (_theme.useGlowComposite) {
      ctx.globalCompositeOperation = 'lighter'
    }
    ctx.globalAlpha = _theme.useGlowComposite ? pAlpha : pAlpha * 2

    for (let i = 0; i < count; i++) {
      const t = ((time * speed + i / count) % 1)
      const px = quadBezier(t, sx, cpx, ex)
      const py = quadBezier(t, sy, cpy, ey)
      ctx.drawImage(sprite, px - halfD, py - halfD, spriteD, spriteD)
    }

    ctx.globalCompositeOperation = 'source-over'
  }

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Edge label (detail zoom)
// ---------------------------------------------------------------------------

export function drawEdgeLabel(
  ctx: CanvasRenderingContext2D,
  edge: InfraEdge,
  source: LayoutNode2D,
  target: LayoutNode2D,
  isFaded: boolean,
) {
  if (isFaded || !edge.label) return
  const mx = (source.x + target.x) / 2
  const my = (source.y + target.y) / 2

  ctx.save()
  ctx.font = '7px "IBM Plex Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const tw = ctx.measureText(edge.label).width + 8

  ctx.globalAlpha = 0.5
  ctx.fillStyle = _theme.panelBg
  ctx.beginPath()
  ctx.roundRect(mx - tw / 2, my - 7, tw, 14, 7)
  ctx.fill()

  ctx.globalAlpha = 0.45
  ctx.fillStyle = _theme.textTertiary
  ctx.fillText(edge.label, mx, my)
  ctx.restore()
}
