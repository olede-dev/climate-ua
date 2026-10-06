import { useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { layerConfig } from '../config/layers'
import type { LayerFile, LayerId, OblastsFile } from '../types'

/** A static JSON file under `public/`, versioned with the site. */
async function fetchStatic<T>(path: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return (await response.json()) as T
}

/** One layer's data file; `staleTime: Infinity` comes from the client defaults. */
export function useLayer(id: MaybeRefOrGetter<LayerId>) {
  const path = computed(() => layerConfig(toValue(id)).path)
  return useQuery({
    queryKey: ['layer', path],
    queryFn: () => fetchStatic<LayerFile>(path.value),
  })
}

export function useOblasts() {
  return useQuery({
    queryKey: ['geometry', 'oblasts'],
    queryFn: () => fetchStatic<OblastsFile>('data/oblasts.geojson'),
  })
}
