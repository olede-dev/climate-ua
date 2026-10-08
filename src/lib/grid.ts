import type { MultiPolygon, Polygon } from 'geojson'

import { colorAt, type ColorScale } from './scale'
import { isFuture, type TimeStep } from './time'
import type { GridFile, ProjectionBound } from '../types'

/** Canvas pixels per grid cell across: enough for a crisp clip along the border at zoom 7. */
const PIXELS_PER_CELL = 12

const GRID_KEYS = { min: 'p10', median: 'median', max: 'p90' } as const

/** Web Mercator y of a latitude, unscaled. */
function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
}

/** The block's corners for a MapLibre image source: top left, top right, bottom right, bottom left. */
export function gridCorners(file: GridFile): [number, number][] {
  const east = file.west + file.cols * file.step
  const north = file.south + file.rows * file.step
  return [
    [file.west, north],
    [east, north],
    [east, file.south],
    [file.west, file.south],
  ]
}

/**
 * Each cell's value at a step, as the map shows it: a projection at the chosen bound (p10, median
 * or p90, like `atBound`), and with `anomaly` the difference from the cell's own norm.
 */
export function gridValues(
  file: GridFile,
  step: TimeStep,
  bound: ProjectionBound,
  anomaly: boolean,
): (number | null)[] | null {
  const cells = isFuture(step)
    ? file.future[step as keyof GridFile['future']]?.[GRID_KEYS[bound]]
    : file.values[step - file.history.from]
  if (!cells) return null
  if (!anomaly) return cells
  return cells.map((v, i) => {
    const norm = file.norm[i]
    return v === null || norm === null || norm === undefined ? null : v - norm
  })
}

/** Colours precomputed along the scale: `colorAt` per pixel would parse hex half a million times. */
const LUT_SIZE = 512

const colorTables = new WeakMap<ColorScale, { lut: Uint8ClampedArray; min: number; max: number }>()

function colorTable(scale: ColorScale): { lut: Uint8ClampedArray; min: number; max: number } {
  const cached = colorTables.get(scale)
  if (cached) return cached
  const min = scale.stops[0]![0]
  const max = scale.stops[scale.stops.length - 1]![0]
  const lut = new Uint8ClampedArray(LUT_SIZE * 3)
  for (let i = 0; i < LUT_SIZE; i++) {
    const n = Number.parseInt(colorAt(scale, min + ((max - min) * i) / (LUT_SIZE - 1)).slice(1), 16)
    lut.set([(n >> 16) & 255, (n >> 8) & 255, n & 255], i * 3)
  }
  const table = { lut, min, max }
  colorTables.set(scale, table)
  return table
}

/**
 * The blend of four cells by bilinear weights; cells without a value drop out and the rest share
 * their weight. `i…` are cell indexes, `fr` and `fc` the position between them, 0 to 1.
 */
function blend(
  values: (number | null)[],
  i00: number,
  i01: number,
  i10: number,
  i11: number,
  fr: number,
  fc: number,
): number | null {
  // Written out, not looped: it runs for every pixel at every timeline step.
  let sum = 0
  let weight = 0
  let w = (1 - fr) * (1 - fc)
  let v = values[i00]
  if (v != null && w > 0) {
    sum += v * w
    weight += w
  }
  w = (1 - fr) * fc
  v = values[i01]
  if (v != null && w > 0) {
    sum += v * w
    weight += w
  }
  w = fr * (1 - fc)
  v = values[i10]
  if (v != null && w > 0) {
    sum += v * w
    weight += w
  }
  w = fr * fc
  v = values[i11]
  if (v != null && w > 0) {
    sum += v * w
    weight += w
  }
  return weight > 0 ? sum / weight : null
}

/** The two cells either side of a position along an axis of `n` cells, clamped, and the share. */
function neighbours(position: number, n: number): [number, number, number] {
  const lower = Math.floor(position)
  const clamp = (i: number) => Math.min(n - 1, Math.max(0, i))
  return [clamp(lower), clamp(lower + 1), position - lower]
}

/**
 * A value between cell centres, blended from the four nearest cells by distance (bilinear);
 * cells without a value drop out and the rest share their weight. `row` and `col` are in cell
 * units from the centre of the first cell.
 */
export function sampleGrid(file: GridFile, values: (number | null)[], row: number, col: number) {
  const [r0, r1, fr] = neighbours(row, file.rows)
  const [c0, c1, fc] = neighbours(col, file.cols)
  const { cols } = file
  return blend(values, r0 * cols + c0, r0 * cols + c1, r1 * cols + c0, r1 * cols + c1, fr, fc)
}

/**
 * Where each canvas row and column samples the grid, and the canvas size: fixed for a file, so
 * the timelapse works it out once, not for each of half a million pixels at every step.
 */
