import type { LayerId } from '../types'
import { en } from './en'
import { uk, type Messages } from './uk'

export type { Messages }

/** What a layer's sentences, legend and chart need; the water layer's comes from `waterUseCopy`. */
export type LayerCopy = Messages['layers'][Exclude<LayerId, 'water'>]

export type Locale = 'uk' | 'en'

export const DEFAULT_LOCALE: Locale = 'uk'

export const MESSAGES: Record<Locale, Messages> = { uk, en }

/** Each language is named in itself, so a reader finds theirs whatever the current UI language. */
export const LOCALE_NAMES: Record<Locale, string> = { uk: 'Українська', en: 'English' }

export function isLocale(value: unknown): value is Locale {
  return value === 'uk' || value === 'en'
}
