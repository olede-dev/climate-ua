import { describe, expect, it } from 'vitest'

import { posterPaths } from '../src/lib/poster'

describe('posterPaths', () => {
  it('maps the bounds onto the viewBox, stretching latitude like Web Mercator', () => {
    const { paths, height } = posterPaths(
      [
        {
          id: 'a',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 0],
              ],
            ],
          },
        },
      ],
      [
        [0, 0],
        [10, 10],
      ],
      100,
    )
    // Mercator stretches 0–10° N by about half a percent.
    expect(height).toBe(101)
    expect(paths).toEqual([{ id: 'a', d: 'M0,100.5L100,100.5L100,0L0,100.5Z' }])
  })
})
