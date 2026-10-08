<script setup lang="ts">
defineProps<{ checked: boolean }>()
</script>

<template>
  <!-- A radio mark, so a list reads as one choice among several; the row carries the semantics. -->
  <span
    class="flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]"
    :class="checked ? 'border-accent bg-accent' : 'border-ink-muted/50'"
    aria-hidden="true"
  >
    <span v-if="checked" class="size-1.5 rounded-full bg-white"></span>
  </span>
</template>
