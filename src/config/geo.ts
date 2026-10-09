import type { Feature, MultiPolygon } from 'geojson'

export const HIDDEN_LABELS_PATH = 'data/hidden-labels.geojson'

export type HiddenLabelsFile = Feature<MultiPolygon, Record<string, never>>
