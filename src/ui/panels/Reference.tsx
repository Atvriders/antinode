import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './Reference.module.css'
import { MYTHS } from '../../content/myths'
import { GLOSSARY } from '../../content/glossary'
import { PRESETS } from '../../content/presets'
import { useStation } from '../../sim/store'

type Tab = 'myths' | 'glossary'

/**
 * The reference drawer.
 *
 * The myth cards are the point of the whole application — they are the specific
 * corrections it exists to make — and they need somewhere to be read, not just
 * somewhere to be stored. Where a card names a scenario that demonstrates it,
 * the demonstration is one click away, which is the difference between telling a
 * room something and showing them.
 */
export function Reference({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('myths')
  const [query, setQuery] = useState('')
  const applyPreset = useStation((s) => s.applyPreset)
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    sheet.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const needle = query.trim().toLowerCase()

  const myths = useMemo(
    () =>
      MYTHS.filter(
        (m) =>
          !needle ||
          m.myth.toLowerCase().includes(needle) ||
          m.reality.toLowerCase().includes(needle) ||
          m.evidence.toLowerCase().includes(needle),
      ),
    [needle],
  )

  const terms = useMemo(
    () =>
      GLOSSARY.filter(
        (g) => !needle || g.term.toLowerCase().includes(needle) || g.definition.toLowerCase().includes(needle),
      ),
    [needle],
  )

  /** A demo string names a scenario; run it if we can recognise one. */
  const runDemo = (demo: string) => {
    const hit = PRESETS.find(
      (p) => demo.toLowerCase().includes(p.name.toLowerCase()) || demo.toLowerCase().includes(p.id.replace(/-/g, ' ')),
    )
    if (hit) {
      applyPreset(hit.id)
      onClose()
    }
  }

  return (
    <div
      className={styles.scrim}
      data-testid="reference"
      role="dialog"
      aria-modal="true"
      aria-label="Reference"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.sheet} ref={sheet} tabIndex={-1}>
        <header className={styles.head}>
          <h2 className={styles.title}>Reference</h2>
          <div className={styles.tabs} role="tablist" aria-label="Reference section">
            <button
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={tab === 'myths'}
              data-testid="reference-tab-myths"
              onClick={() => setTab('myths')}
            >
              What people get wrong ({MYTHS.length})
            </button>
            <button
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={tab === 'glossary'}
              data-testid="reference-tab-glossary"
              onClick={() => setTab('glossary')}
            >
              Glossary ({GLOSSARY.length})
            </button>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close" data-testid="reference-close">
            ×
          </button>
        </header>

        <div className={styles.body}>
          <input
            className={styles.search}
            type="search"
            value={query}
            placeholder={tab === 'myths' ? 'Search the corrections' : 'Search the glossary'}
            aria-label="Search"
            onChange={(e) => setQuery(e.target.value)}
          />

          {tab === 'myths' ? (
            myths.length === 0 ? (
              <p className={styles.empty}>Nothing matches “{query}”.</p>
            ) : (
              myths.map((m) => (
                <article key={m.id} className={styles.myth} data-testid={`myth-${m.id}`}>
                  <div className={styles.mythLabel}>What people say</div>
                  <p className={styles.mythClaim}>“{m.myth}”</p>
                  <p className={styles.mythReality}>{m.reality}</p>
                  <p className={styles.mythEvidence}>{m.evidence}</p>
                  {m.demo && (
                    <button type="button" className={styles.demo} onClick={() => runDemo(m.demo ?? '')}>
                      Show me: {m.demo}
                    </button>
                  )}
                </article>
              ))
            )
          ) : terms.length === 0 ? (
            <p className={styles.empty}>Nothing matches “{query}”.</p>
          ) : (
            terms.map((g) => (
              <div key={g.term} className={styles.entry}>
                <div className={styles.term}>{g.term}</div>
                <p className={styles.definition}>{g.definition}</p>
                {g.seeAlso.length > 0 && <p className={styles.seeAlso}>See also: {g.seeAlso.join(', ')}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
