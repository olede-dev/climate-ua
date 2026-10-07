<script setup lang="ts" generic="T extends string">
/** Water gap or demand, or the scenarios, as tabs over the map (the World Water Map's switch). */
defineProps<{
  views: readonly { id: T; label: string }[]
  label: string
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="glass inline-flex rounded-full p-1 text-[13px] font-medium shadow-float"
  >
    <button
      v-for="view in views"
      :key="view.id"
      type="button"
      role="radio"
      :aria-checked="model === view.id"
      class="rounded-full px-3.5 py-1.5 whitespace-nowrap transition-colors focus-ring"
      :class="model === view.id ? 'bg-fill-strong text-ink' : 'text-ink-muted hover:text-ink'"
      @click="model = view.id"
    >
      {{ view.label }}
    </button>
  </div>
</template>
