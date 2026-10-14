<script setup lang="ts">
import { computed } from 'vue'

import { useKoppen } from '../../composables/useLayer'
import { useLocale } from '../../composables/useLocale'
import { koppenText } from '../../config/koppen'
import { formatPeriod } from '../../lib/format'

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
  return {
    chips: [
      { when: t.value.koppen.now, code: now, ...nowText },
      ...(now === end ? [] : [{ when: formatPeriod(endPeriod), code: end, ...endText }]),
    ],
    note: t.value.koppen.note.replace('{scenario}', file.scenario),
  }
})
</script>

<template>
  <section v-if="analog" class="space-y-2" :title="analog.note">
    <h3 class="px-1 text-[13px] leading-4 font-bold text-ink">{{ t.koppen.title }}</h3>
    <ol class="overflow-hidden rounded-xl bg-group shadow-card">
      <li
        v-for="chip in analog.chips"
        :key="chip.when"
        class="group/row flex items-center gap-2.5 pl-2.5"
        :title="chip.meaning"
      >
        <span
          class="w-10 shrink-0 rounded-md bg-fill-strong px-1 py-0.5 text-center text-[12px] leading-[15px] font-semibold text-ink tabular-nums"
          >{{ chip.code }}</span
        >
        <span
          class="min-w-0 flex-1 py-2 pr-3 text-[13px] leading-4 text-ink group-not-first/row:border-t group-not-first/row:border-line"
        >
          <span class="block text-[11px] leading-[14px] text-ink-muted">{{ chip.when }}</span>
          {{ chip.name }}
        </span>
      </li>
    </ol>
  </section>
</template>
