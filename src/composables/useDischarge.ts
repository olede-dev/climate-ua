import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'

import { fetchDischargeSnapshot, loadDischarge, type DischargeData } from '../api/discharge'
import { shouldRetryQuery } from '../api/http'
import { DISCHARGE_MAX_AGE_MS, DISCHARGE_WINDOW, SNAPSHOT_PATH } from '../config/discharge'
import { nowMs } from '../lib/river/dates'
import { readCachedDischarge, writeCachedDischarge } from '../lib/river/dischargeCache'
import { useRivers } from './useLayer'

/** `localStorage`, or `null` where the browser blocks it (private mode, disabled site data). */
function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Today's discharge and ensemble forecast for every station, in one request, only while
 * `enabled` (the rivers layer). Stale-while-revalidate: the daily snapshot paints first,
 * marked `pending`; a live response from the last hour comes from `localStorage`; otherwise
 * Open-Meteo answers, and when it fails the snapshot stays, marked with the reason.
 */
export function useDischarge(enabled: MaybeRefOrGetter<boolean>) {
  const client = useQueryClient()
  const rivers = useRivers(enabled)
  const stations = computed(
    () => rivers.data.value?.stations.map((s) => ({ id: s.id, ...s.cell })) ?? [],
  )
  const stationIds = computed(() => stations.value.map((s) => s.id))
  const active = computed(() => toValue(enabled) && stationIds.value.length > 0)
  const storage = browserStorage()

  const snapshotOptions = () => ({
    queryKey: ['discharge-snapshot', stationIds.value],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchDischargeSnapshot(
        new URL(`${import.meta.env.BASE_URL}${SNAPSHOT_PATH}`, window.location.href),
        stationIds.value,
        signal,
      ),
    staleTime: Infinity,
    // Absent in local development; a retry would not make it appear.
    retry: false,
  })
  const snapshot = useQuery(computed(() => ({ ...snapshotOptions(), enabled: active.value })))

  const readCache = () =>
    storage &&
    readCachedDischarge(storage, {
      stationIds: stationIds.value,
      window: DISCHARGE_WINDOW,
      nowMs: nowMs(),
      maxAgeMs: DISCHARGE_MAX_AGE_MS,
    })

  return useQuery({
    queryKey: ['discharge', DISCHARGE_WINDOW, stationIds],
    queryFn: async ({ signal }): Promise<DischargeData> => {
      const data = await loadDischarge(stations.value, DISCHARGE_WINDOW, {
        signal,
        snapshot: () => client.fetchQuery(snapshotOptions()),
      })
      if (storage && data.source.kind === 'live') {
        writeCachedDischarge(storage, data.series, { window: DISCHARGE_WINDOW, nowMs: nowMs() })
      }
      return data
    },
    enabled: active,
    staleTime: DISCHARGE_MAX_AGE_MS,
    retry: shouldRetryQuery,
    initialData: (): DischargeData | undefined => {
      const cached = readCache()
      return cached
        ? { series: cached.series, source: { kind: 'cache', savedAtMs: cached.savedAtMs } }
        : undefined
    },
    initialDataUpdatedAt: () => readCache()?.savedAtMs,
    placeholderData: computed((): DischargeData | undefined =>
      snapshot.data.value
        ? {
            series: snapshot.data.value.series,
            source: {
              kind: 'snapshot',
              fetchedOn: snapshot.data.value.fetchedOn,
              reason: 'pending',
            },
          }
        : undefined,
    ),
  })
}
