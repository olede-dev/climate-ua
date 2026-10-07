<script setup lang="ts">
import type { WaterSector } from '../../types'

/**
 * The sectors as an accordion (the World Water Map's panel): the open one holds the summary
 * passed in the slot, the others are one line each.
 */
defineProps<{
  sectors: readonly { id: WaterSector; name: string; about: string }[]
  label: string
}>()
const model = defineModel<WaterSector>({ required: true })

/** Line icons on a 24 grid: a drop for all uses, a sprout, a house, a factory. */
const ICONS: Record<WaterSector, string> = {
  total: 'M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11z',
  irrigation: 'M12 21v-9 M12 12c0-4-3-6-7-6 0 4 3 6 7 6z M12 14c0-4 3-6 7-6 0 4-3 6-7 6z M7 21h10',
  domestic: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-5h4v5',
  industrial: 'M3 20V10l5 3v-3l5 3v-3l5 3V4h3v16z M3 20h18',
}
</script>

<template>
  <ul class="divide-y divide-line border-y border-line" :aria-label="label">
    <li v-for="sector in sectors" :key="sector.id">
      <button
        type="button"
        class="flex w-full items-center justify-between py-2.5 text-left text-xs font-medium tracking-wide uppercase transition-colors focus-ring"
        :class="model === sector.id ? 'text-ink' : 'text-ink-muted hover:text-ink'"
        :aria-expanded="model === sector.id"
        @click="model = sector.id"
      >
        <span class="inline-flex items-center gap-2">
          <svg
            class="size-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="ICONS[sector.id]" />
          </svg>
          {{ sector.name }}
        </span>
        <span
          class="inline-block transition-transform"
          :class="{ 'rotate-90': model === sector.id }"
          aria-hidden="true"
          >›</span
        >
      </button>
      <div v-if="model === sector.id" class="space-y-3 pb-4">
        <slot />
        <p class="text-xs leading-relaxed text-ink-muted">{{ sector.about }}</p>
      </div>
    </li>
  </ul>
</template>
