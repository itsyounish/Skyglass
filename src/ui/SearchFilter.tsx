import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { InfraGraph, InfraNode, Provider, NodeCategory, HealthStatus } from '../types'
import { useTheme } from '../theme'

interface Props {
  graph: InfraGraph
  onMatchChange: (matchIds: Set<string> | null) => void
  isOpen: boolean
  onClose: () => void
}

const fontFamily = "'IBM Plex Mono', monospace"

function matchesSearch(node: InfraNode, query: string): boolean {
  const q = query.toLowerCase()
  if (node.id.toLowerCase().includes(q)) return true
  if (node.label.toLowerCase().includes(q)) return true
  if (node.type.toLowerCase().includes(q)) return true
  if (node.region.toLowerCase().includes(q)) return true
  for (const val of Object.values(node.metadata)) {
    if (val.toLowerCase().includes(q)) return true
  }
  return false
}

function matchesFilters(
  node: InfraNode,
  provider: Provider | 'all',
  category: NodeCategory | 'all',
  status: HealthStatus | 'all',
  region: string,
): boolean {
  if (provider !== 'all' && node.provider !== provider) return false
  if (category !== 'all' && node.category !== category) return false
  if (status !== 'all' && node.status !== status) return false
  if (region !== 'all' && node.region !== region) return false
  return true
}

export function SearchFilter({ graph, onMatchChange, isOpen, onClose }: Props) {
  const { theme } = useTheme()
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState<Provider | 'all'>('all')
  const [category, setCategory] = useState<NodeCategory | 'all'>('all')
  const [status, setStatus] = useState<HealthStatus | 'all'>('all')
  const [region, setRegion] = useState<string>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  // Extract unique regions from graph
  const regions = useMemo(() => {
    const set = new Set<string>()
    for (const node of graph.nodes) set.add(node.region)
    return Array.from(set).sort()
  }, [graph.nodes])

  // Extract unique categories from graph
  const categories = useMemo(() => {
    const set = new Set<NodeCategory>()
    for (const node of graph.nodes) set.add(node.category)
    return Array.from(set).sort()
  }, [graph.nodes])

  // Compute matching IDs
  const matchIds = useMemo(() => {
    const hasQuery = query.trim().length > 0
    const hasFilters = provider !== 'all' || category !== 'all' || status !== 'all' || region !== 'all'

    if (!hasQuery && !hasFilters) return null

    const ids = new Set<string>()
    for (const node of graph.nodes) {
      const qMatch = !hasQuery || matchesSearch(node, query.trim())
      const fMatch = matchesFilters(node, provider, category, status, region)
      if (qMatch && fMatch) ids.add(node.id)
    }
    return ids
  }, [query, provider, category, status, region, graph.nodes])

  // Push match IDs to parent
  useEffect(() => {
    onMatchChange(isOpen ? matchIds : null)
  }, [matchIds, isOpen, onMatchChange])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow the DOM to render
      const id = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(id)
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    setQuery('')
    setProvider('all')
    setCategory('all')
    setStatus('all')
    setRegion('all')
    onClose()
  }, [onClose])

  // Handle Escape inside the search panel
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true })
  }, [isOpen, handleClose])

  if (!isOpen) return null

  const matchCount = matchIds ? matchIds.size : graph.nodes.length
  const totalCount = graph.nodes.length

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        fontFamily,
        width: '460px',
        maxWidth: 'calc(100vw - 40px)',
      }}
      // Prevent clicks from falling through to the 3D canvas
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Search input */}
      <div
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          borderRadius: '8px',
          backdropFilter: 'blur(16px)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: theme.panelShadow,
        }}
      >
        {/* Search icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.textTertiary}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search resources..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: theme.textPrimary,
            fontFamily,
            fontSize: '13px',
            letterSpacing: '0.5px',
          }}
        />

        {/* Match count */}
        <span
          style={{
            fontSize: '10px',
            color: matchIds ? theme.accent : theme.textMuted,
            whiteSpace: 'nowrap',
            letterSpacing: '0.5px',
          }}
        >
          {matchCount} / {totalCount} resources
        </span>

        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            background: theme.buttonBg,
            border: `1px solid ${theme.buttonBorder}`,
            borderRadius: '4px',
            color: theme.kbdText,
            cursor: 'pointer',
            padding: '1px 6px',
            fontFamily,
            fontSize: '9px',
            lineHeight: '16px',
          }}
        >
          ESC
        </button>
      </div>

      {/* Filter row */}
      <div
        style={{
          marginTop: '6px',
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          borderRadius: '8px',
          backdropFilter: 'blur(16px)',
          padding: '10px 16px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          boxShadow: theme.panelShadow,
        }}
      >
        <FilterSelect
          label="provider"
          value={provider}
          onChange={(v) => setProvider(v as Provider | 'all')}
          options={[
            { value: 'all', label: 'all providers' },
            { value: 'aws', label: 'AWS' },
            { value: 'azure', label: 'Azure' },
            { value: 'gcp', label: 'GCP' },
          ]}
        />

        <FilterSelect
          label="category"
          value={category}
          onChange={(v) => setCategory(v as NodeCategory | 'all')}
          options={[
            { value: 'all', label: 'all categories' },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />

        <FilterSelect
          label="status"
          value={status}
          onChange={(v) => setStatus(v as HealthStatus | 'all')}
          options={[
            { value: 'all', label: 'all statuses' },
            { value: 'healthy', label: 'healthy' },
            { value: 'warning', label: 'warning' },
            { value: 'error', label: 'error' },
          ]}
        />

        <FilterSelect
          label="region"
          value={region}
          onChange={(v) => setRegion(v)}
          options={[
            { value: 'all', label: 'all regions' },
            ...regions.map((r) => ({ value: r, label: r })),
          ]}
        />
      </div>
    </div>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  const { theme } = useTheme()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '9px', color: theme.textMuted, letterSpacing: '1px', textTransform: 'uppercase' }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: theme.inputBg,
          border: `1px solid ${theme.inputBorder}`,
          borderRadius: '4px',
          color: value === 'all' ? theme.textTertiary : theme.accent,
          fontFamily,
          fontSize: '10px',
          padding: '3px 6px',
          outline: 'none',
          cursor: 'pointer',
          appearance: 'auto',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
