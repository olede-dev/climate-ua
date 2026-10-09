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
