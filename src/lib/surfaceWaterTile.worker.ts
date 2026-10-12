// Decodes and paints surface-water tiles off the main thread (`lib/surfaceWaterWorker.ts`).
import { handleSurfaceWaterRequest, type SurfaceWaterWorkerRequest } from './surfaceWaterWorkerCore'

self.onmessage = async (event: MessageEvent<SurfaceWaterWorkerRequest>) => {
  const [response, transfer] = await handleSurfaceWaterRequest(event.data)
  postMessage(response, { transfer })
}
