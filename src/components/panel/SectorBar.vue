<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { formatNumber } from '../../lib/format'
import type { Sectors } from '../../types'

const props = defineProps<{
  sectors: Sectors
  /** The year the shares are for. */
  year: number
}>()

const { locale, t } = useLocale()

/**
 * Three shades of the water hue, distinct in lightness so the segments read apart without
 * colour, checked with the `dataviz` validator on both themes (`--ordinal`); each is also
 * named with its share below the bar (SPEC §8.5).
 */
const ORDER = [
  ['irrigation', '#f866a7'],
  ['domestic', '#c4457f'],
  ['industrial', '#8f3c62'],
] as const

const parts = computed(() =>
  ORDER.map(([key, color]) => ({
    key,
    color,
    name: t.value.basin[key],
    share: props.sectors[key],
    label: `${formatNumber(props.sectors[key] * 100, locale.value, { decimals: 0 })} %`,
  })),
)
</script>

<template>
  <figure class="space-y-2">
    <figcaption class="text-xs leading-snug text-ink-muted">
      {{ t.basin.sectors.replace('{year}', String(year)) }}
    </figcaption>
    <!-- A 2px gap between segments, so neighbours stay apart. -->
    <div class="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      <div
        v-for="part in parts"
        :key="part.key"
        class="h-full first:rounded-l-full last:rounded-r-full"
        :style="{ flexGrow: part.share, backgroundColor: part.color }"
      ></div>
    </div>
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      <li v-for="part in parts" :key="part.key" class="inline-flex items-center gap-1.5">
        <span class="size-2 rounded-full" :style="{ backgroundColor: part.color }"></span>
        {{ part.name }}
        <span class="font-semibold text-ink tabular-nums">{{ part.label }}</span>
      </li>
    </ul>
  </figure>
</template>
