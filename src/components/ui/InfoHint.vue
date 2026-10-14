<script setup lang="ts">
/** A collapsed disclosure note for method details that would otherwise crowd the panel. */
defineProps<{ label: string }>()
</script>

<template>
  <details class="group/hint text-[12px] leading-[15px] text-ink-muted">
    <summary
      class="flex w-fit cursor-pointer list-none items-center gap-1 rounded-md select-none pointer-coarse:min-h-11 transition-colors duration-150 ease-out motion-reduce:transition-none hover:text-ink focus-ring [&::-webkit-details-marker]:hidden"
    >
      <svg
        viewBox="0 0 16 16"
        class="size-3 shrink-0 transition-transform duration-150 ease-out group-open/hint:rotate-90 motion-reduce:transition-none"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path d="m6 3.5 4.5 4.5L6 12.5" />
      </svg>
      {{ label }}
    </summary>
    <div class="mt-1 space-y-1"><slot /></div>
  </details>
</template>
