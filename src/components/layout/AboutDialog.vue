<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'

import { LAYER_ICONS, LAYER_TONES } from '../../config/layerIcons'
import { useLocale } from '../../composables/useLocale'
import type { LayerId } from '../../types'
import IconTile from '../ui/IconTile.vue'

const REPO_URL = 'https://github.com/olede-dev/climate-ua'
const link = 'rounded text-accent-ink underline underline-offset-2 focus-ring'
const row =
  'flex min-h-7 w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors duration-150 ease-out motion-reduce:transition-none focus-ring-inset pointer-coarse:min-h-11'

const { t } = useLocale()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const pane = useTemplateRef<HTMLElement>('pane')
const active = ref('')
let opener: HTMLElement | null = null
let observer: IntersectionObserver | null = null
// True while a contents click scrolls the text, so passing sections do not steal the highlight.
let jumping = false

const isLayer = (id: string): id is LayerId => id in LAYER_ICONS

const anchor = (id: string) => `about-${id}`

interface NavItem {
  id: string
  label: string
  layer?: LayerId
}

/** Sidebar rows: two levels at most, layer topics stay in the text. */
const nav = computed(() => [
  ...t.value.about.groups.map((group) => ({
    id: group.id,
    name: group.name,
    items: [
      ...group.layers.map((layer): NavItem => ({
        id: layer.id,
        label: layer.name,
        layer: isLayer(layer.id) ? layer.id : undefined,
      })),
      ...group.topics.map((topic): NavItem => ({ id: topic.id, label: topic.heading })),
    ],
  })),
  {
    id: 'general',
    name: t.value.about.generalHeading,
    items: [
      { id: 'limits', label: t.value.about.limitsHeading },
      { id: 'map', label: t.value.about.mapHeading },
    ] as NavItem[],
  },
])

function scrollTo(id: string) {
  active.value = id
  jumping = true
  pane.value
    ?.querySelector(`#${anchor(id)}`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

/** Highlights the sidebar row of the section at the top of the text. */
function watchSections() {
  observer?.disconnect()
  if (!pane.value) return
  const visible = new Set<string>()
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = entry.target.id.slice('about-'.length)
        if (entry.isIntersecting) visible.add(id)
        else visible.delete(id)
      }
      const first = nav.value.flatMap((group) => group.items).find((item) => visible.has(item.id))
      if (first && !jumping) active.value = first.id
    },
    { root: pane.value, rootMargin: '0px 0px -70% 0px' },
  )
  pane.value.querySelectorAll('[data-section]').forEach((section) => observer?.observe(section))
}

/** Opens the dialog, optionally scrolled to one section (a layer id or a contents id). */
function open(section?: string) {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.showModal()
  if (pane.value) pane.value.scrollTop = 0
  active.value = nav.value[0]?.items[0]?.id ?? ''
  void nextTick(() => {
    watchSections()
    if (section) scrollTo(section)
  })
}

function close() {
  dialog.value?.close()
}

function onClose() {
  observer?.disconnect()
  opener?.focus()
  opener = null
}

function onClick(event: MouseEvent) {
  if (event.target === dialog.value) close()
}

