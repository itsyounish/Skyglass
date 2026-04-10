/**
 * Export utilities for InfraGraph data.
 *
 * Supports three output formats:
 *   - JSON  (pretty-printed, faithful representation)
 *   - DOT   (Graphviz digraph, clustered by provider)
 *   - CSV   (flat table of nodes, one row per resource)
 *
 * This module is server-side only — never imported in the browser bundle.
 */

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

/**
 * Export an InfraGraph as pretty-printed JSON.
 *
 * @param {{ nodes: Array<object>, edges: Array<object> }} graph
 * @returns {string}
 */
export function exportJSON(graph) {
  return JSON.stringify(graph, null, 2)
}

// ---------------------------------------------------------------------------
// DOT (Graphviz) export
// ---------------------------------------------------------------------------

/**
 * Escape a string for use inside a DOT label.
 * @param {string} s
 * @returns {string}
 */
function dotEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

/**
 * Map providers to Graphviz-friendly colors.
 */
const DOT_PROVIDER_COLORS = {
  aws: '#ff9900',
  azure: '#0078d4',
  gcp: '#34a853',
}

/**
 * Map edge types to Graphviz styles.
 */
const DOT_EDGE_STYLES = {
  network: { color: '#10b981', style: 'solid' },
  data: { color: '#06b6d4', style: 'dashed' },
  dependency: { color: '#8b5cf6', style: 'dotted' },
  'cross-cloud': { color: '#ef4444', style: 'bold' },
}

/**
 * Map node status to DOT shape style.
 */
const DOT_STATUS_SHAPE = {
  healthy: 'ellipse',
  warning: 'diamond',
  error: 'doubleoctagon',
}

/**
 * Export an InfraGraph as a DOT (Graphviz) digraph.
 * Nodes are clustered by provider, colored by provider, and shaped by status.
 *
 * @param {{ nodes: Array<object>, edges: Array<object> }} graph
 * @returns {string}
 */
export function exportDOT(graph) {
  const lines = []

  lines.push('digraph skyglass {')
  lines.push('  rankdir=LR;')
  lines.push('  bgcolor="#0a0a14";')
  lines.push('  node [style=filled, fontname="Helvetica", fontcolor="white", fontsize=10];')
  lines.push('  edge [fontname="Helvetica", fontsize=8, fontcolor="#999999"];')
  lines.push('')

  // Group nodes by provider for subgraph clusters
  const byProvider = new Map()
  for (const node of graph.nodes) {
    if (!byProvider.has(node.provider)) {
      byProvider.set(node.provider, [])
    }
    byProvider.get(node.provider).push(node)
  }

  for (const [provider, nodes] of byProvider) {
    const color = DOT_PROVIDER_COLORS[provider] || '#cccccc'
    lines.push(`  subgraph cluster_${provider} {`)
    lines.push(`    label="${dotEscape(provider.toUpperCase())}";`)
    lines.push(`    color="${color}";`)
    lines.push(`    fontcolor="${color}";`)
    lines.push(`    style=dashed;`)
    lines.push('')

    for (const node of nodes) {
      const shape = DOT_STATUS_SHAPE[node.status] || 'ellipse'
      const fillColor = color
      const label = `${dotEscape(node.label)}\\n[${dotEscape(node.category)}]\\n${dotEscape(node.region)}`
      lines.push(`    "${dotEscape(node.id)}" [label="${label}", shape=${shape}, fillcolor="${fillColor}"];`)
    }

    lines.push('  }')
    lines.push('')
  }

  // Edges
  for (const edge of graph.edges) {
    const edgeStyle = DOT_EDGE_STYLES[edge.type] || { color: '#666666', style: 'solid' }
    const labelStr = edge.label ? `, label="${dotEscape(edge.label)}"` : ''
    lines.push(`  "${dotEscape(edge.source)}" -> "${dotEscape(edge.target)}" [color="${edgeStyle.color}", style=${edgeStyle.style}${labelStr}];`)
  }

  lines.push('}')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * Escape a value for CSV output. Wraps in quotes if it contains commas,
 * quotes, or newlines.
 * @param {string} value
 * @returns {string}
 */
function csvEscape(value) {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * Export an InfraGraph as CSV (nodes table).
 * Each row represents one InfraNode. Metadata is serialized as a JSON string
 * in a single column for simplicity.
 *
 * @param {{ nodes: Array<object>, edges: Array<object> }} graph
 * @returns {string}
 */
export function exportCSV(graph) {
  const headers = [
    'id',
    'label',
    'provider',
    'type',
    'category',
    'region',
    'status',
    'importance',
    'parent',
    'metadata',
  ]

  const rows = [headers.join(',')]

  for (const node of graph.nodes) {
    const metadataStr = JSON.stringify(node.metadata || {})
    const row = [
      csvEscape(node.id),
      csvEscape(node.label),
      csvEscape(node.provider),
      csvEscape(node.type),
      csvEscape(node.category),
      csvEscape(node.region),
      csvEscape(node.status),
      csvEscape(node.importance),
      csvEscape(node.parent || ''),
      csvEscape(metadataStr),
    ]
    rows.push(row.join(','))
  }

  // Add a blank line separator then edges
  rows.push('')
  rows.push('# Edges')

  const edgeHeaders = ['id', 'source', 'target', 'type', 'label']
  rows.push(edgeHeaders.join(','))

  for (const edge of graph.edges) {
    const row = [
      csvEscape(edge.id),
      csvEscape(edge.source),
      csvEscape(edge.target),
      csvEscape(edge.type),
      csvEscape(edge.label || ''),
    ]
    rows.push(row.join(','))
  }

  return rows.join('\n')
}
