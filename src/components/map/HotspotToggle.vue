<script setup lang="ts">
/** Switch for the water hotspots (SPEC §8.1), beside the zoom buttons. */
defineProps<{
  label: string
  /** What the switch shows, for its tooltip. */
  hint: string
}>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="model"
    :title="hint"
    class="glass inline-flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-2.5 text-[13px] font-medium shadow-float transition-colors focus-ring"
    :class="model ? 'text-ink' : 'text-ink-muted hover:text-ink'"
    @click="model = !model"
  >
    <span
      class="relative inline-flex size-3 items-center justify-center rounded-full"
      :class="model ? 'bg-[#ff99c9]' : 'border border-current'"
      aria-hidden="true"
    >
      <span
        v-if="model"
        class="absolute size-3 motion-safe:animate-ping rounded-full bg-[#ff99c9]/60"
      ></span>
    </span>
    {{ label }}
  </button>
</template>
