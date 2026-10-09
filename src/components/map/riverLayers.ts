import type { FeatureCollection, Point } from 'geojson'
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MaplibreMap,
  Marker,
} from 'maplibre-gl'

import type { Theme } from '../../composables/useTheme'
import { NO_DATA_STROKE, type MapMark } from '../../lib/river/marks'
import type { StationPoint } from '../../lib/rivers'
import type { RiverLinesFile } from '../../types'
import { NO_VALIDATE, addLayer, addSource, styleLayers } from './mapStyle'

const LINES_SOURCE = 'river-lines'
const LINE_CASING = 'river-casing'
const LINE = 'river-line'
const STATIONS_SOURCE = 'river-stations'
const STATION = 'river-station'
const STATION_SELECTED = 'river-station-selected'
/** Layers the pointer can hit; the selected copy is drawn over the rest. */
export const STATION_LAYERS = [STATION, STATION_SELECTED]
const LAYERS = [LINE_CASING, LINE, STATION, STATION_SELECTED]

const INK: Record<Theme, { river: string; casing: string; ring: string; selected: string }> = {
  light: { river: '#2563eb', casing: '#ffffff', ring: '#ffffff', selected: '#0f172a' },
  dark: { river: '#60a5fa', casing: '#0f172a', ring: '#0f172a', selected: '#ffffff' },
}
/** Opacity factor for rivers outside the selected station's reach. */
const DIMMED = 0.3
/** Tint steps from the station outwards, as `build_river_lines.py` writes `tintStep`. */
const FADE_STEPS = 4
const POP_MS = 600

const TINTED: ExpressionSpecification = ['to-boolean', ['feature-state', 'tint']]
const FOCUSED: ExpressionSpecification = ['boolean', ['feature-state', 'focused'], false]
const MAJOR: ExpressionSpecification = ['==', ['get', 'major'], true]

/** Widths grow with zoom; tinted reaches are a little thicker, the focused one more so. */
function lineWidth(extra: number): ExpressionSpecification {
  const at = (zoom: number): ExpressionSpecification => [
    '+',
    ['case', MAJOR, 1.6 + Math.max(0, zoom - 5) * 0.6, 0.9 + Math.max(0, zoom - 5) * 0.35],
    ['case', FOCUSED, 2.5 + extra, TINTED, 1.2 + extra, extra],
  ]
  return ['interpolate', ['linear'], ['zoom'], 5, at(5), 14, at(14)]
}

/** A tint fades back to the plain river colour with `tintStep`; `null` keeps the plain colour. */
function lineColor(theme: Theme): ExpressionSpecification {
  const base = INK[theme].river
  return [
    'case',
    TINTED,
    [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'tintStep'], 0],
      0,
      ['to-color', ['feature-state', 'tint']],
      FADE_STEPS,
      base,
    ],
    base,
  ]
}

function lineOpacity(dimmed: boolean): ExpressionSpecification {
  const fade = dimmed ? DIMMED : 1
  return ['case', FOCUSED, 1, TINTED, 0.95 * fade, MAJOR, 0.85 * fade, 0.6 * fade]
}

const HAS_FILL: ExpressionSpecification = ['to-boolean', ['feature-state', 'fill']]
const FILL: ExpressionSpecification = [
  'to-color',
  ['coalesce', ['feature-state', 'fill'], 'rgba(0,0,0,0)'],
]

export function hasRiverLayers(map: MaplibreMap): boolean {
  return map.getLayer(STATION) !== undefined
}

export function hasRiverLines(map: MaplibreMap): boolean {
  return map.getLayer(LINE) !== undefined
}

/**
 * Lines over the region layers and under place names, markers over the lines. Lines join
 * once `lines` loads; until then only the markers show.
 */
export function addRiverLayers(
  map: MaplibreMap,
  stations: FeatureCollection<Point, StationPoint>,
  lines: RiverLinesFile | null,
  theme: Theme,
) {
  const ink = INK[theme]
  const beforeId = styleLayers(map).find(
    (layer) => layer.type === 'symbol' && layer.sourceLayer === 'place',
  )?.id
  if (!map.getSource(STATIONS_SOURCE)) {
    addSource(map, STATIONS_SOURCE, { type: 'geojson', data: stations, promoteId: 'id' })
    const paint = {
      'circle-color': FILL,
      'circle-opacity': 0.95,
      'circle-radius': ['get', 'radius'] as ExpressionSpecification,
    }
    addLayer(
      map,
      {
        id: STATION,
        type: 'circle',
        source: STATIONS_SOURCE,
        paint: {
          ...paint,
          'circle-stroke-color': ['case', HAS_FILL, ink.ring, NO_DATA_STROKE],
          'circle-stroke-width': ['case', HAS_FILL, 1.5, 2],
        },
      },
      beforeId,
    )
    addLayer(
      map,
      {
        id: STATION_SELECTED,
        type: 'circle',
        source: STATIONS_SOURCE,
        filter: ['==', ['get', 'id'], ''],
        paint: { ...paint, 'circle-stroke-color': ink.selected, 'circle-stroke-width': 3 },
      },
      beforeId,
    )
  }
  if (lines && !map.getSource(LINES_SOURCE)) {
    addSource(map, LINES_SOURCE, { type: 'geojson', data: lines, promoteId: 'tintId' })
    const layout = { 'line-cap': 'round', 'line-join': 'round' } as const
    addLayer(
      map,
      {
        id: LINE_CASING,
        type: 'line',
        source: LINES_SOURCE,
        layout,
        paint: {
          'line-color': ink.casing,
          'line-opacity': ['case', FOCUSED, 0.9, 0],
          'line-width': lineWidth(3.5),
        },
      },
      STATION,
    )
    addLayer(
      map,
      {
        id: LINE,
        type: 'line',
        source: LINES_SOURCE,
        layout,
        paint: {
          'line-color': lineColor(theme),
          'line-opacity': lineOpacity(false),
          'line-width': lineWidth(0),
        },
      },
      STATION,
    )
  }
}

