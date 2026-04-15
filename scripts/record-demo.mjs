#!/usr/bin/env node
/**
 * record-demo.mjs — Cinematic demo recorder for skyglass.
 *
 * Tells the story of a cloud architect's morning workflow:
 *   graph reveal → cost audit → incident hunt → blast radius → galaxy view
 *
 * Usage:
 *   npm run build && node scripts/record-demo.mjs [--headed]
 */

import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, unlinkSync, renameSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`
const VIDEO_DIR = resolve(ROOT, 'docs', 'assets')

const headed = process.argv.includes('--headed')

// ═══════════════════════════════════════════════════════════════════
//  Timing constants (ms) — tune these for perfect pacing
// ═══════════════════════════════════════════════════════════════════

const LAYOUT_SETTLE   = 6500   // force layout converges
const BEAT            = 300    // micro-pause between actions
const HOLD_SHORT      = 1200   // quick glance
const HOLD_MEDIUM     = 2200   // read a tooltip
const HOLD_LONG       = 3500   // absorb a panel
const HOLD_HERO       = 4500   // the money shot
const GLIDE_FAST      = 500    // quick cursor move
const GLIDE_NORMAL    = 700    // standard cursor move
const GLIDE_CINEMATIC = 1000   // slow dramatic move
const ZOOM_DURATION   = 1200   // smooth zoom transition
const TYPE_DELAY      = 70     // keystroke cadence

// ═══════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Smooth mouse glide with cubic ease-in-out for cinematic feel.
 * Starts slow, accelerates, decelerates into position.
 */
async function glide(page, x1, y1, x2, y2, ms = GLIDE_NORMAL, steps = 50) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // cubic ease-in-out
    const ease = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2
    await page.mouse.move(
      Math.round(x1 + (x2 - x1) * ease),
      Math.round(y1 + (y2 - y1) * ease),
    )
    await sleep(ms / steps)
  }
}

/** Smooth scroll-zoom centered on a point. */
async function zoom(page, x, y, totalDelta, ms = ZOOM_DURATION, steps = 30) {
  const step = totalDelta / steps
  await page.mouse.move(x, y)
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, step)
    await sleep(ms / steps)
  }
}

/**
 * Get a node's CSS-pixel screen position via React fiber traversal.
 * Works on production builds — React keeps fiber/hook internals in all modes.
 */
async function nodePos(page, nodeId) {
  return page.evaluate((id) => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return null
    const key = Object.keys(canvas).find((k) => k.startsWith('__reactFiber$'))
    if (!key) return null
    let fiber = canvas[key]
    for (let d = 0; d < 30 && fiber; d++) {
      if (fiber.memoizedState) {
        let hook = fiber.memoizedState
        for (let h = 0; h < 50 && hook; h++) {
          const ms = hook.memoizedState
          if (ms && typeof ms === 'object' && 'current' in ms &&
              ms.current && ms.current.nodeMap instanceof Map && ms.current.camera) {
            const r = ms.current
            const node = r.nodeMap.get(id)
            if (!node) return null
            const cam = r.camera
            return {
              x: Math.round((node.x - cam.x) * cam.zoom + r.width / 2),
              y: Math.round((node.y - cam.y) * cam.zoom + r.height / 2),
            }
          }
          hook = hook.next
        }
      }
      fiber = fiber.return
    }
    return null
  }, nodeId)
}

/** Glide to a node, return position or null. */
async function glideTo(page, nodeId, fromX, fromY, ms = GLIDE_NORMAL) {
  const pos = await nodePos(page, nodeId)
  if (!pos || pos.x < -50 || pos.x > 1330 || pos.y < -50 || pos.y > 770) {
    console.warn(`  ⚠ ${nodeId} off-screen or not found`)
    return null
  }
  console.log(`  → ${nodeId} (${pos.x}, ${pos.y})`)
  await glide(page, fromX, fromY, pos.x, pos.y, ms)
  return pos
}

/** Poll until server responds. */
async function waitForServer(url, retries = 25, ms = 800) {
  for (let i = 0; i < retries; i++) {
    try { if ((await fetch(url)).ok) return } catch {}
    await sleep(ms)
  }
  throw new Error(`Server at ${url} did not start`)
}

// ═══════════════════════════════════════════════════════════════════
//  THE CHOREOGRAPHY
//  Story: "A cloud architect's morning investigation"
// ═══════════════════════════════════════════════════════════════════

async function choreography(page) {
  let mx = 640, my = 360

  // ── ACT I: THE REVEAL ──────────────────────────────────────────
  // The graph materializes. 141 nodes fly into position.
  // Status bar: "141 resources · 162 edges · $28,182/mo"
  console.log('▸ ACT I — The Reveal')
  await page.waitForSelector('canvas', { timeout: 10000 })
  await sleep(LAYOUT_SETTLE)
  await sleep(HOLD_SHORT) // let it breathe

  // ── ACT II: COST AUDIT ─────────────────────────────────────────
  // "The CFO pinged — how much are we spending?"
  // Opens the cost dashboard showing $28K/mo breakdown.
  console.log('▸ ACT II — Cost Audit')
  await page.keyboard.press('c')
  await sleep(HOLD_HERO) // absorb the full cost panel: provider bars, top 5
  await page.keyboard.press('c')
  await sleep(BEAT)

  // ── ACT III: THE HUNT ──────────────────────────────────────────
  // "PagerDuty fired — something is failing. Let's find it."
  // Search for errors, pinpoint the broken Lambda.
  console.log('▸ ACT III — The Hunt')
  await page.keyboard.press('/')
  await sleep(BEAT)
  await page.keyboard.type('error', { delay: TYPE_DELAY })
  await sleep(HOLD_MEDIUM) // 1 match glows, everything else dims

  // Close search — the error node is now visible
  await page.keyboard.press('Escape')
  await sleep(BEAT * 2)

  // Fly to the error: aws-lambda-etl (TimeoutError, 3.1% failures)
  // Double-click = flyTo + select → camera swoops in, panel slides open
  const etl = await nodePos(page, 'aws-lambda-etl')
  if (etl) {
    await glide(page, mx, my, etl.x, etl.y, GLIDE_CINEMATIC)
    mx = etl.x; my = etl.y
    await sleep(BEAT)
    await page.mouse.dblclick(etl.x, etl.y)
    await sleep(HOLD_HERO) // camera flies, panel shows: ERROR, 3.1%, TimeoutError
  }

  // ── ACT IV: BLAST RADIUS ───────────────────────────────────────
  // "If the primary database goes down, what breaks?"
  // Red cascade shows every dependent service.
  console.log('▸ ACT IV — Blast Radius')
  await page.keyboard.press('Escape')
  await sleep(BEAT)

  // Zoom out to see the full graph for blast radius context
  await zoom(page, 640, 360, 500, ZOOM_DURATION) // zoom out
  await sleep(BEAT * 2)

  // Activate blast mode
  await page.keyboard.press('b')
  await sleep(BEAT * 2)

  // Navigate to the primary database — the most connected node
  const rds = await glideTo(page, 'aws-rds-primary', mx, my, GLIDE_CINEMATIC)
  if (rds) {
    mx = rds.x; my = rds.y
    await sleep(BEAT)
    await page.mouse.click(rds.x, rds.y)
    await sleep(HOLD_HERO) // red cascade: ~15 dependent resources light up
  }

  // ── ACT V: THE GALAXY VIEW ──────────────────────────────────────
  // "Zoom out. See the whole picture."
  // Camera pulls back through semantic zoom tiers until the three
  // provider hulls — AWS amber, Azure blue, GCP green — float
  // on screen with cross-cloud edges pulsing between them.
  console.log('▸ ACT V — The Galaxy View')
  await page.keyboard.press('Escape') // deselects + blast off
  await sleep(BEAT * 2)

  // Move mouse to empty space to clear any lingering tooltip
  await glide(page, mx, my, 350, 120, GLIDE_FAST)
  mx = 350; my = 120
  await sleep(BEAT)

  // One smooth pull-back into the cluster tier.
  // Provider hulls materialize — AWS amber, Azure blue, GCP green.
  // Cross-cloud edges pulse between them. This is the closing shot.
  await zoom(page, 500, 360, 700, 3000) // slow, dramatic zoom out
  await sleep(HOLD_HERO + 3000) // hold the hero shot — let it breathe

  console.log('▸ FIN')
}

// ═══════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
  // Ensure demo mode (no graph.json)
  const graphJson = resolve(ROOT, 'public', 'graph.json')
  if (existsSync(graphJson)) unlinkSync(graphJson)

  console.log(`▸ Starting vite preview on :${PORT}`)
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
    cwd: ROOT, stdio: 'pipe',
    env: { ...process.env, BROWSER: 'none' },
  })
  server.stderr.on('data', (d) => {
    const msg = d.toString().trim()
    if (msg) console.log(`  [vite] ${msg}`)
  })

  await waitForServer(BASE_URL)
  console.log('▸ Server ready')

  let finalVideoPath = null

  try {
    const browser = await chromium.launch({ headless: !headed })
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
    })

    const page = await context.newPage()
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })

    await choreography(page)

    const videoPath = await page.video()?.path()
    await page.close()
    await context.close()
    await browser.close()

    if (videoPath && existsSync(videoPath)) {
      finalVideoPath = resolve(VIDEO_DIR, 'demo.webm')
      if (existsSync(finalVideoPath)) unlinkSync(finalVideoPath)
      renameSync(videoPath, finalVideoPath)
    }
  } finally {
    server.kill('SIGTERM')
    await sleep(500)
  }

  if (finalVideoPath) {
    console.log(`\n✓ Video saved: ${finalVideoPath}`)
    console.log(`\nGIF for README:`)
    console.log(`  ffmpeg -y -ss 1 -i docs/assets/demo.webm \\`)
    console.log(`    -vf "fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \\`)
    console.log(`    -loop 0 docs/assets/demo.gif`)
    console.log(`\nMP4 for social:`)
    console.log(`  ffmpeg -y -ss 1 -i docs/assets/demo.webm -c:v libx264 -pix_fmt yuv420p -crf 22 docs/assets/demo.mp4`)
  } else {
    console.error('✗ No video produced')
    process.exit(1)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
