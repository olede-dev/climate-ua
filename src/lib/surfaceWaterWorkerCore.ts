import { readSurfaceWaterBytes } from './surfaceWaterAssets'
import { decodeSurfaceWaterTile, type SurfaceWaterBounds } from './surfaceWater'
import { surfaceWaterImage } from './surfaceWaterCanvas'

/** Messages to `surfaceWaterTile.worker.ts`; bytes arrive already checksum-verified. */
export type SurfaceWaterWorkerRequest =
  | { id: number; kind: 'decode'; gzip: ArrayBuffer; width: number; height: number }
  | {
      id: number
      kind: 'paint'
      width: number
      height: number
      bounds: SurfaceWaterBounds
      before: Uint8Array
      after: Uint8Array | null
      transitions: boolean
    }

/** A request without its id, for each kind. */
export type SurfaceWaterWorkerJob = SurfaceWaterWorkerRequest extends infer R
  ? R extends SurfaceWaterWorkerRequest
    ? Omit<R, 'id'>
    : never
  : never

export type SurfaceWaterWorkerResponse =
  | { id: number; decoded: Uint8Array }
  | { id: number; image: ImageBitmap | ImageData }
  | { id: number; error: string }

/** Gunzip and nibble-decode one verified tile. */
export async function decodeSurfaceWaterGzip(
  gzip: ArrayBuffer | Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const packed = await readSurfaceWaterBytes(
    new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip')),
    Math.ceil((width * height) / 2),
    signal,
  )
  return decodeSurfaceWaterTile(new Uint8Array(packed), width * height)
}

/** Pure worker body; returns the response and the buffers to transfer. */
export async function handleSurfaceWaterRequest(
  request: SurfaceWaterWorkerRequest,
): Promise<[SurfaceWaterWorkerResponse, Transferable[]]> {
  const { id } = request
  try {
    if (request.kind === 'decode') {
      const decoded = await decodeSurfaceWaterGzip(
        request.gzip,
        request.width,
        request.height,
        new AbortController().signal,
      )
      return [{ id, decoded }, [decoded.buffer]]
    }
    const image = surfaceWaterImage(
      { tile: request, bounds: request.bounds, before: request.before, after: request.after },
      request.transitions,
    )
    if (typeof createImageBitmap !== 'function') return [{ id, image }, [image.data.buffer]]
    const bitmap = await createImageBitmap(image)
    return [{ id, image: bitmap }, [bitmap]]
  } catch (error) {
    return [{ id, error: error instanceof Error ? error.message : String(error) }, []]
  }
}
