import { useQuery } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'

import { fetchDischargeHistories } from '../api/flood'
import { shouldRetryQuery } from '../api/http'
import { DISCHARGE_WINDOW } from '../config/discharge'
import { anomalyPct, classifyDischarge } from '../lib/river/anomaly'
import { addDays, dayOfYear, todayKyiv } from '../lib/river/dates'
import { withHistory } from '../lib/river/history'
import type { DischargeSeries, RiverNormsFile, Station, StationState } from '../types'
import { useDischarge } from './useDischarge'
import { useRiverNorms, useRivers } from './useLayer'

/** Observed discharge up to `today`, the ensemble median after it. */
export function valueOn(
  series: DischargeSeries | undefined,
  date: string,
  today: string,
): number | null {
  if (!series) return null
  const index = series.time.indexOf(date)
  if (index === -1) return null
  return date > today
    ? (series.ensemble.median[index] ?? series.discharge[index])
    : series.discharge[index]
}

export function stationState(
  station: Station,
  series: DischargeSeries | undefined,
  norms: RiverNormsFile | undefined,
  today: string,
  date: string,
): StationState {
  const current = valueOn(series, date, today)
  const norm = norms?.stations[station.id]?.doy[dayOfYear(date) - 1] ?? null
  return {
    station,
    cell: series?.cell ?? null,
    current,
    norm,
    anomalyClass: norm ? classifyDischarge(current, norm) : null,
    anomalyPct: norm ? anomalyPct(current, norm.median) : null,
  }
}

/**
 * Joins today's discharge with the day-of-year norm for every station of `rivers.json`.
 * `mapDate`, when given, drives `mapStates` too: the same join for another day (the timelapse).
 * `historyDays`, when above the live window, adds one request for the days before it.
 */
export function useStationsState(
  enabled: MaybeRefOrGetter<boolean>,
  mapDate?: MaybeRefOrGetter<string>,
  historyDays: MaybeRefOrGetter<number> = DISCHARGE_WINDOW.pastDays,
) {
  const rivers = useRivers(enabled)
  const discharge = useDischarge(enabled)
  const norms = useRiverNorms(enabled)
  const today = todayKyiv()

  const points = computed(
    () => rivers.data.value?.stations.map((s) => ({ id: s.id, ...s.cell })) ?? [],
  )
  // The day before the live window starts, so the two requests never overlap.
  const historyEnd = addDays(today, -DISCHARGE_WINDOW.pastDays - 1)
  const historyStart = computed(() => addDays(today, -toValue(historyDays)))
  const history = useQuery({
    queryKey: computed(() => ['discharge-history', points.value.map((p) => p.id), historyStart.value]),
    queryFn: ({ signal }) =>
      fetchDischargeHistories(
        points.value,
        { startDate: historyStart.value, endDate: historyEnd },
        { signal },
      ),
    enabled: computed(
      () =>
        toValue(enabled) &&
        points.value.length > 0 &&
        toValue(historyDays) > DISCHARGE_WINDOW.pastDays,
    ),
    staleTime: Infinity,
    retry: shouldRetryQuery,
  })

  /** Live discharge per station, with the history in front of it once loaded. */
  const series = computed(() => {
    const live = discharge.data.value?.series
    const past = history.data.value
    if (!live || !past || toValue(historyDays) <= DISCHARGE_WINDOW.pastDays) return live
    return new Map(
      [...live].map(([id, s]) => {
        const days = past.get(id)
        return [id, days ? withHistory(s, days) : s]
      }),
    )
  })

  const statesOn = (date: string) =>
    (rivers.data.value?.stations ?? []).map((station) =>
      stationState(station, series.value?.get(station.id), norms.data.value, today, date),
    )
  const states = computed(() => statesOn(today))
  const mapStates = computed(() => {
    const date = mapDate === undefined ? today : toValue(mapDate)
    return date === today ? states.value : statesOn(date)
  })

  return { states, mapStates, today, discharge, history, series, norms }
}
