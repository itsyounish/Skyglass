import type { InfraGraph } from '../types'
import { PROVIDER_COLORS } from '../constants'
import { useTheme } from '../theme'

interface Props {
  graph: InfraGraph
}

export function StatusBar({ graph }: Props) {
  const { theme } = useTheme()

  const providers = { aws: 0, azure: 0, gcp: 0 }
  let warnings = 0, errors = 0, totalCost = 0

  for (const n of graph.nodes) {
    providers[n.provider]++
    if (n.status === 'warning') warnings++
    if (n.status === 'error') errors++
    const cost = n.metadata?.cost
    if (cost) {
      const m = cost.match(/\$([\d,.]+)/)
      if (m) totalCost += parseFloat(m[1].replace(/,/g, ''))
    }
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 28,
      background: theme.statusBarBg,
      borderTop: `1px solid ${theme.statusBarBorder}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 16,
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 10,
      color: theme.textTertiary,
      zIndex: 50,
      backdropFilter: 'blur(8px)',
    }}>
      <span style={{ color: theme.textSecondary }}>
        {graph.nodes.length} resources
      </span>
      <span>{graph.edges.length} edges</span>
      <span style={{ display: 'flex', gap: 8 }}>
        <span style={{ color: PROVIDER_COLORS.aws.primary }}>AWS: {providers.aws}</span>
        <span style={{ color: PROVIDER_COLORS.azure.primary }}>Azure: {providers.azure}</span>
        <span style={{ color: PROVIDER_COLORS.gcp.primary }}>GCP: {providers.gcp}</span>
      </span>
      {warnings > 0 && <span style={{ color: theme.warningColor }}>{warnings} warning{warnings > 1 ? 's' : ''}</span>}
      {errors > 0 && <span style={{ color: '#ea4335' }}>{errors} error{errors > 1 ? 's' : ''}</span>}
      {totalCost > 0 && (
        <span style={{ marginLeft: 'auto', color: theme.costColor }}>
          ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
        </span>
      )}
    </div>
  )
}
