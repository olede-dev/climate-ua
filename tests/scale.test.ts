import { describe, expect, it } from 'vitest'

import { LAYERS } from '../src/config/layers'
import { cssGradient, mapColorExpression, scalePosition, type ColorScale } from '../src/lib/scale'

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
