<script setup lang="ts">
import type { LayerId } from '../../types'

/**
 * The map layers as a list beside the map: one radio per layer with its icon and what it shows; arrows move between them.
 */
defineProps<{
  layers: { id: LayerId; name: string; description: string }[]
  label: string
  /** Icons only, for the folded column; the names stay for screen readers and as tooltips. */
  compact?: boolean
}>()
const model = defineModel<LayerId>({ required: true })

/** Each layer's icon: SVG path data on a 24-unit stroked grid. */
const ICONS: Record<LayerId, string> = {
  water: 'M12 3s-6 6.5-6 11a6 6 0 0 0 12 0c0-4.5-6-11-6-11z',
  temp: 'M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0zM12 9v8',
  heat: 'M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  frost: 'M12 2v20M4.93 7l14.14 10M4.93 17L19.07 7M9 4l3 3 3-3M9 20l3-3 3 3',
  drought: 'M3 21h18M5 17l3-4 3 2 3-5 2 3 3-2M12 3v3M7 5l1.5 2M17 5l-1.5 2',
  rivers: 'M2 6c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2M2 12c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2M2 18c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2',
}
</script>

<template>
  <fieldset>
    <div class="flex items-center gap-2 pb-2" :class="compact ? 'justify-center' : 'justify-between'">
      <legend
        class="float-left px-1 text-xs font-medium text-ink-muted"
        :class="{ 'sr-only': compact }"
      >
        {{ label }}
      </legend>
      <!-- A control beside the title, such as the button that folds the list away;
           the folded column moves it below the icons instead. -->
      <slot v-if="!compact" name="action" />
    </div>
    <div :class="compact ? 'grid gap-1' : 'grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1'">
      <!-- The selected look follows the model, not `:checked`: Chromium does not restyle
           `:has(:checked)` when the URL, not a click, changes the layer. -->
      <label
        v-for="layer in layers"
        :key="layer.id"
        class="group flex cursor-pointer items-center rounded-xl transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
        :class="[
          model === layer.id ? 'bg-accent text-white' : 'text-ink hover:bg-accent hover:text-white',
          compact ? 'justify-center p-2' : 'gap-3 px-3 py-2.5',
        ]"
        :title="compact ? layer.name : undefined"
      >
        <input v-model="model" type="radio" name="layer" :value="layer.id" class="sr-only" />
        <svg
          class="size-8 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path :d="ICONS[layer.id]" />
        </svg>
        <span v-if="compact" class="sr-only">{{ layer.name }}</span>
        <span v-else class="min-w-0">
          <span class="block text-sm font-semibold">{{ layer.name }}</span>
          <span
            class="mt-0.5 block text-xs leading-snug max-sm:hidden"
            :class="model === layer.id ? 'text-white/80' : 'text-ink-muted group-hover:text-white/80'"
          >
            {{ layer.description }}
          </span>
        </span>
      </label>
    </div>
    <div v-if="compact && $slots.action" class="mt-1 border-t border-line pt-1">
      <slot name="action" />
    </div>
  </fieldset>
</template>
