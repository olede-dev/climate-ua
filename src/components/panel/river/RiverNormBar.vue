<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../../composables/useLocale'
import { ANOMALY_CLASSES } from '../../../lib/river/marks'
import { formatDischarge, formatYearRange } from '../../../lib/river/format'
import { normBarScale } from '../../../lib/river/normBar'
import type { AnomalyClass, RiverNormDay } from '../../../types'

/** Today's discharge on the day-of-year norm, in the look of the climate layers' `NormBar`. */
const props = defineProps<{
  norm: RiverNormDay
  current: number | null
  anomalyClass: AnomalyClass | null
  /** Label above today's marker, e.g. the date. */
  when: string
  normPeriod: { from: number; to: number } | undefined
}>()

const { locale, t } = useLocale()
const copy = computed(() => t.value.river.details.normBar)
const scale = computed(() => normBarScale(props.norm, props.current))
const pct = (value: number) => `${scale.value.at(value) * 100}%`
/** Labels stay clear of the bar's ends. */
const labelAt = (value: number) => ({
  left: `${Math.min(85, Math.max(15, scale.value.at(value) * 100))}%`,
})
const valueColor = computed(
  () => ANOMALY_CLASSES.find((c) => c.id === props.anomalyClass)?.color ?? 'var(--ui-ink)',
)
const unit = computed(() => t.value.river.dischargeUnit)
const discharge = (value: number) => formatDischarge(value, locale.value)
</script>

<template>
  <figure class="space-y-1">
    <div class="relative mx-1.5 h-4 text-[11px] text-ink-muted" aria-hidden="true">
      <span
        v-if="current !== null"
        class="absolute bottom-0 -translate-x-1/2 whitespace-nowrap"
        :style="labelAt(current)"
        >{{ when }}</span
      >
    </div>
    <div
      aria-hidden="true"
      class="relative mx-1.5 h-2 rounded-full"
      :style="{ background: scale.gradient }"
    >
      <span
        class="absolute top-1/2 h-4 w-0.5 -translate-1/2 rounded-full bg-ink"
        :style="{ left: pct(norm.median) }"
      ></span>
      <span
        v-if="current !== null"
        class="absolute top-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-white shadow-card"
        :style="{ left: pct(current), backgroundColor: valueColor }"
      ></span>
    </div>
    <div class="relative mx-1.5 h-4 text-[11px] tabular-nums" aria-hidden="true">
      <span
        class="absolute top-0.5 -translate-x-1/2 font-medium whitespace-nowrap text-ink"
        :style="labelAt(norm.median)"
        >{{ copy.usual }} {{ discharge(norm.median) }}</span
      >
    </div>
    <div
      class="flex justify-between pt-1 text-[11px] leading-tight text-ink-muted tabular-nums"
      aria-hidden="true"
    >
      <span>p10 · {{ discharge(norm.p10) }} {{ unit }}<br />{{ copy.low }}</span>
      <span class="text-right"
        >p90 · {{ discharge(norm.p90) }} {{ unit }}<br />{{ copy.high }}</span
      >
    </div>
    <details v-if="normPeriod" class="pt-1 text-[11px] leading-snug text-ink-muted">
      <summary class="cursor-pointer select-none hover:text-ink focus-ring">
        ⓘ {{ t.panel.normBar.noteToggle }}
      </summary>
      <p class="mt-1">{{ copy.note.replace('{norm}', formatYearRange(normPeriod)) }}</p>
    </details>
  </figure>
</template>
