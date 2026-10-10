import { useQueryClient } from '@tanstack/vue-query'
import { fetchSurfaceWaterAsset, readSurfaceWaterBytes } from './useLayer'
import {
  decodeSurfaceWaterTile,
  intersectsSurfaceWater,
  surfaceWaterExtent,
  validateSurfaceWaterFrame,
  validateSurfaceWaterPair,
  type SurfaceWaterBounds,
} from '../lib/surfaceWater'
import type {
  SurfaceWaterFrame,
  SurfaceWaterGrid,
  SurfaceWaterManifest,
  SurfaceWaterState,
  SurfaceWaterTile,
} from '../types'

const CACHE_LIMIT = 16 * 1024 * 1024
export const SURFACE_WATER_VIEWPORT_LIMIT = 2_000_000
export interface SurfaceWaterRenderTile {
  bounds: SurfaceWaterBounds
  tile: SurfaceWaterTile
  before: Uint8Array
  after: Uint8Array | null
}

/** Component-local decoded cache is released on leaving the feature. JSON remains query state. */
export function useSurfaceWaterTiles() {
  const client = useQueryClient()
  const cache = new Map<string, Uint8Array>()
  let cacheBytes = 0
  async function pixels(
    root: URL,
    tile: SurfaceWaterTile,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const hit = cache.get(tile.sha256)
    if (hit) {
      cache.delete(tile.sha256)
      cache.set(tile.sha256, hit)
      return hit
    }
    const bytes = await fetchSurfaceWaterAsset(root, tile, signal, true)
    const packed = await readSurfaceWaterBytes(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
      Math.ceil((tile.width * tile.height) / 2),
      signal,
    )
    const decoded = decodeSurfaceWaterTile(new Uint8Array(packed), tile.width * tile.height)
    signal.throwIfAborted()
    while (cacheBytes + decoded.length > CACHE_LIMIT && cache.size) {
      const key = cache.keys().next().value!
      cacheBytes -= cache.get(key)!.length
      cache.delete(key)
    }
    cache.set(tile.sha256, decoded)
    cacheBytes += decoded.length
    return decoded
  }
  async function frame(
    root: URL,
    grid: SurfaceWaterGrid,
    year: number,
    version: string,
    signal: AbortSignal,
  ) {
    const asset = grid.frames.find((item) => item.year === year)
    if (!asset) throw new Error('Unsupported surface-water year')
    const key = ['surface-water-frame', version, asset.sha256]
    const cached = client.getQueryData<SurfaceWaterFrame>(key)
    const data = cached ?? (await fetchSurfaceWaterAsset<SurfaceWaterFrame>(root, asset, signal))
    if (!cached) client.setQueryData(key, data)
    signal.throwIfAborted()
    validateSurfaceWaterFrame(data, grid, version, year)
    return data
  }
  async function load(
    manifest: SurfaceWaterManifest,
    root: URL,
    state: SurfaceWaterState,
    viewport: SurfaceWaterBounds,
    native: boolean,
    signal: AbortSignal,
  ) {
    let encodedBytes = 0
    let frameBytes = 0
    const years = state.mode === 'annual' ? [state.year] : [...new Set([state.before, state.after])]
    async function plan(grids: SurfaceWaterGrid[]) {
      const tasks: {
        before: SurfaceWaterFrame
        after: SurfaceWaterFrame | null
        tile: SurfaceWaterTile
        other: SurfaceWaterTile | null
        bounds: SurfaceWaterBounds
      }[] = []
      for (const grid of grids) {
        const frames = []
        for (const year of years) {
          const bytes = grid.frames.find((item) => item.year === year)?.bytes ?? 0
          frameBytes += bytes
          encodedBytes += bytes
          if (encodedBytes > SURFACE_WATER_VIEWPORT_LIMIT) return null
          frames.push(await frame(root, grid, year, manifest.version, signal))
        }
        const before = frames[0]!
        const after = state.mode === 'comparison' ? frames.at(-1)! : null
        if (after) validateSurfaceWaterPair(before, after)
        const matches = new Map(after?.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]))
        for (const tile of before.tiles) {
          const t = grid.transform
          const bounds: SurfaceWaterBounds = [
            t[2] + tile.x * t[0],
            t[5] + (tile.y + tile.height) * t[4],
            t[2] + (tile.x + tile.width) * t[0],
            t[5] + tile.y * t[4],
          ]
          if (native && !intersectsSurfaceWater(bounds, viewport)) continue
          const other = after ? matches.get(`${tile.x},${tile.y}`) : null
          if (after && (!other || other.width !== tile.width || other.height !== tile.height))
            throw new Error('Mismatched surface-water pair tiles')
          encodedBytes += tile.bytes + (other && other.sha256 !== tile.sha256 ? other.bytes : 0)
          tasks.push({ before, after, tile, other: other ?? null, bounds })
        }
      }
      return tasks
    }
    const nativeGrids = manifest.chunks.filter((grid) =>
      intersectsSurfaceWater(surfaceWaterExtent(grid), viewport),
    )
    if (nativeGrids.length > 4) native = false
    let tasks = await plan(native ? nativeGrids : [manifest.overview])
    if (
      native &&
      (!tasks ||
        tasks.length === 0 ||
        tasks.length > 24 ||
        encodedBytes > SURFACE_WATER_VIEWPORT_LIMIT)
    ) {
      native = false
      // Include fetched indexes, but discard the native tile estimate (tiles were not fetched).
      encodedBytes = frameBytes
      tasks = await plan([manifest.overview])
    }
    if (!tasks || encodedBytes > SURFACE_WATER_VIEWPORT_LIMIT)
      throw new Error('Surface-water viewport exceeds delivery budget')
    const tiles: SurfaceWaterRenderTile[] = []
    // Sequential bounded decoding avoids a burst of decompression buffers on mobile.
    for (const task of tasks) {
      signal.throwIfAborted()
      const before = await pixels(root, task.tile, signal)
      const after = task.other ? await pixels(root, task.other, signal) : null
      tiles.push({ bounds: task.bounds, tile: task.tile, before, after })
    }
    signal.throwIfAborted()
    return { tiles, native, encodedBytes, cacheBytes }
  }
  return { load }
}
