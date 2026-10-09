<script setup lang="ts">
import type { LayerId } from '../../types'
import IconTile from '../ui/IconTile.vue'

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
  rivers:
    'M2 6c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2M2 12c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2M2 18c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2',
}
/** Each layer's tile colour, as the macOS settings sidebar. */
const TONES: Record<LayerId, string> = {
  water: 'bg-blue-500',
  temp: 'bg-red-500',
  heat: 'bg-orange-500',
  frost: 'bg-cyan-500',
  drought: 'bg-amber-500',
  rivers: 'bg-teal-500',
}
</script>

<template>
  <fieldset>
    <div class="flex items-center justify-between gap-2 pb-2">
      <legend
        class="float-left px-1 text-[13px] font-semibold text-ink"
        :class="{ 'sr-only': compact }"
      >
        {{ label }}
      </legend>
      <!-- A control beside the title, such as the drawer's close button. -->
      <slot v-if="!compact" name="action" />
    </div>
    <div
      :class="
        compact ? 'group/rail grid gap-1' : 'grid gap-1 sm:grid-cols-3 lg:grid-cols-1'
      "
    >
      <!-- The selected look follows the model, not `:checked`: Chromium does not restyle
           `:has(:checked)` when the URL, not a click, changes the layer. -->
      <label
        v-for="layer in layers"
        :key="layer.id"
        class="group relative flex cursor-pointer items-center rounded-xl transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
        :class="[
          model !== layer.id
            ? 'text-ink hover:bg-fill'
            : compact
              ? 'bg-fill-strong text-ink'
              : 'bg-accent text-white',
          compact ? 'justify-center p-1.5' : 'gap-3 px-2.5 py-2',
        ]"
      >
        <input v-model="model" type="radio" name="layer" :value="layer.id" class="sr-only" />
        <IconTile :path="ICONS[layer.id]" :tone="TONES[layer.id]" size="lg" />
        <template v-if="compact">
          <span class="sr-only">{{ layer.name }}</span>
          <!-- Left of the rail: the active layer's name stays, any other icon names itself and
               what it shows on hover or focus; the active name steps aside meanwhile. -->
          <span
            v-if="model === layer.id"
            aria-hidden="true"
            class="pointer-events-none absolute top-1/2 right-full mr-3 -translate-y-1/2 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-white shadow-float transition-opacity group-hover/rail:opacity-0 group-hover:opacity-0"
          >
            {{ layer.name }}
          </span>
          <span
            aria-hidden="true"
            class="pointer-events-none invisible absolute top-1/2 right-full mr-3 w-56 -translate-y-1/2 rounded-xl bg-surface px-3 py-2 text-ink opacity-0 shadow-float ring-1 ring-line transition-opacity group-hover:visible group-hover:opacity-100 group-has-focus-visible:visible group-has-focus-visible:opacity-100"
          >
            <span class="block text-sm font-semibold">{{ layer.name }}</span>
            <span class="mt-0.5 block text-xs leading-snug text-ink-muted">{{
              layer.description
            }}</span>
          </span>
        </template>
        <span v-else class="min-w-0">
          <span class="block text-sm font-semibold">{{ layer.name }}</span>
          <span
            class="mt-0.5 block text-xs leading-snug max-sm:hidden"
            :class="
              model === layer.id ? 'text-white/80' : 'text-ink-muted'
            "
          >
            {{ layer.description }}
          </span>
        </span>
      </label>
    </div>
    <!-- A control under the list, such as the button that folds it away or back. -->
    <div v-if="$slots.footer" class="mt-1 border-t border-line pt-1">
      <slot name="footer" />
    </div>
  </fieldset>
</template>
