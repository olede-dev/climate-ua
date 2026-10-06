import { en } from './en'
import { uk, type Messages } from './uk'

export type { Messages }

export type Locale = 'uk' | 'en'

export const DEFAULT_LOCALE: Locale = 'uk'

export const MESSAGES: Record<Locale, Messages> = { uk, en }

/** Each language is named in itself, so a reader finds theirs whatever the current UI language. */
export const LOCALE_NAMES: Record<Locale, string> = { uk: 'Українська', en: 'English' }

export function isLocale(value: unknown): value is Locale {
  return value === 'uk' || value === 'en'
}
