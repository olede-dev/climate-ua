<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../../composables/useLocale'
import { formatDayMonth, formatWithUnit } from '../../../lib/format'
import type { ClimateSummary, YearRange } from '../../../lib/river/climate'
import { formatPct, formatYearRange } from '../../../lib/river/format'
import LoadingSkeleton from '../../ui/LoadingSkeleton.vue'
import LowFlowChart from './LowFlowChart.vue'
import InfoHint from '../../ui/InfoHint.vue'

const props = defineProps<{
  periods: { baseline: YearRange; recent: YearRange; norm: YearRange } | undefined
  summary: ClimateSummary | null
  /** This year's discharge failed: only past years can be shown. */
  thisYearFailed: boolean
  today: string
}>()

const { locale, t } = useLocale()
const copy = computed(() => t.value.river.climate)
const currentYear = computed(() => Number(props.today.slice(0, 4)))
const days = (n: number) => formatWithUnit(n, t.value.river.days, locale.value, { decimals: 0 })
const meanOver = (range: YearRange) =>
  copy.value.baselineMean.replace('{period}', formatYearRange(range))

/** Drier reads warm, wetter reads blue; changes within ±10% are treated as no change. */
type Tone = 'drier' | 'wetter' | 'neutral'
const TONE_CLASS: Record<Tone, string> = {
  drier: 'text-[#b4530f] dark:text-[#fdba74]',
  wetter: 'text-[#1d6fb8] dark:text-[#7cc0f5]',
  neutral: 'text-ink',
}
const flowTone = (pct: number): Tone => (pct <= -10 ? 'drier' : pct >= 10 ? 'wetter' : 'neutral')

const tiles = computed(() => {
  const s = props.summary
  const p = props.periods
  if (!s || !p) return []
  const base = s.baselineMean
  const lowFlowTone: Tone =
    s.thisYear === null || base === null || Math.abs(s.thisYear - base) <= Math.max(1, base * 0.1)
      ? 'neutral'
      : s.thisYear > base
        ? 'drier'
        : 'wetter'
  return [
    {
      label: copy.value.meanChange,
      value: formatPct(s.meanChangePct, locale.value),
      tone: flowTone(s.meanChangePct),
      up: s.meanChangePct > 0,
      detail: null,
    },
    {
      label: copy.value.lowSeasonChange,
      value: formatPct(s.lowSeasonChangePct, locale.value),
      tone: flowTone(s.lowSeasonChangePct),
      up: s.lowSeasonChangePct > 0,
      detail: null,
    },
    {
      label: copy.value.thisYear,
      value: s.thisYear === null ? '—' : days(s.thisYear),
      tone: lowFlowTone,
      up: s.thisYear !== null && base !== null && s.thisYear > base,
      detail:
        base === null
          ? null
          : copy.value.usually
              .replace('{n}', String(Math.round(base)))
              .replace('{period}', formatYearRange(p.baseline)),
    },
  ]
})
</script>

<template>
  <section class="space-y-3" aria-labelledby="climate-heading">
    <h3 id="climate-heading" class="px-1 text-[13px] leading-snug font-semibold text-ink">
      {{ copy.heading }}
    </h3>
    <LoadingSkeleton v-if="!periods || !summary" :label="copy.loading" class="h-48" />
    <template v-else>
      <ul class="divide-y divide-line rounded-xl bg-group">
        <li
          v-for="tile in tiles"
          :key="tile.label"
          class="flex items-center justify-between gap-3 px-4 py-2.5"
        >
          <div class="min-w-0">
            <p class="text-sm leading-snug text-ink">{{ tile.label }}</p>
            <p v-if="tile.detail" class="text-xs leading-snug text-ink-muted tabular-nums">
              {{ tile.detail }}
            </p>
          </div>
          <p
            class="flex shrink-0 items-center gap-1 text-lg leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums"
            :class="TONE_CLASS[tile.tone]"
          >
            <svg
              v-if="tile.tone !== 'neutral'"
              viewBox="0 0 16 16"
              class="size-4 shrink-0"
              :class="tile.up ? '' : 'rotate-180'"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
            </svg>
            {{ tile.value }}
          </p>
        </li>
      </ul>
      <h4 class="px-1 pt-1 text-[13px] leading-snug font-semibold text-ink">
        {{ copy.chartHeading.replace('{date}', formatDayMonth(today, locale)) }}
      </h4>
      <LowFlowChart
        :by-year="summary.byYear"
        :recent="periods.recent"
        :current-year="currentYear"
        :baseline-mean="summary.baselineMean"
      />
      <ul class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
        <li class="flex items-center gap-1.5">
          <span class="inline-block size-2.5 rounded-[3px] bg-[#d6c3a5] dark:bg-[#6b5b45]"></span>
          {{ formatYearRange(periods.baseline) }}
        </li>
        <li class="flex items-center gap-1.5">
          <span class="inline-block size-2.5 rounded-[3px] bg-[#b07022] dark:bg-[#c38c45]"></span>
          {{ formatYearRange(periods.recent) }}
        </li>
        <li v-if="summary.thisYear !== null" class="flex items-center gap-1.5">
          <span class="inline-block size-2.5 rounded-[3px] bg-[#5f3209] dark:bg-[#fdba74]"></span>
          {{ currentYear }}
        </li>
        <li class="flex items-center gap-1.5">
          <span class="inline-block w-3 border-t border-dashed border-ink-muted"></span>
          {{ meanOver(periods.baseline) }}
        </li>
      </ul>
      <p v-if="thisYearFailed" role="status" class="text-xs text-warn-ink">
        {{ copy.thisYearFailed }}
      </p>
      <InfoHint :label="copy.noteToggle">
        <p>
          {{
            copy.periods
              .replace('{recent}', formatYearRange(periods.recent))
              .replace('{baseline}', formatYearRange(periods.baseline))
          }}
        </p>
        <p>{{ copy.chartNote.replace('{norm}', formatYearRange(periods.norm)) }}</p>
      </InfoHint>
    </template>
  </section>
</template>
