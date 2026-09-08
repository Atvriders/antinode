import type { ReactNode } from 'react'
import styles from './kit.module.css'

/**
 * A machined sub-panel. Every region of the instrument is one of these, so the
 * whole interface reads as one milled face rather than a stack of cards.
 */
export function Panel({
  legend,
  aside,
  children,
  scroll = false,
  flush = false,
  className = '',
}: {
  legend?: string
  aside?: ReactNode
  children: ReactNode
  scroll?: boolean
  flush?: boolean
  className?: string
}) {
  return (
    <section className={`${styles.panel} ${flush ? styles.panelFlush : ''} ${className}`}>
      {legend !== undefined && (
        <header className={styles.panelHead}>
          <span className={`legend ${styles.panelLegend}`}>{legend}</span>
          {aside && <span className={styles.panelAside}>{aside}</span>}
        </header>
      )}
      <div className={scroll ? styles.panelBodyScroll : styles.panelBody}>{children}</div>
    </section>
  )
}
