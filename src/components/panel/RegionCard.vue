<script setup lang="ts">
import { computed, defineAsyncComponent, h, onMounted, useTemplateRef } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import type { LayerCopy } from '../../i18n'
import type { ValueFormat } from '../../lib/format'
import { colorAt } from '../../lib/scale'
import { rankAt, summaryRows } from '../../lib/summary'
import { isFuture, type TimeStep } from '../../lib/time'
import type { LayerFile, RegionSeries, Sectors } from '../../types'
import ClimateAnalog from './ClimateAnalog.vue'
import CountrySummary from './CountrySummary.vue'
import NormBar from './NormBar.vue'
import SectorBar from './SectorBar.vue'

const props = defineProps<{
  id: string
  name: string
  subtitle?: string | null
  note?: string | null
  file: LayerFile
  series: RegionSeries
  config: LayerConfig
  step: TimeStep
  format: ValueFormat
  chartTitle: string
  copy: LayerCopy
  compact?: boolean
  sectors?: Sectors | null
  zeroNote?: string | null
}>()
defineEmits<{ close: [] }>()

const { t } = useLocale()

const hasData = computed(
  () =>
    props.series.history.some((value) => value !== null) ||
    Object.keys(props.series.future).length > 0,
)

const rows = computed(() =>
  summaryRows(
    props.file,
    props.series,
    props.step,
    props.config.headlinePeriod,
    props.config.display,
  ),
)
const focus = computed(() => (isFuture(props.step) ? 'future' : 'observed'))
const valueColor = computed(() => {
  const mapValue = rows.value.find((row) => row.kind === focus.value)?.mapValue
  return mapValue != null ? colorAt(props.config.scale, mapValue) : null
})
const rank = computed(() => {
  const place = rankAt(props.file, props.id, props.step)
  return (
    place &&
    t.value.panel.rank.replace('{place}', String(place.place)).replace('{of}', String(place.of))
  )
})

const climate = computed(() => props.config.geometry === 'oblasts')

const allZero = computed(
  () =>
    !!props.zeroNote &&
    props.series.history.every((value) => value === null || value === 0) &&
    Object.keys(props.series.future).length === 0,
)

// Chart.js loads only once a region is opened, keeping it out of the initial bundle.
const RegionChart = defineAsyncComponent({
  loader: () => import('./RegionChart.vue'),
  loadingComponent: () =>
    h('div', {
      class: 'h-48 animate-pulse rounded-xl bg-fill',
      role: 'status',
      'aria-label': t.value.panel.loading,
    }),
  delay: 100,
})

const heading = useTemplateRef<HTMLHeadingElement>('heading')
// The card opens beside the map; move focus so keyboard and screen-reader users follow. Where
// the card sits under the map, HomeView scrolls to it, so focus must not jump the page first.
onMounted(() => heading.value?.focus({ preventScroll: true }))
</script>

<template>
  <article class="space-y-4">
    <header>
      <button
        type="button"
        :aria-label="t.panel.close"
        class="mb-3 inline-flex items-center gap-0.5 rounded-full bg-fill py-1 pr-3 pl-1.5 text-[13px] leading-4 font-medium text-ink transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill-strong active:bg-fill-strong focus-ring pointer-coarse:min-h-11"
        @click="$emit('close')"
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
        {{ name }}
      </h2>
      <p
        v-if="subtitle"
        class="mt-1 flex items-start gap-1 text-[12px] leading-[15px] text-ink-muted"
      >
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
        <span>{{ subtitle }}</span>
      </p>
    </header>

    <template v-if="hasData">
      <CountrySummary
        :rows="rows"
        :file="file"
        :config="config"
        :copy="copy"
        :format="format"
        :compact="compact || climate"
        :value-color="valueColor"
        :focus="focus"
        :note="climate ? null : rank"
        :headline="climate"
      />
      <NormBar
        v-if="climate"
        class="rounded-xl bg-group px-3 py-2.5"
        :rows="rows"
        :file="file"
        :series="series"
        :config="config"
        :format="format"
        :focus="focus"
      />
      <SectorBar
        v-else-if="sectors && typeof step === 'number'"
        :sectors="sectors"
        :year="step"
        class="rounded-xl bg-group px-3 py-2.5"
      />
    </template>

    <p
      v-if="note"
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
      <span>{{ note }}</span>
    </p>

    <p
      v-if="!hasData"
      class="rounded-xl bg-group px-4 py-6 text-center text-[13px] leading-4 text-ink-muted"
    >
      {{ t.tooltip.noData }}
    </p>

    <p
      v-else-if="allZero"
      class="rounded-xl bg-group px-4 py-6 text-center text-[13px] leading-4 text-ink-muted"
    >
      {{ zeroNote }}
    </p>

    <figure v-else class="space-y-2 rounded-xl bg-surface p-3 shadow-card">
      <figcaption class="text-[13px] leading-4 font-bold text-ink">
        {{ chartTitle }}
      </figcaption>
      <RegionChart
        :file="file"
        :series="series"
        :config="config"
        :step="step"
        :format="format"
        :title="chartTitle"
      />
    </figure>

    <!-- A history-only layer (snow) shows no Köppen projection. -->
    <ClimateAnalog v-if="climate && file.futurePeriods.length > 0" :region-id="id" />
  </article>
</template>
