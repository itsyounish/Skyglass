/**
 * Web Worker for 2D force-directed layout with Barnes-Hut quadtree.
 *
 * Runs the full 2D force simulation off the main thread. Charge repulsion
 * uses a quadtree for O(n log n) complexity instead of O(n^2).
 *
 * Compared to the 3D worker:
 *   - Positions are Float32Array with [x0, y0, x1, y1, ...] (n*2 elements)
 *   - Quadtree (4 children) instead of octree (8 children)
 *   - No Z axis, no Y-layer force
 *   - Added group containment force (nodes with same parent attract to group centroid)
 *   - Added category lane force (gentle Y-band nudge per category)
 *   - Slower alpha decay (0.005) for more settling time
 *
 * Protocol:
 *   Main -> Worker: { type: 'init', nodes, links, config }
 *   Main -> Worker: { type: 'stop' }
 *   Worker -> Main: { type: 'positions', positions: Float32Array }  (Transferable)
 *   Worker -> Main: { type: 'settled' }
 */

// Type-safe wrapper for Worker global scope.
// The main tsconfig includes "DOM" but not "WebWorker", so we declare a minimal
// interface to avoid conflicts while keeping the worker code type-safe.
interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void
  postMessage(message: unknown): void
  onmessage: ((e: MessageEvent) => void) | null
}
const workerSelf = self as unknown as WorkerScope

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface SimNodeData2D {
  provider: string
  category: string
  parent: string | undefined
  x: number
  y: number
}

interface LinkData {
  source: number
  target: number
}

interface ForceConfig2D {
  chargeStrength: number              // -300
  linkDistance: number                 // 120
  centerStrength: number              // 0.03
  clusterStrength: number             // 0.08
  groupContainmentStrength: number    // 0.12
  categoryLaneStrength: number        // 0.03
  providerCenters: Record<string, [number, number]>
  categoryLanes: Record<string, number>  // category -> target Y position
}

interface InitMessage {
  type: 'init'
  nodes: SimNodeData2D[]
  links: LinkData[]
  config: ForceConfig2D
}

interface StopMessage {
  type: 'stop'
}

type IncomingMessage = InitMessage | StopMessage

// ---------------------------------------------------------------------------
// Barnes-Hut Quadtree
// ---------------------------------------------------------------------------

interface QuadtreeNode {
  // Bounding box: center + half-width
  cx: number
  cy: number
  size: number
  // Body index if this is a leaf with a single body; -1 otherwise
  bodyIndex: number
  // Aggregate mass and center of mass
  totalMass: number
  comX: number
  comY: number
  // 4 children (quadrants), null if empty
  children: (QuadtreeNode | null)[]
}

function createQuadtreeNode(cx: number, cy: number, size: number): QuadtreeNode {
  return {
    cx, cy, size,
    bodyIndex: -1,
    totalMass: 0,
    comX: 0, comY: 0,
    children: [null, null, null, null],
  }
}

/**
 * Determine which quadrant (0-3) a point falls into relative to the node center.
 * Quadrant index is a 2-bit number: bit0 = x >= cx, bit1 = y >= cy.
 */
function quadrantIndex(cx: number, cy: number, px: number, py: number): number {
  let idx = 0
  if (px >= cx) idx |= 1
  if (py >= cy) idx |= 2
  return idx
}

function childCenter(parentCx: number, parentCy: number, parentSize: number, quadrant: number): [number, number, number] {
  const half = parentSize * 0.5
  const cx = parentCx + ((quadrant & 1) ? half : -half)
  const cy = parentCy + ((quadrant & 2) ? half : -half)
  return [cx, cy, half]
}

function insertBody(node: QuadtreeNode, index: number, px: number, py: number, depth: number): void {
  // Safety: prevent infinite recursion on coincident points
  if (depth > 40) return

  if (node.totalMass === 0) {
    // Empty node: place body here
    node.bodyIndex = index
    node.totalMass = 1
    node.comX = px
    node.comY = py
    return
  }

  if (node.bodyIndex !== -1) {
    // Leaf with an existing body: subdivide
    const existingIdx = node.bodyIndex
    const ex = node.comX
    const ey = node.comY
    node.bodyIndex = -1

    // Re-insert the existing body into a child
    const qE = quadrantIndex(node.cx, node.cy, ex, ey)
    if (node.children[qE] === null) {
      const [ccx, ccy, cs] = childCenter(node.cx, node.cy, node.size, qE)
      node.children[qE] = createQuadtreeNode(ccx, ccy, cs)
    }
    insertBody(node.children[qE]!, existingIdx, ex, ey, depth + 1)
  }

  // Update aggregate
  const newMass = node.totalMass + 1
  node.comX = (node.comX * node.totalMass + px) / newMass
  node.comY = (node.comY * node.totalMass + py) / newMass
  node.totalMass = newMass

  // Insert new body into the appropriate child
  const q = quadrantIndex(node.cx, node.cy, px, py)
  if (node.children[q] === null) {
    const [ccx, ccy, cs] = childCenter(node.cx, node.cy, node.size, q)
    node.children[q] = createQuadtreeNode(ccx, ccy, cs)
  }
  insertBody(node.children[q]!, index, px, py, depth + 1)
}

