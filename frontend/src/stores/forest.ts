/** Forest view store. */

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { PlantedTree } from '../types/tree'
import type { TerrainType, WeatherType, TimeFilter, ForestStats } from '../types/forest'
import * as api from '../services/api'

const STORAGE_KEY = 'dlt_forest_prefs'

function loadForestPrefs(): { terrain?: TerrainType; weather?: WeatherType } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const useForestStore = defineStore('forest', () => {
  const saved = loadForestPrefs()

  const trees = ref<PlantedTree[]>([])
  const terrain = ref<TerrainType>(saved.terrain ?? 'plain')
  const weather = ref<WeatherType>(saved.weather ?? 'sunny')
  const timeFilter = ref<TimeFilter>('today')
  const stats = ref<ForestStats>({ count: 0, total_minutes: 0 })
  const loading = ref(false)
  const forceRefresh = ref(0)

  async function fetchTrees(retries = 3) {
    loading.value = true
    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const { data } = await api.getTrees(timeFilter.value)
          trees.value = data.trees
          stats.value = data.stats
          break
        } catch (err) {
          if (attempt < retries) {
            // Backend may still be starting (Electron spawn race)
            await new Promise(r => setTimeout(r, 1000))
            continue
          }
          console.error('Failed to fetch trees:', err)
        }
      }
    } finally {
      loading.value = false
    }
  }

  function setTimeFilter(filter: TimeFilter) {
    timeFilter.value = filter
    fetchTrees()
  }

  /** Force re-animation even when filter doesn't change (re-click) */
  function refreshAnimation() {
    forceRefresh.value++
  }

  function setTerrain(t: TerrainType) {
    terrain.value = t
  }

  function setWeather(w: WeatherType) {
    weather.value = w
  }

  // ── Persist terrain & weather ──

  function persistForestPrefs() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      terrain: terrain.value,
      weather: weather.value,
    }))
  }

  watch([terrain, weather], () => persistForestPrefs())

  return {
    trees, terrain, weather, timeFilter, stats, loading, forceRefresh,
    fetchTrees, setTimeFilter, setTerrain, setWeather, refreshAnimation,
  }
})
