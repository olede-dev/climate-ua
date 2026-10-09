import { computed, toValue, type MaybeRefOrGetter } from 'vue'

import { anomalyPct, classifyDischarge } from '../lib/river/anomaly'
import { dayOfYear, todayKyiv } from '../lib/river/dates'
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
 */
export function useStationsState(
  enabled: MaybeRefOrGetter<boolean>,
  mapDate?: MaybeRefOrGetter<string>,
) {
  const rivers = useRivers(enabled)
  const discharge = useDischarge(enabled)
  const norms = useRiverNorms(enabled)
  const today = todayKyiv()

  const statesOn = (date: string) =>
    (rivers.data.value?.stations ?? []).map((station) =>
      stationState(
        station,
        discharge.data.value?.series.get(station.id),
        norms.data.value,
        today,
        date,
      ),
    )
  const states = computed(() => statesOn(today))
  const mapStates = computed(() => {
    const date = mapDate === undefined ? today : toValue(mapDate)
    return date === today ? states.value : statesOn(date)
  })

  return { states, mapStates, today, discharge, norms }
}
