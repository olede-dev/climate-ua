import type { MultiLineString } from 'geojson'
import type { ExpressionSpecification, Map as MaplibreMap } from 'maplibre-gl'

import type { Theme } from '../../composables/useTheme'
import { geojsonData } from '../../lib/fileUrls'
import { mapColorExpression, type ColorScale } from '../../lib/scale'
import type { OblastsFile, RegionsFile } from '../../types'
import { NO_VALIDATE, addLayer, addSource, styleLayers } from './mapStyle'

export const REGION_SOURCE = 'regions'
export const REGION_FILL = 'region-fill'
const REGION_HATCH = 'region-hatch'
const REGION_LINE = 'region-line'
const REGION_HIGHLIGHT = 'region-highlight'
const HATCH_IMAGE = 'future-hatch'
const FOCUS_SATELLITE = 'focus-satellite'
const FOCUS_OBLAST_SOURCE = 'focus-oblasts'
const FOCUS_OBLAST_LINE = 'focus-oblast-line'
const GRID = 'grid'
const BORDER_SOURCE = 'country-border'
const BORDER_GLOW = 'country-border-glow'
const BORDER_LINE = 'country-border-line'
const RIVER_BORDER_LINE = 'country-border-river'
const FUTURE_INK: Record<Theme, string> = { light: '#7c3aed', dark: '#a78bfa' }
/** The rivers layer has no region fill, so the border needs full contrast with the basemap. */
const RIVER_BORDER_INK: Record<Theme, string> = { light: '#000000', dark: '#ffffff' }
const SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const VALUE: ExpressionSpecification = ['feature-state', 'value']
const HOVER: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false]
const SELECTED: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false]

/** Opaque enough that the basemap's own borders inside Ukraine do not show through. */
const FILL_OPACITY = 0.9
const REVEAL_FADE = { duration: 300 }
const DIMMED_OPACITY = 0.45
const FOCUS_GRID_OPACITY = 0.75

const FOCUS_SELECTED_OPACITY = 0.5
const FOCUS_HOVER_OPACITY = 0.3
const FOCUS_FADE = { duration: 400 }

const INK: Record<Theme, { hatch: string; border: string; outline: string }> = {
  dark: {
    hatch: 'rgba(255, 255, 255, 0.16)',
    border: 'rgba(235, 238, 245, 0.32)',
    outline: '#f5f5f7',
  },
  light: {
    hatch: 'rgba(0, 0, 0, 0.18)',
    border: 'rgba(255, 255, 255, 0.7)',
    outline: '#1d1d1f',
  },
}

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

