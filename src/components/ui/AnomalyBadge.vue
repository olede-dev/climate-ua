<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { ANOMALY_CLASSES, NO_DATA_STROKE } from '../../lib/river/marks'
import type { AnomalyClass } from '../../types'

const props = defineProps<{ anomalyClass: AnomalyClass }>()

const { t } = useLocale()
const dotStyle = computed(() => {
  const color = ANOMALY_CLASSES.find((c) => c.id === props.anomalyClass)?.color
  return color ? { background: color } : { border: `2px solid ${NO_DATA_STROKE}` }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-xs leading-tight font-medium text-ink shadow-card"
  >
    <span class="size-2.5 shrink-0 rounded-full" :style="dotStyle"></span>
    {{ t.river.anomalyClasses[anomalyClass] }}
  </span>
</template>
