import { onBeforeUnmount, readonly, ref, type Ref } from 'vue'

export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
  const list = window.matchMedia(query)
  const matches = ref(list.matches)
  const onChange = (event: MediaQueryListEvent) => (matches.value = event.matches)
  list.addEventListener('change', onChange)
  onBeforeUnmount(() => list.removeEventListener('change', onChange))
  return readonly(matches)
}
