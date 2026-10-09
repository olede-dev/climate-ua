<script setup lang="ts">
import 'chartjs-adapter-date-fns'

import {
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
  type ChartData,
  type ChartDataset,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import { enGB } from 'date-fns/locale/en-GB'
import { uk } from 'date-fns/locale/uk'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { Chart } from 'vue-chartjs'

import { useLocale } from '../../../composables/useLocale'
import { useTheme } from '../../../composables/useTheme'
import type { Locale } from '../../../i18n'
import type { ChartSeries } from '../../../lib/river/chartSeries'
import { formatDischarge } from '../../../lib/river/format'
import type { DailyValues } from '../../../types'
import { CHART_INK, fixedAxisWidth, useSelectedLine } from '../chartDefaults'

// Only the pieces this chart uses, so the rest of Chart.js is tree-shaken away.
ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Filler,
  Tooltip,
  annotationPlugin,
)

const props = defineProps<{
  series: ChartSeries
  today: string
  /** The timeline's day, marked on the chart; a click on the chart picks another. */
  selected: string
}>()
const emit = defineEmits<{ select: [date: string] }>()

const PALETTES = {
  light: {
    norm: '#8e8e93',
    normBand: 'rgba(142, 142, 147, 0.16)',
    forecast: '#0071e3',
    forecastBand: 'rgba(0, 113, 227, 0.2)',
    past: '#1d1d1f',
    today: '#1d1d1f',
    todayText: '#ffffff',
    selected: '#0071e3',
    ...CHART_INK.light,
  },
  dark: {
    norm: '#98989d',
    normBand: 'rgba(152, 152, 157, 0.2)',
    forecast: '#0a84ff',
    forecastBand: 'rgba(10, 132, 255, 0.28)',
    past: '#f5f5f7',
    today: '#f5f5f7',
    todayText: '#1d1d1f',
    selected: '#0a84ff',
    ...CHART_INK.dark,
  },
}

const DATE_LOCALES = { uk, en: enGB } satisfies Record<Locale, unknown>

const { isDark } = useTheme()
const { locale, t } = useLocale()
const colors = computed(() => (isDark.value ? PALETTES.dark : PALETTES.light))

/** One entry of the HTML legend under the chart. */
interface LegendEntry {
  label: string
  color: string
  /** Band colour behind the line swatch. */
  fill: string | null
  dashed: boolean
  /** Dataset the entry toggles, with its band if it has one. */
  index: number
}

type Dataset = ChartDataset<'line', DailyValues>

/**
 * A median line with an optional band around it, drawn by an invisible lower line and an
 * upper line filled down to it. The legend under the chart shows one entry per group: the line
 * over the band colour, and a click hides the line and its band together.
 */
interface Group {
  label: string
  data: DailyValues
  color: string
  style: Partial<Dataset>
  band?: { label: string; lower: DailyValues; upper: DailyValues; fill: string }
}

const formatValue = (value: number | null) =>
  `${formatDischarge(value, locale.value)} ${t.value.river.dischargeUnit}`

function line(label: string, data: DailyValues, style: Partial<Dataset>): Dataset {
  return { label, data, pointRadius: 0, pointHoverRadius: 3, borderWidth: 1.5, ...style }
}

/** The line takes the band fill only as its legend swatch; hover points keep the line colour. */
function groupLine(group: Group): Dataset {
  const { color } = group
  return line(group.label, group.data, {
    borderColor: color,
    pointBackgroundColor: color,
    pointHoverBackgroundColor: color,
    ...group.style,
    backgroundColor: group.band?.fill ?? 'transparent',
  })
}

const chart = computed(() => {
  const { series } = props
  const COLORS = colors.value
  const labels = t.value.river.chart
  const groups: Group[] = []

  // Listed bottom to top; datasets are reversed below because Chart.js draws index 0 last.
  if (series.norm) {
    groups.push({
      label: labels.norm,
      data: series.norm.median,
      color: COLORS.norm,
      style: { borderDash: [5, 4] },
      band: {
        label: labels.normBand,
        lower: series.norm.p25,
        upper: series.norm.p75,
        fill: COLORS.normBand,
      },
    })
  }
  groups.push(
    {
      label: labels.forecast,
      data: series.forecast.median,
      color: COLORS.forecast,
      style: { borderWidth: 2 },
      band: {
        label: labels.forecastIqr,
        lower: series.forecast.p25,
        upper: series.forecast.p75,
        fill: COLORS.forecastBand,
      },
    },
    { label: labels.past, data: series.past, color: COLORS.past, style: { borderWidth: 2 } },
  )

  // Top-most first: every line, then the bars, then the bands under them all. Each band upper
  // line is followed by its lower line and fills down to it.
  const datasets: Dataset[] = []
  const lowerIndices = new Set<number>()
  /** Line dataset index → its band's upper and lower indices, toggled with it from the legend. */
  const bandIndices = new Map<number, number[]>()
  const lineIndices = new Map<Group, number>()
  for (const group of [...groups].reverse()) {
    lineIndices.set(group, datasets.length)
    datasets.push(groupLine(group))
  }
  for (const group of [...groups].reverse()) {
    const { band } = group
    if (!band) continue
    const upperIndex = datasets.length
    datasets.push(
      line(band.label, band.upper, {
        borderWidth: 0,
        backgroundColor: band.fill,
        fill: { target: upperIndex + 1 },
      }),
      line(band.label, band.lower, { borderWidth: 0, pointHoverRadius: 0 }),
    )
    lowerIndices.add(upperIndex + 1)
    bandIndices.set(lineIndices.get(group)!, [upperIndex, upperIndex + 1])
  }

  const data: ChartData<'line', DailyValues, string> = { labels: series.time, datasets }
  // Top to bottom as drawn, the same order the old canvas legend listed.
  const legend: LegendEntry[] = [...groups].reverse().map((group) => ({
    label: group.label,
    color: group.color,
    fill: group.band?.fill ?? null,
    dashed: 'borderDash' in group.style,
    index: lineIndices.get(group)!,
  }))
  return { data, lowerIndices, bandIndices, legend }
})

