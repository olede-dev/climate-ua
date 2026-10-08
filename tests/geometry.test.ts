import type { Polygon } from 'geojson'
import { describe, expect, it } from 'vitest'

import { outerBorder } from '../src/lib/geometry'

const square = (x: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, 0],
      [x + 1, 0],
      [x + 1, 1],
      [x, 1],
      [x, 0],
    ],
  ],
})

describe('outerBorder', () => {
  it('drops the edge two polygons share and keeps the rest as one closed line', () => {
    const border = outerBorder([square(0), square(1)])
    const edges = border.coordinates.reduce((n, line) => n + line.length - 1, 0)
    expect(edges).toBe(6)
    expect(border.coordinates).toHaveLength(1)
    const line = border.coordinates[0]!
    expect(line[0]).toEqual(line[line.length - 1])
    expect(line).not.toContainEqual([1, 0.5])
  })

  it('returns nothing for no polygons', () => {
    expect(outerBorder([]).coordinates).toEqual([])
  })
})
