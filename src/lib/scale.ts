import type { ExpressionSpecification } from 'maplibre-gl'

/**
 * A colour scale: stops in ascending value order, linear in between. A `stepped` scale is a set
 * of classes instead: each stop's colour holds from its value up to the next stop, and the
 * legend gives every class the same width.
 */
export interface ColorScale {
  stops: readonly (readonly [value: number, color: string])[]
  /** Fill for a region without a value. */
  noData: string
  stepped?: boolean
}

/** The class of a stepped scale that holds `value`: the last stop at or below it. */
function classIndex(scale: ColorScale, value: number): number {
  const above = scale.stops.findIndex(([stop]) => stop > value)
  return Math.max(0, (above === -1 ? scale.stops.length : above) - 1)
}

function domain(scale: ColorScale): [number, number] {
  return [scale.stops[0]![0], scale.stops[scale.stops.length - 1]![0]]
}

/** Where a value sits along the scale, 0 to 1; values outside the domain sit at its ends. */
export function scalePosition(scale: ColorScale, value: number): number {
  if (scale.stepped) return (classIndex(scale, value) + 0.5) / scale.stops.length
  const [min, max] = domain(scale)
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * The colour of a value, blended in sRGB like the map and the legend; values outside the
 * domain take the end colours.
 */
export function colorAt(scale: ColorScale, value: number): string {
  const { stops } = scale
  if (scale.stepped) return stops[classIndex(scale, value)]![1]
  const upper = stops.findIndex(([stop]) => stop >= value)
  if (upper <= 0) return stops[upper === 0 ? 0 : stops.length - 1]![1]
  const [v0, c0] = stops[upper - 1]!
  const [v1, c1] = stops[upper]!
  const k = (value - v0) / (v1 - v0)
  const a = rgb(c0)
  const b = rgb(c1)
  return `#${a
    .map((channel, i) =>
      Math.round(channel + (b[i]! - channel) * k)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** CSS gradient through the stops, left to right, for the legend and the tooltip. */
export function cssGradient(scale: ColorScale): string {
  if (scale.stepped) {
    const n = scale.stops.length
    const pct = (i: number) => `${((i / n) * 100).toFixed(2)}%`
    const bands = scale.stops.map(([, color], i) => `${color} ${pct(i)} ${pct(i + 1)}`)
    return `linear-gradient(to right, ${bands.join(', ')})`
  }
  const stops = scale.stops.map(
    ([value, color]) => `${color} ${(scalePosition(scale, value) * 100).toFixed(2)}%`,
  )
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/**
 * MapLibre fill colour for a numeric input, e.g. `['feature-state', 'value']`; anything that is
 * not a number gets `scale.noData`. Both this and `cssGradient` blend in sRGB, so the map and
 * the legend agree.
 */
export function mapColorExpression(
  scale: ColorScale,
  input: ExpressionSpecification,
): ExpressionSpecification {
  const [[, first], ...rest] = scale.stops
  const ramp = (
    scale.stepped
      ? ['step', input, first, ...rest.flat()]
      : ['interpolate', ['linear'], input, ...scale.stops.flat()]
  ) as ExpressionSpecification
  return [
    'case',
    ['==', ['typeof', input], 'number'],
    ramp,
    scale.noData,
  ] as ExpressionSpecification
}
