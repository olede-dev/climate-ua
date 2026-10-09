<script setup lang="ts" generic="T extends string | number">
defineProps<{
  /** Accessible name of the group. */
  label: string
  /** `icon` is the `d` of a 24×24 stroked path drawn before the label; the narrowest phones drop it. */
  options: readonly { value: T; label: string; icon?: string }[]
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div role="group" :aria-label="label" class="inline-flex rounded-[10px] bg-fill p-0.5">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="model === option.value"
      class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[13px] font-medium transition-colors focus-ring-inset"
      :class="
        model === option.value
          ? 'bg-surface text-ink shadow-card dark:bg-white/20'
          : 'text-ink-muted hover:text-ink'
      "
      @click="model = option.value"
    >
      <svg
        v-if="option.icon"
        viewBox="0 0 24 24"
        class="hidden size-3.5 shrink-0 min-[360px]:block"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
      >
        <path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :d="option.icon" />
      </svg>
      {{ option.label }}
    </button>
  </div>
</template>
