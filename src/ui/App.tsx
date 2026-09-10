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
import { useLayout } from './useLayout'
import { Sheet } from './panels/Sheet'
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
  const layout = useLayout()
  const compact = layout === 'compact'
  const cardOpen = useStation((s) => s.cardOpen)
  const stationOpen = rightOpen || (layout === 'medium' && cardOpen)

  // Presenter mode is a document-level switch so the token scale applies to
  // portalled surfaces too.
  useEffect(() => {
    document.documentElement.dataset['presenter'] = presenter ? 'true' : 'false'
  }, [presenter])

  useKeyboardShortcuts()

  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0]

  return (
    <div className={styles.app} data-testid="layout" data-layout={layout} data-view={view}>
      <a className={styles.skip} href="#viewport">Skip to the model</a>

      <header className={styles.header}>
        <div className={styles.brand}>
          <Mark />
          <span className={styles.brandText}>
            <span className={styles.wordmark}>Antinode</span>
            <span className={styles.tagline}>IC&#8209;7300 signal path</span>
          </span>
        </div>

        {/* Six views will not fit across a phone, and a strip that runs off the
            edge hides the ones at the end. Below the wide layout — where the
            header also carries the rail toggles — the same choice becomes a
            native picker, which shows all six in one tap. */}
        {layout !== 'wide' ? (
          <select
            className={styles.viewSelect}
            data-testid="view-select"
            aria-label="View"
            value={view}
            onChange={(e) => setView(e.target.value as ViewId)}
          >
            {VIEWS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        ) : (
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
        )}

        <div className={styles.headerTools} data-compact={compact}>
          {layout === 'medium' && (
            <>
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
            </>
          )}
          {!compact && (
            <>
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
            </>
          )}
        </div>
      </header>

      {!compact && (
        <div
          className={`${styles.rail} ${styles.railLeft}`}
          data-open={leftOpen}
          /* Parked off the edge in the middle layout, a closed drawer is still
             in the tab order — two dozen stops on controls nobody can see. */
          inert={layout === 'medium' && !leftOpen}
        >
          <ChainRail />
        </div>
      )}

      <main className={styles.view} id="viewport">
        {/* The tab already names the view; this only says what it is for. */}
        <p className={styles.viewNote}>{current?.blurb}</p>
        <Viewport />
        {!compact && (
          <>
            <ViewTools showLevels={layout !== 'wide'} />
            <div className={styles.cluster}>
              <Readouts />
            </div>
          </>
        )}
        {tourIndex !== null && !compact && <TourOverlay />}
        {referenceOpen && <Reference onClose={() => setReferenceOpen(false)} />}
      </main>

      {!compact && (
        <div
          className={`${styles.rail} ${styles.railRight}`}
          /* The Handbook lives in this rail. A card opened from the chain
             drawer, or by tapping a part on the model, would otherwise be
             rendered into a drawer parked off the right edge and never seen —
             so an open card opens the drawer that holds it. */
          data-open={stationOpen}
          inert={layout === 'medium' && !stationOpen}
        >
          <StationRail />
          <Handbook />
        </div>
      )}

      {compact && (
        <div className={styles.sheetSlot}>
          <Sheet onOpenReference={() => setReferenceOpen(true)} />
        </div>
      )}

      {/* The tour gets the same slot treatment as the card, and sits above it:
          docked to the foot of a 239px picture row on a small phone, its title,
          step count and progress bar were clipped off the top. */}
      {compact && tourIndex !== null && (
        <div className={`${styles.handbookSlot} ${styles.tourSlot}`}>
          <TourOverlay />
        </div>
      )}

      {/* Its own slot rather than a panel inside the sheet: in the sheet it
          inherited the sheet's height, which on a phone is about 150px of
          reading pane for an article three times that long. As a grid item it
          can take the picture's row as well and still leave the transport bar
          alone — the keys must stay under the reader's thumb while they read,
          and the tour cannot be advanced if its buttons are behind a card. */}
      {compact && cardOpen && (
        <div className={styles.handbookSlot}>
          <Handbook />
        </div>
      )}

      <div className={styles.transport}>
        <Transport layout={layout} />
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
      // Space belongs to a focused tab, switch or radio: those are the controls
      // where it means something other than "transmit", and a keyboard user who
      // has tabbed to a sheet tab should open that tab, not go on the air. Plain
      // buttons keep the presenter's Space — the point of the shortcut is to
      // drive the page from across the room after clicking something else.
      if (e.key === ' ' && target?.closest('[role="tab"], [role="switch"], [role="radio"]')) {
        return
      }
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
