import type { ExpressionSpecification, Map as MaplibreMap } from 'maplibre-gl'

import { mapColorExpression, type ColorScale } from '../../lib/scale'
import type { OblastsFile } from '../../types'

export const REGION_SOURCE = 'regions'
export const REGION_FILL = 'region-fill'
const REGION_HATCH = 'region-hatch'
const REGION_LINE = 'region-line'
const REGION_HIGHLIGHT = 'region-highlight'
const HATCH_IMAGE = 'future-hatch'

const VALUE: ExpressionSpecification = ['feature-state', 'value']
const HOVER: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false]
const SELECTED: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false]

/** Opaque enough that the basemap's own borders inside Ukraine do not show through. */
const FILL_OPACITY = 0.9
/** While a region is hovered, the rest dim (SPEC §7). */
const DIMMED_OPACITY = 0.45

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
export function addRegionLayers(map: MaplibreMap, data: OblastsFile, scale: ColorScale) {
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

export function setRegionData(map: MaplibreMap, data: OblastsFile) {
  const source = map.getSource(REGION_SOURCE)
  if (source && 'setData' in source && typeof source.setData === 'function') source.setData(data)
}

export function setRegionScale(map: MaplibreMap, scale: ColorScale) {
  if (map.getLayer(REGION_FILL))
    map.setPaintProperty(REGION_FILL, 'fill-color', mapColorExpression(scale, VALUE))
}

export function setFutureHatch(map: MaplibreMap, visible: boolean) {
  if (map.getLayer(REGION_HATCH))
    map.setLayoutProperty(REGION_HATCH, 'visibility', visible ? 'visible' : 'none')
}

/** Dims every region but the hovered one, or restores them all. */
export function setHoverDim(map: MaplibreMap, hovering: boolean) {
  if (!map.getLayer(REGION_FILL)) return
  map.setPaintProperty(
    REGION_FILL,
    'fill-opacity',
    hovering ? ['case', HOVER, FILL_OPACITY, DIMMED_OPACITY] : FILL_OPACITY,
  )
}
