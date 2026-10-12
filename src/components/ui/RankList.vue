<script lang="ts">
import type { Tone } from '../../lib/tones'

/**
 * One row of a `RankList`. Everything but `id` and `title` is optional: a row shows only what
 * it is given, so the same list serves plain links, ranked regions and compared figures.
 */
export interface RankItem {
  id: string
  title: string
  /** Muted text right after the title, e.g. a station's place. */
  titleNote?: string
  subtitle?: string
  /** An accent pill next to the subtitle. */
  tag?: string
  /** A leading dot: a map colour, a tone, or a hollow ring for no data. */
  marker?: { color: string } | { tone: Tone } | { ring: string }
  /** The main figure on the right; `loading` shows a placeholder instead. */
  value?: string
  valueColor?: string
  /** A tone pill under the figure, e.g. the change from the norm. */
  badge?: { text: string; tone: Tone }
  /** Small muted text under the figure. */
  detail?: string
  loading?: boolean
}
</script>

<script setup lang="ts">
import { TONE_CLASSES } from '../../lib/tones'

/** A grouped list of clickable rows with optional figures and badges; a click selects a row. */
defineProps<{
  items: readonly RankItem[]
  label: string
  selectedId?: string | null
  /** A trailing chevron: the row opens a card. */
  chevron?: boolean
}>()
const emit = defineEmits<{ select: [id: string] }>()

function markerStyle(marker: RankItem['marker']): Record<string, string> {
  if (!marker) return {}
  if ('color' in marker) return { background: marker.color }
  if ('ring' in marker) return { border: `2px solid ${marker.ring}` }
  return {}
}
</script>

<template>
  <ul class="divide-y divide-line overflow-hidden rounded-xl bg-group" :aria-label="label">
    <li v-for="item in items" :key="item.id">
      <button
        type="button"
        :aria-current="selectedId === item.id ? 'true' : undefined"
        class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-fill focus-ring-inset"
        :class="{ 'bg-accent/12 hover:bg-accent/12': selectedId === item.id }"
        @click="emit('select', item.id)"
      >
        <span
          v-if="item.marker"
          class="size-2.5 shrink-0 rounded-full"
          :class="'tone' in item.marker && TONE_CLASSES[item.marker.tone].dot"
          :style="markerStyle(item.marker)"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1">
          <span class="block text-[13px] leading-snug">
            <span class="font-medium text-ink">{{ item.title }}</span>
            <span v-if="item.titleNote" class="text-ink-muted"> — {{ item.titleNote }}</span>
          </span>
          <span
            v-if="item.subtitle || item.tag"
            class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted"
          >
            <span v-if="item.subtitle">{{ item.subtitle }}</span>
            <span
              v-if="item.tag"
              class="rounded-full bg-accent/12 px-2 font-medium text-accent-ink"
            >
              {{ item.tag }}
            </span>
          </span>
        </span>
        <span
          v-if="item.loading || item.value !== undefined || item.badge || item.detail"
          class="shrink-0 text-right tabular-nums"
        >
          <span
            v-if="item.loading"
            class="block h-3.5 w-14 animate-pulse rounded bg-fill motion-reduce:animate-none"
            aria-hidden="true"
          />
          <template v-else>
            <span
              v-if="item.value !== undefined"
              class="block text-[13px] leading-snug font-semibold"
              :class="!item.valueColor && 'text-ink'"
              :style="
                item.valueColor
                  ? { color: `color-mix(in oklab, ${item.valueColor} 75%, var(--ui-ink))` }
                  : undefined
              "
              >{{ item.value }}</span
            >
            <span
              v-if="item.badge"
              class="mt-0.5 inline-block rounded-full px-1.5 text-[11px] leading-[18px] font-semibold whitespace-nowrap"
              :class="TONE_CLASSES[item.badge.tone].badge"
              >{{ item.badge.text }}</span
            >
            <span
              v-if="item.detail"
              class="mt-0.5 block text-xs whitespace-nowrap text-ink-muted"
              >{{ item.detail }}</span
            >
          </template>
        </span>
        <svg
          v-if="chevron"
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
</template>
