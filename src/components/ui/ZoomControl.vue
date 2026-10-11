<script setup lang="ts">
import { useLocale } from '../../composables/useLocale'

defineEmits<{ in: []; out: [] }>()

const { t } = useLocale()
</script>

<template>
  <div
    class="glass pointer-events-auto flex w-9 shrink-0 flex-col overflow-hidden rounded-full shadow-float"
    role="group"
    :aria-label="t.home.zoom"
  >
    <button
      type="button"
      class="flex h-9 items-center justify-center text-ink transition-colors hover:bg-fill-strong focus-ring"
      :aria-label="t.home.zoomIn"
      :title="t.home.zoomIn"
      @click="$emit('in')"
    >
      <svg
        viewBox="0 0 16 16"
        class="size-4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M8 3v10M3 8h10" />
      </svg>
    </button>
    <span class="mx-2 h-px bg-ink/10" aria-hidden="true" />
    <button
      type="button"
      class="flex h-9 items-center justify-center text-ink transition-colors hover:bg-fill-strong focus-ring"
      :aria-label="t.home.zoomOut"
      :title="t.home.zoomOut"
      @click="$emit('out')"
    >
      <svg
        viewBox="0 0 16 16"
        class="size-4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M3 8h10" />
      </svg>
    </button>
  </div>
</template>
