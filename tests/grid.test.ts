import { describe, expect, it } from 'vitest'

import { gridCorners, gridValues, sampleGrid } from '../src/lib/grid'
import type { GridFile } from '../src/types'

const file: GridFile = {
  layer: 'temp',
  unit: '°C',
  west: 22,
  south: 44,
  step: 0.5,
  rows: 1,
  cols: 2,
  history: { from: 2000, to: 2001 },
  norm: [10, null],
  values: [
    [11, null],
    [12.5, null],
  ],
  future: { '2041-2060': { median: [13, null], p10: [12, null], p90: [14, null] } },
  source: '',
}

describe('gridValues', () => {
  it('reads a year, as is or from the cell norm', () => {
    expect(gridValues(file, 2001, 'max', false)).toEqual([12.5, null])
    expect(gridValues(file, 2001, 'max', true)).toEqual([2.5, null])
  })

  it('reads a projection at the chosen bound', () => {
    expect(gridValues(file, '2041-2060', 'min', true)).toEqual([2, null])
    expect(gridValues(file, '2041-2060', 'max', false)).toEqual([14, null])
    expect(gridValues(file, '2041-2060', 'median', false)).toEqual([13, null])
  })

  it('has nothing for a step outside the file', () => {
    expect(gridValues(file, 1999, 'max', false)).toBeNull()
    expect(gridValues(file, '2081-2100', 'max', false)).toBeNull()
  })
})

describe('gridCorners', () => {
  it('runs clockwise from the top left', () => {
    expect(gridCorners(file)).toEqual([
      [22, 44.5],
      [23, 44.5],
      [23, 44],
      [22, 44],
    ])
  })
})

describe('sampleGrid', () => {
  const two: GridFile = { ...file, norm: [0, 10] }

  it('blends neighbouring cells by distance', () => {
    expect(sampleGrid(two, two.norm, 0, 0)).toBe(0)
    expect(sampleGrid(two, two.norm, 0, 0.25)).toBe(2.5)
    expect(sampleGrid(two, two.norm, 0, 1)).toBe(10)
  })

  it('leaves out cells without a value', () => {
    expect(sampleGrid(file, file.norm, 0, 0.75)).toBe(10)
  })
})
