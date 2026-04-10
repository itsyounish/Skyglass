import { createContext, useContext } from 'react'

// ---------------------------------------------------------------------------
// Theme token interface
// ---------------------------------------------------------------------------

export interface Theme {
  name: 'dark' | 'light'

  // ── Canvas ────────────────────────────────────────────────────────────────
  canvasBg: string                       // fillRect base
  canvasBgRgb: { r: number; g: number; b: number } // for dimColor blending
  bgGlow: string                         // subtle radial glow center color
  vignetteColor: string                  // rgba for edge darkening / lightening
  vignetteStrength: number

  // ── Nodes (canvas) ────────────────────────────────────────────────────────
  nodeCircleBg: string
  nodeCircleBgFaded: string
  /** Drop shadow behind node circles (adds depth on light bg) */
  nodeDropShadow: boolean

  // ── Groups (canvas) ───────────────────────────────────────────────────────
  groupPillBg: string
  groupPillText: string
  /** Hull fill/stroke alpha multiplier (higher on light for visibility) */
  hullAlphaMultiplier: number

  // ── Edges (canvas) ────────────────────────────────────────────────────────
  edgeDefaultColor: string
  crossCloudEdge: string

  // ── Provider label colors ─────────────────────────────────────────────────
  /** 'glow' on dark (pastels pop on black), 'primary' on light (saturated for contrast) */
  providerColorKey: 'glow' | 'primary'

  // ── Semantic status colors (tuned per theme for contrast) ─────────────────
  warningColor: string
  costColor: string
  costColorMuted: string

  // ── UI panels ─────────────────────────────────────────────────────────────
  panelBg: string
  panelBorder: string
  panelShadow: string

  // ── Text ──────────────────────────────────────────────────────────────────
  textPrimary: string
  textSecondary: string
  textTertiary: string     // labels, captions
  textMuted: string        // very low emphasis
  textDim: string          // counters, separators

  // ── Interactive ───────────────────────────────────────────────────────────
  kbdBg: string
  kbdBorder: string
  kbdText: string
  inputBg: string
  inputBorder: string
  buttonBg: string
  buttonBorder: string

  // ── Bar / track backgrounds ───────────────────────────────────────────────
  barBg: string

  // ── Dividers ──────────────────────────────────────────────────────────────
  divider: string
  dividerSubtle: string

  // ── Status bar ────────────────────────────────────────────────────────────
  statusBarBg: string
  statusBarBorder: string

  // ── Accent (brand) ────────────────────────────────────────────────────────
  accent: string

  // ── Canvas compositing ────────────────────────────────────────────────────
  /** 'lighter' composite only works on dark backgrounds */
  useGlowComposite: boolean
}

// ---------------------------------------------------------------------------
// Helper: pick provider label color based on theme
// ---------------------------------------------------------------------------

import { PROVIDER_COLORS } from './constants'
import type { Provider } from './types'

export function providerLabelColor(theme: Theme, provider: Provider): string {
  return PROVIDER_COLORS[provider][theme.providerColorKey]
}

// ---------------------------------------------------------------------------
// Dark theme (current look)
// ---------------------------------------------------------------------------

export const darkTheme: Theme = {
  name: 'dark',

  canvasBg: '#06060a',
  canvasBgRgb: { r: 6, g: 6, b: 10 },
  bgGlow: 'rgba(124, 58, 237, 0.03)',
  vignetteColor: 'rgba(0,0,0,',
  vignetteStrength: 0.25,

  nodeCircleBg: '#0e0e18',
  nodeCircleBgFaded: '#08080e',
  nodeDropShadow: false,

  groupPillBg: '#13131d',
  groupPillText: '#c0c0c0',
  hullAlphaMultiplier: 1,

  edgeDefaultColor: '#2a2a3a',
  crossCloudEdge: '#ffffff',

  providerColorKey: 'glow',

  warningColor: '#fbbc04',
  costColor: '#668866',
  costColorMuted: '#448844',

  panelBg: 'rgba(0, 0, 8, 0.94)',
  panelBorder: '#1a1a2e',
  panelShadow: '0 0 40px rgba(0, 0, 0, 0.5)',

  textPrimary: '#e0e0e0',
  textSecondary: '#c0c0c0',
  textTertiary: '#555566',
  textMuted: '#444',
  textDim: '#333',

  kbdBg: '#111',
  kbdBorder: '#222',
  kbdText: '#666',
  inputBg: '#0a0a14',
  inputBorder: '#222',
  buttonBg: '#ffffff06',
  buttonBorder: '#ffffff10',

  barBg: '#0a0a14',

  divider: '#1a1a2e',
  dividerSubtle: '#ffffff06',

  statusBarBg: 'rgba(10,10,18,0.9)',
  statusBarBorder: '#1e1e2e',

  accent: '#88aaff',

  useGlowComposite: true,
}

// ---------------------------------------------------------------------------
// Light theme
// ---------------------------------------------------------------------------

export const lightTheme: Theme = {
  name: 'light',

  canvasBg: '#e8eaef',
  canvasBgRgb: { r: 232, g: 234, b: 239 },
  bgGlow: 'rgba(100, 40, 200, 0.03)',
  vignetteColor: 'rgba(180,182,195,',
  vignetteStrength: 0.18,

  nodeCircleBg: '#f8f9fc',
  nodeCircleBgFaded: '#dcdee4',
  nodeDropShadow: true,

  groupPillBg: '#f0f1f5',
  groupPillText: '#3a3a50',
  hullAlphaMultiplier: 2.5,

  edgeDefaultColor: '#9a9cb0',
  crossCloudEdge: '#3a3a55',

  providerColorKey: 'primary',

  warningColor: '#b8860b',    // darkgoldenrod — WCAG AA on white
  costColor: '#2d7a3a',       // darker green for readability
  costColorMuted: '#1a6b2a',

  panelBg: 'rgba(255, 255, 255, 0.94)',
  panelBorder: '#c4c8d2',
  panelShadow: '0 2px 16px rgba(0, 0, 40, 0.10), 0 0 1px rgba(0,0,40,0.08)',

  textPrimary: '#1a1a2e',
  textSecondary: '#2d2d44',
  textTertiary: '#555568',
  textMuted: '#70708a',
  textDim: '#9898b0',

  kbdBg: '#e8e9f0',
  kbdBorder: '#c0c2cc',
  kbdText: '#4a4a60',
  inputBg: '#ecedf2',
  inputBorder: '#c0c2cc',
  buttonBg: 'rgba(0, 0, 30, 0.05)',
  buttonBorder: 'rgba(0, 0, 30, 0.12)',

  barBg: '#d8dae2',

  divider: '#c4c8d2',
  dividerSubtle: 'rgba(0, 0, 30, 0.07)',

  statusBarBg: 'rgba(245, 246, 250, 0.95)',
  statusBarBorder: '#c4c8d2',

  accent: '#3355bb',

  useGlowComposite: false,
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

// ---------------------------------------------------------------------------
// Persistence helper
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'skyglass-theme'

export function loadSavedThemeName(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* noop */ }
  return 'dark'
}

export function saveThemeName(name: 'dark' | 'light') {
  try {
    localStorage.setItem(STORAGE_KEY, name)
  } catch { /* noop */ }
}
