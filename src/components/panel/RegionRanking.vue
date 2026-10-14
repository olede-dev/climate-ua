<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import { formatPeriod, type ValueFormat } from '../../lib/format'
import { RANK_SORTS, regionRanks, sortRanks, type RankSort } from '../../lib/regionRanking'
import { colorAt } from '../../lib/scale'
import type { TimeStep } from '../../lib/time'
import type { LayerFile } from '../../types'
import RankList, { type RankItem } from '../ui/RankList.vue'
import SelectMenu from '../ui/SelectMenu.vue'

/** Every oblast at the current step, ranked by the value the map shows; a row opens its card. */
const props = defineProps<{
  file: LayerFile
  config: LayerConfig
  step: TimeStep
  format: ValueFormat
  names: Record<string, string>
  selectedId: string | null
}>()
const emit = defineEmits<{ select: [id: string] }>()
const sort = defineModel<RankSort>('sort', { required: true })

const { locale, t } = useLocale()
const copy = computed(() => t.value.ranking)
const sortOptions = computed(() =>
  RANK_SORTS.map((value) => ({ value, label: copy.value.sorts[value] })),
)
const name = (id: string) => props.names[id] ?? id
const badged = computed(() => props.config.display === 'value')

const items = computed<RankItem[]>(() =>
  sortRanks(
    regionRanks(props.file, props.step, props.config.display, props.config.rank),
    sort.value,
    (rank) => name(rank.id),
    locale.value,
  ).map((rank) => {
    const item: RankItem = { id: rank.id, title: name(rank.id) }
    if (rank.value === null) return { ...item, value: '—' }
    const tone = props.config.rank ? rank.tone : 'neutral'
    const marker = { color: colorAt(props.config.scale, rank.value) }
    // An anomaly is graded on itself; a value carries its change from the norm as the badge.
    if (!badged.value) {
      return { ...item, marker, badge: { text: props.format(rank.value, { signed: true }), tone } }
    }
    return {
      ...item,
      marker,
      value: props.format(rank.value),
      badge:
        rank.delta === null
          ? undefined
          : { text: props.format(rank.delta, { signed: true, unit: false }), tone },
    }
  }),
)
const hint = computed(() =>
  badged.value
    ? copy.value.deltaHint.replace(
        '{period}',
        formatPeriod(`${props.file.norm.from}-${props.file.norm.to}`),
      )
    : null,
)
</script>

<template>
  <section class="space-y-2" aria-labelledby="ranking-heading">
    <div class="flex items-center justify-between gap-2 px-1">
      <h2 id="ranking-heading" class="text-[13px] leading-4 font-bold text-ink">
        {{ copy.heading }}
        <span class="font-normal text-ink-muted">{{ items.length }}</span>
      </h2>
      <SelectMenu v-model="sort" class="w-40" :options="sortOptions" :label="copy.sortLabel" />
    </div>
    <RankList
      :items="items"
      :label="copy.heading"
      :selected-id="selectedId"
      chevron
      @select="emit('select', $event)"
    />
    <p v-if="hint" class="px-1 text-[12px] leading-[15px] text-ink-muted">{{ hint }}</p>
  </section>
</template>
