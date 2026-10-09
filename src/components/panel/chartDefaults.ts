import { Chart as ChartJS, Tooltip } from 'chart.js'

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
