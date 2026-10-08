import type { MultiPolygon, Polygon } from 'geojson'

import { colorAt, type ColorScale } from './scale'
import { isFuture, type TimeStep } from './time'
import type { GridFile, WaterBound } from '../types'

/** Canvas pixels per grid cell across: enough for a crisp clip along the border at zoom 7. */
const PIXELS_PER_CELL = 12

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
 * Each cell's value at a step, as the map shows it: a projection at the chosen bound (p10 or
 * p90, like `atBound`), and with `anomaly` the difference from the cell's own norm.
 */
export function gridValues(
  file: GridFile,
  step: TimeStep,
  bound: WaterBound,
  anomaly: boolean,
): (number | null)[] | null {
  const cells = isFuture(step)
    ? file.future[step as keyof GridFile['future']]?.[bound === 'min' ? 'p10' : 'p90']
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

function colorTable(scale: ColorScale): { lut: Uint8ClampedArray; min: number; max: number } {
  const min = scale.stops[0]![0]
  const max = scale.stops[scale.stops.length - 1]![0]
  const lut = new Uint8ClampedArray(LUT_SIZE * 3)
  for (let i = 0; i < LUT_SIZE; i++) {
    const n = Number.parseInt(colorAt(scale, min + ((max - min) * i) / (LUT_SIZE - 1)).slice(1), 16)
    lut.set([(n >> 16) & 255, (n >> 8) & 255, n & 255], i * 3)
  }
  return { lut, min, max }
}

/**
 * A value between cell centres, blended from the four nearest cells by distance (bilinear);
 * cells without a value drop out and the rest share their weight. `row` and `col` are in cell
 * units from the centre of the first cell.
 */
export function sampleGrid(file: GridFile, values: (number | null)[], row: number, col: number) {
  const r0 = Math.floor(row)
  const c0 = Math.floor(col)
  const fr = row - r0
  const fc = col - c0
  let sum = 0
  let weight = 0
  for (const [dr, dc, w] of [
    [0, 0, (1 - fr) * (1 - fc)],
    [0, 1, (1 - fr) * fc],
    [1, 0, fr * (1 - fc)],
    [1, 1, fr * fc],
  ] as const) {
    const r = Math.min(file.rows - 1, Math.max(0, r0 + dr))
    const c = Math.min(file.cols - 1, Math.max(0, c0 + dc))
    const value = values[r * file.cols + c]
    if (value === null || value === undefined || w === 0) continue
    sum += value * w
    weight += w
  }
  return weight > 0 ? sum / weight : null
}

/**
 * Paints the cells on a canvas in Web Mercator rows, so a MapLibre image source stretched over
 * `gridCorners` puts every cell in place, clipped to the given polygons (Ukraine's oblasts).
 * Each pixel blends the nearest cells (`sampleGrid`): the field reads smoothly, though its
 * detail is still that of the ~25 km cells.
 */
export function paintGrid(
  canvas: HTMLCanvasElement,
  file: GridFile,
  values: (number | null)[],
  scale: ColorScale,
  clip: (Polygon | MultiPolygon)[],
) {
  const [[west, north], [east, south]] = [gridCorners(file)[0]!, gridCorners(file)[2]!]
  const top = mercatorY(north)
  const span = top - mercatorY(south)
  const width = file.cols * PIXELS_PER_CELL
  // Mercator stretches latitude, so the canvas keeps the projected aspect ratio.
  const height = Math.round((width * span) / (((east - west) * Math.PI) / 180))
  canvas.width = width
  canvas.height = height
  const x = (lon: number) => ((lon - west) / (east - west)) * width
  const y = (lat: number) => ((top - mercatorY(lat)) / span) * height

  const { lut, min, max } = colorTable(scale)
  const stepped = scale.stepped === true
  const image = new ImageData(width, height)
  const cols = Array.from({ length: width }, (_, px) => (px + 0.5) / PIXELS_PER_CELL - 0.5)
  for (let py = 0; py < height; py++) {
    const merc = top - ((py + 0.5) / height) * span
    const lat = (Math.atan(Math.exp(merc)) * 360) / Math.PI - 90
    const row = (lat - file.south) / file.step - 0.5
    for (let px = 0; px < width; px++) {
      const value = sampleGrid(file, values, row, cols[px]!)
      if (value === null) continue
      const at = (py * width + px) * 4
      if (stepped) {
        const n = Number.parseInt(colorAt(scale, value).slice(1), 16)
        image.data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], at)
        continue
      }
      const k = Math.round(
        ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * (LUT_SIZE - 1),
      )
      image.data[at] = lut[k * 3]!
      image.data[at + 1] = lut[k * 3 + 1]!
      image.data[at + 2] = lut[k * 3 + 2]!
      image.data[at + 3] = 255
    }
  }

  // The field, then everything outside the clip cut away.
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(image, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.beginPath()
  for (const geometry of clip) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    for (const ring of polygons.flat()) {
      ring.forEach(([lon, lat], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x(lon!), y(lat!)))
      ctx.closePath()
    }
  }
  ctx.fill('nonzero')
  ctx.globalCompositeOperation = 'source-over'
}
