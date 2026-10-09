<script setup lang="ts">
defineProps<{
  title: string
  gradient: string
  min: string
  max: string
}>()
</script>

<template>
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
