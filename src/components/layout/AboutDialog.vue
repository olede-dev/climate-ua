<script setup lang="ts">
import { useTemplateRef } from 'vue'

import { useLocale } from '../../composables/useLocale'

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

/** Esc and the close button both end here; focus goes back to whatever opened the dialog. */
function onClose() {
  opener?.focus()
  opener = null
}

/** A click whose target is the dialog itself landed on the backdrop, outside the content box. */
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

      <section class="space-y-1">
        <h3 class="font-semibold">{{ t.about.statusHeading }}</h3>
        <p>{{ t.about.status }}</p>
      </section>
    </div>
  </dialog>
</template>
