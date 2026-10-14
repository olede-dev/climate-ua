<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue'
import { useSurfaceWaterPairs, useSurfaceWaterSeries } from '../../../composables/useLayer'
import { useLocale } from '../../../composables/useLocale'
import { SURFACE_WATER_COLORS } from '../../../lib/surfaceWater'
import {
  annualWaterArea,
  CHANGE_TONES,
  changeTone,
  waterbodyDelta,
  waterbodyPair,
} from '../../../lib/waterbodyCard'
import { TONE_CLASSES } from '../../../lib/tones'
import { ownWaterbodyName, waterbodyCoordinates } from '../../../lib/localWaterbodies'
import type { SurfaceWaterBodyEntry, SurfaceWaterManifest, SurfaceWaterState } from '../../../types'
import LoadingIndicator from '../../ui/LoadingIndicator.vue'
import WaterbodyChart from './WaterbodyChart.vue'
const props = defineProps<{
  body: SurfaceWaterBodyEntry
  release: { manifest: SurfaceWaterManifest; root: string }
  state: SurfaceWaterState
}>()
const heading = useTemplateRef<HTMLHeadingElement>('heading')
onMounted(() => heading.value?.focus())
const emit = defineEmits<{ close: [] }>()
const { locale, t } = useLocale()
const copy = computed(() => t.value.surfaceWater)
const query = useSurfaceWaterSeries(
  () => props.release,
  () => props.body,
)
const year = computed(() => (props.state.mode === 'annual' ? props.state.year : props.state.after))
const annual = computed(() => query.data.value?.annual.find((row) => row.year === year.value))
const areas = computed(() => annualWaterArea(annual.value))
// Pairs are stored once with before < after, in one file per earlier year.
const pairs = useSurfaceWaterPairs(
  () => props.release,
  () => query.data.value,
  () =>
    props.state.mode === 'comparison' && props.state.before !== props.state.after
      ? Math.min(props.state.before, props.state.after)
      : null,
)
const pair = computed(() =>
  query.data.value
    ? waterbodyPair(
        { annual: query.data.value.annual, pairs: pairs.data.value ?? [] },
        props.state.before,
        props.state.after,
      )
    : undefined,
)
const delta = computed(() => waterbodyDelta(pair.value))
const comparison = computed(() => (delta.value ? pair.value?.comparison : null))
const number = (value: number) =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(value)
const area = (value: number) => `${number(value / 1e6)} ${copy.value.km2}`
const signed = (value: number) =>
  new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  })
    .format(value)
    .replace('-', '−')
