// Calendar dates are plain `YYYY-MM-DD` strings, as Open-Meteo returns them.
// Arithmetic runs on UTC midnight so no local zone or DST shift can leak in.

export const KYIV_TIME_ZONE = 'Europe/Kyiv'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000
// Day of year at the start of each month in a non-leap year.
const MONTH_START_DOY = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

export const DAYS_IN_NORM_YEAR = 365

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(date)
  if (!match) throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`)
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new RangeError(`Invalid calendar date "${date}"`)
  }
  return { year, month, day }
}

function toUtcMs(date: string): number {
  const { year, month, day } = parseDate(date)
  return Date.UTC(year, month - 1, day)
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function assertDate(date: string): string {
  parseDate(date)
  return date
}

/**
 * Day of year on a fixed 365-day calendar (1 = 1 January, 365 = 31 December).
 * 29 February maps to 59, the same as 28 February, so 1 March is always 60.
 */
export function dayOfYear(date: string): number {
  const { month, day } = parseDate(date)
  if (month === 2 && day === 29) return 59
  return MONTH_START_DOY[month - 1] + day
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY)
}

/** Current instant as epoch milliseconds; the one place app code reads the wall clock. */
export function nowMs(): number {
  return Date.now()
}

// Built once: a time-zone formatter costs tens of milliseconds to create on a phone.
let kyivDate: Intl.DateTimeFormat | undefined

/** Today's calendar date in Kyiv. */
export function todayKyiv(now: Date = new Date()): string {
  kyivDate ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: KYIV_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = kyivDate.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
