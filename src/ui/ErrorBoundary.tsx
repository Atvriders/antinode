import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * A failure inside the 3D scene must not take the room's screen with it.
 *
 * react-three-fiber rethrows errors from inside the canvas into the React tree,
 * so without a boundary one bad frame blanks the whole application mid-talk.
 * This keeps the page, says plainly what happened, and offers the one action
 * that reliably helps.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept: a presenter who hits this needs something to send back.
    console.error('Antinode failed to render', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" style={SHELL}>
        <div style={CARD}>
          <p style={EYEBROW}>Antinode stopped</p>
          <h1 style={TITLE}>The model could not keep drawing.</h1>
          <p style={BODY}>
            This is a bug, not something you did. Reloading starts a clean bench; the station
            configuration in the address bar will be restored.
          </p>
          <pre style={DETAIL}>{error.message}</pre>
          <button type="button" style={BUTTON} onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}

// Inline styles on purpose: if the stylesheet is what failed, this still renders.
const SHELL: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: '#0d1113',
  padding: '24px',
}

const CARD: React.CSSProperties = {
  maxWidth: '52ch',
  background: '#e8e2d4',
  color: '#232a2c',
  padding: '28px 32px',
  borderRadius: 7,
  fontFamily: 'Source Serif 4, Georgia, serif',
}

const EYEBROW: React.CSSProperties = {
  margin: 0,
  fontFamily: 'IBM Plex Sans Condensed, system-ui, sans-serif',
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#9c3b2e',
}

const TITLE: React.CSSProperties = { margin: '6px 0 12px', fontSize: 22, fontWeight: 600, lineHeight: 1.2 }
const BODY: React.CSSProperties = { margin: '0 0 14px', fontSize: 15, lineHeight: 1.55 }

const DETAIL: React.CSSProperties = {
  margin: '0 0 18px',
  padding: '10px 12px',
  background: 'rgba(35,42,44,0.07)',
  borderLeft: '2px solid #9c3b2e',
  fontFamily: 'Chivo Mono, ui-monospace, monospace',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const BUTTON: React.CSSProperties = {
  padding: '8px 20px',
  border: '1px solid #232a2c',
  borderRadius: 3,
  background: '#232a2c',
  color: '#e8e2d4',
  fontFamily: 'IBM Plex Sans Condensed, system-ui, sans-serif',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
