/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/climate-ua/',
  plugins: [vue(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // MapLibre in a file of its own: it changes far less often than the app, so a returning
        // reader keeps it cached across deploys.
        codeSplitting: { groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ }] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
