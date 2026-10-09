<script setup lang="ts">
import type { WaterSector } from '../../types'
import CheckMark from '../ui/CheckMark.vue'
import IconTile from '../ui/IconTile.vue'

defineProps<{
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
</script>

<template>
  <ul class="flex flex-col overflow-hidden rounded-xl bg-group" :aria-label="label">
    <li v-for="sector in sectors" :key="sector.id" class="group/row">
      <button
        type="button"
        class="flex w-full items-center gap-2.5 pl-2.5 text-left text-[13px] text-ink transition-colors hover:bg-fill focus-ring-inset"
        :aria-expanded="model === sector.id"
        @click="model = sector.id"
      >
        <IconTile :path="ICONS[sector.id]" :tone="TONES[sector.id]" />
        <span
          class="flex min-w-0 flex-1 items-center gap-2 py-2 pr-3 group-not-first/row:border-t group-not-first/row:border-line"
        >
          <span class="min-w-0 flex-1" :class="model === sector.id && 'font-semibold'">{{
            sector.name
          }}</span>
          <CheckMark v-if="model === sector.id" />
        </span>
      </button>
      <div v-if="model === sector.id" class="space-y-3 pr-3 pb-3 pl-11">
        <p class="text-xs leading-relaxed text-ink-muted">{{ sector.about }}</p>
        <slot />
      </div>
    </li>
  </ul>
</template>
