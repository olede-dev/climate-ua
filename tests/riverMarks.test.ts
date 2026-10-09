import { describe, expect, it } from 'vitest'

import { uk } from '../src/i18n/uk'
import {
  ANOMALY_CLASSES,
  classify,
  LOW_FLOW_CLASSES,
  riverLegend,
  riverMarks,
  TREND_CLASSES,
  UNCLASSIFIED_FILL,
  type MarkContext,
} from '../src/lib/river/marks'
import type { StationState } from '../src/types'

const state = (
  id: string,
  extra: Partial<StationState> = {},
  station: Partial<StationState['station']> = {},
): StationState =>
  ({
    station: { id, meanChangePct: 0, lowFlowDays: [0, 20], ...station },
    cell: null,
    current: null,
    norm: null,
    anomalyClass: null,
    anomalyPct: null,
    ...extra,
  }) as StationState

const context: MarkContext = {
  locale: 'uk',
  copy: uk.river,
  years: { from: 2000, to: 2001 },
  year: 2001,
}

describe('classify', () => {
  it('puts a bound into the lower class', () => {
    expect(classify(TREND_CLASSES, -30)?.id).toBe('strong-decrease')
    expect(classify(TREND_CLASSES, 10)?.id).toBe('stable')
    expect(classify(TREND_CLASSES, 31)?.id).toBe('strong-increase')
    expect(classify(LOW_FLOW_CLASSES, 0)?.id).toBe('none')
    expect(classify(LOW_FLOW_CLASSES, 90)?.id).toBe('extreme')
    expect(classify(LOW_FLOW_CLASSES, null)).toBeNull()
  })
})

describe('riverMarks', () => {
  it('colours the water state and pulses strong anomalies', () => {
    const marks = riverMarks(
      'state',
      [
        state('a', { anomalyClass: 'very-low', anomalyPct: -60 }),
        state('b', { anomalyClass: 'normal', anomalyPct: 5 }),
        state('c'),
      ],
      context,
    )
    expect(marks.get('a')).toMatchObject({ fill: '#a6611a', tint: '#a6611a', pulse: true })
    // Near normal keeps the plain river colour.
    expect(marks.get('b')).toMatchObject({ fill: '#c7c7c7', tint: null, pulse: false })
    expect(marks.get('c')).toMatchObject({ fill: UNCLASSIFIED_FILL, tint: null })
  })

  it('draws no-data stations as an outline', () => {
    const marks = riverMarks('state', [state('a', { anomalyClass: 'no-data' })], context)
    expect(marks.get('a')).toMatchObject({ fill: null, tint: null, pulse: false })
  })

  it('classifies the trend and the low-flow days of the chosen year', () => {
    const states = [state('a', {}, { meanChangePct: -35, lowFlowDays: [0, 50] })]
    expect(riverMarks('trend', states, context).get('a')).toMatchObject({
      fill: '#a6611a',
      detail: 'тренд стоку −35%',
    })
    expect(riverMarks('lowFlow', states, context).get('a')).toMatchObject({
      fill: LOW_FLOW_CLASSES[3]!.color,
      detail: '50 днів',
    })
    expect(riverMarks('lowFlow', states, { ...context, year: 2000 }).get('a')).toMatchObject({
      fill: LOW_FLOW_CLASSES[0]!.color,
      tint: null,
    })
    expect(riverMarks('lowFlow', states, { ...context, year: 1990 }).get('a')!.fill).toBe(
      UNCLASSIFIED_FILL,
    )
  })
})

describe('riverLegend', () => {
  it('lists every class of the view', () => {
    expect(riverLegend('state', uk.river, undefined).rows).toHaveLength(ANOMALY_CLASSES.length)
    const trend = riverLegend('trend', uk.river, {
      baseline: { from: 1997, to: 2010 },
      recent: { from: 2012, to: 2025 },
    })
    expect(trend.rows).toHaveLength(TREND_CLASSES.length)
    expect(trend.note).toBe('2012–2025 проти 1997–2010')
    expect(riverLegend('lowFlow', uk.river, undefined).rows.map((r) => r.label)).toEqual(
      Object.values(uk.river.lowFlowClasses),
    )
  })
})
