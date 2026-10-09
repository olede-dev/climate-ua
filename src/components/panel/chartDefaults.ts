import { Chart as ChartJS, Tooltip } from 'chart.js'
import type { AnnotationOptions } from 'chartjs-plugin-annotation'
import { watch, type WatchSource } from 'vue'

// Registered here too: its defaults exist only after registration, and imports run first.
ChartJS.register(Tooltip)
ChartJS.defaults.font.family = getComputedStyle(document.documentElement).fontFamily
ChartJS.defaults.font.size = 11
Object.assign(ChartJS.defaults.plugins.tooltip, {
  cornerRadius: 10,
  padding: 10,
  boxPadding: 4,
  titleFont: { weight: 600 },
})

/** Axis text, grid and reference-line colours every panel chart shares. */
export const CHART_INK = {
  light: { text: '#5c5c61', grid: 'rgba(0, 0, 0, 0.06)', reference: '#6e6e73' },
  dark: { text: '#b0b0b5', grid: 'rgba(255, 255, 255, 0.08)', reference: '#a1a1a6' },
}

/** Y axis width, title included, shared by charts stacked on one time axis so their days line up. */
export const Y_AXIS_WIDTH = 64

export function fixedAxisWidth(axis: { width: number }): void {
  axis.width = Y_AXIS_WIDTH
}

/**
 * The timeline's day as a line annotation that moves in place: rebuilding the options on every
 * slider step redraws the whole chart, which stutters over a year of days. `annotation()` gives
 * the line for the options with the day current when they are built, without tracking it.
 */
export function useSelectedLine(
  chart: WatchSource<ChartJS | undefined>,
  selected: () => string,
  today: () => string,
) {
  let day = selected()
  const annotation = (color: string): AnnotationOptions<'line'> => ({
    type: 'line',
    scaleID: 'x',
    value: day,
    display: day !== today(),
    borderColor: color,
    borderWidth: 2,
  })
  watch([selected, chart], ([value, instance]) => {
    day = value
    const line = (
      instance?.options.plugins?.annotation?.annotations as
        Record<string, AnnotationOptions<'line'>> | undefined
    )?.selected
    if (!instance || !line) return
    line.value = value
    line.display = value !== today()
    instance.update('none')
  })
  return annotation
}
