import type { Feature, MultiPolygon } from 'geojson'

/**
 * Path under `public/`. From Natural Earth: the countries whose basemap labels are not shown.
 */
export const HIDDEN_LABELS_PATH = 'data/hidden-labels.geojson'

export type HiddenLabelsFile = Feature<MultiPolygon, Record<string, never>>
