import { useRef, useEffect, useCallback } from 'react'
import type { InfraGraph } from '../types'
import type { LayoutNode2D } from './types2d'
import type { Theme } from '../theme'
import { Renderer2D } from './Renderer2D'

interface Props {
  graph: InfraGraph
  layoutNodes: LayoutNode2D[]
  settled: boolean
  selectedNodeId: string | null
  hoveredNodeId: string | null
  blastMode: boolean
  blastAffectedNodes: Set<string>
  blastAffectedEdges: Set<string>
  searchMatchIds: Set<string> | null
  onSelect: (id: string | null) => void
  onHover: (id: string | null) => void
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
  theme: Theme
}

export function Canvas2DView({
  graph, layoutNodes, settled,
  selectedNodeId, hoveredNodeId,
  blastMode, blastAffectedNodes, blastAffectedEdges,
  searchMatchIds,
  onSelect, onHover, canvasRef: externalCanvasRef,
  theme,
}: Props) {
  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<Renderer2D | null>(null)
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const hasFitted = useRef(false)

  // Init renderer
  useEffect(() => {
    const canvas = internalCanvasRef.current
    if (!canvas) return
    if (externalCanvasRef) {
      (externalCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = canvas
    }

    const renderer = new Renderer2D(canvas)
    rendererRef.current = renderer
    renderer.onSelect = onSelect
    renderer.onHover = onHover
    renderer.start()

    const onResize = () => renderer.resize()
    window.addEventListener('resize', onResize)

    return () => {
      renderer.stop()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Update callbacks
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.onSelect = onSelect
    r.onHover = onHover
  }, [onSelect, onHover])

  // Update graph data
  useEffect(() => {
    const r = rendererRef.current
    if (!r || layoutNodes.length === 0) return
    r.setGraph(graph, layoutNodes)
  }, [graph])

  // Update positions as force layout converges — keep camera centered on nodes
  useEffect(() => {
    const r = rendererRef.current
    if (!r || layoutNodes.length === 0) return
    r.updatePositions(layoutNodes)

    if (!hasFitted.current) {
      // Compute centroid + bounding box of all nodes
      let cx = 0, cy = 0
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const n of layoutNodes) {
        cx += n.x; cy += n.y
        if (n.x < minX) minX = n.x
        if (n.x > maxX) maxX = n.x
        if (n.y < minY) minY = n.y
        if (n.y > maxY) maxY = n.y
      }
      cx /= layoutNodes.length; cy /= layoutNodes.length

      // Offset centroid to compensate for the HUD panel on the left (~100px in world-space)
      const hudOffset = 80 / Math.max(r.camera.zoom, 0.3)
      r.camera.x = cx + hudOffset
      r.camera.y = cy

      if (!settled) {
        // While converging, compute a zoom that fits the current bounding box
        const spanX = (maxX - minX) + 250
        const spanY = (maxY - minY) + 100
        const fitZoom = Math.min(r.width * 0.76 / spanX, r.height * 0.76 / spanY)
        r.camera.zoom = Math.max(0.4, fitZoom)
      } else {
        // Layout is done — fly to the best-fit view
        hasFitted.current = true
        const spanX = (maxX - minX) + 250
        const spanY = (maxY - minY) + 100
        const fitZoom = Math.min(r.width * 0.76 / spanX, r.height * 0.76 / spanY)
        const finalZoom = Math.max(0.4, Math.min(1.2, fitZoom))
        r.camera.flyTo(cx + hudOffset, cy, finalZoom)
      }
    }
  }, [layoutNodes, settled])

  // Sync interaction state
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.selectedNodeId = selectedNodeId
    r.hoveredNodeId = hoveredNodeId
    r.blastMode = blastMode
    r.blastAffectedNodes = blastAffectedNodes
    r.blastAffectedEdges = blastAffectedEdges
    r.searchMatchIds = searchMatchIds
    r.updateConnectedIds()
    r.markDirty()
  }, [selectedNodeId, hoveredNodeId, blastMode, blastAffectedNodes, blastAffectedEdges, searchMatchIds])

  // Sync theme
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setTheme(theme)
  }, [theme])

  // --- Mouse interaction ---

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      isDragging.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
      rendererRef.current?.camera.panStart()
      e.preventDefault()
    } else if (e.button === 0) {
      const r = rendererRef.current
      if (!r) return
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
      const id = r.hitTest(e.clientX - rect.left, e.clientY - rect.top)
      if (id) {
        onSelect(selectedNodeId === id ? null : id)
      } else {
        isDragging.current = true
        lastMouse.current = { x: e.clientX, y: e.clientY }
        r.camera.panStart()
      }
    }
  }, [onSelect, selectedNodeId])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const r = rendererRef.current
    if (!r) return

    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      r.camera.pan(dx, dy)
      lastMouse.current = { x: e.clientX, y: e.clientY }
      return
    }

    // Hover hit test
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const id = r.hitTest(e.clientX - rect.left, e.clientY - rect.top)
    if (id !== r.hoveredNodeId) {
      onHover(id)
      document.body.style.cursor = id ? 'pointer' : 'default'
    }
  }, [onHover])

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false
      rendererRef.current?.camera.panEnd()
    }
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const r = rendererRef.current
    if (!r) return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    r.camera.zoomAt(
      e.clientX - rect.left,
      e.clientY - rect.top,
      e.deltaY,
      r.width,
      r.height,
    )
  }, [])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const r = rendererRef.current
    if (!r) return
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const id = r.hitTest(e.clientX - rect.left, e.clientY - rect.top)
    if (id) {
      const node = r.nodeMap.get(id)
      if (node) {
        r.camera.flyTo(node.x, node.y, 2.5)
        onSelect(id)
      }
    }
  }, [onSelect])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false
      rendererRef.current?.camera.panEnd()
    }
    onHover(null)
    document.body.style.cursor = 'default'
  }, [onHover])

  return (
    <canvas
      ref={internalCanvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        touchAction: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseLeave={handleMouseLeave}
    />
  )
}
