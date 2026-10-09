<script setup lang="ts">
import { useTemplateRef } from 'vue'

import { useLocale } from '../../composables/useLocale'

const REPO_URL = 'https://github.com/olede-dev/climate-ua'
const link = 'rounded text-accent-ink underline underline-offset-2 focus-ring'

const { t } = useLocale()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
let opener: HTMLElement | null = null

function open() {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.showModal()
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
    class="m-auto max-h-[90dvh] w-[min(42rem,calc(100%-2rem))] rounded-2xl bg-surface p-0 text-ink shadow-float backdrop:bg-black/30 backdrop:backdrop-blur-[2px] dark:backdrop:bg-black/50"
    @close="onClose"
    @click="onClick"
  >
    <div class="space-y-5 p-6 text-sm leading-relaxed">
      <div class="flex items-start justify-between gap-4">
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

      <p>{{ t.about.intro }}</p>

      <section v-for="section in t.about.sections" :key="section.heading" class="space-y-1">
        <h3 class="font-semibold">{{ section.heading }}</h3>
        <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
      </section>

      <section class="space-y-1">
        <h3 class="font-semibold">{{ t.about.measuresHeading }}</h3>
        <dl class="space-y-1">
          <div v-for="measure in t.about.measures" :key="measure.name">
            <dt class="inline font-medium">{{ measure.name }}:</dt>
            {{ ' ' }}
            <dd class="inline">{{ measure.text }}</dd>
          </div>
        </dl>
      </section>

      <section class="space-y-1">
        <h3 class="font-semibold">{{ t.about.limitsHeading }}</h3>
        <ul class="list-disc space-y-1 pl-5">
          <li v-for="limit in t.about.limits" :key="limit">{{ limit }}</li>
        </ul>
      </section>

      <section class="space-y-1">
        <h3 class="font-semibold">{{ t.about.sourcesHeading }}</h3>
        <ul class="space-y-1">
          <li v-for="source in t.about.sources" :key="source.url">
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
