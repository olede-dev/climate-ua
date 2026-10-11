<script setup lang="ts">
import { computed } from 'vue'
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  LineController,
  type ChartOptions,
  type ScriptableLineSegmentContext,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { useLocale } from '../../../composables/useLocale'
import { useTheme } from '../../../composables/useTheme'
import { annualWaterArea } from '../../../lib/waterbodyCard'
import type { SurfaceWaterAnnual } from '../../../types'
import { CHART_INK } from '../chartDefaults'
ChartJS.register(
  CategoryScale,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  LineController,
)
const props = defineProps<{ annual: SurfaceWaterAnnual[]; years: number[]; selected: number }>()
const { t } = useLocale()
const { isDark } = useTheme()
const rows = computed(() =>
  props.years.map((year) => props.annual.find((row) => row.year === year)),
)
const GAP = '#9aa3ad'
const GAP_FILL = 'rgba(154, 163, 173, 0.18)'
const gap = (ctx: ScriptableLineSegmentContext) => ctx.p0.skip || ctx.p1.skip
const data = computed(() => ({
  labels: props.years.map(String),
  datasets: [
    {
      label: t.value.surfaceWater.total,
      data: rows.value.map((row) => {
        const area = annualWaterArea(row)
        return area ? area.unionM2 / 1e6 : null
      }),
      borderColor: '#2ab0cd',
      borderWidth: 2,
      backgroundColor: 'rgba(42, 176, 205, 0.18)',
      fill: 'origin',
      tension: 0,
      // Only the selected year and partial observations get a marker; the rest is the line.
      pointBackgroundColor: rows.value.map((row) =>
        row?.spatialStatus === 'partial' ? '#e66825' : '#2ab0cd',
      ),
      pointBorderColor: '#fff',
      pointStyle: rows.value.map((row) =>
        row?.spatialStatus === 'partial' ? ('triangle' as const) : ('circle' as const),
      ),
      pointRadius: props.years.map((year, i) =>
        year === props.selected ? 5 : rows.value[i]?.spatialStatus === 'partial' ? 3 : 0,
      ),
      pointHoverRadius: 5,
      pointHitRadius: 8,
      // Missing years are bridged by a grey dashed segment with grey fill: no data, never zero.
      spanGaps: true,
      segment: {
        borderColor: (ctx: ScriptableLineSegmentContext) => (gap(ctx) ? GAP : undefined),
        borderDash: (ctx: ScriptableLineSegmentContext) => (gap(ctx) ? [4, 4] : undefined),
        backgroundColor: (ctx: ScriptableLineSegmentContext) => (gap(ctx) ? GAP_FILL : undefined),
      },
    },
  ],
}))
const options = computed<ChartOptions<'line'>>(() => {
  const ink = CHART_INK[isDark.value ? 'dark' : 'light']
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { ticks: { color: ink.text, maxTicksLimit: 6 }, grid: { color: ink.grid } },
      y: {
        beginAtZero: true,
        title: { display: true, text: t.value.surfaceWater.km2, color: ink.text },
        ticks: { color: ink.text },
        grid: { color: ink.grid },
      },
    },
  }
})
</script>
<template>
  <div class="relative mt-3 h-48">
    <Line :data="data" :options="options" :aria-label="t.surfaceWater.history" role="img" />
  </div>
</template>
