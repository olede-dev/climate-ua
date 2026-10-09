import { layerConfig } from '../../config/layers'
import type { Locale, Messages } from '../../i18n'
import type { AnomalyClass, RiversFile, StationState } from '../../types'
import { formatNumber, plural } from '../format'
import { cssGradient } from '../scale'

/**
 * What the station markers and river tints show; `state` is the water state on the map date,
 * `forecast` the same marks over the ensemble forecast's months.
 */
export type RiverView = 'state' | 'trend' | 'lowFlow' | 'forecast'

export const RIVER_VIEWS: readonly RiverView[] = ['state', 'trend', 'lowFlow', 'forecast']

/** Views with a day timeline, whose marks show the water state on the map date. */
export const isDailyView = (view: RiverView) => view === 'state' || view === 'forecast'

export interface RiverClass<T extends string> {
  id: T
  /** `null` draws an outline only. */
  color: string | null
  /** Inclusive upper bound of the class; the last class has none. */
  max: number | null
  /** Whether rivers near the station take the colour; the neutral class keeps the plain blue. */
  tint: boolean
}

/**
 * Diverging brown–teal around a neutral grey: brown for dry (the hue of `RIVERS_SCALE`), teal for
 * wet, kept apart from the plain river blue so a tinted reach still reads. Each arm is one hue
 * with monotone lightness (L 0.74 → 0.46 in OKLCH), checked with the `dataviz` validator
 * (`--ordinal`, light and dark). Driest first.
 */
const DIVERGING = {
  dryStrong: '#814716',
  dry: '#b6762a',
  neutral: '#aeaaa2',
  wet: '#1c989e',
  wetStrong: '#0d646c',
} as const

/** Water state on the map date against the day-of-year norm, driest first, then no data. */
export const ANOMALY_CLASSES: readonly RiverClass<AnomalyClass>[] = [
  { id: 'very-low', color: DIVERGING.dryStrong, max: null, tint: true },
  { id: 'low', color: DIVERGING.dry, max: null, tint: true },
  { id: 'normal', color: DIVERGING.neutral, max: null, tint: false },
  { id: 'high', color: DIVERGING.wet, max: null, tint: true },
  { id: 'very-high', color: DIVERGING.wetStrong, max: null, tint: true },
  { id: 'no-data', color: null, max: null, tint: false },
]

export type TrendClass = 'strong-decrease' | 'decrease' | 'stable' | 'increase' | 'strong-increase'
export type LowFlowClass = 'none' | 'few' | 'some' | 'many' | 'extreme'

/** Mean discharge change, %; the same diverging colours as the water state, driest first. */
export const TREND_CLASSES: readonly RiverClass<TrendClass>[] = [
  { id: 'strong-decrease', color: DIVERGING.dryStrong, max: -30, tint: true },
  { id: 'decrease', color: DIVERGING.dry, max: -10, tint: true },
  { id: 'stable', color: DIVERGING.neutral, max: 10, tint: false },
  { id: 'increase', color: DIVERGING.wet, max: 30, tint: true },
  { id: 'strong-increase', color: DIVERGING.wetStrong, max: null, tint: true },
]

const lowFlowColor = (i: number) => layerConfig('rivers').scale.stops[i]![1]

/** Low-flow days a year; the rivers layer's own brown steps, which share these bounds. */
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
  /** Where the class sits on the legend scale, 0–1, for the tooltip's marker; `null` off it. */
  position: number | null
}

/** Outline of markers without data, also the no-data legend swatch. */
export const NO_DATA_STROKE = '#64748b'
/** Deviation from the median norm, in percent, from which a station pulses. */
const PULSE_PCT = 50

/** While the view's value is not known (norms or discharge missing) a marker is an outline. */
const UNCLASSIFIED: MapMark = { fill: null, tint: null, pulse: false, detail: null, position: null }

/** The coloured classes of a view, in legend order; the no-data class stays off the scale. */
function scaleClasses<T extends string>(classes: readonly RiverClass<T>[]): RiverClass<T>[] {
  return classes.filter((c) => c.color !== null)
}

function classPosition<T extends string>(classes: readonly RiverClass<T>[], id: T): number | null {
  const scale = scaleClasses(classes)
  const i = scale.findIndex((c) => c.id === id)
  return i === -1 ? null : (i + 0.5) / scale.length
}

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
    position: classPosition(ANOMALY_CLASSES, info.id),
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
    position: classPosition(classes, info.id),
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
      if (isDailyView(view)) return [station.id, stateMark(state)]
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

/** A view's legend as a stepped scale, in the shape `MapLegend` takes. */
export interface LegendContent {
  title: string
  gradient: string
  min: string
  max: string
  /** One name per step, left to right, shown on hover over the bar. */
  steps: string[]
  /** Small print under the bar: what the scale measures, e.g. the periods compared. */
  note: string
  /** Label of the outline swatch for stations without data; `null` hides it. */
  noData: string | null
}

const yearRange = ({ from, to }: { from: number; to: number }) => `${from}–${to}`

function steppedGradient<T extends string>(classes: readonly RiverClass<T>[]): string {
  const stops = scaleClasses(classes).map((c, i) => [i, c.color!] as const)
  return cssGradient({ stops, noData: NO_DATA_STROKE, stepped: true })
}

export function riverLegend(
  view: RiverView,
  copy: Messages['river'],
  rivers: Pick<RiversFile, 'baseline' | 'recent'> | undefined,
  locale: Locale,
): LegendContent {
  const noData = copy.anomalyClasses['no-data']
  if (view === 'trend') {
    const periods =
      rivers &&
      copy.trendNote
        .replace('{recent}', yearRange(rivers.recent))
        .replace('{baseline}', yearRange(rivers.baseline))
    return {
      title: copy.trendLegend,
      gradient: steppedGradient(TREND_CLASSES),
      min: `≤ ${formatPct(TREND_CLASSES[0]!.max!, locale)}`,
      max: `> ${formatPct(TREND_CLASSES.at(-2)!.max!, locale)}`,
      steps: TREND_CLASSES.map((c) => copy.trendClasses[c.id]),
      note: periods ? `${copy.trendLegend}, ${periods}` : copy.trendLegend,
      noData,
    }
  }
  if (view === 'lowFlow') {
    const top = LOW_FLOW_CLASSES.at(-2)!.max! + 1
    return {
      title: copy.lowFlowLegend,
      gradient: steppedGradient(LOW_FLOW_CLASSES),
      min: formatNumber(0, locale, { decimals: 0 }),
      max: `≥ ${top} ${plural(top, locale, copy.days)}`,
      steps: LOW_FLOW_CLASSES.map((c) => copy.lowFlowClasses[c.id]),
      note: copy.lowFlowNote,
      noData,
    }
  }
  return {
    title: copy.stateLegend,
    gradient: steppedGradient(ANOMALY_CLASSES),
    min: copy.stateLow,
    max: copy.stateHigh,
    steps: scaleClasses(ANOMALY_CLASSES).map((c) => copy.anomalyClasses[c.id]),
    note: copy.stateLegend,
    noData,
  }
}
