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
