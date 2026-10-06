<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { LOCALE_NAMES, type Locale } from '../../i18n'
import HeaderMenu from './HeaderMenu.vue'

defineProps<{ buttonClass: string }>()

const OPTIONS = (Object.keys(LOCALE_NAMES) as Locale[]).map((value) => ({
  value,
  label: LOCALE_NAMES[value],
}))

const { locale, t, setLocale } = useLocale()
const model = computed({ get: () => locale.value, set: setLocale })
</script>

<template>
  <HeaderMenu
    v-model="model"
    :button-class="buttonClass"
    menu-id="language-menu"
    :menu-label="t.language.menuLabel"
    :trigger-label="t.language.label"
    :options="OPTIONS"
  >
    <template #icon="{ value, iconClass, inMenu }">
      <!--
        A globe on the trigger; a flag beside each language in the menu. Inline SVG rather than
        flag emoji, which Windows renders as two letters.
      -->
      <svg
        v-if="!inMenu"
        viewBox="0 0 24 24"
        :class="iconClass"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
      <svg
        v-else-if="value === 'uk'"
        viewBox="0 0 30 20"
        class="h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-line"
        aria-hidden="true"
      >
        <rect width="30" height="10" fill="#0057b7" />
        <rect y="10" width="30" height="10" fill="#ffd700" />
      </svg>
      <svg
        v-else
        viewBox="0 0 60 30"
        preserveAspectRatio="none"
        class="h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-line"
        aria-hidden="true"
      >
        <clipPath id="union-jack-clip"><rect width="60" height="30" /></clipPath>
        <g clip-path="url(#union-jack-clip)">
          <rect width="60" height="30" fill="#012169" />
          <path d="M0 0l60 30M60 0L0 30" stroke="#fff" stroke-width="6" />
          <path d="M0 0l60 30M60 0L0 30" stroke="#c8102e" stroke-width="2" />
          <path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10" />
          <path d="M30 0v30M0 15h60" stroke="#c8102e" stroke-width="6" />
        </g>
      </svg>
    </template>
  </HeaderMenu>
</template>
