/**
 * In-memory filter / query engine for InfraGraph (v1) and InfraGraphV2.
 *
 * Exports:
 *  - FilterCriteria / filterGraph   — v1 API (kept for backward compatibility)
 *  - FilterSpec / applyFilter       — v2 API, works on v1 InfraGraph
 *  - applyFilterV2                  — v2 API with tag + cost predicates
 */

import type {
  Provider,
  NodeCategory,
  HealthStatus,
  InfraNode,
  InfraEdge,
  InfraGraph,
} from '../types'
import type { InfraNodeV2, InfraGraphV2, ResourceTag } from '../types-v2'

// ---------------------------------------------------------------------------
// v1 filter API (backward-compatible)
// ---------------------------------------------------------------------------

export interface FilterCriteria {
  provider?: Provider
  category?: NodeCategory
  status?: HealthStatus
  /** Free-text search matched against label, type, and region (case-insensitive) */
  search?: string
}

/**
 * Filter an InfraGraph by the given criteria.
 * All supplied criteria are ANDed together.
 * Edges whose source or target is no longer in the filtered node set are removed.
 * An empty/undefined FilterCriteria object returns the full graph unchanged.
 */
export function filterGraph(graph: InfraGraph, criteria: FilterCriteria): InfraGraph {
  let nodes: InfraNode[] = [...graph.nodes]

  if (criteria.provider !== undefined) {
    nodes = nodes.filter((n) => n.provider === criteria.provider)
  }

  if (criteria.category !== undefined) {
    nodes = nodes.filter((n) => n.category === criteria.category)
  }

  if (criteria.status !== undefined) {
    nodes = nodes.filter((n) => n.status === criteria.status)
  }

  if (criteria.search !== undefined && criteria.search.trim() !== '') {
    const term = criteria.search.trim().toLowerCase()
    nodes = nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(term) ||
        n.type.toLowerCase().includes(term) ||
        n.region.toLowerCase().includes(term),
    )
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges: InfraEdge[] = graph.edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  )

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// v2 filter spec types
// ---------------------------------------------------------------------------

export interface TagFilter {
  key: string
  value?: string
  /** When true, the predicate is inverted — match nodes that do NOT have the tag */
  negate?: boolean
}

export interface FilterSpec {
  providers?: Provider[]
  regions?: string[]
  categories?: NodeCategory[]
  types?: string[]
  statuses?: HealthStatus[]
  tags?: TagFilter[]
  cost?: {
    minMonthlyUsd?: number
    maxMonthlyUsd?: number
  }
  minImportance?: number
  searchText?: string
  /**
   * When set, only include the subtree rooted at the given node id.
   * Traversal uses the InfraNode.parent field (child → parent pointer).
   */
  subtreeRootId?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Minimal shape required by subtree traversal — satisfied by both v1 and v2 nodes */
interface HasParent {
  id: string
  parent?: string
}

/**
 * Build a set of node ids that belong to the subtree rooted at `rootId`.
 * Uses InfraNode.parent (child → parent pointer) by building a children map first.
 */
function buildSubtreeIds(nodes: HasParent[], rootId: string): Set<string> {
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.parent) {
      const siblings = children.get(node.parent) ?? []
      siblings.push(node.id)
      children.set(node.parent, siblings)
    }
  }

  const result = new Set<string>()
  const queue: string[] = [rootId]
  while (queue.length > 0) {
    const id = queue.shift()!
    result.add(id)
    const kids = children.get(id)
    if (kids) {
      queue.push(...kids)
    }
  }
  return result
}

interface HasSearchableFields {
  id: string
  label: string
  type: string
  region: string
  metadata: Record<string, string>
}

function matchesSearchText(node: HasSearchableFields, lowerText: string): boolean {
  return (
    node.id.toLowerCase().includes(lowerText) ||
    node.label.toLowerCase().includes(lowerText) ||
    node.type.toLowerCase().includes(lowerText) ||
    node.region.toLowerCase().includes(lowerText) ||
    Object.values(node.metadata).some((v) => v.toLowerCase().includes(lowerText))
  )
}

function matchesTagFilter(tags: ResourceTag[], filter: TagFilter): boolean {
  const found = tags.some(
    (t) =>
      t.key === filter.key && (filter.value === undefined || t.value === filter.value),
  )
  return filter.negate ? !found : found
}

