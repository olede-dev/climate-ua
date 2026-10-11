/** Detach a batch before map mutations can synchronously emit source events. */
export class PendingSourceBatch {
  private ids: string[] = []

  add(id: string) {
    this.ids.push(id)
  }

  take(): string[] {
    const ids = this.ids
    this.ids = []
    return ids
  }

  takeReady(isLoaded: (id: string) => boolean): string[] {
    if (!this.ids.length || !this.ids.every(isLoaded)) return []
    return this.take()
  }
}
