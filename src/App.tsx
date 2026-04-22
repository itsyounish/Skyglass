import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Canvas2DView } from './canvas/Canvas2DView'
import { useForceLayout2D } from './hooks/useForceLayout2D'
import { DetailPanel } from './ui/DetailPanel'
import { Legend } from './ui/Legend'
import { HUD } from './ui/HUD'
import { SearchFilter } from './ui/SearchFilter'
import { CostPanel } from './ui/CostPanel'
import { StatusBar } from './ui/StatusBar'
import { Tooltip } from './ui/Tooltip'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { getMultiCloudGraph } from './data'
import { useBlastRadius } from './hooks/useBlastRadius'
import { ThemeContext, darkTheme, lightTheme, loadSavedThemeName, saveThemeName, useTheme } from './theme'
import type { InfraGraph, LayoutNode } from './types'

function useInfraGraph(): InfraGraph | null {
  const [graph, setGraph] = useState<InfraGraph | null>(null)

  useEffect(() => {
    fetch('/graph.json')
      .then((res) => {
        if (!res.ok) throw new Error('No scanned data')
        return res.json()
      })
      .then((data: InfraGraph) => {
        if (data.nodes && data.nodes.length > 0) {
          console.log(`[skyglass] Loaded scanned data: ${data.nodes.length} nodes, ${data.edges.length} edges`)
          setGraph(data)
        } else {
          throw new Error('Empty graph')
        }
      })
      .catch(() => {
        console.log('[skyglass] Using demo data')
        setGraph(getMultiCloudGraph())
      })
  }, [])

  return graph
}

function takeScreenshot(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    console.warn('[skyglass] No canvas element available for screenshot')
    return
  }
  try {
    const dataUrl = canvas.toDataURL('image/png')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = `skyglass-${timestamp}.png`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } catch (err) {
    console.error('[skyglass] Screenshot failed:', err)
  }
}

function GraphView({ graph }: { graph: InfraGraph }) {
  const { layoutNodes, settled } = useForceLayout2D(graph)
  const { theme, toggleTheme } = useTheme()

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [blastMode, setBlastMode] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(null)
  const [costPanelVisible, setCostPanelVisible] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const { affectedNodes, affectedEdges, nodeHops, edgeHops, bfsEdges, maxHop } = useBlastRadius(
    graph,
    blastMode,
    selectedNodeId,
  )

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return graph.nodes.find(n => n.id === selectedNodeId) as LayoutNode | null
  }, [selectedNodeId, graph])

  const hoveredNode = useMemo(() => {
    if (!hoveredNodeId || selectedNodeId) return null
    return graph.nodes.find(n => n.id === hoveredNodeId) ?? null
  }, [hoveredNodeId, selectedNodeId, graph])

  const handleScreenshot = useCallback(() => {
    takeScreenshot(canvasRef.current)
  }, [])

  const handleOpenSearch = useCallback(() => setSearchOpen(true), [])
  const handleCloseSearch = useCallback(() => setSearchOpen(false), [])
  const handleSearchMatchChange = useCallback((ids: Set<string> | null) => setSearchMatchIds(ids), [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const isInputFocused = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'

      if (e.key === 'Escape') {
        if (searchOpen) return
        setSelectedNodeId(null)
        if (blastMode) setBlastMode(false)
        return
      }

      if (isInputFocused) return

      if (e.key === '/') { e.preventDefault(); setSearchOpen(true); return }
      if (e.key === 'p' || e.key === 'P') { takeScreenshot(canvasRef.current); return }
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen()
        else document.exitFullscreen()
        return
      }
      if (e.key === 'b' || e.key === 'B') { setBlastMode(prev => !prev); return }
      if (e.key === 'c' || e.key === 'C') { setCostPanelVisible(prev => !prev); return }
      if (e.key === 't' || e.key === 'T') { toggleTheme(); return }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [blastMode, searchOpen, toggleTheme])

  return (
    <>
      <ErrorBoundary>
        <Canvas2DView
          graph={graph}
          layoutNodes={layoutNodes}
          settled={settled}
          selectedNodeId={selectedNodeId}
          hoveredNodeId={hoveredNodeId}
          blastMode={blastMode}
          blastSourceId={blastMode ? selectedNodeId : null}
          blastAffectedNodes={affectedNodes}
          blastAffectedEdges={affectedEdges}
          blastNodeHops={nodeHops}
          blastEdgeHops={edgeHops}
          blastBfsEdges={bfsEdges}
          searchMatchIds={searchMatchIds}
          onSelect={setSelectedNodeId}
          onHover={setHoveredNodeId}
          canvasRef={canvasRef}
          theme={theme}
        />
      </ErrorBoundary>

      <HUD
        blastMode={blastMode}
        onToggleBlast={() => setBlastMode(p => !p)}
        onScreenshot={handleScreenshot}
        onOpenSearch={handleOpenSearch}
        onToggleTheme={toggleTheme}
        themeName={theme.name}
      />
      <Legend graph={graph} />
      <DetailPanel
        node={selectedNode}
        onClose={() => setSelectedNodeId(null)}
        blastMode={blastMode}
        blastCount={affectedNodes.size}
        blastMaxHop={maxHop}
        blastTotalCount={graph.nodes.length}
      />
      <SearchFilter
        graph={graph}
        onMatchChange={handleSearchMatchChange}
        isOpen={searchOpen}
        onClose={handleCloseSearch}
      />
      <CostPanel
        graph={graph}
        visible={costPanelVisible}
        onClose={() => setCostPanelVisible(false)}
      />
      <StatusBar graph={graph} />
      <Tooltip node={hoveredNode} />

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes blastPulse {
          0%, 100% { box-shadow: 0 0 10px rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 0 25px rgba(239, 68, 68, 0.6); }
        }
      `}</style>
    </>
  )
}

function AppInner() {
  const graph = useInfraGraph()
  const { theme } = useTheme()

  if (!graph) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: theme.name === 'dark' ? '#0a0a12' : '#eef0f4',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '18px', fontWeight: 300, color: theme.textPrimary,
            letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px',
          }}>
            <span style={{ fontWeight: 500, color: theme.accent }}>sky</span>
            <span style={{ fontWeight: 300 }}>glass</span>
          </div>
          <div style={{ fontSize: '11px', color: theme.textDim, letterSpacing: '1px' }}>loading infrastructure...</div>
        </div>
      </div>
    )
  }

  return <GraphView graph={graph} />
}

export default function App() {
  const [themeName, setThemeName] = useState<'dark' | 'light'>(loadSavedThemeName)
  const theme = themeName === 'dark' ? darkTheme : lightTheme
  const toggleTheme = useCallback(() => {
    setThemeName(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      saveThemeName(next)
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <AppInner />
    </ThemeContext.Provider>
  )
}
