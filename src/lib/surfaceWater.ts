import type {
  SurfaceWaterClass,
  SurfaceWaterComparisonClass,
  SurfaceWaterState,
  SurfaceWaterTransition,
} from '../types'

/** Normalize only after supported years and stable catalogue IDs have loaded.
 * Preserve endpoint order: reversing a comparison must reverse gains and losses.
 * Equal endpoints are a valid no-change comparison on the same observation mask.
 */
export function normalizeSurfaceWaterState(
  input: Partial<SurfaceWaterState>,
  supportedYears: readonly number[],
  waterbodyIds: readonly string[],
): SurfaceWaterState | null {
  if (supportedYears.length === 0) return null
  if (supportedYears.some((year) => !Number.isSafeInteger(year))) {
    throw new Error('Invalid supported surface-water years')
  }
  const earliest = Math.min(...supportedYears)
  const latest = Math.max(...supportedYears)
  const yearOr = (year: number | undefined, fallback: number) =>
    year !== undefined && supportedYears.includes(year) ? year : fallback
  return {
    mode: input.mode === 'comparison' ? 'comparison' : 'annual',
    year: yearOr(input.year, latest),
    before: yearOr(input.before, earliest),
    after: yearOr(input.after, latest),
    waterbody:
      input.waterbody != null && waterbodyIds.includes(input.waterbody) ? input.waterbody : null,
  }
}

function isClass(value: number): value is SurfaceWaterClass {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 15
}

/** Decode decompressed packed4 bytes, row-major, low nibble first.
 * The caller owns gzip decompression, immutable-reference checks and cancellation.
 * Bound the allocation to one native 512-cell tile, including partial edge tiles.
 */
export function decodeSurfaceWaterTile(packed: Uint8Array, cellCount: number): Uint8Array {
  if (!Number.isSafeInteger(cellCount) || cellCount < 1 || cellCount > 512 * 512) {
    throw new Error('Invalid surface-water tile cell count')
  }
  if (packed.length !== Math.ceil(cellCount / 2)) {
    throw new Error('Surface-water tile length mismatch')
  }
  if (cellCount % 2 === 1 && packed[packed.length - 1]! >> 4 !== 15) {
    throw new Error('Invalid surface-water tile padding')
  }
  const classes = new Uint8Array(cellCount)
  for (let i = 0; i < cellCount; i++) {
    const value = (packed[i >> 1]! >> ((i % 2) * 4)) & 15
    if (!isClass(value)) throw new Error('Invalid surface-water class')
    classes[i] = value
  }
  return classes
}

/** Common-valid-mask semantics; category transitions remain persistent water.
 * This is categorical rendering, never a substitute for projected area metrics.
 */
export function compareSurfaceWaterClasses(
  before: SurfaceWaterClass,
  after: SurfaceWaterClass,
): { category: SurfaceWaterComparisonClass; transition: SurfaceWaterTransition } {
  if (!isClass(before) || !isClass(after)) throw new Error('Invalid surface-water class')
  let category: SurfaceWaterComparisonClass
  let transition: SurfaceWaterTransition = null
  if (before === 15 || after === 15) category = 'outside'
  else if (before === 0 || after === 0) category = 'uncomparable'
  else if (before === 1) category = after === 1 ? 'dry' : 'gained'
  else if (after === 1) category = 'lost'
  else {
    category = 'persistent'
    if (before === 3 && after === 2) transition = 'permanentToSeasonal'
    if (before === 2 && after === 3) transition = 'seasonalToPermanent'
  }
  return { category, transition }
}

import type { SurfaceWaterFrame, SurfaceWaterGrid } from '../types'

export type SurfaceWaterBounds = [number, number, number, number]

export function surfaceWaterExtent(
  grid: Pick<SurfaceWaterGrid, 'width' | 'height' | 'transform'>,
): SurfaceWaterBounds {
  const [dx, , west, , dy, north] = grid.transform
  return [west, north + grid.height * dy, west + grid.width * dx, north]
}

export function intersectsSurfaceWater(a: SurfaceWaterBounds, b: SurfaceWaterBounds): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
}

/** Reject misregistered pairs instead of showing false changes at seams. */
export function validateSurfaceWaterFrame(
  frame: SurfaceWaterFrame,
  grid: SurfaceWaterGrid,
  version: string,
  year: number,
): void {
  if (
    frame.version !== version ||
    frame.year !== year ||
    frame.width !== grid.width ||
    frame.height !== grid.height ||
    frame.transform.length !== 6 ||
    frame.transform.some((v, i) => !Number.isFinite(v) || v !== grid.transform[i]) ||
    frame.transform[0] <= 0 ||
    frame.transform[4] >= 0 ||
    frame.transform[1] !== 0 ||
    frame.transform[3] !== 0
  ) {
    throw new Error('Misaligned surface-water frame')
  }
  const seen = new Set<string>()
  for (const tile of frame.tiles) {
    const key = `${tile.x},${tile.y}`
    if (
      seen.has(key) ||
      ![tile.x, tile.y, tile.width, tile.height].every(Number.isSafeInteger) ||
      tile.x < 0 ||
      tile.y < 0 ||
      tile.x % 512 !== 0 ||
      tile.y % 512 !== 0 ||
      tile.width !== Math.min(512, frame.width - tile.x) ||
      tile.height !== Math.min(512, frame.height - tile.y) ||
      tile.width < 1 ||
      tile.height < 1
    )
      throw new Error('Invalid surface-water tile layout')
    seen.add(key)
  }
}

export const SURFACE_WATER_COLORS = {
  permanent: '#1453be',
  seasonal: '#2ab0cd',
  dry: '#b8a989',
  insufficient: '#737d87',
  persistent: '#1453be',
  gained: '#1ba05b',
  lost: '#e66825',
  uncomparable: '#737d87',
  permanentToSeasonal: '#c05cbd',
  seasonalToPermanent: '#eed353',
}

/** No interpolation of class codes. Transitions optionally overlay persistent water. */
export function surfaceWaterPixelColor(
  before: SurfaceWaterClass,
  after: SurfaceWaterClass | null,
  transitions: boolean,
): string | null {
  if (after === null) {
    if (before === 15) return null
    return SURFACE_WATER_COLORS[
      before === 0 ? 'insufficient' : before === 1 ? 'dry' : before === 2 ? 'seasonal' : 'permanent'
    ]
  }
  const { category, transition } = compareSurfaceWaterClasses(before, after)
  if (category === 'outside') return null
  return SURFACE_WATER_COLORS[transitions && transition ? transition : category]
}

export function validateSurfaceWaterPair(
  before: SurfaceWaterFrame,
  after: SurfaceWaterFrame,
): void {
  const windows = new Map(before.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]))
  if (
    before.tiles.length !== after.tiles.length ||
    before.width !== after.width ||
    before.height !== after.height ||
    before.version !== after.version ||
    before.transform.some((value, i) => value !== after.transform[i])
  )
    throw new Error('Misaligned surface-water pair')
  for (const tile of after.tiles) {
    const match = windows.get(`${tile.x},${tile.y}`)
    if (!match || match.width !== tile.width || match.height !== tile.height)
      throw new Error('Mismatched surface-water pair mask')
  }
}
