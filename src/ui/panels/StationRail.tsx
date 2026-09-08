import styles from './StationRail.module.css'
import { Panel } from '../kit/Panel'
import { Slider, Segmented } from '../kit/Control'
import { SmithChart } from '../charts/SmithChart'
import { SweepPlot } from '../charts/SweepPlot'
import { useStation } from '../../sim/store'
import { ANTENNA_LIST, antennaImpedance, antennaSwrSweep, defaultParams } from '../../rf/antennas'
import { CABLE_LIST } from '../../rf/cables'
import { swrFromZ } from '../../rf/match'
import { bandForFreq } from '../../rf/bands'
import { PRESETS } from '../../content/presets'
import { fmtLength, fmtSwr } from '../format'
import type { CableId, TunerMode } from '../../rf/types'
import { useMemo } from 'react'

const TUNER_OPTIONS: readonly { value: TunerMode; label: string; title: string }[] = [
  { value: 'bypass', label: 'None', title: 'The radio sees whatever the feedline presents' },
  { value: 'internal', label: 'Internal', title: "The IC-7300's own tuner, at the radio" },
  { value: 'external-radio', label: 'Ext at rig', title: 'A wide-range tuner on the desk, at the radio end of the coax' },
  { value: 'external-antenna', label: 'Ext at ant', title: 'A remote tuner at the feedpoint, where it also fixes the feedline' },
]

/**
 * The right rail: the station outside the radio, and the two instruments that
 * measure it. The SWR sweep and the Smith chart are deliberately together —
 * they are the same fact drawn two ways, and seeing both at once is what makes
 * the difference between resonance and a match click.
 */
