import { readonly, ref } from 'vue'

/** Whether the layer choice was opened since the page loaded; until then a ping dot points at it. */
const seen = ref(false)

export function useLayerHint() {
  return { seen: readonly(seen), markSeen: () => (seen.value = true) }
}