function buildQuadtree(positions: Float32Array, n: number): QuadtreeNode {
  // Find bounding box
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (let i = 0; i < n; i++) {
    const x = positions[i * 2]
    const y = positions[i * 2 + 1]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  // Make it a square (quadtree needs uniform dimensions)
  const cx = (minX + maxX) * 0.5
  const cy = (minY + maxY) * 0.5
  const size = Math.max(maxX - minX, maxY - minY) * 0.5 + 1.0

  const root = createQuadtreeNode(cx, cy, size)

  for (let i = 0; i < n; i++) {
    insertBody(root, i, positions[i * 2], positions[i * 2 + 1], 0)
  }

  return root
}

/**
 * Compute the repulsive force on a point (px, py) from the quadtree.
 * Returns [fx, fy].
 * Uses the Barnes-Hut approximation: if cell_size / distance < theta,
 * treat the entire cell as a single body at its center of mass.
 */
function computeForce(
  node: QuadtreeNode,
  px: number, py: number,
  bodyIndex: number,
  theta: number,
  chargeStrength: number,
  alpha: number,
): [number, number] {
  if (node.totalMass === 0) return [0, 0]

  const dx = node.comX - px
  const dy = node.comY - py
  const dist2 = dx * dx + dy * dy + 0.01
  const dist = Math.sqrt(dist2)

  // If this is a leaf with a single body
  if (node.bodyIndex !== -1) {
    if (node.bodyIndex === bodyIndex) return [0, 0] // skip self
    const force = (-chargeStrength * alpha) / dist2
    return [
      (dx / dist) * force,
      (dy / dist) * force,
    ]
  }

  // Barnes-Hut criterion: if cell is far enough away, approximate
  const cellWidth = node.size * 2
  if (cellWidth / dist < theta) {
    const force = (-chargeStrength * alpha * node.totalMass) / dist2
    return [
      (dx / dist) * force,
      (dy / dist) * force,
    ]
  }

  // Otherwise, recurse into children
  let fx = 0, fy = 0
  for (let i = 0; i < 4; i++) {
    const child = node.children[i]
    if (child !== null) {
      const [cfx, cfy] = computeForce(child, px, py, bodyIndex, theta, chargeStrength, alpha)
      fx += cfx
      fy += cfy
    }
  }
  return [fx, fy]
}

// ---------------------------------------------------------------------------
// Group centroid cache
// ---------------------------------------------------------------------------

/** Recompute group centroids from current positions. */
function computeGroupCentroids(
  simNodes: SimNodeData2D[],
  positions: Float32Array,
  n: number,
): Map<string, { cx: number; cy: number; count: number }> {
  const groups = new Map<string, { cx: number; cy: number; count: number }>()

  for (let i = 0; i < n; i++) {
    const parent = simNodes[i].parent
    if (parent === undefined) continue

    let g = groups.get(parent)
    if (!g) {
      g = { cx: 0, cy: 0, count: 0 }
      groups.set(parent, g)
    }
    g.cx += positions[i * 2]
    g.cy += positions[i * 2 + 1]
    g.count++
  }

  // Finalize centroids
  for (const g of groups.values()) {
    g.cx /= g.count
    g.cy /= g.count
  }

  return groups
}

// ---------------------------------------------------------------------------
// Simulation state
// ---------------------------------------------------------------------------

let intervalId: ReturnType<typeof setInterval> | null = null
let simNodes: SimNodeData2D[] = []
let simLinks: LinkData[] = []
let positions: Float32Array = new Float32Array(0)
let velocities: Float32Array = new Float32Array(0)
let config: ForceConfig2D | null = null
let alpha = 1
let tickCount = 0

const THETA = 0.7          // Barnes-Hut opening angle
const ALPHA_DECAY = 0.005  // Slower than 3D to give more time to settle
const DAMPING = 0.55
const TICK_INTERVAL_MS = 8  // ~120 Hz simulation

function tick(): void {
  if (config === null) return
  const n = simNodes.length
  if (n === 0) return

  const chargeStrength = Math.abs(config.chargeStrength)

  // --- Compute group centroids for containment force ---
  const groupCentroids = computeGroupCentroids(simNodes, positions, n)

  // --- Center force + Provider cluster + Category lane + Group containment ---
  for (let i = 0; i < n; i++) {
    const node = simNodes[i]
    const px = positions[i * 2]
    const py = positions[i * 2 + 1]

    let vx = velocities[i * 2]
    let vy = velocities[i * 2 + 1]

    // 1. Center pull
    vx -= px * config.centerStrength * alpha
    vy -= py * config.centerStrength * alpha

    // 2. Provider cluster
    const center = config.providerCenters[node.provider]
    if (center) {
      vx += (center[0] - px) * config.clusterStrength * alpha
      vy += (center[1] - py) * config.clusterStrength * alpha
    }

    // 3. Category lane force: nudge toward target Y band
    const targetY = config.categoryLanes[node.category]
    if (targetY !== undefined) {
      vy += (targetY - py) * config.categoryLaneStrength * alpha
    }

    // 4. Group containment force: attract toward parent group centroid
    if (node.parent !== undefined) {
      const g = groupCentroids.get(node.parent)
      if (g) {
        vx += (g.cx - px) * config.groupContainmentStrength * alpha
        vy += (g.cy - py) * config.groupContainmentStrength * alpha
      }
    }

    velocities[i * 2] = vx
    velocities[i * 2 + 1] = vy
  }

  // --- 5. Charge repulsion via Barnes-Hut quadtree ---
  const tree = buildQuadtree(positions, n)
  for (let i = 0; i < n; i++) {
    const px = positions[i * 2]
    const py = positions[i * 2 + 1]

    const [fx, fy] = computeForce(tree, px, py, i, THETA, chargeStrength, alpha)
    velocities[i * 2] += fx
    velocities[i * 2 + 1] += fy
  }

  // --- 6. Link spring force ---
  for (let li = 0; li < simLinks.length; li++) {
    const link = simLinks[li]
    const si = link.source
    const ti = link.target

    const sx = positions[si * 2]
    const sy = positions[si * 2 + 1]
    const tx = positions[ti * 2]
    const ty = positions[ti * 2 + 1]

    const dx = tx - sx
    const dy = ty - sy
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const force = ((dist - config.linkDistance) / dist) * 0.05 * alpha

    velocities[si * 2] += dx * force
    velocities[si * 2 + 1] += dy * force

    velocities[ti * 2] -= dx * force
    velocities[ti * 2 + 1] -= dy * force
  }

  // --- 7. Damping + 8. Integration ---
  for (let i = 0; i < n; i++) {
    velocities[i * 2] *= DAMPING
    velocities[i * 2 + 1] *= DAMPING

    positions[i * 2] += velocities[i * 2]
    positions[i * 2 + 1] += velocities[i * 2 + 1]
  }

  // --- 9. Alpha decay ---
  alpha = Math.max(alpha - ALPHA_DECAY, 0)
  tickCount++

  // Post positions every 2 ticks to avoid overwhelming the main thread
  if (tickCount % 2 === 0) {
    // Copy positions into a new buffer for Transferable
    const buf = new Float32Array(positions.length)
    buf.set(positions)
    const msg: { type: 'positions'; positions: Float32Array } = {
      type: 'positions',
      positions: buf,
    }
    workerSelf.postMessage(msg, [buf.buffer])
  }

  if (alpha <= 0) {
    // Send final positions and settled signal
    const finalBuf = new Float32Array(positions.length)
    finalBuf.set(positions)
    const posMsg: { type: 'positions'; positions: Float32Array } = {
      type: 'positions',
      positions: finalBuf,
    }
    workerSelf.postMessage(posMsg, [finalBuf.buffer])
    workerSelf.postMessage({ type: 'settled' })
    stopSimulation()
  }
}

function stopSimulation(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function startSimulation(msg: InitMessage): void {
  stopSimulation()

  simNodes = msg.nodes
  simLinks = msg.links
  config = msg.config

  const n = simNodes.length
  positions = new Float32Array(n * 2)
  velocities = new Float32Array(n * 2)
  alpha = 1
  tickCount = 0

  // Copy initial positions
  for (let i = 0; i < n; i++) {
    positions[i * 2] = simNodes[i].x
    positions[i * 2 + 1] = simNodes[i].y
  }

  // Send initial positions immediately
  const initBuf = new Float32Array(positions.length)
  initBuf.set(positions)
  const initMsg: { type: 'positions'; positions: Float32Array } = {
    type: 'positions',
    positions: initBuf,
  }
  workerSelf.postMessage(initMsg, [initBuf.buffer])

  // Start simulation loop
  intervalId = setInterval(tick, TICK_INTERVAL_MS)
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

workerSelf.onmessage = (e: MessageEvent<IncomingMessage>) => {
  const msg = e.data
  switch (msg.type) {
    case 'init':
      startSimulation(msg)
      break
    case 'stop':
      stopSimulation()
      break
  }
}
