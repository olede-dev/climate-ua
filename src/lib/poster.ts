import type { MultiPolygon, Polygon, Position } from 'geojson'

import type { Bounds } from './geometry'

export interface PosterPath {
  id: string
  d: string
}

/** Web Mercator y, as the map draws it, so the poster lines up with the map that replaces it. */
function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
}

/**
 * SVG paths of the regions inside `bounds`, in a viewBox `width` wide: the static map shown
 * where WebGL would run on the CPU (`softwareWebgl`).
 */
export function posterPaths(
  features: { id: string; geometry: Polygon | MultiPolygon }[],
  bounds: Bounds,
  width: number,
): { paths: PosterPath[]; height: number } {
  const [[west, south], [east, north]] = bounds
  const k = width / (((east - west) * Math.PI) / 180)
  const top = mercatorY(north)
  const height = Math.round((top - mercatorY(south)) * k)
  const point = ([lon, lat]: Position) =>
    `${(((lon! - west) * Math.PI) / 180) * k},${(top - mercatorY(lat!)) * k}`
    .replace(/(\.\d)\d+/g, '$1')
  const ring = (positions: Position[]) => `M${positions.map(point).join('L')}Z`
  const paths = features.map(({ id, geometry }) => {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    return { id, d: polygons.flatMap((rings) => rings.map(ring)).join('') }
  })
  return { paths, height }
}
