import { QueryCache, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import './styles/main.css'

const queryClient = new QueryClient({
  // The single place a failed request is recorded; the UI shows only a friendly message.
  queryCache: new QueryCache({
    onError: (error, query) =>
      console.error(`Query ${JSON.stringify(query.queryKey)} failed`, error),
  }),
  // Every data file is static and versioned with the site: once loaded, it never goes stale.
  defaultOptions: {
    // Results are large static files (GeoJSON, water-use.json): deep reactivity would wrap every
    // number and coordinate in a proxy and slow each read. Nothing mutates them.
    queries: { staleTime: Infinity, refetchOnWindowFocus: false, shallow: true },
  },
})

createApp(App).use(createPinia()).use(router).use(VueQueryPlugin, { queryClient }).mount('#app')
