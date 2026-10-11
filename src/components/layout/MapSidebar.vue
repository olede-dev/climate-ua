<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import LanguageMenu from './LanguageMenu.vue'
import ThemeMenu from './ThemeMenu.vue'

const menuButtonClass =
  'inline-flex size-10 items-center justify-center rounded-xl text-ink transition-colors hover:bg-fill focus-ring'
</script>

<template>
  <div
    class="glass pointer-events-auto relative z-10 flex w-[22rem] shrink-0 flex-col overflow-hidden rounded-2xl shadow-float"
  >
    <AppHeader inline class="shrink-0 px-4 pt-4">
      <div class="-my-1 flex gap-0.5">
        <LanguageMenu :button-class="menuButtonClass" icon-only />
        <ThemeMenu :button-class="menuButtonClass" icon-only />
      </div>
    </AppHeader>
    <slot />
  </div>
</template>
