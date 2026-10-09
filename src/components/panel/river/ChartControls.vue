<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../../composables/useLocale'
import { CHART_RANGES, type ChartMode } from '../../../lib/urlState'
import { useUiStore } from '../../../stores/ui'
import SegmentedControl from '../../ui/SegmentedControl.vue'

const ui = useUiStore()
const { t } = useLocale()

const rangeOptions = computed(() =>
  CHART_RANGES.map((value) => ({ value, label: t.value.river.chart.ranges[value] })),
)
const modeOptions = computed((): { value: ChartMode; label: string }[] => [
  { value: 'abs', label: t.value.river.dischargeUnit },
  { value: 'pct', label: t.value.river.chart.pctOfNorm },
])
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <SegmentedControl
      v-model="ui.range"
      :label="t.river.chart.rangeLabel"
      :options="rangeOptions"
    />
    <SegmentedControl v-model="ui.mode" :label="t.river.chart.modeLabel" :options="modeOptions" />
    <button
      type="button"
      :aria-pressed="ui.precip"
      class="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium transition-colors focus-ring"
      :class="
        ui.precip
          ? 'bg-accent text-white hover:bg-accent-hover'
          : 'bg-fill text-ink-muted hover:bg-fill-strong hover:text-ink'
      "
      @click="ui.precip = !ui.precip"
    >
      <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true" fill="none" stroke="currentColor">
        <path
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9a4 4 0 0 1 0 8M9 21l1-2M13 21l1-2M17 21l1-2"
        />
      </svg>
      {{ t.river.chart.precipitationToggle }}
    </button>
  </div>
</template>
