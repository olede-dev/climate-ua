<script setup lang="ts">
import { computed, onMounted, useTemplateRef, type FunctionalComponent } from 'vue'

import { isRateLimited } from '../../../api/http'
import { useLocale } from '../../../composables/useLocale'
import { usePrecipitation } from '../../../composables/usePrecipitation'
import { useRiverClimate } from '../../../composables/useRiverClimate'
import type { RegionLabel } from '../../../lib/regions'
import { formatDayMonth } from '../../../lib/format'
import { forecastOutlook } from '../../../lib/river/anomaly'
import { buildChartSeries } from '../../../lib/river/chartSeries'
import { ANOMALY_CLASSES, isDailyView, type RiverView } from '../../../lib/river/marks'
import { formatDischarge, formatPct, formatYearRange } from '../../../lib/river/format'
import type { DischargeSeries, RiverNormsFile, RiversFile, StationState } from '../../../types'
import { RIVER_SPANS, type RiverSpan } from '../../../config/discharge'
import ErrorState from '../../ui/ErrorState.vue'
import ExpandList from '../../ui/ExpandList.vue'
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
 * discharge chart over the timeline's window with precipitation. The trend and low-flow views
 * swap all of that for their part of the climate section; the views are
 * picked from a list in the card, which the forecast view skips. Loaded as its own
 * chunk with Chart.js, only once a station opens.
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
/** The map's river view, picked here from the list; the forecast view has no row and shows bare. */
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
const daily = computed(() => isDailyView(view.value))

const VIEW_ICONS: Record<ListedView, { icon: string; tone: string }> = {
  state: { icon: 'M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11z', tone: 'bg-sky-500' },
  trend: { icon: 'M3 17l6-6 4 4 8-8 M15 7h6v6', tone: 'bg-violet-500' },
  lowFlow: { icon: 'M4 20h16 M6 20v-4 M10 20v-8 M14 20v-6 M18 20v-11', tone: 'bg-orange-500' },
}
type ListedView = Exclude<RiverView, 'forecast'>
const viewItems = computed(() =>
  (Object.keys(VIEW_ICONS) as ListedView[]).map((id) => ({
    id,
    name: t.value.river.views[id],
    about: t.value.river.viewsAbout[id],
    ...VIEW_ICONS[id],
  })),
)
const Bare: FunctionalComponent = (_, { slots }) => slots.default?.()
Bare.inheritAttrs = false
/** Inside the list the blocks sit on its grouped row, so they drop their own inset. */
const listed = computed(() => view.value !== 'forecast')
const viewList = computed(() => (listed.value ? ExpandList : Bare))
const precipitation = usePrecipitation(station, daily)
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
onMounted(() => heading.value?.focus({ preventScroll: true }))
</script>

<template>
  <article class="space-y-4">
    <header>
      <button
        type="button"
        :aria-label="copy.close"
        class="mb-3 inline-flex items-center gap-0.5 rounded-full bg-fill py-1 pr-3 pl-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-fill-strong focus-ring"
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
        class="text-[22px] leading-tight font-bold tracking-tight text-ink focus-visible:outline-none"
      >
        {{ label.name }}
      </h2>
      <p class="mt-1 flex items-start gap-1 text-xs leading-snug text-ink-muted">
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
            class="rounded-full bg-accent/12 px-2 text-[11px] font-medium text-accent-ink"
          >
            {{ t.river.list.focusBasin }}
          </span>
        </span>
      </p>
    </header>

    <p
      v-if="label.note"
      role="note"
      class="flex gap-2.5 rounded-xl border-l-4 border-warn bg-warn-fill px-3 py-2.5 text-[13px] leading-relaxed text-warn-ink"
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
      <span>{{ label.note }}</span>
    </p>

    <component :is="viewList" v-model="view" flush :items="viewItems" :label="t.river.viewsLabel">
      <div v-if="daily" class="space-y-4">
        <div>
          <div
            class="flex items-baseline gap-2.5"
            :style="
              stateColor ? { color: `color-mix(in oklab, ${stateColor} 75%, var(--ui-ink))` } : {}
            "
          >
            <p
              class="text-4xl leading-none font-semibold tabular-nums"
              :class="!stateColor && 'text-ink'"
            >
              {{ formatDischarge(state.current, locale) }}
              <span v-if="state.current !== null" class="text-xl">{{ t.river.dischargeUnit }}</span>
            </p>
            <span
              v-if="state.anomalyPct !== null"
              class="rounded-full bg-fill px-2 py-0.5 text-sm font-semibold whitespace-nowrap text-ink tabular-nums"
              >{{ formatPct(state.anomalyPct, locale) }}</span
            >
          </div>
          <p
            v-if="state.anomalyClass"
            class="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-ink"
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
        </div>

        <RiverNormBar
          v-if="state.norm"
          :class="!listed && 'rounded-xl bg-group px-3 py-2.5'"
          :norm="state.norm"
          :current="state.current"
          :anomaly-class="state.anomalyClass"
          :when="formatDayMonth(date, locale)"
          :norm-period="rivers?.norm"
        />

        <OutlookBadge v-if="outlook" :outlook="outlook" :flat="listed" />

        <section class="space-y-3" aria-labelledby="chart-heading">
          <div class="flex flex-col items-start gap-2" :class="!listed && 'px-1'">
            <h3 id="chart-heading" class="text-[13px] leading-snug font-semibold text-ink">
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
            class="flex h-56 items-center justify-center rounded-xl bg-group text-sm text-ink-muted"
          >
            {{ copy.noChartData }}
          </div>
          <p v-if="precipitationError" role="status" class="text-xs text-warn-ink">
            {{ precipitationError }}
          </p>
          <InfoHint :label="copy.chartNoteToggle">
            <p>{{ copy.chartNote.replace('{norm}', normPeriod) }}</p>
            <p>{{ copy.precipitationNote }}</p>
          </InfoHint>
        </section>
      </div>
      <ClimateSection
        v-else
        :view="view === 'trend' ? 'trend' : 'lowFlow'"
        :periods="rivers"
        :summary="climate.summary.value"
        :this-year-failed="climate.thisYear.isError.value"
        :today="today"
      />
    </component>
  </article>
</template>
