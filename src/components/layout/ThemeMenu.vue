<script setup lang="ts">
import { computed } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { useTheme, type ThemePreference } from '../../composables/useTheme'
import HeaderMenu from './HeaderMenu.vue'

defineProps<{ buttonClass: string; iconOnly?: boolean }>()

const VALUES: readonly ThemePreference[] = ['auto', 'light', 'dark']

/** 24×24 stroke icons: half-filled circle for auto, sun, moon. */
const ICONS: Record<ThemePreference, string[]> = {
  auto: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 3v18a9 9 0 0 0 0-18z'],
  light: [
    'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
    'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
  ],
  dark: ['M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z'],
}

const { preference, setPreference } = useTheme()
const { t } = useLocale()
const options = computed(() => VALUES.map((value) => ({ value, label: t.value.theme[value] })))
const model = computed({ get: () => preference.value, set: setPreference })
</script>

<template>
  <HeaderMenu
    v-model="model"
    :button-class="buttonClass"
    :icon-only="iconOnly"
    menu-id="theme-menu"
    :menu-label="t.theme.menuLabel"
    :trigger-label="t.theme.label"
    :options="options"
  >
    <template #icon="{ value, iconClass }">
      <svg
        viewBox="0 0 24 24"
        :class="iconClass"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          v-for="(d, i) in ICONS[value]"
          :key="d"
          :d="d"
          :fill="value === 'auto' && i === 1 ? 'currentColor' : 'none'"
        />
      </svg>
    </template>
  </HeaderMenu>
</template>
