<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import type { Messages } from '../../i18n'
import { plural, type ValueFormat } from '../../lib/format'
import { summaryStory, type StoryInput } from '../../lib/narrative'
import { summaryRows } from '../../lib/summary'
import type { RegionLabel } from '../../lib/regions'
import { isFuture, type TimeStep } from '../../lib/time'
import { countryColor, WATER_SCENARIOS, WATER_SECTORS, WATER_USE_VIEWS } from '../../lib/waterUse'
import type {
  LayerFile,
  LayerId,
  RegionSeries,
  Sectors,
  WaterBand,
  WaterBound,
  WaterScenario,
  WaterSector,
  WaterView,
} from '../../types'
import WaterTabs from '../map/WaterTabs.vue'
import { RichText } from '../ui/RichText'
import CountrySummary from './CountrySummary.vue'
import RegionCard from './RegionCard.vue'
import WaterFuture from './WaterFuture.vue'
import WaterSectors from './WaterSectors.vue'

const props = defineProps<{
  file: LayerFile
  config: LayerConfig
  copy: Messages['layers'][LayerId]
  step: TimeStep
  format: ValueFormat
  /** The open region; null shows the summary for all of Ukraine (SPEC §8.2). */
  region: (RegionLabel & { id: string }) | null
  /** The water layer's view and sector; null on the other layers. */
  water?: { view: WaterView; sector: WaterSector } | null
  /** The water projection's scenario, the country's model range and its observed gap. */
  projection?: {
    scenario: WaterScenario
    bound: WaterBound
    band: WaterBand
    observed: { series: RegionSeries; year: number }
  } | null
  /** The open basin's projection chart, in the future view. */
  regionProjection?: InstanceType<typeof RegionCard>['$props']['projection']
  /** The open basin's split between the uses in the year on screen. */
  regionSectors?: Sectors | null
}>()
const emit = defineEmits<{
  close: []
  sector: [WaterSector]
  view: [WaterView]
  scenario: [WaterScenario]
  bound: [WaterBound]
  /** Another layer's switch between its observed years and its projection periods. */
  future: [boolean]
}>()

const { locale, t } = useLocale()

/** Where the side panel offers the future: the water gap view, or any layer with periods. */
const futureOn = computed(() =>
  props.water ? props.water.view === 'future' : isFuture(props.step),
)
const futureOffered = computed(() =>
  props.water ? props.water.view === 'gap' : !futureOn.value && props.file.futurePeriods.length > 0,
)
const futureHint = computed(() => {
  if (props.water) return t.value.waterUse.futureHint
  const last = props.file.futurePeriods[props.file.futurePeriods.length - 1]
  return last ? t.value.panel.futureHint.replace('{year}', last.split('-').pop()!) : ''
})
function openFuture(on: boolean) {
  if (props.water) emit('view', on ? 'future' : 'gap')
  else emit('future', on)
}

function story(where: string, series: StoryInput['series']): StoryInput {
  return {
    file: props.file,
    series,
    step: props.step,
    headline: props.config.headlinePeriod,
    where,
    layerCopy: props.copy.story,
    // Demand and the gap have no projection; the stress view has.
    copy: waterHistory.value
      ? { ...t.value.story, noForecast: t.value.waterUse.noForecast }
      : t.value.story,
    format: props.format,
    decimals: props.config.decimals,
  }
}

/** Each view's mark: a crossed-out drop for the gap, a tap for the demand. */
const VIEW_ICONS: Record<(typeof WATER_USE_VIEWS)[number], string> = {
  gap: 'M8 1.5C5.5 5 4 7.3 4 9.5a4 4 0 0 0 8 0c0-2.2-1.5-4.5-4-8zM2.5 2.5l11 11',
  demand: 'M2 5.5h7a3 3 0 0 1 3 3v1M2 3.5v4M5.5 5.5V3M4 3h3M12 12v2',
}
const waterViews = computed(() =>
  WATER_USE_VIEWS.map((id) => ({ id, label: t.value.waterUse.views[id], icon: VIEW_ICONS[id] })),
)

/** Each scenario's mark: a leaf for the sustainable path, a flag for the national one, a flame
 * for the fossil one; green to red as the warming grows. */
