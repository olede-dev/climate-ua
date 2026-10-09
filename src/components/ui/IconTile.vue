<script setup lang="ts">
/**
 * A white line glyph on a coloured rounded square, as the rows of the macOS settings lists.
 * `tone` is the tile's background class; `grid` is the path's coordinate grid.
 */
withDefaults(defineProps<{ path: string; tone: string; grid?: 16 | 24; size?: 'sm' | 'lg' }>(), {
  grid: 24,
  size: 'sm',
})
</script>

<template>
  <span
    class="flex shrink-0 items-center justify-center text-white shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.08)]"
    :class="[tone, size === 'lg' ? 'size-8 rounded-[9px]' : 'size-6 rounded-[7px]']"
    aria-hidden="true"
  >
    <svg
      :class="size === 'lg' ? 'size-5' : 'size-4'"
      :viewBox="`0 0 ${grid} ${grid}`"
      fill="none"
      stroke="currentColor"
      :stroke-width="grid === 16 ? 1.6 : 2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path :d="path" />
    </svg>
  </span>
</template>
