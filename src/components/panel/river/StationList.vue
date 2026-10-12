<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../../composables/useLocale'
import { formatDischarge, formatPct } from '../../../lib/river/format'
import { ANOMALY_CLASSES, NO_DATA_STROKE } from '../../../lib/river/marks'
import type { StationState } from '../../../types'
import RankList, { type RankItem } from '../../ui/RankList.vue'

const props = defineProps<{ states: readonly StationState[]; selectedId: string | null }>()
const emit = defineEmits<{ select: [id: string] }>()

const { locale, t } = useLocale()
const copy = computed(() => t.value.river.list)

const items = computed<RankItem[]>(() =>
  props.states.map(({ station, anomalyClass, anomalyPct, current }) => {
    const color = ANOMALY_CLASSES.find((c) => c.id === anomalyClass)?.color
    const uk = locale.value === 'uk'
    return {
      id: station.id,
      title: uk ? station.river : station.riverEn,
      titleNote: uk ? station.place : station.placeEn,
      subtitle: anomalyClass ? t.value.river.anomalyClasses[anomalyClass] : copy.value.unknownState,
      tag: station.focus ? copy.value.focusBasin : undefined,
      marker: color ? { color } : { ring: NO_DATA_STROKE },
      value: formatPct(anomalyPct, locale.value),
      detail: `${formatDischarge(current, locale.value)} ${t.value.river.dischargeUnit}`,
    }
  }),
)
</script>

<template>
  <RankList
    :items="items"
    :label="copy.listLabel"
    :selected-id="selectedId"
    @select="emit('select', $event)"
  />
</template>
