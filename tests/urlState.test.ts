import { describe, expect, it } from 'vitest'
import { decodeState, encodeState } from '../src/ui/urlState'
import type { StationConfig } from '../src/rf/types'

const VALID = {
  antennas: ['dipole-40', 'dummy-load', 'mag-loop'],
  cables: ['rg58', 'lmr400'],
  modes: ['USB', 'LSB', 'CW'],
  tuners: ['bypass', 'internal', 'external-radio', 'external-antenna'],
}

const config: StationConfig = {
  freqHz: 14_250_000,
  mode: 'USB',
  powerSetW: 75,
  micGain: 50,
  compression: 3,
  antennaId: 'dipole-40',
  antennaParams: { length: 20.1, height: 9 },
  cableId: 'rg58',
  cableLengthM: 22.5,
  tunerMode: 'internal',
  tunerEngaged: true,
  keyed: false,
  envelope: 0,
  ambientC: 25,
  allowDamage: true,
}

describe('scenario links', () => {
  it('round-trips a configuration', () => {
    const s = decodeState(encodeState(config, 'station', true), VALID)
    expect(s.config.freqHz).toBe(14_250_000)
    expect(s.config.antennaId).toBe('dipole-40')
    expect(s.config.cableLengthM).toBeCloseTo(22.5, 1)
    expect(s.config.tunerMode).toBe('internal')
    expect(s.config.antennaParams).toEqual({ length: 20.1, height: 9 })
    expect(s.view).toBe('station')
    expect(s.presenter).toBe(true)
  })

  it('drops values that are not real options', () => {
    const s = decodeState('#a=not-an-antenna&c=fibre&m=SSTV&t=magic&v=basement', VALID)
    expect(s.config.antennaId).toBeUndefined()
    expect(s.config.cableId).toBeUndefined()
    expect(s.config.mode).toBeUndefined()
    expect(s.config.tunerMode).toBeUndefined()
    expect(s.view).toBeNull()
  })

  it('rejects out-of-range numbers rather than clamping them silently', () => {
    const s = decodeState('#f=999999999&l=-5&w=5000', VALID)
    expect(s.config.freqHz).toBeUndefined()
    expect(s.config.cableLengthM).toBeUndefined()
    expect(s.config.powerSetW).toBeUndefined()
  })

  it('ignores malformed antenna parameters', () => {
    const s = decodeState('#p=__proto__~1!length~4!bad key~2!x~notanumber', VALID)
    expect(s.config.antennaParams).toEqual({ length: 4 })
  })

  it('survives an empty hash', () => {
    const s = decodeState('', VALID)
    expect(s.config).toEqual({})
    expect(s.view).toBeNull()
    expect(s.presenter).toBe(false)
  })
})
