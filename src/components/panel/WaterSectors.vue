<script setup lang="ts">
import { computed } from 'vue'

import type { WaterSector } from '../../types'
import ExpandList from '../ui/ExpandList.vue'

const props = defineProps<{
  sectors: readonly { id: WaterSector; name: string; about: string }[]
  label: string
}>()
const model = defineModel<WaterSector>({ required: true })

const ICONS: Record<WaterSector, string> = {
  total: 'M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11z',
  irrigation: 'M12 21v-9 M12 12c0-4-3-6-7-6 0 4 3 6 7 6z M12 14c0-4 3-6 7-6 0 4-3 6-7 6z M7 21h10',
  domestic: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-5h4v5',
  industrial: 'M3 20V10l5 3v-3l5 3v-3l5 3V4h3v16z M3 20h18',
}
const TONES: Record<WaterSector, string> = {
  total: 'bg-sky-500',
  irrigation: 'bg-orange-500',
  domestic: 'bg-amber-500',
  industrial: 'bg-emerald-500',
}
const items = computed(() =>
  props.sectors.map((s) => ({ ...s, icon: ICONS[s.id], tone: TONES[s.id] })),
)
</script>

<template>
  <ExpandList v-model="model" :items="items" :label="label">
    <slot />
  </ExpandList>
</template>
