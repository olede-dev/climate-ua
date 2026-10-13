<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { formatPeriod } from '../../lib/format'
import {
  axisSteps,
  isFuture,
  nextStep,
  periodSlots,
  prevStep,
  stepAtPosition,
  stepPosition,
  type TimeAxis,
  type TimeStep,
} from '../../lib/time'

const props = withDefaults(
  defineProps<{
    axis: TimeAxis
    allowPlayback?: boolean
  }>(),
  { allowPlayback: true },
)
const step = defineModel<TimeStep>({ required: true })
const playing = defineModel<boolean>('playing', { required: true })

const YEAR_MS = 150
const PERIOD_MS = 1000

const { t } = useLocale()
const track = useTemplateRef<HTMLDivElement>('track')

const steps = computed(() => axisSteps(props.axis))
const slots = computed(() => periodSlots(props.axis))
const thumb = computed(() => stepPosition(props.axis, step.value))
const future = computed(() => isFuture(step.value))
const label = computed(() => (isFuture(step.value) ? formatPeriod(step.value) : String(step.value)))
const valueText = computed(() =>
  future.value ? `${label.value}, ${t.value.timeline.forecast}` : label.value,
)

let timer: ReturnType<typeof setTimeout> | undefined

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(
    () => {
      const next = nextStep(props.axis, step.value)
      if (next === null) {
        playing.value = false
        return
      }
      step.value = next
      schedule()
    },
    isFuture(step.value) ? PERIOD_MS : YEAR_MS,
  )
}

