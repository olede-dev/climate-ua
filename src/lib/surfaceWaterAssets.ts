import type { SurfaceWaterAsset } from '../types'

/** Asset URLs cannot escape the selected immutable release, including encoded traversal. */
export function surfaceWaterAssetUrl(root: URL, asset: SurfaceWaterAsset): URL {
  if (
    !Number.isSafeInteger(asset.bytes) ||
    asset.bytes < 1 ||
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    !/^[a-zA-Z0-9_./-]+$/.test(asset.url) ||
    asset.url.startsWith('/') ||
    asset.url.split('/').some((part) => part === '..' || part === '.' || part === '')
  ) {
    throw new Error('Invalid surface-water asset reference')
  }
  const url = new URL(asset.url, root)
  if (url.origin !== root.origin || !url.href.startsWith(root.href))
    throw new Error('Unsafe surface-water URL')
  return url
}

/** Read a stream into at most `limit` bytes; shared by the page and the tile worker. */
export async function readSurfaceWaterBytes(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  if (!stream) throw new Error('Empty surface-water response')
  const reader = stream.getReader()
  const output = new Uint8Array(limit)
  let offset = 0
  const abort = () => {
    void reader.cancel(signal.reason)
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      if (offset + value.length > limit)
        throw new Error('Surface-water payload exceeds declared size')
      output.set(value, offset)
      offset += value.length
    }
    signal.throwIfAborted()
    return output.buffer.slice(0, offset)
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel()
    reader.releaseLock()
  }
}
