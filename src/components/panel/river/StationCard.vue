<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue'

import { isRateLimited } from '../../../api/http'
import { useLocale } from '../../../composables/useLocale'
import { usePrecipitation } from '../../../composables/usePrecipitation'
import { useRiverClimate } from '../../../composables/useRiverClimate'
import type { RegionLabel } from '../../../lib/regions'
import { formatDayMonth } from '../../../lib/format'
import { forecastOutlook } from '../../../lib/river/anomaly'
import { buildChartSeries } from '../../../lib/river/chartSeries'
import { ANOMALY_CLASSES, type RiverView } from '../../../lib/river/marks'
import {
  compareToUsual,
  formatDischarge,
  formatPct,
  formatYearRange,
} from '../../../lib/river/format'
import { plural } from '../../../lib/format'
import type { DischargeSeries, RiverNormsFile, RiversFile, StationState } from '../../../types'
import { RIVER_SPANS, type RiverSpan } from '../../../config/discharge'
import ErrorState from '../../ui/ErrorState.vue'
import InfoHint from '../../ui/InfoHint.vue'
import LoadingSkeleton from '../../ui/LoadingSkeleton.vue'
import OutlookBadge from '../../ui/OutlookBadge.vue'
import SegmentedControl from '../../ui/SegmentedControl.vue'
import ClimateSection from './ClimateSection.vue'
import DischargeChart from './DischargeChart.vue'
import PrecipitationChart from './PrecipitationChart.vue'
import RiverNormBar from './RiverNormBar.vue'

/**
 * The rivers layer's station card, laid out like the climate layers' `RegionCard`: discharge
 * on the timeline's day as the headline with its norm bar, the forecast outlook, the
 * discharge chart over the timeline's window with precipitation, then the flow trend and the
 * low-flow days as their own blocks, always shown together; the forecast view keeps only the
 * state. Loaded as its own chunk with Chart.js, only once a station opens.
 */
const props = defineProps<{
  /** The station on `date`. */
  state: StationState
  label: RegionLabel
  rivers: RiversFile | undefined
  norms: RiverNormsFile | undefined
  /** `undefined` while discharge is loading or after it failed. */
  series: DischargeSeries | undefined
  today: string
  /** The timeline's day and window, which the card follows. */
  date: string
  span: { pastDays: number; futureDays: number }
  status: 'pending' | 'error' | 'success'
  /** Shown when `status` is `error`. */
  errorMessage: string
}>()
const emit = defineEmits<{ close: []; retry: []; select: [date: string] }>()
/** The chart's window picker; without the model (the forecast view) the window is fixed. */
const spanId = defineModel<RiverSpan>('spanId')
/** The map's river view; the card shows every block, so it only tells the forecast apart. */
const view = defineModel<RiverView>('view', { required: true })
const spanOptions = computed(() =>
  (Object.keys(RIVER_SPANS) as RiverSpan[]).map((value) => ({
    value,
    label: t.value.river.timeline.spans[value],
  })),
)

const { locale, t } = useLocale()
const copy = computed(() => t.value.river.details)
const heading = useTemplateRef<HTMLHeadingElement>('heading')
const station = computed(() => props.state.station)
const stationNorms = computed(() => props.norms?.stations[station.value.id] ?? null)

