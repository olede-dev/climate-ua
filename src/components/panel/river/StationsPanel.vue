<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../../composables/useLocale'
import type { BasinFilter as BasinValue } from '../../../lib/urlState'
import type { RiverBasin, StationState } from '../../../types'
import ErrorState from '../../ui/ErrorState.vue'
import LoadingSkeleton from '../../ui/LoadingSkeleton.vue'
import BasinFilter from './BasinFilter.vue'
import StationList from './StationList.vue'

/** The rivers layer's station list with the basin filter, under the view tabs of the side panel. */
const props = defineProps<{
  /** Already filtered by `basin`. */
  states: readonly StationState[]
  basins: readonly RiverBasin[]
  basin: BasinValue
  selectedId: string | null
  pending: boolean
  /** Set when discharge failed to load. */
  errorMessage: string | null
  /** Set while the snapshot stands in for live data. */
  notice: string | null
  normsError: boolean
}>()
const emit = defineEmits<{ basin: [BasinValue]; select: [id: string]; retry: [] }>()

const { t } = useLocale()
const copy = computed(() => t.value.river.list)
const basinModel = computed({
  get: () => props.basin,
  set: (value: BasinValue) => emit('basin', value),
})
</script>

<template>
  <section class="space-y-3" aria-labelledby="stations-heading">
    <h2 id="stations-heading" class="px-1 text-[13px] font-semibold text-ink">
      {{ copy.heading }}
      <span class="font-normal text-ink-muted">{{ states.length }}</span>
    </h2>
    <BasinFilter v-model="basinModel" :basins="basins" />
    <p v-if="notice" role="status" class="rounded-xl bg-warn-fill px-3 py-2 text-xs text-warn-ink">
      {{ notice }}
    </p>
    <ErrorState v-if="errorMessage" :message="errorMessage" @retry="emit('retry')" />
    <p v-if="normsError" class="text-sm text-ink-muted">{{ copy.normsFailed }}</p>
    <LoadingSkeleton v-if="pending" :label="copy.loading" class="space-y-2">
      <div
        v-for="n in 6"
        :key="n"
        class="h-11 animate-pulse rounded-xl bg-fill motion-reduce:animate-none"
      ></div>
    </LoadingSkeleton>
    <StationList
      v-else
      :states="states"
      :selected-id="selectedId"
      @select="emit('select', $event)"
    />
  </section>
</template>
