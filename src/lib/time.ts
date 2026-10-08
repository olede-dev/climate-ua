import type { FuturePeriod } from '../types'

/** A point on a layer's timeline: an observed year or a future period (SPEC §5.1). */
export type TimeStep = number | FuturePeriod

/** One layer's timeline: observed years `from`–`to`, then the future periods in order. */
export interface TimeAxis {
  from: number
  to: number
  periods: readonly FuturePeriod[]
}

/** Share of the slider track the observed years take; the future steps follow a gap. */
const HISTORY_SHARE = 0.7
const GAP_SHARE = 0.04

export function isFuture(step: TimeStep): step is FuturePeriod {
  return typeof step === 'string'
}

/** Middle year of a period: `2041-2060` → 2050.5, `2050` → 2050. */
export function periodYear(period: FuturePeriod): number {
  const [start, end = start] = period.split('-').map(Number) as [number, number?]
  return (start + end) / 2
}

/**
 * The years a period covers, inclusive: `2041-2060` → [2041, 2060]. A single-year period names
 * the centre of a span (Aqueduct's `2030`); it is drawn as the decade around it.
 */
export function periodRange(period: FuturePeriod): [start: number, end: number] {
  const [start, end] = period.split('-').map(Number) as [number, number?]
  return end === undefined ? [start - 5, start + 5] : [start, end]
}

/** The part of an axis the timeline shows at once: its observed years, or its future periods
 * alone when `step` is one of them; the two are switched from the side panel. */
export function shownAxis(axis: TimeAxis, step: TimeStep): TimeAxis {
  return isFuture(step)
    ? { from: axis.from, to: axis.from - 1, periods: axis.periods }
    : { from: axis.from, to: axis.to, periods: [] }
}

function hasYears(axis: TimeAxis): boolean {
  return axis.to >= axis.from
}

export function axisSteps(axis: TimeAxis): TimeStep[] {
  const years = Array.from(
    { length: Math.max(0, axis.to - axis.from + 1) },
    (_, i) => axis.from + i,
  )
  return [...years, ...axis.periods]
}

/** Position of a step in `axisSteps`, or -1 when the axis has no such step. */
export function stepIndex(axis: TimeAxis, step: TimeStep): number {
  if (isFuture(step)) {
    const at = axis.periods.indexOf(step)
    return at === -1 ? -1 : axis.to - axis.from + 1 + at
  }
  return Number.isInteger(step) && step >= axis.from && step <= axis.to ? step - axis.from : -1
}

/** The step after `step`, or null at the end of the axis. */
export function nextStep(axis: TimeAxis, step: TimeStep): TimeStep | null {
  return axisSteps(axis)[stepIndex(axis, step) + 1] ?? null
}

/** The step before `step`, or null at the start of the axis. */
export function prevStep(axis: TimeAxis, step: TimeStep): TimeStep | null {
  const at = stepIndex(axis, step)
  return at > 0 ? (axisSteps(axis)[at - 1] ?? null) : null
}

/**
 * The step of `axis` closest to a step of another layer's axis. A year stays an observed year
 * (clamped to the range), so switching layers never turns a measurement into a projection; a
 * period goes to the period with the nearest middle year.
 */
export function snapStep(axis: TimeAxis, step: TimeStep): TimeStep {
  if (stepIndex(axis, step) !== -1) return step
  if (!isFuture(step) || axis.periods.length === 0) {
    const year = isFuture(step) ? periodYear(step) : step
    return Math.min(axis.to, Math.max(axis.from, Math.round(year)))
  }
  const year = periodYear(step)
  return axis.periods.reduce((best, period) =>
    Math.abs(periodYear(period) - year) < Math.abs(periodYear(best) - year) ? period : best,
  )
}

/** Reads a step from its URL form (`1987`, `2041-2060`); null when it is neither. */
export function parseStep(raw: string, periods: readonly FuturePeriod[]): TimeStep | null {
  const period = periods.find((p) => p === raw)
  if (period) return period
  return /^\d{4}$/.test(raw) ? Number(raw) : null
}

function historyShare(axis: TimeAxis): number {
  if (!hasYears(axis)) return 0
  return axis.periods.length === 0 ? 1 : HISTORY_SHARE
}

function gapShare(axis: TimeAxis): number {
  return hasYears(axis) && axis.periods.length > 0 ? GAP_SHARE : 0
}

/** Where a step sits on the slider track, 0 (left) to 1 (right). */
export function stepPosition(axis: TimeAxis, step: TimeStep): number {
  const share = historyShare(axis)
  const gap = gapShare(axis)
  if (isFuture(step)) {
    const slot = (1 - share - gap) / axis.periods.length
    return share + gap + slot * (axis.periods.indexOf(step) + 0.5)
  }
  const span = axis.to - axis.from
  return span === 0 ? 0 : ((step - axis.from) / span) * share
}

/** The future periods' slots on the track, as `[start, end]` fractions. */
export function periodSlots(
  axis: TimeAxis,
): { period: FuturePeriod; start: number; end: number }[] {
  const share = historyShare(axis)
  const gap = gapShare(axis)
  const slot = (1 - share - gap) / axis.periods.length
  return axis.periods.map((period, i) => ({
    period,
    start: share + gap + slot * i,
    end: share + gap + slot * (i + 1),
  }))
}

/** The step under a point of the slider track (0–1), for pointer drags. */
export function stepAtPosition(axis: TimeAxis, position: number): TimeStep {
  const share = historyShare(axis)
  const gap = gapShare(axis)
  const x = Math.min(1, Math.max(0, position))
  if (axis.periods.length > 0 && (share === 0 || x > share + gap / 2)) {
    const slot = (1 - share - gap) / axis.periods.length
    const at = Math.floor((x - share - gap) / slot)
    return axis.periods[Math.min(axis.periods.length - 1, Math.max(0, at))]!
  }
  return Math.min(
    axis.to,
    axis.from + Math.round((Math.min(x, share) / share) * (axis.to - axis.from)),
  )
}
