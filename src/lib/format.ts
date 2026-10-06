import type { Locale } from '../i18n'

/** Regional variants for `Intl`: uk-UA writes a decimal comma. */
const INTL_LOCALES: Record<Locale, string> = { uk: 'uk-UA', en: 'en-GB' }
const MINUS = '−'
const NBSP = ' '

const cache = new Map<string, Intl.NumberFormat>()

function numberFormat(locale: Locale, decimals: number, signed: boolean): Intl.NumberFormat {
  const key = `${locale}|${decimals}|${signed}`
  let format = cache.get(key)
  if (!format) {
    format = new Intl.NumberFormat(INTL_LOCALES[locale], {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      signDisplay: signed ? 'exceptZero' : 'auto',
    })
    cache.set(key, format)
  }
  return format
}

/**
 * A number with a typographic minus, e.g. `+1,2` or `−0,4`. A value that rounds to zero is
 * written without a sign, so `−0,0` never shows.
 */
export function formatNumber(
  value: number,
  locale: Locale,
  { decimals = 1, signed = false }: { decimals?: number; signed?: boolean } = {},
): string {
  const rounded = Number(value.toFixed(decimals))
  return numberFormat(locale, decimals, signed)
    .format(rounded === 0 ? 0 : rounded)
    .replace('-', MINUS)
}

/** A period for display: `2041-2060` → `2041–2060`. */
export function formatPeriod(period: string): string {
  return period.replace('-', '–')
}

/** Word forms by plural category; a form left out falls back to `other`. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

const pluralRules = new Map<string, Intl.PluralRules>()

/**
 * The form of a word for a count, by the language's plural rules: Ukrainian has `one` (21),
 * `few` (23) and `many` (25), and `other` for a fraction (2,5). With `decimals`, the count is
 * taken as written with that many places: «2,0 дня», not «2,0 дні».
 */
export function plural(count: number, locale: Locale, forms: PluralForms, decimals = 0): string {
  const key = `${locale}|${decimals}`
  let rules = pluralRules.get(key)
  if (!rules) {
    rules = new Intl.PluralRules(INTL_LOCALES[locale], {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    pluralRules.set(key, rules)
  }
  return forms[rules.select(Math.abs(Number(count.toFixed(decimals))))] ?? forms.other
}

/** A fixed symbol (`°C`, `%`) or a word that agrees with the number (`дні`, `днів`). */
export type Unit = string | PluralForms

/** A number with its unit, kept on one line: `+1,2 °C`, `5 днів`. */
export function formatWithUnit(
  value: number,
  unit: Unit,
  locale: Locale,
  options: { decimals?: number; signed?: boolean } = {},
): string {
  const word = typeof unit === 'string' ? unit : plural(value, locale, unit, options.decimals ?? 1)
  return `${formatNumber(value, locale, options)}${NBSP}${word}`
}

/**
 * Numbers as a layer writes them: with its unit unless `unit: false`, signed on request, and
 * with the layer's decimals unless `decimals` overrides them (whole-number axis ticks).
 */
export type ValueFormat = (
  value: number,
  options?: { unit?: boolean; signed?: boolean; decimals?: number },
) => string

export function valueFormat(locale: Locale, unit: Unit, decimals: number): ValueFormat {
  return (value, { unit: withUnit = true, signed = false, decimals: places = decimals } = {}) =>
    withUnit
      ? formatWithUnit(value, unit, locale, { decimals: places, signed })
      : formatNumber(value, locale, { decimals: places, signed })
}
