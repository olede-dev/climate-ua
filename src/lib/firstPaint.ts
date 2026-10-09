/**
 * Resolves just after the page's first paint. The map's code and geometry (MapLibre, the
 * GeoJSON files) wait for it, so they do not compete with the app shell and the side panel for
 * a slow phone's bandwidth and CPU.
 */
export const firstPaint: Promise<void> = new Promise((resolve) =>
  // The first frame callback runs before that frame is painted; the second one, after it.
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))),
)
