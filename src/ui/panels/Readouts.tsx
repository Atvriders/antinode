import styles from './Readouts.module.css'
import { Bar } from '../kit/Bar'
import { useStation } from '../../sim/store'
import { fmtDb, fmtPercent, fmtPower, fmtSwr, fmtTemp } from '../format'

const swrTone = (swr: number) => (swr < 1.5 ? undefined : swr < 2 ? 'warn' : swr < 3.5 ? 'hot' : 'fault')

/**
 * The cluster that floats over the model: the six numbers that matter, the
 * protection banner, and the log of what the radio has decided to do about it.
 *
 * Forward and reflected power are shown together with radiated power, because
 * the gap between "100 W out of the radio" and "31 W actually leaving the
 * antenna" is the whole argument.
 */
export function Readouts() {
  const meters = useStation((s) => s.meters)
  const solution = useStation((s) => s.solution)
  const events = useStation((s) => s.events)
  const thermal = useStation((s) => s.thermal)
  const keyed = useStation((s) => s.config.keyed)

  const p = solution.pa.protection
  const radioSwr = meters.swr
  const antSwr = solution.antennaMatch.swr

  return (
    <div className={styles.cluster}>
      <div className={styles.block}>
        <div className={styles.row}>
          <div className={styles.swrBlock}>
            <span className={styles.swrValue} data-tone={swrTone(radioSwr)} data-testid="readout-swr">
              {fmtSwr(radioSwr)}
            </span>
            <span className={styles.swrWhere}>SWR at the radio</span>
            <span className={styles.splitRow} style={{ marginTop: 4 }}>
              <span className={styles.splitLabel}>At the antenna</span>
              <span className={styles.splitValue} data-testid="readout-antenna-swr" data-tone={antSwr > radioSwr + 0.3 ? 'bad' : undefined}>
                {fmtSwr(antSwr)}
              </span>
            </span>
          </div>

          <div className={styles.meters}>
            <Meter label="PO" value={meters.poW} max={110} unit={fmtPower(meters.poW)} testid="readout-forward" ramp="phosphor" breakpoint={0.92} />
            <Meter label="REF" value={solution.pa.reflectedW} max={110} unit={fmtPower(solution.pa.reflectedW)} testid="readout-reflected" ramp="heat" breakpoint={0.2} />
            <Meter label="ALC" value={meters.alc} max={1} unit={fmtPercent(meters.alc)} ramp="phosphor" breakpoint={0.55} />
            <Meter
            label="ID"
            value={meters.idA}
            max={25}
            unit={`${meters.idA.toFixed(1)} A`}
            ramp="phosphor"
            breakpoint={0.84}
            title="Whole-radio supply current. Icom specify 21 A maximum"
          />
            <Meter
            label="TEMP"
            value={meters.tempC}
            max={100}
            unit={fmtTemp(meters.tempC)}
            testid="readout-patemp"
            ramp="heat"
            breakpoint={0.6}
            title="The sensor on the PA assembly, which is what the radio's own meter reads"
          />
          </div>

          <div className={styles.split}>
            <Split label="Radiated" value={fmtPower(meters.radiatedW)} testid="readout-radiated" />
            <Split
              label="Final die"
              value={fmtTemp(thermal.temps['pa-junction'] ?? 25)}
              tone={(thermal.temps['pa-junction'] ?? 25) > 120 ? 'bad' : undefined}
              testid="readout-die"
            />
            <Split label="In the coax" value={fmtPower(meters.cableLossW)} tone={meters.cableLossW > meters.radiatedW * 0.25 ? 'bad' : undefined} />
            <Split label="In the tuner" value={fmtPower(meters.tunerLossW)} tone={meters.tunerLossW > 5 ? 'bad' : undefined} />
            <Split label="Line loss" value={fmtDb(solution.line.totalLossDb)} />
            <Split label="Of which SWR" value={fmtDb(solution.line.excessLossDb)} tone={solution.line.excessLossDb > 1 ? 'bad' : undefined} />
          </div>
        </div>
      </div>

      {keyed && p.level !== 'normal' && (
        <div className={styles.protection} data-level={p.level} role="status">
          <span className={styles.protectionLamp} aria-hidden="true" />
          <span>{p.reasons[0] ?? 'The radio is protecting itself.'}</span>
        </div>
      )}

      {/*
        What the solver has to say about this station. These are the sentences
        that explain a reading rather than just showing it — that the coax is
        eating a third of the output, that the tuner could not find a match, that
        the antenna is radiating a tenth of what reaches it.
      */}
      {solution.warnings.length > 0 && (
        <div className={styles.block} data-testid="advice">
          <ul className={styles.advice}>
            {solution.warnings.slice(0, 4).map((w, i) => (
              <li key={i} className={styles.adviceItem}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.block}>
        <div className={styles.log} data-testid="event-log" role="log" aria-live="polite" aria-label="Station log">
          {events.length === 0 ? (
            <p className={styles.logEmpty}>Nothing to report. Transmit to start the log.</p>
          ) : (
            events.slice(0, 14).map((e, i) => (
              <div key={`${e.t}-${i}`} className={styles.logRow} data-severity={e.severity}>
                <span className={styles.logTime}>{e.t.toFixed(1)}s</span>
                <span className={styles.logText}>{e.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Meter({
  label, value, max, unit, ramp, breakpoint, testid, title,
}: {
  label: string
  value: number
  max: number
  unit: string
  ramp: 'phosphor' | 'heat'
  breakpoint: number
  testid?: string
  title?: string
}) {
  return (
    <div className={styles.meterRow} title={title}>
      <span className={styles.meterLabel}>{label}</span>
      <Bar value={value} max={max} ramp={ramp} breakpoint={breakpoint} segments={24} label={label} />
      <span
        className={styles.meterValue}
        data-tone={value / max > breakpoint ? 'warn' : undefined}
        data-testid={testid}
      >
        {unit}
      </span>
    </div>
  )
}

function Split({ label, value, tone, testid }: { label: string; value: string; tone?: string; testid?: string }) {
  return (
    <span className={styles.splitRow}>
      <span className={styles.splitLabel}>{label}</span>
      <span className={styles.splitValue} data-tone={tone} data-testid={testid}>{value}</span>
    </span>
  )
}
