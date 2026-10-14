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

/** Month starts as tall ticks; every day on a short window, every week on a long one. */
const ticks = computed(() => {
  const monthDays = new Set(months.value.map((month) => month.day))
  const out: { day: number; month: boolean }[] = []
  for (let day = 0; day <= total.value; day++) {
    const month = monthDays.has(day)
    if (month || total.value <= 120 || day % 7 === 0) out.push({ day, month })
  }
  return out
})

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
  <div class="glass pointer-events-auto rounded-2xl p-2.5 shadow-float sm:px-3.5 sm:py-3">
    <div class="flex items-center gap-3">
      <div
        class="flex shrink-0 items-center rounded-full bg-fill p-0.5"
        role="group"
        :aria-label="copy.label"
      >
        <button
          type="button"
          class="flex size-9 pointer-coarse:size-11 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill-strong focus-ring-inset disabled:text-ink-muted disabled:opacity-40 sm:size-8"
          :aria-label="t.timeline.prev"
          :disabled="index <= 0"
          @click="moveTo(index - 1)"
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
          type="button"
          class="flex size-9 pointer-coarse:size-11 items-center justify-center rounded-full bg-segment text-ink shadow-card transition-colors duration-150 ease-out motion-reduce:transition-none hover:text-accent-ink focus-ring-inset sm:size-8"
          :aria-label="playing ? copy.pause : copy.play"
          :aria-pressed="playing"
          @click="toggle"
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
          type="button"
          class="flex size-9 pointer-coarse:size-11 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill-strong focus-ring-inset disabled:text-ink-muted disabled:opacity-40 sm:size-8"
          :aria-label="t.timeline.next"
          :disabled="index >= total"
          @click="moveTo(index + 1)"
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

      <div class="flex min-w-0 items-baseline gap-2">
        <span
          class="text-[22px] leading-[26px] font-bold whitespace-nowrap tabular-nums max-sm:text-[17px] max-sm:leading-[22px]"
          >{{ label }}</span
        >
        <span
          v-if="isForecast"
          class="rounded-full bg-future/12 px-2 py-0.5 text-[11px] leading-[14px] font-semibold text-future"
          >{{ copy.forecast }}</span
        >
      </div>
      <button
        v-if="index !== pastDays"
        type="button"
        class="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[12px] leading-[15px] font-semibold text-accent-ink transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill focus-ring"
        :aria-label="copy.todayLabel"
        @click="moveTo(pastDays)"
      >
        {{ copy.today }}
      </button>
    </div>

    <div class="mt-2">
      <div
        ref="track"
        class="relative h-7 pointer-coarse:h-11 cursor-pointer touch-none rounded-md select-none focus-ring"
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
          v-if="todayAt < 1"
          class="pointer-events-none absolute inset-y-0.5 right-0 rounded-md bg-future/10"
          :style="{ left: percent(todayAt) }"
        ></span>
        <span
          v-for="tick in ticks"
          :key="tick.day"
          class="pointer-events-none absolute bottom-0 w-px -translate-x-1/2"
          :class="[
            tick.month ? 'h-3.5' : 'h-2',
            tick.day <= index ? 'bg-accent' : tick.month ? 'bg-ink/35' : 'bg-ink/15',
          ]"
          :style="{ left: percent(at(tick.day)) }"
        ></span>
        <span
          class="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-ink/50"
          :style="{ left: percent(todayAt) }"
        ></span>
        <template v-if="preview">
          <span
            class="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-ink/40"
            :style="{ left: percent(preview.at) }"
          ></span>
          <span
            class="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[11px] leading-[14px] font-medium whitespace-nowrap text-canvas tabular-nums"
            :style="{ left: percent(preview.at) }"
            >{{ preview.label }}</span
          >
        </template>
        <span
          class="pointer-events-none absolute -inset-y-0.5 w-[3px] -translate-x-1/2 rounded-full shadow-[0_0_0_2px_var(--ui-glass)] duration-150 ease-out motion-reduce:transition-none"
          :class="[isForecast ? 'bg-future' : 'bg-accent', dragging ? 'w-1' : 'transition-[left]']"
          :style="{ left: percent(thumb) }"
        ></span>
      </div>

      <div
        class="relative mt-1 hidden h-3 text-[10px] leading-none text-ink-muted tabular-nums sm:block"
      >
        <span
          v-for="month in labelled"
          :key="month.day"
          class="absolute -translate-x-1/2"
          :style="{ left: percent(at(month.day)) }"
          >{{ month.label }}</span
        >
        <span
          class="absolute font-semibold text-ink"
          :class="todayAt === 0 ? '' : todayAt === 1 ? '-translate-x-full' : '-translate-x-1/2'"
          :style="{ left: percent(todayAt) }"
          >{{ copy.today }}</span
        >
      </div>
    </div>

    <div v-if="$slots.default" class="mt-2.5 border-t border-line pt-2.5">
      <slot />
    </div>
  </div>
</template>
