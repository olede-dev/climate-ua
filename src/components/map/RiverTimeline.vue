<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { formatDayMonth } from '../../lib/format'
import { addDays, daysBetween } from '../../lib/river/dates'

const props = defineProps<{
  today: string
  /** Days before and after today the slider covers. */
  pastDays: number
  futureDays: number
}>()
const date = defineModel<string>({ required: true })

/** One day per frame: the 90-day window plays in about 13 s. */
const FRAME_MS = 140

const { locale, t } = useLocale()
const copy = computed(() => t.value.river.timeline)
const start = computed(() => addDays(props.today, -props.pastDays))
const total = computed(() => props.pastDays + props.futureDays)
const index = computed({
  get: () => daysBetween(start.value, date.value),
  set: (value: number) => (date.value = addDays(start.value, value)),
})
const isForecast = computed(() => date.value > props.today)

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
  timer = setInterval(() => {
    if (index.value >= total.value) return stop()
    index.value += 1
  }, FRAME_MS)
}

function backToToday() {
  stop()
  date.value = props.today
}

// A drag on the slider takes over from playback.
watch(date, (value, previous) => {
  if (playing.value && daysBetween(previous, value) !== 1) stop()
})
onBeforeUnmount(stop)
</script>

<template>
  <div
    class="glass pointer-events-auto flex items-center gap-2 rounded-2xl px-2.5 py-2 shadow-float sm:gap-3 sm:px-3"
  >
    <button
      type="button"
      class="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover focus-ring"
      :aria-label="playing ? copy.pause : copy.play"
      :aria-pressed="playing"
      @click="toggle"
    >
      <svg v-if="playing" viewBox="0 0 16 16" class="size-4" fill="currentColor" aria-hidden="true">
        <rect x="3" y="2" width="3.5" height="12" rx="1" />
        <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
      </svg>
      <svg v-else viewBox="0 0 16 16" class="size-4" fill="currentColor" aria-hidden="true">
        <path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5Z" />
      </svg>
    </button>
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex items-baseline justify-between gap-2 text-xs">
        <span class="flex items-baseline gap-1.5">
          <span class="font-semibold text-ink tabular-nums">
            {{ formatDayMonth(date, locale) }}
          </span>
          <button
            v-if="date !== today"
            type="button"
            class="rounded font-medium text-accent-ink hover:underline focus-ring"
            :aria-label="copy.todayLabel"
            @click="backToToday"
          >
            {{ copy.today }}
          </button>
        </span>
        <span
          class="grid rounded-full px-2 py-0.5 text-center text-[11px] font-medium"
          :class="
            isForecast
              ? 'bg-violet-500/15 text-violet-800 dark:text-violet-200'
              : 'bg-fill text-ink-muted'
          "
        >
          <!-- Both labels share one grid cell so the badge keeps the wider one's width. -->
          <span class="col-start-1 row-start-1" :class="{ invisible: isForecast }">{{
            copy.past
          }}</span>
          <span class="col-start-1 row-start-1" :class="{ invisible: !isForecast }">{{
            copy.forecast
          }}</span>
        </span>
      </div>
      <div class="relative">
        <input
          v-model.number="index"
          type="range"
          min="0"
          :max="total"
          step="1"
          class="w-full accent-accent"
          :aria-label="copy.label"
          :aria-valuetext="formatDayMonth(date, locale)"
        />
        <!-- Today's tick: observed values to the left, the ensemble median to the right. -->
        <span
          class="pointer-events-none absolute top-0 h-full w-px bg-ink-muted/60"
          :style="{ left: `${(pastDays / total) * 100}%` }"
          aria-hidden="true"
        ></span>
      </div>
    </div>
  </div>
</template>
