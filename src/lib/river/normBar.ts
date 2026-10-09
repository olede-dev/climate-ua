import type { RiverNormDay } from '../../types'
import { ANOMALY_CLASSES } from './marks'

/** Share of the p10–p90 span added beyond the outer bounds, so the outer classes show. */
const PAD = 0.25

export interface NormBarScale {
  low: number
  high: number
  /** CSS gradient with a hard stop at each class bound of the norm. */
  gradient: string
  /** 0–1 along the bar. */
  at: (value: number) => number
}

/**
 * The station card's norm bar: today's day-of-year norm laid out in discharge, with each water
 * state class over its own range (below p10, p10–p25, p25–p75, p75–p90, above p90) and room
 * for today's value even when it falls far outside.
 */
export function normBarScale(norm: RiverNormDay, current: number | null): NormBarScale {
  const pad = (norm.p90 - norm.p10) * PAD
  const values = current === null ? [] : [current]
  const low = Math.max(0, Math.min(norm.p10 - pad, ...values))
  const high = Math.max(norm.p90 + pad, ...values)
  const span = high > low ? high - low : 1
  const at = (value: number) => Math.min(1, Math.max(0, (value - low) / span))
  const bounds = [low, norm.p10, norm.p25, norm.p75, norm.p90, high]
  const colors = ANOMALY_CLASSES.flatMap((c) => (c.color ? [c.color] : []))
  const pct = (value: number) => `${(at(value) * 100).toFixed(2)}%`
  const bands = colors.map((color, i) => `${color} ${pct(bounds[i]!)} ${pct(bounds[i + 1]!)}`)
  return { low, high, gradient: `linear-gradient(to right, ${bands.join(', ')})`, at }
}
