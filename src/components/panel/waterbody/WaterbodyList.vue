<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '../../../composables/useLocale'
import { CHANGE_TONE_CLASSES, changeTone, type waterbodyChange } from '../../../lib/waterbodyCard'
import type { SurfaceWaterCatalogueEntry } from '../../../types'

// Figures are passed only in comparison mode; the annual view keeps a plain list of links.
// A missing key means that body's series is still loading.
const props = defineProps<{
  bodies: readonly SurfaceWaterCatalogueEntry[]
  comparison?: {
    before: number
    after: number
    figures: Record<string, ReturnType<typeof waterbodyChange> | undefined>
  }
}>()
const emit = defineEmits<{ select: [id: string] }>()
const { locale, t } = useLocale()
const copy = computed(() => t.value.surfaceWater)
const figure = (id: string) => props.comparison?.figures[id]
const tone = (id: string) => {
  const percent = figure(id)?.percent
  return percent == null ? 'stable' : changeTone(percent)
}
const name = (body: SurfaceWaterCatalogueEntry) =>
  (locale.value === 'uk' ? body.nameUk : body.nameEn) || copy.value.unnamed
const area = (m2: number) =>
  `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: m2 < 1e8 ? 1 : 0 }).format(m2 / 1e6)} ${copy.value.km2}`
const percent = (value: number) =>
  `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(value).replace('-', '−')}%`
</script>

<template>
  <section>
    <h2 class="px-3 pb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
      {{
        comparison
          ? copy.listHeading.replace('{year}', String(comparison.after))
          : copy.listHeadingAnnual
      }}
    </h2>
    <ul class="divide-y divide-line overflow-hidden rounded-xl bg-group" :aria-label="copy.name">
      <li v-for="body in bodies" :key="body.id">
        <button
          type="button"
          class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-fill focus-ring-inset"
          @click="emit('select', body.id)"
        >
          <span
            v-if="comparison"
            class="size-2 shrink-0 rounded-full"
            :class="CHANGE_TONE_CLASSES[tone(body.id)].dot"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[13px] leading-snug font-medium text-ink">{{
              name(body)
            }}</span>
            <span class="block text-xs text-ink-muted">{{ copy[body.type] }}</span>
          </span>
          <span v-if="comparison" class="shrink-0 text-right tabular-nums">
            <span
              v-if="!(body.id in comparison.figures)"
              class="block h-3.5 w-14 animate-pulse rounded bg-fill"
              aria-hidden="true"
            />
            <template v-else>
              <span class="block text-[13px] leading-snug font-semibold text-ink">{{
                figure(body.id) ? area(figure(body.id)!.m2) : '—'
              }}</span>
              <span
                v-if="figure(body.id)?.percent != null"
                class="mt-0.5 inline-block rounded-full px-1.5 text-[11px] leading-[18px] font-semibold whitespace-nowrap"
                :class="CHANGE_TONE_CLASSES[tone(body.id)].badge"
                >{{ percent(figure(body.id)!.percent!) }}</span
              >
            </template>
          </span>
          <svg
            viewBox="0 0 16 16"
            class="size-3.5 shrink-0 text-ink-muted"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="m6 3.5 4.5 4.5L6 12.5" />
          </svg>
        </button>
      </li>
    </ul>
  </section>
</template>