const percent = (value: number) => `${number(value * 100)}%`
const caption = 'px-3 pb-1 text-[11px] leading-[14px] font-semibold text-ink-muted'
// An unnamed body is titled by its coordinates: "near <settlement>" reads like a name it does not have.
const name = computed(() => ownWaterbodyName(props.body, locale.value))
const coordinates = computed(() => waterbodyCoordinates(props.body))
</script>
<template>
  <article
    class="text-[13px] leading-4 text-ink"
    :aria-label="name ?? coordinates"
    :aria-busy="query.isPending.value"
  >
    <button
      type="button"
      class="mb-3 inline-flex items-center gap-0.5 rounded-full bg-fill py-1 pr-3 pl-1.5 text-[13px] leading-4 font-medium text-ink transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill-strong active:bg-fill-strong focus-ring pointer-coarse:min-h-11"
      @click="emit('close')"
    >
      <svg
        viewBox="0 0 16 16"
        class="size-4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path d="M10 3.5 5.5 8l4.5 4.5" />
      </svg>
      {{ t.panel.back }}
    </button>
    <h2
      ref="heading"
      tabindex="-1"
      class="text-[17px] leading-[22px] font-bold focus-visible:outline-none"
    >
      <template v-if="name">{{ name }}</template>
      <span v-else class="flex items-center gap-2 tabular-nums">
        <svg
          viewBox="0 0 16 16"
          class="size-5 shrink-0 text-ink-muted"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          aria-hidden="true"
        >
          <path d="M8 14.5s4.5-4.2 4.5-8a4.5 4.5 0 0 0-9 0c0 3.8 4.5 8 4.5 8z" />
          <circle cx="8" cy="6.5" r="1.6" />
        </svg>
        <span class="sr-only">{{ copy.unnamed }}, </span>{{ coordinates }}
      </span>
    </h2>
    <p class="mt-1 text-[13px] leading-4 text-ink-muted">{{ copy[body.type] }}</p>
    <p
      v-if="body.type === 'local'"
      role="note"
      class="mt-2 text-[12px] leading-[15px] text-ink-muted"
    >
      {{ copy.localNote }}
    </p>
    <p
      v-if="body.id.includes('kakhovka')"
      role="note"
      class="mt-3 rounded-xl bg-warn-fill p-3 text-[12px] leading-[15px] text-warn-ink"
    >
      {{ copy.kakhovka }}
      <a
        class="rounded font-medium text-warn-ink underline underline-offset-2 focus-ring"
        target="_blank"
        rel="noopener"
        href="https://www.unep.org/resources/report/rapid-environmental-assessment-kakhovka-dam-breach-ukraine-2023"
        >{{ copy.kakhovkaSource }}</a
      >
    </p>
    <LoadingIndicator v-if="query.isPending.value" :label="t.home.loading" class="mt-4" />
    <p v-else-if="query.isError.value" role="alert" class="mt-4 flex items-center gap-2">
      {{ copy.error }}
      <button
        type="button"
        class="rounded-full bg-fill px-3 py-1 font-medium transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill-strong active:bg-fill-strong focus-ring"
        @click="query.refetch()"
      >
        {{ copy.retry }}
      </button>
    </p>
    <template v-else-if="query.data.value">
      <section v-if="state.mode === 'comparison'" class="mt-4">
        <LoadingIndicator
          v-if="pairs.isFetching.value && !pairs.data.value"
          :label="t.home.loading"
        />
        <p v-else-if="pairs.isError.value" role="alert" class="flex items-center gap-2">
          {{ copy.error }}
          <button
            type="button"
            class="rounded-full bg-fill px-3 py-1 font-medium transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill-strong active:bg-fill-strong focus-ring"
            @click="pairs.refetch()"
          >
            {{ copy.retry }}
          </button>
        </p>
        <template v-else-if="comparison && delta">
          <div class="flex items-baseline gap-2.5">
            <p class="text-[26px] leading-8 font-bold tabular-nums">
              {{ signed(delta.deltaM2 / 1e6) }}
              <span class="text-[17px] leading-[22px] font-normal text-ink-muted">{{
                copy.km2
              }}</span>
            </p>
            <span
              v-if="delta.percent !== null"
              class="rounded-full px-2 py-0.5 text-[13px] leading-4 font-semibold whitespace-nowrap tabular-nums"
              :class="TONE_CLASSES[CHANGE_TONES[changeTone(delta.percent)]].badge"
              >{{ signed(delta.percent) }}%</span
            >
          </div>
          <p class="mt-1.5 text-ink-muted">
            {{ copy.delta }} · {{ state.before }} → {{ state.after }}
          </p>
          <p v-if="delta.percent === null" class="mt-1 text-[12px] leading-[15px] text-ink-muted">
            {{ copy.zeroBaseline }}
          </p>
          <dl
            class="mt-3 divide-y divide-line overflow-hidden rounded-xl bg-group tabular-nums shadow-card"
          >
            <div class="flex justify-between gap-3 px-3 py-2">
              <dt>{{ state.before }}</dt>
              <dd class="text-ink-muted">{{ area(comparison.before.unionM2) }}</dd>
            </div>
            <div class="flex justify-between gap-3 px-3 py-2">
              <dt>{{ state.after }}</dt>
              <dd class="text-ink-muted">{{ area(comparison.after.unionM2) }}</dd>
            </div>
          </dl>
        </template>
        <p v-else class="rounded-xl bg-group px-3 py-2 text-ink-muted">{{ copy.noComparison }}</p>
        <p
          v-if="pair && pair.spatialStatus !== 'complete'"
          class="mt-1.5 px-3 text-[12px] leading-[15px] text-warn-ink"
        >
          {{ copy.commonMask }} · {{ copy[pair.spatialStatus] }} ·
          {{ percent(pair.coverage) }}
        </p>
      </section>
      <section :class="state.mode === 'comparison' ? 'mt-5' : 'mt-4'">
        <template v-if="state.mode === 'annual'">
          <p class="text-[26px] leading-8 font-bold tabular-nums">
            <template v-if="areas"
              >{{ number(areas.unionM2 / 1e6) }}
              <span class="text-[17px] leading-[22px] font-normal text-ink-muted">{{
                copy.km2
              }}</span></template
            >
            <template v-else>—</template>
          </p>
          <p class="mt-1.5 text-ink-muted">{{ copy.total }} · {{ year }}</p>
        </template>
        <h3 v-else :class="caption">{{ copy.composition }} · {{ year }}</h3>
        <dl
          v-if="areas"
          class="divide-y divide-line overflow-hidden rounded-xl bg-group tabular-nums shadow-card"
          :class="state.mode === 'annual' && 'mt-3'"
        >
          <div
            v-for="key in ['permanent', 'seasonal'] as const"
            :key="key"
            class="flex items-center gap-2.5 px-3 py-2"
          >
            <span
              class="size-2.5 shrink-0 rounded-full"
              :style="{ background: SURFACE_WATER_COLORS[key] }"
              aria-hidden="true"
            />
            <dt class="flex-1">{{ copy[key] }}</dt>
            <dd class="text-ink-muted">
              {{ area(key === 'permanent' ? areas.permanentM2 : areas.seasonalM2) }}
            </dd>
          </div>
        </dl>
        <p v-else class="rounded-xl bg-group px-3 py-2 text-ink-muted">{{ copy.noArea }}</p>
        <p
          v-if="annual && annual.spatialStatus !== 'complete'"
          class="mt-1.5 px-3 text-[12px] leading-[15px] text-warn-ink"
        >
          {{ copy[annual.spatialStatus] }} · {{ copy.coverage }}: {{ percent(annual.coverage) }}
        </p>
      </section>
      <section class="mt-5">
        <h3 :class="caption">{{ copy.history }}</h3>
        <div class="rounded-xl bg-surface p-2 shadow-card">
          <WaterbodyChart
            :annual="query.data.value.annual"
            :years="release.manifest.years"
            :selected="year"
          />
        </div>
        <ul
          class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 px-3 text-[12px] leading-[15px] text-ink-muted"
        >
          <li class="flex items-center gap-1.5">
            <svg viewBox="0 0 16 10" class="h-2.5 w-4 shrink-0" aria-hidden="true">
              <path d="M0 5h16" stroke="#2ab0cd" stroke-width="2" />
            </svg>
            {{ copy.total }}
          </li>
          <li class="flex items-center gap-1.5">
            <svg viewBox="0 0 10 10" class="size-2.5 shrink-0" aria-hidden="true">
              <path d="M5 1 9.5 9h-9z" fill="#e66825" />
            </svg>
            {{ copy.chartPartial }}
          </li>
          <li class="flex items-center gap-1.5">
            <svg viewBox="0 0 16 10" class="h-2.5 w-4 shrink-0" aria-hidden="true">
              <path d="M0 5h16" stroke="#9aa3ad" stroke-width="2" stroke-dasharray="4 3" />
            </svg>
            {{ copy.chartGap }}
          </li>
        </ul>
        <details open class="group mt-3 overflow-hidden rounded-xl bg-group shadow-card">
          <summary
            class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill active:bg-fill-strong focus-ring-inset [&::-webkit-details-marker]:hidden"
          >
            {{ copy.yearly }}
            <svg
              viewBox="0 0 16 16"
              class="size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-out motion-reduce:transition-none group-open:rotate-90"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="m6 3.5 4.5 4.5L6 12.5" />
            </svg>
          </summary>
          <ul
            class="max-h-64 divide-y divide-line overflow-y-auto border-t border-line tabular-nums"
          >
            <li
              v-for="row in query.data.value.annual"
              :key="row.year"
              class="flex items-center gap-3 px-3 py-1.5"
            >
              <span class="w-10 shrink-0">{{ row.year }}</span>
              <span class="flex-1 text-right">{{
                annualWaterArea(row) ? area(annualWaterArea(row)!.unionM2) : copy.noArea
              }}</span>
              <span
                class="size-2 shrink-0 rounded-full"
                :class="
                  row.spatialStatus === 'complete'
                    ? 'bg-accent'
                    : row.spatialStatus === 'partial'
                      ? 'bg-amber-500'
                      : 'bg-ink-muted'
                "
                :title="copy[row.spatialStatus]"
                role="img"
                :aria-label="copy[row.spatialStatus]"
              />
            </li>
          </ul>
        </details>
      </section>
    </template>
  </article>
</template>
