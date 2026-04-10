import { PROVIDER_COLORS } from '../constants'
import { useTheme, providerLabelColor } from '../theme'
import type { InfraGraph } from '../types'

interface LegendProps {
  graph: InfraGraph
}

export function Legend({ graph }: LegendProps) {
  const { theme } = useTheme()

  const providers = [
    { key: 'aws' as const, label: 'AWS', count: graph.nodes.filter(n => n.provider === 'aws').length },
    { key: 'azure' as const, label: 'Azure', count: graph.nodes.filter(n => n.provider === 'azure').length },
    { key: 'gcp' as const, label: 'GCP', count: graph.nodes.filter(n => n.provider === 'gcp').length },
  ]

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      zIndex: 50,
    }}>
      <div style={{
        background: theme.panelBg,
        border: `1px solid ${theme.panelBorder}`,
        borderRadius: '6px',
        padding: '10px 14px',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        gap: '16px',
      }}>
        {providers.map(p => (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: PROVIDER_COLORS[p.key].primary,
              boxShadow: `0 0 6px ${PROVIDER_COLORS[p.key].primary}`,
            }} />
            <span style={{ color: providerLabelColor(theme, p.key) }}>{p.label}</span>
            <span style={{ color: theme.textMuted }}>{p.count}</span>
          </div>
        ))}
        <div style={{ color: theme.textDim, borderLeft: `1px solid ${theme.divider}`, paddingLeft: '12px' }}>
          <span style={{ color: theme.textTertiary }}>{graph.nodes.length} nodes</span>
          <span style={{ color: theme.textDim, margin: '0 6px' }}>·</span>
          <span style={{ color: theme.textTertiary }}>{graph.edges.length} edges</span>
        </div>
      </div>
    </div>
  )
}
