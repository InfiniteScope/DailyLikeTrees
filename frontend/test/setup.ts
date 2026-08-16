import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach } from 'vitest'

// Give every test a pristine IndexedDB instance (no leftover data
// from previous tests, no deleteDatabase blocking on open connections).
beforeEach(() => {
  ;(globalThis as any).indexedDB = new IDBFactory()
})
