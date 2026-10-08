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

const props = defineProps<{
  axis: TimeAxis
  /** The projection scenario, always named next to the timeline (SPEC §1); null: none. */
  scenario: string | null
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
  dragging.value = true
  pick(event)
}

function onPointerMove(event: PointerEvent) {
  onHover(event)
  if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) pick(event)
}

/** Where the pointer hovers over the track, 0 to 1; null when it is elsewhere. */
const hoverAt = ref<number | null>(null)
const dragging = ref(false)
const stepName = (target: TimeStep) => (isFuture(target) ? formatPeriod(target) : String(target))
/** The step under the pointer, named above the track before a click. */
const preview = computed(() => {
  if (hoverAt.value === null || dragging.value) return null
  const target = stepAtPosition(props.axis, hoverAt.value)
  return { label: stepName(target), at: stepPosition(props.axis, target) }
})
/** A tick every decade of the observed years. */
const decades = computed(() => {
  const out: { year: number; at: number }[] = []
  for (let year = Math.ceil(props.axis.from / 10) * 10; year <= props.axis.to; year += 10) {
    out.push({ year, at: stepPosition(props.axis, year) })
  }
  return out
})
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
  <div class="glass pointer-events-auto rounded-2xl px-2.5 py-2 shadow-float sm:px-3">
    <!-- Something read with the timeline, such as the map's legend. -->
    <slot />
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover focus-ring"
        :aria-label="playing ? t.timeline.pause : t.timeline.play"
        :aria-pressed="playing"
        @click="playing = !playing"
      >
        <svg
          v-if="playing"
          viewBox="0 0 16 16"
          class="size-4"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="3" y="2" width="3.5" height="12" rx="1" />
          <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
        </svg>
        <svg v-else viewBox="0 0 16 16" class="size-4" fill="currentColor" aria-hidden="true">
          <path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5Z" />
        </svg>
      </button>

      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-2">
          <p class="flex min-w-0 items-center gap-1.5 truncate text-sm text-ink" aria-hidden="true">
            <button
              type="button"
              tabindex="-1"
              class="flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-strong text-ink transition-colors hover:bg-accent hover:text-white disabled:opacity-30 disabled:hover:bg-fill-strong disabled:hover:text-ink"
              :disabled="prev === null"
              @click="moveTo(prev)"
            >
              <svg
                viewBox="0 0 16 16"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2.25"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M10 3.5 5.5 8l4.5 4.5" />
              </svg>
            </button>
            <span class="min-w-[3.5rem] text-center text-base font-semibold tabular-nums">{{
              label
            }}</span>
            <button
              type="button"
              tabindex="-1"
              class="flex size-7 shrink-0 items-center justify-center rounded-full bg-fill-strong text-ink transition-colors hover:bg-accent hover:text-white disabled:opacity-30 disabled:hover:bg-fill-strong disabled:hover:text-ink"
              :disabled="next === null"
              @click="moveTo(next)"
            >
              <svg
                viewBox="0 0 16 16"
                class="size-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2.25"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M6 3.5 10.5 8 6 12.5" />
              </svg>
            </button>
            <span v-if="future" class="text-ink-muted">
              · {{ t.timeline.forecast }} ({{ scenario }})</span
            >
          </p>
          <!-- On phones a future step already names the scenario on the left. -->
          <p
            v-if="scenario"
            class="shrink-0 text-[11px] text-ink-muted"
            :class="{ 'max-sm:hidden': future }"
          >
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
          @pointerup="dragging = false"
          @pointercancel="dragging = false"
          @pointerleave="hoverAt = null"
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
          <!-- A tick every decade, so a year can be found by eye. -->
          <span
            v-for="tick in decades"
            :key="tick.year"
            class="pointer-events-none absolute top-1/2 h-2.5 w-px -translate-1/2 bg-ink/30"
            :style="{ left: percent(tick.at) }"
          ></span>
          <!-- The step a click would pick. -->
          <template v-if="preview">
            <span
              class="pointer-events-none absolute top-1/2 size-2.5 -translate-1/2 rounded-full bg-ink/50"
              :style="{ left: percent(preview.at) }"
            ></span>
            <span
              class="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-canvas tabular-nums"
              :style="{ left: percent(preview.at) }"
              >{{ preview.label }}</span
            >
          </template>
          <span
            class="pointer-events-none absolute top-1/2 size-4 -translate-1/2 rounded-full border-2 border-white bg-accent shadow-card transition-[left,transform] duration-150 ease-out motion-reduce:transition-none"
            :class="{ 'scale-125': dragging }"
            :style="{ left: percent(thumb) }"
          ></span>
          <span
            v-if="dragging"
            class="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-accent px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-white tabular-nums"
            :style="{ left: percent(thumb) }"
            >{{ label }}</span
          >
        </div>

        <div
          class="relative hidden h-3.5 text-[10px] leading-none text-ink-muted tabular-nums sm:block"
        >
          <span
            v-for="tick in decades"
            :key="tick.year"
            class="absolute -translate-x-1/2"
            :style="{ left: percent(tick.at) }"
            >{{ tick.year }}</span
          >
          <span
            v-if="axis.to % 10 >= 4"
            class="absolute -translate-x-full"
            :style="{ left: percent(historyEnd) }"
            >{{ axis.to }}</span
          >
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
  </div>
</template>

<style scoped>
/* Diagonal strokes on the future steps, matching the hatching on the map. */
.hatch {
  background-image: repeating-linear-gradient(-45deg, currentColor 0 1.5px, transparent 1.5px 5px);
}
</style>
