<script setup lang="ts">
import { computed, defineAsyncComponent, h, onMounted, useTemplateRef } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import type { Messages } from '../../i18n'
import type { ValueFormat } from '../../lib/format'
import { colorAt } from '../../lib/scale'
import { rankAt, summaryRows } from '../../lib/summary'
import { isFuture, type TimeStep } from '../../lib/time'
import type { LayerFile, LayerId, RegionSeries, Sectors } from '../../types'
import ClimateAnalog from './ClimateAnalog.vue'
import CountrySummary from './CountrySummary.vue'
import NormBar from './NormBar.vue'
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
  /** The layer's copy, for the big number's caption. */
  copy: Messages['layers'][LayerId]
  /** The water history views: the big number alone, without the norm and projection lines. */
  compact?: boolean
  /** The split between the uses in the year on screen; the series' own split otherwise. */
  sectors?: Sectors | null
  /** Shown instead of the chart when every value is zero, e.g. a basin with no water gap. */
  zeroNote?: string | null
}>()
defineEmits<{ close: [] }>()

const { t } = useLocale()

/** Basins blanked for having no water data (`blankEmptyBasins`) show a note, not an empty chart. */
const hasData = computed(
  () =>
    props.series.history.some((value) => value !== null) ||
    Object.keys(props.series.future).length > 0,
)

/** The same summary as the country's, for this region (SPEC §8.2). */
const rows = computed(() =>
  summaryRows(
    props.file,
    props.series,
    props.step,
    props.config.headlinePeriod,
    props.config.display,
  ),
)
/** On a projection period the big number is the projection, as in the country summary. */
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

/** Climate layers draw the norm as a bar (`NormBar`) in place of the summary's two sentences. */
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
        class="mb-2 text-xs font-medium text-accent-ink hover:underline focus-ring"
        @click="$emit('close')"
      >
        ‹ {{ t.panel.back }}
      </button>
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
    </header>

    <!-- The country's summary, mirrored: big number, then what it is made of. -->
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
        :rows="rows"
        :file="file"
        :series="series"
        :config="config"
        :format="format"
        :focus="focus"
      />
      <SectorBar v-else-if="sectors && typeof step === 'number'" :sectors="sectors" :year="step" />
      <SectorBar v-else-if="series.sectors" :sectors="series.sectors" :year="file.history.to" />
    </template>

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
        :file="file"
        :series="series"
        :config="config"
        :step="step"
        :format="format"
        :title="chartTitle"
      />
    </figure>

    <ClimateAnalog v-if="climate" :region-id="id" />
  </article>
</template>
