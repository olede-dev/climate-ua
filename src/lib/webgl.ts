/**
 * Resolves true when WebGL would be drawn by the CPU (no GPU, or a blocklisted one): headless
 * test servers such as PageSpeed, virtual machines, old laptops. MapLibre then blocks the main
 * thread for seconds, so the map starts as a static poster instead. The check runs in a worker;
 * a browser without WebGL in workers counts as having a GPU and gets the map as before.
 */
export function softwareWebgl(): Promise<boolean> {
  if (typeof OffscreenCanvas === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./webglProbe.worker.ts', import.meta.url), {
      type: 'module',
    })
    const done = (software: boolean) => {
      worker.terminate()
      resolve(software)
    }
    worker.onmessage = (event: MessageEvent<boolean>) => done(event.data)
    worker.onerror = () => done(false)
  })
}
