<script setup lang="ts">
import { NO_DATA_STROKE, type LegendContent } from '../../lib/river/marks'

defineProps<{ content: LegendContent }>()

function swatchStyle(color: string | null): string {
  return color
    ? `background:${color};box-shadow:0 0 0 1px ${NO_DATA_STROKE}`
    : `border:2px solid ${NO_DATA_STROKE}`
}
</script>

<template>
  <figure class="text-[11px] leading-tight">
    <figcaption class="font-semibold text-ink">{{ content.title }}</figcaption>
    <ul class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-ink sm:grid-cols-3">
      <li v-for="row in content.rows" :key="row.label" class="flex items-center gap-1.5">
        <span
          class="inline-block size-2.5 shrink-0 rounded-full"
          :style="swatchStyle(row.color)"
          aria-hidden="true"
        ></span>
        {{ row.label }}
      </li>
    </ul>
    <p v-if="content.note" class="mt-1.5 text-[10px] text-ink-muted">{{ content.note }}</p>
  </figure>
</template>
