<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { RiverWindow } from '../../config/discharge'
import { formatDayMonth } from '../../lib/format'
import { addDays, daysBetween } from '../../lib/river/dates'

/**
 * The rivers layer's day slider, in the look of `TimeSlider`: the days of `window` on one solid
 * track, the legend in the default slot.
 */
const props = defineProps<{ today: string; window: RiverWindow }>()
const date = defineModel<string>({ required: true })

/** One day per frame; any window plays in about 13 s, never faster than 30 ms a day. */
const PLAY_MS = 13_000
const MIN_FRAME_MS = 30

const { locale, t } = useLocale()
const copy = computed(() => t.value.river.timeline)
const track = useTemplateRef<HTMLDivElement>('track')

const pastDays = computed(() => props.window.pastDays)
const start = computed(() => addDays(props.today, -pastDays.value))
const total = computed(() => pastDays.value + props.window.futureDays)
const index = computed({
  get: () => daysBetween(start.value, date.value),
  set: (value: number) =>
    (date.value = addDays(start.value, Math.min(total.value, Math.max(0, value)))),
})
const isForecast = computed(() => date.value > props.today)
const at = (day: number) => day / total.value
const thumb = computed(() => at(index.value))
const todayAt = computed(() => at(pastDays.value))
const label = computed(() => formatDayMonth(date.value, locale.value))
const valueText = computed(() =>
  isForecast.value ? `${label.value}, ${copy.value.forecast}` : label.value,
)

const monthFormat = computed(
  () =>
    new Intl.DateTimeFormat(locale.value === 'uk' ? 'uk-UA' : 'en-GB', {
      month: 'short',
      timeZone: 'UTC',
    }),
)
/** The first day of each month in the window, labelled with the month's short name. */
const months = computed(() => {
  const out: { day: number; label: string }[] = []
  for (let day = 1; day <= total.value; day++) {
    const d = addDays(start.value, day)
    if (d.endsWith('-01')) {
      out.push({ day, label: monthFormat.value.format(new Date(`${d}T00:00:00Z`)) })
    }
  }
  return out
})
/**
 * Month names clear of the today label, and on a long window only every other month so they
 * never touch.
 */
const LABEL_GAP = 0.12
const labelled = computed(() => {
  const gap = Math.max(12, LABEL_GAP * total.value)
  const step = total.value > 120 ? 2 : 1
  return months.value.filter(
    (month, i) =>
      (months.value.length - 1 - i) % step === 0 && Math.abs(month.day - pastDays.value) >= gap,
  )
})

const playing = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

function stop() {
  playing.value = false
  clearInterval(timer)
  timer = undefined
}

function toggle() {
  if (playing.value) return stop()
  // From the end, start over; otherwise continue from the current day.
  if (index.value >= total.value) index.value = 0
  playing.value = true
  timer = setInterval(
    () => {
      if (index.value >= total.value) return stop()
      index.value += 1
    },
    Math.max(MIN_FRAME_MS, PLAY_MS / total.value),
  )
}

function moveTo(day: number) {
  stop()
  index.value = day
}

// A drag on the slider takes over from playback.
watch(date, (value, previous) => {
  if (playing.value && daysBetween(previous, value) !== 1) stop()
})
watch(() => props.window, stop)
onBeforeUnmount(stop)

function onKeydown(event: KeyboardEvent) {
  const targets: Record<string, number> = {
    ArrowLeft: index.value - 1,
    ArrowDown: index.value - 1,
    ArrowRight: index.value + 1,
    ArrowUp: index.value + 1,
    PageDown: index.value - 7,
    PageUp: index.value + 7,
    Home: 0,
    End: total.value,
  }
  if (!(event.key in targets)) return
  event.preventDefault()
  moveTo(targets[event.key]!)
}

const hoverAt = ref<number | null>(null)
const dragging = ref(false)

function dayAt(event: PointerEvent): number | null {
  const rect = track.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return null
  const share = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  return Math.round(share * total.value)
}

function pick(event: PointerEvent) {
  const day = dayAt(event)
  if (day !== null) moveTo(day)
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  pick(event)
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== 'touch') hoverAt.value = dayAt(event)
  if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) pick(event)
}

const preview = computed(() => {
  if (hoverAt.value === null || dragging.value) return null
  return {
    label: formatDayMonth(addDays(start.value, hoverAt.value), locale.value),
    at: at(hoverAt.value),
  }
})

const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`
</script>

<template>
  <div class="glass pointer-events-auto rounded-2xl px-2.5 py-2 shadow-float sm:px-3">
    <div class="flex items-center gap-2 sm:gap-3">
      <button
        type="button"
        class="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover focus-ring"
        :aria-label="playing ? copy.pause : copy.play"
        :aria-pressed="playing"
        @click="toggle"
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

      <div class="flex shrink-0 items-center text-ink" aria-hidden="true">
        <button
          type="button"
          tabindex="-1"
          class="flex size-6 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-fill-strong hover:text-ink disabled:opacity-0"
          :disabled="index <= 0"
          @click="moveTo(index - 1)"
        >
          <svg
            viewBox="0 0 16 16"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2.25"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
        </button>
        <span class="min-w-[6.5rem] text-center text-base font-semibold tabular-nums">{{
          label
        }}</span>
        <button
          type="button"
          tabindex="-1"
          class="flex size-6 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-fill-strong hover:text-ink disabled:opacity-0"
          :disabled="index >= total"
          @click="moveTo(index + 1)"
        >
          <svg
            viewBox="0 0 16 16"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2.25"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </button>
      </div>

      <div class="flex min-w-0 flex-1 flex-col sm:pt-3.5">
        <div
          ref="track"
          class="relative h-6 cursor-pointer touch-none rounded-full select-none focus-ring"
          role="slider"
          tabindex="0"
          :aria-label="copy.label"
          :aria-valuemin="0"
          :aria-valuemax="total"
          :aria-valuenow="index"
          :aria-valuetext="valueText"
          @keydown="onKeydown"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="dragging = false"
          @pointercancel="dragging = false"
          @pointerleave="hoverAt = null"
        >
          <span
            class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fill-strong"
          ></span>
          <span
            class="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
            :style="{ left: 0, width: percent(thumb) }"
          ></span>
          <span
            v-for="month in months"
            :key="month.day"
            class="pointer-events-none absolute top-1/2 h-2.5 w-px -translate-1/2 bg-ink/30"
            :style="{ left: percent(at(month.day)) }"
          ></span>
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
            class="pointer-events-none absolute top-1/2 size-5 -translate-1/2 rounded-full bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_1px_4px_rgb(0_0_0/0.3)] duration-150 ease-out motion-reduce:transition-none"
            :class="dragging ? 'scale-125 transition-transform' : 'transition-[left,transform]'"
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
            v-for="month in labelled"
            :key="month.day"
            class="absolute -translate-x-1/2"
            :style="{ left: percent(at(month.day)) }"
            >{{ month.label }}</span
          >
          <button
            type="button"
            class="absolute rounded font-semibold text-accent-ink hover:underline focus-ring"
            :class="todayAt === 0 ? '' : '-translate-x-full'"
            :style="{ left: percent(todayAt) }"
            :aria-label="copy.todayLabel"
            @click="moveTo(pastDays)"
          >
            {{ copy.today }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="$slots.default" class="mt-1.5 border-t border-ink/10 pt-2">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.hatch {
  background-image: repeating-linear-gradient(-45deg, currentColor 0 1.5px, transparent 1.5px 5px);
}
</style>
