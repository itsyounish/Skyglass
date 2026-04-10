import type { LayoutNode } from '../types'
import { PROVIDER_COLORS } from '../constants'
import { useTheme, providerLabelColor } from '../theme'

interface Props {
  node: LayoutNode | null
  onClose: () => void
  blastMode?: boolean
  blastCount?: number
}

export function DetailPanel({ node, onClose, blastMode, blastCount }: Props) {
  const { theme } = useTheme()

  if (!node) return null

  const colors = PROVIDER_COLORS[node.provider]
  const providerLabel = { aws: 'AWS', azure: 'Azure', gcp: 'GCP' }[node.provider]
  const categoryLabel = node.category

  const statusColor = {
    healthy: '#34a853',
    warning: theme.warningColor,
    error: '#ea4335',
  }[node.status]

  // Separate cost from other metadata
  const cost = node.metadata.cost
  const metaEntries = Object.entries(node.metadata).filter(([k]) => k !== 'cost')

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: '360px',
      maxHeight: 'calc(100vh - 40px)',
      overflowY: 'auto',
      background: theme.panelBg,
      border: `1px solid ${colors.primary}30`,
      borderRadius: '10px',
      fontFamily: "'IBM Plex Mono', monospace",
      color: theme.textPrimary,
      backdropFilter: 'blur(16px)',
      boxShadow: theme.panelShadow,
      animation: 'slideIn 0.25s ease-out',
      zIndex: 100,
    }}>
      {/* Blast radius banner */}
      {blastMode && blastCount && blastCount > 1 && (
        <div style={{
          padding: '10px 18px',
          background: 'rgba(239, 68, 68, 0.12)',
          borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
          fontSize: '11px',
          color: '#ef4444',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'blastPulse 2s ease-in-out infinite',
        }}>
          <span style={{ fontSize: '14px' }}>BLAST RADIUS</span>
          <span style={{ marginLeft: 'auto', color: '#ef444480' }}>{blastCount} resources affected</span>
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: '18px 18px 14px',
        borderBottom: `1px solid ${colors.primary}15`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 500, color: providerLabelColor(theme, node.provider), marginBottom: '6px', lineHeight: 1.3 }}>
              {node.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
              <Badge color={colors.primary} bg={`${colors.primary}12`}>{providerLabel}</Badge>
              <Badge color={theme.textMuted} bg={theme.dividerSubtle}>{node.type}</Badge>
              <Badge color={theme.textMuted} bg={theme.dividerSubtle}>{node.region}</Badge>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <span style={{ fontSize: '13px' }}>×</span>
          </button>
        </div>
      </div>

      {/* Status + Cost row */}
      <div style={{
        padding: '12px 18px',
        borderBottom: `1px solid ${colors.primary}08`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 10px ${statusColor}80`,
            animation: node.status === 'error' ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: '12px', color: statusColor, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 500 }}>
            {node.status}
          </span>
        </div>
        {cost && (
          <div style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#e0e0e0',
            background: theme.dividerSubtle,
            padding: '3px 10px',
            borderRadius: '6px',
            border: `1px solid ${theme.dividerSubtle}`,
          }}>
            {cost}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div style={{ padding: '8px 18px 14px' }}>
        {metaEntries.map(([key, value]) => (
          <div key={key} style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 0',
            borderBottom: `1px solid ${theme.dividerSubtle}`,
            fontSize: '11px',
            gap: '12px',
          }}>
            <span style={{ color: theme.textTertiary, flexShrink: 0 }}>{key}</span>
            <span style={{
              color: theme.textSecondary,
              textAlign: 'right',
              wordBreak: 'break-all',
              maxWidth: '220px',
              fontFamily: key.includes('arn') || key.includes('resourceId') || key.includes('selfLink')
                ? "'IBM Plex Mono', monospace" : 'inherit',
              fontSize: key.includes('arn') || key.includes('resourceId') ? '9px' : '11px',
              lineHeight: key.includes('arn') || key.includes('resourceId') ? '1.5' : 'inherit',
            }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Footer badges */}
      <div style={{
        padding: '10px 18px 16px',
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
      }}>
        <Badge color={colors.primary} bg={`${colors.primary}08`} border={`${colors.primary}25`}>
          {node.category}
        </Badge>
        <Badge color={theme.textTertiary} bg={theme.dividerSubtle} border={theme.dividerSubtle}>
          importance: {node.importance}/10
        </Badge>
        {node.parent && (
          <Badge color={theme.textMuted} bg={theme.dividerSubtle} border={theme.dividerSubtle}>
            ↑ {node.parent}
          </Badge>
        )}
      </div>
    </div>
  )
}

function Badge({ children, color, bg, border }: {
  children: React.ReactNode; color: string; bg: string; border?: string
}) {
  return (
    <span style={{
      fontSize: '10px',
      color,
      background: bg,
      padding: '2px 8px',
      borderRadius: '4px',
      border: `1px solid ${border || bg}`,
      letterSpacing: '0.5px',
    }}>
      {children}
    </span>
  )
}

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid currentColor',
  borderRadius: '6px',
  color: 'inherit',
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: '11px',
  fontFamily: "'IBM Plex Mono', monospace",
  lineHeight: '18px',
  opacity: 0.4,
}
