import type { Geometry, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson'

export type Bounds = [[west: number, south: number], [east: number, north: number]]

function positions(geometry: Geometry): Position[] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates]
    case 'MultiPoint':
    case 'LineString':
      return geometry.coordinates
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates.flat()
    case 'MultiPolygon':
      return geometry.coordinates.flat(2)
    case 'GeometryCollection':
      return geometry.geometries.flatMap(positions)
  }
}

export function geometryBounds(geometry: Geometry): Bounds | null {
  const points = positions(geometry)
  if (points.length === 0) return null
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lon, lat] of points as [number, number][]) {
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return [
    [west, south],
    [east, north],
  ]
}

/**
 * The outer border of polygons that tile an area, as lines: edges shared by two polygons
 * cancel out. Needs shared borders to have identical vertices (the oblasts are simplified
 * together for this).
 */
export function outerBorder(geometries: (Polygon | MultiPolygon)[]): MultiLineString {
  const key = (p: Position) => `${p[0]},${p[1]}`
  const edgeKey = (a: Position, b: Position) => {
    const [ka, kb] = [key(a), key(b)]
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
  }
  const edges = new Map<string, [Position, Position] | null>()
  for (const geometry of geometries) {
    const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const k = edgeKey(ring[i - 1]!, ring[i]!)
        edges.set(k, edges.has(k) ? null : [ring[i - 1]!, ring[i]!])
      }
    }
  }
  const from = new Map<string, [Position, Position][]>()
  for (const edge of edges.values()) {
    if (!edge) continue
    for (const end of edge) {
      const list = from.get(key(end)) ?? []
      list.push(edge)
      from.set(key(end), list)
    }
  }
  const used = new Set<[Position, Position]>()
  const lines: Position[][] = []
  for (const edge of edges.values()) {
    if (!edge || used.has(edge)) continue
    used.add(edge)
    const line = [...edge]
    for (;;) {
      const tail = line[line.length - 1]!
      const next = from.get(key(tail))?.find((e) => !used.has(e))
      if (!next) break
      used.add(next)
      line.push(key(next[0]) === key(tail) ? next[1] : next[0])
    }
    lines.push(line)
  }
  return { type: 'MultiLineString', coordinates: lines }
}
