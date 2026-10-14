<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    /** A glass pill floating over the map; otherwise an inline row in the page flow. */
    floating?: boolean
  }>(),
  { floating: false },
)
</script>

<template>
  <div
    role="status"
    class="loading flex items-center gap-2 text-[12px] leading-[15px] text-ink"
    :class="floating ? 'glass rounded-full px-3 py-2 shadow-float' : 'py-1'"
  >
    <span
      class="loading-spinner size-4 shrink-0 rounded-full border-2 border-fill border-t-accent"
      aria-hidden="true"
    />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
/* Fast loads finish before it appears, so the indicator never just flashes. */
.loading {
  opacity: 0;
  animation: loading-in 200ms ease-out 300ms forwards;
}
.loading-spinner {
  animation: loading-turn 1s linear infinite;
}
@keyframes loading-in {
  to {
    opacity: 1;
  }
}
@keyframes loading-turn {
  to {
    transform: rotate(1turn);
  }
}
@media (prefers-reduced-motion: reduce) {
  .loading {
    animation: loading-in 0s 300ms forwards;
  }
  .loading-spinner {
    animation: none;
  }
}
</style>
