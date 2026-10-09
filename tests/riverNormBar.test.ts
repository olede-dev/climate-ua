import { describe, expect, it } from 'vitest'

import { ANOMALY_CLASSES } from '../src/lib/river/marks'
import { normBarScale } from '../src/lib/river/normBar'

const norm = { p10: 100, p25: 150, median: 200, p75: 250, p90: 300 }

describe('normBarScale', () => {
  it('pads the p10–p90 span on both sides', () => {
    const scale = normBarScale(norm, 200)
    expect([scale.low, scale.high]).toEqual([50, 350])
    expect(scale.at(200)).toBe(0.5)
  })

  it('stretches to a value far outside the norm and never below zero', () => {
    expect(normBarScale(norm, 20).low).toBe(20)
    expect(normBarScale(norm, 900).high).toBe(900)
    expect(normBarScale({ ...norm, p10: 5 }, null).low).toBe(0)
  })

  it('puts each water state class over its own range', () => {
    const { gradient } = normBarScale(norm, null)
    const [veryLow, low] = ANOMALY_CLASSES
    expect(gradient).toContain(`${veryLow!.color} 0.00% 16.67%`)
    expect(gradient).toContain(`${low!.color} 16.67% 33.33%`)
  })
})
