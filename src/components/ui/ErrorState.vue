<script setup lang="ts">
import { useLocale } from '../../composables/useLocale'

defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()

const { t } = useLocale()
</script>

<template>
  <div
    role="alert"
    class="flex flex-wrap items-center gap-3 rounded-xl bg-warn-fill px-4 py-3 text-[13px] leading-4 text-warn-ink"
  >
    {{ message }}
    <button
      type="button"
      class="rounded-full bg-surface px-3 py-1 text-[13px] leading-4 font-medium text-ink shadow-card transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-group active:bg-fill-strong focus-ring pointer-coarse:min-h-11"
      @click="$emit('retry')"
    >
      {{ t.river.errors.retry }}
    </button>
  </div>
</template>
