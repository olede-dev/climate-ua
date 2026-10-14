<script setup lang="ts">
import type { LayerId } from '../../types'
import { computed, ref } from 'vue'
import { useTheme } from '../../composables/useTheme'
import { useLayerHint } from '../../composables/useLayerHint'
import PingDot from '../ui/PingDot.vue'

type LayerChoice = {
  id: LayerId
  group: string
  groupIcon: string
  name: string
  description: string
}

// `bare` drops the summary row and always shows the choices, for the phone drawer.
const props = defineProps<{ layers: LayerChoice[]; label: string; bare?: boolean }>()
const model = defineModel<LayerId>({ required: true })
const open = ref(false)
const { isDark } = useTheme()
const { seen: hintSeen, markSeen } = useLayerHint()
// Screenshots of each layer's map, made by `scripts/layer-previews.mjs`.
const preview = (id: LayerId) =>
  `${import.meta.env.BASE_URL}layer-previews/${id}${isDark.value ? '-dark' : ''}.webp`

const groups = computed(() =>
  props.layers.reduce<{ name: string; icon: string; layers: LayerChoice[] }[]>((acc, layer) => {
    const last = acc.at(-1)
    if (last?.name === layer.group) last.layers.push(layer)
    else acc.push({ name: layer.group, icon: layer.groupIcon, layers: [layer] })
    return acc
  }, []),
)
const current = computed(() => props.layers.find((layer) => layer.id === model.value)!)

function pick(id: LayerId) {
  markSeen()
  model.value = id
  open.value = false
}
</script>

<template>
  <!-- One disclosure row both shows the current layer and opens the choice. -->
  <div :class="!bare && 'shrink-0 border-b border-line px-4 pt-3 pb-3'">
    <div v-if="bare" class="flex items-center justify-between gap-2 pb-2">
      <h2 class="text-[13px] leading-4 font-bold text-ink">{{ label }}</h2>
      <slot name="action" />
    </div>
    <button
      v-else
      type="button"
      class="focus-ring group -mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-fill active:bg-fill-strong motion-reduce:transition-none"
      :aria-expanded="open"
      aria-controls="layer-picker-choices"
      @click="((open = !open), markSeen())"
    >
      <span class="min-w-0 flex-1">
        <span
          class="flex items-center gap-1.5 text-[11px] leading-[14px] font-semibold text-ink-muted"
          >{{ label }}<PingDot v-if="!hintSeen"
        /></span>
        <span class="mt-1.5 flex items-start gap-3">
          <img
            :src="preview(current.id)"
            alt=""
            width="72"
            height="45"
            class="h-[45px] w-[72px] shrink-0 rounded-lg object-cover shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)]"
          />
          <span class="min-w-0">
            <span class="block text-[15px] leading-5 font-semibold text-ink">{{
              current.name
            }}</span>
            <span class="mt-0.5 block text-[12px] leading-[15px] text-pretty text-ink-muted">{{
              current.description
            }}</span>
          </span>
        </span>
      </span>
      <svg
        viewBox="0 0 16 16"
        class="size-4 shrink-0 self-start text-ink-muted transition-transform duration-150 ease-out group-hover:text-ink motion-reduce:transition-none"
        :class="open && 'rotate-180'"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path d="M4 6l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <fieldset v-if="bare || open" id="layer-picker-choices" :class="!bare && 'mt-2'">
      <legend class="sr-only">{{ label }}</legend>
      <div
        v-for="(group, index) in groups"
        :key="group.name"
        role="group"
        :aria-label="group.name"
        :class="index > 0 && 'mt-3'"
      >
        <p
          aria-hidden="true"
          class="flex items-center gap-1 pb-1.5 text-[11px] leading-[14px] font-semibold text-ink-muted"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-3 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="group.icon" />
          </svg>
          {{ group.name }}
        </p>
        <div class="grid grid-cols-3 gap-2">
          <label
            v-for="layer in group.layers"
            :key="layer.id"
            class="group cursor-pointer rounded-xl p-1 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-accent"
            :class="model === layer.id ? 'bg-accent/10 ring-2 ring-accent' : 'hover:bg-fill'"
            :title="layer.description"
          >
            <input
              type="radio"
              name="layer-picker"
              :value="layer.id"
              :checked="model === layer.id"
              class="sr-only"
              @change="pick(layer.id)"
            />
            <img
              :src="preview(layer.id)"
              alt=""
              width="160"
              height="100"
              loading="lazy"
              class="block aspect-[16/10] w-full rounded-lg object-cover shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)]"
            />
            <span
              class="mt-1 block px-0.5 text-[12px] leading-[15px] font-semibold text-ink line-clamp-2"
              >{{ layer.name }}</span
            >
          </label>
        </div>
      </div>
    </fieldset>
  </div>
</template>
