import type { FuturePeriod } from '../types'

export type TimeStep = number | FuturePeriod

export interface TimeAxis {
  from: number
  to: number
  periods: readonly FuturePeriod[]
}

const HISTORY_SHARE = 0.7
const GAP_SHARE = 0.04

export function isFuture(step: TimeStep): step is FuturePeriod {
  return typeof step === 'string'
}

export function periodRange(period: FuturePeriod): [start: number, end: number] {
  return period.split('-').map(Number) as [number, number]
}

export function periodYear(period: FuturePeriod): number {
  const [start, end] = periodRange(period)
  return (start + end) / 2
}

function nearestPeriod(periods: readonly FuturePeriod[], year: number): FuturePeriod {
  return periods.reduce((best, period) =>
    Math.abs(periodYear(period) - year) < Math.abs(periodYear(best) - year) ? period : best,
  )
}

export function periodFor(
  periods: readonly FuturePeriod[],
  year: number,
): FuturePeriod | undefined {
  if (periods.length === 0) return undefined
  const holding = periods.find((p) => {
    const [start, end] = periodRange(p)
    return year >= start && year <= end
  })
  return holding ?? nearestPeriod(periods, year)
}

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

export function stepIndex(axis: TimeAxis, step: TimeStep): number {
  if (isFuture(step)) {
    const at = axis.periods.indexOf(step)
    return at === -1 ? -1 : axis.to - axis.from + 1 + at
  }
  return Number.isInteger(step) && step >= axis.from && step <= axis.to ? step - axis.from : -1
}

export function nextStep(axis: TimeAxis, step: TimeStep): TimeStep | null {
  return axisSteps(axis)[stepIndex(axis, step) + 1] ?? null
}

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
  return nearestPeriod(axis.periods, periodYear(step))
}

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
