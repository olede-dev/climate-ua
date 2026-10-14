<script setup lang="ts">
import { useLocale } from '../../composables/useLocale'
import IconTile from '../ui/IconTile.vue'
import AppHeader from './AppHeader.vue'
import LanguageMenu from './LanguageMenu.vue'
import ThemeMenu from './ThemeMenu.vue'

defineProps<{
  /** The open layer, named at the top of every layer's content. */
  layer: { name: string; description: string; icon: string; tone: string }
}>()
/** Hidden leaves only the header, so the map gets the width. */
const collapsed = defineModel<boolean>('collapsed', { default: false })
const { t } = useLocale()

const menuButtonClass =
  'inline-flex size-8 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-out hover:bg-fill active:bg-fill-strong focus-ring'
</script>

<template>
  <div
    class="glass pointer-events-auto z-10 flex shrink-0 flex-col overflow-hidden rounded-2xl shadow-float"
    :class="collapsed ? 'absolute self-start' : 'relative w-[22rem]'"
  >
    <AppHeader
      inline
      :compact="collapsed"
      class="shrink-0 px-4"
      :class="collapsed ? 'py-3' : 'pt-4'"
    >
      <div class="-my-1 flex gap-1">
        <LanguageMenu :button-class="menuButtonClass" icon-only />
        <ThemeMenu :button-class="menuButtonClass" icon-only />
        <button
          type="button"
          :class="menuButtonClass"
          :aria-expanded="!collapsed"
          :aria-label="collapsed ? t.home.showSidebar : t.home.hideSidebar"
          :title="collapsed ? t.home.showSidebar : t.home.hideSidebar"
          @click="collapsed = !collapsed"
        >
          <svg
            viewBox="0 0 16 16"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
            <path d="M6 2.75v10.5" />
          </svg>
        </button>
      </div>
    </AppHeader>
    <div
      v-show="!collapsed"
      class="flex shrink-0 items-center gap-3 border-b border-line px-4 pt-4 pb-3"
    >
      <IconTile :path="layer.icon" :tone="layer.tone" size="lg" />
      <div class="min-w-0">
        <h2 class="truncate text-[22px] leading-[26px] font-bold text-ink" :title="layer.name">
          {{ layer.name }}
        </h2>
        <p class="truncate text-[12px] leading-[15px] text-ink-muted" :title="layer.description">
          {{ layer.description }}
        </p>
      </div>
    </div>
    <!-- v-show, not v-if: SurfaceWaterView teleports into the slot and needs its target. -->
    <div v-show="!collapsed" class="flex min-h-0 flex-1 flex-col"><slot /></div>
  </div>
</template>
