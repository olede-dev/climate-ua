import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { layerConfig } from '../config/layers'
import { rememberUrl } from '../lib/fileUrls'
import { firstPaint } from '../lib/firstPaint'
import { readSurfaceWaterBytes, surfaceWaterAssetUrl } from '../lib/surfaceWaterAssets'

export { readSurfaceWaterBytes }
import type {
  SurfaceWaterAsset,
  SurfaceWaterCatalogueFile,
  SurfaceWaterComparisonSummary,
  SurfaceWaterManifest,
  SurfaceWaterPointer,
} from '../types'
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

export function useSurfaceWaterManifest() {
  return useQuery({
    queryKey: ['surface-water-release'],
    queryFn: async ({ signal }) => {
      const root = new URL(`${import.meta.env.BASE_URL}data/surface-water/`, location.href)
      // The marker catalogue does not depend on the pointer; fetch both at once, check it later.
      const cataloguePromise = fetchStatic<SurfaceWaterCatalogueFile>(
        'data/surface-water-catalogue.json',
      )
      cataloguePromise.catch(() => {})
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
        manifest.schemaVersion !== 3 ||
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
      const catalogue = await cataloguePromise
      if (catalogue.version !== manifest.version || catalogue.zoneVersion !== manifest.zoneVersion)
        throw new Error('Surface-water marker catalogue does not match selected release')
      const markers = Object.fromEntries(
        catalogue.catalogue.map((body) => [body.id, body.markerCoordinates]),
      )
      for (const body of manifest.catalogue) {
        const point = markers[body.id]
        if (!point || point.length !== 2 || !point.every(Number.isFinite))
          throw new Error('Missing surface-water marker coordinates')
      }
      return {
        manifest,
        markers,
        root: new URL(`versions/${pointer.version}/`, root).href,
      }
    },
    retry: false,
  })
}

type SurfaceWaterRelease = { manifest: SurfaceWaterManifest; root: string }
type SurfaceWaterBody = import('../types').SurfaceWaterBodyEntry

function seriesQuery(release: SurfaceWaterRelease, entry: SurfaceWaterBody) {
  return {
    queryKey: ['surface-water-series', release.manifest.version, entry.id],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const { manifest, root } = release
      const series = await fetchSurfaceWaterAsset<import('../types').SurfaceWaterSeries>(
        new URL(root),
        entry.series,
        signal,
      )
      if (
        series.schemaVersion !== 2 ||
        series.version !== manifest.version ||
        series.pairs.map((ref) => ref.beforeYear).join() !== manifest.years.slice(0, -1).join() ||
        series.zoneVersion !==
          (entry.type === 'local' ? manifest.local?.zoneVersion : manifest.zoneVersion) ||
        series.id !== entry.id ||
        series.unit !== 'm2' ||
        series.areaCRS !== 'EPSG:6933'
      )
        throw new Error('Invalid surface-water series')
      return series
    },
    retry: false,
  }
}

/** Details share the selected immutable release; no request before a card opens. */
export function useSurfaceWaterSeries(
  release: MaybeRefOrGetter<SurfaceWaterRelease>,
  body: MaybeRefOrGetter<SurfaceWaterBody>,
) {
  return useQuery(computed(() => seriesQuery(toValue(release), toValue(body))))
}

/**
 * Stored pairs with one `beforeYear` for the open card; a reversed or equal-year view is derived
 * by `waterbodyPair`. Idle without a distinct pair.
 */
export function useSurfaceWaterPairs(
  release: MaybeRefOrGetter<SurfaceWaterRelease>,
  series: MaybeRefOrGetter<import('../types').SurfaceWaterSeries | undefined>,
  beforeYear: MaybeRefOrGetter<number | null>,
) {
  return useQuery(
    computed(() => {
      const { manifest, root } = toValue(release)
      const value = toValue(series)
      const year = toValue(beforeYear)
      const asset = value?.pairs.find((ref) => ref.beforeYear === year)
      return {
        queryKey: ['surface-water-pairs', manifest.version, value?.id, year],
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const file = await fetchSurfaceWaterAsset<import('../types').SurfaceWaterPairFile>(
            new URL(root),
            asset!,
            signal,
          )
          if (
            file.schemaVersion !== 2 ||
            file.version !== manifest.version ||
            file.id !== value!.id ||
            file.beforeYear !== year ||
            file.pairs.some((row) => row.beforeYear !== year)
          )
            throw new Error('Invalid surface-water pair file')
          return file.pairs
        },
        enabled: !!asset,
        retry: false,
      }
    }),
  )
}

/** Automatic local bodies (labels, card entries); idle until enabled after the overview paints. */
export function useSurfaceWaterLocalBodies(
  release: MaybeRefOrGetter<SurfaceWaterRelease | null | undefined>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery(
    computed(() => {
      const value = toValue(release)
      const local = value?.manifest.local
      return {
        queryKey: ['surface-water-local-bodies', value?.manifest.version],
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const file = await fetchSurfaceWaterAsset<import('../types').SurfaceWaterLocalBodies>(
            new URL(value!.root),
            local!.bodies,
            signal,
          )
          if (
            file.schemaVersion !== 1 ||
            file.version !== value!.manifest.version ||
            file.zoneVersion !== local!.zoneVersion
          )
            throw new Error('Invalid surface-water local bodies')
          return file.bodies
        },
        enabled: !!local && toValue(enabled),
        retry: false,
      }
    }),
  )
}

/** Local outlines for hit-testing; idle until enabled (the map is zoomed in far enough). */
export function useSurfaceWaterOutlines(
  release: MaybeRefOrGetter<SurfaceWaterRelease | null | undefined>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery(
    computed(() => {
      const value = toValue(release)
      const asset = value?.manifest.local?.outlines
      return {
        queryKey: ['surface-water-outlines', value?.manifest.version],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchSurfaceWaterAsset<import('geojson').FeatureCollection>(
            new URL(value!.root),
            asset!,
            signal,
          ),
        enabled: !!asset && toValue(enabled),
        retry: false,
      }
    }),
  )
}

/** Compact pair areas for the comparison list; idle until enabled. */
export function useSurfaceWaterComparison(
  release: MaybeRefOrGetter<SurfaceWaterRelease | null | undefined>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery(
    computed(() => {
      const value = toValue(release)
      const asset = value?.manifest.comparison
      return {
        queryKey: ['surface-water-comparison', value?.manifest.version],
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const summary = await fetchSurfaceWaterAsset<SurfaceWaterComparisonSummary>(
            new URL(value!.root),
            asset!,
            signal,
          )
          const years = value!.manifest.years
          const pairs = (years.length * (years.length - 1)) / 2
          if (
            summary.schemaVersion !== 1 ||
            summary.version !== value!.manifest.version ||
            summary.years.join() !== years.join() ||
            summary.bodies.some(
              (body) => body.annual.length !== years.length || body.pairs.length !== pairs,
            )
          )
            throw new Error('Invalid surface-water comparison summary')
          return summary
        },
        enabled: !!asset && toValue(enabled),
        retry: false,
      }
    }),
  )
}
