import { describe, expect, it } from 'vitest'

import { LAYERS } from '../src/config/layers'
import {
  colorAt,
  cssGradient,
  mapColorExpression,
  scalePosition,
  type ColorScale,
} from '../src/lib/scale'

const scale: ColorScale = {
  stops: [
    [-2, '#0000ff'],
    [0, '#333333'],
    [2, '#ff0000'],
  ],
  noData: '#222222',
}

describe('scalePosition', () => {
  it('places values linearly and clamps outside the domain', () => {
    expect(scalePosition(scale, 0)).toBe(0.5)
    expect(scalePosition(scale, 1)).toBe(0.75)
    expect(scalePosition(scale, -5)).toBe(0)
    expect(scalePosition(scale, 5)).toBe(1)
  })
})

describe('cssGradient', () => {
  it('puts each stop at its share of the domain', () => {
    expect(cssGradient(scale)).toBe(
      'linear-gradient(to right, #0000ff 0.00%, #333333 50.00%, #ff0000 100.00%)',
    )
  })
})

describe('mapColorExpression', () => {
  it('interpolates numbers and falls back to the no-data fill', () => {
    expect(mapColorExpression(scale, ['feature-state', 'value'])).toEqual([
      'case',
      ['==', ['typeof', ['feature-state', 'value']], 'number'],
      [
        'interpolate',
        ['linear'],
        ['feature-state', 'value'],
        -2,
        '#0000ff',
        0,
        '#333333',
        2,
        '#ff0000',
      ],
      '#222222',
    ])
  })
})

describe.each(Object.values(LAYERS))('$id scale', (layer) => {
  it('has ascending stops', () => {
    const values = layer.scale.stops.map(([value]) => value)
    expect(values).toEqual([...values].sort((a, b) => a - b))
    expect(new Set(values).size).toBe(values.length)
  })

  it('centres a diverging anomaly scale on the norm', () => {
    if (layer.display !== 'anomaly') return
    expect(scalePosition(layer.scale, 0)).toBe(0.5)
  })
})

describe('colorAt', () => {
  it('blends between stops and clamps outside the domain', () => {
    expect(colorAt(scale, 0)).toBe('#333333')
    expect(colorAt(scale, 1)).toBe('#991a1a')
    expect(colorAt(scale, -9)).toBe('#0000ff')
    expect(colorAt(scale, 9)).toBe('#ff0000')
  })
})

describe('stepped scale', () => {
  const classes: ColorScale = {
    stops: [
      [0, '#111111'],
      [1, '#222222'],
      [15, '#333333'],
    ],
    noData: '#000000',
    stepped: true,
  }

  it('gives each value the colour of the last stop at or below it', () => {
    expect(colorAt(classes, 0)).toBe('#111111')
    expect(colorAt(classes, 0.5)).toBe('#111111')
    expect(colorAt(classes, 14)).toBe('#222222')
    expect(colorAt(classes, 15)).toBe('#333333')
    expect(colorAt(classes, 200)).toBe('#333333')
  })

  it('draws equal bands and places a value in the middle of its band', () => {
    expect(cssGradient(classes)).toBe(
      'linear-gradient(to right, #111111 0.00% 33.33%, #222222 33.33% 66.67%, #333333 66.67% 100.00%)',
    )
    expect(scalePosition(classes, 5)).toBeCloseTo(0.5)
    expect(scalePosition(classes, 0)).toBeCloseTo(1 / 6)
  })

  it('steps on the map', () => {
    expect(mapColorExpression(classes, ['get', 'v'])).toEqual([
      'case',
      ['==', ['typeof', ['get', 'v']], 'number'],
      ['step', ['get', 'v'], '#111111', 1, '#222222', 15, '#333333'],
      '#000000',
    ])
  })
})
