<script setup lang="ts">
import { useTemplateRef } from 'vue'

import { useLocale } from '../../composables/useLocale'
import type { BasemapKind } from '../map/basemap'
import AboutDialog from './AboutDialog.vue'

/** The basemap providers' credits, required by their licences, stand in for map attribution. */
defineProps<{ basemap: BasemapKind }>()
const { t } = useLocale()
const link = 'rounded text-accent-ink hover:underline focus-ring'
const about = useTemplateRef<InstanceType<typeof AboutDialog>>('about')
</script>

<template>
  <footer
    class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-ink-muted"
  >
    <p>
      {{ t.footer.map }}
      <template v-if="basemap === 'openfreemap'">
        <a :class="link" href="https://openfreemap.org/" target="_blank" rel="noopener"
          >OpenFreeMap</a
        >,
        <a :class="link" href="https://www.openmaptiles.org/" target="_blank" rel="noopener"
          >© OpenMapTiles</a
        >,
        <a
          :class="link"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener"
          >© OpenStreetMap</a
        >, © Esri, Maxar, Earthstar Geographics.
      </template>
      <template v-else>
        © Esri, HERE, Garmin,
        <a
          :class="link"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener"
          >© OpenStreetMap</a
        >.
      </template>
    </p>
    <button type="button" :class="link" @click="about?.open()">
      {{ t.footer.about }}
    </button>
    <AboutDialog ref="about" />
  </footer>
</template>
