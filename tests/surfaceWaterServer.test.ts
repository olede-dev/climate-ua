import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createServer, preview } from 'vite'
import { expect, test } from 'vitest'

test.each(['development', 'preview'] as const)(
  '%s serves encoded water tiles afresh even with a cached gzip response validator',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'surface-water-server-'))
    const directory = join(root, mode === 'development' ? 'public' : 'dist')
    const tiles = join(directory, 'data/surface-water/versions/test/tiles')
    const encoded = gzipSync(Buffer.from([0x21, 0x32]))
    await mkdir(tiles, { recursive: true })
    await writeFile(join(tiles, 'tile.bin.gz'), encoded)
    const options = {
      configFile: resolve('vite.config.ts'),
      root,
      server: { host: '127.0.0.1', port: 0, watch: null },
      preview: { host: '127.0.0.1', port: 0 },
    }
    const server = mode === 'development' ? await createServer(options) : await preview(options)
    try {
      if ('listen' in server) await server.listen()
      const address = server.httpServer!.address()
      if (!address || typeof address === 'string') throw new Error('Missing test server address')
      const url = `http://127.0.0.1:${address.port}/climate-ua/data/surface-water/versions/test/tiles/tile.bin.gz`
      const first = await fetch(url)
      expect(first.status).toBe(200)
      expect(first.headers.get('content-encoding')).toBeNull()
      expect(Buffer.from(await first.arrayBuffer())).toEqual(encoded)

      // The obsolete compressed response has exactly the same file validator.
      const second = await fetch(url, {
        headers: {
          'If-None-Match': first.headers.get('etag')!,
          'If-Modified-Since': first.headers.get('last-modified')!,
        },
      })
      expect(second.status).toBe(200)
      expect(second.headers.get('cache-control')).toBe('no-store')
      expect(second.headers.get('content-encoding')).toBeNull()
      expect(Buffer.from(await second.arrayBuffer())).toEqual(encoded)
    } finally {
      await server.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  15_000,
)
