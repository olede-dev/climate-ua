import type { DischargeSource } from '../../api/discharge'
import { isRateLimited } from '../../api/http'
import type { Locale, Messages } from '../../i18n'
import { formatPlainDate } from './format'

/** What to tell the user when discharge could not be loaded at all. */
export function dischargeErrorMessage(error: unknown, copy: Messages['river']['errors']): string {
  return isRateLimited(error) ? copy.rateLimited : copy.loadFailed
}

/** Notice while the snapshot stands in for live data; `null` for live or cached data. */
export function snapshotNotice(
  source: DischargeSource | undefined,
  copy: Messages['river']['errors'],
  locale: Locale,
): string | null {
  if (source?.kind !== 'snapshot' || source.reason === 'pending') return null
  const cause =
    source.reason === 'rate_limited' ? copy.snapshotRateLimited : copy.snapshotUnavailable
  return copy.snapshotNotice
    .replace('{cause}', cause)
    .replace('{date}', formatPlainDate(source.fetchedOn, locale))
}
