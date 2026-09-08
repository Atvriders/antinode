import styles from './Handbook.module.css'
import { useStation } from '../../sim/store'
import { stageById } from '../../content/stages'
import { partById } from '../../content/parts'
import { fmtImpedance, fmtPower, fmtSwr, fmtTemp, fmtPercent } from '../format'
import type { ComponentStress } from '../../rf/types'

/**
 * The Handbook card.
 *
 * Everything explanatory in this application is printed on paper and everything
 * live is on a panel — and this is the paper. It slides over the right rail when
 * you select a stage or a part, and it prints the live measurements into the
 * middle of the prose, so the reader never has to hold a number in their head
 * while they read about it.
 */
export function Handbook() {
  const stageId = useStation((s) => s.selectedStage)
  const partId = useStation((s) => s.selectedPart)
  const selectStage = useStation((s) => s.selectStage)
  const selectPart = useStation((s) => s.selectPart)
  const solution = useStation((s) => s.solution)
  const thermal = useStation((s) => s.thermal)

  if (!stageId && !partId) return null

  const close = () => {
    selectStage(null)
    selectPart(null)
  }

  if (partId) {
    const part = partById(partId)
    if (!part) return null
    const temp = thermal.temps[part.id]
    const damage = thermal.damage[part.id] ?? 0
    const stresses = solution.stresses.filter((s) => s.componentId === part.id)
    return (
      <article className={styles.card} data-testid="handbook" aria-label={part.name}>
        <header className={styles.head}>
          <div>
            <span className={styles.eyebrow}>{part.assembly.replace('-', ' ')}</span>
            <h2 className={styles.title}>{part.name}</h2>
            {part.part && <p className={styles.part}>{part.part}</p>}
          </div>
          <button type="button" className={styles.close} data-testid="handbook-close" onClick={close} aria-label="Close">
            ×
          </button>
        </header>
        <div className={styles.body}>
          <p className={styles.lede}>{part.purpose}</p>
          <p className={styles.prose}>{part.detail}</p>

          {(temp !== undefined || damage > 0) && (
            <>
              <h3 className={styles.section}>Right now</h3>
              <div className={styles.figures}>
                {temp !== undefined && (
                  <Figure label="Temperature" value={fmtTemp(temp)} tone={temp > 120 ? 'fault' : temp > 90 ? 'hot' : temp > 70 ? 'warn' : undefined} />
                )}
                {damage > 0 && <Figure label="Damage" value={fmtPercent(damage)} tone="fault" />}
              </div>
            </>
          )}

          {stresses.length > 0 && (
            <>
              <h3 className={styles.section}>What the mismatch is doing to it</h3>
              {stresses.map((s) => <StressBlock key={`${s.componentId}-${s.kind}`} stress={s} />)}
            </>
          )}

          {part.failureMode && (
            <>
              <h3 className={styles.section}>How it fails</h3>
              <p className={styles.prose}>{part.failureMode}</p>
            </>
          )}

          <FidelityStamp fidelity={part.fidelity} />
        </div>
      </article>
    )
  }

  if (!stageId) return null
  const stage = stageById(stageId)
  if (!stage) return null
  const state = solution.stages.find((s) => s.id === stage.id)

  return (
    <article className={styles.card} data-testid="handbook" aria-label={stage.label}>
      <header className={styles.head}>
        <div>
          <span className={styles.eyebrow}>
            Stage {stage.index + 1} · {stage.domain.replace('-', ' ')}
          </span>
          <h2 className={styles.title}>{stage.label}</h2>
          {stage.part && <p className={styles.part}>{stage.part}</p>}
        </div>
        <button type="button" className={styles.close} data-testid="handbook-close" onClick={close} aria-label="Close">
          ×
        </button>
      </header>

      <div className={styles.body}>
        <p className={styles.lede}>{stage.purpose}</p>

        <h3 className={styles.section}>What the signal is here</h3>
        <p className={styles.prose}>{stage.representation}</p>

        <div className={styles.figures}>
          <Figure label="Level" value={state?.level ?? '—'} />
          {state?.tempC != null && (
            <Figure label="Temperature" value={fmtTemp(state.tempC)} tone={state.tempC > 90 ? 'hot' : undefined} />
          )}
          {stage.id === 'antenna' && <Figure label="Feedpoint" value={fmtImpedance(solution.antennaZ)} />}
          {stage.id === 'antenna' && <Figure label="Radiated" value={fmtPower(solution.radiatedW)} />}
          {stage.id === 'swr-bridge' && <Figure label="SWR" value={fmtSwr(solution.radioMatch.swr)} />}
          {stage.id === 'feedline' && <Figure label="Peak volts" value={`${solution.standingWave.vPeakVolts.toFixed(0)} V`} />}
          {stage.id === 'feedline' && <Figure label="Peak amps" value={`${solution.standingWave.iPeakAmps.toFixed(2)} A`} />}
          {stage.id === 'final-pa' && <Figure label="Dissipating" value={fmtPower(solution.pa.paDissipationW)} tone={solution.pa.paDissipationW > 120 ? 'hot' : undefined} />}
        </div>

        {state?.alarm && (
          <div className={styles.myth}>
            <div className={styles.mythLabel}>Happening now</div>
            <p className={styles.mythText}>{state.alarm}</p>
          </div>
        )}

        <div className={styles.myth}>
          <div className={styles.mythLabel}>Commonly misunderstood</div>
          <p className={styles.mythText}>{stage.misconception}</p>
        </div>

        <FidelityStamp fidelity={stage.fidelity} />
      </div>
    </article>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={styles.figure}>
      <span className={styles.figureLabel}>{label}</span>
      <span className={styles.figureValue} data-tone={tone}>{value}</span>
    </div>
  )
}

function StressBlock({ stress }: { stress: ComponentStress }) {
  return (
    <div className={styles.myth}>
      <div className={styles.mythLabel}>
        {stress.kind.replace(/-/g, ' ')} · {stress.timescale}
      </div>
      <p className={styles.mythText}>{stress.failureMode}</p>
      <p className={styles.mythText}>
        Measured {stress.measured} against a limit of {stress.limit}.
      </p>
    </div>
  )
}

function FidelityStamp({ fidelity }: { fidelity: 'confirmed' | 'representative' }) {
  return (
    <>
      <span className={styles.stamp} data-fidelity={fidelity} data-testid={`fidelity-${fidelity}`}>
        {fidelity === 'confirmed' ? 'From published sources' : 'Representative model'}
      </span>
      <p className={styles.footnote}>
        {fidelity === 'confirmed'
          ? 'The details on this page are taken from Icom’s published documentation or a component datasheet.'
          : 'Icom does not publish this level of detail, so the behaviour here is modelled on how radios of this class are built. Treat it as a teaching approximation, not a service reference.'}
      </p>
    </>
  )
}
