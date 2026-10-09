<script setup lang="ts">
import { computed, ref } from 'vue'

import { useLocale } from '../../../composables/useLocale'
import { formatDischarge, formatPct } from '../../../lib/river/format'
import { ANOMALY_CLASSES, NO_DATA_STROKE } from '../../../lib/river/marks'
import type { StationState } from '../../../types'
import SelectMenu from '../../ui/SelectMenu.vue'

const props = defineProps<{ states: readonly StationState[]; selectedId: string | null }>()
const emit = defineEmits<{ select: [id: string] }>()

type SortKey = 'name' | 'current' | 'pct' | 'class'
type SortDirection = 'asc' | 'desc'

const SORT_KEYS: readonly SortKey[] = ['pct', 'current', 'class', 'name']

const { locale, t } = useLocale()
const copy = computed(() => t.value.river.list)
const sortKey = ref<SortKey>('pct')
const sortDirection = ref<SortDirection>('desc')

const sortOptions = computed(() =>
  SORT_KEYS.map((value) => ({ value, label: copy.value.sort[value] })),
)
const nameCollator = computed(() => new Intl.Collator(locale.value))

function names(state: StationState) {
  const { station } = state
  return locale.value === 'uk'
    ? { river: station.river, place: station.place }
    : { river: station.riverEn, place: station.placeEn }
}

function sortValue(state: StationState, key: SortKey): string | number | null {
  switch (key) {
    case 'name': {
      const { river, place } = names(state)
      return `${river} ${place}`
    }
    case 'current':
      return state.current
    case 'pct':
      return state.anomalyPct
    case 'class':
      // Missing values sort last, like the other keys.
      return state.anomalyClass && state.anomalyClass !== 'no-data'
        ? ANOMALY_CLASSES.findIndex((c) => c.id === state.anomalyClass)
        : null
  }
}

/** Compares two sort values; missing values always go last, whatever the direction. */
function compare(a: string | number | null, b: string | number | null, sign: number): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  if (typeof a === 'string' && typeof b === 'string') return sign * nameCollator.value.compare(a, b)
  return sign * (Number(a) - Number(b))
}

const rows = computed(() => {
  const sign = sortDirection.value === 'asc' ? 1 : -1
  return [...props.states].sort((a, b) =>
    compare(sortValue(a, sortKey.value), sortValue(b, sortKey.value), sign),
  )
})

/** Names read alphabetically by default; numbers start from the largest. */
function onSortKeyChange(key: SortKey) {
  sortDirection.value = key === 'name' ? 'asc' : 'desc'
}

function toggleDirection() {
  sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
}

function dotStyle(state: StationState): Record<string, string> {
  const color = ANOMALY_CLASSES.find((c) => c.id === state.anomalyClass)?.color
  return color ? { background: color } : { border: `2px solid ${NO_DATA_STROKE}` }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2 text-[13px] text-ink-muted">
      <span id="station-sort-label" class="shrink-0">{{ copy.sortBy }}</span>
      <SelectMenu
        v-model="sortKey"
        labelledby="station-sort-label"
        :options="sortOptions"
        @update:model-value="onSortKeyChange"
      />
      <button
        type="button"
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-fill text-ink transition-colors hover:bg-fill-strong focus-ring"
        :aria-label="sortDirection === 'asc' ? copy.ascending : copy.descending"
        :title="sortDirection === 'asc' ? copy.ascending : copy.descending"
        @click="toggleDirection"
      >
        <span aria-hidden="true">{{ sortDirection === 'asc' ? '↑' : '↓' }}</span>
      </button>
    </div>

    <ul class="-mx-2" :aria-label="copy.listLabel">
      <li v-for="state in rows" :key="state.station.id">
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
            <span
              class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted"
            >
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
  </div>
</template>
