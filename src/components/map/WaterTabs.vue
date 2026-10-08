<script setup lang="ts" generic="T extends string">
import RadioMark from '../ui/RadioMark.vue'

/** Water gap or demand, or the scenarios, as tabs over the map (the World Water Map's switch). */
defineProps<{
  /** An optional icon: an SVG path on a 16-unit grid, drawn in the given text colour. `about`,
   * in a stacked group, shows under the active option. */
  views: readonly { id: T; label: string; icon?: string; tone?: string; about?: string }[]
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
      class="px-3.5 py-1.5 transition-colors focus-ring"
      :class="[
        !stacked && 'whitespace-nowrap',
        // The pick reads at a glance: it lifts off the group and takes the accent ring (violet
        // while a projection is shown); the rest stay flat.
        model === view.id
          ? stacked || block
            ? 'bg-surface font-semibold text-ink shadow-card ring-[1.5px] ring-accent'
            : 'bg-fill-strong text-ink'
          : stacked
            ? 'text-ink-muted hover:bg-fill hover:text-ink'
            : 'text-ink-muted hover:text-ink',
        stacked ? 'flex items-start gap-2 rounded-lg text-left' : 'rounded-full',
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
        :class="[view.tone, { 'mt-[3px]': stacked }]"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="view.icon" />
      </svg>
      <span v-if="stacked" class="min-w-0 flex-1">
        {{ view.label }}
        <span
          v-if="view.about && model === view.id"
          class="mt-0.5 block text-xs leading-relaxed font-normal text-ink-muted"
          >{{ view.about }}</span
        >
      </span>
      <RadioMark v-if="stacked" class="mt-0.5" :checked="model === view.id" />
      <template v-else>{{ view.label }}</template>
    </button>
  </div>
</template>
