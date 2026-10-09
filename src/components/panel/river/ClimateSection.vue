<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../../composables/useLocale'
import { formatDayMonth, formatWithUnit } from '../../../lib/format'
import type { ClimateSummary, YearRange } from '../../../lib/river/climate'
import { formatPct, formatYearRange } from '../../../lib/river/format'
import LoadingSkeleton from '../../ui/LoadingSkeleton.vue'
import LowFlowChart from './LowFlowChart.vue'
import StatRow from './StatRow.vue'

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
const rounded = (value: number | null) => (value === null ? '—' : String(Math.round(value)))
const days = (n: number) => formatWithUnit(n, t.value.river.days, locale.value, { decimals: 0 })
const meanOver = (range: YearRange) =>
  copy.value.baselineMean.replace('{period}', formatYearRange(range))
</script>

<template>
  <section class="space-y-3" aria-labelledby="climate-heading">
    <h3 id="climate-heading" class="px-1 text-[13px] leading-snug font-semibold text-ink">
      {{ copy.heading }}
    </h3>
    <LoadingSkeleton v-if="!periods || !summary" :label="copy.loading" class="h-48" />
    <template v-else>
      <dl class="divide-y divide-line rounded-xl bg-group text-ink">
        <StatRow :label="copy.meanChange" :value="formatPct(summary.meanChangePct, locale)" />
        <StatRow
          :label="copy.lowSeasonChange"
          :value="formatPct(summary.lowSeasonChangePct, locale)"
        />
        <StatRow
          :label="copy.thisYear"
          :value="summary.thisYear === null ? '—' : days(summary.thisYear)"
        />
        <StatRow :label="meanOver(periods.baseline)" :value="rounded(summary.baselineMean)" />
        <StatRow :label="meanOver(periods.recent)" :value="rounded(summary.recentMean)" />
      </dl>
      <p class="text-xs text-ink-muted">
        {{
          copy.periods
            .replace('{recent}', formatYearRange(periods.recent))
            .replace('{baseline}', formatYearRange(periods.baseline))
        }}
      </p>
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
      <p class="text-xs leading-relaxed text-ink-muted">
        {{ copy.chartNote.replace('{norm}', formatYearRange(periods.norm)) }}
      </p>
    </template>
  </section>
</template>
