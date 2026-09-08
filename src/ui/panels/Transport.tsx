import styles from './Transport.module.css'
import { FreqDisplay } from './FreqDisplay'
import { Slider, Segmented } from '../kit/Control'
import { useStation } from '../../sim/store'
import { BANDS } from '../../rf/bands'
import { MODE_LIST } from '../../rf/audio'
import { fmtPower } from '../format'
import type { Mode } from '../../rf/types'

/**
 * The transport: the handful of controls a presenter touches constantly, laid
 * out the way they sit on the radio — frequency on the left, band and level
 * controls in the middle, and the two keys with consequences on the right.
 */
export function Transport() {
  const config = useStation((s) => s.config)
  const tunerBusy = useStation((s) => s.tunerBusy)
  const setFreq = useStation((s) => s.setFreq)
  const setBand = useStation((s) => s.setBand)
  const setMode = useStation((s) => s.setMode)
  const setPower = useStation((s) => s.setPower)
  const setMicGain = useStation((s) => s.setMicGain)
  const setCompression = useStation((s) => s.setCompression)
  const setKeyed = useStation((s) => s.setKeyed)
  const runTuner = useStation((s) => s.runTuner)

  const band = BANDS.find((b) => config.freqHz >= b.startHz && config.freqHz <= b.endHz)

  return (
    <div className={styles.transport}>
      <div data-testid="freq-display">
        <FreqDisplay hz={config.freqHz} onChange={setFreq} />
      </div>

      <div className={styles.middle}>
        <div className={styles.bandRow} role="group" aria-label="Band">
          {BANDS.map((b) => (
            <button
              key={b.id}
              type="button"
              className={styles.bandKey}
              data-testid={`band-${b.id}`}
              data-on={band?.id === b.id}
              aria-pressed={band?.id === b.id}
              onClick={() => setBand(b.id)}
              title={`${b.label}: ${(b.startHz / 1e6).toFixed(3)} to ${(b.endHz / 1e6).toFixed(3)} MHz`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className={styles.knobRow}>
          <Segmented<Mode>
            label="Mode"
            value={config.mode}
            options={MODE_LIST.map((m) => ({ value: m.id, label: m.label, title: m.note }))}
            onChange={setMode}
            testIdPrefix="mode"
          />
          <Slider
            testId="power-set"
            label="RF power"
            value={config.powerSetW}
            min={0}
            max={100}
            step={1}
            format={(v) => fmtPower(v)}
            onChange={setPower}
          />
          <Slider
            label="Mic gain"
            value={config.micGain}
            min={0}
            max={100}
            step={1}
            onChange={setMicGain}
            help="Sets how hard the speech drives the modulator. Watch the ALC, not this number."
          />
          <Slider
            label="Compression"
            value={config.compression}
            min={0}
            max={10}
            step={1}
            format={(v) => (v === 0 ? 'off' : String(v))}
            onChange={setCompression}
            help="Raises average power without raising the peak. It does not make you louder, it makes you denser."
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.bigKey}
          data-testid="tune"
          data-busy={tunerBusy}
          onClick={runTuner}
          disabled={config.tunerMode === 'bypass'}
          title={
            config.tunerMode === 'bypass'
              ? 'No tuner is in circuit. Choose one in the station panel.'
              : 'Run the tuner at this frequency'
          }
        >
          Tune
          <span className={styles.bigKeySub}>{tunerBusy ? 'searching' : config.tunerMode === 'bypass' ? 'bypassed' : 'ready'}</span>
        </button>
        <button
          type="button"
          className={styles.bigKey}
          data-testid="ptt"
          data-on={config.keyed}
          aria-pressed={config.keyed}
          onClick={() => setKeyed(!config.keyed)}
          title="Transmit. Space bar does the same."
        >
          {config.keyed ? 'On air' : 'Transmit'}
          <span className={styles.bigKeySub}>{config.keyed ? 'space to stop' : 'space'}</span>
        </button>
      </div>
    </div>
  )
}
