/** Symmetry tests: localDb must mirror the FastAPI backend exactly.
 *
 * The growth thresholds and time-filter keys are duplicated in THREE places:
 *   backend/app/utils/growth.py            (Python)
 *   frontend/src/services/localDb.ts       (IndexedDB backend)
 *   frontend/src/utils/treeGrowth.ts       (UI helpers)
 * Any change to one side MUST be reflected here — these tests pin the
 * contract on both sides so drift fails loudly.
 */

import { describe, expect, it } from 'vitest'
import { getGrowthStage } from '../src/services/localDb'
import { getGrowthStage as treeGrowthStage, getGrowthLabel } from '../src/utils/treeGrowth'

describe('growth stage symmetry (localDb ↔ treeGrowth ↔ backend growth.py)', () => {
  // Threshold table mirrors backend/tests/test_growth.py — keep in sync
  const cases: Array<[number, number]> = [
    [0, 0],
    [14, 0],
    [15, 1],
    [29, 1],
    [30, 2],
    [59, 2],
    [60, 3],
    [120, 3],
  ]

  it.each(cases)('%s min → stage %s', (minutes, stage) => {
    expect(getGrowthStage(minutes)).toBe(stage)
    expect(treeGrowthStage(minutes)).toBe(stage)
  })

  it('handles float minutes like the backend (14.99 → sprout)', () => {
    expect(treeGrowthStage(14.99)).toBe(1)
    expect(treeGrowthStage(29.99)).toBe(2)
    expect(treeGrowthStage(59.99)).toBe(3)
  })

  it('labels match backend get_growth_label', () => {
    expect(getGrowthLabel(0)).toBe('种子')
    expect(getGrowthLabel(1)).toBe('萌芽')
    expect(getGrowthLabel(2)).toBe('树苗')
    expect(getGrowthLabel(3)).toBe('大树')
    expect(getGrowthLabel(99)).toBe('未知')
  })
})
