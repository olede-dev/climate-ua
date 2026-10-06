import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { parseUrlState, toUrlQuery } from '../lib/urlState'
import { useUiStore } from '../stores/ui'

const sameQuery = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * Keeps the UI store and `route.query` in step both ways. The URL wins on load and on
 * manual edits; store changes replace the entry, so the timelapse does not flood the history.
 */
export function useUrlSync() {
  const route = useRoute()
  const router = useRouter()
  const ui = useUiStore()

  watch(
    () => route.query,
    (query) => {
      const state = parseUrlState(query)
      ui.applyUrlState(state)
      // Normalise unknown values away so the address bar matches what is shown.
      const normalised = toUrlQuery(state)
      if (!sameQuery(normalised, query)) void router.replace({ query: normalised })
    },
    { immediate: true },
  )

  watch(
    () => toUrlQuery(ui.toUrlState()),
    (query) => {
      if (!sameQuery(query, route.query)) void router.replace({ query })
    },
  )
}
