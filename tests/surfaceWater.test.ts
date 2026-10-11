import { describe, expect, it } from 'vitest'
import { surfaceWaterNativeRow } from '../src/lib/surfaceWaterCanvas'
import { surfaceWaterAssetUrl } from '../src/lib/surfaceWaterAssets'
import {
  compareSurfaceWaterClasses,
  validateSurfaceWaterFrame,
  validateSurfaceWaterPair,
  surfaceWaterPixelColor,
  SURFACE_WATER_COLORS,
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

describe('immutable rendering boundaries', () => {
  const root = new URL('https://example.com/climate-ua/data/surface-water/versions/version/')
  const asset = { url: 'tiles/1984/0.bin.gz', bytes: 10, sha256: 'a'.repeat(64) }
  it('keeps static references within the selected release and deployment base', () => {
    expect(surfaceWaterAssetUrl(root, asset).href).toBe(`${root.href}${asset.url}`)
  })
  it.each([
    '../other.json',
    '/other.json',
    'https://other.test/a',
    'tiles/%2e%2e/a',
    'tiles/./a',
    'tiles//a',
  ])('rejects escaping or ambiguous asset path %s', (url) => {
    expect(() => surfaceWaterAssetUrl(root, { ...asset, url })).toThrow()
  })
  const grid = {
    width: 513,
    height: 1,
    transform: [0.01, 0, 30, 0, -0.01, 50] as [number, number, number, number, number, number],
    frames: [],
  }
  const frame = {
    ...grid,
    version: 'version',
    year: 1984,
    tiles: [
      { ...asset, x: 0, y: 0, width: 512, height: 1 },
      { ...asset, x: 512, y: 0, width: 1, height: 1 },
    ],
  }
  it('accepts aligned sparse edge tiles but refuses duplicate, shifted or mixed-version frames', () => {
    expect(() => validateSurfaceWaterFrame(frame, grid, 'version', 1984)).not.toThrow()
    expect(() =>
      validateSurfaceWaterFrame(
        { ...frame, tiles: frame.tiles.slice(0, 1) },
        grid,
        'version',
        1984,
      ),
    ).not.toThrow()
    expect(() =>
      validateSurfaceWaterPair(frame, { ...frame, tiles: frame.tiles.slice(0, 1) }),
    ).toThrow()
    expect(() =>
      validateSurfaceWaterFrame(
        { ...frame, tiles: [frame.tiles[0]!, frame.tiles[0]!] },
        grid,
        'version',
        1984,
      ),
    ).toThrow()
    expect(() =>
      validateSurfaceWaterFrame(
        { ...frame, transform: [0.01, 0, 30.01, 0, -0.01, 50] },
        grid,
        'version',
        1984,
      ),
    ).toThrow()
    expect(() => validateSurfaceWaterFrame(frame, grid, 'other', 1984)).toThrow()
    expect(() => validateSurfaceWaterFrame(frame, grid, 'version', 1985)).toThrow()
  })
  it('keeps exterior transparent, dry distinct from gaps and category transitions separate from gain/loss colours', () => {
    expect(surfaceWaterPixelColor(15, null, false)).toBeNull()
    expect(surfaceWaterPixelColor(1, null, false)).not.toBe(surfaceWaterPixelColor(0, null, false))
    expect(surfaceWaterPixelColor(3, 2, false)).toBe(SURFACE_WATER_COLORS.persistent)
    expect(surfaceWaterPixelColor(3, 2, true)).toBe(SURFACE_WATER_COLORS.permanentToSeasonal)
    expect(surfaceWaterPixelColor(2, 3, true)).toBe(SURFACE_WATER_COLORS.seasonalToPermanent)
    expect(surfaceWaterPixelColor(1, 3, true)).toBe(SURFACE_WATER_COLORS.gained)
    expect(surfaceWaterPixelColor(3, 1, true)).toBe(SURFACE_WATER_COLORS.lost)
    expect(surfaceWaterPixelColor(3, 0, true)).toBe(SURFACE_WATER_COLORS.uncomparable)
  })
})

it('uses nearest original geographic rows rather than stretching latitude rows linearly in Mercator', () => {
  // Across 0–80° the four Mercator row centres fall near 76.5°, 65.4°, 46.1° and 17.2°.
  expect([0, 1, 2, 3].map((y) => surfaceWaterNativeRow([0, 0, 1, 80], 4, y))).toEqual([0, 0, 1, 3])
  expect(surfaceWaterNativeRow([30, 49.99, 30.01, 50], 1, 0)).toBe(0)
})
