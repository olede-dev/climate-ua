import type { Locale } from '../i18n'
import type { FuturePeriod, LayerFile, ProjectionBound, RegionSeries } from '../types'
import { formatPeriod, type ValueFormat } from './format'
import { valueAt } from './series'
import { isFuture, type TimeStep } from './time'

export interface Segment {
  text: string
  strong?: boolean
}

export type Rich = Segment[]

export function strong(text: string): Rich {
  return [{ text, strong: true }]
}

/**
 * Fills `{name}` slots of a template: a string slot stays plain, a `Rich` slot keeps its own
 * bold runs. A slot without a value is left as written, so a gap shows instead of vanishing.
 */
export function fill(template: string, slots: Record<string, string | Rich>): Rich {
  const out: Rich = []
  const push = (segment: Segment) => {
    if (segment.text === '') return
    const last = out[out.length - 1]
    if (last && !last.strong && !segment.strong) last.text += segment.text
    else out.push({ ...segment })
  }
  template.split(/(\{\w+\})/).forEach((part, i) => {
    const slot = i % 2 === 1 ? slots[part.slice(1, -1)] : undefined
    if (slot === undefined) push({ text: part })
    else if (typeof slot === 'string') push({ text: slot })
    else slot.forEach(push)
  })
  return out
}

function joinSentences(sentences: Rich[]): Rich {
  return fill(
    sentences.map((_, i) => `{${i}}`).join(' '),
    Object.fromEntries(sentences.map((sentence, i) => [i, sentence])),
  )
}

const LOCATIVE_ENDINGS: [RegExp, string][] = [
  [/ька$/, 'ькій'], // Харківська → Харківській
  [/на$/, 'ній'], // Автономна → Автономній
  [/ка$/, 'ці'], // Республіка → Республіці
  [/^область$/, 'області'],
]

export function locativeUk(name: string): string {
  return name
    .split(' ')
    .map((word) => {
      const rule = LOCATIVE_ENDINGS.find(([ending]) => ending.test(word))
      return rule ? word.replace(rule[0], rule[1]) : word
    })
    .join(' ')
}

export function inRegion(name: string, locale: Locale): string {
  if (locale === 'en') return `in ${name}`
  // Before a vowel Ukrainian takes «в»: «в Одеській», not «у Одеській».
  const preposition = /^[АЕЄИІЇОУЮЯ]/i.test(name) ? 'в' : 'у'
  return `${preposition} ${locativeUk(name)}`
}

export interface LayerStoryCopy {
  observed: string
  future: string
  above: string
  below: string
  same: string
}

export interface StoryCopy {
  range: string
  futureEdge: string
  edges: Record<Exclude<ProjectionBound, 'median'>, string>
  missingYear: string
  missingPeriod: string
  noForecast: string
}

export interface StoryInput {
  file: LayerFile
  series: RegionSeries
  step: TimeStep
  headline: FuturePeriod | null
  bound: ProjectionBound
  where: string
  layerCopy: LayerStoryCopy
  copy: StoryCopy
  format: ValueFormat
  decimals: number
}

function deltaPhrase(value: number, norm: number, input: StoryInput): Rich {
  const shown = (v: number) => Number(v.toFixed(input.decimals))
  const difference = shown(value) - shown(norm)
  const delta = input.format(Math.abs(difference))
  if (delta === input.format(0)) return fill(input.layerCopy.same, {})
  return fill(difference > 0 ? input.layerCopy.above : input.layerCopy.below, {
    delta: strong(delta),
  })
}

function observedYear(input: StoryInput): number {
  return isFuture(input.step) ? input.file.history.to : input.step
}

function observedSentence(input: StoryInput): Rich {
  const year = observedYear(input)
  const value = valueAt(input.series, input.file.history, year)
  if (!value) return fill(input.copy.missingYear, { year: String(year) })
  return fill(input.layerCopy.observed, {
    year: String(year),
    where: input.where,
    value: strong(input.format(value.median)),
    delta: deltaPhrase(value.median, input.series.norm, input),
  })
}

function futureSentence(input: StoryInput): Rich {
  const period = isFuture(input.step) ? input.step : input.headline
  if (period === null) return fill(input.copy.noForecast, {})
  const value = input.series.future[period]
  if (!value) return fill(input.copy.missingPeriod, { period: formatPeriod(period) })
  const ranged = value.p10 !== undefined && value.p90 !== undefined
  if (input.bound !== 'median' && ranged) {
    return fill(input.copy.futureEdge, {
      period: formatPeriod(period),
      edge: input.copy.edges[input.bound],
      value: strong(input.format(value.median)),
      delta: deltaPhrase(value.median, input.series.norm, input),
    })
  }
  const range = ranged
    ? fill(input.copy.range, {
        low: input.format(value.p10!, { unit: false }),
        high: input.format(value.p90!, { unit: false }),
      })
    : ''
  return fill(input.layerCopy.future, {
    period: formatPeriod(period),
    value: strong(input.format(value.median)),
    range,
    delta: deltaPhrase(value.median, input.series.norm, input),
  })
}

export function summaryStory(input: StoryInput): Rich {
  return joinSentences([observedSentence(input), futureSentence(input)])
}
