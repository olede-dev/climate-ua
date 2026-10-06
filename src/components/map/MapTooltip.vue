<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'

const props = defineProps<{
  /** Pointer position in the map container's pixels. */
  x: number
  y: number
  name: string
  /** Time step, e.g. `1987` or `2041–2060 · прогноз`. */
  when: string
  /** Headline value; null shows `noData`. */
  value: string | null
  noData: string
  /** Smaller lines under the value. */
  details: string[]
  gradient: string
  /** Marker on the mini scale, 0–1; null hides it. */
  position: number | null
}>()

/** Gap between the pointer and the card. */
const OFFSET = 14
const card = useTemplateRef<HTMLDivElement>('card')

// The card opens away from the nearer edges so it stays inside the map.
const style = computed(() => {
  const parent = card.value?.offsetParent as HTMLElement | null | undefined
  const width = parent?.clientWidth ?? Infinity
  const height = parent?.clientHeight ?? Infinity
  const left = props.x > width / 2
  const up = props.y > height / 2
  return {
    left: `${props.x}px`,
    top: `${props.y}px`,
    transform: `translate(${left ? `calc(-100% - ${OFFSET}px)` : `${OFFSET}px`}, ${
      up ? `calc(-100% - ${OFFSET}px)` : `${OFFSET}px`
    })`,
  }
})
</script>

<template>
  <div
    ref="card"
    class="glass pointer-events-none absolute z-20 w-60 rounded-xl px-3.5 py-3 shadow-float"
    :style="style"
    role="status"
  >
    <p class="text-[13px] leading-tight font-semibold text-ink">{{ name }}</p>
    <p class="mt-0.5 text-[11px] text-ink-muted">{{ when }}</p>
    <p
      class="mt-1.5 leading-none font-semibold tabular-nums text-ink"
      :class="value === null ? 'text-sm' : 'text-[28px]'"
    >
      {{ value ?? noData }}
    </p>
    <p v-for="line in details" :key="line" class="mt-1 text-[11px] text-ink-muted tabular-nums">
      {{ line }}
    </p>
    <div class="relative mt-2.5 h-1.5 rounded-full" :style="{ background: gradient }">
      <span
        v-if="position !== null"
        class="absolute top-1/2 size-3 -translate-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
        :style="{ left: `${position * 100}%` }"
      ></span>
    </div>
  </div>
</template>
