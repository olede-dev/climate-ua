<script setup lang="ts">
import {
  BarController,
  BarElement,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import annotationPlugin, { type AnnotationOptions } from 'chartjs-plugin-annotation'
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'

import { useLocale } from '../../composables/useLocale'
import { useTheme } from '../../composables/useTheme'
import type { LayerConfig } from '../../config/layers'
import type { ValueFormat } from '../../lib/format'
import { colorAt } from '../../lib/scale'
import { isFuture, periodRange, type TimeStep } from '../../lib/time'
import type { LayerFile, RegionSeries, WaterBand } from '../../types'
import './chartDefaults'

ChartJS.register(BarController, BarElement, LinearScale, Tooltip, annotationPlugin)

const props = defineProps<{
  file: LayerFile
  series: RegionSeries
  config: LayerConfig
  /** The timeline's step, marked on the chart. */
  step: TimeStep
  format: ValueFormat
  /** What the bars measure, for screen readers. */
  title: string
  /** A yearly projection after the history: the models' mean as bars, their range behind. */
  projection?: { from: number; band: WaterBand } | null
}>()

/** Text takes the muted grey for glass (main.css): the chart sits on the glass panel over the map. */
const PALETTES = {
  light: {
    text: '#5c5c61',
    grid: 'rgba(0, 0, 0, 0.06)',
    reference: '#6e6e73',
    mark: '#1d1d1f',
  },
  dark: {
    text: '#b0b0b5',
    grid: 'rgba(255, 255, 255, 0.08)',
    reference: '#a1a1a6',
    mark: '#f5f5f7',
  },
}
/** Years between labels on the time axis: long records, then short ones (rivers). */
const YEAR_TICK = 25
const SHORT_YEAR_TICK = 10
/** Alpha of the p10–p90 box, as a hex suffix. */
const RANGE_ALPHA = '4d'

const { isDark } = useTheme()
const { t } = useLocale()
const colors = computed(() => (isDark.value ? PALETTES.dark : PALETTES.light))
const now = new Date().getFullYear()

const anomalyMode = computed(() => props.config.display === 'anomaly')
/** Bars and boxes are drawn in the map's units: an anomaly layer subtracts the norm. */
const shift = computed(() => (anomalyMode.value ? props.series.norm : 0))

const bars = computed(() =>
  props.series.history.flatMap((value, i) =>
    value === null ? [] : [{ x: props.file.history.from + i, y: value - shift.value }],
  ),
)

/** Projected years: the mean, and the models' range as a floating bar. */
const projected = computed(() =>
  (props.projection?.band.mean ?? []).map((mean, i) => ({
    x: props.projection!.from + i,
    y: mean - shift.value,
    low: props.projection!.band.min[i]! - shift.value,
    high: props.projection!.band.max[i]! - shift.value,
  })),
)

const periods = computed(() =>
  props.file.futurePeriods.flatMap((period) => {
    const value = props.series.future[period]
    if (!value) return []
    const [start, end] = periodRange(period)
    const s = shift.value
    return [
      {
        period,
        start,
        end,
        median: value.median - s,
        low: value.p10 === undefined ? undefined : value.p10 - s,
        high: value.p90 === undefined ? undefined : value.p90 - s,
      },
    ]
  }),
)

type Point = { x: number; y: number | [number, number] }

const data = computed((): ChartData<'bar', (number | [number, number] | null)[]> => {
  const scale = props.config.scale
  const color = (y: number) => colorAt(scale, y)
  // Chart.js types `data` as plain values, though a linear x axis reads {x, y} points.
  const points = (values: Point[]) => values as unknown as [number, number][]
  return {
    datasets: [
      {
        data: points(bars.value),
        backgroundColor: bars.value.map((bar) => color(bar.y)),
        barPercentage: 1,
        categoryPercentage: 1,
      },
      {
        data: points(projected.value.map((p) => ({ x: p.x, y: p.y }))),
        backgroundColor: projected.value.map((p) => color(p.y)),
        barPercentage: 0.6,
        categoryPercentage: 1,
        grouped: false,
        order: 0,
      },
      {
        data: points(projected.value.map((p) => ({ x: p.x, y: [p.low, p.high] }))),
        backgroundColor: projected.value.map((p) => `${color(p.y)}${RANGE_ALPHA}`),
        barPercentage: 1,
        categoryPercentage: 1,
        grouped: false,
        order: 1,
      },
    ],
  }
})

const label = (value: number) => props.format(value, { signed: anomalyMode.value })

const annotations = computed(() => {
  const COLORS = colors.value
  const scale = props.config.scale
  const out: Record<string, AnnotationOptions> = {
    norm: {
      type: 'line',
      scaleID: 'y',
      value: props.series.norm - shift.value,
      borderColor: COLORS.reference,
      borderWidth: 1,
      borderDash: [4, 4],
      drawTime: 'beforeDatasetsDraw',
    },
    now: {
      type: 'line',
      scaleID: 'x',
      value: now,
      borderColor: COLORS.reference,
      borderWidth: 1,
      borderDash: [3, 3],
      label: {
        display: true,
        content: t.value.chart.now,
        position: 'start',
        backgroundColor: 'transparent',
        color: COLORS.text,
        font: { size: 10 },
        padding: 2,
        xAdjust: -16,
      },
    },
  }
  for (const p of periods.value) {
    const color = colorAt(scale, p.median)
    const selected = p.period === props.step
    if (p.low !== undefined && p.high !== undefined) {
      out[`range-${p.period}`] = {
        type: 'box',
        xMin: p.start - 0.5,
        xMax: p.end + 0.5,
        yMin: p.low,
        yMax: p.high,
        backgroundColor: `${color}${RANGE_ALPHA}`,
        borderWidth: selected ? 1.5 : 0,
        borderColor: COLORS.mark,
        borderRadius: 2,
        drawTime: 'beforeDatasetsDraw',
      }
    }
    out[`median-${p.period}`] = {
      type: 'line',
      xMin: p.start - 0.5,
      xMax: p.end + 0.5,
      yMin: p.median,
      yMax: p.median,
      borderColor: color,
      borderWidth: selected ? 3 : 2,
    }
  }
  const year = props.step
  const bar = isFuture(year)
    ? undefined
    : (bars.value.find((b) => b.x === year) ?? projected.value.find((b) => b.x === year))
  if (bar) {
    out.step = {
      type: 'point',
      xValue: bar.x,
      yValue: bar.y,
      radius: 3.5,
      backgroundColor: colorAt(scale, bar.y),
      borderColor: COLORS.mark,
      borderWidth: 1.5,
    }
  }
  return out
})

/** The y range covers the bars, the model ranges and the norm line. */
const yBounds = computed(() => {
  const values = [
    props.series.norm - shift.value,
    ...bars.value.map((b) => b.y),
    ...projected.value.flatMap((p) => [p.low, p.high]),
    ...periods.value.flatMap((p) => [p.median, p.low ?? p.median, p.high ?? p.median]),
  ]
  return { min: Math.min(...values), max: Math.max(...values) }
})

const options = computed((): ChartOptions<'bar'> => {
  const COLORS = colors.value
  const lastEnd = periods.value.at(-1)?.end ?? projected.value.at(-1)?.x ?? props.file.history.to
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        type: 'linear',
        min: props.file.history.from - 1,
        max: Math.max(lastEnd, now) + 1,
        // Round years only; the axis ends sit half a year past the data.
        afterBuildTicks: (axis) => {
          const every = axis.max - axis.min > 60 ? YEAR_TICK : SHORT_YEAR_TICK
          const first = Math.ceil(axis.min / every) * every
          axis.ticks = Array.from(
            { length: Math.floor((axis.max - first) / every) + 1 },
            (_, i) => ({ value: first + i * every }),
          )
        },
        ticks: {
          color: COLORS.text,
          maxRotation: 0,
          autoSkipPadding: 12,
          // A plain year: the locale would add a thousands separator.
          callback: (value) => String(value),
        },
        grid: { display: false },
      },
      y: {
        beginAtZero: !anomalyMode.value,
        suggestedMin: yBounds.value.min,
        suggestedMax: yBounds.value.max,
        ticks: {
          color: COLORS.text,
          maxTicksLimit: 6,
          callback: (value) => {
            const v = Number(value)
            return props.format(v, {
              signed: anomalyMode.value,
              decimals: Number.isInteger(v) ? 0 : undefined,
            })
          },
        },
        grid: { color: COLORS.grid },
        border: { color: COLORS.grid },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => String(items[0]?.parsed.x ?? ''),
          label: (item) => {
            const range = (item.raw as Point).y
            if (Array.isArray(range)) {
              return t.value.tooltip.range
                .replace('{low}', props.format(range[0] + shift.value))
                .replace('{high}', props.format(range[1] + shift.value))
            }
            const y = item.parsed.y ?? 0
            return anomalyMode.value
              ? `${label(y)} · ${props.format(y + shift.value)}`
              : props.format(y)
          },
        },
      },
      annotation: { annotations: annotations.value },
    },
  }
})

const aria = computed(() =>
  (projected.value.length > 0
    ? t.value.chart.ariaYearly
    : periods.value.length > 0
      ? t.value.chart.aria
      : t.value.chart.ariaHistory
  )
    .replace('{title}', props.title)
    .replace('{from}', String(props.file.history.from))
    .replace('{to}', String(props.file.history.to))
    .replace(
      '{end}',
      String(periods.value.at(-1)?.end ?? projected.value.at(-1)?.x ?? props.file.history.to),
    ),
)
</script>

<template>
  <div class="h-48">
    <Bar :data="data" :options="options" :aria-label="aria" role="img" />
  </div>
</template>
