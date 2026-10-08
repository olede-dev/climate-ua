import type { FeatureCollection, MultiLineString, Point } from 'geojson'
import type { ExpressionSpecification, Map as MaplibreMap } from 'maplibre-gl'

import type { Theme } from '../../composables/useTheme'
import { mapColorExpression, type ColorScale } from '../../lib/scale'
import type { OblastsFile, RegionsFile } from '../../types'

export const REGION_SOURCE = 'regions'
export const REGION_FILL = 'region-fill'
const REGION_HATCH = 'region-hatch'
const REGION_LINE = 'region-line'
const REGION_HIGHLIGHT = 'region-highlight'
const HATCH_IMAGE = 'future-hatch'
export const STATION_SOURCE = 'stations'
export const STATION_DOT = 'station-dot'
const FOCUS_SATELLITE = 'focus-satellite'
const FOCUS_OBLAST_SOURCE = 'focus-oblasts'
const FOCUS_OBLAST_LINE = 'focus-oblast-line'
const BORDER_SOURCE = 'country-border'
const BORDER_GLOW = 'country-border-glow'
const BORDER_LINE = 'country-border-line'
/** The projection's violet, as `--ui-future` in main.css. */
const FUTURE_INK: Record<Theme, string> = { light: '#7c3aed', dark: '#a78bfa' }
const SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const VALUE: ExpressionSpecification = ['feature-state', 'value']
const HOVER: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false]
const SELECTED: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false]

/** Opaque enough that the basemap's own borders inside Ukraine do not show through. */
const FILL_OPACITY = 0.9
/** While a region is hovered, the rest dim (SPEC §7). */
const DIMMED_OPACITY = 0.45
/** In focus the selected basin is a tint over the imagery; the hovered one stays findable. */
const FOCUS_SELECTED_OPACITY = 0.5
const FOCUS_HOVER_OPACITY = 0.3
const FOCUS_FADE = { duration: 400 }

/** Lines over the regions in each theme: hatching, borders, the outline and the dot rings. */
const INK: Record<Theme, { hatch: string; border: string; outline: string; ring: string }> = {
  dark: {
    hatch: 'rgba(255, 255, 255, 0.16)',
    border: 'rgba(235, 238, 245, 0.32)',
    outline: '#f5f5f7',
    ring: '#1a1a19',
  },
  light: {
    hatch: 'rgba(0, 0, 0, 0.18)',
    border: 'rgba(255, 255, 255, 0.7)',
    outline: '#1d1d1f',
    ring: '#ffffff',
  },
}

