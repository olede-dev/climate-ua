import type { Locale } from '../../i18n'
import type { LatLon } from '../../types'
import { assertDate } from './dates'

/** Regional variants for `Intl`: uk-UA groups with a space and a decimal comma, en-GB writes `5 October`. */
const INTL_LOCALES: Record<Locale, string> = { uk: 'uk-UA', en: 'en-GB' }
const MINUS = '−'

interface Formatters {
  largeNumber: Intl.NumberFormat
  smallNumber: Intl.NumberFormat
  coordinate: Intl.NumberFormat
  plainDate: Intl.DateTimeFormat
}

const cache = new Map<Locale, Formatters>()

/** `Intl` formatters are costly to build, so each locale gets one set. */
function formatters(locale: Locale): Formatters {
  let set = cache.get(locale)
  if (!set) {
    const tag = INTL_LOCALES[locale]
    set = {
      largeNumber: new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }),
      smallNumber: new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }),
      coordinate: new Intl.NumberFormat(tag, {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }),
      plainDate: new Intl.DateTimeFormat(tag, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    }
    cache.set(locale, set)
  }
  return set
}

/** Discharge in m³/s without the unit: whole numbers from 10 up, one decimal below. */
export function formatDischarge(value: number | null, locale: Locale = 'uk'): string {
  if (value === null) return '—'
  const { largeNumber, smallNumber } = formatters(locale)
  return (Math.abs(value) >= 10 ? largeNumber : smallNumber).format(value)
}

/** Precipitation in mm without the unit, one decimal at most. */
export function formatPrecipitation(value: number | null, locale: Locale = 'uk'): string {
  if (value === null) return '—'
  return formatters(locale).smallNumber.format(value)
}

/** Signed percent with a typographic minus: `+12%`, `−35%`, `0%`. */
export function formatPct(value: number | null, locale: Locale = 'uk'): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : value < 0 ? MINUS : ''
  return `${sign}${formatters(locale).largeNumber.format(Math.abs(value))}%`
}

/** Share of the norm, unsigned and whole: `115%`. */
export function formatPctOfNorm(value: number | null, locale: Locale = 'uk'): string {
  if (value === null) return '—'
  return `${formatters(locale).largeNumber.format(value)}%`
}

/**
 * Geographic position with hemispheres: `50,475° пн. ш., 30,525° сх. д.` in Ukrainian,
 * `50.475° N, 30.525° E` in English.
 */
export function formatCoordinates({ lat, lon }: LatLon, locale: Locale = 'uk'): string {
  const { coordinate } = formatters(locale)
  const latValue = `${coordinate.format(Math.abs(lat))}°`
  const lonValue = `${coordinate.format(Math.abs(lon))}°`
  if (locale === 'en')
    return `${latValue} ${lat < 0 ? 'S' : 'N'}, ${lonValue} ${lon < 0 ? 'W' : 'E'}`
  return `${latValue} ${lat < 0 ? 'пд.' : 'пн.'} ш., ${lonValue} ${lon < 0 ? 'зх.' : 'сх.'} д.`
}

/** Calendar date for reading: `2026-10-05` → `5 жовтня 2026 р.` / `5 October 2026`. */
export function formatPlainDate(date: string, locale: Locale = 'uk'): string {
  return formatters(locale).plainDate.format(new Date(`${assertDate(date)}T00:00:00Z`))
}

/** Inclusive year range with an en dash: `1997–2010`. */
export function formatYearRange({ from, to }: { from: number; to: number }): string {
  return `${from}–${to}`
}
