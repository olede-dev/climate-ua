<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import type { Messages } from '../../i18n'
import { formatPeriod, type ValueFormat } from '../../lib/format'
import { colorAt } from '../../lib/scale'
import type { SummaryRow } from '../../lib/summary'
import type { LayerFile, LayerId } from '../../types'

/** The country at a glance (SPEC §8.2): one big number, then norm, now and projection on the scale. */
const props = defineProps<{
  rows: SummaryRow[]
  file: LayerFile
  config: LayerConfig
  copy: Messages['layers'][LayerId]
  format: ValueFormat
}>()

const { t } = useLocale()

const observed = computed(() => props.rows.find((row) => row.kind === 'observed'))
const norm = computed(() => props.rows.find((row) => row.kind === 'norm'))

/** The observed year against the norm, signed, as the numbers are shown. */
const delta = computed(() => {
  if (observed.value?.value == null || norm.value?.value == null) return null
  const places = props.config.decimals
  const difference =
    Number(observed.value.value.toFixed(places)) - Number(norm.value.value.toFixed(places))
  const text = props.format(Math.abs(difference))
  if (text === props.format(0)) return null
  const up = difference > 0
  return {
    arrow: up ? '↑' : '↓',
    sentence: (up ? t.value.panel.moreThanUsual : t.value.panel.lessThanUsual).replace(
      '{delta}',
      text,
    ),
  }
})

/** Three columns, past to future: what is usual, the year on screen, the projection. */
const columns = computed(() =>
  props.rows.map((row) => ({
    kind: row.kind,
    title:
      row.kind === 'norm'
        ? t.value.panel.usual
        : row.kind === 'future'
          ? formatPeriod(String(row.when))
          : String(row.when),
    note:
      row.kind === 'norm'
        ? formatPeriod(`${props.file.norm.from}-${props.file.norm.to}`)
        : row.kind === 'future'
          ? t.value.timeline.forecast
          : t.value.panel.now,
    text: row.value === null ? '—' : props.format(row.value),
    color: row.mapValue === null ? null : colorAt(props.config.scale, row.mapValue),
  })),
)
</script>

<template>
  <div class="space-y-4" aria-hidden="true">
    <div>
      <p class="text-4xl leading-none font-semibold text-ink tabular-nums">
        {{ columns[1]?.text }}
      </p>
      <p class="mt-1.5 text-[13px] leading-snug text-ink-muted">{{ copy.legendTitle }}</p>
      <p v-if="delta" class="mt-1 text-[13px] font-medium text-ink">
        {{ delta.arrow }} {{ delta.sentence }}
      </p>
    </div>

    <!-- Usual, now, then: the same number three times, coloured as on the map. -->
    <ol class="grid grid-cols-3 gap-2">
      <li
        v-for="column in columns"
        :key="column.kind"
        class="rounded-xl bg-fill-strong/60 p-2"
        :class="{ 'ring-2 ring-accent': column.kind === 'observed' }"
      >
        <span
          class="mb-1.5 block h-1.5 rounded-full"
          :style="{ background: column.color ?? 'transparent' }"
        ></span>
        <span class="block text-base font-semibold text-ink tabular-nums">{{ column.text }}</span>
        <span class="block text-xs font-medium text-ink">{{ column.title }}</span>
        <span class="block text-[11px] text-ink-muted">{{ column.note }}</span>
      </li>
    </ol>
  </div>
</template>
