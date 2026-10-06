import { describe, expect, it } from 'vitest'

import { en } from '../src/i18n/en'
import { uk } from '../src/i18n/uk'

/** Every leaf key path of a messages object, e.g. `header.title`. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('messages', () => {
  it('fills every Ukrainian key in English with non-empty text', () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(uk).sort())
    for (const path of keyPaths(en)) {
      const text = path.split('.').reduce<unknown>((node, key) => (node as never)[key], en)
      expect(text, path).not.toBe('')
    }
  })
})
