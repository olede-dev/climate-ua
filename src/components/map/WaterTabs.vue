<script setup lang="ts" generic="T extends string">
import CheckMark from '../ui/CheckMark.vue'
import IconTile from '../ui/IconTile.vue'

defineProps<{
  views: readonly { id: T; label: string; icon?: string; tone?: string; about?: string }[]
  label: string
  stacked?: boolean
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    v-if="stacked"
    role="radiogroup"
    :aria-label="label"
    class="flex w-full flex-col overflow-hidden rounded-xl bg-group text-[13px]"
  >
    <button
      v-for="view in views"
      :key="view.id"
      type="button"
      role="radio"
      :aria-checked="model === view.id"
      class="group/row flex items-start gap-2.5 pl-2.5 text-left text-ink transition-colors hover:bg-fill focus-ring-inset"
      @click="model = view.id"
    >
      <IconTile
        v-if="view.icon"
        class="mt-1.5"
        :path="view.icon"
        :tone="view.tone ?? 'bg-gray-500'"
        :grid="16"
      />
      <span
        class="flex min-w-0 flex-1 items-start gap-2 py-2 pr-3 group-not-first/row:border-t group-not-first/row:border-line"
      >
        <span class="min-w-0 flex-1 pt-px" :class="model === view.id && 'font-semibold'">
          {{ view.label }}
          <span
            v-if="view.about && model === view.id"
            class="mt-0.5 block text-xs leading-relaxed font-normal text-ink-muted"
            >{{ view.about }}</span
          >
        </span>
        <CheckMark v-if="model === view.id" class="mt-0.5" />
      </span>
    </button>
  </div>
  <div
    v-else
    role="radiogroup"
    :aria-label="label"
    class="flex w-full rounded-[9px] bg-fill p-0.5 text-[13px] font-medium"
  >
    <button
      v-for="view in views"
      :key="view.id"
      type="button"
      role="radio"
      :aria-checked="model === view.id"
      class="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-[7px] px-3 py-1 whitespace-nowrap transition-colors focus-ring"
      :class="
        model === view.id
          ? 'bg-surface text-ink shadow-[0_0_0_0.5px_rgb(0_0_0/0.04),0_1px_3px_rgb(0_0_0/0.12)] dark:bg-[#636366]'
          : 'text-ink-muted hover:text-ink'
      "
      @click="model = view.id"
    >
      <svg
        v-if="view.icon"
        viewBox="0 0 16 16"
        class="-ml-0.5 size-3.5 shrink-0"
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
