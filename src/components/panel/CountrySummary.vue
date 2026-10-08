<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import type { Messages } from '../../i18n'
import { formatPeriod, type ValueFormat } from '../../lib/format'
import { colorAt } from '../../lib/scale'
import type { SummaryRow } from '../../lib/summary'
import type { LayerFile, LayerId } from '../../types'

/** The country at a glance (SPEC §8.2): one big number, its gap from the norm, and what the norm is. */
const props = defineProps<{
  rows: SummaryRow[]
  file: LayerFile
  config: LayerConfig
  copy: Messages['layers'][LayerId]
  format: ValueFormat
  /** Only the big number and its title: no change against the norm, no columns. */
  compact?: boolean
  /** Colours the big number; mixed with the text colour so it reads in both themes. */
  valueColor?: string | null
  /** Which row is the big number: the observed year (default) or the projection. */
  focus?: 'observed' | 'future'
  /** A line under the caption, e.g. the region's place among the rest. */
  note?: string | null
}>()

const { t } = useLocale()

const focusKind = computed(() =>
  props.focus === 'future' && props.rows.some((row) => row.kind === 'future')
    ? 'future'
    : 'observed',
)
const focused = computed(() => props.rows.find((row) => row.kind === focusKind.value))
const norm = computed(() => props.rows.find((row) => row.kind === 'norm'))

/** The focused row against the norm, signed, as the numbers are shown. */
const delta = computed(() => {
  if (focused.value?.value == null || norm.value?.value == null) return null
  const places = props.config.decimals
  const difference =
    Number(focused.value.value.toFixed(places)) - Number(norm.value.value.toFixed(places))
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

/** «Норма — середнє за 1991–2020 роки: 9,3 °C.» */
const normNote = computed(() =>
  norm.value?.value == null
    ? null
    : t.value.panel.normNote
        .replace('{period}', formatPeriod(`${props.file.norm.from}-${props.file.norm.to}`))
        .replace('{value}', props.format(norm.value.value)),
)

/** The big number's colour: the one passed, or where it sits on the map's scale. */
const bigColor = computed(
  () =>
    props.valueColor ??
    (focused.value?.mapValue == null ? null : colorAt(props.config.scale, focused.value.mapValue)),
)
</script>

<template>
  <div class="space-y-2" aria-hidden="true">
    <div>
      <p
        class="text-4xl leading-none font-semibold text-ink tabular-nums"
        :style="bigColor ? { color: `color-mix(in oklab, ${bigColor} 75%, var(--ui-ink))` } : {}"
      >
        {{ focused?.value == null ? '—' : format(focused.value) }}
      </p>
      <p class="mt-1.5 text-[13px] leading-snug text-ink-muted">{{ copy.legendTitle }}</p>
      <p v-if="note" class="mt-1 text-[13px] font-medium text-ink">{{ note }}</p>
      <p v-if="delta && !compact" class="mt-1 text-[13px] font-medium text-ink">
        {{ delta.arrow }} {{ delta.sentence }}
      </p>
    </div>

    <p v-if="normNote && !compact" class="text-xs leading-relaxed text-ink-muted">
      {{ normNote }}
    </p>
  </div>
</template>
