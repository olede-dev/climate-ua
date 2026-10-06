import { describe, expect, it } from 'vitest'

import { en } from '../src/i18n/en'
import { uk } from '../src/i18n/uk'

/** Every leaf key path of a messages object, e.g. `['header', 'title']`; keys may hold dots. */
function keyPaths(value: unknown, prefix: string[] = []): string[][] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, [...prefix, key]))
}

describe('messages', () => {
  it('fills every Ukrainian key in English with non-empty text', () => {
    const names = (paths: string[][]) => paths.map((path) => path.join(' › ')).sort()
    expect(names(keyPaths(en))).toEqual(names(keyPaths(uk)))
    for (const path of keyPaths(en)) {
      const text = path.reduce<unknown>((node, key) => (node as never)[key], en)
      expect(text, path.join(' › ')).not.toBe('')
    }
  })
})
