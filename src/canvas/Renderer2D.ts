import type { InfraGraph, InfraEdge, Provider } from '../types'
import type { LayoutNode2D, ZoomTier, GroupHull, CategoryPill } from './types2d'
import type { Theme } from '../theme'
import { darkTheme } from '../theme'
import { Camera2D } from './Camera2D'
import { hitTestNodes } from './HitTest'
import { drawNodeOrb, drawHoverTooltip, drawNodeDot, drawNodeCardDetail, setNodeRendererTheme } from './NodeRenderer'
import { drawEdge, drawEdgeLabel, setEdgeRendererTheme } from './EdgeRenderer'
import {
  computeProviderHulls, computeVpcHulls, drawProviderHull, drawVpcHull,
  computeCategoryPills, drawCategoryPill, drawProviderBlob, setGroupRendererTheme,
} from './GroupRenderer'
import { PROVIDER_COLORS } from '../constants'
import {
  ZOOM_MACRO, ZOOM_CLUSTER, ZOOM_DETAIL,
} from '../constants-2d'

// ---------------------------------------------------------------------------
// Zoom tier
// ---------------------------------------------------------------------------

function getZoomTier(zoom: number): ZoomTier {
  if (zoom < ZOOM_MACRO) return 'macro'
  if (zoom < ZOOM_CLUSTER) return 'cluster'
  if (zoom < ZOOM_DETAIL) return 'node'
  return 'detail'
}

// ---------------------------------------------------------------------------
// Renderer2D
// ---------------------------------------------------------------------------

export class Renderer2D {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  camera: Camera2D
  width = 0
  height = 0
  dpr = 1

  // Data
  nodes: LayoutNode2D[] = []
  edges: InfraEdge[] = []
  nodeMap = new Map<string, LayoutNode2D>()

  // Pre-computed groups
  providerHulls: GroupHull[] = []
  vpcHulls: GroupHull[] = []
  categoryPills: CategoryPill[] = []
  providerCentroids = new Map<Provider, { centroid: [number, number]; radius: number; count: number }>()

  // Interaction state
  selectedNodeId: string | null = null
  hoveredNodeId: string | null = null
  connectedIds: Set<string> | null = null
  blastAffectedNodes = new Set<string>()
  blastAffectedEdges = new Set<string>()
  blastNodeHops = new Map<string, number>()
  blastEdgeHops = new Map<string, number>()
  blastBfsEdges = new Set<string>()
  blastMode = false
  blastSourceId: string | null = null
  private blastStartTime = 0
  searchMatchIds: Set<string> | null = null

  // Callbacks
  onSelect: ((id: string | null) => void) | null = null
  onHover: ((id: string | null) => void) | null = null

  // Adjacency
  private adjacency = new Map<string, Set<string>>()

  // Animation
  private frameId = 0
  private startTime = 0
  private prevTier: ZoomTier = 'node'
  private tierTransition = 1
  private tierTransitionStart = 0

  // Entrance
  private entranceProgress = 0
  private entranceDone = false

  // Cached overlays (regenerated on resize only)
  private _vignetteCanvas: HTMLCanvasElement | null = null
  private _bgCanvas: HTMLCanvasElement | null = null
  private _cachedW = 0
  private _cachedH = 0

  // Dirty tracking
  private _dirty = true
  private _hasAnimations = false // true during entrance or while edges animate