onBeforeUnmount(() => observer?.disconnect())

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="about-heading"
    class="m-auto h-[min(48rem,90dvh)] max-h-[90dvh] w-[min(60rem,calc(100%-2rem))] overflow-hidden rounded-2xl bg-surface p-0 text-ink shadow-float backdrop:bg-black/30 backdrop:backdrop-blur-[2px] open:flex dark:backdrop:bg-black/50"
    @close="onClose"
    @click="onClick"
  >
    <nav
      :aria-label="t.about.contents"
      class="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-group p-3 md:flex"
    >
      <div v-for="group in nav" :key="group.id" class="mb-3 last:mb-0">
        <p class="px-2 pt-1 pb-1 text-[11px] leading-[14px] font-semibold text-ink-muted">
          {{ group.name }}
        </p>
        <ul class="space-y-0.5">
          <li v-for="item in group.items" :key="item.id">
            <a
              :href="`#${anchor(item.id)}`"
              :aria-current="active === item.id ? 'location' : undefined"
              :class="[
                row,
                'text-[13px] leading-4',
                active === item.id
                  ? 'bg-fill-strong font-semibold text-ink'
                  : 'text-ink hover:bg-fill',
              ]"
              @click.prevent="scrollTo(item.id)"
            >
              <IconTile
                v-if="item.layer"
                :path="LAYER_ICONS[item.layer]"
                :tone="LAYER_TONES[item.layer]"
              />
              <span
                v-else
                class="flex size-6 shrink-0 items-center justify-center"
                aria-hidden="true"
              >
                <span
                  class="size-1.5 rounded-full"
                  :class="active === item.id ? 'bg-accent' : 'bg-ink-muted'"
                />
              </span>
              <span class="truncate" :title="item.label">{{ item.label }}</span>
            </a>
          </li>
        </ul>
      </div>
    </nav>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-4"
      >
        <h2 id="about-heading" class="text-[22px] leading-[26px] font-bold">
          {{ t.about.heading }}
        </h2>
        <button
          type="button"
          :aria-label="t.about.close"
          class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill text-ink-muted transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill-strong hover:text-ink focus-ring pointer-coarse:size-11"
          @click="close"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-3.5"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
          >
            <path stroke-width="2.5" stroke-linecap="round" d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </header>

      <div
        ref="pane"
        class="flex-1 scroll-pt-6 overflow-y-auto px-6 pt-5 pb-10 text-[13px] leading-5"
      >
        <p class="max-w-[38rem] text-ink-muted">{{ t.about.intro }}</p>

        <!-- Narrow screens have no sidebar: the contents sit above the text. -->
        <nav :aria-label="t.about.contents" class="mt-5 rounded-xl bg-group p-2 md:hidden">
          <template v-for="group in nav" :key="group.id">
            <p class="px-2 pt-2 pb-1 text-[11px] leading-[14px] font-semibold text-ink-muted">
              {{ group.name }}
            </p>
            <ul>
              <li v-for="item in group.items" :key="item.id">
                <a
                  :href="`#${anchor(item.id)}`"
                  :class="[row, 'text-ink hover:bg-fill']"
                  @click.prevent="scrollTo(item.id)"
                >
                  <IconTile
                    v-if="item.layer"
                    :path="LAYER_ICONS[item.layer]"
                    :tone="LAYER_TONES[item.layer]"
                  />
                  {{ item.label }}
                </a>
              </li>
            </ul>
          </template>
        </nav>

        <template v-for="group in t.about.groups" :key="group.id">
          <h3
            class="mt-8 mb-3 border-b border-line pb-2 text-[17px] leading-[22px] font-bold first-of-type:mt-6"
          >
            {{ group.name }}
          </h3>

          <section
            v-for="layer in group.layers"
            :id="anchor(layer.id)"
            :key="layer.id"
            data-section
            class="mt-6 max-w-[38rem] space-y-3"
          >
            <h4 class="flex items-center gap-3 text-[15px] leading-5 font-semibold">
              <IconTile
                v-if="isLayer(layer.id)"
                size="lg"
                :path="LAYER_ICONS[layer.id]"
                :tone="LAYER_TONES[layer.id]"
              />
              {{ layer.name }}
            </h4>
            <p v-for="paragraph in layer.paragraphs" :key="paragraph">{{ paragraph }}</p>
            <div
              v-for="topic in layer.topics"
              :id="anchor(topic.id)"
              :key="topic.id"
              class="space-y-1 pt-1"
            >
              <h5 class="text-[13px] leading-4 font-bold">{{ topic.heading }}</h5>
              <p v-for="paragraph in topic.paragraphs" :key="paragraph">{{ paragraph }}</p>
            </div>
            <div v-if="layer.sources.length" class="pt-1">
              <p class="px-3 pb-1 text-[11px] leading-[14px] font-semibold text-ink-muted">
                {{ t.about.sourcesLabel }}
              </p>
              <ul class="divide-y divide-line rounded-xl bg-group">
                <li v-for="source in layer.sources" :key="source.url" class="px-3 py-2">
                  <a :class="link" :href="source.url" target="_blank" rel="noopener">{{
                    source.name
                  }}</a>
                  <p class="text-[11px] leading-[14px] text-ink-muted">{{ source.detail }}</p>
                </li>
              </ul>
            </div>
          </section>

          <section
            v-for="topic in group.topics"
            :id="anchor(topic.id)"
            :key="topic.id"
            data-section
            class="mt-6 max-w-[38rem] space-y-3"
          >
            <h4 class="text-[15px] leading-5 font-semibold">{{ topic.heading }}</h4>
            <p v-for="paragraph in topic.paragraphs" :key="paragraph">{{ paragraph }}</p>
            <ul v-if="topic.sources.length" class="divide-y divide-line rounded-xl bg-group">
              <li v-for="source in topic.sources" :key="source.url" class="px-3 py-2">
                <a :class="link" :href="source.url" target="_blank" rel="noopener">{{
                  source.name
                }}</a>
                <p class="text-[11px] leading-[14px] text-ink-muted">{{ source.detail }}</p>
              </li>
            </ul>
          </section>
        </template>

        <h3 class="mt-8 mb-3 border-b border-line pb-2 text-[17px] leading-[22px] font-bold">
          {{ t.about.generalHeading }}
        </h3>

        <section :id="anchor('limits')" data-section class="mt-6 max-w-[38rem] space-y-3">
          <h4 class="text-[15px] leading-5 font-semibold">{{ t.about.limitsHeading }}</h4>
          <ul class="list-disc space-y-1.5 pl-5 marker:text-ink-muted">
            <li v-for="limit in t.about.limits" :key="limit">{{ limit }}</li>
          </ul>
        </section>

        <section :id="anchor('map')" data-section class="mt-6 max-w-[38rem] space-y-3">
          <h4 class="text-[15px] leading-5 font-semibold">{{ t.about.mapHeading }}</h4>
          <ul class="divide-y divide-line rounded-xl bg-group">
            <li v-for="source in t.about.mapSources" :key="source.url" class="px-3 py-2">
              <a :class="link" :href="source.url" target="_blank" rel="noopener">{{
                source.name
              }}</a>
              <p class="text-[11px] leading-[14px] text-ink-muted">{{ source.detail }}</p>
            </li>
          </ul>
          <p class="pt-1">
            <a :class="link" :href="REPO_URL" target="_blank" rel="noopener">{{ t.about.code }}</a>
          </p>
        </section>
      </div>
    </div>
  </dialog>
</template>