const SCENARIO_MARKS: Record<WaterScenario, { icon: string; tone: string }> = {
  'SSP1-2.6': {
    icon: 'M3 13c0-6 4-10 10-10 0 6-4 10-10 10zM3 13l5-5',
    tone: 'text-emerald-600 dark:text-emerald-400',
  },
  'SSP3-7.0': { icon: 'M4 14V2.5M4 3h8l-1.5 3L12 9H4', tone: 'text-amber-600 dark:text-amber-400' },
  'SSP5-8.5': {
    icon: 'M8 14.5c-2.8 0-4.5-1.8-4.5-4.3C3.5 7 7 5.5 7 1.5c2.5 1.5 5.5 4.5 5.5 8.7 0 2.5-1.7 4.3-4.5 4.3z',
    tone: 'text-red-600 dark:text-red-400',
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

const waterHistory = computed(() => !!props.water && props.water.view !== 'future')
/** The observed year's country value, coloured by where it sits in the country's own record. */
const countryValueColor = computed(() => {
  const value = rows.value.find((row) => row.kind === 'observed')?.value
  return waterHistory.value && value != null ? countryColor(props.file.country, value) : null
})
const sectorItems = computed(() =>
  WATER_SECTORS.map((id) => ({ id, ...t.value.waterUse.sectors[id] })),
)

/** «в Україні»; for the stations, how many the figure averages. */
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

const futureNote = computed(() => {
  const models = props.file.models
  if (models === undefined) return props.copy.futureNote
  const counted = plural(models, locale.value, props.copy.models).replace('{n}', String(models))
  return props.copy.futureNote.replace('{models}', counted)
})

const pickHint = computed(
  () =>
    ({
      // The water panel is long enough; its basins need no prompt.
      basins: null,
      oblasts: t.value.panel.pickRegion,
      stations: t.value.panel.pickStation,
    })[props.file.geometry],
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.region) emit('close')
}
</script>

<template>
  <aside class="flex flex-col" :aria-label="t.home.panel" @keydown="onKeydown">
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <RegionCard
        v-if="region && regionSeries"
        :id="region.id"
        :key="region.id"
        :name="region.name"
        :subtitle="region.subtitle"
        :kakhovka="region.kakhovka"
        :file="file"
        :series="regionSeries"
        :config="config"
        :step="step"
        :format="format"
        :projection="regionProjection"
        :zero-note="water?.view === 'gap' ? t.waterUse.noGap : null"
        :chart-title="copy.chartTitle"
        :copy="copy"
        :compact="waterHistory"
        :sectors="regionSectors"
        @close="emit('close')"
      />
      <div v-else class="space-y-3">
        <button
          v-if="futureOn"
          type="button"
          class="text-xs font-medium text-accent-ink hover:underline focus-ring"
          @click="openFuture(false)"
        >
          ← {{ t.waterUse.back }}
        </button>
        <WaterTabs
          v-if="water?.view === 'future' && projection"
          :model-value="projection.scenario"
          stacked
          :views="scenarioViews"
          :label="t.waterUse.scenariosLabel"
          @update:model-value="emit('scenario', $event)"
        />
        <p class="sr-only"><RichText :text="summary" /></p>
        <template v-if="water && water.view !== 'future'">
          <WaterTabs
            :model-value="water.view"
            block
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
        <WaterFuture
          v-else-if="water?.view === 'future' && projection"
          :file="file"
          :step="step"
          :format="format"
          :scenario="projection.scenario"
          :bound="projection.bound"
          :band="projection.band"
          :observed="projection.observed"
          @update:bound="emit('bound', $event)"
        />
        <CountrySummary
          v-else
          :rows="rows"
          :file="file"
          :config="config"
          :copy="copy"
          :format="format"
        />
        <p v-if="pickHint" class="text-xs leading-relaxed text-ink-muted">{{ pickHint }}</p>
        <button
          v-if="futureOffered"
          type="button"
          class="group flex w-full items-center gap-3 rounded-xl bg-accent/15 px-3 py-3 text-left ring-1 ring-accent/50 transition-colors hover:bg-accent/25 focus-ring"
          @click="openFuture(true)"
        >
          <!-- A telescope: looking ahead. -->
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white"
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
            <span class="block text-xs font-semibold tracking-wide text-accent-ink uppercase">{{
              t.waterUse.future
            }}</span>
            <span class="block text-xs text-ink">{{ futureHint }}</span>
          </span>
          <span
            aria-hidden="true"
            class="text-lg text-accent-ink transition-transform group-hover:translate-x-0.5"
            >→</span
          >
        </button>
        <!-- The scenario and the method, out of the way until asked for. -->
        <details class="group text-xs text-ink-muted">
          <summary
            class="cursor-pointer list-none rounded font-medium text-ink-muted hover:text-ink focus-ring"
          >
            <span class="inline-block transition-transform group-open:rotate-90">›</span>
            {{ t.panel.aboutData }}
          </summary>
          <p class="mt-2 leading-relaxed">
            <template v-if="file.scenario === 'SSP2-4.5'"
              >{{ t.scenarios[file.scenario] }}
            </template>
            {{ futureNote }}
          </p>
        </details>
      </div>
    </div>
  </aside>
</template>
