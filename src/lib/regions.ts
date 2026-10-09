import type { Locale, Messages } from '../i18n'
import type { BasinProperties, OblastProperties, Station } from '../types'
import { inRegion } from './narrative'

export interface RegionLabel {
  name: string
  where: string
  subtitle: string | null
  note: string | null
}

export function oblastName(oblast: OblastProperties, locale: Locale): string {
  return locale === 'uk' ? oblast.nameUk : oblast.nameEn
}

export function oblastLabel(oblast: OblastProperties, locale: Locale): RegionLabel {
  const name = oblastName(oblast, locale)
  return { name, where: inRegion(name, locale), subtitle: null, note: null }
}

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
    subtitle: oblasts.length > 0 ? `${oblasts.join('; ')}.` : null,
    note: basin.kakhovka ? copy.kakhovka : null,
  }
}

export function stationLabel(
  station: Station,
  locale: Locale,
  copy: Messages['station'],
): RegionLabel {
  const slots = (template: string) =>
    template
      .replace('{river}', locale === 'uk' ? station.river : station.riverEn)
      .replace('{place}', locale === 'uk' ? station.place : station.placeEn)
  return {
    name: slots(copy.name),
    where: slots(copy.where),
    subtitle: null,
    note: station.regulated ? copy.regulated : null,
  }
}
