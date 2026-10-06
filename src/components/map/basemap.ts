import {
  setWorkerUrl,
  type FilterSpecification,
  type LayerSpecification,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// `?worker&url` bundles the worker with its shared chunk; a plain `?url` copy fails to start.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

import { HIDDEN_LABELS_PATH, type HiddenLabelsFile } from '../../config/geo'
import type { Locale } from '../../i18n'

setWorkerUrl(workerUrl)

/**
 * OpenFreeMap vector style (OpenMapTiles schema): free, no key, any origin. The map is dark in
 * both page themes (SPEC §7), so single-hue data layers read the same everywhere.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

/** Muted water, so it frames the data layers without competing with them. */
const WATER = { fill: '#15202e', line: '#1f3247' }

/**
 * Region names come from the data layers. The basemap's own first-level labels would repeat
 * them, and OSM names Crimea twice there (SPEC §4.6), so that layer is left out.
 */
const DROPPED_LAYERS = new Set(['place_state'])

/** Place labels drawn over the coloured regions: light and quiet, with a dark halo. */
const PLACE_LABEL = { color: 'rgba(236, 238, 243, 0.78)', halo: 'rgba(10, 10, 12, 0.8)' }

// Esri's label layers are left out of the fallback: they use Russian-derived names such as "Kiev".
const ESRI_CANVAS_URL = (style: string) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${style}/MapServer/tile/{z}/{y}/{x}`
const ESRI_RELIEF_URL = (style: string) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/${style}/MapServer/tile/{z}/{y}/{x}`

/** Shaded relief over the basemap fills and under its labels. */
function reliefLayers(): Pick<StyleSpecification, 'sources' | 'layers'> {
  return {
    sources: {
      relief: {
        type: 'raster',
        tiles: [ESRI_RELIEF_URL('World_Hillshade_Dark')],
        tileSize: 256,
        maxzoom: 16,
        attribution: 'Relief © Esri',
      },
    },
    layers: [
      {
        id: 'relief',
        type: 'raster',
        source: 'relief',
        paint: { 'raster-opacity': 0.3 },
      },
    ],
  }
}

/** Raster style used when the OpenFreeMap style cannot be loaded. */
function esriStyle(): StyleSpecification {
  const relief = reliefLayers()
  return {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: [ESRI_CANVAS_URL('World_Dark_Gray_Base')],
        tileSize: 256,
        maxzoom: 16,
        attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors',
      },
      ...relief.sources,
    },
    layers: [{ id: 'esri', type: 'raster', source: 'esri' }, ...relief.layers],
  }
}

/**
 * Mutes the water, switches labels to the interface language (Latin names as fallback)
 * hides every label inside the `hiddenLabels` countries and slides the relief in under the
 * first label layer.
 */
function adaptStyle(
  style: StyleSpecification,
  locale: Locale,
  hiddenLabels: HiddenLabelsFile | null,
): StyleSpecification {
  const water = WATER
  const label = ['coalesce', ['get', `name:${locale}`], ['get', 'name:latin'], ['get', 'name']]
  const layers = style.layers.flatMap((layer): LayerSpecification[] => {
    if (DROPPED_LAYERS.has(layer.id)) return []
    if (layer.type === 'fill' && layer['source-layer'] === 'water') {
      return [{ ...layer, paint: { ...layer.paint, 'fill-color': water.fill } }]
    }
    if (layer.type === 'line' && layer['source-layer'] === 'waterway') {
      return [{ ...layer, paint: { ...layer.paint, 'line-color': water.line } }]
    }
    if (layer.type === 'symbol' && layer.layout?.['text-field'] !== undefined) {
      const outside = hiddenLabels && (['!', ['within', hiddenLabels]] as FilterSpecification)
      const filter = outside
        ? ((layer.filter ? ['all', layer.filter, outside] : outside) as FilterSpecification)
        : layer.filter
      const paint =
        layer['source-layer'] === 'place'
          ? {
              ...layer.paint,
              'text-color': PLACE_LABEL.color,
              'text-halo-color': PLACE_LABEL.halo,
              'text-halo-width': 1.2,
            }
          : layer.paint
      return [
        {
          ...layer,
          filter,
          paint,
          layout: { ...layer.layout, 'text-field': label },
        } as typeof layer,
      ]
    }
    return [layer]
  })
  const relief = reliefLayers()
  const firstLabel = layers.findIndex((layer) => layer.type === 'symbol')
  const at = firstLabel === -1 ? layers.length : firstLabel
  layers.splice(at, 0, ...relief.layers)
  return { ...style, sources: { ...style.sources, ...relief.sources }, layers }
}

/** Label mask, or null (all labels shown) when it cannot be loaded. */
async function loadHiddenLabels(): Promise<HiddenLabelsFile | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${HIDDEN_LABELS_PATH}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json()) as HiddenLabelsFile
  } catch (error) {
    console.warn('Label mask failed to load; showing all basemap labels', error)
    return null
  }
}

/** Which basemap is drawn; the footer credits its providers (the map has no attribution). */
export type BasemapKind = 'openfreemap' | 'esri'

/**
 * OpenFreeMap dark vector style for a label language, or the Esri dark raster style when the
 * vector style fails to load.
 */
export async function basemapStyle(
  locale: Locale,
): Promise<{ style: StyleSpecification; kind: BasemapKind }> {
  try {
    const [response, hiddenLabels] = await Promise.all([fetch(STYLE_URL), loadHiddenLabels()])
    if (!response.ok) throw new Error(`OpenFreeMap style: HTTP ${response.status}`)
    const style = (await response.json()) as StyleSpecification
    return { style: adaptStyle(style, locale, hiddenLabels), kind: 'openfreemap' }
  } catch (error) {
    console.warn('Vector basemap failed to load; switching to Esri Dark Gray Canvas', error)
    return { style: esriStyle(), kind: 'esri' }
  }
}
