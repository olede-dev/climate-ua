import type { FeatureCollection, Point } from 'geojson'
import type { ExpressionSpecification, Map as MaplibreMap } from 'maplibre-gl'

import { mapColorExpression, type ColorScale } from '../../lib/scale'
import type { RegionsFile } from '../../types'

export const REGION_SOURCE = 'regions'
export const REGION_FILL = 'region-fill'
const REGION_HATCH = 'region-hatch'
const REGION_LINE = 'region-line'
const REGION_HIGHLIGHT = 'region-highlight'
const REGION_HOT = 'region-hot'
const HOTSPOT_SOURCE = 'hotspots'
const HOTSPOT_DOT = 'hotspot-dot'
export const HOTSPOT_PULSE = 'hotspot-pulse'
const HATCH_IMAGE = 'future-hatch'
export const STATION_SOURCE = 'stations'
export const STATION_DOT = 'station-dot'

const VALUE: ExpressionSpecification = ['feature-state', 'value']
const HOVER: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false]
const SELECTED: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false]
const HOT: ExpressionSpecification = ['boolean', ['feature-state', 'hot'], false]

/** Opaque enough that the basemap's own borders inside Ukraine do not show through. */
const FILL_OPACITY = 0.9
/** While a region is hovered, the rest dim (SPEC §7). */
const DIMMED_OPACITY = 0.45
/** With hotspots on, everything but the hotspots recedes (SPEC §8.4). */
const NOT_HOT_OPACITY = 0.3
const HOT_COLOR = '#ffe3ef'

/** Thin diagonal strokes over the fill: the future is an estimate (SPEC §7). */
function hatchImage(): ImageData {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
  ctx.lineWidth = 1.5
  // Three strokes so the pattern tiles without a seam at the corners.
  for (const offset of [-size, 0, size]) {
    ctx.beginPath()
    ctx.moveTo(offset, size)
    ctx.lineTo(offset + size, 0)
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, size, size)
}

