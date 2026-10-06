<script setup lang="ts" generic="T extends string">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

/** A header button opening a single-choice menu (`menuitemradio`); theme and language use it. */
const props = defineProps<{
  buttonClass: string
  /** id of the menu element, for `aria-controls`. */
  menuId: string
  /** Accessible name of the menu. */
  menuLabel: string
  /** The trigger reads `<triggerLabel>: <current option>`. */
  triggerLabel: string
  options: readonly { value: T; label: string }[]
}>()
const model = defineModel<T>({ required: true })
/** `iconClass` sizes the icon: larger on the trigger than in the menu. */
defineSlots<{ icon(props: { value: T; iconClass: string; inMenu: boolean }): unknown }>()

const open = ref(false)
const root = useTemplateRef<HTMLDivElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const menu = useTemplateRef<HTMLUListElement>('menu')
const current = computed(
  () => props.options.find((o) => o.value === model.value) ?? props.options[0],
)

/** Queried in DOM order: refs collected inside `v-for` do not guarantee source order. */
function menuItems(): HTMLButtonElement[] {
  return [...(menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])]
}

function close(returnFocus: boolean) {
  open.value = false
  if (returnFocus) trigger.value?.focus()
}

function choose(value: T) {
  model.value = value
  close(true)
}

/** Arrow keys move between items; Home/End jump to the ends; Escape closes. */
function onMenuKeydown(event: KeyboardEvent) {
  const list = menuItems()
  const index = list.indexOf(document.activeElement as HTMLButtonElement)
  const next: Record<string, number> = {
    ArrowDown: (index + 1) % list.length,
    ArrowUp: (index - 1 + list.length) % list.length,
    Home: 0,
    End: list.length - 1,
  }
  if (event.key === 'Escape') close(true)
  else if (event.key === 'Tab') close(false)
  else if (event.key in next) list[next[event.key]]?.focus()
  else return
  event.preventDefault()
}

function onDocumentPointerdown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close(false)
}

watch(open, async (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerdown)
    await nextTick()
    const selected = props.options.findIndex((o) => o.value === model.value)
    menuItems()[selected]?.focus()
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerdown)
  }
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerdown))
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      :class="buttonClass"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      :aria-label="`${triggerLabel}: ${current.label}`"
      @click="open = !open"
    >
      <slot name="icon" :value="current.value" icon-class="size-[18px]" :in-menu="false" />
      <span class="hidden sm:inline">{{ current.label }}</span>
      <svg
        viewBox="0 0 24 24"
        class="hidden size-3.5 text-ink-muted sm:block"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <ul
      v-show="open"
      :id="menuId"
      ref="menu"
      role="menu"
      :aria-label="menuLabel"
      class="glass absolute right-0 z-30 mt-2 w-44 rounded-xl p-1.5 shadow-float"
      @keydown="onMenuKeydown"
    >
      <li v-for="option in options" :key="option.value" role="none">
        <button
          type="button"
          role="menuitemradio"
          :aria-checked="model === option.value"
          tabindex="-1"
          class="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink outline-none hover:bg-accent hover:text-white focus-visible:bg-accent focus-visible:text-white"
          @click="choose(option.value)"
        >
          <slot name="icon" :value="option.value" icon-class="size-4 shrink-0" :in-menu="true" />
          <span class="flex-1">{{ option.label }}</span>
          <svg
            v-if="model === option.value"
            viewBox="0 0 24 24"
            class="size-4 shrink-0 text-accent group-hover:text-white group-focus-visible:text-white"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 12l5 5 9-10" />
          </svg>
        </button>
      </li>
    </ul>
  </div>
</template>
