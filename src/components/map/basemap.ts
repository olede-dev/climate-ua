import {
  setWorkerUrl,
  type FilterSpecification,
  type LayerSpecification,
  type Map as MaplibreMap,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// `?worker&url` bundles the worker with its shared chunk; a plain `?url` copy fails to start.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

import { HIDDEN_LABELS_PATH, type HiddenLabelsFile } from '../../config/geo'
import type { Theme } from '../../composables/useTheme'
import type { Locale } from '../../i18n'

setWorkerUrl(workerUrl)

/** Basemap colours for each page theme; the map follows the page. */
const PALETTES: Record<
  Theme,
  {
    /** OpenFreeMap vector style (OpenMapTiles schema): free, no key, any origin. */
    styleUrl: string
    /** Muted water, so it frames the data layers without competing with them. */
    water: { fill: string; line: string }
    /** Place labels drawn over the coloured regions: quiet, with a halo of the background. */
    placeLabel: { color: string; halo: string }
    esriCanvas: string
    esriRelief: string
    reliefOpacity: number
  }
> = {
  dark: {
    styleUrl: 'https://tiles.openfreemap.org/styles/dark',
    water: { fill: '#15202e', line: '#1f3247' },
    placeLabel: { color: 'rgba(236, 238, 243, 0.78)', halo: 'rgba(10, 10, 12, 0.8)' },
    esriCanvas: 'World_Dark_Gray_Base',
    esriRelief: 'World_Hillshade_Dark',
    reliefOpacity: 0.3,
  },
  light: {
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    water: { fill: '#c9d9e8', line: '#b4cadf' },
    placeLabel: { color: 'rgba(29, 29, 31, 0.82)', halo: 'rgba(255, 255, 255, 0.85)' },
    esriCanvas: 'World_Light_Gray_Base',
    esriRelief: 'World_Hillshade',
    reliefOpacity: 0.2,
  },
}

/**
 * Region names come from the data layers. The basemap's own first-level labels would repeat
 * them, and OSM names Crimea twice there, so that layer is left out.
 */
const DROPPED_LAYERS = new Set(['place_state'])

// Esri's label layers are left out of the fallback: they use Russian-derived names such as "Kiev".
const ESRI_CANVAS_URL = (style: string) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${style}/MapServer/tile/{z}/{y}/{x}`
const ESRI_RELIEF_URL = (style: string) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/${style}/MapServer/tile/{z}/{y}/{x}`

/** Shaded relief over the basemap fills and under its labels. */
function reliefLayers(theme: Theme): Pick<StyleSpecification, 'sources' | 'layers'> {
  return {
    sources: {
      relief: {
        type: 'raster',
        tiles: [ESRI_RELIEF_URL(PALETTES[theme].esriRelief)],
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
        paint: { 'raster-opacity': PALETTES[theme].reliefOpacity },
      },
    ],
  }
}

/** Raster style used when the OpenFreeMap style cannot be loaded. */
function esriStyle(theme: Theme): StyleSpecification {
  const relief = reliefLayers(theme)
  return {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: [ESRI_CANVAS_URL(PALETTES[theme].esriCanvas)],
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
  theme: Theme,
  hiddenLabels: HiddenLabelsFile | null,
): StyleSpecification {
  const { water, placeLabel } = PALETTES[theme]
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
              'text-color': placeLabel.color,
              'text-halo-color': placeLabel.halo,
              'text-halo-width': 1.2,
            }
          : layer.paint
      return [
        {
          ...layer,
          filter,
          // Positron has labels without paint; an explicit undefined fails style validation.
          ...(paint && { paint }),
          layout: { ...layer.layout, 'text-field': label },
        } as typeof layer,
      ]
    }
    return [layer]
  })
  const relief = reliefLayers(theme)
  const firstLabel = layers.findIndex((layer) => layer.type === 'symbol')
  const at = firstLabel === -1 ? layers.length : firstLabel
  layers.splice(at, 0, ...relief.layers)
  return { ...style, sources: { ...style.sources, ...relief.sources }, layers }
}

/** Place labels over satellite imagery: light text on a dark halo, whatever the theme. */
const IMAGERY_LABEL = { color: '#ffffff', halo: 'rgba(0, 0, 0, 0.75)' }

/** Recolours the place labels for the satellite focus view, or back to the theme's. */
export function setPlaceLabelsOnImagery(map: MaplibreMap, theme: Theme, onImagery: boolean) {
  const { color, halo } = onImagery ? IMAGERY_LABEL : PALETTES[theme].placeLabel
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol' || layer['source-layer'] !== 'place') continue
    map.setPaintProperty(layer.id, 'text-color', color)
    map.setPaintProperty(layer.id, 'text-halo-color', halo)
  }
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
 * OpenFreeMap vector style for a label language and theme, or the Esri raster style of that
 * theme when the vector style fails to load.
 */
export async function basemapStyle(
  locale: Locale,
  theme: Theme,
): Promise<{ style: StyleSpecification; kind: BasemapKind }> {
  try {
    const [response, hiddenLabels] = await Promise.all([
      fetch(PALETTES[theme].styleUrl),
      loadHiddenLabels(),
    ])
    if (!response.ok) throw new Error(`OpenFreeMap style: HTTP ${response.status}`)
    const style = (await response.json()) as StyleSpecification
    return { style: adaptStyle(style, locale, theme, hiddenLabels), kind: 'openfreemap' }
  } catch (error) {
    console.warn('Vector basemap failed to load; switching to Esri Gray Canvas', error)
    return { style: esriStyle(theme), kind: 'esri' }
  }
}
