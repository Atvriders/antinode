import { useEffect, useState } from 'react'
import styles from './App.module.css'
import { Mark } from './Mark'
import { Switch } from './kit/Control'
import { Viewport } from './Viewport'
import { ChainRail } from './panels/ChainRail'
import { StationRail } from './panels/StationRail'
import { Transport } from './panels/Transport'
import { Handbook } from './panels/Handbook'
import { TourOverlay } from './panels/TourOverlay'
import { Readouts } from './panels/Readouts'
import { Reference } from './panels/Reference'
import { ViewTools } from './panels/ViewTools'
import { useStation } from '../sim/store'
import { VIEWS } from '../content/views'
import type { ViewId } from '../content/types'

export function App() {
  const view = useStation((s) => s.view)
  const presenter = useStation((s) => s.presenter)
  const tourIndex = useStation((s) => s.tourIndex)
  const setView = useStation((s) => s.setView)
  const toggle = useStation((s) => s.toggle)
  const startTour = useStation((s) => s.startTour)

  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)

  // Presenter mode is a document-level switch so the token scale applies to
  // portalled surfaces too.
  useEffect(() => {
    document.documentElement.dataset['presenter'] = presenter ? 'true' : 'false'
  }, [presenter])

  useKeyboardShortcuts()

  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0]

  return (
    <div className={styles.app}>
      <a className={styles.skip} href="#viewport">Skip to the model</a>

      <header className={styles.header}>
        <div className={styles.brand}>
          <Mark />
          <span className={styles.brandText}>
            <span className={styles.wordmark}>Antinode</span>
            <span className={styles.tagline}>IC&#8209;7300 signal path</span>
          </span>
        </div>

        <nav className={styles.views} aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={styles.viewTab}
              data-testid={`view-tab-${v.id}`}
              aria-current={v.id === view}
              onClick={() => setView(v.id)}
              title={v.blurb}
            >
              {v.label}
            </button>
          ))}
        </nav>

        <div className={styles.headerTools}>
          <button
            type="button"
            className={`${styles.viewTab} ${styles.railToggle}`}
            aria-expanded={leftOpen}
            onClick={() => { setLeftOpen((o) => !o); setRightOpen(false) }}
          >
            Chain
          </button>
          <button
            type="button"
            className={`${styles.viewTab} ${styles.railToggle}`}
            aria-expanded={rightOpen}
            onClick={() => { setRightOpen((o) => !o); setLeftOpen(false) }}
          >
            Station
          </button>
          <button
            type="button"
            className={styles.viewTab}
            data-testid="reference-open"
            aria-haspopup="dialog"
            onClick={() => setReferenceOpen(true)}
            title="The corrections this application exists to make, and the vocabulary"
          >
            Reference
          </button>
          <Switch label="Tour" on={tourIndex !== null} onChange={startTour} title="Walk through the whole chain, one step at a time" />
          <span data-testid="presenter-toggle">
            <Switch label="Present" on={presenter} onChange={() => toggle('presenter')} title="Larger type and heavier contrast for a projector" />
          </span>
        </div>
      </header>

      <div className={`${styles.rail} ${styles.railLeft}`} data-open={leftOpen}>
        <ChainRail />
      </div>

      <main className={styles.view} id="viewport">
        {/* The tab already names the view; this only says what it is for. */}
        <p className={styles.viewNote}>{current?.blurb}</p>
        <Viewport />
        <ViewTools />
        <div className={styles.cluster}>
          <Readouts />
        </div>
        {tourIndex !== null && <TourOverlay />}
        {referenceOpen && <Reference onClose={() => setReferenceOpen(false)} />}
      </main>

      <div className={`${styles.rail} ${styles.railRight}`} data-open={rightOpen}>
        <StationRail />
        <Handbook />
      </div>

      <div className={styles.transport}>
        <Transport />
      </div>
    </div>
  )
}

/**
 * Keyboard control. A presenter should be able to drive the whole thing from the
 * keyboard while standing away from the machine.
 */
function useKeyboardShortcuts() {
  const store = useStation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const s = store.getState()
      const views: ViewId[] = ['exterior', 'signal-path', 'exploded', 'cutaway', 'thermal', 'station']
      if (e.key >= '1' && e.key <= '6') {
        const v = views[Number(e.key) - 1]
        if (v) { s.setView(v); e.preventDefault() }
        return
      }
      switch (e.key) {
        case ' ':
          e.preventDefault()
          s.setKeyed(!s.config.keyed)
          break
        case 't': case 'T':
          s.runTuner()
          break
        case 'p': case 'P':
          s.toggle('presenter')
          break
        case 'l': case 'L':
          s.toggle('showLabels')
          break
        case 'ArrowRight':
          if (s.tourIndex !== null) { e.preventDefault(); s.tourNext() }
          break
        case 'ArrowLeft':
          if (s.tourIndex !== null) { e.preventDefault(); s.tourPrev() }
          break
        case 'Escape':
          if (s.tourIndex !== null) s.endTour()
          else if (s.cardOpen) { s.selectStage(null); s.selectPart(null) }
          break
        default:
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])
}
