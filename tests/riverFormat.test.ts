import { describe, expect, it } from 'vitest'

import {
  compareToUsual,
  formatCoordinates,
  formatDischarge,
  formatPct,
  formatPlainDate,
} from '../src/lib/river/format'

// uk-UA groups thousands with a no-break space and uses a decimal comma.
const NBSP = ' '

describe('formatDischarge', () => {
  it('groups thousands and drops decimals from 10 m³/s up', () => {
    expect(formatDischarge(1234.5)).toBe(`1${NBSP}235`)
  })

  it('keeps one decimal below 10 m³/s', () => {
    expect(formatDischarge(4.25)).toBe('4,3')
  })
})

describe('formatPct', () => {
  it('signs deviations with a plus or a typographic minus', () => {
    expect(formatPct(12)).toBe('+12%')
    expect(formatPct(-35)).toBe('−35%')
    expect(formatPct(0)).toBe('0%')
  })
})

describe('formatCoordinates', () => {
  it('writes three decimals with a comma and the hemisphere in Ukrainian', () => {
    expect(formatCoordinates({ lat: 50.475, lon: 30.5 })).toBe('50,475° пн. ш., 30,500° сх. д.')
  })
})

describe('formatPlainDate', () => {
  it('shows the calendar date itself, not the day before in zones west of UTC', () => {
    expect(formatPlainDate('2026-10-05')).toMatch(/^5 жовтня 2026/)
  })
})

describe('English formatting', () => {
  it('uses a decimal point and comma grouping', () => {
    expect(formatDischarge(1234.5, 'en')).toBe('1,235')
    expect(formatDischarge(4.25, 'en')).toBe('4.3')
  })

  it('writes hemispheres as letters', () => {
    expect(formatCoordinates({ lat: 50.475, lon: -30.5 }, 'en')).toBe('50.475° N, 30.500° W')
  })

  it('writes the month in English', () => {
    expect(formatPlainDate('2026-10-05', 'en')).toBe('5 October 2026')
  })
})

describe('compareToUsual', () => {
  it('calls a value within ±10% of usual the same', () => {
    expect(compareToUsual(95, 100)).toEqual({ kind: 'same' })
  })

  it('gives a percent below twice the difference', () => {
    expect(compareToUsual(60, 100)).toEqual({ kind: 'less', pct: 40 })
    expect(compareToUsual(150, 100)).toEqual({ kind: 'more', pct: 50 })
  })

  it('gives whole times from twice the difference', () => {
    expect(compareToUsual(77, 345)).toEqual({ kind: 'less', times: 4 })
    expect(compareToUsual(300, 100)).toEqual({ kind: 'more', times: 3 })
  })

  it('has nothing to say without a usual value', () => {
    expect(compareToUsual(10, 0)).toBeNull()
  })
})
