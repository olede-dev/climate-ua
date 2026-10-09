import { computed, effectScope, readonly, ref, watchEffect, type ComputedRef, type Ref } from 'vue'

export type Theme = 'light' | 'dark'
export type ThemePreference = 'auto' | Theme

/** Same key and class as the inline script in `index.html`, which applies the theme before paint. */
const STORAGE_KEY = 'theme'
const DARK_CLASS = 'dark'
const THEME_COLORS: Record<Theme, string> = { light: '#f5f5f7', dark: '#121214' }

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readPreference(storage: Storage | null): ThemePreference {
  const value = storage?.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : 'auto'
}

interface ThemeState {
  preference: Ref<ThemePreference>
  theme: ComputedRef<Theme>
}

let state: ThemeState | undefined

function createThemeState(): ThemeState {
  const storage = browserStorage()
  const preference = ref(readPreference(storage))
  const systemQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(systemQuery.matches)
  systemQuery.addEventListener('change', (event) => (systemDark.value = event.matches))

  const theme = computed((): Theme => {
    if (preference.value !== 'auto') return preference.value
    return systemDark.value ? 'dark' : 'light'
  })
  watchEffect(() => {
    document.documentElement.classList.toggle(DARK_CLASS, theme.value === 'dark')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[theme.value])
  })
  watchEffect(() => {
    if (preference.value === 'auto') storage?.removeItem(STORAGE_KEY)
    else storage?.setItem(STORAGE_KEY, preference.value)
  })
  return { preference, theme }
}

export function useTheme() {
  // A detached scope: created inside a component's setup, the watchers would otherwise stop
  // when that component unmounts, leaving the `<html>` class stale while the state changes.
  state ??= effectScope(true).run(createThemeState)!
  const { preference, theme } = state
  const isDark = computed(() => theme.value === 'dark')

  function setPreference(value: ThemePreference) {
    preference.value = value
  }

  return { preference: readonly(preference), theme: readonly(theme), isDark, setPreference }
}
