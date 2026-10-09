<script setup lang="ts" generic="T extends string">
import CheckMark from './CheckMark.vue'
import IconTile from './IconTile.vue'

/** A grouped list of choices; the chosen row expands to its description and the slot. */
defineProps<{
  items: readonly { id: T; name: string; about: string; icon: string; tone: string }[]
  label: string
  /** Wide content (charts) runs the full row width instead of aligning under the label. */
  flush?: boolean
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <ul class="flex flex-col overflow-hidden rounded-xl bg-group" :aria-label="label">
    <li v-for="item in items" :key="item.id" class="group/row">
      <button
        type="button"
        class="flex w-full items-center gap-2.5 pl-2.5 text-left text-[13px] text-ink transition-colors hover:bg-fill focus-ring-inset"
        :aria-expanded="model === item.id"
        @click="model = item.id"
      >
        <IconTile :path="item.icon" :tone="item.tone" />
        <span
          class="flex min-w-0 flex-1 items-center gap-2 py-2 pr-3 group-not-first/row:border-t group-not-first/row:border-line"
        >
          <span class="min-w-0 flex-1" :class="model === item.id && 'font-semibold'">{{
            item.name
          }}</span>
          <CheckMark v-if="model === item.id" />
        </span>
      </button>
      <div v-if="model === item.id" class="space-y-3 pr-3 pb-3" :class="flush ? 'pl-3' : 'pl-11'">
        <p class="text-xs leading-relaxed text-ink-muted">{{ item.about }}</p>
        <slot />
      </div>
    </li>
  </ul>
</template>
