/**
 * Scenario links.
 *
 * A presenter should be able to bookmark the exact bench they want to open with,
 * and answer "can you send me that?" with a URL. The hash carries only the
 * station configuration — never anything derived — so a link opened later
 * reproduces the same physics even if the model has been improved since.
 */

import type { StationConfig } from '../rf/types'
import type { ViewId } from '../content/types'

export interface SharedState {
  readonly config: Partial<StationConfig>
  readonly view: ViewId | null
  readonly presenter: boolean
}

const VIEW_IDS: readonly string[] = ['exterior', 'signal-path', 'exploded', 'cutaway', 'thermal', 'station']

/** Compact keys keep the URL short enough to read out loud. */
export function encodeState(config: StationConfig, view: ViewId, presenter: boolean): string {
  const p = new URLSearchParams()
  p.set('f', String(Math.round(config.freqHz)))
  p.set('m', config.mode)
  p.set('a', config.antennaId)
  p.set('c', config.cableId)
  p.set('l', config.cableLengthM.toFixed(1))
  p.set('t', config.tunerMode)
  p.set('w', String(Math.round(config.powerSetW)))
  p.set('v', view)
  if (presenter) p.set('x', '1')
  const params = Object.entries(config.antennaParams)
  if (params.length > 0) {
    p.set('p', params.map(([k, v]) => `${k}~${round(v)}`).join('!'))
  }
  return p.toString()
}

const round = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(3)) : 0)

/**
 * Read a link. Every field is validated against the real option lists, because a
 * hand-edited URL must not be able to put the simulator into a state its physics
 * was never written for.
 */
export function decodeState(
  hash: string,
  valid: {
    antennas: readonly string[]
    cables: readonly string[]
    modes: readonly string[]
    tuners: readonly string[]
  },
): SharedState {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const config: Record<string, unknown> = {}

  // Number(null) is 0, which is finite and often in range, so an absent key would
  // otherwise decode as a deliberate zero. Every numeric field checks presence first.
  const num = (key: string): number | null => {
    const raw = p.get(key)
    if (raw === null || raw.trim() === '') return null
    const v = Number(raw)
    return Number.isFinite(v) ? v : null
  }

  const f = num('f')
  if (f !== null && f >= 1_000_000 && f <= 60_000_000) config['freqHz'] = f

  const m = p.get('m')
  if (m && valid.modes.includes(m)) config['mode'] = m

  const a = p.get('a')
  if (a && valid.antennas.includes(a)) config['antennaId'] = a

  const c = p.get('c')
  if (c && valid.cables.includes(c)) config['cableId'] = c

  const l = num('l')
  if (l !== null && l >= 0 && l <= 300) config['cableLengthM'] = l

  const t = p.get('t')
  if (t && valid.tuners.includes(t)) config['tunerMode'] = t

  const w = num('w')
  if (w !== null && w >= 0 && w <= 100) config['powerSetW'] = w

  const raw = p.get('p')
  if (raw) {
    const params: Record<string, number> = {}
    for (const pair of raw.split('!')) {
      const parts = pair.split('~')
      const key = parts[0]
      const value = Number(parts[1])
      // Antenna parameter keys are short identifiers; anything else is a
      // malformed or hostile link and is dropped rather than repaired.
      if (key && /^[a-zA-Z][a-zA-Z0-9_]{0,20}$/.test(key) && Number.isFinite(value)) {
        params[key] = value
      }
    }
    if (Object.keys(params).length > 0) config['antennaParams'] = params
  }

  const v = p.get('v')
  return {
    config: config,
    view: v && VIEW_IDS.includes(v) ? (v as ViewId) : null,
    presenter: p.get('x') === '1',
  }
}

/** Write the current bench into the address bar without adding a history entry. */
export function pushState(encoded: string): void {
  if (typeof window === 'undefined') return
  const url = `${window.location.pathname}${window.location.search}#${encoded}`
  window.history.replaceState(null, '', url)
}
