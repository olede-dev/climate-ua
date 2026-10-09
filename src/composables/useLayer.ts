import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { layerConfig } from '../config/layers'
import { rememberUrl } from '../lib/fileUrls'
import { firstPaint } from '../lib/firstPaint'
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
    enabled: computed(() => layer.value !== null),
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
