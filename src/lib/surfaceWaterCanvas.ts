import { surfaceWaterPixelColor, type SurfaceWaterBounds } from './surfaceWater'
import type { SurfaceWaterRenderTile } from '../composables/useSurfaceWaterTiles'
import type { SurfaceWaterClass } from '../types'

const mercatorY = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360))

/** Choose an original geographic row for the centre of a Mercator display row. */
export function surfaceWaterNativeRow(
  bounds: SurfaceWaterBounds,
  height: number,
  y: number,
): number {
  const north = mercatorY(bounds[3]),
    south = mercatorY(bounds[1])
  const projected = north + ((south - north) * (y + 0.5)) / height
  const latitude = ((2 * Math.atan(Math.exp(projected)) - Math.PI / 2) * 180) / Math.PI
  return Math.max(
    0,
    Math.min(height - 1, Math.floor(((bounds[3] - latitude) / (bounds[3] - bounds[1])) * height)),
  )
}

/** Reproject display rows with nearest native sampling; numerical areas never use this canvas. */
export function paintSurfaceWaterTile(
  data: SurfaceWaterRenderTile,
  transitions: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const { tile, bounds, before, after } = data
  canvas.width = tile.width
  canvas.height = tile.height
  const image = new ImageData(tile.width, tile.height)
  // Packed RGBA lookup by before * 16 + after; written as one 32-bit store per pixel.
  const colors = new Uint32Array(256)
  const rgba = new Uint8Array(colors.buffer)
  for (const a of [0, 1, 2, 3, 15] as SurfaceWaterClass[]) {
    for (const b of [0, 1, 2, 3, 15] as SurfaceWaterClass[]) {
      const color = surfaceWaterPixelColor(a, after ? b : null, transitions)
      if (!color) continue
      const i = (a * 16 + b) * 4
      rgba[i] = parseInt(color.slice(1, 3), 16)
      rgba[i + 1] = parseInt(color.slice(3, 5), 16)
      rgba[i + 2] = parseInt(color.slice(5, 7), 16)
      rgba[i + 3] = 255
    }
  }
  const out = new Uint32Array(image.data.buffer)
  for (let y = 0; y < tile.height; y++) {
    const row = surfaceWaterNativeRow(bounds, tile.height, y) * tile.width
    const target = y * tile.width
    if (after) {
      for (let x = 0; x < tile.width; x++)
        out[target + x] = colors[before[row + x]! * 16 + after[row + x]!]!
    } else {
      for (let x = 0; x < tile.width; x++) out[target + x] = colors[before[row + x]! * 16]!
    }
  }
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  return canvas
}

export function surfaceWaterCorners([west, south, east, north]: SurfaceWaterRenderTile['bounds']): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] {
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ]
}
