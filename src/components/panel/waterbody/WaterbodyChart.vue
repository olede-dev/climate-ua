<script setup lang="ts">
import { computed } from 'vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  LineController,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { useLocale } from '../../../composables/useLocale'
import { useTheme } from '../../../composables/useTheme'
import { annualWaterArea } from '../../../lib/waterbodyCard'
import type { SurfaceWaterAnnual } from '../../../types'
import { CHART_INK } from '../chartDefaults'
ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, LineController)
const props = defineProps<{ annual: SurfaceWaterAnnual[]; years: number[]; selected: number }>()
const emit = defineEmits<{ select: [year: number] }>()
const { t } = useLocale()
const { isDark } = useTheme()
const rows = computed(() =>
  props.years.map((year) => props.annual.find((row) => row.year === year)),
)
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
      pointBackgroundColor: rows.value.map((row) =>
        row?.spatialStatus === 'partial' ? '#e66825' : '#2ab0cd',
      ),
      pointStyle: rows.value.map((row) =>
        row?.spatialStatus === 'partial' ? ('triangle' as const) : ('circle' as const),
      ),
      pointRadius: props.years.map((year) => (year === props.selected ? 6 : 3)),
      spanGaps: false,
    },
  ],
}))
const options = computed<ChartOptions<'line'>>(() => {
  const ink = CHART_INK[isDark.value ? 'dark' : 'light']
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    onClick: (_event, elements) => {
      const year = props.years[elements[0]?.index ?? -1]
      if (year !== undefined) emit('select', year)
    },
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
