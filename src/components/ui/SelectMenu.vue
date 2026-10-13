<script setup lang="ts" generic="T extends string | number">
import { nextTick, ref, useId, useTemplateRef } from 'vue'
import CheckMark from './CheckMark.vue'

const props = defineProps<{
  options: readonly { value: T; label: string }[]
  label: string
  disabled?: boolean
  /** Renders as a row of a grouped list: the label on the left, the value on the right. */
  row?: boolean
}>()
const model = defineModel<T>({ required: true })
const open = ref(false)
const active = ref(0)
const id = useId()
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const list = useTemplateRef<HTMLUListElement>('list')
async function toggle() {
  open.value = !open.value
  if (!open.value) return
  active.value = Math.max(
    0,
    props.options.findIndex((option) => option.value === model.value),
  )
  await nextTick()
  list.value?.focus()
  reveal()
}
function reveal() {
  list.value?.children[active.value]?.scrollIntoView({ block: 'nearest' })
}
function close() {
  open.value = false
  trigger.value?.focus()
}
function choose(index: number) {
  const option = props.options[index]
  if (option) model.value = option.value
  close()
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') event.preventDefault()
    close()
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    choose(active.value)
    return
  }
  const moves: Record<string, number> = {
    ArrowDown: Math.min(props.options.length - 1, active.value + 1),
    ArrowUp: Math.max(0, active.value - 1),
    Home: 0,
    End: props.options.length - 1,
  }
  if (event.key in moves) {
    event.preventDefault()
    active.value = moves[event.key]!
    reveal()
  }
}
</script>

<template>
  <div
    :class="!row && 'relative'"
    @focusout="
      !($event.currentTarget as HTMLElement).contains($event.relatedTarget as Node) &&
      (open = false)
    "
  >
    <button
      ref="trigger"
      type="button"
      :disabled="disabled"
      :aria-label="label"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="id"
      class="flex w-full items-center justify-between gap-2 text-left text-[13px] text-ink transition-colors disabled:opacity-50"
      :class="
        row
          ? 'px-3 py-2.5 hover:bg-fill focus-ring-inset'
          : 'rounded-xl bg-group px-3 py-2 hover:bg-fill-strong focus-ring'
      "
      @click="toggle"
      @keydown.down.prevent="!open && toggle()"
    >
      <span v-if="row" class="shrink-0">{{ label }}</span>
      <span class="truncate" :class="row && 'ml-auto text-ink-muted'">{{
        options.find((option) => option.value === model)?.label ?? label
      }}</span>
      <svg
        class="size-4 shrink-0 text-ink-muted"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path d="m5 6 3-3 3 3m-6 4 3 3 3-3" />
      </svg>
    </button>
    <ul
      v-if="open"
      :id="id"
      ref="list"
      role="listbox"
      tabindex="-1"
      :aria-label="label"
      :aria-activedescendant="`${id}-${active}`"
      class="max-h-56 overflow-y-auto overscroll-contain rounded-xl bg-surface p-1 text-[13px] text-ink shadow-card focus-ring"
      :class="row ? 'mx-1.5 mb-1.5' : 'absolute top-full right-0 z-20 mt-1 w-max min-w-full'"
      @keydown="keydown"
    >
      <li
        v-for="(option, index) in options"
        :id="`${id}-${index}`"
        :key="option.value"
        role="option"
        :aria-selected="model === option.value"
        class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2"
        :class="active === index ? 'bg-fill' : ''"
        @pointermove="active = index"
        @click="choose(index)"
      >
        <span class="min-w-0 flex-1">{{ option.label }}</span>
        <CheckMark v-if="model === option.value" />
      </li>
    </ul>
  </div>
</template>
