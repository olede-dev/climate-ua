<script setup lang="ts">
/** A collapsed "ⓘ" note for method details that would otherwise crowd the panel. */
defineProps<{ label: string }>()
</script>

<template>
  <details class="text-xs leading-relaxed text-ink-muted">
    <summary class="w-fit cursor-pointer select-none hover:text-ink focus-ring">
      ⓘ {{ label }}
    </summary>
    <div class="mt-1 space-y-1"><slot /></div>
  </details>
</template>
