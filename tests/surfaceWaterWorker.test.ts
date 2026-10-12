import { gzipSync } from 'node:zlib'
import { beforeAll, expect, test } from 'vitest'
import { decodeSurfaceWaterTile, type SurfaceWaterBounds } from '../src/lib/surfaceWater'
import { surfaceWaterImage } from '../src/lib/surfaceWaterCanvas'
import { handleSurfaceWaterRequest } from '../src/lib/surfaceWaterWorkerCore'

beforeAll(() => {
  // Node has no ImageData; the paint core only needs its width, height and data.
  if (typeof globalThis.ImageData === 'undefined')
    globalThis.ImageData = class {
      data: Uint8ClampedArray
      width: number
      height: number
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
        this.data = new Uint8ClampedArray(width * height * 4)
      }
    } as unknown as typeof ImageData
})

// Five cells; the odd count is padded with class 15 in the last high nibble.
const packed = new Uint8Array([0x10, 0x32, 0xf1])
const gzip = (bytes: Uint8Array) => new Uint8Array(gzipSync(bytes)).buffer

test('decode request matches the pure decoder and transfers its buffer', async () => {
  const [response, transfer] = await handleSurfaceWaterRequest({
    id: 7,
    kind: 'decode',
    gzip: gzip(packed),
    width: 5,
    height: 1,
  })
  expect(response).toEqual({ id: 7, decoded: decodeSurfaceWaterTile(packed, 5) })
  expect(transfer).toHaveLength(1)
})

test('paint request matches the pure image', async () => {
  const before = decodeSurfaceWaterTile(new Uint8Array([0x10, 0x32]), 4)
  const after = decodeSurfaceWaterTile(new Uint8Array([0x21, 0x03]), 4)
  const bounds: SurfaceWaterBounds = [30, 49, 31, 50]
  const [response] = await handleSurfaceWaterRequest({
    id: 1,
    kind: 'paint',
    width: 2,
    height: 2,
    bounds,
    before,
    after,
    transitions: true,
  })
  const expected = surfaceWaterImage({ tile: { width: 2, height: 2 }, bounds, before, after }, true)
  expect(response).toMatchObject({ id: 1 })
  expect([...(response as { image: ImageData }).image.data]).toEqual([...expected.data])
})

test('errors come back as messages, not thrown', async () => {
  const [response] = await handleSurfaceWaterRequest({
    id: 3,
    kind: 'decode',
    gzip: gzip(new Uint8Array([0x10])),
    width: 5,
    height: 1,
  })
  expect(response).toEqual({ id: 3, error: 'Surface-water tile length mismatch' })
})
