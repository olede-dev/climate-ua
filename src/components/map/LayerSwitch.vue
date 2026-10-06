<script setup lang="ts">
import type { LayerId } from '../../types'

/** Segmented control over the map (SPEC §8.1): one radio per layer, arrows move between them. */
defineProps<{
  layers: { id: LayerId; name: string }[]
  label: string
}>()
const model = defineModel<LayerId>({ required: true })
</script>

<!-- The selected look follows the model, not `:checked`: Chromium does not restyle `:has(:checked)`
     when the URL, not a click, changes the layer. -->
<template>
  <fieldset class="glass inline-flex rounded-full p-1 shadow-float">
    <legend class="sr-only">{{ label }}</legend>
    <label
      v-for="layer in layers"
      :key="layer.id"
      class="relative cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
      :class="model === layer.id ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'"
    >
      <input v-model="model" type="radio" name="layer" :value="layer.id" class="sr-only" />
      {{ layer.name }}
    </label>
  </fieldset>
</template>
