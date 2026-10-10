import { describe, expect, it } from 'vitest'
import {
  compareSurfaceWaterClasses,
  decodeSurfaceWaterTile,
  normalizeSurfaceWaterState,
} from '../src/lib/surfaceWater'
import type { SurfaceWaterClass } from '../src/types'

describe('surface-water state normalization', () => {
  it('uses actual manifest years and removes stale selections', () => {
    expect(
      normalizeSurfaceWaterState(
        { year: 1992, before: 1984, after: 2050, waterbody: 'retired' },
        [2024, 2000, 2010],
        ['svitiaz'],
      ),
    ).toEqual({ mode: 'annual', year: 2024, before: 2000, after: 2024, waterbody: null })
  })

  it.each([
    [2024, 2000],
    [2010, 2010],
  ])('preserves comparison direction and equal endpoints (%i, %i)', (before, after) => {
    expect(
      normalizeSurfaceWaterState(
        { mode: 'comparison', year: 2010, before, after, waterbody: 'svitiaz' },
        [2000, 2010, 2024],
        ['svitiaz'],
      ),
    ).toEqual({ mode: 'comparison', year: 2010, before, after, waterbody: 'svitiaz' })
  })

  it('returns no renderable state for an empty timeline', () => {
    expect(normalizeSurfaceWaterState({}, [], [])).toBeNull()
  })

  it('rejects a malformed timeline instead of inventing a year', () => {
    expect(() => normalizeSurfaceWaterState({}, [NaN], [])).toThrow()
  })
})

describe('native packed4 decoding', () => {
  it('preserves all classes in low-nibble-first row order', () => {
    expect(decodeSurfaceWaterTile(new Uint8Array([0x10, 0x32, 0xff]), 5)).toEqual(
      new Uint8Array([0, 1, 2, 3, 15]),
    )
    expect(decodeSurfaceWaterTile(new Uint8Array([0x03, 0xf2]), 4)).toEqual(
      new Uint8Array([3, 0, 2, 15]),
    )
  })

  it.each([
    [new Uint8Array([0x10]), 3],
    [new Uint8Array([0x10, 0xff]), 2],
    [new Uint8Array([0x10]), 1],
    [new Uint8Array([0xf4]), 1],
    [new Uint8Array([0x53]), 2],
  ])('rejects corrupt payload or padding %#', (bytes, cells) => {
    expect(() => decodeSurfaceWaterTile(bytes, cells)).toThrow()
  })

  it.each([0, -1, 1.5, NaN, Infinity, 512 * 512 + 1])(
    'rejects unsafe allocation for %s cells',
    (cells) => {
      expect(() => decodeSurfaceWaterTile(new Uint8Array(), cells)).toThrow()
    },
  )

  it('accepts a complete native tile', () => {
    const decoded = decodeSurfaceWaterTile(new Uint8Array(512 * 256).fill(0x32), 512 * 512)
    expect(decoded.length).toBe(512 * 512)
    expect(decoded[0]).toBe(2)
    expect(decoded[decoded.length - 1]).toBe(3)
  })
})

describe('common-mask comparison classes', () => {
  // Independent truth table: rows are before, columns are after, ordered 0,1,2,3,15.
  const categories = [
    ['uncomparable', 'uncomparable', 'uncomparable', 'uncomparable', 'outside'],
    ['uncomparable', 'dry', 'gained', 'gained', 'outside'],
    ['uncomparable', 'lost', 'persistent', 'persistent', 'outside'],
    ['uncomparable', 'lost', 'persistent', 'persistent', 'outside'],
    ['outside', 'outside', 'outside', 'outside', 'outside'],
  ]
  const classes: SurfaceWaterClass[] = [0, 1, 2, 3, 15]
  const cases = classes.flatMap((before, row) =>
    classes.map((after, col) => ({ before, after, expected: categories[row]![col] })),
  )
  it.each(cases)('$before → $after is $expected', ({ before, after, expected }) => {
    expect(compareSurfaceWaterClasses(before, after).category).toBe(expected)
  })

  it.each([
    { before: 3, after: 2, transition: 'permanentToSeasonal' },
    { before: 2, after: 3, transition: 'seasonalToPermanent' },
    { before: 3, after: 3, transition: null },
    { before: 0, after: 2, transition: null },
    { before: 1, after: 3, transition: null },
  ] as const)(
    'separates category transitions $before → $after',
    ({ before, after, transition }) => {
      expect(compareSurfaceWaterClasses(before, after).transition).toBe(transition)
    },
  )
})
