<script setup lang="ts">
import { NO_DATA_STROKE } from '../../lib/river/marks'

defineProps<{
  title: string
  gradient: string
  min: string
  max: string
  /** Names of a stepped scale's steps, left to right, shown on hover over each step. */
  steps?: string[]
  /** Small print under the bar. */
  note?: string
  /** Label of an outline swatch for places without data. */
  noData?: string | null
}>()
</script>

<template>
  <figure class="text-[11px] leading-tight" :title="title">
    <figcaption class="sr-only">{{ title }}</figcaption>
    <div class="flex items-center gap-2 font-semibold text-ink tabular-nums">
      <span>{{ min }}</span>
      <span
        class="flex h-2 min-w-28 flex-1 overflow-hidden rounded-full sm:min-w-36"
        :style="{ background: gradient }"
      >
        <span v-for="step in steps" :key="step" class="h-full flex-1" :title="step"></span>
      </span>
      <span>{{ max }}</span>
      <span
        v-if="noData"
        class="ml-1 flex shrink-0 items-center gap-1 font-normal text-ink-muted"
        :title="noData"
      >
        <span
          class="inline-block size-2 rounded-full"
          :style="{ border: `1.5px solid ${NO_DATA_STROKE}` }"
          aria-hidden="true"
        ></span>
        <span class="hidden sm:inline">{{ noData }}</span>
      </span>
    </div>
    <ul v-if="steps" class="sr-only">
      <li v-for="step in steps" :key="step">{{ step }}</li>
    </ul>
    <p v-if="note" class="mt-1 text-[10px] text-ink-muted">{{ note }}</p>
  </figure>
</template>
