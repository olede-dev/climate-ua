import type { LayerFile } from '../types'
import { valueAt } from './series'
import type { TimeStep } from './time'
import type { Tone } from './tones'

/**
 * When a region's value counts as off its own 1991–2020 norm. `worse` is the direction of the
 * climate signal (warmer, more heat, less snow); the opposite direction stays `good`. Thresholds
 * are in the layer's unit, or in percent of the norm when `relative`.
 */
export interface RankRule {
  worse: 'more' | 'less'
  warn: number
  bad: number
  relative?: boolean
}

export type RankSort = 'desc' | 'asc' | 'name'
export const RANK_SORTS: readonly RankSort[] = ['desc', 'asc', 'name']

export interface RegionRank {
  id: string
  /** The value the map shows at the step: an anomaly for anomaly layers. */
  value: number | null
  /** Value minus the region's norm, in the layer's unit. */
  delta: number | null
  tone: Tone
}

export function rankTone(delta: number, norm: number, rule: RankRule): Tone {
  const size = rule.relative ? (norm === 0 ? 0 : (delta / Math.abs(norm)) * 100) : delta
  const toward = rule.worse === 'more' ? size : -size
  if (toward >= rule.bad) return 'bad'
  if (toward >= rule.warn) return 'warn'
  return 'good'
}

export function regionRanks(
  file: LayerFile,
  step: TimeStep,
  display: 'value' | 'anomaly',
  rule: RankRule | undefined,
): RegionRank[] {
  return Object.entries(file.regions).map(([id, series]) => {
    const raw = valueAt(series, file.history, step)?.median ?? null
    if (raw === null) return { id, value: null, delta: null, tone: 'neutral' }
    const delta = raw - series.norm
    return {
      id,
      value: display === 'anomaly' ? delta : raw,
      delta,
      tone: rule ? rankTone(delta, series.norm, rule) : 'neutral',
    }
  })
}

/** Regions without a value always go last; names break ties. */
export function sortRanks<T extends { value: number | null }>(
  ranks: readonly T[],
  sort: RankSort,
  name: (rank: T) => string,
  locale: string,
): T[] {
  const byName = (a: T, b: T) => name(a).localeCompare(name(b), locale)
  return [...ranks].sort((a, b) => {
    if (sort === 'name') return byName(a, b)
    if (a.value === null || b.value === null) {
      return a.value === b.value ? byName(a, b) : a.value === null ? 1 : -1
    }
    const diff = sort === 'desc' ? b.value - a.value : a.value - b.value
    return diff === 0 ? byName(a, b) : diff
  })
}
