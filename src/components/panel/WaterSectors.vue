<script setup lang="ts">
import type { WaterSector } from '../../types'
import RadioMark from '../ui/RadioMark.vue'

/**
 * The sectors as an accordion in the look of the panel's other lists: the open one lifts off the
 * group with its explanation and the summary passed in the slot, the others are one line each.
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
/** Each use in its colour of the sector bar (`SectorBar`); all uses in water blue. */
const TONES: Record<WaterSector, string> = {
  total: 'text-sky-600 dark:text-sky-400',
  irrigation: 'text-orange-500 dark:text-orange-400',
  domestic: 'text-amber-500 dark:text-amber-300',
  industrial: 'text-emerald-600 dark:text-emerald-400',
}
</script>

<template>
  <ul class="flex flex-col gap-0.5 rounded-xl bg-fill p-1" :aria-label="label">
    <li
      v-for="sector in sectors"
      :key="sector.id"
      class="rounded-lg transition-colors"
      :class="model === sector.id && 'bg-surface shadow-card ring-[1.5px] ring-accent'"
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-lg px-3.5 py-1.5 text-left text-[13px] transition-colors focus-ring"
        :class="
          model === sector.id
            ? 'font-semibold text-ink'
            : 'font-medium text-ink-muted hover:bg-fill hover:text-ink'
        "
        :aria-expanded="model === sector.id"
        @click="model = sector.id"
      >
        <svg
          class="-ml-0.5 size-3.5 shrink-0"
          :class="TONES[sector.id]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path :d="ICONS[sector.id]" />
        </svg>
        <span class="min-w-0 flex-1">{{ sector.name }}</span>
        <RadioMark :checked="model === sector.id" />
      </button>
      <div v-if="model === sector.id" class="space-y-3 px-3.5 pb-3">
        <p class="pl-5.5 text-xs leading-relaxed text-ink-muted">{{ sector.about }}</p>
        <slot />
      </div>
    </li>
  </ul>
</template>
