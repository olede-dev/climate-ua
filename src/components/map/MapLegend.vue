<script setup lang="ts">
defineProps<{
  /** What the colours show; read out and given as the tooltip. */
  title: string
  gradient: string
  /** Numbers at the two ends, with units. */
  min: string
  max: string
}>()
</script>

<template>
  <!-- A compact strip; the page gives it its card: numbers beside the gradient (SPEC §7). -->
  <figure class="text-[11px] leading-tight" :title="title">
    <figcaption class="sr-only">{{ title }}</figcaption>
    <div class="flex items-center gap-2 font-semibold text-ink tabular-nums">
      <span>{{ min }}</span>
      <span
        class="h-2 min-w-28 flex-1 rounded-full sm:min-w-36"
        :style="{ background: gradient }"
        aria-hidden="true"
      ></span>
      <span>{{ max }}</span>
    </div>
  </figure>
</template>
