#!/usr/bin/env node
/**
 * record-blast-demo.mjs — top-0.01% blast radius reel.
 *
 * Story (~16s of payoff after the 4.8s trim):
 *   00.0-01.5  "BLAST RADIUS / what breaks if it fails?" — title flash
 *   01.5-04.0  Glide to postgres-prod-primary, hover, click — panel slides in
 *   04.0-05.0  Press B → screen flash + shake → cascade arms
 *   05.0-08.0  Red ripple propagates · counter ticks 1→18
 *   08.0-10.5  HERO punch: "18 / blast radius" centered
 *   10.5-13.5  Esc → re-target EKS · second cascade with 12 nodes
 *   13.5-16.0  Outro CTA card
 *
 * All choreography runs inside one page.evaluate per beat.
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
const VIEWPORT = { width: 1280, height: 720 }

const headed = process.argv.includes('--headed')

// ── Timing ─────────────────────────────────────────────────────────
const LAYOUT_SETTLE   = 4800
const BEAT            = 180
const HOLD_TINY       = 600
const HOLD_SHORT      = 900
const HOLD_MEDIUM     = 1300
const HOLD_LONG       = 1700
const HOLD_HERO       = 2200
const GLIDE_NORMAL    = 540
const GLIDE_SLOW      = 820
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
//  Director (parallel to record-demo.mjs, red-tinted)
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

    // --- Curtain ------------------------------------------------------
    const curtain = document.createElement('div')
    curtain.setAttribute('data-sg-overlay', 'curtain')
    curtain.style.cssText = `
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at 50% 42%, #1a1015 0%, #05050a 72%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 16px; opacity: 1;
      transition: opacity 600ms cubic-bezier(.2,.8,.2,1), transform 800ms cubic-bezier(.7,0,.2,1);
      transform: translateY(0);
    `
    curtain.innerHTML = `
      <div style="font-size:11px; letter-spacing:6px; text-transform:uppercase; color:#ef4444;">
        blast radius
      </div>
      <div style="position:relative; height:54px; display:flex; align-items:center;">
        <div style="font-size:38px; font-weight:300; letter-spacing:5px; color:#e8e8f0;">
          what breaks if it fails?
        </div>
      </div>
      <div style="margin-top:24px; width:160px; height:1px; background:linear-gradient(90deg, transparent, #ef444499, transparent);"></div>
      <div style="font-size:10px; letter-spacing:3px; color:#5a5a6c; text-transform:uppercase;">
        press <span style="color:#e8e8f0;">b</span> on any resource
      </div>
    `
    root.appendChild(curtain)

    // --- Cinematic cursor (red glow) ---------------------------------
    const cursor = document.createElement('div')
    cursor.setAttribute('data-sg-overlay', 'cursor')
    cursor.style.cssText = `
      position: absolute; width: 22px; height: 22px; left: -100px; top: -100px;
      transform: translate(-50%, -50%); opacity: 0;
      transition: opacity 280ms ease; will-change: left, top;
    `
    cursor.innerHTML = `
      <div style="position:absolute; inset:0; border-radius:50%; background:rgba(255,255,255,0.96); box-shadow:0 0 18px rgba(255,255,255,0.55), 0 0 38px rgba(239,68,68,0.6);"></div>
      <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:8px; height:8px; border-radius:50%; background:#13131f;"></div>
    `
    root.appendChild(cursor)

    // --- Caption ------------------------------------------------------
    const caption = document.createElement('div')
    caption.setAttribute('data-sg-overlay', 'caption')
    caption.style.cssText = `
      position: absolute; left: 50%; bottom: 64px; transform: translate(-50%, 16px);
      padding: 11px 22px;
      background: rgba(10,10,18,0.78); backdrop-filter: blur(16px);
      border: 1px solid rgba(239,68,68,0.32); border-radius: 8px;
      color: #e8e8f0; font-size: 12px; letter-spacing: 2.5px; text-transform: uppercase;
      opacity: 0; transition: opacity 320ms ease, transform 320ms ease; white-space: nowrap;
    `
    root.appendChild(caption)

    // --- Keychip ------------------------------------------------------
    const keychip = document.createElement('div')
    keychip.setAttribute('data-sg-overlay', 'keychip')
    keychip.style.cssText = `
      position: absolute; right: 42px; bottom: 60px; transform: translateY(14px);
      display: flex; align-items: center; gap: 9px;
      padding: 8px 14px;
      background: rgba(10,10,18,0.82); backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
      color: #b8b8cc; font-size: 10.5px; letter-spacing: 2.4px; text-transform: uppercase;
      opacity: 0; transition: opacity 240ms ease, transform 240ms ease;
    `
    root.appendChild(keychip)

    // --- Live counter (top-right) — animated 1 → N -------------------
    const counter = document.createElement('div')
    counter.setAttribute('data-sg-overlay', 'counter')
    counter.style.cssText = `
      position: absolute; right: 42px; top: 42px;
      display: flex; flex-direction: column; align-items: flex-end; gap: 5px;
      padding: 14px 18px;
      background: rgba(10,10,18,0.82); backdrop-filter: blur(14px);
      border: 1px solid rgba(239,68,68,0.42); border-radius: 8px;
      opacity: 0; transform: translateY(-10px);
      transition: opacity 300ms ease, transform 300ms ease;
    `
    counter.innerHTML = `
      <div data-sg-counter-num style="font-size:36px; font-weight:300; color:#ef4444; letter-spacing:3px; line-height:1;">0</div>
      <div style="font-size:9px; letter-spacing:3px; color:#b8b8cc; text-transform:uppercase;">services affected</div>
    `
    root.appendChild(counter)

    // --- BIG centered hero punch -------------------------------------
    const bigPunch = document.createElement('div')
    bigPunch.setAttribute('data-sg-overlay', 'big-punch')
    bigPunch.style.cssText = `
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; opacity: 0; transition: opacity 280ms ease; pointer-events: none;
    `
    root.appendChild(bigPunch)

    // --- Screen flash -----------------------------------------------
    const flash = document.createElement('div')
    flash.setAttribute('data-sg-overlay', 'flash')
    flash.style.cssText = `
      position: absolute; inset: 0;
      background: rgba(255,255,255,0);
      transition: background 280ms ease-out;
      pointer-events: none;
    `
    root.appendChild(flash)

    // --- Vignette ----------------------------------------------------
    const vignette = document.createElement('div')
    vignette.setAttribute('data-sg-overlay', 'vignette')
    vignette.style.cssText = `
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at center, transparent 54%, rgba(0,0,0,0.46) 100%);
      opacity: 0; transition: opacity 700ms ease;
    `
    root.appendChild(vignette)

    // --- Subtle scanline grain ---------------------------------------
    const grain = document.createElement('div')
    grain.setAttribute('data-sg-overlay', 'grain')
    grain.style.cssText = `
      position: absolute; inset: 0; opacity: 0.05; mix-blend-mode: overlay;
      background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px);
      pointer-events: none;
    `
    root.appendChild(grain)

    // --- Animation keyframes ----------------------------------------
    if (!document.querySelector('style[data-sg-anim]')) {
      const st = document.createElement('style')
      st.setAttribute('data-sg-anim', '1')
      st.textContent = `
        @keyframes sg-pulse {
          0%   { opacity: 0.9; width:22px; height:22px; border-width:2px; }
          100% { opacity: 0;   width:86px; height:86px; border-width:0.5px; }
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

    // ── State + helpers ────────────────────────────────────────────
    const state = { mx: innerWidth / 2, my: innerHeight / 2 }

    function quintic(t) { return t < 0.5 ? 16*t*t*t*t*t : 1 - Math.pow(-2*t + 2, 5) / 2 }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }
    function moveCursor(x, y) { cursor.style.left = x+'px'; cursor.style.top = y+'px'; state.mx = x; state.my = y }

    function dispatchMouse(type, x, y, btnState = {}) {
      const c = document.querySelector('canvas'); if (!c) return
      c.dispatchEvent(new MouseEvent(type, {
        clientX: x, clientY: y, bubbles: true, cancelable: true, view: window,
        button: 0, buttons: btnState.buttons ?? 0,
      }))
    }

    function getRenderer() {
      const c = document.querySelector('canvas'); if (!c) return null
      const key = Object.keys(c).find((k) => k.startsWith('__reactFiber$'))
      if (!key) return null
      let fiber = c[key]
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

    window.__sg = {
      showCursor(on) { cursor.style.opacity = on ? '1' : '0' },
      setCursor(x, y) { moveCursor(x, y) },

      setCaption(t) {
        if (!t) { caption.style.opacity='0'; caption.style.transform='translate(-50%, 16px)'; return }
        caption.textContent = t
        caption.style.opacity='1'; caption.style.transform='translate(-50%, 0)'
      },

      setKeychip(k, l) {
        if (!k) { keychip.style.opacity='0'; keychip.style.transform='translateY(14px)'; return }
        keychip.innerHTML = `
          <span style="display:inline-flex; align-items:center; justify-content:center;
            min-width:24px; height:22px; padding:0 6px;
            background: linear-gradient(180deg, #3a1818, #1f1012);
            border: 1px solid rgba(239,68,68,0.55); border-radius:4px;
            color:#e8e8f0; font-weight:500; letter-spacing:1.2px;">${k}</span>
          <span>${l}</span>
        `
        keychip.style.opacity='1'; keychip.style.transform='translateY(0)'
      },

      setCounter(on, from, to, ms) {
        if (!on) {
          counter.style.opacity='0'; counter.style.transform='translateY(-10px)'; return
        }
        counter.style.opacity='1'; counter.style.transform='translateY(0)'
        const num = counter.querySelector('[data-sg-counter-num]')
        if (from == null) return
        const start = performance.now()
        function tick(now) {
          const t = Math.min(1, (now - start) / ms)
          const eased = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2) / 2
          num.textContent = String(Math.round(from + (to - from) * eased))
          if (t < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },

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

      bigPunch(text, sub = '', color = '#e8e8f0', accent = '#c9a9ff', hold = 1400) {
        return new Promise((done) => {
          bigPunch.innerHTML = `
            <div style="font-size:120px; font-weight:200; letter-spacing:2px; color:${color}; line-height:1;
              text-shadow: 0 6px 38px rgba(0,0,0,0.7);">
              ${text}
            </div>
            ${sub ? `<div style="margin-top:6px; font-size:11px; letter-spacing:5px; color:${accent}; text-transform:uppercase;">${sub}</div>` : ''}
          `
          bigPunch.style.animation = 'sg-punch-in 360ms cubic-bezier(.25,.85,.4,1) forwards'
          bigPunch.style.opacity = '1'
          setTimeout(() => {
            bigPunch.style.animation = 'sg-punch-out 380ms cubic-bezier(.4,0,.7,.2) forwards'
            setTimeout(() => { bigPunch.style.opacity = '0'; bigPunch.innerHTML = ''; done() }, 380)
          }, hold)
        })
      },

      // CTA punch (smaller font, longer hold — for the outro)
      bigCTA(text, sub, hold = 2000) {
        return new Promise((done) => {
          bigPunch.innerHTML = `
            <div style="font-size:38px; font-weight:300; letter-spacing:5px; color:#e8e8f0; line-height:1;
              text-shadow: 0 6px 28px rgba(0,0,0,0.7);">
              ${text}
            </div>
            <div style="margin-top:10px; font-size:11px; letter-spacing:5px; color:#ef4444; text-transform:uppercase;">${sub}</div>
          `
          bigPunch.style.animation = 'sg-punch-in 380ms cubic-bezier(.25,.85,.4,1) forwards'
          bigPunch.style.opacity = '1'
          setTimeout(() => {
            bigPunch.style.animation = 'sg-punch-out 420ms cubic-bezier(.4,0,.7,.2) forwards'
            setTimeout(() => { bigPunch.style.opacity = '0'; bigPunch.innerHTML = ''; done() }, 420)
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
            moveCursor(x, y); dispatchMouse('mousemove', x, y)
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

      click() { dispatchMouse('mousedown', state.mx, state.my, { buttons: 1 }); dispatchMouse('mouseup', state.mx, state.my) },

      key(k) {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k,
          bubbles: true, cancelable: true,
        }))
      },

      cameraFlyTo(wx, wy, zl, dur = 900) {
        const r = getRenderer(); if (!r) return false
        r.camera.flyTo(wx, wy, zl, dur)
        return true
      },

      scrollZoom(x, y, totalDelta, ms = 1400) {
        return new Promise((done) => {
          const c = document.querySelector('canvas')
          const start = performance.now()
          let last = 0
          function tick() {
            const t = Math.min(1, (performance.now() - start) / ms)
            const e = easeOutCubic(t)
            const target = totalDelta * e
            const dy = target - last
            last = target
            c.dispatchEvent(new WheelEvent('wheel', {
              deltaY: dy, clientX: x, clientY: y, bubbles: true, cancelable: true,
            }))
            if (t < 1) requestAnimationFrame(tick); else done()
          }
          requestAnimationFrame(tick)
        })
      },
    }

    moveCursor(state.mx, state.my)
  })
}

// ── Shorthand wrappers ─────────────────────────────────────────────
const showCursor  = (p, on = true)         => p.evaluate((v) => window.__sg.showCursor(v), on)
const setCaption  = (p, t)                 => p.evaluate((v) => window.__sg.setCaption(v), t)
const setKeychip  = (p, k, l)              => p.evaluate(({ k, l }) => window.__sg.setKeychip(k, l), { k, l })
const setCounter  = (p, on, from, to, ms) => p.evaluate(({ on, f, t, m }) =>
  window.__sg.setCounter(on, f, t, m), { on, f: from, t: to, m: ms })
const dropCurtain = (p)                    => p.evaluate(() => window.__sg.dropCurtain())
const setVignette = (p, on)                => p.evaluate((v) => window.__sg.setVignette(v), on)
const flash       = (p, rgb, a, ms)        => p.evaluate(({ rgb, a, ms }) => window.__sg.flash(rgb, a, ms), { rgb, a, ms })
const shake       = (p, ms)                => p.evaluate((v) => window.__sg.shake(v), ms)
const bigPunch    = (p, text, sub, c, ac, h) => p.evaluate(({ text, sub, c, ac, h }) =>
  window.__sg.bigPunch(text, sub, c, ac, h), { text, sub, c, ac, h })
const bigCTA      = (p, text, sub, h)      => p.evaluate(({ text, sub, h }) =>
  window.__sg.bigCTA(text, sub, h), { text, sub, h })
const clickPulse  = (p)                    => p.evaluate(() => window.__sg.clickPulse())
const glide       = (p, x, y, ms)          => p.evaluate(({ x, y, ms }) => window.__sg.glide(x, y, ms), { x, y, ms })
const glideToNode = (p, id, ms)            => p.evaluate(({ id, ms }) => window.__sg.glideToNode(id, ms), { id, ms })
const click       = (p)                    => p.evaluate(() => window.__sg.click())
const key         = (p, k)                 => p.evaluate((v) => window.__sg.key(v), k)
const cameraFlyTo = (p, wx, wy, zl, dur)   => p.evaluate(({ wx, wy, zl, dur }) =>
  window.__sg.cameraFlyTo(wx, wy, zl, dur), { wx, wy, zl, dur })
const screenPos   = (p, id)                => p.evaluate((v) => window.__sg.screenPos(v), id)

const hideCounter = (page) => page.evaluate(() => window.__sg.setCounter(false))

async function pressWithChip(page, k, label, announce = 360) {
  await setKeychip(page, k.toUpperCase(), label)
  await sleep(announce)
  await key(page, k)
}

// ── Choreography ───────────────────────────────────────────────────
async function choreography(page) {
  console.log('▸ PRELUDE — layout settles behind the title (4.8s, hidden by ffmpeg trim)')
  await page.waitForSelector('canvas', { timeout: 10000 })
  await installDirector(page)
  await sleep(LAYOUT_SETTLE)

  console.log('▸ ACT I — Reveal')
  await setVignette(page, true)
  await dropCurtain(page)
  await sleep(720)
  await showCursor(page, true)
  await setCaption(page, 'one click · full dependency cascade')
  await sleep(HOLD_LONG - 200)
  await setCaption(page, null)
  await sleep(BEAT)

  console.log('▸ ACT II — Target the hub')
  const rds = await glideToNode(page, 'aws-rds-primary', GLIDE_SLOW)
  if (!rds) throw new Error('aws-rds-primary not found')
  await sleep(HOLD_TINY)
  await setCaption(page, 'postgres-prod-primary')
  await sleep(HOLD_SHORT)
  await clickPulse(page)
  await click(page)
  await sleep(HOLD_TINY)
  await setCaption(page, null)

  console.log('▸ ACT III — Arm + cascade')
  await pressWithChip(page, 'b', 'blast radius', 380)
  // The visceral moment: red flash + shake as the cascade arms
  await flash(page, '255,68,68', 0.5, 320)
  await shake(page, 240)
  await sleep(120)
  await cameraFlyTo(page, rds.wx, rds.wy, 1.32, 1100)
  await setCaption(page, 'cascade propagating')
  await setCounter(page, true, 1, 18, BLAST_RIPPLE)
  await sleep(BLAST_RIPPLE)
  await sleep(300)
  await setCaption(page, null)

  console.log('▸ ACT IV — Hero punch')
  await bigPunch(page, '18', 'blast radius · postgres-prod-primary', '#ff5a5a', '#ff8a8a', 1900)
  await sleep(200)

  // Tiny pan: the cascade is real geometry, not a texture
  const rdsNow = await screenPos(page, 'aws-rds-primary')
  if (rdsNow) {
    const tx = Math.min(VIEWPORT.width - 220, Math.max(220, rdsNow.x + 110))
    const ty = Math.min(VIEWPORT.height - 160, Math.max(160, rdsNow.y - 60))
    await glide(page, tx, ty, 900)
  }

  console.log('▸ ACT V — Re-target EKS')
  await key(page, 'Escape')
  await setKeychip(page, null)
  await hideCounter(page)
  await sleep(BEAT)

  // Pull back so EKS comes into frame
  await cameraFlyTo(page, rds.wx, rds.wy, 0.9, 950)
  await sleep(900)

  const eks = await glideToNode(page, 'aws-eks-platform', GLIDE_SLOW)
  if (eks) {
    await sleep(HOLD_TINY)
    await setCaption(page, 'platform-prod · eks cluster')
    await sleep(HOLD_TINY)
    await clickPulse(page)
    await click(page)
    await sleep(HOLD_TINY)
    await setCaption(page, null)

    await pressWithChip(page, 'b', 'blast radius', 360)
    await flash(page, '255,68,68', 0.42, 300)
    await shake(page, 200)
    await sleep(100)
    await cameraFlyTo(page, eks.wx, eks.wy, 1.28, 1000)
    await setCaption(page, 'different target · different blast')
    await setCounter(page, true, 1, 12, BLAST_RIPPLE)
    await sleep(BLAST_RIPPLE)
    await sleep(300)
    await setCaption(page, null)
    await bigPunch(page, '12', 'blast radius · platform-prod', '#ff5a5a', '#ff8a8a', 1700)
  }

  console.log('▸ FIN — outro CTA')
  await key(page, 'Escape')
  await setKeychip(page, null)
  await hideCounter(page)
  await showCursor(page, false)
  await sleep(BEAT)
  await bigCTA(page, 'npx skyglass-cli', 'github.com/itsyounish/skyglass', 1900)
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
    console.log(`\nMP4:`)
    console.log(`  ffmpeg -y -ss 4.5 -i docs/assets/blast-radius.webm -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart docs/assets/blast-radius.mp4`)
    console.log(`\nGIF for README:`)
    console.log(`  ffmpeg -y -ss 4.5 -i docs/assets/blast-radius.webm \\`)
    console.log(`    -vf "fps=14,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \\`)
    console.log(`    -loop 0 docs/assets/blast-radius.gif`)
  } else {
    console.error('✗ No video produced')
    process.exit(1)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
