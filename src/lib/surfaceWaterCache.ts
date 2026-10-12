/** Byte-limited LRU of decoded surface-water tiles, keyed by encoded SHA-256. */
export class SurfaceWaterTileCache {
  private readonly entries = new Map<string, Uint8Array>()
  bytes = 0
  readonly limit: number
  constructor(limit: number) {
    this.limit = limit
  }
  get(key: string): Uint8Array | undefined {
    const hit = this.entries.get(key)
    if (hit) {
      this.entries.delete(key)
      this.entries.set(key, hit)
    }
    return hit
  }
  set(key: string, value: Uint8Array): void {
    const old = this.entries.get(key)
    if (old) {
      this.bytes -= old.length
      this.entries.delete(key)
    }
    while (this.bytes + value.length > this.limit && this.entries.size) {
      const [oldest, data] = this.entries.entries().next().value!
      this.bytes -= data.length
      this.entries.delete(oldest)
    }
    this.entries.set(key, value)
    this.bytes += value.length
  }
}
