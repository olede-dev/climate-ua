import { useQuery } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'

import { fetchDischargeHistory } from '../api/flood'
import { shouldRetryQuery } from '../api/http'
import { lowFlowDays, summarizeClimate } from '../lib/river/climate'
import type { RiversFile, RiverStationNorms, Station } from '../types'

/**
 * The station card's climate section: the yearly low-flow days of `river-norms.json` up to
 * `today`'s day of year, plus this year's, counted from discharge since 1 January (one Flood
 * API request for the open station only).
 */
export function useRiverClimate(
  station: MaybeRefOrGetter<Station>,
  rivers: MaybeRefOrGetter<RiversFile | undefined>,
  norms: MaybeRefOrGetter<RiverStationNorms | null>,
  normYears: MaybeRefOrGetter<{ from: number; to: number } | undefined>,
  today: string,
) {
  const thisYear = useQuery({
    queryKey: computed(() => ['discharge-year', toValue(station).id, today]),
    queryFn: ({ signal }) =>
      fetchDischargeHistory(
        toValue(station).cell,
        { startDate: `${today.slice(0, 4)}-01-01`, endDate: today },
        { signal },
      ),
    staleTime: Infinity,
    retry: shouldRetryQuery,
  })

  const summary = computed(() => {
    const file = toValue(rivers)
    const stationNorms = toValue(norms)
    const years = toValue(normYears)
    if (!file || !stationNorms || !years) return null
    const series = thisYear.data.value
    const days = series ? lowFlowDays(series.time, series.discharge, stationNorms) : null
    return summarizeClimate(
      {
        periods: file,
        station: toValue(station),
        years,
        lowFlowDays: stationNorms.lowFlowDays,
      },
      days,
      today,
    )
  })

  return { thisYear, summary }
}
