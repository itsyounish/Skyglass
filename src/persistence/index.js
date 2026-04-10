/**
 * Local persistence layer for skyglass snapshots.
 *
 * Stores scan results as JSON snapshots in ~/.skyglass/snapshots/.
 * Maintains an index.json for fast listing and a "latest" symlink
 * pointing to the most recent snapshot.
 *
 * All functions are synchronous (file I/O on small JSON files).
 * This module is server-side only — never imported in the browser bundle.
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  symlinkSync,
  lstatSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'

const STORE_DIR = join(homedir(), '.skyglass')
const SNAPSHOTS_DIR = join(STORE_DIR, 'snapshots')
const INDEX_FILE = join(STORE_DIR, 'index.json')
const LATEST_LINK = join(STORE_DIR, 'latest')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely read and parse a JSON file. Returns null on any error.
 * @param {string} filePath
 * @returns {any|null}
 */
function readJSON(filePath) {
  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Safely write a JSON file with pretty-printing.
 * @param {string} filePath
 * @param {any} data
 */
function writeJSON(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Read the snapshot index, or create one if it does not exist / is corrupt.
 * @returns {{ latest: string|null, snapshots: Array<object> }}
 */
function readIndex() {
  const data = readJSON(INDEX_FILE)
  if (data && Array.isArray(data.snapshots)) {
    return data
  }
  // Rebuild index from snapshot files on disk
  return rebuildIndex()
}

/**
 * Rebuild index.json by scanning the snapshots directory.
 * This is the recovery path for a corrupt or missing index.
 * @returns {{ latest: string|null, snapshots: Array<object> }}
 */
function rebuildIndex() {
  const index = { latest: null, snapshots: [] }

  if (!existsSync(SNAPSHOTS_DIR)) {
    writeJSON(INDEX_FILE, index)
    return index
  }

  const files = readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.json'))

  for (const file of files) {
    const filePath = join(SNAPSHOTS_DIR, file)
    const data = readJSON(filePath)
    if (!data || !data.meta) continue

    index.snapshots.push(data.meta)
  }

  // Sort newest first
  index.snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  if (index.snapshots.length > 0) {
    index.latest = index.snapshots[0].id
  }

  writeJSON(INDEX_FILE, index)
  return index
}

/**
 * Update the "latest" symlink to point to the given snapshot file.
 * @param {string} snapshotId
 */
function updateLatestLink(snapshotId) {
  const target = join(SNAPSHOTS_DIR, `${snapshotId}.json`)

  try {
    // Remove existing symlink / file
    if (existsSync(LATEST_LINK) || lstatSync(LATEST_LINK).isSymbolicLink()) {
      unlinkSync(LATEST_LINK)
    }
  } catch {
    // lstatSync may throw if path doesn't exist at all — that's fine
  }

  try {
    symlinkSync(target, LATEST_LINK)
  } catch {
    // On Windows or restricted filesystems, symlinks may fail — ignore silently
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the ~/.skyglass/ storage directories and index.
 * Safe to call multiple times — only creates what is missing.
 */
export function initStore() {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true })
  }
  if (!existsSync(SNAPSHOTS_DIR)) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true })
  }
  if (!existsSync(INDEX_FILE)) {
    writeJSON(INDEX_FILE, { latest: null, snapshots: [] })
  }
}

/**
 * Save an InfraGraph as a snapshot on disk.
 *
 * @param {{ nodes: Array<object>, edges: Array<object> }} graph - The scan result
 * @param {object} meta - Partial metadata to merge (providers, regions, scanDurationMs, label)
 * @returns {object} The SnapshotEntry that was created
 */
export function saveSnapshot(graph, meta = {}) {
  initStore()

  const id = generateSnapshotId()
  const timestamp = new Date().toISOString()

  // Derive providers and regions from the graph if not supplied
  const providers = meta.providers || [...new Set(graph.nodes.map(n => n.provider))].sort()
  const regions = meta.regions || [...new Set(graph.nodes.map(n => n.region))].sort()

  /** @type {object} */
  const entry = {
    id,
    timestamp,
    providers,
    regions,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    scanDurationMs: meta.scanDurationMs ?? 0,
    ...(meta.label ? { label: meta.label } : {}),
  }

  // Write snapshot file
  const snapshotPath = join(SNAPSHOTS_DIR, `${id}.json`)
  writeJSON(snapshotPath, { meta: entry, graph })

  // Update index
  const index = readIndex()
  index.snapshots.unshift(entry) // newest first
  index.latest = id
  writeJSON(INDEX_FILE, index)

  // Update symlink
  updateLatestLink(id)

  return entry
}

/**
 * List all snapshots, newest first.
 * @returns {Array<object>}
 */
export function listSnapshots() {
  initStore()
  const index = readIndex()
  return index.snapshots
}

/**
 * Load a specific snapshot by ID.
 * @param {string} id
 * @returns {{ nodes: Array<object>, edges: Array<object> }|null}
 */
export function loadSnapshot(id) {
  initStore()

  const filePath = join(SNAPSHOTS_DIR, `${id}.json`)
  const data = readJSON(filePath)

  if (!data || !data.graph) return null
  return data.graph
}

/**
 * Load the most recent snapshot's graph.
 * @returns {{ nodes: Array<object>, edges: Array<object> }|null}
 */
export function loadLatestSnapshot() {
  initStore()
  const index = readIndex()

  if (!index.latest) return null
  return loadSnapshot(index.latest)
}

/**
 * Delete a snapshot by ID. Returns true if deleted, false if not found.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteSnapshot(id) {
  initStore()

  const filePath = join(SNAPSHOTS_DIR, `${id}.json`)
  if (!existsSync(filePath)) return false

  try {
    unlinkSync(filePath)
  } catch {
    return false
  }

  // Update index
  const index = readIndex()
  index.snapshots = index.snapshots.filter(s => s.id !== id)

  // Update latest pointer
  if (index.latest === id) {
    index.latest = index.snapshots.length > 0 ? index.snapshots[0].id : null
  }
  writeJSON(INDEX_FILE, index)

  // Update symlink if needed
  if (index.latest) {
    updateLatestLink(index.latest)
  } else {
    try { unlinkSync(LATEST_LINK) } catch { /* noop */ }
  }

  return true
}

/**
 * Load the full snapshot file (meta + graph) by ID.
 * @param {string} id
 * @returns {{ meta: object, graph: { nodes: Array<object>, edges: Array<object> } }|null}
 */
export function loadSnapshotFull(id) {
  initStore()

  const filePath = join(SNAPSHOTS_DIR, `${id}.json`)
  const data = readJSON(filePath)

  if (!data || !data.graph || !data.meta) return null
  return data
}

// ---------------------------------------------------------------------------
// Snapshot ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a unique, human-sortable snapshot ID.
 * Format: YYYYMMDD-HHmmss-XXXX (e.g. 20260329-143000-a1b2)
 * @returns {string}
 */
function generateSnapshotId() {
  const now = new Date()
  const pad = (n, len = 2) => String(n).padStart(len, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const suffix = randomUUID().slice(0, 4)
  return `${date}-${time}-${suffix}`
}
