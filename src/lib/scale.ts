import type { ExpressionSpecification } from 'maplibre-gl'

/** A continuous colour scale: stops in ascending value order, linear in between. */
export interface ColorScale {
  stops: readonly (readonly [value: number, color: string])[]
  /** Fill for a region without a value. */
  noData: string
}

function domain(scale: ColorScale): [number, number] {
  return [scale.stops[0]![0], scale.stops[scale.stops.length - 1]![0]]
}

/** Where a value sits along the scale, 0 to 1; values outside the domain sit at its ends. */
export function scalePosition(scale: ColorScale, value: number): number {
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
  return [
    'case',
    ['==', ['typeof', input], 'number'],
    ['interpolate', ['linear'], input, ...scale.stops.flat()],
    scale.noData,
  ] as ExpressionSpecification
}