function tooltipLabel(item: TooltipItem<'line'>): string {
  const { datasetIndex, dataIndex, dataset } = item
  const { lowerIndices } = chart.value
  const value = dataset.data[dataIndex] as number | null
  if (lowerIndices.has(datasetIndex + 1)) {
    const lower = chart.value.data.datasets[datasetIndex + 1].data[dataIndex]
    return `${dataset.label}: ${formatValue(lower)} … ${formatValue(value)}`
  }
  return `${dataset.label}: ${formatValue(value)}`
}

const canvas = useTemplateRef<{ chart?: ChartJS }>('canvas')
const selectedLine = useSelectedLine(
  () => canvas.value?.chart,
  () => props.selected,
  () => props.today,
)
const hidden = ref(new Set<number>())
watch(chart, () => (hidden.value = new Set()))

/** Hides or shows a legend entry's line together with its band. */
function toggle(index: number) {
  const instance = canvas.value?.chart
  if (!instance) return
  const visible = hidden.value.has(index)
  for (const i of [index, ...(chart.value.bandIndices.get(index) ?? [])]) {
    instance.setDatasetVisibility(i, visible)
  }
  instance.update()
  const next = new Set(hidden.value)
  if (visible) next.delete(index)
  else next.add(index)
  hidden.value = next
}

const options = computed((): ChartOptions<'line'> => {
  const { lowerIndices } = chart.value
  const COLORS = colors.value
  return {
    color: COLORS.text,
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    spanGaps: false,
    interaction: { mode: 'index', intersect: false },
    onClick: (_event, elements) => {
      const date = props.series.time[elements[0]?.index ?? -1]
      if (date) emit('select', date)
    },
    scales: {
      x: {
        type: 'time',
        min: props.series.time[0],
        max: props.series.time.at(-1),
        adapters: { date: { locale: DATE_LOCALES[locale.value] } },
        time: {
          minUnit: 'day',
          tooltipFormat: 'd MMMM yyyy',
          displayFormats: { day: 'd MMM', week: 'd MMM', month: 'd MMM' },
        },
        // The precipitation chart below shares this axis; neither pads it by half a day.
        offset: false,
        ticks: { maxRotation: 0, autoSkipPadding: 12, color: COLORS.text },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: t.value.river.chart.dischargeAxis,
          color: COLORS.text,
        },
        grid: { color: COLORS.grid },
        border: { color: COLORS.grid },
        afterFit: fixedAxisWidth,
        ticks: {
          color: COLORS.text,
          callback: (value) => formatDischarge(+value, locale.value),
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        filter: (item) => !lowerIndices.has(item.datasetIndex) && item.raw !== null,
        callbacks: { label: tooltipLabel },
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
            label: {
              display: true,
              content: t.value.river.chart.today,
              position: 'start',
              backgroundColor: COLORS.today,
              color: COLORS.todayText,
              font: { size: 11, weight: 600 },
              padding: { x: 6, y: 3 },
              borderRadius: 6,
            },
          },
          selected: selectedLine(COLORS.selected),
        },
      },
    },
  }
})
</script>

<template>
  <div class="space-y-2">
    <div class="h-56">
      <Chart
        ref="canvas"
        type="line"
        :data="chart.data"
        :options="options"
        :aria-label="t.river.chart.ariaLabel"
        role="img"
      />
    </div>
    <!-- Charts sharing the time axis, e.g. precipitation, go between the plot and its legend. -->
    <slot />
    <ul class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
      <li v-for="entry in chart.legend" :key="entry.label">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded transition-opacity hover:text-ink focus-ring"
          :class="{ 'line-through opacity-50': hidden.has(entry.index) }"
          :aria-pressed="!hidden.has(entry.index)"
          @click="toggle(entry.index)"
        >
          <span
            class="relative inline-flex h-2.5 w-3 items-center rounded-[3px]"
            :style="{ background: entry.fill ?? 'transparent' }"
            aria-hidden="true"
          >
            <span
              class="w-full border-t-2"
              :class="{ 'border-dashed': entry.dashed }"
              :style="{ borderColor: entry.color }"
            ></span>
          </span>
          {{ entry.label }}
        </button>
      </li>
    </ul>
  </div>
</template>
