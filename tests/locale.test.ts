import { effectScope, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

function stubBrowser() {
  const documentStub = { documentElement: { lang: '' }, title: '', querySelector: () => null }
  const storage = new Map<string, string>()
  vi.stubGlobal('document', documentStub)
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })
  return { documentStub, storage }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('useLocale', () => {
  it('keeps <html lang> and storage in sync after the first caller is unmounted', async () => {
    const { documentStub, storage } = stubBrowser()
    const { useLocale } = await import('../src/composables/useLocale')

    // The first caller is a component; its setup scope stops when it unmounts.
    const componentScope = effectScope()
    componentScope.run(() => useLocale())
    componentScope.stop()

    useLocale().setLocale('en')
    await nextTick()
    expect(documentStub.documentElement.lang).toBe('en')
    expect(storage.get('lang')).toBe('en')

    useLocale().setLocale('uk')
    await nextTick()
    expect(documentStub.documentElement.lang).toBe('uk')
    expect(storage.has('lang')).toBe(false)
  })
})
