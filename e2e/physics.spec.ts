import { test, expect } from '@playwright/test'

/**
 * These drive the application the way a presenter would and check that the
 * numbers on screen move the way the physics says they should. They are the
 * tests that would catch a plausible-looking but wrong simulation.
 */

async function boot(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="viewport"] canvas', { timeout: 30_000 })
}

/**
 * Choose an antenna and wait until the interface says it is chosen. Clicking and
 * hoping is how a suite ends up asserting on the previous antenna's numbers.
 */
async function setCableLength(page: import('@playwright/test').Page, metres: number) {
  const control = page.getByTestId('cable-length')
  await control.fill(String(metres))
  await control.dispatchEvent('input')
  // The control must show the new value before anything downstream is believed.
  await expect(control).toHaveValue(String(metres))
}

async function chooseAntenna(page: import('@playwright/test').Page, id: string) {
  const row = page.getByTestId(`antenna-${id}`)
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(row).toHaveAttribute('aria-checked', 'true')
}

/**
 * Read the SWR the way a person does: the part before the colon. The meter has
 * ballistics, so give it time to settle before believing it.
 */
/** SWR at the feedpoint: rendered from the solution, so it is true immediately. */
const antennaSwr = async (page: import('@playwright/test').Page) => {
  const text = (await page.getByTestId('readout-antenna-swr').textContent()) ?? ''
  if (text.includes('>')) return 99
  const head = text.split(':')[0] ?? ''
  const n = Number(head.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

const readSwr = async (page: import('@playwright/test').Page) => {
  const text = (await page.getByTestId('readout-swr').textContent()) ?? ''
  if (text.includes('>')) return 99
  const head = text.split(':')[0] ?? ''
  const n = Number(head.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

/**
 * Read the SWR meter the way a person does: watch it until it stops moving.
 *
 * The meter has real ballistics — fast attack, slow decay — so a reading taken a
 * fixed time after changing two controls is a reading taken mid-swing. Changing
 * antenna and then band momentarily puts a 40 m dipole on 20 m, which pegs the
 * meter, and the needle then takes a couple of seconds to fall back.
 */
const swr = async (page: import('@playwright/test').Page) => {
  // Give the change time to reach the meter before believing anything it says.
  // Without this the loop below can declare a reading settled while it is still
  // the PREVIOUS reading, which is how two different cable lengths came back
  // with the same SWR.
  await page.waitForTimeout(1200)
  let previous = await readSwr(page)
  let stable = 0
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await page.waitForTimeout(350)
    const now = await readSwr(page)
    // Three consecutive identical readings. One is not enough: under software
    // rendering the frame rate is low enough that a decaying needle can look
    // still between two samples while it is still a long way from its target.
    stable = Math.abs(now - previous) < 0.005 ? stable + 1 : 0
    previous = now
    if (stable >= 3) return now
  }
  return previous
}

/** Read a power readout in watts, honouring the unit the interface chose. */
const watts = async (page: import('@playwright/test').Page, id: string) => {
  const text = (await page.getByTestId(id).textContent()) ?? ''
  const n = Number((text.match(/-?[\d.]+/) ?? ['0'])[0])
  if (!Number.isFinite(n)) return 0
  if (text.includes('mW')) return n / 1e3
  if (text.includes('µW')) return n / 1e6
  if (text.includes('nW')) return n / 1e9
  return n
}

test('a dummy load reads 1.0:1 and an antenna off its band does not', async ({ page }) => {
  // Asserted on the feedpoint readout, which is rendered straight from the
  // solution, rather than on the SWR meter, which is ballistic by design. The
  // meter's exact settling is not what this test is for — the wiring is — and on
  // a runner with no GPU the simulation advances only as fast as frames render,
  // so a damped needle can still be mid-swing seconds after a control moves.
  // tests/system.test.ts pins the numbers themselves, with no needle in the way.
  await boot(page)

  await chooseAntenna(page, 'dummy-load')
  await expect.poll(() => antennaSwr(page), { timeout: 30_000, intervals: [300] }).toBeLessThan(1.05)

  await page.getByTestId('band-40m').click()
  await chooseAntenna(page, 'dipole-40')
  await expect.poll(() => antennaSwr(page), { timeout: 30_000, intervals: [300] }).toBeLessThan(2.5)

  await page.getByTestId('band-20m').click()
  await expect.poll(() => antennaSwr(page), { timeout: 30_000, intervals: [300] }).toBeGreaterThan(6)

  // And the meter beside it agrees, once it has had time to.
  await expect.poll(() => readSwr(page), { timeout: 45_000, intervals: [400] }).toBeGreaterThan(6)
})

test('tuning across a resonance sweeps SWR down and back up', async ({ page }) => {
  await boot(page)
  await chooseAntenna(page, 'dipole-40')
  await page.getByTestId('band-40m').click()
  await page.waitForTimeout(500)

  const samples: number[] = []
  for (let i = 0; i < 9; i++) {
    await page.getByTestId('freq-group-3').press('ArrowUp')
    await page.waitForTimeout(120)
    samples.push(await swr(page))
  }
  expect(samples.every((s) => Number.isFinite(s))).toBe(true)
  expect(Math.max(...samples)).toBeGreaterThan(Math.min(...samples))
})

test('a tuner at the radio fixes the radio SWR but not the feedline', async ({ page }) => {
  await boot(page)
  await chooseAntenna(page, 'random-wire-9to1')
  await page.getByTestId('band-20m').click()
  await page.getByTestId('tuner-bypass').click()
  const before = await swr(page)
  const antennaBefore = await page.getByTestId('readout-antenna-swr').textContent()
  expect(before).toBeGreaterThan(2)

  // A wide-range tuner on the desk brings the radio to a match.
  await page.getByTestId('tuner-external-radio').click()
  await page.getByTestId('tune').click()
  await page.waitForTimeout(3000)
  const after = await swr(page)
  expect(after).toBeLessThan(1.6)

  // ...but the feedpoint is exactly as mismatched as it was. That is the lesson.
  const antennaAfter = await page.getByTestId('readout-antenna-swr').textContent()
  expect(antennaAfter).toBe(antennaBefore)
})

test('the internal tuner refuses a load outside its published range', async ({ page }) => {
  // Icom publish 16.7 to 150 ohms, under 3:1. A 9:1 unun on a random wire is
  // well outside that, and the honest answer is that the tuner cannot do it —
  // not that it silently succeeds.
  await boot(page)
  await chooseAntenna(page, 'random-wire-9to1')
  await page.getByTestId('band-20m').click()
  await page.getByTestId('tuner-internal').click()
  await page.getByTestId('tune').click()
  await page.waitForTimeout(3000)
  expect(await swr(page)).toBeGreaterThan(2)
})

test('an open feedline makes the radio protect itself rather than destroy itself', async ({ page }) => {
  // The honest result, and not the one folklore predicts. Into an open circuit
  // the protection circuit cuts the drive hard, so the finals do NOT cook: what
  // is actually at risk is elsewhere. The application has to say that.
  await boot(page)
  await page.getByTestId('preset-open-feedline').click()
  await page.waitForTimeout(400)
  await page.getByTestId('ptt').click()
  await page.getByTestId('timescale-60').click()
  await page.waitForTimeout(6000)

  expect(await watts(page, 'readout-forward')).toBeLessThan(60)
  expect(await swr(page)).toBeGreaterThan(5)

  await page.getByTestId('view-tab-thermal').click()
  await page.waitForTimeout(1200)
  await expect(page.getByTestId('event-log')).toContainText(/SWR|power|protect|reduc/i)
  await page.screenshot({ path: 'screenshots/damage-thermal.png' })
})

test('a full-duty mode into a good load heats the finals far more than a bad SWR does', async ({ page }) => {
  // The lesson about duty cycle: what actually cooks a radio is transmitting
  // continuously, not a mismatch that makes the protection back the drive off.
  await boot(page)
  await page.getByTestId('preset-dummy-load').click()
  await page.getByTestId('mode-RTTY').click()
  await page.getByTestId('ptt').click()
  await page.getByTestId('timescale-60').click()

  // Poll to a value the calibrated model actually reaches. A continuous carrier
  // into a good load settles the PA sensor around 40 degC — the radio warms up
  // and stays there, which is what the one published measurement of this radio
  // shows and why nobody reports it limiting itself in ordinary use.
  const sensor = async () =>
    Number(((await page.getByTestId('readout-patemp').textContent()) ?? '').replace(/[^0-9.-]/g, ''))
  await expect.poll(sensor, { timeout: 60_000, intervals: [500] }).toBeGreaterThan(33)

  // The die is where the duty cycle really shows: tens of degrees above the
  // metal, and it gets there in seconds rather than minutes.
  const die = Number(((await page.getByTestId('readout-die').textContent()) ?? '').replace(/[^0-9.-]/g, ''))
  expect(die).toBeGreaterThan((await sensor()) + 30)
  await page.screenshot({ path: 'screenshots/thermal-full-duty.png' })
})

test('a longer cable flatters the SWR reading while delivering less power', async ({ page }) => {
  await boot(page)
  // A mild mismatch, so the protection circuit is not the variable and the only
  // difference between the two readings is the cable.
  await chooseAntenna(page, 'dipole-20')
  await page.getByTestId('band-20m').click()
  await page.getByTestId('cable-rg58').click()
  // A constant-envelope mode on purpose. The claim is about the cable, and SSB
  // genuinely falls silent between syllables, so measuring it on speech means
  // measuring whether the sample landed on a word.
  await page.getByTestId('mode-FM').click()
  await page.getByTestId('ptt').click()

  await setCableLength(page, 5)
  const shortSwr = await swr(page)
  // Wait for the power readouts to actually come up before taking a baseline
  // from them. Zero is what they read before the first frame of transmit has
  // been simulated, and a zero baseline makes every later comparison vacuous.
  await expect.poll(() => watts(page, 'readout-radiated'), { timeout: 30_000, intervals: [300] }).toBeGreaterThan(10)
  const shortRad = await watts(page, 'readout-radiated')

  await setCableLength(page, 100)

  // Radiated power is rendered straight from the solution, so it is true as soon
  // as the control moves. Assert the expensive half of the lesson on that.
  await expect
    .poll(async () => watts(page, 'readout-radiated'), { timeout: 30_000, intervals: [300] })
    .toBeLessThan(shortRad * 0.6)

  // The SWR meter has ballistics and settles in its own time, so wait for it to
  // reach the claim rather than sampling it twice and comparing. Sampling is
  // what makes this flaky under load: both samples land mid-swing and the test
  // ends up comparing a number with itself.
  await expect
    .poll(async () => readSwr(page), { timeout: 45_000, intervals: [400] })
    .toBeLessThan(shortSwr - 0.05)

  const longRad = await watts(page, 'readout-radiated')
  expect(longRad).toBeLessThan(shortRad)
})
