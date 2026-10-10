import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSurfaceWaterAsset, readSurfaceWaterBytes } from '../src/composables/useLayer'

const root = new URL('https://example.com/climate-ua/data/surface-water/versions/version/')
const payload = new TextEncoder().encode('{"year":1984}')
const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', payload))]
  .map((v) => v.toString(16).padStart(2, '0'))
  .join('')
const asset = { url: 'frame.json', sha256, bytes: payload.length }
afterEach(() => vi.unstubAllGlobals())
describe('verified surface-water fetching', () => {
  it('returns JSON only after byte count and SHA-256 match', async () => {
    vi.stubGlobal('fetch', async () => new Response(payload))
    await expect(
      fetchSurfaceWaterAsset(root, asset, new AbortController().signal),
    ).resolves.toEqual({ year: 1984 })
    await expect(
      fetchSurfaceWaterAsset(
        root,
        { ...asset, sha256: 'a'.repeat(64) },
        new AbortController().signal,
      ),
    ).rejects.toThrow('checksum')
  })
  it('rejects short and oversized responses instead of committing corrupted classes', async () => {
    vi.stubGlobal('fetch', async () => new Response(payload))
    await expect(
      fetchSurfaceWaterAsset(
        root,
        { ...asset, bytes: payload.length + 1 },
        new AbortController().signal,
      ),
    ).rejects.toThrow('byte count')
    await expect(
      fetchSurfaceWaterAsset(
        root,
        { ...asset, bytes: payload.length - 1 },
        new AbortController().signal,
      ),
    ).rejects.toThrow('exceeds')
  })
  it('aborts a waiting bounded stream without returning partial data', async () => {
    const controller = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1]))
      },
    })
    const reading = readSurfaceWaterBytes(stream, 2, controller.signal)
    controller.abort()
    await expect(reading).rejects.toThrow()
  })
  it('refuses HTTP failures and requests above the viewport budget', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 404 }))
    await expect(fetchSurfaceWaterAsset(root, asset, new AbortController().signal)).rejects.toThrow(
      'HTTP 404',
    )
    await expect(
      fetchSurfaceWaterAsset(root, { ...asset, bytes: 2_000_001 }, new AbortController().signal),
    ).rejects.toThrow('budget')
  })
})
