<script setup lang="ts">
import { computed } from 'vue'

import { useKoppen } from '../../composables/useLayer'
import { useLocale } from '../../composables/useLocale'
import { koppenText } from '../../config/koppen'
import { formatPeriod } from '../../lib/format'
import { fill, joinSentences, strong, type Rich } from '../../lib/narrative'
import { RichText } from '../ui/RichText'

/** The oblast's Köppen–Geiger class now and at the end of the century (SPEC §8.5). */
const props = defineProps<{ regionId: string }>()

const { locale, t } = useLocale()
const koppen = useKoppen()

const analog = computed(() => {
  const file = koppen.data.value
  const classes = file?.regions[props.regionId]
  if (!file || !classes) return null
  const [nowPeriod, ...later] = file.periods
  const endPeriod = later.at(-1)
  if (!nowPeriod || !endPeriod) return null
  const now = classes[nowPeriod]
  const end = classes[endPeriod]
  const nowText = koppenText(now, locale.value)
  const endText = koppenText(end, locale.value)
  if (!nowText || !endText) return null

  const copy = t.value.koppen
  const period = formatPeriod(endPeriod)
  const sentences: Rich[] = [fill(copy.now, { name: strong(nowText.name), code: now })]
  sentences.push(
    now === end
      ? fill(copy.same, { period })
      : fill(copy.future, { period, name: strong(endText.name), code: end }),
  )
  return {
    story: joinSentences(sentences),
    meaning: endText.meaning,
    note: copy.note.replace('{scenario}', file.scenario),
  }
})
</script>

<template>
  <section v-if="analog" class="space-y-1.5">
    <h3 class="text-xs font-medium text-ink-muted">{{ t.koppen.title }}</h3>
    <p class="text-[15px] leading-relaxed text-ink"><RichText :text="analog.story" /></p>
    <p class="text-[13px] leading-relaxed text-ink">{{ analog.meaning }}</p>
    <p class="text-[11px] leading-snug text-ink-muted">{{ analog.note }}</p>
  </section>
</template>
