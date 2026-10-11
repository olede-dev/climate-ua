import type { FeatureCollection, Point } from 'geojson'
import type { Locale } from '../i18n'
import type { SurfaceWaterBodyEntry, SurfaceWaterManifest } from '../types'

/** Local bodies in card shape; curated ids win if a release ever repeated one. */
export function localWaterbodies(manifest: SurfaceWaterManifest): SurfaceWaterBodyEntry[] {
  const curated = new Set(manifest.catalogue.map((body) => body.id))
  return (manifest.local?.bodies ?? [])
    .filter((body) => !curated.has(body.id))
    .map((body) => ({ ...body, type: 'local' as const }))
}

/** The body's own name, else "near <settlement>" for a local body, else the generic fallback. */
export function waterbodyName(
  body: SurfaceWaterBodyEntry,
  locale: Locale,
  copy: { unnamed: string; nearby: string },
): string {
  const own = locale === 'uk' ? body.nameUk : body.nameEn || body.nameUk
  if (own) return own
  if (body.type !== 'local') return copy.unnamed
  return copy.nearby.replace(
    '{place}',
    (locale === 'uk' ? body.nearUk : body.nearEn) || body.nearUk,
  )
}

/**
 * Smallest area, in km², labelled at each zoom: a few dozen country-scale bodies first,
 * everything at district scale. Larger bodies win label collisions through the sort key.
 */
export const LABEL_MIN_KM2 = ['step', ['zoom'], 20, 6.5, 5, 7.5, 2, 8.5, 0] as const

export function localLabelPoints(
  bodies: SurfaceWaterBodyEntry[],
  locale: Locale,
  copy: { unnamed: string; nearby: string },
): FeatureCollection<Point, { id: string; label: string; km2: number }> {
  return {
    type: 'FeatureCollection',
    features: bodies.flatMap((body) =>
      body.type === 'local'
        ? [
            {
              type: 'Feature' as const,
              properties: {
                id: body.id,
                label: waterbodyName(body, locale, copy),
                km2: body.zoneM2 / 1e6,
              },
              geometry: { type: 'Point' as const, coordinates: body.markerCoordinates },
            },
          ]
        : [],
    ),
  }
}
