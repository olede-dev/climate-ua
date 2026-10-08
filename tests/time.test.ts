import { describe, expect, it } from 'vitest'

import {
  periodFor,
  periodRange,
  axisSteps,
  nextStep,
  parseStep,
  periodSlots,
  periodYear,
  prevStep,
  shownAxis,
  snapStep,
  stepAtPosition,
  stepIndex,
  stepPosition,
  type TimeAxis,
} from '../src/lib/time'

const climate: TimeAxis = { from: 1950, to: 2025, periods: ['2021-2040', '2041-2060', '2081-2100'] }
const water: TimeAxis = { from: 1980, to: 2019, periods: ['2021-2035', '2036-2050'] }

describe('axis steps', () => {
  it('lists every observed year, then the periods', () => {
    const steps = axisSteps(climate)
    expect(steps).toHaveLength(76 + 3)
    expect(steps.slice(0, 2)).toEqual([1950, 1951])
    expect(steps.slice(-4)).toEqual([2025, '2021-2040', '2041-2060', '2081-2100'])
  })

  it('finds a step and rejects one outside the axis', () => {
    expect(stepIndex(climate, 1950)).toBe(0)
    expect(stepIndex(climate, '2041-2060')).toBe(77)
    expect(stepIndex(climate, 1949)).toBe(-1)
    expect(stepIndex(climate, '2036-2050')).toBe(-1)
  })

  it('steps forward across the history–future gap and stops at the ends', () => {
    expect(nextStep(climate, 2025)).toBe('2021-2040')
    expect(prevStep(climate, '2021-2040')).toBe(2025)
    expect(nextStep(climate, '2081-2100')).toBeNull()
    expect(prevStep(climate, 1950)).toBeNull()
  })
})

describe('periodYear', () => {
  it('takes the middle of a range', () => {
    expect(periodYear('2041-2060')).toBe(2050.5)
  })
})

describe('periodFor', () => {
  it('takes the period holding a year, or the nearest one', () => {
    expect(periodFor(water.periods, 2021)).toBe('2021-2035')
    expect(periodFor(water.periods, 2036)).toBe('2036-2050')
    expect(periodFor(water.periods, 2080)).toBe('2036-2050')
    expect(periodFor(water.periods, 2019)).toBe('2021-2035')
    expect(periodFor([], 2030)).toBeUndefined()
  })
})

describe('snapStep', () => {
  it('keeps a step the axis has', () => {
    expect(snapStep(climate, 1987)).toBe(1987)
  })

  it('keeps an observed year observed, clamped to the range', () => {
    expect(snapStep(water, 2025)).toBe(2019)
    expect(snapStep(water, 1950)).toBe(1980)
  })

  it('moves a period to the one with the nearest middle year', () => {
    expect(snapStep(water, '2041-2060')).toBe('2036-2050')
    expect(snapStep(water, '2021-2040')).toBe('2021-2035')
    expect(snapStep(climate, '2021-2035')).toBe('2021-2040')
    expect(snapStep(climate, '2036-2050')).toBe('2041-2060')
  })

  it('turns a period into the last observed year on an axis without periods', () => {
    expect(snapStep({ from: 1997, to: 2025, periods: [] }, '2041-2060')).toBe(2025)
  })
})

describe('parseStep', () => {
  it('reads years and the layer’s own periods', () => {
    expect(parseStep('1987', climate.periods)).toBe(1987)
    expect(parseStep('2041-2060', climate.periods)).toBe('2041-2060')
    expect(parseStep('2036-2050', water.periods)).toBe('2036-2050')
  })

  it('rejects anything else', () => {
    expect(parseStep('2041-2070', climate.periods)).toBeNull()
    expect(parseStep('87', climate.periods)).toBeNull()
    expect(parseStep('abc', climate.periods)).toBeNull()
  })
})

describe('slider positions', () => {
  it('maps every step to a position and back', () => {
    for (const step of axisSteps(climate)) {
      expect(stepAtPosition(climate, stepPosition(climate, step))).toBe(step)
    }
  })

  it('places the future after a gap, in equal slots', () => {
    const slots = periodSlots(climate)
    expect(slots[0]!.start).toBeGreaterThan(stepPosition(climate, 2025))
    expect(slots[2]!.end).toBeCloseTo(1)
    expect(slots[1]!.end - slots[1]!.start).toBeCloseTo(slots[0]!.end - slots[0]!.start)
  })

  it('clamps positions off the track', () => {
    expect(stepAtPosition(climate, -1)).toBe(1950)
    expect(stepAtPosition(climate, 2)).toBe('2081-2100')
  })

  it('gives the whole track to history when there is no future', () => {
    const rivers: TimeAxis = { from: 1997, to: 2025, periods: [] }
    expect(stepPosition(rivers, 2025)).toBe(1)
    expect(stepAtPosition(rivers, 1)).toBe(2025)
  })
})

describe('periodRange', () => {
  it('reads both ends of a span', () => {
    expect(periodRange('2041-2060')).toEqual([2041, 2060])
  })
})

describe('shownAxis', () => {
  const full: TimeAxis = { from: 1950, to: 2025, periods: ['2021-2040', '2041-2060'] }

  it('keeps only the observed years for a year', () => {
    const years = shownAxis(full, 2000)
    expect(axisSteps(years)).toHaveLength(76)
    expect(stepPosition(years, 2025)).toBe(1)
  })

  it('keeps only the periods for a period, spread over the whole track', () => {
    const future = shownAxis(full, '2041-2060')
    expect(axisSteps(future)).toEqual(['2021-2040', '2041-2060'])
    expect(stepPosition(future, '2021-2040')).toBe(0.25)
    expect(stepAtPosition(future, 0)).toBe('2021-2040')
    expect(nextStep(future, '2021-2040')).toBe('2041-2060')
  })
})
