import styles from './TourOverlay.module.css'
import { useStation } from '../../sim/store'
import { TOUR } from '../../content/tour'

/**
 * The guided tour. It drives the whole application from the front, so a
 * presenter can run the session with two keys and never touch a control.
 */
export function TourOverlay() {
  const index = useStation((s) => s.tourIndex)
  const next = useStation((s) => s.tourNext)
  const prev = useStation((s) => s.tourPrev)
  const end = useStation((s) => s.endTour)

  if (index === null) return null
  const step = TOUR[index]
  if (!step) return null

  const last = index === TOUR.length - 1

  return (
    <aside className={styles.overlay} data-testid="tour-step" aria-live="polite" aria-label={`Tour step ${index + 1}`}>
      <div className={styles.progress} aria-hidden="true">
        {TOUR.map((s, i) => (
          <span key={s.id} className={styles.tick} data-done={i < index} data-current={i === index} />
        ))}
      </div>

      <header className={styles.head}>
        <h2 className={styles.title}>{step.title}</h2>
        <span className={styles.count}>
          {index + 1} of {TOUR.length}
        </span>
      </header>

      <p className={styles.body} dangerouslySetInnerHTML={{ __html: inline(step.body) }} />
      <p className={styles.takeaway}>{step.takeaway}</p>

      <footer className={styles.foot}>
        <span className={styles.hint}>Arrow keys move, Escape leaves</span>
        <div className={styles.nav}>
          <button type="button" className={styles.key} onClick={end}>
            Leave
          </button>
          <button type="button" className={styles.key} data-testid="tour-prev" onClick={prev} disabled={index === 0}>
            Back
          </button>
          <button
            type="button"
            className={`${styles.key} ${styles.keyPrimary}`}
            data-testid="tour-next"
            onClick={last ? end : next}
          >
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </footer>
    </aside>
  )
}

/**
 * The tour body supports **bold** and `code` and nothing else. Everything else is
 * escaped, so a content file can never inject markup into the page.
 */
function inline(src: string): string {
  const escaped = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}