/** Fill, future hatching, borders and the hover/selection outline, under the place labels. */
export function addRegionLayers(map: MaplibreMap, data: RegionsFile, scale: ColorScale) {
  if (map.getSource(REGION_SOURCE)) return
  map.addSource(REGION_SOURCE, { type: 'geojson', data, promoteId: 'id' })
  if (!map.hasImage(HATCH_IMAGE)) map.addImage(HATCH_IMAGE, hatchImage(), { pixelRatio: 2 })
  // Over roads and the basemap's borders (no occupation line shows through), under place names.
  const layers = map.getStyle().layers
  const beforeId = (
    layers.find((layer) => layer.type === 'symbol' && layer['source-layer'] === 'place') ??
    layers.find((layer) => layer.type === 'symbol')
  )?.id
  map.addLayer(
    {
      id: REGION_FILL,
      type: 'fill',
      source: REGION_SOURCE,
      paint: {
        'fill-color': mapColorExpression(scale, VALUE),
        'fill-opacity': FILL_OPACITY,
        'fill-opacity-transition': { duration: 200 },
      },
    },
    beforeId,
  )
  map.addLayer(
    {
      id: REGION_HATCH,
      type: 'fill',
      source: REGION_SOURCE,
      layout: { visibility: 'none' },
      paint: { 'fill-pattern': HATCH_IMAGE },
    },
    beforeId,
  )
  map.addLayer(
    {
      id: REGION_LINE,
      type: 'line',
      source: REGION_SOURCE,
      paint: { 'line-color': 'rgba(235, 238, 245, 0.32)', 'line-width': 0.6 },
    },
    beforeId,
  )
  map.addLayer(
    {
      id: REGION_HOT,
      type: 'line',
      source: REGION_SOURCE,
      paint: {
        'line-color': HOT_COLOR,
        'line-width': ['case', HOT, 1.6, 0],
        'line-opacity': ['case', HOT, 0.9, 0],
      },
    },
    beforeId,
  )
  map.addSource(HOTSPOT_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer(
    {
      id: HOTSPOT_PULSE,
      type: 'circle',
      source: HOTSPOT_SOURCE,
      paint: {
        'circle-radius': 4,
        'circle-color': 'transparent',
        'circle-stroke-color': HOT_COLOR,
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.8,
      },
    },
    beforeId,
  )
  map.addLayer(
    {
      id: HOTSPOT_DOT,
      type: 'circle',
      source: HOTSPOT_SOURCE,
      paint: {
        'circle-radius': 3,
        'circle-color': HOT_COLOR,
        'circle-stroke-color': '#1a1a19',
        'circle-stroke-width': 1,
      },
    },
    beforeId,
  )
  map.addLayer(
    {
      id: REGION_HIGHLIGHT,
      type: 'line',
      source: REGION_SOURCE,
      paint: {
        'line-color': '#f5f5f7',
        'line-width': ['case', SELECTED, 2.2, HOVER, 1.6, 0],
        'line-opacity': ['case', SELECTED, 1, HOVER, 0.85, 0],
      },
    },
    beforeId,
  )
}

/** River stations: dots coloured by value, over the regions and under the place names. */
export function addStationLayers(
  map: MaplibreMap,
  data: FeatureCollection<Point>,
  scale: ColorScale,
) {
  if (map.getSource(STATION_SOURCE)) return
  map.addSource(STATION_SOURCE, { type: 'geojson', data, promoteId: 'id' })
  const beforeId = map
    .getStyle()
    .layers.find((layer) => layer.type === 'symbol' && layer['source-layer'] === 'place')?.id
  map.addLayer(
    {
      id: STATION_DOT,
      type: 'circle',
      source: STATION_SOURCE,
      paint: {
        'circle-radius': ['case', SELECTED, 9, HOVER, 8.5, 7],
        'circle-color': mapColorExpression(scale, VALUE),
        // A dark ring keeps the dots apart from the regions under them.
        'circle-stroke-color': ['case', SELECTED, '#f5f5f7', HOVER, '#f5f5f7', '#1a1a19'],
        'circle-stroke-width': ['case', SELECTED, 2.5, HOVER, 2, 1.5],
      },
    },
    beforeId,
  )
}

export function setStationData(map: MaplibreMap, data: FeatureCollection<Point>) {
  const source = map.getSource(STATION_SOURCE)
  if (source && 'setData' in source && typeof source.setData === 'function') source.setData(data)
}

export function setRegionData(map: MaplibreMap, data: RegionsFile) {
  const source = map.getSource(REGION_SOURCE)
  if (source && 'setData' in source && typeof source.setData === 'function') source.setData(data)
}

export function setRegionScale(map: MaplibreMap, scale: ColorScale) {
  if (map.getLayer(REGION_FILL))
    map.setPaintProperty(REGION_FILL, 'fill-color', mapColorExpression(scale, VALUE))
  if (map.getLayer(STATION_DOT))
    map.setPaintProperty(STATION_DOT, 'circle-color', mapColorExpression(scale, VALUE))
}

export function setFutureHatch(map: MaplibreMap, visible: boolean) {
  if (map.getLayer(REGION_HATCH))
    map.setLayoutProperty(REGION_HATCH, 'visibility', visible ? 'visible' : 'none')
}

/**
 * Fill opacity: a hovered region dims the rest; otherwise, with hotspots on, everything but
 * the hotspots recedes.
 */
export function setFillOpacity(map: MaplibreMap, hovering: boolean, hotspots: boolean) {
  if (!map.getLayer(REGION_FILL)) return
  const base: ExpressionSpecification | number = hotspots
    ? ['case', HOT, FILL_OPACITY, NOT_HOT_OPACITY]
    : FILL_OPACITY
  map.setPaintProperty(
    REGION_FILL,
    'fill-opacity',
    hovering ? ['case', HOVER, FILL_OPACITY, DIMMED_OPACITY] : base,
  )
}

/** The hotspot markers; an empty collection hides them. */
export function setHotspotPoints(map: MaplibreMap, points: FeatureCollection<Point>) {
  const source = map.getSource(HOTSPOT_SOURCE)
  if (source && 'setData' in source && typeof source.setData === 'function') source.setData(points)
}

/** One frame of the marker pulse: a ring that grows and fades, `phase` 0 to 1. */
export function setHotspotPulse(map: MaplibreMap, phase: number) {
  if (!map.getLayer(HOTSPOT_PULSE)) return
  map.setPaintProperty(HOTSPOT_PULSE, 'circle-radius', 4 + phase * 10)
  map.setPaintProperty(HOTSPOT_PULSE, 'circle-stroke-opacity', 0.8 * (1 - phase))
}
