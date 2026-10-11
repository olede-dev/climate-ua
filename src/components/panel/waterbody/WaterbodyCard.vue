<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue'
import { useSurfaceWaterSeries } from '../../../composables/useLayer'
import { useLocale } from '../../../composables/useLocale'
import { annualWaterArea, waterbodyDelta, waterbodyPair } from '../../../lib/waterbodyCard'
import type {
  SurfaceWaterCatalogueEntry,
  SurfaceWaterManifest,
  SurfaceWaterState,
} from '../../../types'
import WaterbodyChart from './WaterbodyChart.vue'
const props = defineProps<{
  body: SurfaceWaterCatalogueEntry
  release: { manifest: SurfaceWaterManifest; root: string }
  state: SurfaceWaterState
}>()
const heading = useTemplateRef<HTMLHeadingElement>('heading')
onMounted(() => heading.value?.focus())
const emit = defineEmits<{ close: []; select: [year: number] }>()
const { locale, t } = useLocale()
const copy = computed(() => t.value.surfaceWater)
const query = useSurfaceWaterSeries(
  () => props.release,
  () => props.body,
)
const year = computed(() => (props.state.mode === 'annual' ? props.state.year : props.state.after))
const annual = computed(() => query.data.value?.annual.find((row) => row.year === year.value))
const areas = computed(() => annualWaterArea(annual.value))
const pair = computed(() => waterbodyPair(query.data.value, props.state.before, props.state.after))
const delta = computed(() => waterbodyDelta(pair.value))
const comparison = computed(() => (delta.value ? pair.value?.comparison : null))
const number = (value: number) =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(value)
const area = (value: number) => `${number(value / 1e6)} ${copy.value.km2}`
const name = computed(
  () => (locale.value === 'uk' ? props.body.nameUk : props.body.nameEn) || copy.value.unnamed,
)
</script>
<template>
  <article
    class="mt-4 border-t border-ink/10 pt-3 text-sm"
    :aria-label="name"
    :aria-busy="query.isPending.value"
  >
    <div class="flex items-start justify-between gap-2">
      <h2 ref="heading" tabindex="-1" class="text-base font-semibold focus-ring">{{ name }}</h2>
      <button type="button" class="rounded-lg bg-fill p-2 focus-ring" @click="emit('close')">
        {{ copy.close }}
      </button>
    </div>
    <p class="text-ink-muted">{{ copy[body.type] }}</p>
    <p class="mt-1 text-xs">
      {{ copy.location }}: {{ number((body.bounds[1] + body.bounds[3]) / 2) }},
      {{ number((body.bounds[0] + body.bounds[2]) / 2) }}
    </p>
    <p v-if="query.isPending.value" role="status" class="mt-3">{{ copy.detailsLoading }}</p>
    <p v-else-if="query.isError.value" role="alert" class="mt-3">
      {{ copy.error }}
      <button class="rounded-lg bg-fill p-2 focus-ring" @click="query.refetch()">
        {{ copy.retry }}
      </button>
    </p>
    <template v-else-if="query.data.value">
      <h3 class="mt-3 font-semibold">{{ copy.total }} · {{ year }}</h3>
      <dl v-if="areas" class="mt-2 grid grid-cols-2 gap-2">
        <dt>{{ copy.total }}</dt>
        <dd>{{ area(areas.unionM2) }}</dd>
        <dt>{{ copy.permanent }}</dt>
        <dd>{{ area(areas.permanentM2) }}</dd>
        <dt>{{ copy.seasonal }}</dt>
        <dd>{{ area(areas.seasonalM2) }}</dd>
      </dl>
      <p v-else>{{ copy.noArea }}</p>
      <p v-if="annual" class="mt-2">
        {{ copy[annual.spatialStatus] }} · {{ copy.coverage }}: {{ number(annual.coverage * 100) }}%
      </p>
      <section v-if="state.mode === 'comparison'" class="mt-3 rounded-lg bg-fill p-2">
        <h3 class="font-semibold">
          {{ copy.commonMask }} · {{ state.before }} → {{ state.after }}
        </h3>
        <template v-if="comparison && delta">
          <p>{{ area(comparison.before.unionM2) }} → {{ area(comparison.after.unionM2) }}</p>
          <p>
            {{ copy.delta }}: {{ area(delta.deltaM2)
            }}<span v-if="delta.percent !== null"> ({{ number(delta.percent) }}%)</span>
          </p>
          <p v-if="delta.percent === null" class="text-xs">{{ copy.zeroBaseline }}</p>
        </template>
        <p v-else>{{ copy.noComparison }}</p>
        <p v-if="pair">
          {{ copy[pair.spatialStatus] }} · {{ copy.coverage }}: {{ number(pair.coverage * 100) }}%
        </p>
      </section>
      <p class="mt-2 text-xs text-ink-muted">{{ copy.qualityHelp }}</p>
      <h3 class="mt-3 font-semibold">{{ copy.history }}</h3>
      <WaterbodyChart
        :annual="query.data.value.annual"
        :years="release.manifest.years"
        :selected="year"
        @select="emit('select', $event)"
      />
      <p class="mt-2 text-xs text-ink-muted">{{ copy.chartHelp }}</p>
      <label class="mt-2 grid gap-1"
        >{{ copy.year }}
        <select
          :value="year"
          class="rounded-lg bg-surface p-2 focus-ring"
          @change="emit('select', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="supported in release.manifest.years" :key="supported" :value="supported">
            {{ supported }}
          </option>
        </select>
      </label>
      <details class="mt-2">
        <summary class="cursor-pointer rounded focus-ring">{{ copy.history }}</summary>
        <ul class="mt-2 space-y-1">
          <li v-for="row in query.data.value.annual" :key="row.year">
            {{ row.year }}:
            {{ annualWaterArea(row) ? area(annualWaterArea(row)!.unionM2) : copy.noArea }} ·
            {{ copy[row.spatialStatus] }}
          </li>
        </ul>
      </details>
    </template>
    <p v-if="body.id.includes('kakhovka')" class="mt-3 rounded-lg bg-fill p-2 text-xs">
      {{ copy.kakhovka }}
      <a
        class="underline focus-ring"
        href="https://www.unep.org/resources/report/rapid-environmental-assessment-kakhovka-dam-breach-ukraine-2023"
        >{{ copy.kakhovkaSource }}</a
      >
    </p>
  </article>
</template>
