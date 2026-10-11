/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type PreviewServer, type ViteDevServer } from 'vite'

function serveSurfaceWaterBytes(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((request, response, next) => {
    const path = request.url?.split('?')[0]
    if (path?.startsWith(`${server.config.base}data/surface-water/`) && path.endsWith('.bin.gz')) {
      // Gzip is the application payload: the client hashes compressed bytes before decoding.
      // Old Vite responses used the same ETag with Content-Encoding: gzip. A 304 would
      // reuse that decoded browser cache entry even after fixing the response headers.
      delete request.headers['if-none-match']
      delete request.headers['if-modified-since']
      response.setHeader('Cache-Control', 'no-store')
      const setHeader = response.setHeader
      response.setHeader = function (name, value) {
        if (name.toLowerCase() === 'content-encoding') return this
        if (name.toLowerCase() === 'cache-control') return setHeader.call(this, name, 'no-store')
        return setHeader.call(this, name, value)
      }
    }
    next()
  })
}

export default defineConfig({
  base: '/climate-ua/',
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: 'surface-water-file-bytes',
      configureServer: serveSurfaceWaterBytes,
      configurePreviewServer: serveSurfaceWaterBytes,
    },
  ],
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
