import type { Locale, Messages } from '../i18n'
import type { BasinProperties, OblastProperties } from '../types'
import { inRegion } from './narrative'

/** How the panel, the card and the tooltip name a region. */
export interface RegionLabel {
  name: string
  /** For sentences: «у Харківській області», «у басейні річки Десна». */
  where: string
  /** Under the name: the oblasts a basin spans. */
  subtitle: string | null
  /** The former Kakhovka Reservoir lay here (SPEC §13.7). */
  kakhovka: boolean
}

export function oblastName(oblast: OblastProperties, locale: Locale): string {
  return locale === 'uk' ? oblast.nameUk : oblast.nameEn
}

export function oblastLabel(oblast: OblastProperties, locale: Locale): RegionLabel {
  const name = oblastName(oblast, locale)
  return { name, where: inRegion(name, locale), subtitle: null, kakhovka: false }
}

/**
 * A basin is named after its river; without one, after the oblast that holds most of it
 * (SPEC §13.6). `oblastNames` maps oblast ids to names in the current locale.
 */
export function basinLabel(
  basin: BasinProperties,
  oblastNames: Record<string, string>,
  locale: Locale,
  copy: Messages['basin'],
): RegionLabel {
  const river = locale === 'uk' ? basin.riverUk : basin.riverEn
  const oblasts = basin.oblasts.map((id) => oblastNames[id] ?? id)
  const main = oblasts[0]
  let name: string
  let where: string
  if (river) {
    name = copy.named.replace('{river}', river)
    where = copy.namedWhere.replace('{river}', river)
  } else {
    name = main ? copy.unnamed.replace('{where}', inRegion(main, locale)) : basin.id
    where = copy.unnamedWhere
  }
  return {
    name,
    where,
    subtitle: oblasts.length > 0 ? oblasts.join(' · ') : null,
    kakhovka: basin.kakhovka,
  }
}
