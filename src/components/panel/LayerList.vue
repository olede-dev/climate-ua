<script setup lang="ts">
import type { LayerId } from '../../types'

/**
 * The map layers as a list beside the map, like the station list of rivers-ua: one radio per
 * layer with what it shows and its colour scale; arrows move between them.
 */
defineProps<{
  layers: { id: LayerId; name: string; description: string; gradient: string }[]
  label: string
}>()
const model = defineModel<LayerId>({ required: true })
</script>

<template>
  <fieldset>
    <legend class="px-1 pb-2 text-xs font-medium text-ink-muted">{{ label }}</legend>
    <div class="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
      <!-- The selected look follows the model, not `:checked`: Chromium does not restyle
           `:has(:checked)` when the URL, not a click, changes the layer. -->
      <label
        v-for="layer in layers"
        :key="layer.id"
        class="block cursor-pointer rounded-xl px-3 py-2.5 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
        :class="model === layer.id ? 'bg-fill' : 'hover:bg-fill/60'"
      >
        <input v-model="model" type="radio" name="layer" :value="layer.id" class="sr-only" />
        <span class="flex items-center justify-between gap-2">
          <span
            class="text-sm text-ink"
            :class="model === layer.id ? 'font-semibold' : 'font-medium'"
            >{{ layer.name }}</span
          >
          <span
            v-if="model === layer.id"
            class="size-2 shrink-0 rounded-full bg-accent"
            aria-hidden="true"
          ></span>
        </span>
        <span class="mt-0.5 block text-xs leading-snug text-ink-muted max-sm:hidden">
          {{ layer.description }}
        </span>
        <span
          class="mt-2 block h-1.5 rounded-full"
          :style="{ background: layer.gradient }"
          aria-hidden="true"
        ></span>
      </label>
    </div>
  </fieldset>
</template>
