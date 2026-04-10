export interface Camera2DState {
  x: number      // world-space center X
  y: number      // world-space center Y
  zoom: number   // 1.0 = default
}

// ---------------------------------------------------------------------------
// Inertia constants
// ---------------------------------------------------------------------------

const PAN_FRICTION = 0.92          // per-frame velocity damping (higher = more slide)
const PAN_MIN_VELOCITY = 0.05      // stop threshold in world-space units
const ZOOM_LERP_SPEED = 0.14       // zoom interpolation factor per frame
const ZOOM_SNAP_THRESHOLD = 0.001  // stop interpolation when this close

export class Camera2D {
  x = 0
  y = 0
  zoom = 1

  // Target values for smooth animation (flyTo)
  private targetX = 0
  private targetY = 0
  private targetZoom = 1
  private animating = false
  private animStart = 0
  private animDuration = 0
  private startX = 0
  private startY = 0
  private startZoom = 1

  // Pan inertia
  private panVx = 0
  private panVy = 0
  private isPanning = false

  // Smooth zoom
  private zoomTarget = 1
  private zoomInterpolating = false

  // Dirty tracking — consumers can read this to skip frames
  dirty = true

  readonly minZoom = 0.05
  readonly maxZoom = 6.0

  /**
   * Convert screen coordinates to world coordinates.
   */
  screenToWorld(
    screenX: number,
    screenY: number,
    viewWidth: number,
    viewHeight: number,
  ): [number, number] {
    const wx = (screenX - viewWidth / 2) / this.zoom + this.x
    const wy = (screenY - viewHeight / 2) / this.zoom + this.y
    return [wx, wy]
  }

  /**
   * Convert world coordinates to screen coordinates.
   */
  worldToScreen(
    worldX: number,
    worldY: number,
    viewWidth: number,
    viewHeight: number,
  ): [number, number] {
    const sx = (worldX - this.x) * this.zoom + viewWidth / 2
    const sy = (worldY - this.y) * this.zoom + viewHeight / 2
    return [sx, sy]
  }

