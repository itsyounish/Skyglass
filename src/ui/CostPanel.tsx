import { useMemo } from 'react'
import type { InfraGraph, Provider, NodeCategory } from '../types'
import { PROVIDER_COLORS, COST_HEAT_COLORS, COST_THRESHOLDS } from '../constants'
import { useTheme, providerLabelColor } from '../theme'

interface CostPanelProps {
  graph: InfraGraph
  visible: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Cost parsing
// ---------------------------------------------------------------------------

function parseCost(metadata: Record<string, string>): number {
  const cost = metadata.cost
  if (!cost) return 0
  const match = cost.match(/\$?([\d,]+\.?\d*)/)
  return match ? parseFloat(match[1].replace(',', '')) : 0
}

function formatCost(value: number): string {
  if (value >= 1000) {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }
  return `$${value.toFixed(2)}`
}

function costHeatColor(cost: number): string {
  if (cost <= 0) return '#333'
  if (cost < COST_THRESHOLDS.low) return COST_HEAT_COLORS.low
  if (cost <= COST_THRESHOLDS.high) return COST_HEAT_COLORS.medium
  return COST_HEAT_COLORS.high
}

// ---------------------------------------------------------------------------
// Aggregation types
// ---------------------------------------------------------------------------

interface CostBreakdown {
  totalCost: number
  byProvider: Record<Provider, number>
  byCategory: Record<string, number>
  byRegion: Record<string, number>
  topResources: Array<{ id: string; label: string; provider: Provider; cost: number; type: string }>
}

function aggregateCosts(graph: InfraGraph): CostBreakdown {
  const byProvider: Record<Provider, number> = { aws: 0, azure: 0, gcp: 0 }
  const byCategory: Record<string, number> = {}
  const byRegion: Record<string, number> = {}
  const resources: Array<{ id: string; label: string; provider: Provider; cost: number; type: string }> = []
  let totalCost = 0

  for (const node of graph.nodes) {
    const cost = parseCost(node.metadata)
    if (cost <= 0) continue

    totalCost += cost
    byProvider[node.provider] += cost
    byCategory[node.category] = (byCategory[node.category] || 0) + cost
    byRegion[node.region] = (byRegion[node.region] || 0) + cost
    resources.push({ id: node.id, label: node.label, provider: node.provider, cost, type: node.type })
  }

  // Sort by cost descending, take top 5
  resources.sort((a, b) => b.cost - a.cost)
  const topResources = resources.slice(0, 5)

  return { totalCost, byProvider, byCategory, byRegion, topResources }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CostPanel({ graph, visible, onClose }: CostPanelProps) {
  const { theme } = useTheme()
  const breakdown = useMemo(() => aggregateCosts(graph), [graph])

  if (!visible) return null

  const maxProviderCost = Math.max(...Object.values(breakdown.byProvider), 1)
  const maxCategoryCost = Math.max(...Object.values(breakdown.byCategory), 1)

  // Sort categories by cost descending
  const sortedCategories = Object.entries(breakdown.byCategory)
    .sort(([, a], [, b]) => b - a)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '380px',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        background: theme.panelBg,
        border: `1px solid ${theme.panelBorder}`,
        borderRadius: '10px',
        fontFamily: "'IBM Plex Mono', monospace",
        color: theme.textPrimary,
        backdropFilter: 'blur(16px)',
        boxShadow: theme.panelShadow,
        animation: 'slideIn 0.25s ease-out',
        zIndex: 100,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '16px 18px 12px',
        borderBottom: `1px solid ${theme.panelBorder}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{
            fontSize: '11px',
            color: theme.textTertiary,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}>
            COST OVERVIEW
          </div>
          <div style={{
            fontSize: '24px',
            fontWeight: 500,
            color: costHeatColor(breakdown.totalCost),
            letterSpacing: '-0.5px',
          }}>
            {formatCost(breakdown.totalCost)}<span style={{ fontSize: '12px', color: theme.textTertiary, fontWeight: 400 }}>/mo</span>
          </div>
        </div>
        <button onClick={onClose} style={closeBtnStyle}>
          <span style={{ fontSize: '13px' }}>x</span>
        </button>
      </div>

      {/* Provider breakdown */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${theme.dividerSubtle}` }}>
        <div style={{
          fontSize: '9px',
          color: theme.textTertiary,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          marginBottom: '10px',
        }}>
          BY PROVIDER
        </div>
        {(['aws', 'azure', 'gcp'] as Provider[]).map((provider) => {
          const cost = breakdown.byProvider[provider]
          const pct = maxProviderCost > 0 ? (cost / maxProviderCost) * 100 : 0
          const colors = PROVIDER_COLORS[provider]
          const label = { aws: 'AWS', azure: 'Azure', gcp: 'GCP' }[provider]

          return (
            <div key={provider} style={{ marginBottom: '8px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '3px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: colors.primary,
                    boxShadow: `0 0 4px ${colors.primary}`,
                  }} />
                  <span style={{ fontSize: '11px', color: providerLabelColor(theme, provider) }}>{label}</span>
                </div>
                <span style={{
                  fontSize: '11px',
                  color: cost > 0 ? theme.textSecondary : theme.textDim,
                  fontWeight: cost > 0 ? 500 : 400,
                }}>
                  {formatCost(cost)}
                </span>
              </div>
              {/* CSS bar */}
              <div style={{
                width: '100%',
                height: '4px',
                background: theme.barBg,
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${colors.dim}, ${colors.primary})`,
                  borderRadius: '2px',
                  transition: 'width 0.4s ease-out',
                }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Category breakdown */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${theme.dividerSubtle}` }}>
        <div style={{
          fontSize: '9px',
          color: theme.textTertiary,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          marginBottom: '10px',
        }}>
          BY CATEGORY
        </div>
        {sortedCategories.map(([category, cost]) => {
          const pct = maxCategoryCost > 0 ? (cost / maxCategoryCost) * 100 : 0
          return (
            <div key={category} style={{ marginBottom: '6px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2px',
              }}>
                <span style={{ fontSize: '10px', color: theme.textTertiary }}>{category}</span>
                <span style={{ fontSize: '10px', color: theme.textMuted }}>{formatCost(cost)}</span>
              </div>
              <div style={{
                width: '100%',
                height: '3px',
                background: theme.barBg,
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: costHeatColor(cost),
                  borderRadius: '2px',
                  opacity: 0.7,
                  transition: 'width 0.4s ease-out',
                }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Top 5 most expensive resources */}
      <div style={{ padding: '14px 18px' }}>
        <div style={{
          fontSize: '9px',
          color: theme.textTertiary,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          marginBottom: '10px',
        }}>
          TOP 5 RESOURCES
        </div>
        {breakdown.topResources.map((resource, i) => {
          const colors = PROVIDER_COLORS[resource.provider]
          const pct = breakdown.totalCost > 0
            ? (resource.cost / breakdown.totalCost) * 100
            : 0

          return (
            <div key={resource.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 0',
              borderBottom: i < breakdown.topResources.length - 1 ? `1px solid ${theme.dividerSubtle}` : 'none',
            }}>
              <span style={{
                fontSize: '9px',
                color: theme.textDim,
                fontWeight: 500,
                minWidth: '14px',
              }}>
                {i + 1}
              </span>
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: colors.primary,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '11px',
                  color: theme.textSecondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {resource.label}
                </div>
                <div style={{ fontSize: '9px', color: theme.textMuted }}>{resource.type}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: costHeatColor(resource.cost),
                }}>
                  {formatCost(resource.cost)}
                </div>
                <div style={{ fontSize: '8px', color: theme.textMuted }}>{pct.toFixed(1)}%</div>
              </div>
            </div>
          )
        })}

        {breakdown.topResources.length === 0 && (
          <div style={{ fontSize: '10px', color: theme.textDim, textAlign: 'center', padding: '12px 0' }}>
            No cost data available
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 18px',
        borderTop: `1px solid ${theme.panelBorder}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '9px', color: theme.textDim }}>
          {graph.nodes.filter(n => parseCost(n.metadata) > 0).length} / {graph.nodes.length} resources with cost data
        </span>
        <kbd style={{
          display: 'inline-block',
          background: theme.kbdBg,
          border: `1px solid ${theme.kbdBorder}`,
          borderRadius: '3px',
          padding: '0px 5px',
          fontSize: '9px',
          color: theme.kbdText,
          minWidth: '20px',
          textAlign: 'center',
        }}>C</kbd>
      </div>
    </div>
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
