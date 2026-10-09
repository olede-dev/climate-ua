import { layerConfig } from '../../config/layers'
import type { Locale, Messages } from '../../i18n'
import type { AnomalyClass, RiversFile, StationState } from '../../types'
import { formatNumber, plural } from '../format'

/** What the station markers and river tints show; `state` is the water state on the map date. */
export type RiverView = 'state' | 'trend' | 'lowFlow'

export const RIVER_VIEWS: readonly RiverView[] = ['state', 'trend', 'lowFlow']

export interface RiverClass<T extends string> {
  id: T
  /** `null` draws an outline only. */
  color: string | null
  /** Inclusive upper bound of the class; the last class has none. */
  max: number | null
  /** Whether rivers near the station take the colour; the neutral class keeps the plain blue. */
  tint: boolean
}

/** ColorBrewer BrBG, colour-blind safe; driest first, then no data. */
export const ANOMALY_CLASSES: readonly RiverClass<AnomalyClass>[] = [
  { id: 'very-low', color: '#a6611a', max: null, tint: true },
  { id: 'low', color: '#dfc27d', max: null, tint: true },
  { id: 'normal', color: '#c7c7c7', max: null, tint: false },
  { id: 'high', color: '#80cdc1', max: null, tint: true },
  { id: 'very-high', color: '#018571', max: null, tint: true },
  { id: 'no-data', color: null, max: null, tint: false },
]

export type TrendClass = 'strong-decrease' | 'decrease' | 'stable' | 'increase' | 'strong-increase'
export type LowFlowClass = 'none' | 'few' | 'some' | 'many' | 'extreme'

/** Mean discharge change, %; the same BrBG ramp as the water state, driest first. */
export const TREND_CLASSES: readonly RiverClass<TrendClass>[] = [
  { id: 'strong-decrease', color: '#a6611a', max: -30, tint: true },
  { id: 'decrease', color: '#dfc27d', max: -10, tint: true },
  { id: 'stable', color: '#c7c7c7', max: 10, tint: false },
  { id: 'increase', color: '#80cdc1', max: 30, tint: true },
  { id: 'strong-increase', color: '#018571', max: null, tint: true },
]

const lowFlowColor = (i: number) => layerConfig('rivers').scale.stops[i]![1]

/** Low-flow days a year; the rivers layer's own violet steps, which share these bounds. */
export const LOW_FLOW_CLASSES: readonly RiverClass<LowFlowClass>[] = [
  { id: 'none', color: lowFlowColor(0), max: 0, tint: false },
  { id: 'few', color: lowFlowColor(1), max: 14, tint: false },
  { id: 'some', color: lowFlowColor(2), max: 44, tint: true },
  { id: 'many', color: lowFlowColor(3), max: 89, tint: true },
  { id: 'extreme', color: lowFlowColor(4), max: null, tint: true },
]

/** The class whose range holds `value`; `null` stays unclassified. */
export function classify<T extends string>(
  classes: readonly RiverClass<T>[],
  value: number | null,
): RiverClass<T> | null {
  if (value === null) return null
  return classes.find((c) => c.max === null || value <= c.max) ?? null
}

/** How one station looks on the map in the current view. */
export interface MapMark {
  /** Marker fill; `null` draws an outline only (no data). */
  fill: string | null
  /** Colour of the river reach around the station; `null` keeps the plain river colour. */
  tint: string | null
  /** Strong anomalies pulse; only the water-state view uses it. */
  pulse: boolean
  /** The view's value for the tooltip, already formatted. */
  detail: string | null
}

/** Fill while the view's value is not known yet (norms or discharge missing). */
export const UNCLASSIFIED_FILL = '#94a3b8'
/** Outline of markers without data, also the no-data legend swatch. */
export const NO_DATA_STROKE = '#64748b'
/** Deviation from the median norm, in percent, from which a station pulses. */
const PULSE_PCT = 50

const UNCLASSIFIED: MapMark = { fill: UNCLASSIFIED_FILL, tint: null, pulse: false, detail: null }

export function formatPct(value: number, locale: Locale): string {
  return `${formatNumber(value, locale, { decimals: 0, signed: true })}%`
}

function stateMark({ anomalyClass, anomalyPct }: StationState): MapMark {
  const info = ANOMALY_CLASSES.find((c) => c.id === anomalyClass)
  if (!info) return UNCLASSIFIED
  return {
    fill: info.color,
    tint: info.tint ? info.color : null,
    pulse: info.color !== null && anomalyPct !== null && Math.abs(anomalyPct) >= PULSE_PCT,
    detail: null,
  }
}

function classMark<T extends string>(
  classes: readonly RiverClass<T>[],
  value: number | null,
  detail: (value: number) => string,
): MapMark {
  const info = classify(classes, value)
  if (!info || value === null) return UNCLASSIFIED
  return {
    fill: info.color,
    tint: info.tint ? info.color : null,
    pulse: false,
    detail: detail(value),
  }
}

/** Low-flow days of `year`, or `null` outside the record. */
export function lowFlowDaysIn(
  station: StationState['station'],
  years: RiversFile['years'],
  year: number | null,
): number | null {
  if (year === null) return null
  return station.lowFlowDays[year - years.from] ?? null
}

export interface MarkContext {
  locale: Locale
  copy: Messages['river']
  years: RiversFile['years']
  /** The year the low-flow view shows. */
  year: number | null
}

export function riverMarks(
  view: RiverView,
  states: readonly StationState[],
  { locale, copy, years, year }: MarkContext,
): Map<string, MapMark> {
  const days = (n: number) => `${n} ${plural(n, locale, copy.days)}`
  return new Map(
    states.map((state): [string, MapMark] => {
      const { station } = state
      if (view === 'state') return [station.id, stateMark(state)]
      if (view === 'trend') {
        return [
          station.id,
          classMark(TREND_CLASSES, station.meanChangePct, (v) =>
            copy.trendDetail.replace('{pct}', formatPct(v, locale)),
          ),
        ]
      }
      return [station.id, classMark(LOW_FLOW_CLASSES, lowFlowDaysIn(station, years, year), days)]
    }),
  )
}

export interface LegendRow {
  color: string | null
  label: string
}

export interface LegendContent {
  title: string
  rows: LegendRow[]
  /** Small print under the rows, e.g. the periods compared. */
  note?: string
}

const yearRange = ({ from, to }: { from: number; to: number }) => `${from}–${to}`

export function riverLegend(
  view: RiverView,
  copy: Messages['river'],
  rivers: Pick<RiversFile, 'baseline' | 'recent'> | undefined,
): LegendContent {
  if (view === 'trend') {
    return {
      title: copy.trendLegend,
      rows: TREND_CLASSES.map((c) => ({ color: c.color, label: copy.trendClasses[c.id] })),
      note:
        rivers &&
        copy.trendNote
          .replace('{recent}', yearRange(rivers.recent))
          .replace('{baseline}', yearRange(rivers.baseline)),
    }
  }
  if (view === 'lowFlow') {
    return {
      title: copy.lowFlowLegend,
      rows: LOW_FLOW_CLASSES.map((c) => ({ color: c.color, label: copy.lowFlowClasses[c.id] })),
      note: copy.lowFlowNote,
    }
  }
  return {
    title: copy.stateLegend,
    rows: ANOMALY_CLASSES.map((c) => ({ color: c.color, label: copy.anomalyClasses[c.id] })),
  }
}
