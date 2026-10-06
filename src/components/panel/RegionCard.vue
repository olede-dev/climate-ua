<script setup lang="ts">
import { defineAsyncComponent, h, onMounted, useTemplateRef } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import type { ValueFormat } from '../../lib/format'
import type { Rich } from '../../lib/narrative'
import type { TimeStep } from '../../lib/time'
import type { LayerFile, RegionSeries, Sectors } from '../../types'
import { RichText } from '../ui/RichText'
import ClimateAnalog from './ClimateAnalog.vue'
import SectorBar from './SectorBar.vue'

defineProps<{
  id: string
  name: string
  /** Under the name: the oblasts a basin spans. */
  subtitle?: string | null
  /** Note that the data predate the loss of the Kakhovka Reservoir (SPEC §13.7). */
  kakhovka?: boolean
  story: Rich
  file: LayerFile
  series: RegionSeries & { sectors?: Sectors }
  config: LayerConfig
  step: TimeStep
  format: ValueFormat
  /** What the chart measures; the legend title of the layer. */
  chartTitle: string
}>()
defineEmits<{ close: [] }>()

const { t } = useLocale()

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
        <p v-if="subtitle" class="mt-1 text-xs leading-snug text-ink-muted">{{ subtitle }}</p>
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

    <p class="text-[15px] leading-relaxed text-ink"><RichText :text="story" /></p>

    <figure class="space-y-2">
      <figcaption class="text-xs leading-snug text-ink-muted">{{ chartTitle }}</figcaption>
      <RegionChart
        :file="file"
        :series="series"
        :config="config"
        :step="step"
        :format="format"
        :title="chartTitle"
      />
    </figure>

    <ClimateAnalog v-if="config.geometry === 'oblasts'" :region-id="id" />

    <SectorBar v-if="series.sectors" :sectors="series.sectors" :year="file.history.to" />

    <p v-if="kakhovka" class="text-[13px] leading-relaxed text-ink-muted">
      {{ t.basin.kakhovka }}
    </p>
  </article>
</template>
