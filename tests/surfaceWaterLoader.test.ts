import { afterEach, describe, expect, it, vi } from 'vitest'
import { SurfaceWaterTileCache } from '../src/lib/surfaceWaterCache'
import type { SurfaceWaterManifest, SurfaceWaterState } from '../src/types'

vi.mock('@tanstack/vue-query', () => ({
  useQueryClient: () => ({ getQueryData: () => undefined, setQueryData: () => undefined }),
}))
const { useSurfaceWaterTiles, SURFACE_WATER_VIEWPORT_LIMIT } =
  await import('../src/composables/useSurfaceWaterTiles')

const root = new URL('https://example.com/data/surface-water/versions/v/')
const transform: [number, number, number, number, number, number] = [1, 0, 0, 0, -1, 10]
function manifest(frameBytes: number): SurfaceWaterManifest {
  const frames = [1984, 2024].map((year) => ({
    year,
    url: `frames/${year}.json`,
    sha256: String(year).repeat(16),
    bytes: frameBytes,
  }))
  return {
    version: 'v',
    overview: { width: 10, height: 10, transform, frames },
    chunks: [],
  } as unknown as SurfaceWaterManifest
}
const comparison: SurfaceWaterState = {
  mode: 'comparison',
  year: 2024,
  before: 1984,
  after: 2024,
  waterbody: null,
}
afterEach(() => vi.unstubAllGlobals())

describe('surface-water decoded tile cache', () => {
  it('evicts least recently used tiles first and tracks bytes', () => {
    const cache = new SurfaceWaterTileCache(10)
    cache.set('a', new Uint8Array(4))
    cache.set('b', new Uint8Array(4))
    cache.get('a')
    cache.set('c', new Uint8Array(4))
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toHaveLength(4)
    expect(cache.get('c')).toHaveLength(4)
    expect(cache.bytes).toBe(8)
  })
  it('replaces an existing key without double counting', () => {
    const cache = new SurfaceWaterTileCache(10)
    cache.set('a', new Uint8Array(4))
    cache.set('a', new Uint8Array(6))
    expect(cache.bytes).toBe(6)
  })
  it('keeps two overview comparison pairs decoded', () => {
    const year = 7_150_000
    const cache = new SurfaceWaterTileCache(32 * 1024 * 1024)
    for (const key of ['1984', '2024', '1990', '2020']) cache.set(key, new Uint8Array(year))
    for (const key of ['1984', '2024']) expect(cache.get(key)).toBeDefined()
  })
})

describe('surface-water loader', () => {
  it('refuses frame indexes above the delivery budget before any fetch', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const bytes = SURFACE_WATER_VIEWPORT_LIMIT / 2 + 1
    await expect(
      useSurfaceWaterTiles().load(
        manifest(bytes),
        root,
        comparison,
        [0, 0, 10, 10],
        false,
        new AbortController().signal,
      ),
    ).rejects.toThrow('budget')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('requests every frame index of a comparison in the same tick', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', (url: URL) => {
      urls.push(String(url))
      return new Promise(() => undefined)
    })
    void useSurfaceWaterTiles().load(
      manifest(100),
      root,
      comparison,
      [0, 0, 10, 10],
      false,
      new AbortController().signal,
    )
    await Promise.resolve()
    expect(urls.map((url) => url.split('/').at(-1))).toEqual(['1984.json', '2024.json'])
  })
})
