<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'

defineEmits<{ in: []; out: [] }>()

const { t } = useLocale()
const actions = computed(() => [
  { event: 'in', label: t.value.home.zoomIn, icon: 'M8 3v10M3 8h10' },
  { event: 'out', label: t.value.home.zoomOut, icon: 'M3 8h10' },
])
</script>

<template>
  <div
    class="glass pointer-events-auto flex w-12 shrink-0 flex-col rounded-full p-1 shadow-float sm:w-11"
    role="group"
    :aria-label="t.home.zoom"
  >
    <div class="flex flex-col gap-0.5 rounded-full bg-fill p-0.5">
      <button
        v-for="action in actions"
        :key="action.event"
        type="button"
        class="flex size-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill-strong active:bg-segment active:shadow-card focus-ring-inset sm:size-8"
        :aria-label="action.label"
        :title="action.label"
        @click="action.event === 'in' ? $emit('in') : $emit('out')"
      >
        <svg
          viewBox="0 0 16 16"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path :d="action.icon" />
        </svg>
      </button>
    </div>
  </div>
</template>
