<script setup lang="ts">
import 'chartjs-adapter-date-fns'

import {
  BarController,
  BarElement,
  Chart as ChartJS,
  LinearScale,
  TimeScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import { enGB } from 'date-fns/locale/en-GB'
import { uk } from 'date-fns/locale/uk'
import { computed, useTemplateRef } from 'vue'
import { Bar } from 'vue-chartjs'

import { useLocale } from '../../../composables/useLocale'
import { useTheme } from '../../../composables/useTheme'
import type { Locale } from '../../../i18n'
import { formatPrecipitation } from '../../../lib/river/format'
import type { DailyValues } from '../../../types'
import { CHART_INK, fixedAxisWidth, useSelectedLine } from '../chartDefaults'

ChartJS.register(BarController, BarElement, LinearScale, TimeScale, Tooltip, annotationPlugin)

/**
 * Daily precipitation under the discharge chart, on its own axis rather than a second y scale:
 * the same dates and y-axis width, so each bar sits under the discharge of that day.
 */
const props = defineProps<{
  time: string[]
  /** mm per day, aligned with `time`. */
  values: DailyValues
  today: string
  selected: string
}>()

const PALETTES = {
  light: { bar: '#30b0c7', today: '#1d1d1f', selected: '#0071e3', ...CHART_INK.light },
  dark: { bar: '#64d2ff', today: '#f5f5f7', selected: '#0a84ff', ...CHART_INK.dark },
}

const DATE_LOCALES = { uk, en: enGB } satisfies Record<Locale, unknown>

const { isDark } = useTheme()
const { locale, t } = useLocale()
const colors = computed(() => (isDark.value ? PALETTES.dark : PALETTES.light))
const copy = computed(() => t.value.river.chart)
const bar = useTemplateRef<{ chart?: ChartJS }>('bar')
const selectedLine = useSelectedLine(
  () => bar.value?.chart,
  () => props.selected,
  () => props.today,
)

const data = computed((): ChartData<'bar', DailyValues, string> => ({
  labels: props.time,
  datasets: [
    {
      label: copy.value.precipitation,
      data: props.values,
      backgroundColor: colors.value.bar,
      barPercentage: 0.8,
      categoryPercentage: 1,
      borderRadius: 2,
    },
  ],
}))

const options = computed((): ChartOptions<'bar'> => {
  const COLORS = colors.value
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        type: 'time',
        min: props.time[0],
        max: props.time.at(-1),
        adapters: { date: { locale: DATE_LOCALES[locale.value] } },
        time: { minUnit: 'day', tooltipFormat: 'd MMMM yyyy' },
        offset: false,
        // The discharge chart above labels the dates.
        ticks: { display: false },
        grid: { display: false },
        border: { color: COLORS.grid },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: copy.value.precipitationAxis, color: COLORS.text },
        grid: { color: COLORS.grid },
        border: { color: COLORS.grid },
        afterFit: fixedAxisWidth,
        ticks: {
          color: COLORS.text,
          maxTicksLimit: 3,
          callback: (value) => formatPrecipitation(+value, locale.value),
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        filter: (item) => item.raw !== null,
        callbacks: {
          label: (item) =>
            `${copy.value.precipitation}: ${formatPrecipitation(item.raw as number, locale.value)} ${copy.value.precipitationUnit}`,
        },
      },
      annotation: {
        annotations: {
          today: {
            type: 'line',
            scaleID: 'x',
            value: props.today,
            borderColor: COLORS.today,
            borderWidth: 1,
            borderDash: [3, 3],
          },
          selected: selectedLine(COLORS.selected),
        },
      },
    },
  }
})
</script>

<template>
  <div class="h-56">
    <Bar
      ref="bar"
      :data="data"
      :options="options"
      :aria-label="copy.precipitationAria"
      role="img"
    />
  </div>
</template>