export function removeRiverLayers(map: MaplibreMap) {
  for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of [LINES_SOURCE, STATIONS_SOURCE]) if (map.getSource(id)) map.removeSource(id)
}

export function setStationData(map: MaplibreMap, data: FeatureCollection<Point, StationPoint>) {
  map.getSource<GeoJSONSource>(STATIONS_SOURCE)?.setData(data)
}

/** Marker fills and river tints per station id; only feature state changes. */
export function setRiverMarks(map: MaplibreMap, marks: ReadonlyMap<string, MapMark>) {
  const lines = map.getSource(LINES_SOURCE) !== undefined
  for (const [id, mark] of marks) {
    map.setFeatureState({ source: STATIONS_SOURCE, id }, { fill: mark.fill })
    if (lines) map.setFeatureState({ source: LINES_SOURCE, id }, { tint: mark.tint })
  }
}

/**
 * The selected station is drawn over the rest; its reach is outlined, as is a hovered one's,
 * and a selection dims the other rivers.
 */
export function setRiverFocus(
  map: MaplibreMap,
  selectedId: string | null,
  focus: { from: string | null; to: string | null },
) {
  if (map.getLayer(STATION_SELECTED))
    map.setFilter(STATION_SELECTED, ['==', ['get', 'id'], selectedId ?? ''], NO_VALIDATE)
  if (!map.getLayer(LINE)) return
  if (focus.from !== null && focus.from !== focus.to)
    map.setFeatureState({ source: LINES_SOURCE, id: focus.from }, { focused: false })
  if (focus.to !== null)
    map.setFeatureState({ source: LINES_SOURCE, id: focus.to }, { focused: true })
  map.setPaintProperty(LINE, 'line-opacity', lineOpacity(selectedId !== null), NO_VALIDATE)
}

/** A station drawn by an HTML overlay: CSS animates it without redrawing the map. */
export interface StationOverlay {
  id: string
  lngLat: [number, number]
  radius: number
  fill: string
}

/** MapLibre positions the outer box by its transform, so CSS animates the inner one. */
function overlayElement(className: string, { radius, fill }: StationOverlay): HTMLDivElement {
  const element = document.createElement('div')
  const inner = document.createElement('div')
  inner.className = className
  inner.style.setProperty('--size', `${2 * radius}px`)
  inner.style.setProperty('--fill', fill)
  element.append(inner)
  return element
}

/**
 * Pulse rings and the selection pop as CSS-animated HTML markers. Animating paint
 * properties instead restyles and redraws the whole map every frame, which stalls weak GPUs.
 */
/** `MarkerClass` comes from the MapLibre module ClimateMap loads on demand. */
export function createStationAnimator(
  map: MaplibreMap,
  MarkerClass: typeof Marker,
  reducedMotion: () => boolean,
) {
  const rings = new Map<string, { marker: Marker; key: string }>()
  let popMarker: Marker | null = null

  function clearPop() {
    popMarker?.remove()
    popMarker = null
  }

  return {
    /** Rings behind the given stations; others lose theirs. */
    setPulsing(stations: readonly StationOverlay[]) {
      const next = new Map((reducedMotion() ? [] : stations).map((s) => [s.id, s] as const))
      for (const [id, ring] of rings) {
        const station = next.get(id)
        if (station && ring.key === `${station.fill}|${station.radius}`) next.delete(id)
        else {
          ring.marker.remove()
          rings.delete(id)
        }
      }
      for (const station of next.values()) {
        const marker = new MarkerClass({ element: overlayElement('station-pulse', station) })
          .setLngLat(station.lngLat)
          .addTo(map)
        rings.set(station.id, { marker, key: `${station.fill}|${station.radius}` })
      }
    },
    pop(station: StationOverlay, theme: Theme) {
      clearPop()
      if (reducedMotion()) return
      const element = overlayElement('station-pop', station)
      const inner = element.firstElementChild as HTMLElement
      inner.style.setProperty('--stroke', INK[theme].selected)
      inner.style.animationDuration = `${POP_MS}ms`
      inner.addEventListener('animationend', clearPop, { once: true })
      popMarker = new MarkerClass({ element }).setLngLat(station.lngLat).addTo(map)
    },
    stop() {
      for (const ring of rings.values()) ring.marker.remove()
      rings.clear()
      clearPop()
    },
  }
}
