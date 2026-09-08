import { useMemo } from 'react'
import styles from './ChainRail.module.css'
import { Panel } from '../kit/Panel'
import { useStation } from '../../sim/store'
import { STAGES } from '../../content/stages'
import { PARTS_BY_ASSEMBLY } from '../../content/parts'
import { fmtTemp } from '../format'

const ASSEMBLY_LABELS: Record<string, string> = {
  'front-panel': 'Front panel',
  'main-board': 'Main board',
  'pa-board': 'PA and heatsink',
  'lpf-board': 'Low-pass filters',
  'tuner-board': 'Antenna tuner',
  chassis: 'Chassis',
  'rear-panel': 'Rear panel',
  station: 'Outside the radio',
}

/**
 * The left rail. In every view except the exploded one it shows the transmit
 * chain as a run of tap points with the live level at each. In the exploded view
 * it becomes the parts list, because that is what you are looking at.
 */
export function ChainRail() {
  const view = useStation((s) => s.view)
  return view === 'exploded' ? <PartsList /> : <StageList />
}

function StageList() {
  const stages = useStation((s) => s.solution.stages)
  const selected = useStation((s) => s.selectedStage)
  const selectStage = useStation((s) => s.selectStage)
  const keyed = useStation((s) => s.config.keyed)

  const byId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages])

  return (
    <Panel
      legend="Transmit chain"
      aside={keyed ? 'transmitting' : 'receiving'}
      scroll
      className={styles.rail}
    >
      <div className={styles.list} role="list">
        {STAGES.map((def) => {
          const state = byId.get(def.id)
          const live = (state?.activity ?? 0) > 0.02
          const alarm = Boolean(state?.alarm)
          return (
            <button
              key={def.id}
              type="button"
              role="listitem"
              className={styles.stage}
              data-testid={`stage-${def.id}`}
              data-selected={selected === def.id}
              data-domain={def.domain}
              data-live={live}
              data-alarm={alarm}
              aria-pressed={selected === def.id}
              onClick={() => selectStage(selected === def.id ? null : (def.id))}
              title={def.part ? `${def.label} — ${def.part}` : def.label}
            >
              <span className={styles.node} data-live={live} aria-hidden="true" />
              <span className={styles.body}>
                <span className={styles.name}>{def.label}</span>
                {/* The level is the point of the row, so it gets its own line and
                    is allowed to be a full sentence rather than a cramped figure. */}
                <span className={styles.level}>{state?.level ?? '—'}</span>
              </span>
              {alarm && <span className={styles.alarmRow}>{state?.alarm}</span>}
            </button>
          )
        })}
      </div>
      <div className={styles.foot}>
        <p className={styles.footNote}>
          Levels are what a probe would read at that point. Select a stage to open its page.
        </p>
      </div>
    </Panel>
  )
}

function PartsList() {
  const selected = useStation((s) => s.selectedPart)
  const selectPart = useStation((s) => s.selectPart)
  const temps = useStation((s) => s.thermal.temps)
  const damage = useStation((s) => s.thermal.damage)

  return (
    <Panel legend="Breakdown" aside={`${Object.keys(PARTS_BY_ASSEMBLY).length} assemblies`} scroll className={styles.rail}>
      <div className={styles.parts}>
        {Object.entries(PARTS_BY_ASSEMBLY).map(([assembly, parts]) => (
          <div key={assembly}>
            <div className={styles.assembly}>{ASSEMBLY_LABELS[assembly] ?? assembly}</div>
            {parts.map((p) => {
              const t = temps[p.id]
              const d = damage[p.id] ?? 0
              const level = d > 0.5 ? 'fault' : d > 0.05 ? 'hot' : t !== undefined && t > 70 ? 'warn' : 'ok'
              return (
                <button
                  key={p.id}
                  type="button"
                  className={styles.partRow}
                  data-testid={`part-${p.id}`}
                  data-selected={selected === p.id}
                  aria-pressed={selected === p.id}
                  onClick={() => selectPart(selected === p.id ? null : p.id)}
                  title={p.purpose}
                >
                  <span className={styles.partName}>{p.name}</span>
                  <span className={styles.partTemp}>{t === undefined ? '' : fmtTemp(t)}</span>
                  <span
                    className={styles.damageDot}
                    data-level={level === 'ok' ? undefined : level}
                    data-testid={`damage-${p.id}`}
                    aria-label={
                      d > 0.5
                        ? `${p.name} is damaged`
                        : d > 0.05
                          ? `${p.name} is being damaged`
                          : `${p.name} is within limits`
                    }
                  />
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </Panel>
  )
}