export function StationRail() {
  const config = useStation((s) => s.config)
  const solution = useStation((s) => s.solution)
  const setAntenna = useStation((s) => s.setAntenna)
  const setAntennaParam = useStation((s) => s.setAntennaParam)
  const setCable = useStation((s) => s.setCable)
  const setCableLength = useStation((s) => s.setCableLength)
  const setTunerMode = useStation((s) => s.setTunerMode)
  const setFreq = useStation((s) => s.setFreq)
  const applyPreset = useStation((s) => s.applyPreset)

  const antenna = ANTENNA_LIST.find((a) => a.id === config.antennaId)
  const band = bandForFreq(config.freqHz)

  // The sweep spans the current band with a margin, so the shape of the
  // resonance is visible rather than a single point on a flat line.
  const span = useMemo(() => {
    const start = band ? band.startHz : config.freqHz * 0.9
    const end = band ? band.endHz : config.freqHz * 1.1
    const pad = (end - start) * 0.35
    return { f0: Math.max(1e6, start - pad), f1: end + pad }
  }, [band, config.freqHz])

  const sweep = useMemo(
    () => antennaSwrSweep(config.antennaId, config.antennaParams, span.f0, span.f1, 220),
    [config.antennaId, config.antennaParams, span.f0, span.f1],
  )

  const locus = useMemo(() => {
    const out = []
    for (let i = 0; i <= 60; i++) {
      const f = span.f0 + ((span.f1 - span.f0) * i) / 60
      out.push(antennaImpedance(config.antennaId, f, config.antennaParams))
    }
    return out
  }, [config.antennaId, config.antennaParams, span.f0, span.f1])

  return (
    <div className={styles.rail}>
      <Panel legend="Antenna" aside={antenna?.family} scroll>
        <div className={styles.antennaList} role="radiogroup" aria-label="Antenna">
          {ANTENNA_LIST.map((a) => {
            // Show each antenna at its own default settings, so the column compares
            // antennas rather than whatever the last one was left tuned to.
            const swr = swrFromZ(antennaImpedance(a.id, config.freqHz, defaultParams(a.id)))
            const tone = swr < 2 ? 'good' : swr < 5 ? 'warn' : 'bad'
            const on = a.id === config.antennaId
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={styles.antenna}
                data-testid={`antenna-${a.id}`}
                data-on={on}
                onClick={() => setAntenna(a.id)}
                title={a.summary}
              >
                <span className={styles.antennaName}>{a.short}</span>
                <span className={styles.antennaSwr} data-tone={tone}>{fmtSwr(swr)}</span>
                {on && <span className={styles.antennaMeta}>{a.summary}</span>}
              </button>
            )
          })}
        </div>
      </Panel>

      {antenna && antenna.params.length > 0 && (
        <Panel legend="Antenna adjustment" aside={antenna.selfTunable ? 'tunable' : undefined}>
          <div className={styles.paramList}>
            {antenna.params.map((p) => (
              <div key={p.key} data-testid={`antenna-param-${p.key}`}>
                <Slider
                  label={p.label}
                  value={config.antennaParams[p.key] ?? p.default}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  unit={p.unit}
                  onChange={(v) => setAntennaParam(p.key, v)}
                  help={p.help}
                />
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel legend="Feedline">
        <div className={styles.group}>
          <Segmented<CableId>
            value={config.cableId}
            options={CABLE_LIST.map((c) => ({ value: c.id, label: c.name, title: c.note }))}
            onChange={setCable}
            testIdPrefix="cable"
            columns={CABLE_LIST.length > 3 ? 3 : CABLE_LIST.length}
          />
          <Slider
            testId="cable-length"
            label="Length"
            value={config.cableLengthM}
            min={1}
            max={120}
            step={1}
            format={(v) => fmtLength(v)}
            onChange={setCableLength}
            help="Loss scales with length, and so does how much the line flatters the SWR reading."
          />
        </div>
      </Panel>

      <Panel legend="Matching">
        <div className={styles.group}>
          <div role="radiogroup" aria-label="Tuner">
            <Segmented<TunerMode>
              value={config.tunerMode}
              options={TUNER_OPTIONS}
              onChange={setTunerMode}
              columns={2}
              testIdPrefix="tuner"
            />
          </div>
          <p
            className={styles.tunerNote}
            data-tone={solution.tuner.engaged && !solution.tuner.matched ? 'bad' : undefined}
          >
            {tunerCopy(solution.tuner.engaged, solution.tuner.matched, solution.tuner.failureReason, config.tunerMode)}
          </p>
        </div>
      </Panel>

      <Panel legend="Measured" aside={`${(config.freqHz / 1e6).toFixed(3)} MHz`}>
        <div className={styles.chartStack}>
          <SweepPlot
            data={sweep}
            f0={span.f0}
            f1={span.f1}
            marker={config.freqHz}
            band={band ? { startHz: band.startHz, endHz: band.endHz } : undefined}
            limit={3}
            onScrub={setFreq}
          />
          <SmithChart
            z={solution.antennaZ}
            locus={locus}
            markers={[
              { z: solution.antennaZ, label: 'antenna', tone: 'var(--smith)' },
              { z: solution.radioLoadZ, label: 'at the radio', tone: 'var(--phosphor)' },
            ]}
            swrCircles={[1.5, 2, 3]}
            label="Impedance across this band"
          />
        </div>
      </Panel>

      <Panel legend="Scenarios">
        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.preset}
              data-testid={`preset-${p.id}`}
              onClick={() => applyPreset(p.id)}
              title={`${p.blurb} — ${p.expect}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function tunerCopy(engaged: boolean, matched: boolean, reason: string, mode: TunerMode): string {
  if (!engaged) {
    return 'No matching network in circuit. The radio sees whatever the feedline hands it.'
  }
  if (!matched) {
    return reason || 'The tuner could not find a match at this frequency.'
  }
  if (mode === 'external-antenna') {
    return 'Matched at the feedpoint, so the coax runs at low SWR too and the extra loss goes away.'
  }
  return 'Matched at the radio. The feedline beyond the tuner is exactly as mismatched as it was.'
}