export function addRegionLayers(
  map: MaplibreMap,
  data: RegionsFile,
  scale: ColorScale,
  theme: Theme,
) {
  const ink = INK[theme]
  if (map.getSource(REGION_SOURCE)) return
  addSource(map, REGION_SOURCE, { type: 'geojson', data: geojsonData(data), promoteId: 'id' })
  if (!map.hasImage(HATCH_IMAGE)) map.addImage(HATCH_IMAGE, hatchImage(theme), { pixelRatio: 2 })
  // Over roads and the basemap's borders (no occupation line shows through), under place names.
  const layers = styleLayers(map)
  const beforeId = (
    layers.find((layer) => layer.type === 'symbol' && layer.sourceLayer === 'place') ??
    layers.find((layer) => layer.type === 'symbol')
  )?.id
  addLayer(
    map,
    {
      id: REGION_FILL,
      type: 'fill',
      source: REGION_SOURCE,
      paint: {
        'fill-color': mapColorExpression(scale, VALUE),
        // Hidden until every tile of the source is parsed, so it never shows in pieces.
        'fill-opacity': 0,
        'fill-opacity-transition': REVEAL_FADE,
      },
    },
    beforeId,
  )
  addLayer(
    map,
    {
      id: REGION_HATCH,
      type: 'fill',
      source: REGION_SOURCE,
      layout: { visibility: 'none' },
      paint: { 'fill-pattern': HATCH_IMAGE },
    },
    beforeId,
  )
  addLayer(
    map,
    {
      id: REGION_LINE,
      type: 'line',
      source: REGION_SOURCE,
      paint: {
        'line-color': ink.border,
        'line-width': 0.6,
        'line-opacity': 0,
        'line-opacity-transition': REVEAL_FADE,
      },
    },
    beforeId,
  )
  addLayer(
    map,
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

export function setRegionData(map: MaplibreMap, data: RegionsFile) {
  const source = map.getSource(REGION_SOURCE)
  if (source && 'setData' in source && typeof source.setData === 'function')
    source.setData(geojsonData(data))
}

export function setRegionScale(map: MaplibreMap, scale: ColorScale) {
  if (map.getLayer(REGION_FILL))
    map.setPaintProperty(REGION_FILL, 'fill-color', mapColorExpression(scale, VALUE), NO_VALIDATE)
}

/** The rivers layer draws its own lines and markers; the region fill only gets in their way. */
export function setRegionsShown(map: MaplibreMap, shown: boolean) {
  const visibility = shown ? 'visible' : 'none'
  for (const id of [REGION_FILL, REGION_HIGHLIGHT])
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility, NO_VALIDATE)
}

export function setFutureHatch(map: MaplibreMap, visible: boolean) {
  if (map.getLayer(REGION_HATCH))
    map.setLayoutProperty(REGION_HATCH, 'visibility', visible ? 'visible' : 'none', NO_VALIDATE)
}

export function addFocusLayers(map: MaplibreMap, oblasts: OblastsFile) {
  if (map.getSource(FOCUS_OBLAST_SOURCE) || !map.getLayer(REGION_FILL)) return
  addSource(map, FOCUS_SATELLITE, {
    type: 'raster',
    tiles: [SATELLITE_URL],
    tileSize: 256,
    maxzoom: 18,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  })
  addLayer(
    map,
    {
      id: FOCUS_SATELLITE,
      type: 'raster',
      source: FOCUS_SATELLITE,
      // Muted: the fields' own colour and contrast would drown the grid's gradient over them.
      paint: {
        'raster-opacity': 0,
        'raster-opacity-transition': FOCUS_FADE,
        'raster-saturation': -0.6,
        'raster-contrast': -0.3,
      },
    },
    REGION_FILL,
  )
  addSource(map, FOCUS_OBLAST_SOURCE, { type: 'geojson', data: geojsonData(oblasts) })
  addLayer(
    map,
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

export function setFillOpacity(
  map: MaplibreMap,
  hovering: boolean,
  focused: boolean,
  theme: Theme,
  revealed: boolean,
) {
  if (!map.getLayer(REGION_FILL)) return
  // Over the raster the fill stays invisible: it only catches the pointer for hover and click.
  map.setPaintProperty(
    REGION_FILL,
    'fill-opacity',
    map.getLayer(GRID) || !revealed
      ? 0
      : focused
        ? ['case', SELECTED, FOCUS_SELECTED_OPACITY, HOVER, FOCUS_HOVER_OPACITY, 0]
        : hovering
          ? ['case', HOVER, FILL_OPACITY, DIMMED_OPACITY]
          : FILL_OPACITY,
    NO_VALIDATE,
  )
  if (map.getLayer(GRID))
    map.setPaintProperty(
      GRID,
      'raster-opacity',
      !revealed ? 0 : focused ? FOCUS_GRID_OPACITY : FILL_OPACITY,
      NO_VALIDATE,
    )
  map.setPaintProperty(REGION_LINE, 'line-opacity', focused || !revealed ? 0 : 1, NO_VALIDATE)
  // The theme's dark outline is lost on imagery; white reads on both.
  map.setPaintProperty(
    REGION_HIGHLIGHT,
    'line-color',
    focused ? '#ffffff' : INK[theme].outline,
    NO_VALIDATE,
  )
  map.setPaintProperty(
    REGION_HIGHLIGHT,
    'line-width',
    focused ? ['case', SELECTED, 3, HOVER, 1.6, 0] : ['case', SELECTED, 2.2, HOVER, 1.6, 0],
    NO_VALIDATE,
  )
  if (map.getLayer(FOCUS_SATELLITE))
    map.setPaintProperty(FOCUS_SATELLITE, 'raster-opacity', focused ? 1 : 0, NO_VALIDATE)
  if (map.getLayer(FOCUS_OBLAST_LINE))
    map.setPaintProperty(FOCUS_OBLAST_LINE, 'line-opacity', focused ? 0.9 : 0, NO_VALIDATE)
}

export function addCountryBorder(map: MaplibreMap, border: MultiLineString, theme: Theme) {
  if (map.getSource(BORDER_SOURCE) || !map.getLayer(REGION_HIGHLIGHT)) return
  addSource(map, BORDER_SOURCE, { type: 'geojson', data: border })
  const color = FUTURE_INK[theme]
  const layout = { 'line-join': 'round', 'line-cap': 'round' } as const
  addLayer(
    map,
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
  addLayer(
    map,
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
  addLayer(
    map,
    {
      id: RIVER_BORDER_LINE,
      type: 'line',
      source: BORDER_SOURCE,
      layout: { ...layout, visibility: 'none' },
      paint: { 'line-color': RIVER_BORDER_INK[theme], 'line-width': 1.6, 'line-opacity': 0.55 },
    },
    REGION_HIGHLIGHT,
  )
}

export function setRiverBorder(map: MaplibreMap, visible: boolean) {
  if (map.getLayer(RIVER_BORDER_LINE))
    map.setLayoutProperty(
      RIVER_BORDER_LINE,
      'visibility',
      visible ? 'visible' : 'none',
      NO_VALIDATE,
    )
}

export function setCountryBorder(map: MaplibreMap, visible: boolean) {
  if (map.getLayer(BORDER_GLOW))
    map.setPaintProperty(BORDER_GLOW, 'line-opacity', visible ? 0.55 : 0, NO_VALIDATE)
  if (map.getLayer(BORDER_LINE))
    map.setPaintProperty(BORDER_LINE, 'line-opacity', visible ? 1 : 0, NO_VALIDATE)
}

export function setGridImage(
  map: MaplibreMap,
  image: { url: string; coordinates: [number, number][] } | null,
) {
  if (!map.getLayer(REGION_FILL)) return
  const source = map.getSource(GRID)
  if (!image) {
    if (map.getLayer(GRID)) map.removeLayer(GRID)
    if (source) map.removeSource(GRID)
    return
  }
  const coordinates = image.coordinates as [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ]
  if (source && 'updateImage' in source && typeof source.updateImage === 'function') {
    source.updateImage({ url: image.url, coordinates })
    return
  }
  addSource(map, GRID, { type: 'image', url: image.url, coordinates })
  addLayer(
    map,
    {
      id: GRID,
      type: 'raster',
      source: GRID,
      paint: {
        'raster-opacity': 0,
        'raster-opacity-transition': REVEAL_FADE,
        'raster-resampling': 'linear',
        'raster-fade-duration': 0,
      },
    },
    REGION_FILL,
  )
}
