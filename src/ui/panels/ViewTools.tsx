import { useEffect, useState } from 'react'
import styles from './ViewTools.module.css'
import { Switch, Segmented } from '../kit/Control'
import { useStation } from '../../sim/store'
import { microphone } from '../../sim/mic'
import type { MicStatus } from '../../sim/mic'

/**
 * Controls that belong to the picture rather than to the station: what is drawn,
 * how fast the thermal clock runs, and whether the chain is being driven by a
 * real voice.
 */
export function ViewTools() {
  const showLabels = useStation((s) => s.showLabels)
  const showStandingWave = useStation((s) => s.showStandingWave)
  const showEnergyFlow = useStation((s) => s.showEnergyFlow)
  const timeScale = useStation((s) => s.timeScale)
  const toggle = useStation((s) => s.toggle)
  const setTimeScale = useStation((s) => s.setTimeScale)

  return (
    <div className={styles.tools}>
      <div className={styles.group}>
        <div className={styles.row}>
          <Switch label="Labels" on={showLabels} onChange={() => toggle('showLabels')} />
          <Switch label="Wave" on={showStandingWave} onChange={() => toggle('showStandingWave')} />
          <Switch label="Flow" on={showEnergyFlow} onChange={() => toggle('showEnergyFlow')} />
        </div>
      </div>

      <div className={styles.group}>
        <Segmented
          label="Thermal clock"
          value={String(timeScale)}
          options={[
            { value: '1', label: 'Real', title: 'One second of simulation per second' },
            { value: '10', label: '10×', title: 'Ten times faster, so heating is visible in a talk' },
            { value: '60', label: '60×', title: 'A minute per second — damage in a demonstration' },
          ]}
          onChange={(v) => setTimeScale(Number(v))}
          testIdPrefix="timescale"
        />
        {timeScale > 1 && (
          <p className={styles.note} data-tone="warn">
            Heat is running {timeScale}× faster than real time. Temperatures are correct, the clock is not.
          </p>
        )}
      </div>

      <MicControl />
      <ShareButton />
    </div>
  )
}

function MicControl() {
  const [status, setStatus] = useState<MicStatus>(microphone.status)
  const [level, setLevel] = useState(0)
  const [clipping, setClipping] = useState(false)
  const useMic = useStation((s) => s.useMicrophone)
  const setUseMic = useStation((s) => s.setUseMicrophone)

  useEffect(() => {
    if (status !== 'live') return
    let raf = 0
    const tick = () => {
      const r = microphone.last
      setLevel(r.peak)
      setClipping(r.clipping > 0.05)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [status])

  const onClick = async () => {
    if (microphone.isLive) {
      microphone.stop()
      setUseMic(false)
      setStatus(microphone.status)
      return
    }
    const s = await microphone.start()
    setStatus(s)
    setUseMic(s === 'live')
  }

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.mic}
        data-live={useMic && status === 'live'}
        onClick={() => void onClick()}
        aria-pressed={useMic && status === 'live'}
      >
        <span>{status === 'live' ? 'Live mic' : 'Use my mic'}</span>
        {status === 'live' && (
          <span className={styles.micLevel} aria-hidden="true">
            <span className={styles.micFill} data-clip={clipping} style={{ width: `${Math.round(level * 100)}%` }} />
          </span>
        )}
      </button>
      {microphone.message && <p className={styles.note} data-tone="warn">{microphone.message}</p>}
      {status === 'live' && clipping && (
        <p className={styles.note} data-tone="warn">Your microphone is clipping. Back off, or lower the mic gain.</p>
      )}
      {status !== 'live' && !microphone.message && (
        <p className={styles.note}>Speak into the chain instead of the synthetic voice. Nothing is recorded or sent anywhere.</p>
      )}
    </div>
  )
}

function ShareButton() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={styles.share}
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(
          () => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2200)
          },
          () => setCopied(false),
        )
      }}
    >
      {copied ? 'Link copied' : 'Copy this bench'}
    </button>
  )
}
