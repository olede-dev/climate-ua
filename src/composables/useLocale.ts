import { computed, effectScope, readonly, ref, watchEffect, type ComputedRef, type Ref } from 'vue'

import { DEFAULT_LOCALE, isLocale, MESSAGES, type Locale, type Messages } from '../i18n'

/** Same key as the inline script in `index.html`, which sets `<html lang>` before paint. */
const STORAGE_KEY = 'lang'
const URL_PARAM = 'lang'
const SITE_URL = 'https://olede-dev.github.io/climate-ua/'

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

interface LocaleState {
  locale: Ref<Locale>
  t: ComputedRef<Messages>
}

let state: LocaleState | undefined

function createLocaleState(): LocaleState {
  const storage = browserStorage()
  // `?lang=` sits before the hash, so each language has its own indexable URL (hreflang).
  const fromUrl = new URLSearchParams(window.location.search).get(URL_PARAM)
  const stored = isLocale(fromUrl) ? fromUrl : storage?.getItem(STORAGE_KEY)
  const locale = ref<Locale>(isLocale(stored) ? stored : DEFAULT_LOCALE)
  const t = computed(() => MESSAGES[locale.value])

  watchEffect(() => {
    document.documentElement.lang = t.value.htmlLang
    document.title = t.value.documentTitle
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t.value.documentDescription)
    const canonical =
      locale.value === DEFAULT_LOCALE ? SITE_URL : `${SITE_URL}?lang=${locale.value}`
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical)
  })
  watchEffect(() => {
    if (locale.value === DEFAULT_LOCALE) storage?.removeItem(STORAGE_KEY)
    else storage?.setItem(STORAGE_KEY, locale.value)
  })
  return { locale, t }
}

export function useLocale() {
  // A detached scope: created inside a component's setup, the watchers would otherwise stop
  // when that component unmounts, leaving `<html lang>` and the title stale.
  state ??= effectScope(true).run(createLocaleState)!
  const { locale, t } = state

  function setLocale(value: Locale) {
    locale.value = value
  }

  return { locale: readonly(locale), t, setLocale }
}
