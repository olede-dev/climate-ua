<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import type { Messages } from '../../i18n'
import { plural, type ValueFormat } from '../../lib/format'
import { regionStory, summaryStory, type StoryInput } from '../../lib/narrative'
import type { RegionLabel } from '../../lib/regions'
import { cssGradient } from '../../lib/scale'
import { isFuture, type TimeStep } from '../../lib/time'
import type { LayerFile, LayerId } from '../../types'
import { RichText } from '../ui/RichText'
import LayerLegend from './LayerLegend.vue'
import RegionCard from './RegionCard.vue'

const props = defineProps<{
  file: LayerFile
  config: LayerConfig
  copy: Messages['layers'][LayerId]
  step: TimeStep
  format: ValueFormat
  /** The open region; null shows the summary for all of Ukraine (SPEC §8.2). */
  region: (RegionLabel & { id: string }) | null
}>()
const emit = defineEmits<{ close: [] }>()

const { locale, t } = useLocale()

function story(where: string, series: StoryInput['series']): StoryInput {
  return {
    file: props.file,
    series,
    step: props.step,
    headline: props.config.headlinePeriod,
    where,
    layerCopy: props.copy.story,
    copy: t.value.story,
    format: props.format,
    decimals: props.config.decimals,
  }
}

const summary = computed(() => summaryStory(story(t.value.story.country, props.file.country)))
const regionSeries = computed(() =>
  props.region ? props.file.regions[props.region.id] : undefined,
)
const card = computed(() =>
  props.region && regionSeries.value
    ? regionStory(story(props.region.where, regionSeries.value))
    : null,
)

/** Which year or period the summary is about, above it. */
const when = computed(() => {
  const year = isFuture(props.step) ? props.file.history.to : props.step
  return `${t.value.panel.country} · ${year}`
})

const futureNote = computed(() => {
  const models = props.file.models
  if (models === undefined) return props.copy.futureNote
  const counted = plural(models, locale.value, props.copy.models).replace('{n}', String(models))
  return props.copy.futureNote.replace('{models}', counted)
})

const legend = computed(() => {
  const stops = props.config.scale.stops
  const signed = props.config.display === 'anomaly'
  // Whole-number ends read as round marks: «30 днів», not «30,0 дня».
  const end = (value: number) =>
    props.format(value, { signed, decimals: Number.isInteger(value) ? 0 : undefined })
  return {
    gradient: cssGradient(props.config.scale),
    min: end(stops[0]![0]),
    max: end(stops[stops.length - 1]![0]),
  }
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.region) emit('close')
}
</script>

<template>
  <aside class="flex flex-col" :aria-label="t.home.panel" @keydown="onKeydown">
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <RegionCard
        v-if="region && regionSeries && card"
        :key="region.id"
        :name="region.name"
        :subtitle="region.subtitle"
        :kakhovka="region.kakhovka"
        :story="card"
        :file="file"
        :series="regionSeries"
        :config="config"
        :step="step"
        :format="format"
        :chart-title="copy.chartTitle"
        @close="emit('close')"
      />
      <div v-else class="space-y-3">
        <h2 class="text-xs font-medium text-ink-muted tabular-nums">{{ when }}</h2>
        <p class="text-lg leading-snug text-ink sm:text-xl"><RichText :text="summary" /></p>
        <p class="text-[13px] leading-relaxed text-ink-muted">
          {{ t.scenarios[file.scenario] }}
          <template v-if="futureNote"> {{ futureNote }}</template>
        </p>
        <p class="text-[13px] leading-relaxed text-ink-muted">
          {{ file.geometry === 'basins' ? t.panel.pickBasin : t.panel.pickRegion }}
        </p>
      </div>
    </div>
    <LayerLegend
      class="shrink-0 border-t border-line px-4 py-3"
      :title="copy.legendTitle"
      :gradient="legend.gradient"
      :low="copy.low"
      :high="copy.high"
      :min="legend.min"
      :max="legend.max"
      :middle="config.display === 'anomaly' ? copy.norm : undefined"
    />
  </aside>
</template>
