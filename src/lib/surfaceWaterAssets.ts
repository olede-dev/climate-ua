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
