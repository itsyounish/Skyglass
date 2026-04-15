#!/usr/bin/env node
/**
 * record-blast-demo.mjs — Focused demo of the blast radius feature.
 *
 * Story: select the primary database, arm blast mode, watch the red
 * cascade ripple outward through every dependent resource.
 *
 * Usage:
 *   npm run build && node scripts/record-blast-demo.mjs [--headed]
 */

import { chromium } from 'playwright'
import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, unlinkSync, renameSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PORT = 4174
const BASE_URL = `http://localhost:${PORT}`
const VIDEO_DIR = resolve(ROOT, 'docs', 'assets')
const OUTPUT_NAME = 'blast-radius.webm'

const headed = process.argv.includes('--headed')

// ── Timing ─────────────────────────────────────────────────────────
const LAYOUT_SETTLE    = 6500
const BEAT             = 300
const HOLD_SHORT       = 1200
const HOLD_MEDIUM      = 2200
const HOLD_HERO        = 4500
const GLIDE_NORMAL     = 700
const GLIDE_CINEMATIC  = 1100
const ZOOM_DURATION    = 1200
// Blast propagates every 350ms up to 6 hops → ~2.1s total
const BLAST_FULL_RIPPLE = 2600

// ── Helpers ────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function glide(page, x1, y1, x2, y2, ms = GLIDE_NORMAL, steps = 50) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    await page.mouse.move(
      Math.round(x1 + (x2 - x1) * ease),
      Math.round(y1 + (y2 - y1) * ease),
    )
    await sleep(ms / steps)
  }
}

async function zoom(page, x, y, totalDelta, ms = ZOOM_DURATION, steps = 30) {
  const step = totalDelta / steps
  await page.mouse.move(x, y)
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, step)
    await sleep(ms / steps)
  }
}

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

async function glideTo(page, nodeId, fromX, fromY, ms = GLIDE_NORMAL) {
  const pos = await nodePos(page, nodeId)
  if (!pos || pos.x < -50 || pos.x > 1330 || pos.y < -50 || pos.y > 770) {
    console.warn(`  ⚠ ${nodeId} off-screen`)
    return null
  }
  console.log(`  → ${nodeId} (${pos.x}, ${pos.y})`)
  await glide(page, fromX, fromY, pos.x, pos.y, ms)
  return pos
}

async function waitForServer(url, retries = 25, ms = 800) {
  for (let i = 0; i < retries; i++) {
    try { if ((await fetch(url)).ok) return } catch {}
    await sleep(ms)
  }
  throw new Error(`Server at ${url} did not start`)
}

// ── Choreography: focused on blast radius ─────────────────────────
async function choreography(page) {
  let mx = 640, my = 360

  console.log('▸ ACT I — Graph reveal')
  await page.waitForSelector('canvas', { timeout: 10000 })
  await sleep(LAYOUT_SETTLE)

  // Zoom out slightly so the full cascade stays in frame
  await zoom(page, 640, 360, 300, ZOOM_DURATION)
  await sleep(HOLD_SHORT)

  console.log('▸ ACT II — Pinpoint the critical node')
  // Fly cursor to the primary RDS database — the most connected resource
  const rds = await glideTo(page, 'aws-rds-primary', mx, my, GLIDE_CINEMATIC)
  if (!rds) throw new Error('aws-rds-primary not found — cannot record blast demo')
  mx = rds.x; my = rds.y
  await sleep(HOLD_SHORT) // tooltip appears, user can read "aws-rds-primary"

  // Click to select — opens DetailPanel
  await page.mouse.click(mx, my)
  await sleep(HOLD_MEDIUM) // let the panel slide in

  console.log('▸ ACT III — Arm blast mode')
  // Press B. DetailPanel shows "BLAST: N affected"
  await page.keyboard.press('b')
  await sleep(BEAT)

  // Watch the red cascade propagate hop by hop
  console.log('▸ ACT IV — Cascade ripple')
  await sleep(BLAST_FULL_RIPPLE)

  // Hold the hero shot — entire dependency tree lit in red
  await sleep(HOLD_HERO)

  // Micro pan to show parallax and prove the cascade is real geometry
  await glide(page, mx, my, mx + 120, my - 60, 900)
  mx += 120; my -= 60
  await sleep(HOLD_SHORT)

  console.log('▸ ACT V — Second target')
  // Escape clears blast + selection, proving it's reversible
  await page.keyboard.press('Escape')
  await sleep(BEAT * 2)

  // Pick a different hub: the EKS cluster
  const eks = await glideTo(page, 'aws-eks-platform', mx, my, GLIDE_CINEMATIC)
  if (eks) {
    mx = eks.x; my = eks.y
    await sleep(BEAT)
    await page.mouse.click(mx, my)
    await sleep(HOLD_SHORT)
    await page.keyboard.press('b')
    await sleep(BLAST_FULL_RIPPLE)
    await sleep(HOLD_HERO)
  }

  // Final clear
  await page.keyboard.press('Escape')
  await sleep(HOLD_SHORT)

  console.log('▸ FIN')
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
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
      finalVideoPath = resolve(VIDEO_DIR, OUTPUT_NAME)
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
    console.log(`  ffmpeg -y -ss 1 -i docs/assets/blast-radius.webm \\`)
    console.log(`    -vf "fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \\`)
    console.log(`    -loop 0 docs/assets/blast-radius.gif`)
    console.log(`\nMP4:`)
    console.log(`  ffmpeg -y -ss 1 -i docs/assets/blast-radius.webm -c:v libx264 -pix_fmt yuv420p -crf 22 docs/assets/blast-radius.mp4`)
  } else {
    console.error('✗ No video produced')
    process.exit(1)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
