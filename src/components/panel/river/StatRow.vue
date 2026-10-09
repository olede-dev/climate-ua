<script setup lang="ts">
defineProps<{ label: string; value: string; unit?: string }>()
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
    <dt class="text-sm text-ink-muted">{{ label }}</dt>
    <dd class="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <slot />
      <span>
        <span class="text-[15px] font-semibold tracking-tight text-ink tabular-nums">{{
          value
        }}</span>
        <span v-if="unit && value !== '—'" class="ml-1 text-sm text-ink-muted">{{ unit }}</span>
      </span>
    </dd>
  </div>
</template>