watch(
  [playing, () => props.allowPlayback],
  ([on, allowed]) => {
    if (!allowed) {
      clearTimeout(timer)
      playing.value = false
      return
    }
    if (!on) return clearTimeout(timer)
    if (nextStep(props.axis, step.value) === null) step.value = steps.value[0]!
    schedule()
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

function moveTo(target: TimeStep | null) {
  playing.value = false
  if (target !== null) step.value = target
}

function onKeydown(event: KeyboardEvent) {
  const all = steps.value
  const targets: Record<string, TimeStep | null> = {
    ArrowLeft: prevStep(props.axis, step.value),
    ArrowDown: prevStep(props.axis, step.value),
    ArrowRight: nextStep(props.axis, step.value),
    ArrowUp: nextStep(props.axis, step.value),
    Home: all[0] ?? null,
    End: all[all.length - 1] ?? null,
  }
  if (!(event.key in targets)) return
  event.preventDefault()
  moveTo(targets[event.key] ?? null)
}

function pick(event: PointerEvent) {
  const rect = track.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return
  moveTo(stepAtPosition(props.axis, (event.clientX - rect.left) / rect.width))
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  pick(event)
}

function onPointerMove(event: PointerEvent) {
  onHover(event)
  if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) pick(event)
}

const hoverAt = ref<number | null>(null)
const dragging = ref(false)
const stepName = (target: TimeStep) => (isFuture(target) ? formatPeriod(target) : String(target))
const preview = computed(() => {
  if (hoverAt.value === null || dragging.value) return null
  const target = stepAtPosition(props.axis, hoverAt.value)
  return { label: stepName(target), at: stepPosition(props.axis, target) }
})
const decades = computed(() => {
  const out: { year: number; at: number }[] = []
  for (let year = Math.ceil(props.axis.from / 10) * 10; year <= props.axis.to; year += 10) {
    out.push({ year, at: stepPosition(props.axis, year) })
  }
  return out
})
const labelled = computed(() => {
  const every = props.axis.to - props.axis.from > 50 ? 20 : 10
  return decades.value.filter((tick) => tick.year % every === 0)
})
const years = computed(() => {
  const out: { year: number; at: number; decade: boolean }[] = []
  for (let year = props.axis.from; year <= props.axis.to; year++) {
    out.push({ year, at: stepPosition(props.axis, year), decade: year % 10 === 0 })
  }
  return out
})
const periodsOnly = computed(() => props.axis.to < props.axis.from)
const prev = computed(() => prevStep(props.axis, step.value))
const next = computed(() => nextStep(props.axis, step.value))

function onHover(event: PointerEvent) {
  const rect = track.value?.getBoundingClientRect()
  if (!rect || rect.width === 0 || event.pointerType === 'touch') return
  hoverAt.value = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}

const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`
</script>

<template>
  <div class="glass pointer-events-auto rounded-2xl p-2.5 shadow-float sm:px-3.5 sm:py-3">
    <div class="flex items-center gap-3">
      <div
        v-if="allowPlayback || !periodsOnly"
        class="flex shrink-0 items-center rounded-full bg-fill p-0.5"
        role="group"
        :aria-label="t.timeline.label"
      >
        <button
          v-if="!periodsOnly"
          type="button"
          class="flex size-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill-strong focus-ring-inset disabled:text-ink-muted disabled:opacity-40 sm:size-8"
          :aria-label="t.timeline.prev"
          :disabled="prev === null"
          @click="moveTo(prev)"
        >
          <svg viewBox="0 0 16 16" class="size-4" fill="currentColor" aria-hidden="true">
            <path
              d="M2 8.87a1 1 0 0 1 0-1.74l5.5-3.3A1 1 0 0 1 9 4.7v6.6a1 1 0 0 1-1.5.86L2 8.87Z"
            />
            <path
              d="M8 8.87a1 1 0 0 1 0-1.74l5.5-3.3A1 1 0 0 1 15 4.7v6.6a1 1 0 0 1-1.5.86L8 8.87Z"
            />
          </svg>
        </button>
        <button
          v-if="allowPlayback"
          type="button"
          class="flex size-9 items-center justify-center rounded-full bg-segment text-ink shadow-card transition-colors hover:text-accent-ink focus-ring-inset sm:size-8"
          :aria-label="playing ? t.timeline.pause : t.timeline.play"
          :aria-pressed="playing"
          @click="playing = !playing"
        >
          <svg
            v-if="playing"
            viewBox="0 0 16 16"
            class="size-3.5"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="3" y="2" width="3.5" height="12" rx="1" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
          </svg>
          <svg v-else viewBox="0 0 16 16" class="size-3.5" fill="currentColor" aria-hidden="true">
            <path d="M3 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 3 2.5Z" />
          </svg>
        </button>
        <button
          v-if="!periodsOnly"
          type="button"
          class="flex size-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill-strong focus-ring-inset disabled:text-ink-muted disabled:opacity-40 sm:size-8"
          :aria-label="t.timeline.next"
          :disabled="next === null"
          @click="moveTo(next)"
        >
          <svg viewBox="0 0 16 16" class="size-4" fill="currentColor" aria-hidden="true">
            <path
              d="M14 8.87a1 1 0 0 0 0-1.74l-5.5-3.3A1 1 0 0 0 7 4.7v6.6a1 1 0 0 0 1.5.86L14 8.87Z"
            />
            <path
              d="M8 8.87a1 1 0 0 0 0-1.74l-5.5-3.3A1 1 0 0 0 1 4.7v6.6a1 1 0 0 0 1.5.86L8 8.87Z"
            />
          </svg>
        </button>
      </div>

      <div class="flex min-w-0 items-baseline gap-2" aria-live="off">
        <span class="text-[22px] leading-[26px] font-bold tracking-tight tabular-nums">{{
          label
        }}</span>
        <span
          v-if="future"
          class="rounded-full bg-future/12 px-2 py-0.5 text-[11px] leading-[14px] font-semibold text-future"
          >{{ t.timeline.forecast }}</span
        >
      </div>
    </div>

    <div
      v-if="periodsOnly"
      class="mt-2.5 flex rounded-[10px] bg-fill p-0.5"
      role="radiogroup"
      :aria-label="t.timeline.label"
    >
      <button
        v-for="period in axis.periods"
        :key="period"
        type="button"
        role="radio"
        class="min-w-0 flex-1 truncate rounded-lg px-1 py-1 text-[12px] font-semibold tabular-nums transition-colors focus-ring-inset"
        :class="
          period === step ? 'bg-segment text-ink shadow-card' : 'text-ink-muted hover:text-ink'
        "
        :aria-checked="period === step"
        @click="moveTo(period)"
      >
        {{ formatPeriod(period) }}
      </button>
    </div>

    <div v-else class="mt-2">
      <div
        ref="track"
        class="relative h-7 touch-none rounded-md select-none focus-ring"
        role="slider"
        tabindex="0"
        :aria-label="t.timeline.label"
        :aria-valuemin="0"
        :aria-valuemax="steps.length - 1"
        :aria-valuenow="steps.indexOf(step)"
        :aria-valuetext="valueText"
        @keydown="onKeydown"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="dragging = false"
        @pointercancel="dragging = false"
        @pointerleave="hoverAt = null"
      >
        <span
          v-for="tick in years"
          :key="tick.year"
          class="pointer-events-none absolute bottom-0 w-px -translate-x-1/2"
          :class="[
            tick.decade ? 'h-3.5' : 'h-2',
            tick.at <= thumb ? 'bg-accent' : tick.decade ? 'bg-ink/35' : 'bg-ink/15',
          ]"
          :style="{ left: percent(tick.at) }"
        ></span>
        <span
          v-for="slot in slots"
          :key="slot.period"
          class="pointer-events-none absolute inset-y-0.5 flex items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold whitespace-nowrap tabular-nums transition-colors"
          :class="slot.period === step ? 'bg-accent text-white' : 'bg-fill text-ink-muted'"
          :style="{
            left: `calc(${percent(slot.start)} + 3px)`,
            width: `calc(${percent(slot.end - slot.start)} - 6px)`,
          }"
          ><span class="hidden truncate px-1 sm:inline">{{ formatPeriod(slot.period) }}</span></span
        >
        <template v-if="preview">
          <span
            class="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-ink/40"
            :style="{ left: percent(preview.at) }"
          ></span>
          <span
            class="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-canvas tabular-nums"
            :style="{ left: percent(preview.at) }"
            >{{ preview.label }}</span
          >
        </template>
        <span
          v-if="!future"
          class="pointer-events-none absolute -inset-y-0.5 w-[3px] -translate-x-1/2 rounded-full bg-accent shadow-[0_0_0_2px_var(--ui-glass)] transition-[left] duration-150 ease-out motion-reduce:transition-none"
          :class="{ 'w-1': dragging }"
          :style="{ left: percent(thumb) }"
        ></span>
      </div>

      <div
        class="relative mt-1 hidden h-3 text-[10px] leading-none text-ink-muted tabular-nums sm:block"
      >
        <span
          v-for="tick in labelled"
          :key="tick.year"
          class="absolute -translate-x-1/2"
          :style="{ left: percent(tick.at) }"
          >{{ tick.year }}</span
        >
      </div>
    </div>

    <div v-if="$slots.default" class="mt-2.5 border-t border-line pt-2.5">
      <slot />
    </div>
  </div>
</template>
