import type {
  FilterSpecification,
  LayerSpecification,
  Map as MaplibreMap,
  StyleSpecification,
} from 'maplibre-gl'

import { HIDDEN_LABELS_PATH, type HiddenLabelsFile } from '../../config/geo'
import type { Theme } from '../../composables/useTheme'
import type { Locale } from '../../i18n'
import { NO_VALIDATE, styleLayers } from './mapStyle'

const PALETTES: Record<
  Theme,
  {
    styleUrl: string
    water: { fill: string; line: string }
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

function adaptStyle(
  style: StyleSpecification,
  locale: Locale,
  theme: Theme,
  hiddenLabels: HiddenLabelsFile | null,
  labelFilters: LabelFilter[],
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
      // The mask is thousands of points; in every label layer at once it would block a phone's
      // main thread on the style load. The labels start hidden and get it one layer per task.
      if (outside)
        labelFilters.push([
          layer.id,
          (layer.filter ? ['all', layer.filter, outside] : outside) as FilterSpecification,
        ])
      const filter = outside ? HIDDEN : layer.filter
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

const IMAGERY_LABEL = { color: '#ffffff', halo: 'rgba(0, 0, 0, 0.75)' }

export function setPlaceLabelsOnImagery(map: MaplibreMap, theme: Theme, onImagery: boolean) {
  const { color, halo } = onImagery ? IMAGERY_LABEL : PALETTES[theme].placeLabel
  for (const layer of styleLayers(map)) {
    if (layer.type !== 'symbol' || layer.sourceLayer !== 'place') continue
    map.setPaintProperty(layer.id, 'text-color', color, NO_VALIDATE)
    map.setPaintProperty(layer.id, 'text-halo-color', halo, NO_VALIDATE)
  }
}

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

export type BasemapKind = 'openfreemap' | 'esri'

/** A label layer and the filter, mask included, it gets after the style loads. */
export type LabelFilter = [layerId: string, filter: FilterSpecification]

const HIDDEN: FilterSpecification = ['boolean', false]

/**
 * Gives the label layers their masked filters, one layer per task so no task runs long.
 * `current` turns false once a newer style replaces this one.
 */
export function applyLabelFilters(
  map: MaplibreMap,
  filters: LabelFilter[],
  current: () => boolean,
) {
  const next = (i: number) => {
    if (i >= filters.length || !current()) return
    const [id, filter] = filters[i]!
    if (map.getLayer(id)) map.setFilter(id, filter, NO_VALIDATE)
    setTimeout(() => next(i + 1), 0)
  }
  next(0)
}

export async function basemapStyle(
  locale: Locale,
  theme: Theme,
): Promise<{ style: StyleSpecification; kind: BasemapKind; labelFilters: LabelFilter[] }> {
  try {
    const [response, hiddenLabels] = await Promise.all([
      fetch(PALETTES[theme].styleUrl),
      loadHiddenLabels(),
    ])
    if (!response.ok) throw new Error(`OpenFreeMap style: HTTP ${response.status}`)
    const style = (await response.json()) as StyleSpecification
    const labelFilters: LabelFilter[] = []
    const adapted = adaptStyle(style, locale, theme, hiddenLabels, labelFilters)
    return { style: adapted, kind: 'openfreemap', labelFilters }
  } catch (error) {
    console.warn('Vector basemap failed to load; switching to Esri Gray Canvas', error)
    return { style: esriStyle(theme), kind: 'esri', labelFilters: [] }
  }
}
