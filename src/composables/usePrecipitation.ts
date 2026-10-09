import { useQuery } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'

import { fetchPrecipitation } from '../api/weather'
import { shouldRetryQuery } from '../api/http'
import { DISCHARGE_MAX_AGE_MS, PRECIPITATION_WINDOW } from '../config/discharge'
import type { Station } from '../types'

/** Precipitation at the selected station's cell, only while the chart shows it. */
export function usePrecipitation(
  station: MaybeRefOrGetter<Station | null>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    queryKey: computed(() => ['precipitation', toValue(station)?.id, PRECIPITATION_WINDOW]),
    queryFn: ({ signal }) =>
      fetchPrecipitation(toValue(station)!.cell, PRECIPITATION_WINDOW, { signal }),
    enabled: computed(() => toValue(enabled) && toValue(station) !== null),
    staleTime: DISCHARGE_MAX_AGE_MS,
    retry: shouldRetryQuery,
  })
}
