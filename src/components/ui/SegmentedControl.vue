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
  <div
    role="group"
    :aria-label="label"
    class="inline-flex rounded-lg bg-fill p-0.5 pointer-coarse:flex pointer-coarse:w-full"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="model === option.value"
      class="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1 pointer-coarse:min-h-11 pointer-coarse:flex-1 text-[13px] leading-4 font-medium transition-colors duration-150 ease-out motion-reduce:transition-none focus-ring-inset"
      :class="
        model === option.value
          ? 'bg-segment text-ink shadow-card'
          : 'text-ink-muted hover:bg-fill hover:text-ink active:bg-fill-strong'
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
