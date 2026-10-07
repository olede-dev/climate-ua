<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { LayerConfig } from '../../config/layers'
import type { Messages } from '../../i18n'
import { plural, type ValueFormat } from '../../lib/format'
import { summaryStory, type StoryInput } from '../../lib/narrative'
import { summaryRows } from '../../lib/summary'
import type { RegionLabel } from '../../lib/regions'
import type { TimeStep } from '../../lib/time'
import { countryColor, WATER_SECTORS } from '../../lib/waterUse'
import type {
  LayerFile,
  LayerId,
  RegionSeries,
  WaterBand,
  WaterScenario,
  WaterSector,
  WaterView,
} from '../../types'
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
    band: WaterBand
    observed: { series: RegionSeries; year: number }
  } | null
  /** The open basin's projection chart, in the future view. */
  regionProjection?: InstanceType<typeof RegionCard>['$props']['projection']
}>()
const emit = defineEmits<{
  close: []
  sector: [WaterSector]
  view: [WaterView]
}>()

const { locale, t } = useLocale()

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
        @close="emit('close')"
      />
      <div v-else class="space-y-3">
        <button
          v-if="water?.view === 'future'"
          type="button"
          class="text-xs font-medium text-accent-ink hover:underline focus-ring"
          @click="emit('view', 'gap')"
        >
          ← {{ t.waterUse.back }}
        </button>
        <p class="sr-only"><RichText :text="summary" /></p>
        <template v-if="water && water.view !== 'future'">
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
          :band="projection.band"
          :observed="projection.observed"
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
          v-if="waterHistory"
          type="button"
          class="group flex w-full items-center gap-3 rounded-xl bg-accent/15 px-3 py-3 text-left ring-1 ring-accent/50 transition-colors hover:bg-accent/25 focus-ring"
          @click="emit('view', 'future')"
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
            <span class="block text-xs text-ink">{{ t.waterUse.futureHint }}</span>
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
