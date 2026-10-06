<script setup lang="ts">
defineProps<{
  title: string
  gradient: string
  /** Words under the two ends, e.g. «Холодніше» / «Тепліше». */
  low: string
  high: string
  /** Numbers at the two ends, with units. */
  min: string
  max: string
  /** Label under the middle of a diverging scale. */
  middle?: string
}>()
</script>

<template>
  <!-- Horizontal gradient with words and numbers at the ends (SPEC §7). -->
  <div>
    <p class="text-xs leading-snug font-medium text-ink">{{ title }}</p>
    <div class="mt-2 h-2 rounded-full" :style="{ background: gradient }" aria-hidden="true"></div>
    <div class="mt-1 grid grid-cols-3 text-[11px] leading-tight text-ink-muted">
      <span>
        <span class="block font-semibold text-ink tabular-nums">{{ min }}</span>
        {{ low }}
      </span>
      <span class="self-end text-center">{{ middle }}</span>
      <span class="text-right">
        <span class="block font-semibold text-ink tabular-nums">{{ max }}</span>
        {{ high }}
      </span>
    </div>
  </div>
</template>