// ---------------------------------------------------------------------------
// applyFilter — works on v1 InfraGraph (tag/cost filters silently skipped)
// ---------------------------------------------------------------------------

/**
 * Returns a new InfraGraph containing only the nodes (and their interconnecting
 * edges) that satisfy every predicate in `filter`.
 *
 * Tag and cost filters are silently skipped when working with v1 nodes
 * since those fields are not present in the v1 schema.
 */
export function applyFilter(graph: InfraGraph, filter: FilterSpec): InfraGraph {
  const {
    providers,
    regions,
    categories,
    types,
    statuses,
    minImportance,
    searchText,
    subtreeRootId,
  } = filter

  const subtreeIds =
    subtreeRootId != null ? buildSubtreeIds(graph.nodes, subtreeRootId) : null

  const lowerText = searchText?.toLowerCase()

  const matchedNodes = graph.nodes.filter((node) => {
    if (subtreeIds && !subtreeIds.has(node.id)) return false
    if (providers && !providers.includes(node.provider)) return false
    if (regions && !regions.includes(node.region)) return false
    if (categories && !categories.includes(node.category)) return false
    if (types && !types.includes(node.type)) return false
    if (statuses && !statuses.includes(node.status)) return false
    if (minImportance != null && node.importance < minImportance) return false
    if (lowerText && !matchesSearchText(node, lowerText)) return false
    return true
  })

  const matchedIds = new Set(matchedNodes.map((n) => n.id))

  const matchedEdges = graph.edges.filter(
    (e) => matchedIds.has(e.source) && matchedIds.has(e.target),
  )

  return { nodes: matchedNodes, edges: matchedEdges }
}

// ---------------------------------------------------------------------------
// applyFilterV2 — InfraGraphV2 with full tag + cost support
// ---------------------------------------------------------------------------

function matchesTagFilterV2(node: InfraNodeV2, filter: TagFilter): boolean {
  // Fast path: use the pre-built tagIndex when a specific value is requested
  if (node.tagIndex && filter.value !== undefined) {
    const found = node.tagIndex[filter.key] === filter.value
    return filter.negate ? !found : found
  }
  return matchesTagFilter(node.tags ?? [], filter)
}

function matchesSearchTextV2(node: InfraNodeV2, lowerText: string): boolean {
  if (matchesSearchText(node, lowerText)) return true
  // Also search inside tag keys/values
  return !!(node.tags?.some(
    (t) =>
      t.key.toLowerCase().includes(lowerText) ||
      t.value.toLowerCase().includes(lowerText),
  ))
}

export function applyFilterV2(graph: InfraGraphV2, filter: FilterSpec): InfraGraphV2 {
  const {
    providers,
    regions,
    categories,
    types,
    statuses,
    tags,
    cost,
    minImportance,
    searchText,
    subtreeRootId,
  } = filter

  const subtreeIds =
    subtreeRootId != null ? buildSubtreeIds(graph.nodes, subtreeRootId) : null

  const lowerText = searchText?.toLowerCase()

  const matchedNodes = graph.nodes.filter((node) => {
    if (subtreeIds && !subtreeIds.has(node.id)) return false
    if (providers && !providers.includes(node.provider)) return false
    if (regions && !regions.includes(node.region)) return false
    if (categories && !categories.includes(node.category as NodeCategory)) return false
    if (types && !types.includes(node.type)) return false
    if (statuses && !statuses.includes(node.status)) return false
    if (minImportance != null && node.importance < minImportance) return false

    if (tags) {
      const allMatch = tags.every((tf) => matchesTagFilterV2(node, tf))
      if (!allMatch) return false
    }

    if (cost) {
      const monthly = node.cost?.monthlyUsd
      if (monthly !== undefined) {
        if (cost.minMonthlyUsd != null && monthly < cost.minMonthlyUsd) return false
        if (cost.maxMonthlyUsd != null && monthly > cost.maxMonthlyUsd) return false
      } else if (cost.minMonthlyUsd != null) {
        // No cost data but caller requires a minimum — exclude
        return false
      }
    }

    if (lowerText && !matchesSearchTextV2(node, lowerText)) return false
    return true
  })

  const matchedIds = new Set(matchedNodes.map((n) => n.id))

  const matchedEdges = graph.edges.filter(
    (e) => matchedIds.has(e.source) && matchedIds.has(e.target),
  )

  return { ...graph, nodes: matchedNodes, edges: matchedEdges }
}
