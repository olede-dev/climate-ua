<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import type { LayerCopy } from '../../i18n'
import type { ValueFormat } from '../../lib/format'
import { summaryStory, type StoryInput } from '../../lib/narrative'
import { BOUNDS } from '../../lib/series'
import { summaryRows } from '../../lib/summary'
import type { RegionLabel } from '../../lib/regions'
import { isFuture, type TimeStep } from '../../lib/time'
import { countryColor, WATER_SCENARIOS, WATER_SECTORS, WATER_USE_VIEWS } from '../../lib/waterUse'
import type {
  LayerFile,
  Sectors,
  ProjectionBound,
  WaterScenario,
  WaterSector,
  WaterView,
} from '../../types'
import WaterTabs from '../map/WaterTabs.vue'
import { RichText } from '../ui/RichText'
import CountrySummary from './CountrySummary.vue'
import RegionCard from './RegionCard.vue'
import WaterSectors from './WaterSectors.vue'

const props = defineProps<{
  file: LayerFile
  config: LayerConfig
  copy: LayerCopy
  step: TimeStep
  format: ValueFormat
  region: (RegionLabel & { id: string }) | null
  water?: { view: WaterView; sector: WaterSector } | null
  scenario?: WaterScenario
  projectionRange?: { bound: ProjectionBound; values: Record<ProjectionBound, number> } | null
  regionSectors?: Sectors | null
  /** The rivers layer: whether its forecast view is open. */
  river?: { forecast: boolean } | null
}>()
const emit = defineEmits<{
  close: []
  sector: [WaterSector]
  view: [WaterView]
  scenario: [WaterScenario]
  bound: [ProjectionBound]
  future: [boolean]
  riverForecast: [boolean]
}>()

const { t } = useLocale()

const futureOn = computed(() =>
  props.river
    ? props.river.forecast
    : props.water
      ? props.water.view === 'future'
      : isFuture(props.step),
)
const futureOffered = computed(() =>
  props.river
    ? !futureOn.value
    : props.water
      ? props.water.view === 'gap'
      : !futureOn.value && props.file.futurePeriods.length > 0,
)
const futureHint = computed(() => {
  if (props.river) return t.value.river.futureHint
  if (props.water) return t.value.waterUse.futureHint
  const last = props.file.futurePeriods[props.file.futurePeriods.length - 1]
  return last ? t.value.panel.futureHint.replace('{year}', last.split('-').pop()!) : ''
})
function openFuture(on: boolean) {
  if (props.river) emit('riverForecast', on)
  else if (props.water) emit('view', on ? 'future' : 'gap')
  else emit('future', on)
}

function story(where: string, series: StoryInput['series']): StoryInput {
  return {
    file: props.file,
    series,
    step: props.step,
    headline: props.config.headlinePeriod,
    bound: props.projectionRange?.bound ?? 'median',
    where,
    layerCopy: props.copy.story,
    // Demand and the gap have no projection; the future view's range is of single years.
    copy: waterHistory.value
      ? { ...t.value.story, noForecast: t.value.waterUse.noForecast }
      : props.water
        ? { ...t.value.story, range: t.value.waterUse.range }
        : t.value.story,
    format: props.format,
    decimals: props.config.decimals,
  }
}

const VIEW_ICONS: Record<(typeof WATER_USE_VIEWS)[number], string> = {
  gap: 'M8 1.5C5.5 5 4 7.3 4 9.5a4 4 0 0 0 8 0c0-2.2-1.5-4.5-4-8zM2.5 2.5l11 11',
  demand: 'M2 5.5h7a3 3 0 0 1 3 3v1M2 3.5v4M5.5 5.5V3M4 3h3M12 12v2',
}
const waterViews = computed(() =>
  WATER_USE_VIEWS.map((id) => ({ id, label: t.value.waterUse.views[id], icon: VIEW_ICONS[id] })),
)

const SCENARIO_MARKS: Record<WaterScenario, { icon: string; tone: string }> = {
  'SSP1-2.6': {
    icon: 'M3 13c0-6 4-10 10-10 0 6-4 10-10 10zM3 13l5-5',
    tone: 'bg-emerald-500',
  },
  'SSP3-7.0': { icon: 'M4 14V2.5M4 3h8l-1.5 3L12 9H4', tone: 'bg-amber-500' },
  'SSP5-8.5': {
    icon: 'M8 14.5c-2.8 0-4.5-1.8-4.5-4.3C3.5 7 7 5.5 7 1.5c2.5 1.5 5.5 4.5 5.5 8.7 0 2.5-1.7 4.3-4.5 4.3z',
    tone: 'bg-red-500',
  },
}
const scenarioViews = computed(() =>
  WATER_SCENARIOS.map((id) => ({
    id,
    label: t.value.waterUse.scenarios[id].name,
    about: `${id}. ${t.value.waterUse.scenarios[id].about}`,
    ...SCENARIO_MARKS[id],
  })),
)

const BOUND_MARKS: Record<ProjectionBound, { icon: string; tone: string }> = {
  min: { icon: 'M8 2.5v11M3.5 9 8 13.5 12.5 9', tone: 'bg-emerald-500' },
  median: {
    icon: 'M2 8h3.5M10.5 8H14M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z',
    tone: 'bg-amber-500',
  },
  max: { icon: 'M8 13.5v-11M3.5 7 8 2.5 12.5 7', tone: 'bg-red-500' },
}
const boundViews = computed(() => {
  const range = props.projectionRange
  if (!range) return []
  const copy = props.water ? t.value.waterUse.futureCard : t.value.panel
  return BOUNDS.map((id) => ({
    id,
    label: `${copy.bounds[id]} · ${props.format(range.values[id])}`,
    about: copy.boundsAbout[id],
    ...BOUND_MARKS[id],
  }))
})

