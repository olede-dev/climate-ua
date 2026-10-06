/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/climate-ua/',
  plugins: [vue(), tailwindcss()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
