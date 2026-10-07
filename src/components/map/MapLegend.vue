<script setup lang="ts">
defineProps<{
  /** What the colours show; read out and given as the tooltip. */
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
  <!-- A compact strip on the map: numbers beside the gradient, words under it (SPEC §7). -->
  <figure class="glass rounded-xl px-3 py-2 text-[11px] leading-tight shadow-float" :title="title">
    <figcaption class="sr-only">{{ title }}</figcaption>
    <div class="flex items-center gap-2 font-semibold text-ink tabular-nums">
      <span>{{ min }}</span>
      <span
        class="h-2 w-28 rounded-full sm:w-36"
        :style="{ background: gradient }"
        aria-hidden="true"
      ></span>
      <span>{{ max }}</span>
    </div>
    <div class="mt-0.5 flex justify-between gap-2 text-[10px] text-ink-muted">
      <span>{{ low }}</span>
      <span v-if="middle">{{ middle }}</span>
      <span class="text-right">{{ high }}</span>
    </div>
  </figure>
</template>
