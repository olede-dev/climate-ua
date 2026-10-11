import type {
  AddLayerObject,
  CanvasSourceSpecification,
  Map as MaplibreMap,
  SourceSpecification,
  StyleLayer,
  StyleSetterOptions,
} from 'maplibre-gl'

/**
 * MapLibre checks every style edit against the whole serialized style, the GeoJSON of every
 * source included: one call costs up to ~100 ms on a phone. The app's own layers are fixed, so
 * production skips the check; dev builds keep it for its error messages. Pass it to every
 * `setPaintProperty`, `setLayoutProperty` and `setFilter`; add sources and layers through the
 * helpers below, since `Map.addSource`/`addLayer` take no options.
 */
export const NO_VALIDATE: StyleSetterOptions = { validate: import.meta.env.DEV }

export function addSource(
  map: MaplibreMap,
  id: string,
  source: SourceSpecification | CanvasSourceSpecification,
) {
  map.style.addSource(id, source, NO_VALIDATE)
  map._update(true)
}

export function addLayer(map: MaplibreMap, layer: AddLayerObject, beforeId?: string) {
  map.style.addLayer(layer, beforeId, NO_VALIDATE)
  map._update(true)
}

/** The style's layers in draw order, read without `getStyle()`, which serializes the data too. */
export function styleLayers(map: MaplibreMap): StyleLayer[] {
  return map
    .getLayersOrder()
    .map((id) => map.getLayer(id))
    .filter((layer) => layer !== undefined)
}
