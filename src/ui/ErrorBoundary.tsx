import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { loadSavedThemeName, darkTheme, lightTheme } from '../theme'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[skyglass] Rendering error:', error)
    console.error('[skyglass] Component stack:', errorInfo.componentStack)
  }

  componentDidMount() {
    // Listen for WebGL context loss events on any canvas
    const handleContextLost = (e: Event) => {
      e.preventDefault()
      console.error('[skyglass] WebGL context lost')
      this.setState({ hasError: true, error: new Error('WebGL context was lost. Your GPU may be overloaded or the browser tab was suspended.') })
    }

    // Store the handler so we can remove it later
    this._handleContextLost = handleContextLost

    // Use capture phase to catch it from any canvas
    window.addEventListener('webglcontextlost', handleContextLost, true)
  }

  componentWillUnmount() {
    if (this._handleContextLost) {
      window.removeEventListener('webglcontextlost', this._handleContextLost, true)
    }
  }

  private _handleContextLost: ((e: Event) => void) | null = null

  render() {
    if (this.state.hasError) {
      const theme = loadSavedThemeName() === 'light' ? lightTheme : darkTheme
      const errorMessage = this.state.error?.message || 'An unexpected error occurred while rendering the scene.'

      const isWebGL =
        errorMessage.toLowerCase().includes('webgl') ||
        errorMessage.toLowerCase().includes('context') ||
        errorMessage.toLowerCase().includes('gpu') ||
        errorMessage.toLowerCase().includes('three')

      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: theme.canvasBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'IBM Plex Mono', monospace",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              textAlign: 'center',
              maxWidth: '480px',
              padding: '40px',
              background: theme.panelBg,
              border: `1px solid ${theme.panelBorder}`,
              borderRadius: '10px',
              backdropFilter: 'blur(16px)',
            }}
          >
            <div
              style={{
                fontSize: '16px',
                fontWeight: 300,
                color: theme.textPrimary,
                letterSpacing: '3px',
                textTransform: 'uppercase',
                marginBottom: '24px',
              }}
            >
              <span style={{ fontWeight: 500, color: theme.accent }}>sky</span>
              <span style={{ fontWeight: 300 }}>glass</span>
            </div>

            <div
              style={{
                fontSize: '14px',
                color: '#ef4444',
                fontWeight: 500,
                letterSpacing: '1px',
                marginBottom: '16px',
              }}
            >
              {isWebGL ? 'WebGL Error' : 'Something went wrong'}
            </div>

            <div
              style={{
                fontSize: '11px',
                color: theme.textTertiary,
                lineHeight: 1.6,
                marginBottom: '8px',
              }}
            >
              {errorMessage}
            </div>

            {isWebGL && (
              <div
                style={{
                  fontSize: '10px',
                  color: theme.textMuted,
                  lineHeight: 1.5,
                  marginBottom: '24px',
                  padding: '10px',
                  background: theme.dividerSubtle,
                  borderRadius: '6px',
                  border: `1px solid ${theme.dividerSubtle}`,
                }}
              >
                Try closing other GPU-intensive tabs, updating your graphics drivers, or using a different browser.
              </div>
            )}

            {!isWebGL && <div style={{ height: '24px' }} />}

            <button
              onClick={() => window.location.reload()}
              style={{
                background: `${theme.accent}18`,
                border: `1px solid ${theme.accent}40`,
                borderRadius: '6px',
                color: theme.accent,
                cursor: 'pointer',
                padding: '10px 28px',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '12px',
                letterSpacing: '1px',
                transition: 'all 0.2s ease',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
