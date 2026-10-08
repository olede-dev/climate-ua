<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import { formatPeriod, type ValueFormat } from '../../lib/format'
import { colorAt } from '../../lib/scale'
import type { SummaryRow } from '../../lib/summary'
import type { LayerFile, RegionSeries } from '../../types'

/**
 * The big number against the norm, drawn instead of told: a track over the region's whole
 * record in the map's colours, a tick at the norm and a dot at the value on screen.
 */
const props = defineProps<{
  rows: SummaryRow[]
  file: LayerFile
  series: RegionSeries
  config: LayerConfig
  format: ValueFormat
  focus: 'observed' | 'future'
}>()

const { t } = useLocale()

const norm = computed(() => props.series.norm)
const shown = computed(
  () =>
    props.rows.find((row) => row.kind === props.focus) ??
    props.rows.find((row) => row.kind === 'observed'),
)

/** The record's span, widened to take the norm and the value on screen (a projection may leave it). */
const span = computed(() => {
  const values = props.series.history.filter((value): value is number => value !== null)
  const value = shown.value?.value
  if (value != null) values.push(value)
  values.push(norm.value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  return { low, high: high > low ? high : low + 1 }
})
const at = (value: number) =>
  `${((value - span.value.low) / (span.value.high - span.value.low)) * 100}%`
const toMap = (value: number) => (props.config.display === 'anomaly' ? value - norm.value : value)

/** The map's colours along the track, so the bar reads as a slice of the legend. */
const gradient = computed(() => {
  const { low, high } = span.value
  const stops = Array.from({ length: 9 }, (_, i) => {
    const value = low + ((high - low) * i) / 8
    return `${colorAt(props.config.scale, toMap(value))} ${i * 12.5}%`
  })
  return `linear-gradient(to right, ${stops.join(', ')})`
})

const delta = computed(() => {
  const value = shown.value?.value
  if (value == null) return null
  const places = props.config.decimals
  const difference = Number(value.toFixed(places)) - Number(norm.value.toFixed(places))
  const text = props.format(Math.abs(difference))
  if (text === props.format(0)) return t.value.panel.normBar.same
  return `${difference > 0 ? '↑' : '↓'} ${(difference > 0
    ? t.value.panel.normBar.more
    : t.value.panel.normBar.less
  ).replace('{delta}', text)}`
})
const when = computed(() => {
  const step = shown.value?.when
  return step == null ? '' : typeof step === 'number' ? String(step) : formatPeriod(step)
})
const valueColor = computed(() => {
  const mapValue = shown.value?.mapValue
  return mapValue == null ? null : colorAt(props.config.scale, mapValue)
})
/** A marker's label, kept inside the bar's ends. */
const labelAt = (value: number) => {
  const share = (value - span.value.low) / (span.value.high - span.value.low)
  return { left: `${Math.min(85, Math.max(15, share * 100))}%` }
}
</script>

<template>
  <figure v-if="shown?.value != null" class="space-y-1" aria-hidden="true">
    <p
      class="text-[13px] font-medium text-ink"
      :style="valueColor ? { color: `color-mix(in oklab, ${valueColor} 75%, var(--ui-ink))` } : {}"
    >
      {{ delta }}
    </p>
    <div class="relative mx-1.5 h-4 text-[11px] text-ink-muted">
      <span class="absolute bottom-0 -translate-x-1/2" :style="labelAt(shown.value)">{{
        when
      }}</span>
    </div>
    <div class="relative mx-1.5 h-2 rounded-full" :style="{ background: gradient }">
      <span
        class="absolute top-1/2 h-4 w-0.5 -translate-1/2 rounded-full bg-ink"
        :style="{ left: at(norm) }"
      ></span>
      <span
        class="absolute top-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-white shadow-card"
        :style="{ left: at(shown.value), backgroundColor: valueColor ?? 'var(--ui-ink)' }"
      ></span>
    </div>
    <div class="relative mx-1.5 h-4 text-[11px] text-ink-muted tabular-nums">
      <span class="absolute top-0.5 left-0">{{ t.panel.normBar.min }} {{ format(span.low) }}</span>
      <span class="absolute top-0.5 right-0"
        >{{ t.panel.normBar.max }} {{ format(span.high) }}</span
      >
    </div>
    <div class="relative mx-1.5 h-4 text-[11px] tabular-nums">
      <span
        class="absolute top-0 -translate-x-1/2 font-medium whitespace-nowrap text-ink"
        :style="labelAt(norm)"
        >{{ t.panel.normBar.usual }} {{ format(norm) }}</span
      >
    </div>
    <p class="pt-1 text-[11px] leading-snug text-ink-muted">
      {{
        t.panel.normBar.note
          .replace('{norm}', formatPeriod(`${file.norm.from}-${file.norm.to}`))
          .replace('{record}', `${file.history.from}–${file.history.to}`)
      }}
    </p>
  </figure>
</template>
