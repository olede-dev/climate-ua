<script setup lang="ts">
import type { FuturePeriod } from '../../types'

/** The future view's timeline: one button per projection period, nothing to play. */
defineProps<{
  periods: readonly { id: FuturePeriod; label: string; note: string }[]
  label: string
  scenario: string | null
}>()
const model = defineModel<FuturePeriod>({ required: true })
</script>

<template>
  <div
    class="glass pointer-events-auto flex flex-col gap-2 rounded-2xl px-3 py-2 shadow-float sm:flex-row sm:items-center sm:gap-4"
  >
    <p class="text-sm text-ink">
      <span class="font-semibold">{{ label }}</span>
      <span v-if="scenario" class="text-ink-muted"> · {{ scenario }}</span>
    </p>
    <div role="radiogroup" :aria-label="label" class="grid grid-cols-3 gap-2 sm:ml-auto">
      <button
        v-for="period in periods"
        :key="period.id"
        type="button"
        role="radio"
        :aria-checked="model === period.id"
        class="min-w-0 rounded-xl px-2 py-1.5 text-center sm:px-4 transition-colors focus-ring"
        :class="
          model === period.id
            ? 'bg-accent text-white'
            : 'bg-fill-strong/60 text-ink hover:bg-fill-strong'
        "
        @click="model = period.id"
      >
        <span class="block text-base font-semibold tabular-nums">{{ period.label }}</span>
        <span
          class="block text-[11px] tabular-nums"
          :class="model === period.id ? 'text-white/80' : 'text-ink-muted'"
          >{{ period.note }}</span
        >
      </button>
    </div>
  </div>
</template>
