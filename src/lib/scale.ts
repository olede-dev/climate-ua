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