interface Raster {
  width: number
  height: number
  /** Map position to canvas pixels. */
  x: (lon: number) => number
  y: (lat: number) => number
  /** Per canvas row: the cell row above and below (times `cols`), and the share between them. */
  rows: { lower: Int32Array; upper: Int32Array; share: Float64Array }
  /** Per canvas column: the cell column left and right, and the share between them. */
  cols: { lower: Int32Array; upper: Int32Array; share: Float64Array }
}

const rasters = new WeakMap<GridFile, Raster>()

function raster(file: GridFile): Raster {
  const cached = rasters.get(file)
  if (cached) return cached
  const [[west, north], [east, south]] = [gridCorners(file)[0]!, gridCorners(file)[2]!]
  const top = mercatorY(north)
  const span = top - mercatorY(south)
  const width = file.cols * PIXELS_PER_CELL
  // Mercator stretches latitude, so the canvas keeps the projected aspect ratio.
  const height = Math.round((width * span) / (((east - west) * Math.PI) / 180))
  const axis = (n: number, position: (i: number) => number, cells: number, stride: number) => {
    const plan = { lower: new Int32Array(n), upper: new Int32Array(n), share: new Float64Array(n) }
    for (let i = 0; i < n; i++) {
      const [lower, upper, share] = neighbours(position(i), cells)
      plan.lower[i] = lower * stride
      plan.upper[i] = upper * stride
      plan.share[i] = share
    }
    return plan
  }
  const result: Raster = {
    width,
    height,
    x: (lon) => ((lon - west) / (east - west)) * width,
    y: (lat) => ((top - mercatorY(lat)) / span) * height,
    rows: axis(
      height,
      (py) => {
        const lat = (Math.atan(Math.exp(top - ((py + 0.5) / height) * span)) * 360) / Math.PI - 90
        return (lat - file.south) / file.step - 0.5
      },
      file.rows,
      file.cols,
    ),
    cols: axis(width, (px) => (px + 0.5) / PIXELS_PER_CELL - 0.5, file.cols, 1),
  }
  rasters.set(file, result)
  return result
}

/** The clip as an opaque shape on its own canvas, drawn once per set of polygons and file. */
const masks = new WeakMap<
  (Polygon | MultiPolygon)[],
  { file: GridFile; canvas: HTMLCanvasElement }
>()

function clipMask(file: GridFile, clip: (Polygon | MultiPolygon)[]): HTMLCanvasElement {
  const cached = masks.get(clip)
  if (cached?.file === file) return cached.canvas
  const { width, height, x, y } = raster(file)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  for (const geometry of clip) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    for (const ring of polygons.flat()) {
      ring.forEach(([lon, lat], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x(lon!), y(lat!)))
      ctx.closePath()
    }
  }
  ctx.fill('nonzero')
  masks.set(clip, { file, canvas })
  return canvas
}

/**
 * Paints the cells on a canvas in Web Mercator rows, so a MapLibre image source stretched over
 * `gridCorners` puts every cell in place, clipped to the given polygons (Ukraine's oblasts).
 * Each pixel blends the nearest cells (`sampleGrid`): the field reads smoothly, though its
 * detail is still that of the ~25 km cells. Runs at every timeline step: the sampling plan and
 * the clip mask are kept per file and per `clip` array, so pass the same array while the
 * polygons stay the same.
 */
export function paintGrid(
  canvas: HTMLCanvasElement,
  file: GridFile,
  values: (number | null)[],
  scale: ColorScale,
  clip: (Polygon | MultiPolygon)[],
) {
  const { width, height, rows, cols } = raster(file)
  canvas.width = width
  canvas.height = height

  const { lut, min, max } = colorTable(scale)
  const stepped = scale.stepped === true
  const image = new ImageData(width, height)
  const data = image.data
  for (let py = 0; py < height; py++) {
    const lower = rows.lower[py]!
    const upper = rows.upper[py]!
    const fr = rows.share[py]!
    for (let px = 0; px < width; px++) {
      const c0 = cols.lower[px]!
      const c1 = cols.upper[px]!
      const value = blend(
        values,
        lower + c0,
        lower + c1,
        upper + c0,
        upper + c1,
        fr,
        cols.share[px]!,
      )
      if (value === null) continue
      const at = (py * width + px) * 4
      if (stepped) {
        const n = Number.parseInt(colorAt(scale, value).slice(1), 16)
        data[at] = (n >> 16) & 255
        data[at + 1] = (n >> 8) & 255
        data[at + 2] = n & 255
        data[at + 3] = 255
        continue
      }
      const k = Math.round(
        ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * (LUT_SIZE - 1),
      )
      data[at] = lut[k * 3]!
      data[at + 1] = lut[k * 3 + 1]!
      data[at + 2] = lut[k * 3 + 2]!
      data[at + 3] = 255
    }
  }

  // The field, then everything outside the clip cut away.
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(image, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(clipMask(file, clip), 0, 0)
  ctx.globalCompositeOperation = 'source-over'
}