/** Thin diagonal strokes over the fill: the future is an estimate (SPEC §7). */
function hatchImage(theme: Theme): ImageData {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.strokeStyle = INK[theme].hatch
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
export function addRegionLayers(
  map: MaplibreMap,
  data: RegionsFile,
  scale: ColorScale,
  theme: Theme,
) {
  const ink = INK[theme]
  if (map.getSource(REGION_SOURCE)) return
  map.addSource(REGION_SOURCE, { type: 'geojson', data, promoteId: 'id' })
  if (!map.hasImage(HATCH_IMAGE)) map.addImage(HATCH_IMAGE, hatchImage(theme), { pixelRatio: 2 })
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
      paint: { 'line-color': ink.border, 'line-width': 0.6 },
    },
    beforeId,
  )
  map.addLayer(
    {
      id: REGION_HIGHLIGHT,
      type: 'line',
      source: REGION_SOURCE,
      paint: {
        'line-color': ink.outline,
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
  theme: Theme,
) {
  const ink = INK[theme]
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
        // A ring of the background keeps the dots apart from the regions under them.
        'circle-stroke-color': ['case', SELECTED, ink.outline, HOVER, ink.outline, ink.ring],
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
 * Satellite imagery and oblast borders for the focus view, hidden until a region is selected:
 * without them a zoomed-in basin floats among look-alike neighbours with nothing to place it.
 */
export function addFocusLayers(map: MaplibreMap, oblasts: OblastsFile) {
  if (map.getSource(FOCUS_OBLAST_SOURCE) || !map.getLayer(REGION_FILL)) return
  map.addSource(FOCUS_SATELLITE, {
    type: 'raster',
    tiles: [SATELLITE_URL],
    tileSize: 256,
    maxzoom: 18,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  })
  map.addLayer(
    {
      id: FOCUS_SATELLITE,
      type: 'raster',
      source: FOCUS_SATELLITE,
      paint: { 'raster-opacity': 0, 'raster-opacity-transition': FOCUS_FADE },
    },
    REGION_FILL,
  )
  map.addSource(FOCUS_OBLAST_SOURCE, { type: 'geojson', data: oblasts })
  map.addLayer(
    {
      id: FOCUS_OBLAST_LINE,
      type: 'line',
      source: FOCUS_OBLAST_SOURCE,
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.2,
        'line-dasharray': [3, 2],
        'line-opacity': 0,
        'line-opacity-transition': FOCUS_FADE,
      },
    },
    REGION_HIGHLIGHT,
  )
}

/**
 * Fill opacity and the focus view. A hovered region dims the rest; in focus only the
 * selected region keeps a tint, over satellite imagery and oblast borders.
 */
export function setFillOpacity(
  map: MaplibreMap,
  hovering: boolean,
  focused: boolean,
  theme: Theme,
) {
  if (!map.getLayer(REGION_FILL)) return
  map.setPaintProperty(
    REGION_FILL,
    'fill-opacity',
    focused
      ? ['case', SELECTED, FOCUS_SELECTED_OPACITY, HOVER, FOCUS_HOVER_OPACITY, 0]
      : hovering
        ? ['case', HOVER, FILL_OPACITY, DIMMED_OPACITY]
        : FILL_OPACITY,
  )
  map.setPaintProperty(REGION_LINE, 'line-opacity', focused ? 0 : 1)
  // The theme's dark outline is lost on imagery; white reads on both.
  map.setPaintProperty(REGION_HIGHLIGHT, 'line-color', focused ? '#ffffff' : INK[theme].outline)
  map.setPaintProperty(
    REGION_HIGHLIGHT,
    'line-width',
    focused ? ['case', SELECTED, 3, HOVER, 1.6, 0] : ['case', SELECTED, 2.2, HOVER, 1.6, 0],
  )
  if (map.getLayer(FOCUS_SATELLITE))
    map.setPaintProperty(FOCUS_SATELLITE, 'raster-opacity', focused ? 1 : 0)
  if (map.getLayer(FOCUS_OBLAST_LINE))
    map.setPaintProperty(FOCUS_OBLAST_LINE, 'line-opacity', focused ? 0.9 : 0)
}

/**
 * Ukraine's border in the projection's violet with a soft glow, hidden until a future step
 * is shown: the whole map is then an estimate.
 */
export function addCountryBorder(map: MaplibreMap, border: MultiLineString, theme: Theme) {
  if (map.getSource(BORDER_SOURCE) || !map.getLayer(REGION_HIGHLIGHT)) return
  map.addSource(BORDER_SOURCE, { type: 'geojson', data: border })
  const color = FUTURE_INK[theme]
  const layout = { 'line-join': 'round', 'line-cap': 'round' } as const
  map.addLayer(
    {
      id: BORDER_GLOW,
      type: 'line',
      source: BORDER_SOURCE,
      layout,
      paint: {
        'line-color': color,
        'line-width': 10,
        'line-blur': 8,
        'line-opacity': 0,
        'line-opacity-transition': FOCUS_FADE,
      },
    },
    REGION_HIGHLIGHT,
  )
  map.addLayer(
    {
      id: BORDER_LINE,
      type: 'line',
      source: BORDER_SOURCE,
      layout,
      paint: {
        'line-color': color,
        'line-width': 2.4,
        'line-opacity': 0,
        'line-opacity-transition': FOCUS_FADE,
      },
    },
    REGION_HIGHLIGHT,
  )
}

export function setCountryBorder(map: MaplibreMap, visible: boolean) {
  if (map.getLayer(BORDER_GLOW))
    map.setPaintProperty(BORDER_GLOW, 'line-opacity', visible ? 0.55 : 0)
  if (map.getLayer(BORDER_LINE)) map.setPaintProperty(BORDER_LINE, 'line-opacity', visible ? 1 : 0)
}
