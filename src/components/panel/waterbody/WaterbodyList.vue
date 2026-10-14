<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '../../../composables/useLocale'
import { CHANGE_TONES, changeTone, type summaryChange } from '../../../lib/waterbodyCard'
import type { SurfaceWaterCatalogueEntry } from '../../../types'
import RankList, { type RankItem } from '../../ui/RankList.vue'

// Figures are passed only in comparison mode; the annual view keeps a plain list of links.
// A missing key means that body's series is still loading.
const props = defineProps<{
  bodies: readonly SurfaceWaterCatalogueEntry[]
  comparison?: {
    before: number
    after: number
    figures: Record<string, ReturnType<typeof summaryChange> | undefined>
  }
}>()
const emit = defineEmits<{ select: [id: string] }>()
const { locale, t } = useLocale()
const copy = computed(() => t.value.surfaceWater)
const area = (m2: number) =>
  `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: m2 < 1e8 ? 1 : 0 }).format(m2 / 1e6)} ${copy.value.km2}`
const percent = (value: number) =>
  `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(value).replace('-', '−')}%`

const items = computed<RankItem[]>(() =>
  props.bodies.map((body) => {
    const item: RankItem = {
      id: body.id,
      title: (locale.value === 'uk' ? body.nameUk : body.nameEn) || copy.value.unnamed,
      subtitle: copy.value[body.type],
    }
    const comparison = props.comparison
    if (!comparison) return item
    if (!(body.id in comparison.figures)) return { ...item, loading: true }
    const figure = comparison.figures[body.id]
    const tone = figure?.percent == null ? 'neutral' : CHANGE_TONES[changeTone(figure.percent)]
    return {
      ...item,
      marker: { tone },
      value: figure ? area(figure.m2) : '—',
      badge: figure?.percent == null ? undefined : { text: percent(figure.percent), tone },
    }
  }),
)
</script>

<template>
  <section>
    <h2 class="px-1 pb-2 text-[13px] leading-4 font-bold text-ink">
      {{
        comparison
          ? copy.listHeading.replace('{year}', String(comparison.after))
          : copy.listHeadingAnnual
      }}
    </h2>
    <RankList :items="items" :label="copy.name" chevron @select="emit('select', $event)" />
  </section>
</template>
