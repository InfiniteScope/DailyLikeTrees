/** Local IndexedDB storage layer — replaces the FastAPI backend for PWA/mobile.
 *
 *  Each function mirrors the backend API response shape so the Pinia stores
 *  work without changes.  All data is persisted in the browser's IndexedDB.
 */

// ═══════════════════════════════════════════════════════════════
// IndexedDB helper
// ═══════════════════════════════════════════════════════════════

const DB_NAME = 'dlt_local_db'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('sessions')) {
        const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true })
        sessionsStore.createIndex('created_at', 'created_at', { unique: false })
      }
      if (!db.objectStoreNames.contains('trees')) {
        const treesStore = db.createObjectStore('trees', { keyPath: 'id', autoIncrement: true })
        treesStore.createIndex('session_id', 'session_id', { unique: false })
        treesStore.createIndex('time_filter_key', 'time_filter_key', { unique: false })
      }
      if (!db.objectStoreNames.contains('todos')) {
        const todosStore = db.createObjectStore('todos', { keyPath: 'id', autoIncrement: true })
        todosStore.createIndex('sort_order', 'sort_order', { unique: false })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Fetch all records from a store, optionally matching an index. */
function getAll<T>(store: string, indexName?: string, indexValue?: string): Promise<T[]> {
  return openDB().then(db => {
    return new Promise<T[]>((resolve, reject) => {
      const t = db.transaction(store, 'readonly')
      const s = t.objectStore(store)
      let req: IDBRequest<T[]>
      if (indexName && indexValue !== undefined) {
        req = s.index(indexName).getAll(indexValue)
      } else {
        req = s.getAll()
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  })
}

// ═══════════════════════════════════════════════════════════════
// Types (kept inline to avoid circular deps)
// ═══════════════════════════════════════════════════════════════

export interface LocalSession {
  id: number
  timer_mode: string
  target_seconds: number
  actual_seconds: number
  species_id: string
  started_at: string
  ended_at: string
  created_at: string
}

export interface LocalTree {
  id: number
  session_id: number
  species_id: string
  growth_stage: number
  grid_x: number
  grid_y: number
  time_filter_key: string
  planted_at: string
}

export interface LocalTodo {
  id: number
  content: string
  completed: number
  sort_order: number
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════════════════════════════════
// Time filter helpers (mirrors backend logic)
// ═══════════════════════════════════════════════════════════════

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekStr(): string {
  const d = new Date()
  // ISO week number
  const temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (temp.getUTCDay() + 6) % 7
  temp.setUTCDate(temp.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(temp.getUTCFullYear(), 0, 4))
  const week = Math.ceil(((temp.getTime() - firstThursday.getTime()) / 86400000 + 1) / 7)
  return `${temp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function monthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Compute all time-filter keys (mirrors backend _compute_filter_key). Exported for symmetry tests. */
export function computeFilterKeys(): Record<string, string> {
  return { today: todayStr(), week: weekStr(), month: monthStr(), total: 'total' }
}

// ═══════════════════════════════════════════════════════════════
// Growth stage (mirrors backend/app/utils/growth.py)
// ═══════════════════════════════════════════════════════════════

/** Growth stage (mirrors backend/app/utils/growth.py). Exported for symmetry tests. */
export function getGrowthStage(durationMinutes: number): number {
  if (durationMinutes <= 14) return 0
  if (durationMinutes <= 29) return 1
  if (durationMinutes <= 59) return 2
  return 3
}

// ═══════════════════════════════════════════════════════════════
// Sessions
// ═══════════════════════════════════════════════════════════════

export interface SessionCreateData {
  timer_mode: string
  target_seconds: number
  actual_seconds: number
  species_id: string
  started_at: string
  ended_at: string
}

export interface SessionCompleteResponse {
  session: LocalSession
  tree: LocalTree
}

export async function createSession(data: SessionCreateData): Promise<SessionCompleteResponse> {
  const db = await openDB()
  const now = data.ended_at

  // 1. Create session
  const sessionId = await new Promise<number>((resolve, reject) => {
    const t = db.transaction('sessions', 'readwrite')
    const s = t.objectStore('sessions')
    const req = s.add({
      timer_mode: data.timer_mode,
      target_seconds: data.target_seconds,
      actual_seconds: data.actual_seconds,
      species_id: data.species_id,
      started_at: data.started_at,
      ended_at: data.ended_at,
      created_at: now,
    })
    req.onsuccess = () => resolve(req.result as number)
    req.onerror = () => reject(req.error)
  })

  // 2. Calculate growth stage
  const durationMinutes = data.actual_seconds / 60
  const growthStage = getGrowthStage(durationMinutes)

  // 3. Assign grid position (simple sequential, frontend randomizes anyway)
  const filterKeys = computeFilterKeys()
  const existingTrees = await getAll<LocalTree>('trees', 'time_filter_key', filterKeys.today)
  const count = existingTrees.length
  const COLS = 8
  const gridX = count % COLS
  const gridY = Math.floor(count / COLS)

  // 4. Create tree rows for all time filters
  const t = db.transaction('trees', 'readwrite')
  const treeStore = t.objectStore('trees')
  let firstTreeId = 0

  const keys = [filterKeys.today, filterKeys.week, filterKeys.month, filterKeys.total]
  for (const key of keys) {
    const treeReq = treeStore.add({
      session_id: sessionId,
      species_id: data.species_id,
      growth_stage: growthStage,
      grid_x: gridX,
      grid_y: gridY,
      time_filter_key: key,
      planted_at: now,
    })
    if (key === filterKeys.today) {
      treeReq.onsuccess = () => { firstTreeId = treeReq.result as number }
    }
  }

  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })

  const session: LocalSession = {
    id: sessionId,
    timer_mode: data.timer_mode,
    target_seconds: data.target_seconds,
    actual_seconds: data.actual_seconds,
    species_id: data.species_id,
    started_at: data.started_at,
    ended_at: data.ended_at,
    created_at: now,
  }

  const tree: LocalTree = {
    id: firstTreeId,
    session_id: sessionId,
    species_id: data.species_id,
    growth_stage: growthStage,
    grid_x: gridX,
    grid_y: gridY,
    time_filter_key: filterKeys.today,
    planted_at: now,
  }

  return { session, tree }
}

export async function getSessions(limit = 20, offset = 0) {
  const all = await openDB().then(db => {
    return new Promise<LocalSession[]>((resolve, reject) => {
      const t = db.transaction('sessions', 'readonly')
      const s = t.objectStore('sessions')
      const idx = s.index('created_at')
      const req = idx.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  })

  // Sort desc, paginate
  const sorted = all.sort((a, b) => b.created_at.localeCompare(a.created_at))
  const sessions = sorted.slice(offset, offset + limit)
  return { sessions, total: all.length }
}

// ═══════════════════════════════════════════════════════════════
// Trees
// ═══════════════════════════════════════════════════════════════

export interface TreeListResponse {
  trees: Array<{
    id: number
    session_id: number
    species_id: string
    growth_stage: number
    grid_x: number
    grid_y: number
    planted_at: string
  }>
  stats: { count: number; total_minutes: number }
}

export async function getTreesByFilter(filter: string): Promise<TreeListResponse> {
  const filterKeys = computeFilterKeys()
  const key = filterKeys[filter] || 'total'

  const trees = await getAll<LocalTree>('trees', 'time_filter_key', key)

  // Sort by grid_y then grid_x
  trees.sort((a, b) => a.grid_y - b.grid_y || a.grid_x - b.grid_x)

  // Calculate total_minutes from sessions
  const db = await openDB()
  const sessionIds = [...new Set(trees.map(t => t.session_id))]
  let totalMinutes = 0

  if (sessionIds.length > 0) {
    const allSessions = await new Promise<LocalSession[]>((resolve, reject) => {
      const t = db.transaction('sessions', 'readonly')
      const s = t.objectStore('sessions')
      const req = s.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    for (const s of allSessions) {
      if (sessionIds.includes(s.id)) {
        totalMinutes += Math.floor(s.actual_seconds / 60)
      }
    }
  }

  return {
    trees: trees.map(t => ({
      id: t.id,
      session_id: t.session_id,
      species_id: t.species_id,
      growth_stage: t.growth_stage,
      grid_x: t.grid_x,
      grid_y: t.grid_y,
      planted_at: t.planted_at,
    })),
    stats: { count: trees.length, total_minutes: totalMinutes },
  }
}

export async function deleteTreesByFilter(filter: string): Promise<number> {
  const filterKeys = computeFilterKeys()
  const key = filterKeys[filter] || 'total'

  const db = await openDB()

  // Step 1: get session IDs for trees matching this filter
  const matchingTrees = await getAll<LocalTree>('trees', 'time_filter_key', key)
  const sessionIds = [...new Set(matchingTrees.map(t => t.session_id))]

  if (sessionIds.length === 0) return 0

  // Step 2: delete ALL tree rows for those sessions (across every filter)
  const allTrees = await getAll<LocalTree>('trees')
  const treesToDelete = allTrees.filter(t => sessionIds.includes(t.session_id))

  let deletedCount = 0
  {
    const t = db.transaction('trees', 'readwrite')
    const s = t.objectStore('trees')
    for (const tree of treesToDelete) {
      s.delete(tree.id)
      deletedCount++
    }
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  }

  // Step 3: delete the parent sessions
  {
    const t = db.transaction('sessions', 'readwrite')
    const s = t.objectStore('sessions')
    for (const sid of sessionIds) {
      s.delete(sid)
    }
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  }

  return deletedCount
}

// ═══════════════════════════════════════════════════════════════
// Todos
// ═══════════════════════════════════════════════════════════════

export async function getTodos(): Promise<LocalTodo[]> {
  const todos = await getAll<LocalTodo>('todos')
  return todos.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
}

export async function createTodo(content: string): Promise<LocalTodo> {
  const db = await openDB()

  // Find max sort_order (start at -1 so the first todo gets 0,
  // matching the backend which uses None → 0.0)
  const all = await getTodos()
  const maxOrder = all.reduce((max, t) => Math.max(max, t.sort_order), -1)

  const now = new Date().toISOString()
  const todo: Omit<LocalTodo, 'id'> = {
    content,
    completed: 0,
    sort_order: maxOrder + 1,
    created_at: now,
    updated_at: now,
  }

  const id = await new Promise<number>((resolve, reject) => {
    const t = db.transaction('todos', 'readwrite')
    const s = t.objectStore('todos')
    const req = s.add(todo)
    req.onsuccess = () => resolve(req.result as number)
    req.onerror = () => reject(req.error)
  })

  return { id, ...todo }
}

export async function updateTodo(id: number, data: { content?: string; completed?: number }): Promise<LocalTodo | null> {
  const db = await openDB()

  const existing = await new Promise<LocalTodo | undefined>((resolve, reject) => {
    const t = db.transaction('todos', 'readonly')
    const s = t.objectStore('todos')
    const req = s.get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  if (!existing) return null

  if (data.content !== undefined) existing.content = data.content
  if (data.completed !== undefined) existing.completed = data.completed
  existing.updated_at = new Date().toISOString()

  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('todos', 'readwrite')
    const s = t.objectStore('todos')
    s.put(existing)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })

  return existing
}

export async function deleteTodo(id: number): Promise<boolean> {
  const db = await openDB()
  const existing = await new Promise<LocalTodo | undefined>((resolve, reject) => {
    const t = db.transaction('todos', 'readonly')
    const s = t.objectStore('todos')
    const req = s.get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  if (!existing) return false

  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('todos', 'readwrite')
    const s = t.objectStore('todos')
    s.delete(id)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })

  return true
}

export async function reorderTodos(items: { id: number; sort_order: number }[]): Promise<LocalTodo[]> {
  const db = await openDB()

  const t = db.transaction('todos', 'readwrite')
  const s = t.objectStore('todos')

  for (const item of items) {
    const existing = await new Promise<LocalTodo | undefined>((resolve, reject) => {
      const req = s.get(item.id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (existing) {
      existing.sort_order = item.sort_order
      s.put(existing)
    }
  }

  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })

  return getTodos()
}

// ═══════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════

const SETTINGS_DEFAULTS: Record<string, string> = {
  theme: 'light',
  master_volume: '80',
  bgm_enabled: 'true',
  ambiance_enabled: 'true',
  default_timer_mode: 'countdown',
  default_species_id: 'oak',
  dev_mode: 'false',
  weather_enabled: 'true',
  floating_ball_enabled: 'false',
}

export async function getSettings(): Promise<Record<string, any>> {
  const db = await openDB()
  const stored = await new Promise<Record<string, string>>((resolve, reject) => {
    const t = db.transaction('settings', 'readonly')
    const s = t.objectStore('settings')
    const req = s.getAll()
    req.onsuccess = () => {
      const map: Record<string, string> = {}
      for (const item of req.result) {
        map[item.key] = item.value
      }
      resolve(map)
    }
    req.onerror = () => reject(req.error)
  })

  const result: Record<string, any> = {}
  for (const key of Object.keys(SETTINGS_DEFAULTS)) {
    result[key] = stored[key] !== undefined ? stored[key] : SETTINGS_DEFAULTS[key]
  }

  // Find latest updated_at
  const allValues = await new Promise<any[]>((resolve, reject) => {
    const t = db.transaction('settings', 'readonly')
    const s = t.objectStore('settings')
    const req = s.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  if (allValues.length > 0) {
    result.updated_at = allValues[allValues.length - 1].updated_at
  }

  return result
}

export async function updateSettings(data: Record<string, any>): Promise<Record<string, any>> {
  const db = await openDB()
  const now = new Date().toISOString()

  const t = db.transaction('settings', 'readwrite')
  const s = t.objectStore('settings')

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue
    const strValue = typeof value === 'boolean' ? String(value) : String(value)
    s.put({ key, value: strValue, updated_at: now })
  }

  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })

  return getSettings()
}
