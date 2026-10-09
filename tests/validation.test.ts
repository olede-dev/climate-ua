import { describe, expect, it } from 'vitest'

import { periodRange } from '../src/lib/time'
import type { LayerFile, WaterUseFile } from '../src/types'
import cckp from './fixtures/cckp-ukraine-temperature.json'

// The committed data against independent references and against itself across the boundary of
// the observed record and the projection (SPEC §12).
const layers = import.meta.glob<LayerFile>('../public/data/layers/*.json', {
  eager: true,
  import: 'default',
})
const climate = Object.values(layers)
const temp = climate.find((file) => file.layer === 'temp')!
const [waterUse] = Object.values(
  import.meta.glob<WaterUseFile>('../public/data/water-use.json', {
    eager: true,
    import: 'default',
  }),
)

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

/** Standard deviation of the values around their linear trend: year-to-year variability alone. */
function detrendedSd(values: number[]): number {
  const n = values.length
  const mx = (n - 1) / 2
  const my = mean(values)
  const slope =
    values.reduce((s, y, x) => s + (x - mx) * (y - my), 0) /
    values.reduce((s, _, x) => s + (x - mx) ** 2, 0)
  const residuals = values.map((y, x) => y - (my + slope * (x - mx)))
  return Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (n - 1))
}

describe('temperature against the World Bank CCKP', () => {
  const years = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const ours = (year: number) => temp.country.history[year - temp.history.from]!

  // The same ERA5 data averaged over Ukraine by someone else: a difference is our processing
  // (cell weights, the border, the day-weighted year), not the data.
  it('matches CCKP’s own ERA5 country mean year by year, within 0.05 °C', () => {
    const reference = Object.entries(cckp.era5.annual)
      .map(([year, value]) => [Number(year), value] as const)
      .filter(([year]) => year >= temp.history.from && year <= temp.history.to)
    expect(reference.length).toBeGreaterThan(50)
    for (const [year, value] of reference)
      expect(Math.abs(ours(year) - value), String(year)).toBeLessThan(0.05)
  })

  // An independent dataset from station observations: what is left is the datasets' own
  // difference, a few tenths of a degree at most for a flat country.
  it('stays within 0.5 °C of the CRU TS station record over the 1991–2020 norm', () => {
    const norm = mean(years(1991, 2020).map(ours))
    expect(Math.abs(norm - cckp.cru.norm1991to2020)).toBeLessThan(0.5)
  })
})

describe('the first projection against the observed years it overlaps', () => {
  /**
   * How far the observed mean of the overlap years sits from what the projection expects for
   * them, in standard deviations. The projection is a period mean: its change from the norm is
   * taken linearly from the norm's middle year to the period's, at the overlap's middle year.
   * The spread is the models' (p10–p90 of a normal is 2.563 σ, scaled the same way) together
   * with the year-to-year variability of a mean of that many years.
   */
  function zScore(file: LayerFile): { z: number; overlap: [number, number] } {
    const period = file.futurePeriods[0]!
    const [start, end] = periodRange(period)
    const from = Math.max(start, file.history.from)
    const to = Math.min(end, file.history.to)
    const { norm, history, future } = file.country
    const at = (year: number) => history[year - file.history.from]!
    const observed = mean(Array.from({ length: to - from + 1 }, (_, i) => at(from + i)))
    const { median, p10, p90 } = future[period]!
    const share =
      ((from + to) / 2 - (file.norm.from + file.norm.to) / 2) /
      ((start + end) / 2 - (file.norm.from + file.norm.to) / 2)
    const expected = norm + share * (median - norm)
    const normYears = Array.from({ length: file.norm.to - file.norm.from + 1 }, (_, i) =>
      at(file.norm.from + i),
    )
    const variability = detrendedSd(normYears) / Math.sqrt(to - from + 1)
    const models = (share * (p90! - p10!)) / 2.563
    return { z: (observed - expected) / Math.hypot(variability, models), overlap: [from, to] }
  }

  // Three σ for Ukraine as a whole: per oblast, a hundred such checks would flag a few by
  // chance alone. A failure means the projection and the record disagree beyond chance: a
  // model bias left in, a wrong period or unit, or a climate the models did not foresee.
  it.each(climate.map((file) => [file.layer, file] as const))(
    '%s: Ukraine within 3 σ of the projection',
    (_layer, file) => {
      const { z, overlap } = zScore(file)
      expect(overlap[1] - overlap[0], 'overlap years').toBeGreaterThanOrEqual(2)
      expect(Math.abs(z)).toBeLessThan(3)
    },
  )

  // The water record ends before the projection starts: there is nothing to compare, so the
  // continuity rests on the anchor. The observed decade it is tied to must be the record's last,
  // and the model base the decade right after it.
  it('anchors the water projection to the last observed decade', () => {
    const { base } = waterUse!.projection
    expect(base.observed[1]).toBe(waterUse!.history.to)
    expect(base.model[0]).toBe(base.observed[1] + 1)
    expect(base.observed[1] - base.observed[0]).toBe(base.model[1] - base.model[0])
  })
})
