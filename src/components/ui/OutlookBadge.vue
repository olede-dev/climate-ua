<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { formatDayMonth } from '../../lib/format'
import type { ForecastOutlook } from '../../lib/river/anomaly'
import { ANOMALY_CLASSES } from '../../lib/river/marks'

const props = defineProps<{ outlook: ForecastOutlook }>()

const { locale, t } = useLocale()
const isHigh = computed(() => props.outlook.kind === 'high')
const color = computed(
  () => ANOMALY_CLASSES.find((c) => c.id === (isHigh.value ? 'very-high' : 'very-low'))!.color!,
)
const copy = computed(() => t.value.river.details.outlook)
const detail = computed(() =>
  (isHigh.value ? copy.value.highDetail : copy.value.lowDetail).replace(
    '{date}',
    formatDayMonth(props.outlook.from, locale.value),
  ),
)
</script>

<template>
  <p class="flex items-start gap-3 rounded-xl bg-group px-3.5 py-3 text-sm">
    <span
      class="flex size-7 shrink-0 items-center justify-center rounded-full text-white"
      :style="{ background: color }"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor">
        <path
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          :d="isHigh ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'"
        />
      </svg>
    </span>
    <span>
      <span class="font-semibold text-ink">{{ isHigh ? copy.high : copy.low }}</span>
      <span class="mt-0.5 block text-xs text-ink-muted">{{ detail }}</span>
    </span>
  </p>
</template>