const stateColor = computed(
  () => ANOMALY_CLASSES.find((c) => c.id === props.state.anomalyClass)?.color ?? null,
)
const forecast = computed(() => view.value === 'forecast')
/** The headline number in plain words: "about 4 times less water than usual on 14 October". */
const plainComparison = computed(() => {
  const { current, norm } = props.state
  const c = current !== null && norm ? compareToUsual(current, norm.median) : null
  if (!c) return null
  const words = t.value.river.compare
  const date = formatDayMonth(props.date, locale.value)
  if (c.kind === 'same') return words.same.replace('{date}', date)
  if ('times' in c) {
    const n = `${c.times}\u00a0${plural(c.times, locale.value, words.times)}`
    return words[c.kind === 'less' ? 'lessTimes' : 'moreTimes']
      .replace('{n}', n)
      .replace('{date}', date)
  }
  return words[c.kind === 'less' ? 'lessPct' : 'morePct']
    .replace('{pct}', `${c.pct}%`)
    .replace('{date}', date)
})
const precipitation = usePrecipitation(station, true)
const precipitationError = computed(() => {
  if (!precipitation.isError.value) return null
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

const chartSeries = computed(
  () =>
    props.series &&
    buildChartSeries(
      props.series,
      stationNorms.value,
      {
        today: props.today,
        pastDays: props.span.pastDays,
        forecastDays: props.span.futureDays,
      },
      precipitation.data.value ?? null,
    ),
)
const normPeriod = computed(() => (props.rivers ? formatYearRange(props.rivers.norm) : ''))

// The card opens beside the map; move focus so keyboard and screen-reader users follow.
onMounted(() => {
  heading.value?.focus({ preventScroll: true })
  // The trend and low-flow map marks had no other way back to the daily state than this card.
  if (view.value === 'trend' || view.value === 'lowFlow') view.value = 'state'
})
</script>

<template>
  <article class="space-y-4">
    <header>
      <button
        type="button"
        :aria-label="copy.close"
        class="mb-3 inline-flex items-center gap-0.5 rounded-full bg-fill py-1 pr-3 pl-1.5 text-[13px] leading-4 font-medium text-ink transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill-strong active:bg-fill-strong focus-ring pointer-coarse:min-h-11"
        @click="emit('close')"
      >
        <svg
          viewBox="0 0 16 16"
          class="size-4 shrink-0"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M10 3.5 5.5 8l4.5 4.5" />
        </svg>
        {{ t.panel.back }}
      </button>
      <h2
        ref="heading"
        tabindex="-1"
        class="text-[17px] leading-[22px] font-bold text-ink focus-visible:outline-none"
      >
        {{ label.name }}
      </h2>
      <p class="mt-1 flex items-start gap-1 text-[12px] leading-[15px] text-ink-muted">
        <svg
          viewBox="0 0 24 24"
          class="mt-px size-3.5 shrink-0"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
        <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{{ copy.basin.replace('{name}', t.river.basins[station.basin]) }}</span>
          <span
            v-if="station.focus"
            class="rounded-full bg-accent/12 px-2 text-[11px] leading-[14px] font-medium text-accent-ink"
          >
            {{ t.river.list.focusBasin }}
          </span>
        </span>
      </p>
    </header>

    <p
      v-if="label.note"
      role="note"
      class="flex gap-2.5 rounded-xl bg-warn-fill px-3 py-2.5 text-[12px] leading-[15px] text-warn-ink"
    >
      <svg
        viewBox="0 0 24 24"
        class="mt-0.5 size-4 shrink-0 text-warn"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3 2 20h20L12 3zM12 10v4M12 17h.01" />
      </svg>
      <span v-if="station.regulated" class="min-w-0 flex-1 space-y-1">
        <span class="block">{{ t.station.regulatedShort }}</span>
        <InfoHint :label="t.station.regulatedMore" class="text-warn-ink">
          <p>{{ label.note }}</p>
        </InfoHint>
      </span>
      <span v-else>{{ label.note }}</span>
    </p>

    <div class="space-y-4">
        <div>
          <div
            class="flex items-baseline gap-2.5"
            :style="
              stateColor ? { color: `color-mix(in oklab, ${stateColor} 75%, var(--ui-ink))` } : {}
            "
          >
            <p
              class="text-[26px] leading-8 font-bold tabular-nums"
              :class="!stateColor && 'text-ink'"
            >
              {{ formatDischarge(state.current, locale) }}
              <span v-if="state.current !== null" class="text-[17px] leading-[22px] font-normal">{{
                t.river.dischargeUnit
              }}</span>
            </p>
            <span
              v-if="state.anomalyPct !== null"
              class="rounded-full bg-fill px-2 py-0.5 text-[13px] leading-4 font-semibold whitespace-nowrap text-ink tabular-nums"
              >{{ formatPct(state.anomalyPct, locale) }}</span
            >
          </div>
          <p
            v-if="state.anomalyClass"
            class="mt-1 flex items-center gap-1.5 text-[13px] leading-4 font-medium text-ink"
          >
            <span
              class="size-2.5 shrink-0 rounded-full"
              :style="
                stateColor ? { background: stateColor } : { border: '2px solid currentColor' }
              "
              aria-hidden="true"
            ></span>
            {{ t.river.anomalyClasses[state.anomalyClass] }}
          </p>
          <p v-if="plainComparison" class="mt-1.5 text-[13px] leading-4 text-ink">
            {{ plainComparison }}
          </p>
        </div>

        <RiverNormBar
          v-if="state.norm"
          class="rounded-xl bg-group px-3 py-2.5"
          :norm="state.norm"
          :current="state.current"
          :anomaly-class="state.anomalyClass"
          :when="formatDayMonth(date, locale)"
          :norm-period="rivers?.norm"
        />

        <OutlookBadge v-if="outlook" :outlook="outlook" />

        <section class="space-y-3" aria-labelledby="chart-heading">
          <div class="flex flex-col items-start gap-2 px-1">
            <h3 id="chart-heading" class="text-[13px] leading-4 font-bold text-ink">
              {{ copy.chartHeading }}
            </h3>
            <SegmentedControl
              v-if="spanId"
              v-model="spanId"
              :label="t.river.timeline.spanLabel"
              :options="spanOptions"
            />
          </div>
          <LoadingSkeleton v-if="status === 'pending'" :label="copy.loadingChart" class="h-56" />
          <ErrorState
            v-else-if="status === 'error'"
            :message="errorMessage"
            @retry="emit('retry')"
          />
          <DischargeChart
            v-else-if="chartSeries"
            :series="chartSeries"
            :today="today"
            :selected="date"
            @select="emit('select', $event)"
          >
            <PrecipitationChart
              v-if="chartSeries.precipitation"
              :time="chartSeries.time"
              :values="chartSeries.precipitation"
              :today="today"
              :selected="date"
            />
          </DischargeChart>
          <div
            v-else
            class="flex h-56 items-center justify-center rounded-xl bg-group text-[13px] leading-4 text-ink-muted"
          >
            {{ copy.noChartData }}
          </div>
          <p
            v-if="precipitationError"
            role="status"
            class="text-[12px] leading-[15px] text-warn-ink"
          >
            {{ precipitationError }}
          </p>
          <InfoHint :label="copy.chartNoteToggle">
            <p>{{ copy.chartNote.replace('{norm}', normPeriod) }}</p>
            <p>{{ copy.precipitationNote }}</p>
          </InfoHint>
        </section>
    </div>

    <template v-if="!forecast">
      <ClimateSection
        v-for="part in ['trend', 'lowFlow'] as const"
        :key="part"
        class="rounded-xl bg-group px-3 py-3"
        :view="part"
        :periods="rivers"
        :summary="climate.summary.value"
        :this-year-failed="climate.thisYear.isError.value"
        :today="today"
      />
    </template>
  </article>
</template>
