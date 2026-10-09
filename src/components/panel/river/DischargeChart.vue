<script setup lang="ts">
import 'chartjs-adapter-date-fns'

import {
  BarController,
  BarElement,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
  type ChartData,
  type ChartDataset,
  type ChartOptions,
  type LegendItem,
  type TooltipItem,
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import { enGB } from 'date-fns/locale/en-GB'
import { uk } from 'date-fns/locale/uk'
import { computed } from 'vue'
import { Chart } from 'vue-chartjs'

import { useLocale } from '../../../composables/useLocale'
import { useTheme } from '../../../composables/useTheme'
import type { Locale } from '../../../i18n'
import type { ChartSeries } from '../../../lib/river/chartSeries'
import { formatDischarge, formatPctOfNorm, formatPrecipitation } from '../../../lib/river/format'
import type { DailyValues } from '../../../types'
import '../chartDefaults'

// Only the pieces this chart uses, so the rest of Chart.js is tree-shaken away.
ChartJS.register(
  LineController,
  LineElement,
  BarController,
  BarElement,
  PointElement,
  LinearScale,
  TimeScale,
  Filler,
  Tooltip,
  Legend,
  annotationPlugin,
)

const props = defineProps<{
  series: ChartSeries
  today: string
  /** Values are % of the median norm instead of m³/s. */
  relative: boolean
}>()

const PALETTES = {
  light: {
    norm: '#8e8e93',
    normBand: 'rgba(142, 142, 147, 0.16)',
    forecast: '#0071e3',
    forecastBand: 'rgba(0, 113, 227, 0.2)',
    past: '#1d1d1f',
    precipitation: 'rgba(48, 176, 199, 0.75)',
    today: '#1d1d1f',
    todayText: '#ffffff',
    text: '#6e6e73',
    grid: 'rgba(0, 0, 0, 0.06)',
  },
  dark: {
    norm: '#98989d',
    normBand: 'rgba(152, 152, 157, 0.2)',
    forecast: '#0a84ff',
    forecastBand: 'rgba(10, 132, 255, 0.28)',
    past: '#f5f5f7',
    precipitation: 'rgba(100, 210, 255, 0.7)',
    today: '#f5f5f7',
    todayText: '#1d1d1f',
    text: '#a1a1a6',
    grid: 'rgba(255, 255, 255, 0.08)',
  },
}

const DATE_LOCALES = { uk, en: enGB } satisfies Record<Locale, unknown>

const { isDark } = useTheme()
const { locale, t } = useLocale()
const colors = computed(() => (isDark.value ? PALETTES.dark : PALETTES.light))

/** Typed for the mixed chart: line datasets plus the precipitation bars. */
type Dataset = ChartDataset<'line' | 'bar', DailyValues>

/**
 * A median line with an optional band around it, drawn by an invisible lower line and an
 * upper line filled down to it. The legend shows one entry per group: the line, filled with
 * the band colour, and a click hides the line and its band together.
 */
interface Group {
  label: string
  data: DailyValues
  color: string
  style: Partial<Dataset>
  band?: { label: string; lower: DailyValues; upper: DailyValues; fill: string }
}

const formatValue = (value: number | null) =>
  props.relative
    ? formatPctOfNorm(value, locale.value)
    : `${formatDischarge(value, locale.value)} ${t.value.river.dischargeUnit}`

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
  const { series, relative } = props
  const COLORS = colors.value
  const labels = t.value.river.chart
  const groups: Group[] = []

  // Listed bottom to top; datasets are reversed below because Chart.js draws index 0 last.
  if (series.norm) {
    groups.push({
      label: relative ? labels.normRelative : labels.norm,
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
  // Bars go between the lines and the bands: drawn over the translucent bands, under the lines.
  const precipitationIndex = series.precipitation ? datasets.length : null
  if (series.precipitation) {
    datasets.push({
      type: 'bar',
      label: labels.precipitation,
      data: series.precipitation,
      yAxisID: 'y2',
      backgroundColor: COLORS.precipitation,
      barPercentage: 0.8,
      categoryPercentage: 1,
    })
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

  const data: ChartData<'line' | 'bar', DailyValues, string> = { labels: series.time, datasets }
  return { data, lowerIndices, bandIndices, precipitationIndex }
})

function tooltipLabel(item: TooltipItem<'line' | 'bar'>): string {
  const { datasetIndex, dataIndex, dataset } = item
  const { lowerIndices, precipitationIndex } = chart.value
  const value = dataset.data[dataIndex] as number | null
  if (datasetIndex === precipitationIndex) {
    return `${dataset.label}: ${formatPrecipitation(value, locale.value)} ${t.value.river.chart.precipitationUnit}`
  }
  if (lowerIndices.has(datasetIndex + 1)) {
    const lower = chart.value.data.datasets[datasetIndex + 1].data[dataIndex]
    return `${dataset.label}: ${formatValue(lower)} … ${formatValue(value)}`
  }
  return `${dataset.label}: ${formatValue(value)}`
}

/** Hides or shows a legend entry's line together with its band. */
function toggleGroup(legendChart: ChartJS, item: LegendItem) {
  const index = item.datasetIndex
  if (index === undefined) return
  const visible = !legendChart.isDatasetVisible(index)
  for (const i of [index, ...(chart.value.bandIndices.get(index) ?? [])]) {
    legendChart.setDatasetVisibility(i, visible)
  }
  legendChart.update()
}

const options = computed((): ChartOptions<'line' | 'bar'> => {
  const { lowerIndices, bandIndices, precipitationIndex } = chart.value
  const bands = new Set([...bandIndices.values()].flat())
  const COLORS = colors.value
  return {
    color: COLORS.text,
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    spanGaps: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        type: 'time',
        adapters: { date: { locale: DATE_LOCALES[locale.value] } },
        time: {
          minUnit: 'day',
          tooltipFormat: 'd MMMM yyyy',
          displayFormats: { day: 'd MMM', week: 'd MMM', month: 'd MMM' },
        },
        // Bars would otherwise pad the axis by half a day and shift the lines off the edges.
        offset: false,
        ticks: { maxRotation: 0, autoSkipPadding: 12, color: COLORS.text },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: props.relative ? t.value.river.chart.pctOfNorm : t.value.river.chart.dischargeAxis,
          color: COLORS.text,
        },
        grid: { color: COLORS.grid },
        border: { color: COLORS.grid },
        ticks: {
          color: COLORS.text,
          callback: (value) =>
            props.relative ? `${value}%` : formatDischarge(+value, locale.value),
        },
      },
      y2: {
        display: precipitationIndex !== null,
        position: 'right',
        min: 0,
        title: { display: true, text: t.value.river.chart.precipitationAxis, color: COLORS.text },
        grid: { drawOnChartArea: false },
        border: { color: COLORS.grid },
        ticks: {
          color: COLORS.text,
          callback: (value) => formatPrecipitation(+value, locale.value),
        },
      },
    },
    plugins: {
      legend: {
        position: 'bottom',
        onClick: (_event, item, legend) => toggleGroup(legend.chart, item),
        labels: {
          color: COLORS.text,
          boxWidth: 12,
          boxHeight: 8,
          useBorderRadius: true,
          borderRadius: 2,
          filter: (item) => item.datasetIndex === undefined || !bands.has(item.datasetIndex),
        },
      },
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
        },
      },
    },
  }
})
</script>

<template>
  <div class="h-[260px] lg:h-80">
    <Chart
      type="line"
      :data="chart.data"
      :options="options"
      :aria-label="t.river.chart.ariaLabel"
      role="img"
    />
  </div>
</template>
