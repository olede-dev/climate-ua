<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue'

import { isRateLimited } from '../../../api/http'
import { useLocale } from '../../../composables/useLocale'
import { usePrecipitation } from '../../../composables/usePrecipitation'
import { useRiverClimate } from '../../../composables/useRiverClimate'
import type { RegionLabel } from '../../../lib/regions'
import { forecastOutlook } from '../../../lib/river/anomaly'
import { buildChartSeries } from '../../../lib/river/chartSeries'
import { downloadCsv, stationCsv } from '../../../lib/river/csv'
import {
  formatCoordinates,
  formatDischarge,
  formatPct,
  formatYearRange,
} from '../../../lib/river/format'
import type { ChartRange } from '../../../lib/urlState'
import { useUiStore } from '../../../stores/ui'
import type { DischargeSeries, RiverNormsFile, RiversFile, StationState } from '../../../types'
import AnomalyBadge from '../../ui/AnomalyBadge.vue'
import ErrorState from '../../ui/ErrorState.vue'
import LoadingSkeleton from '../../ui/LoadingSkeleton.vue'
import OutlookBadge from '../../ui/OutlookBadge.vue'
import ChartControls from './ChartControls.vue'
import ClimateSection from './ClimateSection.vue'
import DischargeChart from './DischargeChart.vue'
import StatRow from './StatRow.vue'

/**
 * The rivers layer's station card: today's discharge against the norm, the forecast outlook,
 * the discharge chart with precipitation and CSV, and the climate section. Loaded as its own
 * chunk with Chart.js, only once a station opens.
 */
const props = defineProps<{
  state: StationState
  label: RegionLabel
  rivers: RiversFile | undefined
  norms: RiverNormsFile | undefined
  /** `undefined` while discharge is loading or after it failed. */
  series: DischargeSeries | undefined
  today: string
  status: 'pending' | 'error' | 'success'
  /** Shown when `status` is `error`. */
  errorMessage: string
}>()
const emit = defineEmits<{ close: []; retry: [] }>()

/** The short period shows 30 past days; the longer ones show 60, all the data request holds. */
const PAST_DAYS: Record<ChartRange, number> = { 30: 30, 90: 60, 210: 60 }

const ui = useUiStore()
const { locale, t } = useLocale()
const copy = computed(() => t.value.river.details)
const heading = useTemplateRef<HTMLHeadingElement>('heading')
const station = computed(() => props.state.station)
const stationNorms = computed(() => props.norms?.stations[station.value.id] ?? null)

const precipitation = usePrecipitation(station, () => ui.precip)
const precipitationError = computed(() => {
  if (!ui.precip || !precipitation.isError.value) return null
  return isRateLimited(precipitation.error.value)
    ? copy.value.precipitationRateLimited
    : copy.value.precipitationFailed
})

const climate = useRiverClimate(
  station,
  () => props.rivers,
  stationNorms,
  () => props.norms?.years,
  props.today,
)

const outlook = computed(
  () =>
    props.series &&
    stationNorms.value &&
    forecastOutlook(props.series, stationNorms.value, props.today),
)

/** Relative mode needs a median norm to divide by; without norms the chart stays in m³/s. */
const relative = computed(() => ui.mode === 'pct' && stationNorms.value !== null)

const chartSeries = computed(
  () =>
    props.series &&
    buildChartSeries(
      props.series,
      stationNorms.value,
      {
        today: props.today,
        pastDays: PAST_DAYS[ui.range],
        forecastDays: ui.range,
        relative: relative.value,
      },
      ui.precip ? (precipitation.data.value ?? null) : null,
    ),
)
const normPeriod = computed(() => (props.rivers ? formatYearRange(props.rivers.norm) : ''))

function exportCsv() {
  if (!props.series) return
  downloadCsv(
    `${station.value.id}-${props.today}.csv`,
    stationCsv(props.series, stationNorms.value),
  )
}

