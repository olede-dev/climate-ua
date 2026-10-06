<script setup lang="ts">
import { computed, onBeforeUnmount, useTemplateRef, watch } from 'vue'

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

const props = defineProps<{
  axis: TimeAxis
  /** The projection scenario, always named next to the timeline (SPEC §1). */
  scenario: string
}>()
const step = defineModel<TimeStep>({ required: true })
const playing = defineModel<boolean>('playing', { required: true })

/** Pace of the timelapse (SPEC §8.3): a year flicks by, a period holds. */
const YEAR_MS = 150
const PERIOD_MS = 1000

const { t } = useLocale()
const track = useTemplateRef<HTMLDivElement>('track')

const steps = computed(() => axisSteps(props.axis))
const slots = computed(() => periodSlots(props.axis))
const historyEnd = computed(() => stepPosition(props.axis, props.axis.to))
const thumb = computed(() => stepPosition(props.axis, step.value))
const future = computed(() => isFuture(step.value))
const label = computed(() => (isFuture(step.value) ? formatPeriod(step.value) : String(step.value)))
const valueText = computed(() =>
  future.value ? `${label.value}, ${t.value.timeline.forecast} ${props.scenario}` : label.value,
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
  playing,
  (on) => {
    if (!on) return clearTimeout(timer)
    // From the end, start over; otherwise continue from the current step.
    if (nextStep(props.axis, step.value) === null) step.value = steps.value[0]!
    schedule()
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

/** A manual move takes over from playback. */
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
  pick(event)
}

function onPointerMove(event: PointerEvent) {
  if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) pick(event)
}

const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`
</script>

<template>
  <div
    class="glass pointer-events-auto flex items-center gap-3 rounded-2xl px-2.5 py-2 shadow-float sm:px-3"
  >
    <button
      type="button"
      class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover focus-ring"
      :aria-label="playing ? t.timeline.pause : t.timeline.play"
      :aria-pressed="playing"
      @click="playing = !playing"
    >
      <svg v-if="playing" viewBox="0 0 16 16" class="size-4" fill="currentColor" aria-hidden="true">
        <rect x="3" y="2" width="3.5" height="12" rx="1" />
        <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
      </svg>
      <svg v-else viewBox="0 0 16 16" class="size-4" fill="currentColor" aria-hidden="true">
        <path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5Z" />
      </svg>
    </button>

    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <div class="flex items-baseline justify-between gap-2">
        <p class="truncate text-sm text-ink" aria-hidden="true">
          <span class="text-base font-semibold tabular-nums">{{ label }}</span>
          <span v-if="future" class="text-ink-muted">
            · {{ t.timeline.forecast }} ({{ scenario }})</span
          >
        </p>
        <!-- On phones a future step already names the scenario on the left. -->
        <p class="shrink-0 text-[11px] text-ink-muted" :class="{ 'max-sm:hidden': future }">
          <span class="max-sm:hidden">{{ t.timeline.scenario }}</span> {{ scenario }}
        </p>
      </div>

      <!-- Observed years as one continuous track, then the future periods as separate steps. -->
      <div
        ref="track"
        class="relative h-6 touch-none rounded-full select-none focus-ring"
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
      >
        <span
          class="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-fill-strong"
          :style="{ left: 0, width: percent(historyEnd) }"
        ></span>
        <span
          class="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
          :style="{ left: 0, width: percent(Math.min(thumb, historyEnd)) }"
        ></span>
        <span
          v-for="slot in slots"
          :key="slot.period"
          class="hatch absolute top-1/2 h-3 -translate-y-1/2 rounded-full"
          :class="slot.period === step ? 'bg-accent text-white/40' : 'bg-fill-strong text-ink/25'"
          :style="{
            left: `calc(${percent(slot.start)} + 2px)`,
            width: `calc(${percent(slot.end - slot.start)} - 4px)`,
          }"
        ></span>
        <span
          class="pointer-events-none absolute top-1/2 size-4 -translate-1/2 rounded-full border-2 border-white bg-accent shadow-card transition-[left] duration-150 ease-out motion-reduce:transition-none"
          :style="{ left: percent(thumb) }"
        ></span>
      </div>

      <div
        class="relative hidden h-3.5 text-[10px] leading-none text-ink-muted tabular-nums sm:block"
      >
        <span class="absolute left-0">{{ axis.from }}</span>
        <span class="absolute -translate-x-full" :style="{ left: percent(historyEnd) }">{{
          axis.to
        }}</span>
        <span
          v-for="slot in slots"
          :key="slot.period"
          class="absolute -translate-x-1/2 whitespace-nowrap"
          :style="{ left: percent((slot.start + slot.end) / 2) }"
          >{{ formatPeriod(slot.period) }}</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Diagonal strokes on the future steps, matching the hatching on the map. */
.hatch {
  background-image: repeating-linear-gradient(-45deg, currentColor 0 1.5px, transparent 1.5px 5px);
}
</style>
