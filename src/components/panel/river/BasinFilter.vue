<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../../composables/useLocale'
import type { BasinFilter } from '../../../lib/urlState'
import type { RiverBasin } from '../../../types'

const props = defineProps<{ basins: readonly RiverBasin[] }>()
const model = defineModel<BasinFilter>({ required: true })

const { t } = useLocale()
const options = computed((): { id: BasinFilter; label: string }[] => [
  { id: 'all', label: t.value.river.list.allBasins },
  ...props.basins.map((id) => ({ id, label: t.value.river.basins[id] })),
])
</script>

<template>
  <div role="group" :aria-label="t.river.list.basin" class="flex flex-wrap gap-1.5">
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      :aria-pressed="model === option.id"
      class="rounded-full px-3 py-1 text-[13px] leading-4 font-medium transition-colors duration-150 ease-out motion-reduce:transition-none focus-ring pointer-coarse:min-h-11"
      :class="
        model === option.id
          ? 'bg-accent text-white'
          : 'bg-fill text-ink hover:bg-fill-strong active:bg-fill-strong'
      "
      @click="model = option.id"
    >
      {{ option.label }}
    </button>
  </div>
</template>
