<script setup lang="ts">
import { computed, defineAsyncComponent, h, onMounted, useTemplateRef } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import type { ValueFormat } from '../../lib/format'
import type { TimeStep } from '../../lib/time'
import type { LayerFile, RegionSeries, Sectors, WaterBand } from '../../types'
import ClimateAnalog from './ClimateAnalog.vue'
import SectorBar from './SectorBar.vue'

const props = defineProps<{
  id: string
  name: string
  /** Under the name: the oblasts a basin spans. */
  subtitle?: string | null
  /** Note that the data predate the loss of the Kakhovka Reservoir (SPEC §13.7). */
  kakhovka?: boolean
  file: LayerFile
  series: RegionSeries & { sectors?: Sectors }
  config: LayerConfig
  step: TimeStep
  format: ValueFormat
  /** What the chart measures; the legend title of the layer. */
  chartTitle: string
  /** Shown instead of the chart when every value is zero, e.g. a basin with no water gap. */
  zeroNote?: string | null
  /** The chart of a projection: the observed record, then the models' yearly mean and range. */
  projection?: {
    file: LayerFile
    series: RegionSeries
    from: number
    band: WaterBand
  } | null
}>()
defineEmits<{ close: [] }>()

const { t } = useLocale()

/** Basins blanked for having no water data (`blankEmptyBasins`) show a note, not an empty chart. */
const hasData = computed(
  () =>
    props.series.history.some((value) => value !== null) ||
    Object.keys(props.series.future).length > 0,
)

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
    <header class="flex items-start justify-between gap-3">
      <div>
        <h2
          ref="heading"
          tabindex="-1"
          class="text-xl leading-tight font-semibold tracking-tight text-ink focus-visible:outline-none"
        >
          {{ name }}
        </h2>
        <p v-if="subtitle" class="mt-1 flex items-start gap-1 text-xs leading-snug text-ink-muted">
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
      </div>
      <button
        type="button"
        :aria-label="t.panel.close"
        :title="t.panel.close"
        class="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill text-ink-muted transition-colors hover:bg-fill-strong hover:text-ink focus-ring"
        @click="$emit('close')"
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
    </header>

    <p
      v-if="kakhovka"
      role="note"
      class="flex gap-2.5 rounded-xl border-l-4 border-warn bg-warn-fill px-3 py-2.5 text-[13px] leading-relaxed text-warn-ink"
    >
      <!-- A warning triangle. -->
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
      <span>{{ t.basin.kakhovka }}</span>
    </p>

    <p v-if="!hasData" class="rounded-xl bg-fill px-4 py-6 text-center text-sm text-ink-muted">
      {{ t.tooltip.noData }}
    </p>

    <p v-else-if="allZero" class="rounded-xl bg-fill px-4 py-6 text-center text-sm text-ink-muted">
      {{ zeroNote }}
    </p>

    <figure v-else class="space-y-2">
      <figcaption class="text-sm font-medium leading-snug text-ink-muted">
        {{ chartTitle }}
      </figcaption>
      <RegionChart
        :file="projection?.file ?? file"
        :series="projection?.series ?? series"
        :projection="projection"
        :config="config"
        :step="step"
        :format="format"
        :title="chartTitle"
      />
    </figure>

    <ClimateAnalog v-if="config.geometry === 'oblasts'" :region-id="id" />

    <SectorBar v-if="hasData && series.sectors" :sectors="series.sectors" :year="file.history.to" />

  </article>
</template>
