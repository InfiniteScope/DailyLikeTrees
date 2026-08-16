/** API service layer — supports both remote HTTP backend and local IndexedDB.
 *
 *  When VITE_LOCAL_BACKEND=true (PWA / mobile standalone), all calls go to
 *  the local IndexedDB layer.  Otherwise they hit the FastAPI backend at
 *  localhost:8000 (desktop Electron / dev mode).
 */

import axios from 'axios'

// ── Detect backend mode ──

const USE_LOCAL = import.meta.env.VITE_LOCAL_BACKEND === 'true'

console.log(`[API] Backend mode: ${USE_LOCAL ? 'LOCAL (IndexedDB)' : 'REMOTE (HTTP)'}`)

// ── HTTP client (only used in remote mode) ──

const http = axios.create({
  baseURL: 'http://127.0.0.1:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

// ── Dynamic imports for local backend ──

let localDb: typeof import('./localDb') | null = null
async function getLocalDb() {
  if (!localDb) {
    localDb = await import('./localDb')
  }
  return localDb
}

// ═════════════════════════════════════════════════════════════
// Sessions
// ═════════════════════════════════════════════════════════════

export interface SessionCreateData {
  timer_mode: string
  target_seconds: number
  actual_seconds: number
  species_id: string
  started_at: string
  ended_at: string
}

export async function completeSession(data: SessionCreateData) {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const result = await db.createSession(data)
    return { data: result }
  }
  return http.post('/api/sessions', data)
}

export async function getSessions(limit = 20, offset = 0) {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const result = await db.getSessions(limit, offset)
    return { data: result }
  }
  return http.get('/api/sessions', { params: { limit, offset } })
}

// ═════════════════════════════════════════════════════════════
// Trees
// ═════════════════════════════════════════════════════════════

export async function getTrees(filter: string = 'today') {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const result = await db.getTreesByFilter(filter)
    return { data: result }
  }
  return http.get('/api/trees', { params: { filter } })
}

export async function deleteTrees(filter: string = 'today') {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const deleted = await db.deleteTreesByFilter(filter)
    return { data: { deleted } }
  }
  return http.delete('/api/trees', { params: { filter } })
}

// ═════════════════════════════════════════════════════════════
// Todos
// ═════════════════════════════════════════════════════════════

export async function getTodos() {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const result = await db.getTodos()
    return { data: result }
  }
  return http.get('/api/todos')
}

export async function createTodo(content: string) {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const result = await db.createTodo(content)
    return { data: result }
  }
  return http.post('/api/todos', { content })
}

export async function updateTodo(id: number, data: { content?: string; completed?: number }) {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const result = await db.updateTodo(id, data)
    if (!result) throw new Error(`Todo ${id} not found`)
    return { data: result }
  }
  return http.patch(`/api/todos/${id}`, data)
}

export async function deleteTodo(id: number) {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const success = await db.deleteTodo(id)
    if (!success) throw new Error(`Todo ${id} not found`)
    return { data: null }
  }
  return http.delete(`/api/todos/${id}`)
}

export async function reorderTodos(items: { id: number; sort_order: number }[]) {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const result = await db.reorderTodos(items)
    return { data: result }
  }
  return http.put('/api/todos/reorder', { items })
}

// ═════════════════════════════════════════════════════════════
// Settings
// ═════════════════════════════════════════════════════════════

export async function getSettings() {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const result = await db.getSettings()
    return { data: result }
  }
  return http.get('/api/settings')
}

export async function updateSettings(data: Record<string, any>) {
  if (USE_LOCAL) {
    const db = await getLocalDb()
    const result = await db.updateSettings(data)
    return { data: result }
  }
  return http.put('/api/settings', data)
}

export default http
