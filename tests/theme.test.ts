import { effectScope, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** The browser surface `useTheme` touches: `<html>` classes, `localStorage` and the media query. */
function stubBrowser() {
  const classes = new Set<string>()
  const storage = new Map<string, string>()
  vi.stubGlobal('document', {
    documentElement: {
      classList: {
        toggle: (name: string, force: boolean) =>
          force ? classes.add(name) : classes.delete(name),
      },
    },
    querySelector: () => null,
  })
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  })
  return { classes, storage }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('useTheme', () => {
  it('keeps the <html> class in sync after the first caller is unmounted', async () => {
    const { classes, storage } = stubBrowser()
    const { useTheme } = await import('../src/composables/useTheme')

    // The first caller is a component; its setup scope stops when it unmounts.
    const componentScope = effectScope()
    componentScope.run(() => useTheme())
    componentScope.stop()

    useTheme().setPreference('dark')
    await nextTick()
    expect(classes.has('dark')).toBe(true)
    expect(storage.get('theme')).toBe('dark')

    useTheme().setPreference('auto')
    await nextTick()
    expect(classes.has('dark')).toBe(false)
    expect(storage.has('theme')).toBe(false)
  })
})
