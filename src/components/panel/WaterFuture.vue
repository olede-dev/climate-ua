<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { ValueFormat } from '../../lib/format'
import { valueAt } from '../../lib/series'
import { isFuture, type TimeStep } from '../../lib/time'
import { countryColor } from '../../lib/waterUse'
import type { LayerFile, RegionSeries, WaterBand, WaterScenario } from '../../types'

/** The projected water gap of Ukraine in the year on screen: a sentence, the number, the past. */
const props = defineProps<{
  file: LayerFile
  step: TimeStep
  format: ValueFormat
  scenario: WaterScenario
  /** The models' range for the country, by year from `file.history.from`. */
  band: WaterBand
  /** The observed gap of the country, for the last observed year. */
  observed: { series: RegionSeries; year: number }
}>()

const { t } = useLocale()

const year = computed(() => (isFuture(props.step) ? props.file.history.to : props.step))
const value = computed(() => valueAt(props.file.country, props.file.history, year.value)?.median)
const index = computed(() => year.value - props.file.history.from)
const range = computed(() => {
  const low = props.band.min[index.value]
  const high = props.band.max[index.value]
  return low === undefined || high === undefined
    ? null
    : t.value.waterUse.futureCard.range
        .replace('{low}', props.format(low))
        .replace('{high}', props.format(high))
})
const past = computed(() => {
  const { series, year: last } = props.observed
  const observed = series.history[series.history.length - 1]
  return observed == null
    ? null
    : t.value.waterUse.futureCard.past
        .replace('{year}', String(last))
        .replace('{value}', props.format(observed))
})
const color = computed(() =>
  value.value == null
    ? null
    : `color-mix(in oklab, ${countryColor(props.observed.series, value.value)} 75%, var(--ui-ink))`,
)
const scenario = computed(() => t.value.waterUse.scenarios[props.scenario])
</script>

<template>
  <div class="space-y-4">
    <p class="text-xs font-semibold tracking-wide text-accent-ink uppercase">
      {{ t.waterUse.future }}
    </p>
    <div v-if="value != null">
      <p class="text-[15px] leading-snug text-ink">
        {{ t.waterUse.futureCard.lead.replace('{year}', String(year)) }}
      </p>
      <p class="text-4xl font-semibold tracking-tight tabular-nums" :style="color ? { color } : {}">
        {{ format(value) }}
      </p>
      <p v-if="range" class="mt-1 text-xs text-ink-muted">{{ range }}</p>
      <p v-if="past" class="text-xs text-ink-muted">{{ past }}</p>
    </div>
    <p class="text-xs leading-relaxed text-ink-muted">
      <span class="font-semibold text-ink">{{ scenario.name }} ({{ props.scenario }}).</span>
      {{ scenario.about }}
    </p>
  </div>
</template>
