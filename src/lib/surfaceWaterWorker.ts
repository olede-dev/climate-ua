import { paintSurfaceWaterTile, type SurfaceWaterPaintInput } from './surfaceWaterCanvas'
import {
  decodeSurfaceWaterGzip,
  type SurfaceWaterWorkerJob,
  type SurfaceWaterWorkerResponse,
} from './surfaceWaterWorkerCore'

type Pending = {
  resolve: (value: SurfaceWaterWorkerResponse) => void
  reject: (e: unknown) => void
}
let worker: Worker | null | undefined
let nextId = 0
const pending = new Map<number, Pending>()

/** One shared worker; null when unsupported or after it failed, so callers paint in place. */
function tileWorker(): Worker | null {
  if (worker !== undefined) return worker
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined')
    return (worker = null)
  try {
    worker = new Worker(new URL('./surfaceWaterTile.worker.ts', import.meta.url), {
      type: 'module',
    })
  } catch {
    return (worker = null)
  }
  worker.onmessage = (event: MessageEvent<SurfaceWaterWorkerResponse>) => {
    const entry = pending.get(event.data.id)
    pending.delete(event.data.id)
    entry?.resolve(event.data)
  }
  worker.onerror = () => {
    worker?.terminate()
    worker = null
    for (const entry of pending.values()) entry.reject(new Error('Surface-water worker failed'))
    pending.clear()
  }
  return worker
}

function call(
  target: Worker,
  request: SurfaceWaterWorkerJob,
  transfer: Transferable[],
  signal: AbortSignal,
): Promise<SurfaceWaterWorkerResponse> {
  signal.throwIfAborted()
  const id = ++nextId
  return new Promise<SurfaceWaterWorkerResponse>((resolve, reject) => {
    // Abort only settles the caller; the worker finishes the small job and its reply is dropped.
    const abort = () => {
      pending.delete(id)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    pending.set(id, {
      resolve: (response) => {
        signal.removeEventListener('abort', abort)
        if ('error' in response) reject(new Error(response.error))
        else resolve(response)
      },
      reject: (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    })
    target.postMessage({ ...request, id }, { transfer })
  })
}

/** Gunzip and decode a verified tile; `gzip` is transferred and must not be reused. */
export async function decodeSurfaceWaterBytes(
  gzip: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const target = tileWorker()
  if (!target) return decodeSurfaceWaterGzip(gzip, width, height, signal)
  const buffer =
    gzip.byteOffset === 0 && gzip.byteLength === gzip.buffer.byteLength
      ? gzip.buffer
      : gzip.slice().buffer
  const response = await call(
    target,
    { kind: 'decode', gzip: buffer, width, height },
    [buffer],
    signal,
  )
  if (!('decoded' in response)) throw new Error('Unexpected surface-water worker reply')
  return response.decoded
}

/** Paint a tile onto a fresh canvas; the RGBA loop runs in the worker when available. */
export async function paintSurfaceWaterCanvas(
  data: SurfaceWaterPaintInput,
  transitions: boolean,
  signal: AbortSignal,
): Promise<HTMLCanvasElement> {
  const target = tileWorker()
  if (!target) return paintSurfaceWaterTile(data, transitions)
  // Decoded classes stay in the cache, so they are copied, not transferred.
  const response = await call(
    target,
    {
      kind: 'paint',
      width: data.tile.width,
      height: data.tile.height,
      bounds: data.bounds,
      before: data.before,
      after: data.after,
      transitions,
    },
    [],
    signal,
  )
  if (!('image' in response)) throw new Error('Unexpected surface-water worker reply')
  const canvas = document.createElement('canvas')
  canvas.width = data.tile.width
  canvas.height = data.tile.height
  const context = canvas.getContext('2d')!
  const { image } = response
  if (image instanceof ImageData) context.putImageData(image, 0, 0)
  else {
    context.drawImage(image, 0, 0)
    image.close()
  }
  return canvas
}
