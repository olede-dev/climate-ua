import { describe, expect, it } from 'vitest'
import { PendingSourceBatch } from '../src/lib/pendingSourceBatch'

describe('PendingSourceBatch', () => {
  it('does not query removed sources when cleanup synchronously re-enters readiness', () => {
    const batch = new PendingSourceBatch()
    const sources = new Set(['tile-0', 'tile-1'])
    batch.add('tile-0')
    batch.add('tile-1')
    const isLoaded = (id: string) => {
      if (!sources.has(id)) throw new Error('Missing source')
      return true
    }

    for (const id of batch.take()) {
      sources.delete(id)
      expect(batch.takeReady(isLoaded)).toEqual([])
    }
    expect(sources.size).toBe(0)
  })

  it('reveals a complete batch once and keeps an incomplete batch pending', () => {
    const batch = new PendingSourceBatch()
    batch.add('tile-0')
    batch.add('tile-1')
    expect(batch.takeReady((id) => id === 'tile-0')).toEqual([])
    expect(batch.takeReady(() => true)).toEqual(['tile-0', 'tile-1'])
    expect(batch.takeReady(() => true)).toEqual([])
  })
})
