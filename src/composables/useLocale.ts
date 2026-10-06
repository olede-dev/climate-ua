import { computed, effectScope, readonly, ref, watchEffect, type ComputedRef, type Ref } from 'vue'

import { DEFAULT_LOCALE, isLocale, MESSAGES, type Locale, type Messages } from '../i18n'

/** Same key as the inline script in `index.html`, which sets `<html lang>` before paint. */
const STORAGE_KEY = 'lang'

/** `localStorage`, or `null` where the browser blocks it (private mode, disabled site data). */
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

/** App-wide singleton: the document language and title live as long as the page. */
function createLocaleState(): LocaleState {
  const storage = browserStorage()
  const stored = storage?.getItem(STORAGE_KEY)
  const locale = ref<Locale>(isLocale(stored) ? stored : DEFAULT_LOCALE)
  const t = computed(() => MESSAGES[locale.value])

  watchEffect(() => {
    document.documentElement.lang = t.value.htmlLang
    document.title = t.value.documentTitle
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t.value.documentDescription)
  })
  watchEffect(() => {
    // Only a choice away from the default is stored.
    if (locale.value === DEFAULT_LOCALE) storage?.removeItem(STORAGE_KEY)
    else storage?.setItem(STORAGE_KEY, locale.value)
  })
  return { locale, t }
}

/** Interface language: Ukrainian until the user picks English. `t` holds the current copy. */
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
