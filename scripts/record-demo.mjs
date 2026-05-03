#!/usr/bin/env node
/**
 * record-demo.mjs — top-0.01% cinematic demo for skyglass.
 *
 * Story (~17s of payoff after the 4.8s trim):
 *   00.0-01.5  Curtain lifts — title type-reveals, then dissolves
 *   01.5-04.5  $28,182 / MO punches in over the cost panel
 *   04.5-07.5  Search "rds" — instant cross-cloud find
 *   07.5-10.0  Click the hub — postgres-prod-primary
 *   10.0-14.5  PRESS B → screen flash → "18 SERVICES AT RISK" hero card
 *   14.5-17.0  Pull back to galaxy view — CTA card lands
 *
 * Every beat dispatches synthetic MouseEvent / KeyboardEvent inside the
 * page so timing is pinned to the rAF loop, not CDP latency.
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
const VIEWPORT = { width: 1280, height: 720 }

const headed = process.argv.includes('--headed')

// ═══════════════════════════════════════════════════════════════════
//  Timing — everything is rAF-honored inside the page
// ═══════════════════════════════════════════════════════════════════

const LAYOUT_SETTLE   = 4800   // hidden under the curtain
const BEAT            = 180
const HOLD_TINY       = 600
const HOLD_SHORT      = 900
const HOLD_MEDIUM     = 1300
const HOLD_LONG       = 1800
const HOLD_HERO       = 2200
const GLIDE_FAST      = 360
const GLIDE_NORMAL    = 540
const GLIDE_SLOW      = 820
const TYPE_DELAY      = 60
const BLAST_RIPPLE    = 2200

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForServer(url, retries = 30, ms = 700) {
  for (let i = 0; i < retries; i++) {
    try { if ((await fetch(url)).ok) return } catch {}
    await sleep(ms)
  }
  throw new Error(`Server at ${url} did not start`)
}

// ═══════════════════════════════════════════════════════════════════
//  In-page director: overlays + synthetic-event primitives
// ═══════════════════════════════════════════════════════════════════

async function installDirector(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-sg-overlay]').forEach((el) => el.remove())

    const root = document.createElement('div')
    root.setAttribute('data-sg-overlay', 'root')
    root.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 99999;
      font-family: 'IBM Plex Mono', ui-monospace, monospace;
    `
    document.body.appendChild(root)

    // --- Curtain — radial gradient, lifts upward like a stage drop -----
    const curtain = document.createElement('div')
    curtain.setAttribute('data-sg-overlay', 'curtain')
    curtain.style.cssText = `
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at 50% 42%, #15152a 0%, #05050a 72%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 16px;
      opacity: 1;
      transition: opacity 600ms cubic-bezier(.2,.8,.2,1), transform 800ms cubic-bezier(.7,0,.2,1);
      transform: translateY(0);
    `
    curtain.innerHTML = `
      <div data-sg-title style="position: relative; height: 56px; display:flex; align-items:center; justify-content:center;">
        <div style="font-size:46px; font-weight:300; letter-spacing:12px; text-transform:uppercase; color:#e8e8f0;">
          <span data-sg-title-prefix style="font-weight:500; color:#c9a9ff;">sky</span><span data-sg-title-suffix style="opacity:0;">glass</span>
        </div>
        <div data-sg-title-cursor style="position:absolute; right:-14px; top:50%; transform:translateY(-46%); width:10px; height:30px; background:#c9a9ff; opacity:0.85; animation: sg-blink 800ms ease-in-out infinite;"></div>
      </div>
      <div style="font-size:11px; letter-spacing:6px; text-transform:uppercase; color:#8a8aa0;">
        a looking glass for your cloud
      </div>
      <div style="margin-top:28px; width:160px; height:1px; background:linear-gradient(90deg, transparent, #c9a9ff88, transparent);"></div>
      <div style="font-size:10px; letter-spacing:3px; color:#5a5a6c; text-transform:uppercase;">
        141 resources · 3 clouds · 1 view
      </div>
    `
    root.appendChild(curtain)

    // --- Cinematic cursor with subtle trail ---------------------------
    const cursor = document.createElement('div')
    cursor.setAttribute('data-sg-overlay', 'cursor')
    cursor.style.cssText = `
      position: absolute; width: 22px; height: 22px; left: -100px; top: -100px;
      transform: translate(-50%, -50%);
      opacity: 0; transition: opacity 280ms ease;
      will-change: left, top;
    `
    cursor.innerHTML = `
      <div style="position:absolute; inset:0; border-radius:50%; background:rgba(255,255,255,0.96); box-shadow:0 0 18px rgba(255,255,255,0.55), 0 0 38px rgba(201,169,255,0.55);"></div>
      <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:8px; height:8px; border-radius:50%; background:#13131f;"></div>
    `
    root.appendChild(cursor)

    // --- Caption (lower-third) ----------------------------------------
    const caption = document.createElement('div')
    caption.setAttribute('data-sg-overlay', 'caption')
    caption.style.cssText = `
      position: absolute; left: 50%; bottom: 64px; transform: translate(-50%, 16px);
      padding: 11px 22px;
      background: rgba(10, 10, 18, 0.78); backdrop-filter: blur(16px);
      border: 1px solid rgba(201, 169, 255, 0.22);
      border-radius: 8px;
      color: #e8e8f0; font-size: 12px; letter-spacing: 2.5px; text-transform: uppercase;
      opacity: 0; transition: opacity 320ms ease, transform 320ms ease;
      white-space: nowrap;
    `
    root.appendChild(caption)

    // --- Keychip (bottom-right, hint pill) ----------------------------
    const keychip = document.createElement('div')
    keychip.setAttribute('data-sg-overlay', 'keychip')
    keychip.style.cssText = `
      position: absolute; right: 42px; bottom: 60px; transform: translateY(14px);
      display: flex; align-items: center; gap: 9px;
      padding: 8px 14px;
      background: rgba(10, 10, 18, 0.82); backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      color: #b8b8cc; font-size: 10.5px; letter-spacing: 2.4px; text-transform: uppercase;
      opacity: 0; transition: opacity 240ms ease, transform 240ms ease;
    `
    root.appendChild(keychip)

    // --- BIG PUNCH overlay (centered hero number / phrase) -------------
    const bigPunch = document.createElement('div')
    bigPunch.setAttribute('data-sg-overlay', 'big-punch')
    bigPunch.style.cssText = `
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 10px;
      opacity: 0;
      transition: opacity 280ms ease;
      pointer-events: none;
    `
    root.appendChild(bigPunch)

    // --- Screen flash (instant, decays over ~280ms) ------------------
    const flash = document.createElement('div')
    flash.setAttribute('data-sg-overlay', 'flash')
    flash.style.cssText = `
      position: absolute; inset: 0;
      background: rgba(255,255,255,0);
      transition: background 280ms ease-out;
      pointer-events: none;
    `
    root.appendChild(flash)

    // --- Vignette ------------------------------------------------------
    const vignette = document.createElement('div')
    vignette.setAttribute('data-sg-overlay', 'vignette')
    vignette.style.cssText = `
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at center, transparent 56%, rgba(0,0,0,0.42) 100%);
      opacity: 0; transition: opacity 700ms ease;
    `
    root.appendChild(vignette)

    // --- Subtle scanline grain (cinematic feel) -----------------------
    const grain = document.createElement('div')
    grain.setAttribute('data-sg-overlay', 'grain')
    grain.style.cssText = `
      position: absolute; inset: 0; opacity: 0.05; mix-blend-mode: overlay;
      background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px);
      pointer-events: none;
    `
    root.appendChild(grain)

    // --- Animation keyframes ------------------------------------------
    if (!document.querySelector('style[data-sg-anim]')) {
      const st = document.createElement('style')
      st.setAttribute('data-sg-anim', '1')
      st.textContent = `
        @keyframes sg-pulse {
          0%   { opacity: 0.9; width: 22px; height: 22px; border-width: 2px; }
          100% { opacity: 0;   width: 86px; height: 86px; border-width: 0.5px; }
        }
        @keyframes sg-blink {
          0%, 50%, 100% { opacity: 0.85; }
          25%, 75%      { opacity: 0;    }
        }
        @keyframes sg-punch-in {
          0%   { opacity: 0; transform: scale(1.18); filter: blur(6px); }
          55%  { opacity: 1; transform: scale(1.0);  filter: blur(0);   }
          100% { opacity: 1; transform: scale(1.0);  filter: blur(0);   }
        }
        @keyframes sg-punch-out {
          0%   { opacity: 1; transform: scale(1.0); }
          100% { opacity: 0; transform: scale(0.96); filter: blur(4px); }
        }
        @keyframes sg-shake {
          0%, 100% { transform: translate(0,0); }
          15%      { transform: translate(-3px, 1px); }
          30%      { transform: translate(2px, -2px); }
          50%      { transform: translate(-2px, 2px); }
          70%      { transform: translate(3px, 0); }
          85%      { transform: translate(-1px, -1px); }
        }
      `
      document.head.appendChild(st)
    }

    // ─── State + helpers ─────────────────────────────────────────────
    const state = { mx: innerWidth / 2, my: innerHeight / 2 }

    function quintic(t) { return t < 0.5 ? 16*t*t*t*t*t : 1 - Math.pow(-2*t + 2, 5) / 2 }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }

    function moveCursor(x, y) {
      cursor.style.left = x + 'px'; cursor.style.top = y + 'px'
      state.mx = x; state.my = y
    }

    function dispatchMouse(type, x, y, btnState = {}) {
      const canvas = document.querySelector('canvas')
      if (!canvas) return
      canvas.dispatchEvent(new MouseEvent(type, {
        clientX: x, clientY: y, bubbles: true, cancelable: true, view: window,
        button: 0, buttons: btnState.buttons ?? 0,
      }))
    }

    // Find renderer via React fiber chain
    function getRenderer() {
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
              return ms.current
            }
            hook = hook.next
          }
        }
        fiber = fiber.return
      }
      return null
    }

    function screenPos(nodeId) {
      const r = getRenderer(); if (!r) return null
      const n = r.nodeMap.get(nodeId); if (!n) return null
      const c = r.camera
      return {
        x: (n.x - c.x) * c.zoom + r.width / 2,
        y: (n.y - c.y) * c.zoom + r.height / 2,
        wx: n.x, wy: n.y,
      }
    }

    // ─── Exposed API ─────────────────────────────────────────────────
    window.__sg = {
      showCursor(on) { cursor.style.opacity = on ? '1' : '0' },
      setCursor(x, y) { moveCursor(x, y) },

      setCaption(t) {
        if (!t) { caption.style.opacity = '0'; caption.style.transform = 'translate(-50%, 16px)'; return }
        caption.textContent = t
        caption.style.opacity = '1'
        caption.style.transform = 'translate(-50%, 0)'
      },

      setKeychip(k, l) {
        if (!k) { keychip.style.opacity = '0'; keychip.style.transform = 'translateY(14px)'; return }
        keychip.innerHTML = `
          <span style="display:inline-flex; align-items:center; justify-content:center;
            min-width:24px; height:22px; padding:0 6px;
            background: linear-gradient(180deg, #2a2a44, #15152a);
            border: 1px solid rgba(201,169,255,0.42); border-radius: 4px;
            color:#e8e8f0; font-weight: 500; letter-spacing: 1.2px;">${k}</span>
          <span>${l}</span>
        `
        keychip.style.opacity = '1'; keychip.style.transform = 'translateY(0)'
      },

      // Title type-reveal: animate the "glass" suffix in over `ms`
      typeTitle(ms = 420) {
        return new Promise((done) => {
          const suffix = curtain.querySelector('[data-sg-title-suffix]')
          if (!suffix) return done()
          const text = 'glass'
          let i = 0
          suffix.style.opacity = '1'
          suffix.textContent = ''
          const stepMs = ms / text.length
          const id = setInterval(() => {
            suffix.textContent = text.slice(0, ++i)
            if (i >= text.length) { clearInterval(id); done() }
          }, stepMs)
        })
      },

      // Stage drop: curtain fades + lifts up
      dropCurtain() {
        return new Promise((done) => {
          curtain.style.opacity = '0'
          curtain.style.transform = 'translateY(-22px)'
          setTimeout(() => { curtain.style.display = 'none'; done() }, 700)
        })
      },

      setVignette(on) { vignette.style.opacity = on ? '1' : '0' },

      flash(rgb = '255,255,255', alpha = 0.55, decayMs = 280) {
        flash.style.transition = 'background 0ms'
        flash.style.background = `rgba(${rgb},${alpha})`
        requestAnimationFrame(() => {
          flash.style.transition = `background ${decayMs}ms ease-out`
          flash.style.background = `rgba(${rgb},0)`
        })
      },

      shake(ms = 320) {
        const tgt = document.body
        tgt.style.animation = `sg-shake ${ms}ms ease-in-out`
        setTimeout(() => { tgt.style.animation = '' }, ms + 20)
      },

      // BIG centered hero punch — single line + small subline
      // hold = ms to show, then auto fades
      bigPunch(text, sub = '', color = '#e8e8f0', accent = '#c9a9ff', hold = 1400) {
        return new Promise((done) => {
          bigPunch.innerHTML = `
            <div style="font-size:74px; font-weight:200; letter-spacing:6px; color:${color}; line-height:1;
              text-shadow: 0 4px 32px rgba(0,0,0,0.7);">
              ${text}
            </div>
            ${sub ? `<div style="margin-top:8px; font-size:11px; letter-spacing:5px; color:${accent}; text-transform:uppercase;">${sub}</div>` : ''}
          `
          bigPunch.style.animation = 'sg-punch-in 360ms cubic-bezier(.25,.85,.4,1) forwards'
          bigPunch.style.opacity = '1'
          setTimeout(() => {
            bigPunch.style.animation = 'sg-punch-out 380ms cubic-bezier(.4,0,.7,.2) forwards'
            setTimeout(() => { bigPunch.style.opacity = '0'; bigPunch.innerHTML = ''; done() }, 380)
          }, hold)
        })
      },

      clickPulse() {
        const p = document.createElement('div')
        p.style.cssText = `
          position:absolute; left:${state.mx}px; top:${state.my}px;
          width:22px; height:22px; transform:translate(-50%,-50%);
          border-radius:50%; border:2px solid rgba(255,255,255,0.92);
          animation: sg-pulse 700ms ease-out forwards; pointer-events:none;
        `
        root.appendChild(p)
        setTimeout(() => p.remove(), 740)
      },

      screenPos,

      glide(x2, y2, ms = 600) {
        return new Promise((done) => {
          const x1 = state.mx, y1 = state.my
          const start = performance.now()
          function tick() {
            const t = Math.min(1, (performance.now() - start) / ms)
            const e = quintic(t)
            const x = x1 + (x2 - x1) * e
            const y = y1 + (y2 - y1) * e
            moveCursor(x, y)
            dispatchMouse('mousemove', x, y)
            if (t < 1) requestAnimationFrame(tick); else done()
          }
          requestAnimationFrame(tick)
        })
      },

      async glideToNode(nodeId, ms = 600) {
        const p = screenPos(nodeId); if (!p) return null
        await window.__sg.glide(p.x, p.y, ms)
        return p
      },

      click() {
        dispatchMouse('mousedown', state.mx, state.my, { buttons: 1 })
        dispatchMouse('mouseup',   state.mx, state.my)
      },

      key(k) {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k,
          bubbles: true, cancelable: true,
        }))
      },

      async type(text, perCharMs = 60) {
        for (const ch of text) {
          const input = document.querySelector('input[type="text"], input[placeholder]') ||
            document.querySelector('input')
          if (input) {
            input.focus()
            const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
            native.call(input, input.value + ch)
            input.dispatchEvent(new Event('input', { bubbles: true }))
          } else {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
          }
          await new Promise((r) => setTimeout(r, perCharMs))
        }
      },

      cameraFlyTo(wx, wy, zl, dur = 900) {
        const r = getRenderer(); if (!r) return false
        r.camera.flyTo(wx, wy, zl, dur)
        return true
      },

      scrollZoom(x, y, totalDelta, ms = 1400) {
        return new Promise((done) => {
          const canvas = document.querySelector('canvas')
          const start = performance.now()
          let last = 0
          function tick() {
            const t = Math.min(1, (performance.now() - start) / ms)
            const e = easeOutCubic(t)
            const target = totalDelta * e
            const dy = target - last
            last = target
            canvas.dispatchEvent(new WheelEvent('wheel', {
              deltaY: dy, clientX: x, clientY: y, bubbles: true, cancelable: true,
            }))
            if (t < 1) requestAnimationFrame(tick); else done()
          }
          requestAnimationFrame(tick)
        })
      },

      sleep(ms) { return new Promise((r) => setTimeout(r, ms)) },
    }

    moveCursor(state.mx, state.my)
  })
}

// ═══════════════════════════════════════════════════════════════════
//  Shorthand wrappers
// ═══════════════════════════════════════════════════════════════════

const showCursor   = (p, on = true)         => p.evaluate((v) => window.__sg.showCursor(v), on)
const setCaption   = (p, t)                 => p.evaluate((v) => window.__sg.setCaption(v), t)
const setKeychip   = (p, k, l)              => p.evaluate(({ k, l }) => window.__sg.setKeychip(k, l), { k, l })
const typeTitle    = (p, ms)                => p.evaluate((v) => window.__sg.typeTitle(v), ms)
const dropCurtain  = (p)                    => p.evaluate(() => window.__sg.dropCurtain())
const setVignette  = (p, on)                => p.evaluate((v) => window.__sg.setVignette(v), on)
const flash        = (p, rgb, a, ms)        => p.evaluate(({ rgb, a, ms }) => window.__sg.flash(rgb, a, ms), { rgb, a, ms })
const shake        = (p, ms)                => p.evaluate((v) => window.__sg.shake(v), ms)
const bigPunch     = (p, text, sub, c, ac, h) => p.evaluate(({ text, sub, c, ac, h }) =>
  window.__sg.bigPunch(text, sub, c, ac, h), { text, sub, c, ac, h })
const clickPulse   = (p)                    => p.evaluate(() => window.__sg.clickPulse())
const glide        = (p, x, y, ms)          => p.evaluate(({ x, y, ms }) => window.__sg.glide(x, y, ms), { x, y, ms })
const glideToNode  = (p, id, ms)            => p.evaluate(({ id, ms }) => window.__sg.glideToNode(id, ms), { id, ms })
const click        = (p)                    => p.evaluate(() => window.__sg.click())
const key          = (p, k)                 => p.evaluate((v) => window.__sg.key(v), k)
const typeText     = (p, t, d)              => p.evaluate(({ t, d }) => window.__sg.type(t, d), { t, d })
const cameraFlyTo  = (p, wx, wy, zl, dur)   => p.evaluate(({ wx, wy, zl, dur }) =>
  window.__sg.cameraFlyTo(wx, wy, zl, dur), { wx, wy, zl, dur })
const scrollZoom   = (p, x, y, d, ms)       => p.evaluate(({ x, y, d, ms }) =>
  window.__sg.scrollZoom(x, y, d, ms), { x, y, d, ms })
const screenPos    = (p, id)                => p.evaluate((v) => window.__sg.screenPos(v), id)

async function pressWithChip(page, k, label, announce = 360) {
  await setKeychip(page, k.toUpperCase(), label)
  await sleep(announce)
  await key(page, k)
}

// ═══════════════════════════════════════════════════════════════════
//  CHOREOGRAPHY — top 0.01% pacing
// ═══════════════════════════════════════════════════════════════════

async function choreography(page) {
  console.log('▸ PRELUDE — layout settles behind curtain (4.8s, hidden by ffmpeg trim)')
  await page.waitForSelector('canvas', { timeout: 10000 })
  await installDirector(page)
  await sleep(LAYOUT_SETTLE - 500)

  // The "glass" suffix types just before the curtain lifts
  await typeTitle(page, 420)
  await sleep(160)

  console.log('▸ ACT I — Reveal')
  await setVignette(page, true)
  await dropCurtain(page)
  await sleep(720)
  await showCursor(page, true)
  await setCaption(page, '141 resources · aws · azure · gcp')
  await sleep(HOLD_LONG)
  await setCaption(page, null)
  await sleep(BEAT)

  console.log('▸ ACT II — Cost reveal')
  await pressWithChip(page, 'c', 'cost', 320)
  await sleep(220)
  // BIG hero number — punches in over the cost panel
  await bigPunch(page, '$28,182', '/ month · burning', '#ffd166', '#ff9f1c', 1700)
  await sleep(120)
  await setCaption(page, 'every node · every dollar · every cloud')
  await sleep(HOLD_MEDIUM)
  await key(page, 'c')
  await setKeychip(page, null)
  await setCaption(page, null)
  await sleep(BEAT)

  console.log('▸ ACT III — Search')
  await pressWithChip(page, '/', 'search', 320)
  await sleep(140)
  await typeText(page, 'rds', TYPE_DELAY)
  await sleep(HOLD_SHORT)
  await setCaption(page, 'find anything · across 3 clouds')
  await sleep(HOLD_MEDIUM)
  await key(page, 'Escape')
  await setKeychip(page, null)
  await setCaption(page, null)
  await sleep(BEAT)

  console.log('▸ ACT IV — Target lock')
  const rds = await glideToNode(page, 'aws-rds-primary', GLIDE_SLOW)
  if (rds) {
    await sleep(HOLD_TINY)
    await setCaption(page, 'postgres-prod-primary · the hub')
    await clickPulse(page)
    await click(page)
    await sleep(HOLD_LONG)
  }
  await setCaption(page, null)

  console.log('▸ ACT V — BLAST')
  await pressWithChip(page, 'b', 'blast radius', 380)
  // The moment of truth: tiny shake + white flash, then arm the cascade
  await flash(page, '255,90,90', 0.42, 360)
  await shake(page, 240)
  await sleep(120)
  if (rds) await cameraFlyTo(page, rds.wx, rds.wy, 1.32, 1100)
  await sleep(BLAST_RIPPLE - 500)
  // Hero punch lands as the cascade peaks
  await bigPunch(page, '18', 'services at risk', '#ff5a5a', '#ff8a8a', 1500)
  await sleep(900)
  await setKeychip(page, null)
  await sleep(BEAT)

  console.log('▸ ACT VI — Galaxy pull-back + CTA')
  await key(page, 'Escape')
  await glide(page, 140, 140, GLIDE_FAST)
  await showCursor(page, false)
  await sleep(BEAT)

  // Slow centered zoom-out — the closing shot
  await scrollZoom(page, 640, 360, 720, 2200)
  await bigPunch(page, 'npx skyglass-cli', 'github.com/itsyounish/skyglass', '#e8e8f0', '#c9a9ff', 2000)

  console.log('▸ FIN')
}

// ═══════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════

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
      viewport: VIEWPORT,
      recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
      deviceScaleFactor: 2,
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
    console.log(`\nMP4 for social (trims first 4.8s of layout settle):`)
    console.log(`  ffmpeg -y -ss 4.5 -i docs/assets/demo.webm -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart docs/assets/demo.mp4`)
    console.log(`\nGIF for README:`)
    console.log(`  ffmpeg -y -ss 4.5 -i docs/assets/demo.webm \\`)
    console.log(`    -vf "fps=14,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \\`)
    console.log(`    -loop 0 docs/assets/demo-readme.gif`)
  } else {
    console.error('✗ No video produced')
    process.exit(1)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
