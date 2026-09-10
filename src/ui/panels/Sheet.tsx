import { useState } from 'react'
import styles from './Sheet.module.css'
import { ChainRail } from './ChainRail'
import { StationRail } from './StationRail'
import { Readouts } from './Readouts'
import { RadioSet } from './Transport'
import { ViewTools } from './ViewTools'
import { useStation } from '../../sim/store'
import { fmtPower, fmtSwr, fmtTemp } from '../format'

type SheetTab = 'meters' | 'chain' | 'station' | 'tools'

const swrTone = (swr: number) => (swr < 1.5 ? undefined : swr < 2 ? 'warn' : swr < 3.5 ? 'hot' : 'fault')

/**
 * Every panel, in a drawer under the picture.
 *
 * Each tab carries the one figure that panel is about, so a presenter holding a
 * phone can see the SWR without leaving the tab they are on — the desktop layout
 * shows all of this at once and the small one has to choose, so it chooses the
 * headline.
 */
export function Sheet({ onOpenReference }: { onOpenReference: () => void }) {
  const [tab, setTab] = useState<SheetTab>('meters')
  const swr = useStation((s) => s.meters.swr)
  const po = useStation((s) => s.meters.poW)
  const temp = useStation((s) => s.meters.tempC)
  const antenna = useStation((s) => s.solution.antennaMatch.swr)

  const tabs: { id: SheetTab; label: string; value: string; tone?: string }[] = [
    { id: 'meters', label: 'Meters', value: fmtSwr(swr), tone: swrTone(swr) },
    { id: 'chain', label: 'Chain', value: fmtPower(po) },
    { id: 'station', label: 'Station', value: fmtSwr(antenna), tone: swrTone(antenna) },
    { id: 'tools', label: 'View', value: fmtTemp(temp) },
  ]

  return (
    <section className={styles.sheet} data-testid="sheet">
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Panels"
        onKeyDown={(e) => {
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
          if (!step) return
          e.preventDefault()
          const at = tabs.findIndex((t) => t.id === tab)
          const next = tabs[(at + step + tabs.length) % tabs.length]
          if (!next) return
          setTab(next.id)
          document.getElementById(`sheet-tab-${next.id}`)?.focus()
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`sheet-tab-${t.id}`}
            aria-controls="sheet-panel"
            className={styles.tab}
            data-testid={`sheet-tab-${t.id}`}
            data-tone={t.tone}
            aria-selected={tab === t.id}
            /* Roving tabindex: a tablist is one stop in the tab order, and the
               arrow keys move within it. Four stops for four tabs would put the
               sheet's whole tab strip between the header and its own contents. */
            tabIndex={tab === t.id ? 0 : -1}
            /* A stable name. The label alone: the figure beside it changes
               several times a second, and an accessible name that changes with
               it is read out again every time. */
            aria-label={t.label}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden="true">{t.label}</span>
            <span className={styles.tabValue} aria-hidden="true">
              {t.value}
            </span>
          </button>
        ))}
      </div>

      {/* tabIndex on a tabpanel that scrolls: the Meters tab is all readouts and
          holds nothing focusable, so without this a keyboard user can reach the
          tabs but never scroll the panel they open. */}
      <div
        className={styles.body}
        id="sheet-panel"
        data-testid="sheet-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`sheet-tab-${tab}`}
      >
        {tab === 'meters' && <Readouts />}
        {tab === 'chain' && (
          <>
            {/* The chain begins here: what the speech is turned into and how
                hard the finals are driven. On wider screens both sit in the
                transport bar; a phone has no room for them down there. */}
            <div className={styles.radioSet}>
              <RadioSet modeColumns={4} />
            </div>
            <ChainRail />
          </>
        )}
        {tab === 'station' && <StationRail />}
        {tab === 'tools' && <ViewTools inline onOpenReference={onOpenReference} />}
      </div>
    </section>
  )
}
