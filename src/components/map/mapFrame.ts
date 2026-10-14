import type { Bounds } from '../../lib/geometry'

/** Shared by every map so all layers frame Ukraine the same way. */
export const UKRAINE_BOUNDS: Bounds = [
  [22.0, 44.0],
  [40.3, 52.5],
]
/** Phone padding: room for the legend over the map's bottom edge. */
export const PHONE_PADDING = { top: 48, bottom: 96, left: 16, right: 56 }
