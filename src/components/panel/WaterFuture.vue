<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { ValueFormat } from '../../lib/format'
import { valueAt } from '../../lib/series'
import { isFuture, type TimeStep } from '../../lib/time'
import { countryColor } from '../../lib/waterUse'
import WaterTabs from '../map/WaterTabs.vue'
import type { LayerFile, RegionSeries, WaterBand, WaterBound, WaterScenario } from '../../types'

/**
 * The projected water gap of Ukraine in the year on screen: a sentence, the number, and a switch
 * between the models' lowest and highest value, which the map follows too.
 */
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

const bound = defineModel<WaterBound>('bound', { required: true })

const { t } = useLocale()

const year = computed(() => (isFuture(props.step) ? props.file.history.to : props.step))
const value = computed(() => valueAt(props.file.country, props.file.history, year.value)?.median)
const index = computed(() => year.value - props.file.history.from)
/** An arrow down or up, coloured as the map's scale: green for less gap, red for more. */
const BOUND_MARKS: Record<WaterBound, { icon: string; tone: string }> = {
  min: { icon: 'M8 2.5v11M3.5 9 8 13.5 12.5 9', tone: 'text-emerald-600 dark:text-emerald-400' },
  max: { icon: 'M8 13.5v-11M3.5 7 8 2.5 12.5 7', tone: 'text-red-600 dark:text-red-400' },
}
/** Мін and Макс, each with the models' value for the year. */
const bounds = computed(() =>
  (['min', 'max'] as const).map((id) => {
    const value = props.band[id][index.value]
    const name = t.value.waterUse.futureCard.bounds[id]
    return {
      id,
      label: value === undefined ? name : `${name} · ${props.format(value)}`,
      ...BOUND_MARKS[id],
    }
  }),
)
const color = computed(() =>
  value.value == null
    ? null
    : `color-mix(in oklab, ${countryColor(props.observed.series, value.value)} 75%, var(--ui-ink))`,
)
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
    </div>
    <div class="space-y-1.5">
      <WaterTabs v-model="bound" block :views="bounds" :label="t.waterUse.futureCard.boundsLabel" />
      <p class="text-xs leading-relaxed text-ink-muted">{{ t.waterUse.futureCard.boundsHint }}</p>
    </div>
  </div>
</template>