  /**
   * Apply the camera transform to a canvas 2D context.
   */
  applyTransform(
    ctx: CanvasRenderingContext2D,
    viewWidth: number,
    viewHeight: number,
  ): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.translate(viewWidth / 2, viewHeight / 2)
    ctx.scale(this.zoom, this.zoom)
    ctx.translate(-this.x, -this.y)
  }

  // -----------------------------------------------------------------------
  // Pan with inertia
  // -----------------------------------------------------------------------

  /** Call on pointerdown to begin panning. */
  panStart(): void {
    this.isPanning = true
    this.panVx = 0
    this.panVy = 0
  }

  /**
   * Pan by a screen-space delta.
   * Accumulates velocity for inertia on release.
   */
  pan(dx: number, dy: number): void {
    const worldDx = dx / this.zoom
    const worldDy = dy / this.zoom
    this.x -= worldDx
    this.y -= worldDy
    // Exponential moving average of velocity for smooth inertia
    this.panVx = this.panVx * 0.5 + worldDx * 0.5
    this.panVy = this.panVy * 0.5 + worldDy * 0.5
    this.dirty = true
  }

  /** Call on pointerup to release panning and start inertia. */
  panEnd(): void {
    this.isPanning = false
    // If velocity is tiny, just stop immediately
    if (Math.abs(this.panVx) < PAN_MIN_VELOCITY && Math.abs(this.panVy) < PAN_MIN_VELOCITY) {
      this.panVx = 0
      this.panVy = 0
    }
  }

  // -----------------------------------------------------------------------
  // Smooth zoom
  // -----------------------------------------------------------------------

  /**
   * Zoom toward a screen-space point (Figma-style) with smooth interpolation.
   */
  zoomAt(
    screenX: number,
    screenY: number,
    delta: number,
    viewWidth: number,
    viewHeight: number,
  ): void {
    // Compute target zoom with logarithmic scaling for uniform feel
    const factor = Math.exp(-delta * 0.002)
    this.zoomTarget = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoomTarget * factor))
    this.zoomInterpolating = true
    // Store the screen anchor point for zoom-toward-cursor
    this._zoomAnchorSX = screenX
    this._zoomAnchorSY = screenY
    this._zoomAnchorVW = viewWidth
    this._zoomAnchorVH = viewHeight
    this.dirty = true
  }

  private _zoomAnchorSX = 0
  private _zoomAnchorSY = 0
  private _zoomAnchorVW = 0
  private _zoomAnchorVH = 0

  // -----------------------------------------------------------------------
  // Animated fly-to
  // -----------------------------------------------------------------------

  flyTo(x: number, y: number, zoom: number, duration = 600): void {
    this.startX = this.x
    this.startY = this.y
    this.startZoom = this.zoom
    this.targetX = x
    this.targetY = y
    this.targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom))
    this.zoomTarget = this.targetZoom
    this.animDuration = duration
    this.animStart = performance.now()
    this.animating = true
    this.dirty = true
  }

  fitAll(
    points: [number, number][],
    viewWidth: number,
    viewHeight: number,
    padding = 0.1,
    maxZoom = 2.0,
  ): void {
    if (points.length === 0) return

    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    for (const [px, py] of points) {
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
    }

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const spanX = (maxX - minX) + 250
    const spanY = (maxY - minY) + 100
    const availW = viewWidth * (1 - padding * 2)
    const availH = viewHeight * (1 - padding * 2)

    let fitZoom: number
    if (spanX <= 0 && spanY <= 0) fitZoom = 1
    else if (spanX <= 0) fitZoom = availH / spanY
    else if (spanY <= 0) fitZoom = availW / spanX
    else fitZoom = Math.min(availW / spanX, availH / spanY)

    fitZoom = Math.min(maxZoom, Math.max(this.minZoom, fitZoom))
    this.flyTo(centerX, centerY, fitZoom)
  }

  // -----------------------------------------------------------------------
  // Per-frame update — call once per rAF
  // -----------------------------------------------------------------------

  update(): boolean {
    let moved = false

    // --- Fly-to animation ---
    if (this.animating) {
      const now = performance.now()
      const elapsed = now - this.animStart
      let t = Math.min(1, elapsed / this.animDuration)
      const eased = 1 - Math.pow(1 - t, 4)

      this.x = this.startX + (this.targetX - this.startX) * eased
      this.y = this.startY + (this.targetY - this.startY) * eased
      this.zoom = this.startZoom + (this.targetZoom - this.startZoom) * eased
      this.zoomTarget = this.zoom

      if (t >= 1) {
        this.x = this.targetX
        this.y = this.targetY
        this.zoom = this.targetZoom
        this.animating = false
      }
      moved = true
    }

    // --- Pan inertia ---
    if (!this.isPanning && (Math.abs(this.panVx) > PAN_MIN_VELOCITY || Math.abs(this.panVy) > PAN_MIN_VELOCITY)) {
      this.x -= this.panVx
      this.y -= this.panVy
      this.panVx *= PAN_FRICTION
      this.panVy *= PAN_FRICTION
      if (Math.abs(this.panVx) < PAN_MIN_VELOCITY) this.panVx = 0
      if (Math.abs(this.panVy) < PAN_MIN_VELOCITY) this.panVy = 0
      moved = true
    }

    // --- Smooth zoom interpolation ---
    if (this.zoomInterpolating && !this.animating) {
      const diff = this.zoomTarget - this.zoom
      if (Math.abs(diff) > ZOOM_SNAP_THRESHOLD) {
        // World point under the anchor before zoom
        const wx = (this._zoomAnchorSX - this._zoomAnchorVW / 2) / this.zoom + this.x
        const wy = (this._zoomAnchorSY - this._zoomAnchorVH / 2) / this.zoom + this.y

        // Interpolate zoom
        this.zoom += diff * ZOOM_LERP_SPEED

        // Adjust camera so anchor point stays fixed on screen
        this.x = wx - (this._zoomAnchorSX - this._zoomAnchorVW / 2) / this.zoom
        this.y = wy - (this._zoomAnchorSY - this._zoomAnchorVH / 2) / this.zoom

        moved = true
      } else {
        this.zoom = this.zoomTarget
        this.zoomInterpolating = false
      }
    }

    if (moved) this.dirty = true
    return moved
  }

  // -----------------------------------------------------------------------
  // Visibility test
  // -----------------------------------------------------------------------

  isVisible(
    worldX: number,
    worldY: number,
    width: number,
    height: number,
    viewWidth: number,
    viewHeight: number,
  ): boolean {
    const hw = width / 2
    const hh = height / 2
    const vpHalfW = viewWidth / 2 / this.zoom
    const vpHalfH = viewHeight / 2 / this.zoom

    return (
      worldX + hw >= this.x - vpHalfW &&
      worldX - hw <= this.x + vpHalfW &&
      worldY + hh >= this.y - vpHalfH &&
      worldY - hh <= this.y + vpHalfH
    )
  }
}
