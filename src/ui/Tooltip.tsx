import { useState, useEffect } from 'react'
import type { InfraNode } from '../types'
import { PROVIDER_COLORS } from '../constants'
import { useTheme } from '../theme'

interface Props {
  node: InfraNode | null
}

export function Tooltip({ node }: Props) {
  const { theme } = useTheme()
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const STATUS_LABELS: Record<string, { color: string; label: string }> = {
    healthy: { color: '#34a853', label: 'Healthy' },
    warning: { color: theme.warningColor, label: 'Warning' },
    error: { color: '#ea4335', label: 'Error' },
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  if (!node) return null

  const colors = PROVIDER_COLORS[node.provider]
  const status = STATUS_LABELS[node.status] || STATUS_LABELS.healthy
  const cost = node.metadata?.cost

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x + 14,
        top: pos.y + 14,
        background: theme.panelBg,
        border: `1px solid ${theme.panelBorder}`,
        borderRadius: 8,
        padding: '8px 12px',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        color: theme.textSecondary,
        pointerEvents: 'none',
        zIndex: 100,
        maxWidth: 280,
        backdropFilter: 'blur(12px)',
        boxShadow: theme.panelShadow,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div style={{
          width: 3, height: 14, borderRadius: 2,
          background: colors.primary,
        }} />
        <span style={{ fontWeight: 600, color: theme.textPrimary }}>{node.label}</span>
      </div>
      <div style={{ fontSize: 9, color: theme.textTertiary, marginBottom: 4 }}>
        {node.type} &middot; {node.region}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: status.color, display: 'inline-block',
          }} />
          {status.label}
        </span>
        {cost && <span style={{ color: theme.costColor }}>{cost}</span>}
      </div>
    </div>
  )
}