// The card opens beside the map; move focus so keyboard and screen-reader users follow.
onMounted(() => heading.value?.focus({ preventScroll: true }))
</script>

<template>
  <article class="space-y-5">
    <header>
      <div class="flex items-start justify-between gap-3">
        <h2
          ref="heading"
          tabindex="-1"
          class="text-xl leading-tight font-semibold tracking-tight text-ink focus-visible:outline-none"
        >
          {{ label.name }}
        </h2>
        <button
          type="button"
          :aria-label="copy.close"
          :title="copy.close"
          class="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill text-ink-muted transition-colors hover:bg-fill-strong hover:text-ink focus-ring"
          @click="emit('close')"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-3.5"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
          >
            <path stroke-width="2.5" stroke-linecap="round" d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </div>
      <p class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <span>{{ copy.basin.replace('{name}', t.river.basins[station.basin]) }}</span>
        <span
          v-if="station.focus"
          class="rounded-full bg-accent/12 px-2 text-[11px] font-medium text-accent-ink"
        >
          {{ t.river.list.focusBasin }}
        </span>
      </p>
      <p v-if="state.cell" class="mt-0.5 text-xs text-ink-muted">
        {{ copy.cell.replace('{coordinates}', formatCoordinates(state.cell, locale)) }}
      </p>
      <p v-if="label.note" class="mt-2 text-xs leading-relaxed text-ink-muted">
        {{ label.note }}
      </p>
    </header>

    <dl class="divide-y divide-line rounded-xl bg-group text-ink">
      <StatRow
        :label="copy.now"
        :value="formatDischarge(state.current, locale)"
        :unit="t.river.dischargeUnit"
      />
      <StatRow
        :label="copy.normToday"
        :value="formatDischarge(state.norm?.median ?? null, locale)"
        :unit="t.river.dischargeUnit"
      />
      <StatRow :label="copy.deviation" :value="formatPct(state.anomalyPct, locale)">
        <AnomalyBadge v-if="state.anomalyClass" :anomaly-class="state.anomalyClass" />
      </StatRow>
    </dl>

    <OutlookBadge v-if="outlook" :outlook="outlook" />

    <section class="space-y-3" aria-labelledby="chart-heading">
      <h3 id="chart-heading" class="text-[15px] font-semibold tracking-tight text-ink">
        {{ copy.chartHeading }}
      </h3>
      <ChartControls />
      <p v-if="ui.mode === 'pct' && !stationNorms" class="text-xs text-ink-muted">
        {{ copy.normsMissing }}
      </p>
      <LoadingSkeleton v-if="status === 'pending'" :label="copy.loadingChart" class="h-[260px]" />
      <ErrorState v-else-if="status === 'error'" :message="errorMessage" @retry="emit('retry')" />
      <DischargeChart
        v-else-if="chartSeries"
        :series="chartSeries"
        :today="today"
        :relative="relative"
      />
      <div
        v-else
        class="flex h-[260px] items-center justify-center rounded-xl bg-group text-sm text-ink-muted"
      >
        {{ copy.noChartData }}
      </div>
      <p v-if="precipitationError" role="status" class="text-xs text-warn-ink">
        {{ precipitationError }}
      </p>
      <button
        v-if="series"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full bg-fill px-3.5 py-1.5 text-[13px] font-medium text-accent-ink transition-colors hover:bg-fill-strong focus-ring"
        @click="exportCsv"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
        >
          <path
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4v11m-4-4l4 4 4-4M5 19h14"
          />
        </svg>
        {{ copy.exportCsv }}
      </button>
      <p class="text-xs leading-relaxed text-ink-muted">
        {{ copy.chartNote.replace('{norm}', normPeriod) }}
        <template v-if="ui.precip"> {{ copy.precipitationNote }}</template>
      </p>
    </section>

    <ClimateSection
      :periods="rivers"
      :summary="climate.summary.value"
      :this-year-failed="climate.thisYear.isError.value"
      :today="today"
    />
  </article>
</template>
