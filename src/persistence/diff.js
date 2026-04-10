/**
 * Diff engine for comparing two InfraGraph snapshots.
 *
 * Compares nodes by ID. For nodes present in both graphs, detects changes
 * in metadata entries, status, and importance. Edges are compared by ID.
 *
 * This module is server-side only — never imported in the browser bundle.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Map of nodes keyed by their id for O(1) lookup.
 * @param {Array<object>} nodes
 * @returns {Map<string, object>}
 */
function indexById(nodes) {
  const map = new Map()
  for (const node of nodes) {
    map.set(node.id, node)
  }
  return map
}

/**
 * Compare two nodes and return a record of changed fields.
 * Only checks metadata (key-by-key), status, and importance.
 *
 * @param {object} before
 * @param {object} after
 * @returns {Record<string, { old: string, new: string }>|null} null if no changes
 */
function compareNodes(before, after) {
  const changes = {}

  // Status
  if (before.status !== after.status) {
    changes['status'] = { old: String(before.status), new: String(after.status) }
  }

  // Importance
  if (before.importance !== after.importance) {
    changes['importance'] = { old: String(before.importance), new: String(after.importance) }
  }

  // Label
  if (before.label !== after.label) {
    changes['label'] = { old: String(before.label), new: String(after.label) }
  }

  // Region
  if (before.region !== after.region) {
    changes['region'] = { old: String(before.region), new: String(after.region) }
  }

  // Category
  if (before.category !== after.category) {
    changes['category'] = { old: String(before.category), new: String(after.category) }
  }

  // Metadata: compare all keys from both sides
  const beforeMeta = before.metadata || {}
  const afterMeta = after.metadata || {}
  const allMetaKeys = new Set([...Object.keys(beforeMeta), ...Object.keys(afterMeta)])

  for (const key of allMetaKeys) {
    const oldVal = beforeMeta[key] ?? undefined
    const newVal = afterMeta[key] ?? undefined

    if (oldVal !== newVal) {
      const metaKey = `metadata.${key}`
      changes[metaKey] = {
        old: oldVal !== undefined ? String(oldVal) : '(absent)',
        new: newVal !== undefined ? String(newVal) : '(absent)',
      }
    }
  }

  return Object.keys(changes).length > 0 ? changes : null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the diff between two InfraGraph snapshots.
 *
 * @param {{ nodes: Array<object>, edges: Array<object> }} before - The older snapshot
 * @param {{ nodes: Array<object>, edges: Array<object> }} after  - The newer snapshot
 * @returns {{
 *   addedNodes: Array<object>,
 *   removedNodes: Array<object>,
 *   modifiedNodes: Array<{ id: string, changes: Record<string, { old: string, new: string }> }>,
 *   addedEdges: Array<object>,
 *   removedEdges: Array<object>,
 *   summary: { added: number, removed: number, modified: number, unchanged: number }
 * }}
 */
export function diffGraphs(before, after) {
  const beforeNodes = indexById(before.nodes || [])
  const afterNodes = indexById(after.nodes || [])

  const beforeEdgeIds = new Set((before.edges || []).map(e => e.id))
  const afterEdgeIds = new Set((after.edges || []).map(e => e.id))

  // -- Nodes --

  const addedNodes = []
  const removedNodes = []
  const modifiedNodes = []
  let unchanged = 0

  // Nodes in after but not in before = added
  for (const [id, node] of afterNodes) {
    if (!beforeNodes.has(id)) {
      addedNodes.push(node)
    }
  }

  // Nodes in before but not in after = removed
  for (const [id, node] of beforeNodes) {
    if (!afterNodes.has(id)) {
      removedNodes.push(node)
    }
  }

  // Nodes in both = check for modifications
  for (const [id, beforeNode] of beforeNodes) {
    const afterNode = afterNodes.get(id)
    if (!afterNode) continue // already counted as removed

    const changes = compareNodes(beforeNode, afterNode)
    if (changes) {
      modifiedNodes.push({ id, changes })
    } else {
      unchanged++
    }
  }

  // -- Edges --

  const beforeEdgesMap = new Map()
  for (const edge of before.edges || []) {
    beforeEdgesMap.set(edge.id, edge)
  }

  const afterEdgesMap = new Map()
  for (const edge of after.edges || []) {
    afterEdgesMap.set(edge.id, edge)
  }

  const addedEdges = []
  const removedEdges = []

  for (const [id, edge] of afterEdgesMap) {
    if (!beforeEdgeIds.has(id)) {
      addedEdges.push(edge)
    }
  }

  for (const [id, edge] of beforeEdgesMap) {
    if (!afterEdgeIds.has(id)) {
      removedEdges.push(edge)
    }
  }

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    summary: {
      added: addedNodes.length,
      removed: removedNodes.length,
      modified: modifiedNodes.length,
      unchanged,
    },
  }
}
