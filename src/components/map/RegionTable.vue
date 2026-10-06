<script setup lang="ts">
import { ref } from 'vue'

export interface RegionRow {
  id: string
  name: string
  /** Formatted with its unit; null when the region has no value at this step. */
  value: string | null
}

/**
 * The map as a table (SPEC §8.8): every region with its value now, for screen readers, and a
 * way to open a region without a pointer. Hidden until focus enters it, like a skip link, then
 * shown over the map so sighted keyboard users see where they are.
 */
defineProps<{
  rows: RegionRow[]
  caption: string
  regionColumn: string
  valueColumn: string
  noData: string
  selectedId: string | null
}>()
const emit = defineEmits<{ select: [id: string] }>()

const open = ref(false)

/** Focus left for somewhere outside the table, not just moved between its buttons. */
function onFocusOut(event: FocusEvent) {
  const to = event.relatedTarget
  if (!(to instanceof Node) || !(event.currentTarget as HTMLElement).contains(to))
    open.value = false
}
</script>

<template>
  <div
    :class="
      open
        ? 'glass absolute top-3 left-3 z-30 max-h-[calc(100%-1.5rem)] w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto rounded-2xl p-3 shadow-float'
        : 'sr-only'
    "
    @focusin="open = true"
    @focusout="onFocusOut"
  >
    <table class="w-full border-collapse text-left text-sm text-ink">
      <caption class="pb-2 text-left text-xs font-medium text-ink-muted">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr class="border-b border-line text-xs text-ink-muted">
          <th scope="col" class="py-1 pr-3 font-medium">{{ regionColumn }}</th>
          <th scope="col" class="py-1 text-right font-medium">{{ valueColumn }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" class="border-b border-line last:border-0">
          <th scope="row" class="py-0.5 pr-3 font-normal">
            <button
              type="button"
              class="w-full rounded px-1 py-1 text-left hover:bg-fill focus-ring-inset"
              :aria-current="row.id === selectedId ? 'true' : undefined"
              @click="emit('select', row.id)"
            >
              {{ row.name }}
            </button>
          </th>
          <td class="py-0.5 text-right whitespace-nowrap tabular-nums">
            {{ row.value ?? noData }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
