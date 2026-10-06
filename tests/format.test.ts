import { describe, expect, it } from 'vitest'

import { formatNumber, formatPeriod, formatWithUnit, plural } from '../src/lib/format'

describe('formatNumber', () => {
  it('writes a decimal comma in Ukrainian and a point in English', () => {
    expect(formatNumber(9.25, 'uk')).toBe('9,3')
    expect(formatNumber(9.25, 'en')).toBe('9.3')
  })

  it('signs anomalies with a typographic minus', () => {
    expect(formatNumber(1.24, 'uk', { signed: true })).toBe('+1,2')
    expect(formatNumber(-0.44, 'uk', { signed: true })).toBe('−0,4')
  })

  it('never writes a signed zero', () => {
    expect(formatNumber(-0.04, 'uk', { signed: true })).toBe('0,0')
    expect(formatNumber(-0.04, 'en')).toBe('0.0')
  })
})

describe('formatWithUnit', () => {
  it('keeps the unit on the same line', () => {
    expect(formatWithUnit(1.6, '°C', 'uk', { signed: true })).toBe('+1,6 °C')
  })
})

describe('formatPeriod', () => {
  it('uses an en dash', () => {
    expect(formatPeriod('2041-2060')).toBe('2041–2060')
    expect(formatPeriod('2050')).toBe('2050')
  })
})

describe('plural', () => {
  const forms = { one: 'моделі', other: 'моделей' }

  it('follows the Ukrainian plural rules, falling back to other', () => {
    expect(plural(21, 'uk', forms)).toBe('моделі')
    expect(plural(23, 'uk', forms)).toBe('моделей')
    expect(plural(11, 'uk', forms)).toBe('моделей')
  })

  it('follows the English ones', () => {
    expect(plural(1, 'en', { one: 'model', other: 'models' })).toBe('model')
    expect(plural(23, 'en', { one: 'model', other: 'models' })).toBe('models')
  })
})
