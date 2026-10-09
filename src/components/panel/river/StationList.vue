<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../../composables/useLocale'
import { formatDischarge, formatPct } from '../../../lib/river/format'
import { ANOMALY_CLASSES, NO_DATA_STROKE } from '../../../lib/river/marks'
import type { StationState } from '../../../types'

defineProps<{ states: readonly StationState[]; selectedId: string | null }>()
const emit = defineEmits<{ select: [id: string] }>()

const { locale, t } = useLocale()
const copy = computed(() => t.value.river.list)

function names(state: StationState) {
  const { station } = state
  return locale.value === 'uk'
    ? { river: station.river, place: station.place }
    : { river: station.riverEn, place: station.placeEn }
}

function dotStyle(state: StationState): Record<string, string> {
  const color = ANOMALY_CLASSES.find((c) => c.id === state.anomalyClass)?.color
  return color ? { background: color } : { border: `2px solid ${NO_DATA_STROKE}` }
}
</script>

<template>
  <ul class="-mx-2" :aria-label="copy.listLabel">
    <li v-for="state in states" :key="state.station.id">
      <button
        type="button"
        :aria-current="selectedId === state.station.id ? 'true' : undefined"
        class="flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-fill focus-ring-inset"
        :class="{ 'bg-accent/12 hover:bg-accent/12': selectedId === state.station.id }"
        @click="emit('select', state.station.id)"
      >
        <span class="mt-1.5 size-2.5 shrink-0 rounded-full" :style="dotStyle(state)"></span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm leading-snug">
            <span class="font-medium text-ink">{{ names(state).river }}</span>
            <span class="text-ink-muted"> — {{ names(state).place }}</span>
          </span>
          <span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
            <span>{{
              state.anomalyClass ? t.river.anomalyClasses[state.anomalyClass] : copy.unknownState
            }}</span>
            <span
              v-if="state.station.focus"
              class="rounded-full bg-accent/12 px-2 font-medium text-accent-ink"
            >
              {{ copy.focusBasin }}
            </span>
          </span>
        </span>
        <span class="shrink-0 text-right tabular-nums">
          <span class="block text-sm leading-snug font-semibold text-ink">
            {{ formatPct(state.anomalyPct, locale) }}
          </span>
          <span class="mt-0.5 block text-xs whitespace-nowrap text-ink-muted">
            {{ formatDischarge(state.current, locale) }} {{ t.river.dischargeUnit }}
          </span>
        </span>
      </button>
    </li>
  </ul>
</template>
