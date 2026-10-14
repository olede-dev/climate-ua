<script setup lang="ts">
import type { LayerId } from '../../types'
import { computed } from 'vue'
import IconTile from '../ui/IconTile.vue'
import { LAYER_ICONS as ICONS, LAYER_TONES as TONES } from '../../config/layerIcons'

type LayerChoice = { id: LayerId; group: string; name: string; description: string }

const props = defineProps<{
  layers: LayerChoice[]
  label: string
  compact?: boolean
}>()

// Consecutive choices with the same group render as one titled block.
const groups = computed(() =>
  props.layers.reduce<{ name: string; layers: LayerChoice[] }[]>((acc, layer) => {
    const last = acc.at(-1)
    if (last?.name === layer.group) last.layers.push(layer)
    else acc.push({ name: layer.group, layers: [layer] })
    return acc
  }, []),
)
const model = defineModel<LayerId>({ required: true })
</script>

<template>
  <fieldset>
    <div class="flex items-center justify-between gap-2 pb-2">
      <legend
        class="float-left px-1 text-[13px] leading-4 font-bold text-ink"
        :class="{ 'sr-only': compact }"
      >
        {{ label }}
      </legend>
      <slot v-if="!compact" name="action" />
    </div>
    <div
      v-for="(group, index) in groups"
      :key="group.name"
      role="group"
      :aria-label="group.name"
      :class="index > 0 && (compact ? 'mt-1 border-t border-line pt-1' : 'mt-4')"
    >
      <p
        v-if="!compact"
        aria-hidden="true"
        class="px-2.5 pb-1 text-[11px] leading-[14px] font-semibold text-ink-muted"
      >
        {{ group.name }}
      </p>
      <div :class="compact ? 'group/rail grid gap-1' : 'grid gap-1 sm:grid-cols-3 lg:grid-cols-1'">
        <!-- The selected look follows the model, not `:checked`: Chromium does not restyle
           `:has(:checked)` when the URL, not a click, changes the layer. -->
        <label
          v-for="layer in group.layers"
          :key="layer.id"
          class="group relative flex cursor-pointer items-center rounded-lg transition-colors duration-150 ease-out motion-reduce:transition-none has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent"
          :class="[
            model !== layer.id
              ? 'text-ink hover:bg-fill active:bg-fill-strong'
              : compact
                ? 'bg-fill-strong text-ink'
                : 'bg-accent text-white',
            compact ? 'justify-center p-1' : 'gap-2.5 px-2 py-1.5',
          ]"
        >
          <input v-model="model" type="radio" name="layer" :value="layer.id" class="sr-only" />
          <IconTile :path="ICONS[layer.id]" :tone="TONES[layer.id]" :size="compact ? 'lg' : 'sm'" />
          <template v-if="compact">
            <span class="sr-only">{{ layer.name }}</span>
            <span
              v-if="model === layer.id"
              aria-hidden="true"
              class="pointer-events-none absolute top-1/2 right-full mr-3 -translate-y-1/2 rounded-lg bg-accent px-2.5 py-1 text-[12px] leading-[15px] font-semibold whitespace-nowrap text-white shadow-float transition-opacity duration-150 group-hover/rail:opacity-0 group-hover:opacity-0"
            >
              {{ layer.name }}
            </span>
            <span
              aria-hidden="true"
              class="pointer-events-none invisible absolute top-1/2 right-full mr-3 w-56 -translate-y-1/2 rounded-xl glass px-3 py-2 text-ink opacity-0 shadow-float transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-has-focus-visible:visible group-has-focus-visible:opacity-100"
            >
              <span class="block text-[13px] leading-4 font-bold">{{ layer.name }}</span>
              <span class="mt-0.5 block text-[12px] leading-[15px] text-ink-muted">{{
                layer.description
              }}</span>
            </span>
          </template>
          <span v-else class="min-w-0">
            <span class="block truncate text-[13px] leading-4 font-semibold" :title="layer.name">{{
              layer.name
            }}</span>
            <span
              class="mt-0.5 block text-[11px] leading-[14px] max-sm:hidden"
              :class="model === layer.id ? 'text-white/80' : 'text-ink-muted'"
            >
              {{ layer.description }}
            </span>
          </span>
        </label>
      </div>
    </div>
    <div v-if="$slots.footer" class="mt-1 border-t border-line pt-1">
      <slot name="footer" />
    </div>
  </fieldset>
</template>