  // Theme
  private _theme: Theme = darkTheme

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.camera = new Camera2D()
    this.dpr = window.devicePixelRatio || 1
    this.resize()
  }

  setTheme(theme: Theme) {
    if (this._theme.name === theme.name) return
    this._theme = theme
    setNodeRendererTheme(theme)
    setEdgeRendererTheme(theme)
    setGroupRendererTheme(theme)
    // Force overlay rebuild
    this._cachedW = 0
    this._cachedH = 0
    this._dirty = true
  }

  /** External code can mark the renderer dirty after changing interaction state. */
  markDirty(): void {
    this._dirty = true
  }

  /** Update the blast source; resets the shockwave animation clock when it changes. */
  setBlastSource(id: string | null) {
    if (this.blastSourceId !== id) {
      this.blastSourceId = id
      this.blastStartTime = performance.now() / 1000
    }
  }

  // ---------------------------------------------------------------------------
  // Data updates
  // ---------------------------------------------------------------------------

  setGraph(graph: InfraGraph, layoutNodes: LayoutNode2D[]) {
    this.nodes = layoutNodes
    this.edges = graph.edges
    this.nodeMap.clear()
    for (const n of layoutNodes) this.nodeMap.set(n.id, n)

    this.adjacency.clear()
    for (const e of graph.edges) {
      if (!this.adjacency.has(e.source)) this.adjacency.set(e.source, new Set())
      if (!this.adjacency.has(e.target)) this.adjacency.set(e.target, new Set())
      this.adjacency.get(e.source)!.add(e.target)
      this.adjacency.get(e.target)!.add(e.source)
    }

    this.providerHulls = computeProviderHulls(layoutNodes)
    this.vpcHulls = computeVpcHulls(layoutNodes)
    this.categoryPills = computeCategoryPills(layoutNodes)
    this.computeProviderCentroids()

    this.entranceProgress = 0
    this.entranceDone = false
    this._hasAnimations = true
    this.startTime = performance.now() / 1000
    this._dirty = true
  }

  updatePositions(layoutNodes: LayoutNode2D[]) {
    this.nodes = layoutNodes
    this.nodeMap.clear()
    for (const n of layoutNodes) this.nodeMap.set(n.id, n)

    this.providerHulls = computeProviderHulls(layoutNodes)
    this.vpcHulls = computeVpcHulls(layoutNodes)
    this.categoryPills = computeCategoryPills(layoutNodes)
    this.computeProviderCentroids()
    this._dirty = true
  }

  private computeProviderCentroids() {
    const groups = new Map<Provider, LayoutNode2D[]>()
    for (const n of this.nodes) {
      if (!groups.has(n.provider)) groups.set(n.provider, [])
      groups.get(n.provider)!.push(n)
    }
    this.providerCentroids.clear()
    for (const [provider, nodes] of groups) {
      let cx = 0, cy = 0, maxDist = 0
      for (const n of nodes) { cx += n.x; cy += n.y }
      cx /= nodes.length; cy /= nodes.length
      for (const n of nodes) {
        const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2)
        if (d > maxDist) maxDist = d
      }
      this.providerCentroids.set(provider, {
        centroid: [cx, cy],
        radius: maxDist + 100,
        count: nodes.length,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  updateConnectedIds() {
    if (this.blastMode && this.blastAffectedNodes.size > 0) {
      this.connectedIds = null
      return
    }
    const activeId = this.hoveredNodeId || this.selectedNodeId
    if (!activeId) { this.connectedIds = null; return }
    const ids = new Set<string>([activeId])
    const neighbors = this.adjacency.get(activeId)
    if (neighbors) for (const n of neighbors) ids.add(n)
    this.connectedIds = ids
  }

  hitTest(screenX: number, screenY: number): string | null {
    const [wx, wy] = this.camera.screenToWorld(screenX, screenY, this.width, this.height)
    return hitTestNodes(wx, wy, this.nodes, this.camera.zoom)
  }

  // ---------------------------------------------------------------------------
  // Resize
  // ---------------------------------------------------------------------------

  resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect()
    if (!rect) return
    this.width = rect.width
    this.height = rect.height
    this.dpr = window.devicePixelRatio || 1
    this.canvas.width = this.width * this.dpr
    this.canvas.height = this.height * this.dpr
    this.canvas.style.width = this.width + 'px'
    this.canvas.style.height = this.height + 'px'
    this._dirty = true
    // Invalidate cached overlays
    this._cachedW = 0
    this._cachedH = 0
  }

  fitAll(padding = 0.12, maxZoom = 1.0, hudOffsetPx = 0) {
    if (this.nodes.length === 0) return
    const pts: [number, number][] = this.nodes.map(n => [n.x, n.y])
    this.camera.fitAll(pts, this.width, this.height, padding, maxZoom, hudOffsetPx)
  }

  // ---------------------------------------------------------------------------
  // Cached overlay rendering
  // ---------------------------------------------------------------------------

  private ensureOverlayCache() {
    if (this._cachedW === this.width && this._cachedH === this.height) return

    this._cachedW = this.width
    this._cachedH = this.height

    // Background
    {
      const c = document.createElement('canvas')
      c.width = this.width
      c.height = this.height
      const octx = c.getContext('2d')!
      octx.fillStyle = this._theme.canvasBg
      octx.fillRect(0, 0, this.width, this.height)
      const bgGlow = octx.createRadialGradient(
        this.width / 2, this.height / 2, 0,
        this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.6,
      )
      bgGlow.addColorStop(0, this._theme.bgGlow)
      bgGlow.addColorStop(1, 'transparent')
      octx.fillStyle = bgGlow
      octx.fillRect(0, 0, this.width, this.height)
      this._bgCanvas = c
    }

    // Vignette
    {
      const c = document.createElement('canvas')
      c.width = this.width
      c.height = this.height
      const octx = c.getContext('2d')!
      const cx = this.width / 2
      const cy = this.height / 2
      const r = Math.max(this.width, this.height) * 0.7
      const grad = octx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(1, `${this._theme.vignetteColor}${this._theme.vignetteStrength})`)
      octx.fillStyle = grad
      octx.fillRect(0, 0, this.width, this.height)
      this._vignetteCanvas = c
    }
  }

  // ---------------------------------------------------------------------------
  // Viewport culling helpers
  // ---------------------------------------------------------------------------

  private isNodeVisible(node: LayoutNode2D): boolean {
    // Use generous bounding box to include label + tooltip
    return this.camera.isVisible(node.x, node.y, 300, 200, this.width, this.height)
  }

  private isEdgeVisible(source: LayoutNode2D, target: LayoutNode2D): boolean {
    // Edge is visible if either endpoint is visible, or the midpoint is
    const midX = (source.x + target.x) / 2
    const midY = (source.y + target.y) / 2
    return (
      this.camera.isVisible(source.x, source.y, 40, 40, this.width, this.height) ||
      this.camera.isVisible(target.x, target.y, 40, 40, this.width, this.height) ||
      this.camera.isVisible(midX, midY, 40, 40, this.width, this.height)
    )
  }

  // ---------------------------------------------------------------------------
  // Render loop
  // ---------------------------------------------------------------------------

  start() {
    this.startTime = performance.now() / 1000
    const loop = () => {
      this.render()
      this.frameId = requestAnimationFrame(loop)
    }
    this.frameId = requestAnimationFrame(loop)
  }

  stop() {
    cancelAnimationFrame(this.frameId)
  }

  private render() {
    const ctx = this.ctx
    const now = performance.now() / 1000
    const time = now - this.startTime

    // Update camera (returns true if camera moved)
    const cameraMoved = this.camera.update()

    // Entrance animation
    if (!this.entranceDone) {
      this.entranceProgress = Math.min(time / 2.0, 1)
      if (this.entranceProgress >= 1) {
        this.entranceDone = true
        this._hasAnimations = false
      }
      this._dirty = true
    }

    // Edge flow particles always animate — mark dirty if there are visible edges
    // (We always have edges, so we always need to redraw for particles)
    const hasFlowParticles = this.nodes.length > 0
    if (hasFlowParticles) this._dirty = true

    // Skip frame if nothing changed
    if (!this._dirty && !cameraMoved) return
    this._dirty = false

    // Zoom tier transitions
    const currentTier = getZoomTier(this.camera.zoom)
    if (currentTier !== this.prevTier) {
      this.prevTier = currentTier
      this.tierTransition = 0
      this.tierTransitionStart = now
    }
    if (this.tierTransition < 1) {
      this.tierTransition = Math.min((now - this.tierTransitionStart) / 0.2, 1)
    }

    // Ensure cached overlays
    this.ensureOverlayCache()

    // Canvas setup — draw cached background instead of recreating gradients
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(this.dpr, this.dpr)

    if (this._bgCanvas) {
      ctx.drawImage(this._bgCanvas, 0, 0)
    } else {
      ctx.fillStyle = this._theme.canvasBg
      ctx.fillRect(0, 0, this.width, this.height)
    }

    // Apply camera transform
    this.camera.applyTransform(ctx, this.width, this.height)

    // Draw based on zoom tier
    const tier = currentTier
    const fadeIn = this.tierTransition

    if (tier === 'macro') {
      this.drawMacroView(ctx, time, fadeIn)
    } else if (tier === 'cluster') {
      this.drawClusterView(ctx, time, fadeIn)
    } else if (tier === 'detail') {
      this.drawDetailView(ctx, time, fadeIn)
    } else {
      this.drawNodeView(ctx, time, fadeIn)
    }

    ctx.restore()

    // Vignette overlay (screen-space)
    if (this._vignetteCanvas) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(this.dpr, this.dpr)
      ctx.drawImage(this._vignetteCanvas, 0, 0)
      ctx.restore()
    }

    // Red danger vignette overlay when a blast is active
    if (this.blastMode && this.blastSourceId && this.blastAffectedNodes.size > 0) {
      this.drawBlastVignette(ctx, time)
    }
  }

  /** Screen-space red edge vignette that pulses while a blast is active. */
  private drawBlastVignette(ctx: CanvasRenderingContext2D, time: number) {
    const pulse = (Math.sin(time * 2.2) + 1) * 0.5
    const intensity = 0.18 + pulse * 0.12
    const sinceStart = time - (this.blastStartTime - this.startTime)
    const rampIn = Math.min(sinceStart / 0.35, 1) // ease in over 350ms

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(this.dpr, this.dpr)

    const cx = this.width / 2
    const cy = this.height / 2
    const inner = Math.min(this.width, this.height) * 0.35
    const outer = Math.max(this.width, this.height) * 0.9
    const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer)
    grad.addColorStop(0, 'rgba(239, 68, 68, 0)')
    grad.addColorStop(0.6, `rgba(239, 68, 68, ${intensity * 0.4 * rampIn})`)
    grad.addColorStop(1, `rgba(220, 38, 38, ${intensity * rampIn})`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, this.width, this.height)

    // Top banner bar: thin, bright — like a red-alert strip
    ctx.globalAlpha = (0.45 + pulse * 0.25) * rampIn
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(0, 0, this.width, 2)
    ctx.fillRect(0, this.height - 2, this.width, 2)

    ctx.restore()
  }

  // ---------------------------------------------------------------------------
  // Zoom tier renders (with viewport culling)
  // ---------------------------------------------------------------------------

  private drawMacroView(ctx: CanvasRenderingContext2D, time: number, fade: number) {
    for (const [provider, data] of this.providerCentroids) {
      drawProviderBlob(ctx, provider, data.centroid, data.radius, data.count, null, fade)
    }
    for (const node of this.nodes) {
      if (this.isNodeVisible(node)) {
        drawNodeDot(ctx, node, fade * 0.5)
      }
    }
    this.drawBlastBloom(ctx, time)
    this.drawBlastMacroMarkers(ctx, time)
  }

  private drawClusterView(ctx: CanvasRenderingContext2D, time: number, fade: number) {
    for (const hull of this.providerHulls) {
      drawProviderHull(ctx, hull, fade)
    }
    for (const pill of this.categoryPills) {
      drawCategoryPill(ctx, pill, fade)
    }
    for (const node of this.nodes) {
      if (this.isNodeVisible(node)) {
        drawNodeDot(ctx, node, fade * 0.4)
      }
    }
    this.drawBlastBloom(ctx, time)
    this.drawBlastMacroMarkers(ctx, time)
  }

  /**
   * Minimal blast markers for zoomed-out views — a bright dot per affected node
   * plus a pulsing ring on the source, so the cascade stays readable from afar.
   */
  private drawBlastMacroMarkers(ctx: CanvasRenderingContext2D, time: number) {
    if (!this.blastMode || this.blastAffectedNodes.size === 0) return
    ctx.save()
    for (const node of this.nodes) {
      if (!this.blastAffectedNodes.has(node.id)) continue
      if (!this.isNodeVisible(node)) continue
      const hop = this.blastNodeHops.get(node.id) ?? 0
      const isSource = node.id === this.blastSourceId
      const color = isSource ? '#ff2e2e' : (hop <= 1 ? '#ef4444' : (hop <= 3 ? '#ef5a3a' : '#f59e0b'))
      const r = isSource ? 6 : 4
      ctx.fillStyle = color
      ctx.globalAlpha = 0.95
      ctx.beginPath()
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
      ctx.fill()
      if (isSource) {
        for (let i = 0; i < 3; i++) {
          const phase = (((time * 0.7) + i / 3) % 1)
          const ringR = r + phase * 80
          ctx.strokeStyle = '#ff3e3e'
          ctx.lineWidth = 2 * (1 - phase * 0.7)
          ctx.globalAlpha = (1 - phase) * 0.6
          ctx.beginPath()
          ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
    ctx.restore()
  }

  private drawNodeView(ctx: CanvasRenderingContext2D, time: number, _fade: number) {
    const entranceEase = easeOutQuart(this.entranceProgress)
    const blastElapsed = this.blastMode ? Math.max(0, time - (this.blastStartTime - this.startTime)) : 0

    // ── Provider hulls (subtle cluster boundaries) ──────────────────
    for (const hull of this.providerHulls) {
      drawProviderHull(ctx, hull, entranceEase * 0.3)
    }

    // ── Node glow pass (additive on dark, soft overlay on light) ──
    if (this._theme.useGlowComposite) {
      ctx.globalCompositeOperation = 'lighter'
    }
    for (const node of this.nodes) {
      if (!this.isNodeVisible(node)) continue
      const colors = PROVIDER_COLORS[node.provider]
      const r = 6 + node.importance * 1.8
      const glowR = r * (this._theme.useGlowComposite ? 4 : 3)
      const isActive = this.connectedIds?.has(node.id)
      const isFaded = (this.connectedIds !== null && !isActive)
        || (this.blastMode && this.blastAffectedNodes.size > 0 && !this.blastAffectedNodes.has(node.id))
        || (this.searchMatchIds !== null && !this.searchMatchIds.has(node.id))
      if (isFaded) continue

      const isHot = node.id === this.hoveredNodeId || node.id === this.selectedNodeId
      const intensity = this._theme.useGlowComposite
        ? (isHot ? 0.07 : 0.02)
        : (isHot ? 0.14 : 0.06)
      const hex = Math.round(intensity * 255).toString(16).padStart(2, '0')
      const grad = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, glowR)
      grad.addColorStop(0, colors.primary + hex)
      grad.addColorStop(1, colors.primary + '00')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'

    // ── Edges ───────────────────────────────────────────────────────
    for (const edge of this.edges) {
      const source = this.nodeMap.get(edge.source)
      const target = this.nodeMap.get(edge.target)
      if (!source || !target) continue
      if (!this.isEdgeVisible(source, target)) continue

      const isBlastFaded = this.blastMode && this.blastAffectedNodes.size > 0 && !this.blastAffectedEdges.has(edge.id)
      const normalFaded = this.connectedIds !== null && (!this.connectedIds.has(edge.source) || !this.connectedIds.has(edge.target))
      const searchFaded = this.searchMatchIds !== null && (!this.searchMatchIds.has(edge.source) || !this.searchMatchIds.has(edge.target))
      const isFaded = isBlastFaded || normalFaded || searchFaded
      const isBlastPath = this.blastMode && this.blastAffectedEdges.has(edge.id)
      const isHighlighted = !isFaded && this.connectedIds !== null
        && this.connectedIds.has(edge.source) && this.connectedIds.has(edge.target)

      const edgeHop = isBlastPath ? (this.blastEdgeHops.get(edge.id) ?? -1) : -1
      const direction = isBlastPath ? this.blastEdgeDirection(edge) : true

      const emitPacket = isBlastPath && this.blastBfsEdges.has(edge.id)
      drawEdge(ctx, edge, source, target, isFaded, isBlastPath, isHighlighted, time, edgeHop, direction, blastElapsed, emitPacket)
    }

    // ── Red blast bloom pass (additive on dark) ─────────────────────
    this.drawBlastBloom(ctx, time)

    // ── Nodes (staggered entrance with overshoot bounce) ────────────
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i]
      if (!this.isNodeVisible(node)) continue

      const nodeEntrance = Math.min(Math.max((this.entranceProgress * 2.5 - i * 0.02), 0), 1)
      const nodeOpacity = easeOutQuart(nodeEntrance)
      if (nodeOpacity < 0.01) continue

      const isBlastFaded = this.blastMode && this.blastAffectedNodes.size > 0 && !this.blastAffectedNodes.has(node.id)
      const normalFaded = this.connectedIds !== null && !this.connectedIds.has(node.id)
      const searchFaded = this.searchMatchIds !== null && !this.searchMatchIds.has(node.id)
      const isFaded = isBlastFaded || normalFaded || searchFaded
      const isConnected = this.connectedIds !== null && this.connectedIds.has(node.id)
      const isBlastAffected = this.blastMode && this.blastAffectedNodes.has(node.id)
      const blastHop = isBlastAffected ? (this.blastNodeHops.get(node.id) ?? -1) : -1
      const isBlastSource = isBlastAffected && node.id === this.blastSourceId

      // Entrance: scale from 0 with elastic overshoot
      if (nodeEntrance < 1) {
        const scale = easeOutBack(nodeEntrance)
        ctx.save()
        ctx.translate(node.x, node.y)
        ctx.scale(scale, scale)
        ctx.translate(-node.x, -node.y)
        drawNodeOrb(ctx, node, this.selectedNodeId === node.id, this.hoveredNodeId === node.id, isFaded, isConnected, nodeOpacity, time, isBlastAffected, blastHop, isBlastSource, blastElapsed)
        ctx.restore()
      } else {
        drawNodeOrb(ctx, node, this.selectedNodeId === node.id, this.hoveredNodeId === node.id, isFaded, isConnected, nodeOpacity, time, isBlastAffected, blastHop, isBlastSource, blastElapsed)
      }
    }

    // ── Provider cluster labels ─────────────────────────────────────
    const providerLabels: Record<string, string> = { aws: 'AWS', azure: 'Azure', gcp: 'GCP' }
    for (const [provider, data] of this.providerCentroids) {
      const colors = PROVIDER_COLORS[provider]
      const labelY = data.centroid[1] - data.radius - 20
      ctx.save()
      ctx.globalAlpha = entranceEase * (this._theme.useGlowComposite ? 0.25 : 0.5)
      ctx.fillStyle = colors[this._theme.providerColorKey]
      ctx.font = '500 13px "IBM Plex Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(providerLabels[provider] || provider, data.centroid[0], labelY)
      // Subtle underline
      const tw = ctx.measureText(providerLabels[provider] || provider).width
      ctx.strokeStyle = colors.primary
      ctx.globalAlpha = entranceEase * 0.08
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(data.centroid[0] - tw / 2, labelY + 3)
      ctx.lineTo(data.centroid[0] + tw / 2, labelY + 3)
      ctx.stroke()
      ctx.restore()
    }

    // ── Tooltips ────────────────────────────────────────────────────
    const hoveredNode = this.hoveredNodeId ? this.nodeMap.get(this.hoveredNodeId) : null
    if (hoveredNode) drawHoverTooltip(ctx, hoveredNode, 1)
    const selectedNode = this.selectedNodeId ? this.nodeMap.get(this.selectedNodeId) : null
    if (selectedNode && selectedNode.id !== this.hoveredNodeId) drawHoverTooltip(ctx, selectedNode, 0.85)
  }

  private drawDetailView(ctx: CanvasRenderingContext2D, time: number, _fade: number) {
    const blastElapsed = this.blastMode ? Math.max(0, time - (this.blastStartTime - this.startTime)) : 0

    for (const hull of this.vpcHulls) {
      drawVpcHull(ctx, hull, 1)
    }

    for (const edge of this.edges) {
      const source = this.nodeMap.get(edge.source)
      const target = this.nodeMap.get(edge.target)
      if (!source || !target) continue
      if (!this.isEdgeVisible(source, target)) continue

      const isBlastFaded = this.blastMode && this.blastAffectedNodes.size > 0 && !this.blastAffectedEdges.has(edge.id)
      const normalFaded = this.connectedIds !== null && (!this.connectedIds.has(edge.source) || !this.connectedIds.has(edge.target))
      const searchFaded = this.searchMatchIds !== null && (!this.searchMatchIds.has(edge.source) || !this.searchMatchIds.has(edge.target))
      const isFaded = isBlastFaded || normalFaded || searchFaded
      const isBlastPath = this.blastMode && this.blastAffectedEdges.has(edge.id)
      const isHighlighted = !isFaded && this.connectedIds !== null
        && this.connectedIds.has(edge.source) && this.connectedIds.has(edge.target)

      const edgeHop = isBlastPath ? (this.blastEdgeHops.get(edge.id) ?? -1) : -1
      const direction = isBlastPath ? this.blastEdgeDirection(edge) : true

      const emitPacket = isBlastPath && this.blastBfsEdges.has(edge.id)
      drawEdge(ctx, edge, source, target, isFaded, isBlastPath, isHighlighted, time, edgeHop, direction, blastElapsed, emitPacket)
      drawEdgeLabel(ctx, edge, source, target, isFaded)
    }

    this.drawBlastBloom(ctx, time)

    for (const node of this.nodes) {
      if (!this.isNodeVisible(node)) continue

      const isBlastFaded = this.blastMode && this.blastAffectedNodes.size > 0 && !this.blastAffectedNodes.has(node.id)
      const normalFaded = this.connectedIds !== null && !this.connectedIds.has(node.id)
      const searchFaded = this.searchMatchIds !== null && !this.searchMatchIds.has(node.id)
      const isFaded = isBlastFaded || normalFaded || searchFaded
      const isBlastAffected = this.blastMode && this.blastAffectedNodes.has(node.id)
      const blastHop = isBlastAffected ? (this.blastNodeHops.get(node.id) ?? -1) : -1
      const isBlastSource = isBlastAffected && node.id === this.blastSourceId

      drawNodeCardDetail(
        ctx, node,
        this.selectedNodeId === node.id,
        this.hoveredNodeId === node.id,
        isFaded, 1, time,
        isBlastAffected,
        blastHop,
        isBlastSource,
        blastElapsed,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Blast helpers
  // ---------------------------------------------------------------------------

  /**
   * Whether the blast along this edge flows in its natural direction (source → target).
   * For dependency edges we reverse by design, and for any edge where the endpoint
   * hops are inverted (target closer to the epicenter than source) we also reverse.
   */
  private blastEdgeDirection(edge: InfraEdge): boolean {
    const hs = this.blastNodeHops.get(edge.source)
    const ht = this.blastNodeHops.get(edge.target)
    if (hs === undefined || ht === undefined) return true
    if (hs === ht) return edge.type !== 'dependency'
    return hs < ht
  }

  /** Additive red bloom on every affected node — a giant "danger glow" field. */
  private drawBlastBloom(ctx: CanvasRenderingContext2D, _time: number) {
    if (!this.blastMode || this.blastAffectedNodes.size === 0) return

    const useAdditive = this._theme.useGlowComposite
    ctx.save()
    if (useAdditive) ctx.globalCompositeOperation = 'lighter'

    for (const node of this.nodes) {
      if (!this.blastAffectedNodes.has(node.id)) continue
      if (!this.isNodeVisible(node)) continue
      const hop = this.blastNodeHops.get(node.id) ?? 0
      const isSource = node.id === this.blastSourceId
      const r = 6 + node.importance * 1.8
      const glowR = r * (isSource ? 9 : 6)
      // Epicenter uses hot red; outer hops fade toward amber
      const color = isSource ? '#ff3030' : (hop <= 1 ? '#ef4444' : (hop <= 3 ? '#ef5a3a' : '#f59e0b'))
      const intensity = isSource ? 0.22 : (useAdditive ? 0.08 : 0.16)
      const hex = Math.round(intensity * 255).toString(16).padStart(2, '0')
      const grad = ctx.createRadialGradient(node.x, node.y, r * 0.3, node.x, node.y, glowR)
      grad.addColorStop(0, color + hex)
      grad.addColorStop(1, color + '00')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
  }
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
