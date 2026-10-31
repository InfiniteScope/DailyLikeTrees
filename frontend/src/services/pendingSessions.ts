/** Offline queue for completed sessions the backend has not acknowledged yet. */

import type { SessionCreateData } from './api'

const STORAGE_KEY = 'dlt_pending_sessions'

export function readPendingSessions(): SessionCreateData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePendingSessions(items: SessionCreateData[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function enqueuePendingSession(data: SessionCreateData) {
  const items = readPendingSessions()
  if (data.client_id && items.some(i => i.client_id === data.client_id)) return
  items.push(data)
  writePendingSessions(items)
}

export function removePendingSession(clientId: string | undefined) {
  if (!clientId) return
  writePendingSessions(readPendingSessions().filter(i => i.client_id !== clientId))
}
