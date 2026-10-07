<script setup lang="ts" generic="T extends string">
/** Water gap or demand, or the scenarios, as tabs over the map (the World Water Map's switch). */
defineProps<{
  /** An optional icon: an SVG path on a 16-unit grid, drawn in the given text colour. */
  views: readonly { id: T; label: string; icon?: string; tone?: string }[]
  label: string
  /** Fills its container's width as a segmented control in a panel, not a pill over the map. */
  block?: boolean
  /** Stacks the options in a column, for labels too long to share one row. */
  stacked?: boolean
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="p-1 text-[13px] font-medium"
    :class="[
      stacked ? 'flex w-full flex-col gap-0.5 rounded-xl bg-fill' : 'rounded-full',
      !stacked && (block ? 'flex w-full bg-fill' : 'glass inline-flex shadow-float'),
    ]"
  >
    <button
      v-for="view in views"
      :key="view.id"
      type="button"
      role="radio"
      :aria-checked="model === view.id"
      class="px-3.5 py-1.5 whitespace-nowrap transition-colors focus-ring"
      :class="[
        model === view.id ? 'bg-fill-strong text-ink' : 'text-ink-muted hover:text-ink',
        stacked ? 'flex items-center gap-2 rounded-lg text-left' : 'rounded-full',
        {
          'min-w-0 flex-1 truncate': block && !stacked,
          'inline-flex items-center justify-center gap-1.5': view.icon && !stacked,
        },
      ]"
      @click="model = view.id"
    >
      <svg
        v-if="view.icon"
        viewBox="0 0 16 16"
        class="-ml-0.5 inline-block size-3.5 shrink-0 align-[-2px]"
        :class="view.tone"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="view.icon" />
      </svg>
      {{ view.label }}
    </button>
  </div>
</template>
