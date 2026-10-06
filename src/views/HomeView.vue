<script setup lang="ts">
import { ref } from 'vue'

import AppFooter from '../components/layout/AppFooter.vue'
import AppHeader from '../components/layout/AppHeader.vue'
import type { BasemapKind } from '../components/map/basemap'
import ClimateMap from '../components/map/ClimateMap.vue'
import { useLocale } from '../composables/useLocale'

const { t } = useLocale()
const basemap = ref<BasemapKind>('openfreemap')
</script>

<template>
  <!-- Every block is a rounded card on the canvas, separated by one gutter (gap and padding). -->
  <div class="flex h-dvh flex-col gap-2 bg-canvas p-2 sm:gap-3 sm:p-3">
    <AppHeader />
    <main class="flex min-h-0 flex-1">
      <section
        class="relative isolate min-w-0 flex-1 overflow-hidden rounded-2xl shadow-card"
        :aria-label="t.home.map"
      >
        <ClimateMap @basemap="basemap = $event">
          <p
            class="glass absolute bottom-3 left-3 z-10 rounded-xl px-4 py-2.5 text-sm text-ink shadow-float"
          >
            {{ t.home.comingSoon }}
          </p>
        </ClimateMap>
      </section>
    </main>
    <AppFooter :basemap="basemap" />
  </div>
</template>
