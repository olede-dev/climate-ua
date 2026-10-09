import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { layerConfig } from '../config/layers'
import { riversLayer } from '../lib/rivers'
import type {
  BasinsFile,
  GridFile,
  KoppenFile,
  LayerFile,
  LayerId,
  OblastsFile,
  RiversFile,
  WaterUseFile,
} from '../types'

async function fetchStatic<T>(path: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return (await response.json()) as T
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
    queryFn: () => fetchStatic<OblastsFile>('data/oblasts.geojson'),
  })
}

export function useBasins() {
  return useQuery({
    queryKey: ['geometry', 'basins'],
    queryFn: () => fetchStatic<BasinsFile>('data/basins.geojson'),
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
