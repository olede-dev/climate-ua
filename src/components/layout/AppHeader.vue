<script setup lang="ts">
import { useLocale } from '../../composables/useLocale'
import LanguageMenu from './LanguageMenu.vue'
import ThemeMenu from './ThemeMenu.vue'

defineProps<{ inline?: boolean }>()
const { t } = useLocale()
const logoUrl = `${import.meta.env.BASE_URL}favicon.svg`

const buttonClass =
  'inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium text-ink transition-colors hover:bg-fill focus-ring sm:w-auto sm:px-3'
</script>

<template>
  <header v-if="inline" class="flex items-center gap-3">
    <img :src="logoUrl" alt="" class="size-8 shrink-0" width="32" height="32" />
    <h1 class="min-w-0 flex-1 text-[17px] leading-tight font-bold tracking-tight text-ink">
      {{ t.header.title }}
    </h1>
    <slot />
  </header>
  <header
    v-else
    class="glass sticky top-2 z-20 flex h-14 shrink-0 items-center gap-1 rounded-2xl px-2 shadow-float sm:top-3 sm:gap-1.5 sm:px-3"
  >
    <div class="flex min-w-0 flex-1 items-center gap-3 pl-1">
      <img :src="logoUrl" alt="" class="size-8 shrink-0" width="32" height="32" />
      <div class="min-w-0">
        <h1
          class="truncate text-[15px] leading-tight font-semibold tracking-tight text-ink sm:text-base"
        >
          {{ t.header.title }}<span class="hidden md:inline">{{ t.header.titleSuffix }}</span>
        </h1>
        <p class="truncate text-xs leading-tight text-ink-muted">
          <span class="md:hidden">{{ t.header.subtitleShort }}</span>
          <span class="hidden md:inline">{{ t.header.subtitleLong }}</span>
        </p>
      </div>
    </div>

    <LanguageMenu :button-class="buttonClass" />
    <ThemeMenu :button-class="buttonClass" />
    <slot />
  </header>
</template>
