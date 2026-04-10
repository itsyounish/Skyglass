import { useTheme } from '../theme'

interface Props {
  blastMode: boolean
  onToggleBlast: () => void
  onScreenshot?: () => void
  onOpenSearch?: () => void
  onToggleTheme?: () => void
  themeName?: 'dark' | 'light'
}

export function HUD({ blastMode, onToggleBlast, onScreenshot, onOpenSearch, onToggleTheme, themeName }: Props) {
  const { theme } = useTheme()

  const panelStyle: React.CSSProperties = {
    background: theme.panelBg,
    border: `1px solid ${theme.panelBorder}`,
    borderRadius: '6px',
    backdropFilter: 'blur(8px)',
  }

  const kbdS: React.CSSProperties = {
    display: 'inline-block',
    background: theme.kbdBg,
    border: `1px solid ${theme.kbdBorder}`,
    borderRadius: '3px',
    padding: '0px 5px',
    marginRight: '4px',
    fontSize: '9px',
    color: theme.kbdText,
    minWidth: '20px',
    textAlign: 'center',
  }

  const btnBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    ...panelStyle,
    cursor: 'pointer',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '10px',
    color: theme.textTertiary,
    textAlign: 'left',
    transition: 'all 0.2s ease',
  }

  const crossCloudColor = theme.crossCloudEdge

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '20px',
      fontFamily: "'IBM Plex Mono', monospace",
      zIndex: 50,
    }}>
      {/* Title */}
      <div style={{
        fontSize: '16px',
        fontWeight: 300,
        color: theme.textPrimary,
        letterSpacing: '3px',
        textTransform: 'uppercase',
        marginBottom: '6px',
      }}>
        <span style={{ fontWeight: 500, color: theme.accent }}>sky</span>
        <span style={{ fontWeight: 300, color: theme.textPrimary }}>glass</span>
      </div>
      <div style={{ fontSize: '10px', color: theme.textDim, letterSpacing: '1px' }}>
        a looking glass for your cloud
      </div>

      {/* Controls */}
      <div style={{
        marginTop: '16px',
        ...panelStyle,
        padding: '8px 12px',
        fontSize: '10px',
        color: theme.textMuted,
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
      }}>
        <div><kbd style={kbdS}>scroll</kbd> zoom</div>
        <div><kbd style={kbdS}>drag</kbd> orbit</div>
        <div><kbd style={kbdS}>click</kbd> inspect + fly-to</div>
        <div><kbd style={kbdS}>F</kbd> fullscreen</div>
        <div><kbd style={kbdS}>/</kbd> search</div>
        <div><kbd style={kbdS}>P</kbd> screenshot</div>
        <div><kbd style={kbdS}>C</kbd> cost panel</div>
        <div><kbd style={kbdS}>T</kbd> light / dark</div>
        <div><kbd style={kbdS}>Esc</kbd> deselect</div>
      </div>

      {/* Search button */}
      <button onClick={onOpenSearch} style={{ ...btnBase, marginTop: '10px' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={theme.textTertiary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>search / filter</span>
        <kbd style={{ ...kbdS, marginLeft: 'auto', marginRight: 0 }}>/</kbd>
      </button>

      {/* Screenshot button */}
      <button onClick={onScreenshot} style={{ ...btnBase, marginTop: '6px' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={theme.textTertiary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <span>export PNG</span>
        <kbd style={{ ...kbdS, marginLeft: 'auto', marginRight: 0 }}>P</kbd>
      </button>

      {/* Theme toggle */}
      <button onClick={onToggleTheme} style={{ ...btnBase, marginTop: '6px' }}>
        {themeName === 'dark' ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={theme.textTertiary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={theme.textTertiary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
        <span>{themeName === 'dark' ? 'light mode' : 'dark mode'}</span>
        <kbd style={{ ...kbdS, marginLeft: 'auto', marginRight: 0 }}>T</kbd>
      </button>

      {/* Blast radius toggle */}
      <button
        onClick={onToggleBlast}
        style={{
          ...btnBase,
          marginTop: '10px',
          background: blastMode ? 'rgba(239, 68, 68, 0.15)' : panelStyle.background,
          border: blastMode ? '1px solid rgba(239, 68, 68, 0.4)' : panelStyle.border,
          color: blastMode ? '#ef4444' : theme.textTertiary,
          animation: blastMode ? 'blastPulse 2s ease-in-out infinite' : 'none',
        }}
      >
        <kbd style={{ ...kbdS, color: blastMode ? '#ef4444' : theme.kbdText, borderColor: blastMode ? '#ef444440' : theme.kbdBorder }}>B</kbd>
        <span>blast radius {blastMode ? 'ON' : 'off'}</span>
        {blastMode && <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#ef444480' }}>click a node</span>}
      </button>

      {/* Edge type legend */}
      <div style={{
        marginTop: '10px',
        ...panelStyle,
        padding: '8px 12px',
        fontSize: '9px',
        color: theme.textMuted,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}>
        <div style={{ color: theme.textTertiary, marginBottom: '2px', letterSpacing: '1px', textTransform: 'uppercase' }}>edges</div>
        <EdgeLegendItem color="#10b981" label="network" />
        <EdgeLegendItem color="#06b6d4" label="data flow" />
        <EdgeLegendItem color="#8b5cf6" label="dependency" />
        <EdgeLegendItem color={crossCloudColor} label="cross-cloud" dashed />
      </div>
    </div>
  )
}

function EdgeLegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: '16px',
        height: '2px',
        background: color,
        borderRadius: '1px',
        opacity: 0.7,
        ...(dashed ? { backgroundImage: `repeating-linear-gradient(to right, ${color} 0, ${color} 3px, transparent 3px, transparent 6px)`, background: 'none' } : {}),
      }} />
      <span>{label}</span>
    </div>
  )
}