const waterHistory = computed(() => !!props.water && props.water.view !== 'future')
/**
 * The water country value, coloured by where it sits in the country's own observed record: the
 * sum of the basins is far above the basin scale.
 */
const countryValueColor = computed(() => {
  const kind = futureOn.value ? 'future' : 'observed'
  const value = rows.value.find((row) => row.kind === kind)?.value
  return props.water && value != null ? countryColor(props.file.country, value) : null
})
const sectorItems = computed(() =>
  WATER_SECTORS.map((id) => ({ id, ...t.value.waterUse.sectors[id] })),
)

const countryWhere = computed(() =>
  props.file.geometry === 'stations'
    ? t.value.story.stations.replace('{n}', String(Object.keys(props.file.regions).length))
    : t.value.story.country,
)
const summary = computed(() => summaryStory(story(countryWhere.value, props.file.country)))
const rows = computed(() =>
  summaryRows(
    props.file,
    props.file.country,
    props.step,
    props.config.headlinePeriod,
    props.config.display,
  ),
)
const regionSeries = computed(() =>
  props.region ? props.file.regions[props.region.id] : undefined,
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.region) emit('close')
}
</script>

<template>
  <aside class="flex flex-col" :aria-label="t.home.panel" @keydown="onKeydown">
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <slot v-if="region && $slots.card" name="card" />
      <RegionCard
        v-else-if="region && regionSeries"
        :id="region.id"
        :key="region.id"
        :name="region.name"
        :subtitle="region.subtitle"
        :note="region.note"
        :file="file"
        :series="regionSeries"
        :config="config"
        :step="step"
        :format="format"
        :zero-note="water?.view === 'gap' ? t.waterUse.noGap : null"
        :chart-title="copy.chartTitle"
        :copy="copy"
        :compact="waterHistory"
        :sectors="regionSectors"
        @close="emit('close')"
      />
      <div v-else class="space-y-3">
        <WaterTabs
          v-if="water?.view === 'future' && scenario"
          :model-value="scenario"
          stacked
          :views="scenarioViews"
          :label="t.waterUse.scenariosLabel"
          @update:model-value="emit('scenario', $event)"
        />
        <p class="sr-only"><RichText :text="summary" /></p>
        <template v-if="water && water.view !== 'future'">
          <WaterTabs
            :model-value="water.view"
            :views="waterViews"
            :label="t.waterUse.viewsLabel"
            @update:model-value="emit('view', $event)"
          />
          <p class="text-[13px] leading-relaxed text-ink">{{ t.waterUse.intro[water.view] }}</p>
          <WaterSectors
            :model-value="water.sector"
            :sectors="sectorItems"
            :label="t.waterUse.sectorsLabel"
            @update:model-value="emit('sector', $event)"
          >
            <CountrySummary
              :rows="rows"
              :file="file"
              :config="config"
              :copy="copy"
              :format="format"
              compact
              :value-color="countryValueColor"
            />
          </WaterSectors>
        </template>
        <CountrySummary
          v-else
          :rows="rows"
          :file="file"
          :config="config"
          :copy="copy"
          :format="format"
          :value-color="countryValueColor"
          :focus="futureOn ? 'future' : 'observed'"
        />
        <slot name="overview" />
        <section v-if="projectionRange" class="space-y-1.5">
          <h3 class="px-1 text-[13px] font-semibold text-ink">{{ t.panel.boundsTitle }}</h3>
          <WaterTabs
            :model-value="projectionRange.bound"
            stacked
            :views="boundViews"
            :label="t.panel.boundsTitle"
            @update:model-value="emit('bound', $event)"
          />
        </section>
      </div>
    </div>
    <div v-if="futureOn" class="shrink-0 px-4 pb-4">
      <button
        type="button"
        class="group flex w-full items-center gap-3 rounded-xl bg-accent px-3 py-3 text-left text-white shadow-card transition-colors hover:bg-accent-hover focus-ring"
        @click="openFuture(false)"
      >
        <span
          aria-hidden="true"
          class="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg text-white transition-transform group-hover:-translate-x-0.5"
          >←</span
        >
        <span class="text-[15px] font-semibold text-white">{{ t.waterUse.back }}</span>
      </button>
    </div>
    <div v-else-if="futureOffered" class="shrink-0 px-4 pb-4">
      <button
        type="button"
        class="group flex w-full items-center gap-3 future-gradient rounded-xl px-3 py-3 text-left text-white shadow-card transition-[filter] hover:brightness-110 focus-ring"
        @click="openFuture(true)"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white"
          aria-hidden="true"
        >
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 13l12-6 2 4-12 6z M15 7l3-1.5 2 4-3 1.5 M9 16l-2 5 M11 15l2 6" />
          </svg>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-semibold text-white">{{ t.waterUse.future }}</span>
          <span class="block text-xs text-white/90">{{ futureHint }}</span>
        </span>
        <span
          aria-hidden="true"
          class="text-lg text-white transition-transform group-hover:translate-x-0.5"
          >→</span
        >
      </button>
    </div>
  </aside>
</template>
