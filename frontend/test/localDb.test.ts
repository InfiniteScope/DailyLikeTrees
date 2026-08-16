/** localDb (IndexedDB backend) behavior tests.
 *
 * Mirrors backend/tests/test_session_api.py + test_trees_api.py + test_todos_api.py
 * so the PWA/mobile data path stays symmetric with the FastAPI one.
 */

import { describe, expect, it } from 'vitest'
import {
  computeFilterKeys,
  createSession,
  createTodo,
  deleteTodo,
  deleteTreesByFilter,
  getSessions,
  getSettings,
  getTodos,
  getTreesByFilter,
  reorderTodos,
  updateSettings,
  updateTodo,
} from '../src/services/localDb'

function sessionPayload(actualSeconds: number, speciesId = 'tree1') {
  return {
    timer_mode: 'countdown',
    target_seconds: actualSeconds,
    actual_seconds: actualSeconds,
    species_id: speciesId,
    started_at: '2026-08-16T09:00:00.000Z',
    ended_at: '2026-08-16T09:25:00.000Z',
  }
}

describe('time filter keys match backend format', () => {
  it('today is YYYY-MM-DD, week is YYYY-Wnn, month is YYYY-MM, total is "total"', () => {
    const keys = computeFilterKeys()
    expect(keys.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(keys.week).toMatch(/^\d{4}-W\d{2}$/)
    expect(keys.month).toMatch(/^\d{4}-\d{2}$/)
    expect(keys.total).toBe('total')
  })
})

describe('createSession mirrors backend transaction', () => {
  it('creates 1 session + 4 tree rows (today/week/month/total)', async () => {
    const { session, tree } = await createSession(sessionPayload(25 * 60))
    expect(session.actual_seconds).toBe(1500)
    expect(tree.session_id).toBe(session.id)
    // 25 minutes → sprout (stage 1)
    expect(tree.growth_stage).toBe(1)

    for (const filter of ['today', 'week', 'month', 'total']) {
      const res = await getTreesByFilter(filter)
      expect(res.stats.count).toBe(1)
      expect(res.trees[0].session_id).toBe(session.id)
    }
  })

  it('maps growth stage from actual_seconds', async () => {
    const cases: Array<[number, number]> = [
      [10 * 60, 0],
      [25 * 60, 1],
      [45 * 60, 2],
      [90 * 60, 3],
    ]
    for (const [seconds, stage] of cases) {
      const { tree } = await createSession(sessionPayload(seconds))
      expect(tree.growth_stage).toBe(stage)
    }
  })

  it('assigns grid positions row-by-row, 8 per row', async () => {
    for (let i = 0; i < 9; i++) {
      await createSession(sessionPayload(60 * 60))
    }
    const trees = (await getTreesByFilter('today')).trees
    trees.sort((a, b) => a.grid_y - b.grid_y || a.grid_x - b.grid_x)
    expect(trees.slice(0, 8).map(t => [t.grid_x, t.grid_y])).toEqual(
      Array.from({ length: 8 }, (_, i) => [i, 0]),
    )
    expect([trees[8].grid_x, trees[8].grid_y]).toEqual([0, 1])
  })

  it('computes total_minutes as sum(actual_seconds) // 60', async () => {
    await createSession(sessionPayload(30 * 60))
    await createSession(sessionPayload(60 * 60))
    await createSession(sessionPayload(10 * 60))
    const res = await getTreesByFilter('today')
    expect(res.stats.count).toBe(3)
    expect(res.stats.total_minutes).toBe(100)
  })
})

describe('deleteTreesByFilter cascades like the backend', () => {
  it('removes all 4 rows + parent sessions when deleting by any filter', async () => {
    await createSession(sessionPayload(600))
    await createSession(sessionPayload(1200))

    const deleted = await deleteTreesByFilter('today')
    expect(deleted).toBe(8) // 2 sessions × 4 rows

    for (const filter of ['today', 'week', 'month', 'total']) {
      const res = await getTreesByFilter(filter)
      expect(res.stats.count).toBe(0)
    }
    expect((await getSessions()).total).toBe(0)
  })

  it('returns 0 when nothing matches', async () => {
    expect(await deleteTreesByFilter('total')).toBe(0)
  })
})

describe('todos mirror backend behavior', () => {
  it('appends with increasing sort_order', async () => {
    const a = await createTodo('a')
    const b = await createTodo('b')
    const c = await createTodo('c')
    expect([a.sort_order, b.sort_order, c.sort_order]).toEqual([0, 1, 2])
    expect((await getTodos()).map(t => t.content)).toEqual(['a', 'b', 'c'])
  })

  it('update + reorder + delete', async () => {
    const a = await createTodo('a')
    const b = await createTodo('b')

    await updateTodo(b.id, { completed: 1 })
    expect((await getTodos()).find(t => t.id === b.id)?.completed).toBe(1)

    await reorderTodos([{ id: b.id, sort_order: 0 }, { id: a.id, sort_order: 1 }])
    expect((await getTodos()).map(t => t.content)).toEqual(['b', 'a'])

    expect(await deleteTodo(a.id)).toBe(true)
    expect(await deleteTodo(a.id)).toBe(false)
    expect((await getTodos()).map(t => t.content)).toEqual(['b'])
  })
})

describe('settings mirror backend behavior', () => {
  it('returns defaults when empty', async () => {
    const s = await getSettings()
    expect(s.theme).toBe('light')
    expect(s.dev_mode).toBe('false') // string storage, like the backend
    expect(s.master_volume).toBe('80')
  })

  it('stores booleans as lowercase strings, matching the backend', async () => {
    await updateSettings({ dev_mode: true, theme: 'dark' })
    const s = await getSettings()
    expect(s.theme).toBe('dark')
    expect(s.dev_mode).toBe('true')
  })
})
