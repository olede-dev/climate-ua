import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { layerConfig } from '../config/layers'
import { rememberUrl } from '../lib/fileUrls'
import { firstPaint } from '../lib/firstPaint'
import { surfaceWaterAssetUrl } from '../lib/surfaceWaterAssets'
import type { SurfaceWaterAsset, SurfaceWaterManifest, SurfaceWaterPointer } from '../types'
import { riversLayer } from '../lib/rivers'
import type {
  BasinsFile,
  GridFile,
  KoppenFile,
  LayerFile,
  LayerId,
  OblastsFile,
  RiverLinesFile,
  RiverNormsFile,
  RiversFile,
  WaterUseFile,
} from '../types'

async function fetchStatic<T>(path: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}${path}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return rememberUrl((await response.json()) as T & object, new URL(url, location.href).href)
}

const RIVERS_QUERY = {
  queryKey: ['rivers'],
  queryFn: () => fetchStatic<RiversFile>(layerConfig('rivers').path),
}

export function useLayer(id: MaybeRefOrGetter<LayerId | null>) {
  const client = useQueryClient()
  const layer = computed(() => toValue(id))
  return useQuery({
    queryKey: ['layer', layer],
    queryFn: async () =>
      layer.value === 'rivers'
        ? riversLayer(await client.ensureQueryData(RIVERS_QUERY))
        : fetchStatic<LayerFile>(layerConfig(layer.value!).path),
    enabled: computed(() => layer.value !== null && layer.value !== 'waterbodies'),
  })
}

export function useRivers(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({ ...RIVERS_QUERY, enabled: computed(() => toValue(enabled)) })
}

/** Day-of-year discharge norms and yearly low-flow days; only the rivers layer reads them. */
export function useRiverNorms(enabled: MaybeRefOrGetter<boolean>) {
  return useQuery({
    queryKey: ['river-norms'],
    queryFn: () => fetchStatic<RiverNormsFile>('data/river-norms.json'),
    enabled: computed(() => toValue(enabled)),
  })
}

/** River lines with the station tint runs; only the rivers layer draws them. */
export function useRiverLines(enabled: MaybeRefOrGetter<boolean>) {
  return useQuery({
    queryKey: ['river-lines'],
    queryFn: () => fetchStatic<RiverLinesFile>('data/river-lines.geojson'),
    enabled: computed(() => toValue(enabled)),
  })
}

export function useWaterUse(enabled: MaybeRefOrGetter<boolean>) {
  return useQuery({
    queryKey: ['water-use'],
    queryFn: () => fetchStatic<WaterUseFile>('data/water-use.json'),
    enabled: computed(() => toValue(enabled)),
  })
}

export function useOblasts() {
  return useQuery({
    queryKey: ['geometry', 'oblasts'],
    queryFn: () => firstPaint().then(() => fetchStatic<OblastsFile>('data/oblasts.geojson')),
  })
}

export function useBasins() {
  return useQuery({
    queryKey: ['geometry', 'basins'],
    queryFn: () => firstPaint().then(() => fetchStatic<BasinsFile>('data/basins.geojson')),
  })
}

export function useKoppen() {
  return useQuery({
    queryKey: ['koppen'],
    queryFn: () => fetchStatic<KoppenFile>('data/koppen.json'),
  })
}

export function useGrid(path: MaybeRefOrGetter<string | null>) {
  const file = computed(() => toValue(path))
  return useQuery({
    queryKey: ['grid', file],
    queryFn: () => fetchStatic<GridFile>(file.value!),
    enabled: computed(() => file.value !== null),
  })
}

/** Surface-water assets always remain within one checksummed same-origin release. */
export async function fetchSurfaceWaterAsset(
  root: URL,
  asset: SurfaceWaterAsset,
  signal: AbortSignal,
  binary: true,
): Promise<Uint8Array<ArrayBuffer>>
export async function fetchSurfaceWaterAsset<T>(
  root: URL,
  asset: SurfaceWaterAsset,
  signal: AbortSignal,
  binary?: false,
): Promise<T>
export async function fetchSurfaceWaterAsset<T>(
  root: URL,
  asset: SurfaceWaterAsset,
  signal: AbortSignal,
  binary = false,
): Promise<T | Uint8Array<ArrayBuffer>> {
  const url = surfaceWaterAssetUrl(root, asset)
  if (asset.bytes > 2_000_000) throw new Error('Surface-water request exceeds viewport budget')
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Surface-water HTTP ${response.status}`)
  const bytes = new Uint8Array(await readSurfaceWaterBytes(response.body, asset.bytes, signal))
  if (bytes.length !== asset.bytes) throw new Error('Surface-water byte count mismatch')
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
  signal.throwIfAborted()
  if (hash !== asset.sha256) throw new Error('Surface-water checksum mismatch')
  return binary ? bytes : (JSON.parse(new TextDecoder().decode(bytes)) as T)
}

export async function readSurfaceWaterBytes(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  if (!stream) throw new Error('Empty surface-water response')
  const reader = stream.getReader()
  const output = new Uint8Array(limit)
  let offset = 0
  const abort = () => {
    void reader.cancel(signal.reason)
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      if (offset + value.length > limit)
        throw new Error('Surface-water payload exceeds declared size')
      output.set(value, offset)
      offset += value.length
    }
    signal.throwIfAborted()
    return output.buffer.slice(0, offset)
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel()
    reader.releaseLock()
  }
}

export function useSurfaceWaterManifest() {
  return useQuery({
    queryKey: ['surface-water-release'],
    queryFn: async ({ signal }) => {
      const root = new URL(`${import.meta.env.BASE_URL}data/surface-water/`, location.href)
      const response = await fetch(new URL('current.json', root), { signal })
      if (!response.ok) throw new Error(`Surface-water pointer HTTP ${response.status}`)
      const pointer = JSON.parse(
        new TextDecoder().decode(await readSurfaceWaterBytes(response.body, 4096, signal)),
      ) as SurfaceWaterPointer
      if (
        pointer.schemaVersion !== 1 ||
        !/^[a-f0-9]{20}$/.test(pointer.version) ||
        pointer.url !== `versions/${pointer.version}/manifest.json`
      )
        throw new Error('Invalid surface-water pointer')
      const manifest = await fetchSurfaceWaterAsset<SurfaceWaterManifest>(root, pointer, signal)
      if (
        manifest.schemaVersion !== 1 ||
        manifest.version !== pointer.version ||
        manifest.encoding !== 'packed4-gzip' ||
        manifest.rasterCRS !== 'EPSG:4326' ||
        manifest.tileSize !== 512 ||
        !Array.isArray(manifest.years) ||
        manifest.years.some((year) => !Number.isSafeInteger(year)) ||
        new Set(manifest.years).size !== manifest.years.length ||
        new Set(manifest.catalogue.map((body) => body.id)).size !== manifest.catalogue.length
      )
        throw new Error('Invalid surface-water manifest')
      return { manifest, root: new URL(`versions/${pointer.version}/`, root).href }
    },
    retry: false,
  })
}
