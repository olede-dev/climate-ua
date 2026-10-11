<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from 'vue'

import { LAYER_ICONS, LAYER_TONES } from '../../config/layerIcons'
import { useLocale } from '../../composables/useLocale'
import type { LayerId } from '../../types'
import IconTile from '../ui/IconTile.vue'

const REPO_URL = 'https://github.com/olede-dev/climate-ua'
const link = 'rounded text-accent-ink underline underline-offset-2 focus-ring'

const { t } = useLocale()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
let opener: HTMLElement | null = null

const general = computed(() => [
  { id: 'limits', label: t.value.about.limitsHeading },
  { id: 'map', label: t.value.about.mapHeading },
])

const isLayer = (id: string): id is LayerId => id in LAYER_ICONS

const anchor = (id: string) => `about-${id}`

function scrollTo(id: string) {
  dialog.value
    ?.querySelector(`#${anchor(id)}`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

/** Opens the dialog, optionally scrolled to one section (a layer id or a contents id). */
function open(section?: string) {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.showModal()
  if (dialog.value) dialog.value.scrollTop = 0
  if (section) void nextTick(() => scrollTo(section))
}

function close() {
  dialog.value?.close()
}

function onClose() {
  opener?.focus()
  opener = null
}

function onClick(event: MouseEvent) {
  if (event.target === dialog.value) close()
}

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="about-heading"
    class="m-auto max-h-[90dvh] w-[min(46rem,calc(100%-2rem))] scroll-pt-16 rounded-2xl bg-surface p-0 text-ink shadow-float backdrop:bg-black/30 backdrop:backdrop-blur-[2px] dark:backdrop:bg-black/50"
    @close="onClose"
    @click="onClick"
  >
    <div
      class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface px-6 py-4"
    >
      <h2 id="about-heading" class="text-xl font-semibold tracking-tight">
        {{ t.about.heading }}
      </h2>
      <button
        type="button"
        :aria-label="t.about.close"
        class="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill text-ink-muted transition-colors hover:bg-fill-strong hover:text-ink focus-ring"
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
    </div>

    <div class="space-y-6 p-6 text-sm leading-relaxed">
      <p>{{ t.about.intro }}</p>

      <nav :aria-label="t.about.contents" class="rounded-xl bg-group p-4">
        <h3 class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {{ t.about.contents }}
        </h3>
        <ul class="space-y-3">
          <li v-for="group in t.about.groups" :key="group.id">
            <p class="px-1 pb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {{ group.name }}
            </p>
            <ul class="space-y-1">
              <li v-for="layer in group.layers" :key="layer.id">
                <a
                  class="flex items-center gap-2.5 rounded-lg px-1 py-1 font-medium text-ink transition-colors hover:bg-fill focus-ring"
                  :href="`#${anchor(layer.id)}`"
                  @click.prevent="scrollTo(layer.id)"
                >
                  <IconTile
                    v-if="isLayer(layer.id)"
                    :path="LAYER_ICONS[layer.id]"
                    :tone="LAYER_TONES[layer.id]"
                  />
                  {{ layer.name }}
                </a>
                <ul
                  v-if="layer.topics.length"
                  class="mt-0.5 mb-1 ml-4 space-y-0.5 border-l border-line pl-[1.4rem]"
                >
                  <li v-for="topic in layer.topics" :key="topic.id">
                    <a
                      :class="link"
                      :href="`#${anchor(topic.id)}`"
                      @click.prevent="scrollTo(topic.id)"
                    >
                      {{ topic.heading }}
                    </a>
                  </li>
                </ul>
              </li>
            </ul>
            <template v-if="group.topics.length">
              <p class="mt-2 px-1 text-[13px] text-ink-muted">{{ group.topicsHeading }}</p>
              <ul class="mt-0.5 ml-4 space-y-0.5 border-l border-line pl-[1.4rem]">
                <li v-for="topic in group.topics" :key="topic.id">
                  <a
                    :class="link"
                    :href="`#${anchor(topic.id)}`"
                    @click.prevent="scrollTo(topic.id)"
                  >
                    {{ topic.heading }}
                  </a>
                </li>
              </ul>
            </template>
          </li>
          <li>
            <p class="px-1 pb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {{ t.about.generalHeading }}
            </p>
            <ul class="ml-4 space-y-0.5 border-l border-line pl-[1.4rem]">
              <li v-for="item in general" :key="item.id">
                <a :class="link" :href="`#${anchor(item.id)}`" @click.prevent="scrollTo(item.id)">
                  {{ item.label }}
                </a>
              </li>
            </ul>
          </li>
        </ul>
      </nav>

      <template v-for="group in t.about.groups" :key="group.id">
        <h3 class="text-lg font-semibold tracking-tight">{{ group.name }}</h3>

        <section
          v-for="layer in group.layers"
          :id="anchor(layer.id)"
          :key="layer.id"
          class="space-y-2"
        >
          <h4 class="flex items-center gap-2.5 text-base font-semibold">
            <IconTile
              v-if="isLayer(layer.id)"
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
            class="space-y-2"
          >
            <h5 class="font-semibold">{{ topic.heading }}</h5>
            <p v-for="paragraph in topic.paragraphs" :key="paragraph">{{ paragraph }}</p>
          </div>
          <div class="rounded-xl bg-group px-3 py-2 text-[13px]">
            <p class="font-medium text-ink-muted">{{ t.about.sourcesLabel }}</p>
            <ul class="space-y-1">
              <li v-for="source in layer.sources" :key="source.url">
                <a :class="link" :href="source.url" target="_blank" rel="noopener">{{
                  source.name
                }}</a>
                <span class="text-ink-muted"> — {{ source.detail }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section
          v-for="topic in group.topics"
          :id="anchor(topic.id)"
          :key="topic.id"
          class="space-y-2"
        >
          <h4 class="text-base font-semibold">{{ topic.heading }}</h4>
          <p v-for="paragraph in topic.paragraphs" :key="paragraph">{{ paragraph }}</p>
          <ul
            v-if="topic.sources.length"
            class="space-y-1 rounded-xl bg-group px-3 py-2 text-[13px]"
          >
            <li v-for="source in topic.sources" :key="source.url">
              <a :class="link" :href="source.url" target="_blank" rel="noopener">{{
                source.name
              }}</a>
              <span class="text-ink-muted"> — {{ source.detail }}</span>
            </li>
          </ul>
        </section>
      </template>

      <h3 class="text-lg font-semibold tracking-tight">{{ t.about.generalHeading }}</h3>

      <section :id="anchor('limits')" class="space-y-2">
        <h4 class="text-base font-semibold">{{ t.about.limitsHeading }}</h4>
        <ul class="list-disc space-y-1 pl-5">
          <li v-for="limit in t.about.limits" :key="limit">{{ limit }}</li>
        </ul>
      </section>

      <section :id="anchor('map')" class="space-y-2">
        <h4 class="text-base font-semibold">{{ t.about.mapHeading }}</h4>
        <ul class="space-y-1">
          <li v-for="source in t.about.mapSources" :key="source.url">
            <a :class="link" :href="source.url" target="_blank" rel="noopener">{{ source.name }}</a>
            <span class="text-ink-muted"> — {{ source.detail }}</span>
          </li>
        </ul>
        <p class="pt-2">
          <a :class="link" :href="REPO_URL" target="_blank" rel="noopener">{{ t.about.code }}</a>
        </p>
      </section>
    </div>
  </dialog>
</template>
