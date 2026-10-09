import { describe, expect, it } from 'vitest'

import { uk } from '../src/i18n/uk'
import {
  ANOMALY_CLASSES,
  classify,
  LOW_FLOW_CLASSES,
  riverLegend,
  riverMarks,
  TREND_CLASSES,
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
    const [veryLow, , normal] = ANOMALY_CLASSES
    expect(marks.get('a')).toMatchObject({
      fill: veryLow!.color,
      tint: veryLow!.color,
      pulse: true,
      position: 0.1,
    })
    // Near normal keeps the plain river colour.
    expect(marks.get('b')).toMatchObject({ fill: normal!.color, tint: null, pulse: false })
    // Not classified yet: an outline, off the legend scale.
    expect(marks.get('c')).toMatchObject({ fill: null, tint: null, position: null })
  })

  it('draws no-data stations as an outline', () => {
    const marks = riverMarks('state', [state('a', { anomalyClass: 'no-data' })], context)
    expect(marks.get('a')).toMatchObject({ fill: null, tint: null, pulse: false })
  })

  it('classifies the trend and the low-flow days of the chosen year', () => {
    const states = [state('a', {}, { meanChangePct: -35, lowFlowDays: [0, 50] })]
    expect(riverMarks('trend', states, context).get('a')).toMatchObject({
      fill: TREND_CLASSES[0]!.color,
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
    expect(riverMarks('lowFlow', states, { ...context, year: 1990 }).get('a')!.fill).toBeNull()
  })
})

describe('riverLegend', () => {
  it('names every coloured step of the view, left to right', () => {
    const state = riverLegend('state', uk.river, undefined, 'uk')
    expect(state.steps).toEqual([
      'Дуже низька водність',
      'Низька водність',
      'Близько до норми',
      'Підвищена водність',
      'Висока водність',
    ])
    expect(state.noData).toBe('Немає даних')
    expect(state.gradient).toContain(ANOMALY_CLASSES[0]!.color)
    expect(riverLegend('lowFlow', uk.river, undefined, 'uk').steps).toEqual(
      Object.values(uk.river.lowFlowClasses),
    )
  })

  it('labels the ends of the scale and names the periods compared', () => {
    const trend = riverLegend(
      'trend',
      uk.river,
      { baseline: { from: 1997, to: 2010 }, recent: { from: 2012, to: 2025 } },
      'uk',
    )
    expect(trend.steps).toHaveLength(TREND_CLASSES.length)
    expect([trend.min, trend.max]).toEqual(['≤ −30%', '> +30%'])
    expect(trend.note).toBe('Зміна середнього стоку, 2012–2025 проти 1997–2010')
    const lowFlow = riverLegend('lowFlow', uk.river, undefined, 'uk')
    expect([lowFlow.min, lowFlow.max]).toEqual(['0', '≥ 90 днів'])
  })
})
