<template>
  <div
    ref="containerRef"
    class="iso-container"
    :class="{ 'is-bg': isBackground }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
    @wheel="onWheel"
  >
    <canvas ref="canvasRef" class="iso-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as PIXI from 'pixi.js'
import type { PlantedTree } from '../../types/tree'
import type { TerrainType, WeatherType } from '../../types/forest'
import { gridToScreen, depthSortKey } from '../../utils/isometric'
import { getRandomVariantPath } from '../../utils/assetPaths'
import { growthStageScale } from '../../types/tree'

const props = defineProps<{
  trees: PlantedTree[]
  terrain: TerrainType
  weather: WeatherType
  isBackground?: boolean
  forceRefresh?: number
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── PixiJS objects ──
let app: PIXI.Application | null = null
let gridGraphics: PIXI.Graphics | null = null
let treeContainer: PIXI.Container | null = null
let weatherGraphics: PIXI.Graphics | null = null
let glowBlurFilter: PIXI.BlurFilter | null = null
const treeSprites = new Map<number, PIXI.Sprite>()
const textureCache = new Map<string, PIXI.Texture>()

// ── Camera + Zoom (only grid, not weather) ──
let camX = 0, camY = 0
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3.0
const zoomLevel = ref(1.0)
let isPanning = false
let panStart = { x: 0, y: 0 }

// ── Geometry ──
const TILE_W = 80
const TILE_H = 40
const CUBE_BASE_H = 22

// ── Dynamic grid sizing (golden ratio: trees / tiles ≈ 0.618) ──

function getGridScale(rows: number, cols: number): number {
  const raw = Math.sqrt(rows * cols) / 7
  return Math.max(0.5, Math.min(2.0, raw))
}

function computeGridDimensions(
  treeCount: number,
  terrain: TerrainType,
  isBg: boolean
): { cols: number; rows: number } {
  const DENSITY = isBg ? 0.30 : 0.618
  const MIN_COLS = isBg ? 14 : 7
  const MIN_ROWS = isBg ? 8 : 5
  const MAX_ASPECT = isBg ? 2.5 : 2.0

  // Fraction of tiles that can actually hold a tree for each terrain.
  //   plain:    100% — every tile is plantable
  //   creek:    ~78% — water tiles occupy roughly 22% of the grid
  //   mountain: ~72% — rock + rock_edge cover ~28% of the grid
  // These are conservative averages; actual ratios vary per seed.
  const PLANTABLE_RATIO: Record<TerrainType, number> = {
    plain: 1.0,
    creek: 0.78,
    mountain: 0.72,
  }
  const plantableRatio = PLANTABLE_RATIO[terrain]

  // Target TOTAL tiles (not just usable) so that after subtracting
  // unplantable terrain features the golden-ratio density holds.
  let targetTotal = Math.max(
    MIN_COLS * MIN_ROWS,
    Math.ceil(treeCount / (DENSITY * plantableRatio))
  )
  let cols = Math.max(MIN_COLS, Math.ceil(Math.sqrt(targetTotal)))
  let rows = Math.max(MIN_ROWS, Math.ceil(targetTotal / cols))

  // Aspect ratio guards: prevent overly wide or tall grids
  if (rows * MAX_ASPECT < cols) rows = Math.max(MIN_ROWS, Math.ceil(cols / MAX_ASPECT))
  if (cols * 1.5 < rows) cols = Math.max(MIN_COLS, Math.ceil(rows / 1.5))

  return { cols, rows }
}

// ── Random terrain seed ──
const terrainSeed = ref(Math.random() * 1000)

// ═══════════════════════════════════════════
//  NOISE
// ═══════════════════════════════════════════

function hash33(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const n00 = hash33(ix, iy), n10 = hash33(ix + 1, iy)
  const n01 = hash33(ix, iy + 1), n11 = hash33(ix + 1, iy + 1)
  return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy
}

function fbm(x: number, y: number, octaves: number = 3): number {
  let value = 0, amp = 1, freq = 1, total = 0
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * freq, y * freq) * amp
    total += amp
    amp *= 0.5; freq *= 2.0
  }
  return value / total
}

// ═══════════════════════════════════════════
//  TILE KIND + HEIGHT
// ═══════════════════════════════════════════

type TileKind = 'plain' | 'water' | 'rock' | 'rock_edge'

const FACE_COLORS: Record<TileKind, { top: number; left: number; right: number }> = {
  plain:     { top: 0xc8dda0, left: 0xa8c080, right: 0x8aaa68 },
  water:     { top: 0x88c0e0, left: 0x6aa8cc, right: 0x5090b8 },
  rock:      { top: 0xc0b0a0, left: 0xa89888, right: 0x908070 },
  rock_edge: { top: 0xb8c898, left: 0xa0b880, right: 0x8ca070 },
}

// ═══════════════════════════════════════════
//  CREEK GENERATION v3 — rotated-coordinate meandering creeks
// ═══════════════════════════════════════════
//
//  Core problem with v2: every creek was a 1D function of gx,
//  which forced ALL creeks to flow horizontally left→right.
//  Combined with over-wide parameters this made every terrain
//  look the same.
//
//  v3 fixes this with three changes:
//    1. Each creek is rotated by a random angle (0–π) so creeks
//       flow horizontal, vertical, diagonal — any direction.
//    2. Width is scaled by the diagonal grid length and kept
//       deliberately narrow: 1–2 tile core at min grid, growing
//       slowly to 2–3 tiles on very large grids.
//    3. Edge-tapering is relaxed so creeks can meander freely
//       instead of being pinned to the centre.
//
//  How the rotation works:
//    rx = gx·cosθ – gy·sinθ   (along-creek axis)
//    ry = gx·sinθ + gy·cosθ   (cross-creek axis)
//    The creek centreline is ry as a function of rx (normalised
//    to [0,1]).  Tiles are water when their ry is close to the
//    centreline.  This is the same maths as v2 but with a change
//    of basis — the "creek flows along rx" instead of "along gx".

/** Number of creeks based on total grid tiles.
 *    <  30 tiles  →  1 creek
 *    30–80 tiles  →  2 creeks
 *    >  80 tiles  →  3 creeks  */
function maxCreeksForGridSize(totalTiles: number): number {
  if (totalTiles < 30) return 1
  if (totalTiles < 80) return 2
  return 3
}

/**
 * Pre-computed geometry for one creek — derived once from the seed
 * and grid dimensions, then re-used for every tile check.
 */
interface CreekGeom {
  /** Rotation angle (radians). 0 = horizontal, π/2 = vertical. */
  angle: number
  cosA: number
  sinA: number
  /** min/max of rx over the grid rectangle (along-creek axis). */
  minRx: number
  maxRx: number
  /** min/max of ry over the grid (cross-creek axis). */
  minRy: number
  maxRy: number
  /** Total length along the creek direction (maxRx – minRx). */
  rxLen: number
  /** Total length across the creek direction (maxRy – minRy). */
  ryLen: number
}

/** Build CreekGeom for one creek.  Computed once per render, cached
 *  by (seed, creekIdx, rows, cols). */
function buildCreekGeom(
  seed: number,
  creekIdx: number,
  rows: number,
  cols: number,
): CreekGeom {
  // Random angle: 0 = horizontal, PI/2 = vertical.
  // We bias slightly away from exactly-horizontal (±5°) so vertical
  // grid lines don't align with creek edges and create jaggies.
  const rawAngle = hash33(seed * 0.117 + creekIdx * 0.373, 0.541) * Math.PI
  const angle = rawAngle

  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)

  // Analytical rx min/max over the grid rectangle (no loop needed).
  const cMax = cosA > 0 ? cols - 1 : 0
  const cMin = cosA > 0 ? 0 : cols - 1
  const sForRx = sinA > 0 ? 0 : rows - 1   // which gy extreme minimises rx
  const maxRx = cMax * cosA - sForRx * sinA
  const sForRxMin = sinA > 0 ? rows - 1 : 0
  const minRx = cMin * cosA - sForRxMin * sinA

  // Analytical ry min/max.
  const sMax = cosA > 0 ? rows - 1 : 0
  const sMin = cosA > 0 ? 0 : rows - 1
  const cForRy = sinA > 0 ? cols - 1 : 0
  const maxRy = cForRy * sinA + sMax * cosA
  const cForRyMin = sinA > 0 ? 0 : cols - 1
  const minRy = cForRyMin * sinA + sMin * cosA

  return {
    angle, cosA, sinA,
    minRx, maxRx, minRy, maxRy,
    rxLen: Math.max(1, maxRx - minRx),
    ryLen: Math.max(1, maxRy - minRy),
  }
}

// Module-level cache for creek geometry (one per render, cleared
// when the terrain seed or grid dimensions change).
let creekGeomCache: CreekGeom[] | null = null
let creekGeomCacheKey = ''

function getCreekGeoms(seed: number, rows: number, cols: number): CreekGeom[] {
  const key = `${seed}|${rows}|${cols}`
  if (creekGeomCache && creekGeomCacheKey === key) return creekGeomCache

  const maxCreeks = maxCreeksForGridSize(rows * cols)
  creekGeomCache = []
  for (let ci = 0; ci < maxCreeks; ci++) {
    creekGeomCache.push(buildCreekGeom(seed, ci, rows, cols))
  }
  creekGeomCacheKey = key
  return creekGeomCache
}

/**
 * Creek centreline in cross-creek (ry) coordinates.
 *
 * `t` is the normalised along-creek position [0, 1] (rx mapped to 0…1).
 * Returns the ry value of the creek centreline at that point.
 */
function creekCenterRY(
  t: number,
  creekIdx: number,
  seed: number,
  geom: CreekGeom,
  maxCreeks: number,
): number {
  const cs = seed + creekIdx * 137.508

  // Spread creeks evenly across the cross-creek range
  const spacing = geom.ryLen / (maxCreeks + 1)
  const baseRY = geom.minRy + spacing * (creekIdx + 1)

  // Three frequency bands for multi-scale meandering.
  // Amplitudes are proportional to ryLen (cross-creek space) so
  // meanders stay proportional to the available space.
  const spreadFactor = 1 / Math.sqrt(maxCreeks)
  const amp1 = geom.ryLen * 0.12 * spreadFactor
  const amp2 = geom.ryLen * 0.06 * spreadFactor
  const amp3 = geom.ryLen * 0.025 * spreadFactor

  // FBM along the normalised creek axis (not gx!)
  const n1 = fbm(t * 1.8 + cs, cs * 0.27, 2) * 2 - 1  // → [-1, 1]
  const n2 = fbm(t * 3.5 + cs + 41, cs * 0.53, 3) * 2 - 1
  const n3 = fbm(t * 7.0 + cs + 97, cs * 0.71, 2) * 2 - 1

  // Gentle edge fade — less clamping than v2 for organic freedom
  const edgeFade = 1 - Math.abs(t - 0.5) * 0.55
  const edgeClamp = Math.max(0.12, edgeFade)

  let ry = baseRY + (n1 * amp1 + n2 * amp2 + n3 * amp3) * edgeClamp
  // Soft-clamp within the cross-creek range
  ry = Math.max(geom.minRy + 0.6, Math.min(geom.maxRy - 0.6, ry))

  return ry
}

/**
 * Creek half-width (in tile units) at normalised position `t`.
 *
 * Width is deliberately narrow: 1–2 tile core at minimum grid,
 * growing slowly with the diagonal grid length.
 */
function creekWidthAt(
  t: number,
  creekIdx: number,
  seed: number,
  geom: CreekGeom,
  maxCreeks: number,
): number {
  const cs = seed + creekIdx * 251.3

  // Slightly wider in the middle, narrower near edges
  const posFactor = 1 - Math.abs(t - 0.5) * 0.8

  // Noise-driven width variation (0…1)
  const wn = fbm(t * 2.5 + cs, cs * 0.38, 2) * 0.5 + 0.5

  // Width grows slowly with the diagonal of the grid.
  // At min grid (7×5 → diag ≈ 8.6): baseW ≈ 0.67 → core ≈ 1.3 tiles wide
  // At large grid (27×27 → diag ≈ 38): baseW ≈ 1.26 → core ≈ 2.5 tiles wide
  const diagLen = Math.sqrt(geom.rxLen * geom.rxLen + geom.ryLen * geom.ryLen)
  const baseW = 0.45 + diagLen * 0.020
  const extraW = 0.20 + diagLen * 0.015

  // Narrower when more creeks share the grid
  const widthFactor = 1 / Math.sqrt(maxCreeks)

  return (baseW + wn * extraW * posFactor) * widthFactor
}

/**
 * Island check — returns `true` when a tile inside a wide creek
 * section should be a dry "island" plain tile.
 * Only fires when creek half-width > 2.0 (wide sections on large grids).
 */
function isIslandTile(
  rx: number,
  ry: number,
  creekIdx: number,
  seed: number,
): boolean {
  const cs = seed + creekIdx * 79.3
  const n = fbm(rx * 0.09 + cs, ry * 0.09 + cs + 53, 2)
  return n < 0.18
}

let heightNoiseCache = new Map<string, number>()

function getHeightNoise(gx: number, gy: number): number {
  const key = `${gx},${gy}`
  if (!heightNoiseCache.has(key)) {
    const seed = terrainSeed.value + (props.terrain === 'mountain' ? 100 : props.terrain === 'creek' ? 200 : 0)
    heightNoiseCache.set(key, fbm(gx * 0.6 + seed, gy * 0.6 + seed, 3))
  }
  return heightNoiseCache.get(key)!
}

function getMountainPeaks(rows: number, cols: number): Array<{ gx: number; gy: number }> {
  const s = terrainSeed.value
  const peaks: Array<{ gx: number; gy: number }> = []
  for (let i = 0; i < 3; i++) {
    peaks.push({
      gx: 1 + ((s * (i + 1) * 137.5 + i * 79) % (cols - 2)),
      gy: 0.8 + ((s * (i + 2) * 251.3 + i * 113) % Math.max(1, rows - 1.5)),
    })
  }
  return peaks
}

function getTileKind(gx: number, gy: number, terrain: TerrainType, rows: number, cols: number): TileKind {
  if (terrain === 'plain') return 'plain'

  if (terrain === 'creek') {
    const s = terrainSeed.value

    // Pre-compute creek geometry once per render (cached by seed + grid size)
    const geoms = getCreekGeoms(s, rows, cols)
    const maxCreeks = geoms.length

    for (let ci = 0; ci < maxCreeks; ci++) {
      const geom = geoms[ci]
      const cs = s + ci * 137.508

      // Rotate tile coordinates into creek-space
      const rx = gx * geom.cosA - gy * geom.sinA
      const ry = gx * geom.sinA + gy * geom.cosA

      // Normalised along-creek position t ∈ [0, 1]
      const t = (rx - geom.minRx) / geom.rxLen

      // Creek centreline + width at this t
      const cy = creekCenterRY(t, ci, s, geom, maxCreeks)
      const cw = creekWidthAt(t, ci, s, geom, maxCreeks)
      const dist = Math.abs(ry - cy)

      // ── Island check: wide sections can sprout small dry patches ──
      if (cw > 2.0 && dist < cw * 0.58 && isIslandTile(rx, ry, ci, s))
        continue

      // ── Core channel (guaranteed water) ──
      if (dist < 0.70 * cw) return 'water'

      // ── Irregular banks via higher-frequency 2D noise ──
      // Bank noise uses original (gx,gy) coordinates for detail.
      if (dist < 0.95 * cw && fbm(gx * 2.1 + gy * 1.7 + cs, 0, 2) > 0.35) return 'water'
      if (dist < 1.25 * cw && fbm(gx * 3.0 + gy * 2.5 + cs + 47, 0, 2) > 0.62) return 'water'
      if (dist < 1.45 * cw && fbm(gx * 4.2 + gy * 3.1 + cs + 103, 0, 2) > 0.80) return 'water'
    }

    return 'plain'
  }

  if (terrain === 'mountain') {
    const scale = getGridScale(rows, cols)
    const peaks = getMountainPeaks(rows, cols)
    let minDist = Infinity
    for (const p of peaks) minDist = Math.min(minDist, Math.sqrt((gx - p.gx) ** 2 + (gy - p.gy) ** 2))
    const rng = ((gx * 47 + gy * 73 + terrainSeed.value * 31) % 100) / 100
    if (minDist < 1.3 * scale) return rng < 0.88 ? 'rock' : 'rock_edge'
    if (minDist < 2.2 * scale) return rng < 0.65 ? 'rock' : rng < 0.85 ? 'rock_edge' : 'plain'
    if (minDist < 3.2 * scale) return rng < 0.22 ? 'rock' : rng < 0.40 ? 'rock_edge' : 'plain'
    if (minDist < 4.5 * scale) return rng < 0.06 ? 'rock' : rng < 0.14 ? 'rock_edge' : 'plain'
    return rng < 0.02 ? 'rock_edge' : 'plain'
  }

  return 'plain'
}

function getCubeHeight(kind: TileKind, gx: number, gy: number): number {
  const noise = getHeightNoise(gx, gy)
  switch (kind) {
    case 'rock':      return CUBE_BASE_H * (1.3 + noise * 0.9)
    case 'rock_edge': return CUBE_BASE_H * (0.75 + noise * 0.45)
    case 'water':     return CUBE_BASE_H * (0.3 + noise * 0.1)
    default:          return CUBE_BASE_H * (0.55 + noise * 0.55)
  }
}

// ═══════════════════════════════════════════
//  TREE PLACEMENT
// ═══════════════════════════════════════════

interface TreePlacement { gx: number; gy: number; kind: TileKind }
const treePlacements = ref<Map<number, TreePlacement>>(new Map())

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function assignTreePositions(trees: PlantedTree[], tileKinds: TileKind[][], rows: number, cols: number): Map<number, TreePlacement> {
  const placements = new Map<number, TreePlacement>()
  const available: Array<{ gx: number; gy: number; kind: TileKind }> = []
  for (let gy = 0; gy < rows; gy++) {
    const row = tileKinds[gy]
    if (!row) continue
    for (let gx = 0; gx < cols; gx++)
      if ((row[gx] ?? 'plain') !== 'water' && (row[gx] ?? 'plain') !== 'rock')
        available.push({ gx, gy, kind: row[gx] ?? 'plain' })
  }
  shuffle(available)
  for (let i = 0; i < trees.length; i++) {
    if (i < available.length) {
      placements.set(trees[i].id, { ...available[i] })
    } else {
      // Fallback: find any non-water position using modulo over the grid
      let placed = false
      for (let attempt = 0; attempt < rows * cols; attempt++) {
        const gx = (i + attempt) % cols
        const gy = Math.floor((i + attempt) / cols) % rows
        const kind = tileKinds[gy]?.[gx] ?? 'plain'
        if (kind !== 'water' && kind !== 'rock') {
          placements.set(trees[i].id, { gx, gy, kind })
          placed = true
          break
        }
      }
      if (!placed) placements.set(trees[i].id, { gx: i % cols, gy: Math.floor(i / cols) % rows, kind: 'plain' })
    }
  }
  return placements
}

// ═══════════════════════════════════════════
//  TREE GROWTH ANIMATION
// ═══════════════════════════════════════════

const ANIM_DURATION = 700, ANIM_STAGGER = 55
const treeAnimProgress = ref<Map<number, number>>(new Map())
let animStartTime = 0, animTreeOrder: number[] = [], isAnimating = false

function startGrowthAnimation(treeIds: number[]): void {
  if (treeIds.length === 0 || !app) return
  app.ticker.remove(onAnimationTick)
  isAnimating = false
  treeAnimProgress.value = new Map(treeIds.map(id => [id, 0]))
  animStartTime = performance.now()
  animTreeOrder = [...treeIds]
  isAnimating = true
  app.ticker.add(onAnimationTick)
}

function onAnimationTick(): void {
  if (!isAnimating || !app) return
  const elapsed = performance.now() - animStartTime
  let allDone = true
  for (let i = 0; i < animTreeOrder.length; i++) {
    const treeId = animTreeOrder[i]
    const treeStart = i * ANIM_STAGGER
    const treeElapsed = elapsed - treeStart
    if (treeElapsed <= 0) { allDone = false; continue }
    if (treeElapsed >= ANIM_DURATION) { treeAnimProgress.value.set(treeId, 1) }
    else {
      const t = treeElapsed / ANIM_DURATION
      treeAnimProgress.value.set(treeId, 1 - Math.pow(1 - t, 3))
      allDone = false
    }
  }
  renderScene()
  if (allDone) { isAnimating = false; app.ticker.remove(onAnimationTick); renderScene() }
}

// ═══════════════════════════════════════════
//  WEATHER STATE (screen-space)
// ═══════════════════════════════════════════

interface Raindrop {
  x: number; y: number; speed: number; length: number; alpha: number
  /** Wind drift factor: horizontal speed = vertical speed * windFactor */
  windFactor: number
  /** Index into tileScreenDiamonds for the tile this drop is falling toward */
  targetIdx: number
  /** Screen Y of the target tile top — when drop.y reaches this, splash */
  targetY: number
  /** Screen X center of the target tile */
  targetX: number
}
interface Splash { x: number; y: number; radius: number; life: number; maxLife: number }
interface Sparkle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }
interface SplashParticle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }

let raindrops: Raindrop[] = []
let splashes: Splash[] = []
let splashParticles: SplashParticle[] = []
let sparkles: Sparkle[] = []
let lightningTimer = 0, lightningAlpha = 0
let cloudOffset = 0
let weatherTickerActive = false
// Pre-computed tile screen-space diamond bounds for rain-tile collision
let tileScreenDiamonds: Array<{ cx: number; cy: number; top: number; bot: number; left: number; right: number; hw: number; hh: number }> = []

function assignDropTarget(drop: Raindrop): void {
  if (!app || tileScreenDiamonds.length === 0) return
  const idx = Math.floor(Math.random() * tileScreenDiamonds.length)
  const td = tileScreenDiamonds[idx]
  drop.targetIdx = idx
  // Fixed target position (not jittered per frame — stable for this drop's flight)
  drop.targetX = td.cx + (Math.random() - 0.5) * td.hw * 0.85
  drop.targetY = td.top + (td.bot - td.top) * 0.5
  // Per-drop wind variation: ~14°–22° from vertical (tan ≈ 0.25–0.40)
  drop.windFactor = 0.25 + Math.random() * 0.15
  // Spawn far above and to the RIGHT so the diagonal flight is long and clearly visible
  // Trajectory: top-right → bottom-left
  drop.y = -(120 + Math.random() * 500)
  const fallDist = drop.targetY - drop.y
  const xOffset = fallDist * drop.windFactor + (Math.random() - 0.5) * 80
  drop.x = drop.targetX + xOffset
}

function initRaindrops(): void {
  if (!app) return
  // Build tile screen map once so we can assign targets
  buildTileScreenMap()
  const count = props.weather === 'thunderstorm' ? 170 : 77
  raindrops = []
  for (let i = 0; i < count; i++) {
    const drop: Raindrop = {
      x: 0, y: 0,
      speed: 8 + Math.random() * 12,
      length: 12 + Math.random() * 18,
      alpha: 0.18 + Math.random() * 0.32,
      windFactor: 0.3 + Math.random() * 0.4,
      targetIdx: -1,
      targetY: Infinity,
      targetX: 0,
    }
    assignDropTarget(drop)
    raindrops.push(drop)
  }
  splashes = []
  splashParticles = []
}

function initSparkles(): void {
  if (!app) return
  sparkles = []
  const w = app.screen.width, h = app.screen.height
  const sunX = w * 0.78, sunY = h * 0.12
  // Light beam direction: sun → bottom-left (camera direction)
  const bDx = -0.707, bDy = 0.707
  const bPerpX = 0.707, bPerpY = 0.707
  const beamLen = Math.sqrt(w * w + h * h) * 0.85

  // 40 dust motes distributed mostly inside the light beam for Tyndall effect
  for (let i = 0; i < 40; i++) {
    const t = Math.pow(Math.random(), 0.8)  // bias toward sun for denser core
    const baseX = sunX + bDx * beamLen * t
    const baseY = sunY + bDy * beamLen * t
    // Spread widens with distance (cone)
    const spread = 25 + t * 240
    const offset = (Math.random() - 0.5) * spread
    // Occasionally place some motes outside the beam for atmosphere
    const outside = Math.random() < 0.12
    const finalOffset = outside ? offset * 2.2 : offset
    sparkles.push({
      x: baseX + bPerpX * finalOffset,
      y: baseY + bPerpY * finalOffset,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 2.5 + 1.2,
      life: Math.random(),
      maxLife: 2.5 + Math.random() * 5,
      size: 0.6 + Math.random() * 3.2,
    })
  }
}

// ── Splash helpers ──

function spawnTileSplash(x: number, y: number): void {
  // Main elliptical ripple ring
  splashes.push({
    x, y,
    radius: 2 + Math.random() * 3,
    life: 0,
    maxLife: 0.22 + Math.random() * 0.18,
  })

  // Secondary smaller ripple
  splashes.push({
    x, y,
    radius: 1 + Math.random() * 1.5,
    life: 0.03 + Math.random() * 0.04,
    maxLife: 0.15 + Math.random() * 0.12,
  })

  // Spray droplets: mostly upward/outward with gravity
  const count = 4 + Math.floor(Math.random() * 5)
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3
    const speed = 35 + Math.random() * 75
    splashParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 0.25 + Math.random() * 0.35,
      size: 0.8 + Math.random() * 2.0,
    })
  }

  // Crown splash: higher, thinner droplets shooting nearly vertical
  const crownCount = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < crownCount; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6
    const speed = 90 + Math.random() * 60
    splashParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 0.18 + Math.random() * 0.15,
      size: 0.5 + Math.random() * 1.2,
    })
  }
}

function onWeatherTick(): void {
  if (!app || !weatherGraphics) return
  const dt = Math.min(app.ticker.deltaMS / 1000, 0.1)

  if (props.weather === 'rainy' || props.weather === 'thunderstorm') {
    // Rebuild tile screen map every tick so target positions stay correct
    // even while the user is panning/dragging the camera
    buildTileScreenMap()
    const h = app.screen.height

    // Update target Y for each drop (camera may have moved)
    // targetX stays stable — assigned once per flight, not jittered
    for (const drop of raindrops) {
      if (drop.targetIdx >= 0 && drop.targetIdx < tileScreenDiamonds.length) {
        const td = tileScreenDiamonds[drop.targetIdx]
        drop.targetY = td.top + (td.bot - td.top) * 0.5
      }
    }

    // Animate rain — diagonal fall from top-right to bottom-left
    for (const drop of raindrops) {
      drop.y += drop.speed * 60 * dt
      drop.x -= drop.speed * drop.windFactor * 60 * dt

      // Check if drop reached its target tile top
      if (drop.y >= drop.targetY) {
        spawnTileSplash(drop.targetX, drop.targetY)
        assignDropTarget(drop)
      }

      // Safety reset
      if (drop.x < -120) assignDropTarget(drop)
      if (drop.y > h + 200) assignDropTarget(drop)
    }
    // Animate splashes
    for (let i = splashes.length - 1; i >= 0; i--) {
      splashes[i].life += dt
      if (splashes[i].life >= splashes[i].maxLife) splashes.splice(i, 1)
    }
    // Animate splash particles (droplets spraying upward)
    for (let i = splashParticles.length - 1; i >= 0; i--) {
      const p = splashParticles[i]
      p.life += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 120 * dt // gravity
      if (p.life >= p.maxLife) splashParticles.splice(i, 1)
    }
    // Lightning — less frequent & dimmer in dark mode
    if (props.weather === 'thunderstorm') {
      lightningTimer -= dt
      if (lightningTimer <= 0) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
        lightningAlpha = isDark ? 0.12 + Math.random() * 0.18 : 0.25 + Math.random() * 0.4
        lightningTimer = isDark ? 3 + Math.random() * 7 : 1.5 + Math.random() * 5
      } else if (lightningAlpha > 0.001) {
        lightningAlpha *= Math.pow(0.015, dt)
      } else {
        lightningAlpha = 0
      }
    }
    drawWeatherOverlay()
    return
  }

  if (props.weather === 'cloudy') {
    cloudOffset += dt * 0.06 // slow rightward drift
    drawWeatherOverlay()
    return
  }

  if (props.weather === 'sunny') {
    const w = app.screen.width, h = app.screen.height
    for (const s of sparkles) {
      s.life += dt
      s.x += s.vx * dt * 30
      s.y += s.vy * dt * 30
      if (s.life > s.maxLife || s.x < -80 || s.x > w + 80 || s.y > h + 80) {
        s.life = 0
        const sunX = w * 0.78, sunY = h * 0.12
        const bDx = -0.707, bDy = 0.707
        const bPerpX = 0.707, bPerpY = 0.707
        const beamLen = Math.sqrt(w * w + h * h) * 0.85
        const t = Math.pow(Math.random(), 0.8)
        const spread = 25 + t * 240
        const outside = Math.random() < 0.12
        const offset = (Math.random() - 0.5) * spread * (outside ? 2.2 : 1)
        s.x = sunX + bDx * beamLen * t + bPerpX * offset
        s.y = sunY + bDy * beamLen * t + bPerpY * offset
        s.vx = (Math.random() - 0.5) * 4
        s.vy = (Math.random() - 0.5) * 2.5 + 1.2
        s.size = 0.6 + Math.random() * 3.2
      }
    }
    drawWeatherOverlay()
    return
  }
}

function startWeatherTicker(): void {
  if (!app || weatherTickerActive) return
  app.ticker.add(onWeatherTick)
  weatherTickerActive = true
}

function stopWeatherTicker(): void {
  if (app && weatherTickerActive) {
    app.ticker.remove(onWeatherTick)
    weatherTickerActive = false
  }
}

// ═══════════════════════════════════════════
//  DRAWING
// ═══════════════════════════════════════════

function adjustColor(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.floor(((color >> 16) & 0xff) * factor)))
  const g = Math.min(255, Math.max(0, Math.floor(((color >> 8) & 0xff) * factor)))
  const b = Math.min(255, Math.max(0, Math.floor((color & 0xff) * factor)))
  return (r << 16) | (g << 8) | b
}

function drawCube(gfx: PIXI.Graphics, gx: number, gy: number, kind: TileKind): void {
  const { x: cx, y: cy } = gridToScreen(gx, gy, { tileWidth: TILE_W, tileHeight: TILE_H, offsetX: 0, offsetY: 0 })
  const h = getCubeHeight(kind, gx, gy)
  const noise = getHeightNoise(gx, gy)
  const colors = FACE_COLORS[kind]
  const HW = TILE_W / 2, HH = TILE_H / 2
  const colorVar = 0.92 + noise * 0.16

  const tTop = { x: cx, y: cy - HH - h }, tRight = { x: cx + HW, y: cy - h }
  const tBottom = { x: cx, y: cy + HH - h }, tLeft = { x: cx - HW, y: cy - h }
  const bRight = { x: cx + HW, y: cy }
  const bBottom = { x: cx, y: cy + HH }, bLeft = { x: cx - HW, y: cy }

  gfx.beginFill(adjustColor(colors.top, colorVar))
  gfx.moveTo(tTop.x, tTop.y); gfx.lineTo(tRight.x, tRight.y)
  gfx.lineTo(tBottom.x, tBottom.y); gfx.lineTo(tLeft.x, tLeft.y); gfx.closePath()
  gfx.endFill()

  gfx.beginFill(adjustColor(colors.left, colorVar * 0.92))
  gfx.moveTo(tLeft.x, tLeft.y); gfx.lineTo(tBottom.x, tBottom.y)
  gfx.lineTo(bBottom.x, bBottom.y); gfx.lineTo(bLeft.x, bLeft.y); gfx.closePath()
  gfx.endFill()

  gfx.beginFill(adjustColor(colors.right, colorVar * 0.85))
  gfx.moveTo(tRight.x, tRight.y); gfx.lineTo(tBottom.x, tBottom.y)
  gfx.lineTo(bBottom.x, bBottom.y); gfx.lineTo(bRight.x, bRight.y); gfx.closePath()
  gfx.endFill()

  gfx.lineStyle(0.5, 0x000000, 0.05)
  gfx.moveTo(tTop.x, tTop.y); gfx.lineTo(tRight.x, tRight.y)
  gfx.lineTo(tBottom.x, tBottom.y); gfx.lineTo(tLeft.x, tLeft.y); gfx.closePath()
  gfx.moveTo(tTop.x, tTop.y); gfx.lineTo(bBottom.x, bBottom.y)
  gfx.moveTo(tLeft.x, tLeft.y); gfx.lineTo(bRight.x, bRight.y)
  gfx.lineStyle(0)
}

// ═══════════════════════════════════════════
//  TREE SPRITE RENDERING (real PNG textures)
// ═══════════════════════════════════════════

function getTexture(path: string): PIXI.Texture {
  let tex = textureCache.get(path)
  if (!tex) {
    tex = PIXI.Texture.from(path)
    textureCache.set(path, tex)
  }
  return tex
}

function syncTreeSprites(): void {
  if (!treeContainer) return

  const currentIds = new Set<number>()

  // Collect sprite entries with their depth for sorting
  interface SpriteEntry { id: number; sprite: PIXI.Sprite; depth: number; isNew: boolean }
  const entries: SpriteEntry[] = []

  for (const [id, placement] of treePlacements.value) {
    const tree = props.trees.find(t => t.id === id)
    if (!tree) continue
    currentIds.add(id)

    let sprite = treeSprites.get(id)
    const isNew = !sprite
    if (isNew) {
      // Determine variant path from a stable seed (tree id)
      const path = getRandomVariantPath(tree.species_id, id)
      sprite = new PIXI.Sprite(getTexture(path))
      sprite.anchor.set(0.5, 0.9)  // bottom-center anchor for ground placement
      treeContainer.addChild(sprite)
      treeSprites.set(id, sprite)
    }
    if (!sprite) continue

    // Position and scale
    const { x: cx, y: cy } = gridToScreen(placement.gx, placement.gy, { tileWidth: TILE_W, tileHeight: TILE_H, offsetX: 0, offsetY: 0 })
    const h = getCubeHeight(placement.kind, placement.gx, placement.gy)
    sprite.x = cx
    sprite.y = cy - h
    const baseScale = growthStageScale(tree.growth_stage as 0|1|2|3)
    const progress = treeAnimProgress.value.get(id) ?? 1
    sprite.scale.set(baseScale * progress)
    sprite.alpha = 0.15 + 0.85 * progress

    // Depth key: higher gx+gy = closer to viewer = render later (on top)
    const depth = depthSortKey(placement.gx, placement.gy)
    entries.push({ id, sprite, depth, isNew })
  }

  // Sort by depth — lower depth (farther) first in children array,
  // higher depth (closer) last → renders on top
  entries.sort((a, b) => a.depth - b.depth)
  for (let i = 0; i < entries.length; i++) {
    treeContainer.setChildIndex(entries[i].sprite, i)
  }

  // Remove sprites for trees that no longer exist
  for (const [id, sprite] of treeSprites) {
    if (!currentIds.has(id)) {
      treeContainer.removeChild(sprite)
      sprite.destroy()
      treeSprites.delete(id)
    }
  }
}

// ═══════════════════════════════════════════
//  WEATHER OVERLAY (screen-space)
// ═══════════════════════════════════════════

function drawWeatherOverlay(): void {
  if (!weatherGraphics || !app) return
  weatherGraphics.clear()
  const w = app.screen.width, h = app.screen.height

  // Blur only for sunny to smooth concentric glows into refined light
  if (glowBlurFilter) {
    weatherGraphics.filters = props.weather === 'sunny' ? [glowBlurFilter] : null
  }

  // ── Sunny ──
  if (props.weather === 'sunny') {
    const sunX = w * 0.78, sunY = h * 0.12
    const bDx = -0.707, bDy = 0.707
    const bPerpX = 0.707, bPerpY = 0.707
    const beamLen = Math.sqrt(w * w + h * h) * 0.95

    // Subtle warm ambient tint across the whole scene
    weatherGraphics.beginFill(0xffe8b0, 0.014)
    weatherGraphics.drawRect(0, 0, w, h)
    weatherGraphics.endFill()

    // Beam color at distance t: white-yellow → warm yellow → soft orange
    const beamColor = (t: number): number => {
      const r = 255
      const g = 247 - Math.floor(40 * t)
      const b = 215 - Math.floor(100 * t)
      return (r << 16) | (g << 8) | b
    }

    // ── Volumetric god rays: 3 overlapping light shafts, reduced geometry ──
    const shafts = [
      { angleOffset: -0.045, width: 1.0, alpha: 1.0 },
      { angleOffset: 0.04, width: 0.70, alpha: 0.75 },
      { angleOffset: 0.0, width: 0.35, alpha: 0.42 },
    ]

    for (const shaft of shafts) {
      const cosA = Math.cos(shaft.angleOffset)
      const sinA = Math.sin(shaft.angleOffset)
      const sDx = bDx * cosA - bDy * sinA
      const sDy = bDx * sinA + bDy * cosA
      const sPx = -sDy, sPy = sDx

      const numStrips = 90
      for (let i = 0; i < numStrips; i++) {
        const t = i / numStrips
        // Organic cloud-like variation inside the beam
        const noise = fbm(t * 8 + shaft.angleOffset * 14, 0, 2) * 0.5 + 0.5
        const baseAlpha = 0.060 * Math.pow(0.18, t) * shaft.alpha * (0.6 + noise * 0.55)
        if (baseAlpha < 0.0015) continue

        const halfW = (28 + t * 300) * shaft.width
        const cx = sunX + sDx * beamLen * t
        const cy = sunY + sDy * beamLen * t

        // Cross-section: 12 Gaussian layers, drawn as circles for softer edges
        const layers = 12
        for (let j = 0; j < layers; j++) {
          const jNorm = j / (layers - 1)
          const layerAlpha = baseAlpha * Math.exp(-5.5 * jNorm * jNorm)
          if (layerAlpha < 0.0008) continue
          const off = halfW * jNorm
          const px = cx + sPx * off
          const py = cy + sPy * off
          const r = halfW * (1 - jNorm) * 0.20 + 1.4
          weatherGraphics.beginFill(beamColor(t * (0.88 + 0.12 * noise)), layerAlpha)
          weatherGraphics.drawCircle(px, py, r)
          weatherGraphics.endFill()
        }
      }
    }

    // ── Sun glow: 16 smooth concentric rings with refined color transition ──
    for (let ring = 16; ring >= 0; ring--) {
      const r = 6 + ring * 10
      const ringT = ring / 16
      const alpha = 0.080 * Math.pow(0.50, ringT)
      const warmShift = Math.min(1, ringT * 1.5)
      const cr = 255
      const cg = 250 - Math.floor(35 * warmShift)
      const cb = 230 - Math.floor(90 * warmShift)
      weatherGraphics.beginFill((cr << 16) | (cg << 8) | cb, alpha)
      weatherGraphics.drawCircle(sunX, sunY, r)
      weatherGraphics.endFill()
    }
    // Core discs
    weatherGraphics.beginFill(0xfffef8, 0.22)
    weatherGraphics.drawCircle(sunX, sunY, 8)
    weatherGraphics.endFill()
    weatherGraphics.beginFill(0xffffff, 0.16)
    weatherGraphics.drawCircle(sunX, sunY, 4)
    weatherGraphics.endFill()

    // ── Soft lens flare chain along the beam ──
    const flareColor = 0xfff8d8
    const flares = [
      { t: 0.10, r: 3.5, a: 0.080 },
      { t: 0.20, r: 6.0, a: 0.056 },
      { t: 0.32, r: 4.5, a: 0.048 },
      { t: 0.45, r: 7.5, a: 0.040 },
      { t: 0.58, r: 3.0, a: 0.036 },
      { t: 0.72, r: 5.0, a: 0.028 },
    ]
    for (const f of flares) {
      const fx = sunX + bDx * beamLen * f.t
      const fy = sunY + bDy * beamLen * f.t
      weatherGraphics.beginFill(flareColor, f.a)
      weatherGraphics.drawCircle(fx, fy, f.r)
      weatherGraphics.endFill()
    }

    // ── Tyndall sparkles (dust motes caught in light) ──
    for (const s of sparkles) {
      const lifeRatio = s.life / s.maxLife
      const alpha = lifeRatio < 0.12 ? lifeRatio / 0.12 * 0.40
        : lifeRatio > 0.80 ? (1 - (lifeRatio - 0.80) / 0.20) * 0.40 : 0.40
      // Brighter when inside the beam cone
      const dx = s.x - sunX
      const dy = s.y - sunY
      const proj = dx * bDx + dy * bDy
      const perp = Math.abs(dx * bPerpX + dy * bPerpY)
      const beamHalfWAtProj = 35 + Math.max(0, proj / beamLen) * 260
      const inBeam = Math.max(0, 1 - perp / beamHalfWAtProj)
      const glowAlpha = alpha * (0.3 + inBeam * 0.9)

      weatherGraphics.beginFill(0xffe8a0, glowAlpha * 0.24)
      weatherGraphics.drawCircle(s.x, s.y, s.size * 3.2)
      weatherGraphics.endFill()
      weatherGraphics.beginFill(0xfff4d0, glowAlpha * 0.72)
      weatherGraphics.drawCircle(s.x, s.y, s.size * 0.65)
      weatherGraphics.endFill()
    }
    return
  }

  // ── Cloudy ──
  if (props.weather === 'cloudy') {
    // Cool ambient overcast tint
    weatherGraphics.beginFill(0xa8b0c0, 0.08)
    weatherGraphics.drawRect(0, 0, w, h)
    weatherGraphics.endFill()

    const clouds = [
      { x: 0.05, y: 0.06, scale: 0.9, speed: 0.018 },
      { x: 0.22, y: 0.10, scale: 1.1, speed: 0.022 },
      { x: 0.42, y: 0.04, scale: 1.35, speed: 0.028 },
      { x: 0.62, y: 0.09, scale: 0.95, speed: 0.020 },
      { x: 0.82, y: 0.05, scale: 1.2, speed: 0.025 },
      { x: 0.12, y: 0.22, scale: 0.85, speed: 0.016 },
      { x: 0.35, y: 0.18, scale: 1.05, speed: 0.024 },
      { x: 0.55, y: 0.24, scale: 0.75, speed: 0.015 },
      { x: 0.72, y: 0.20, scale: 0.9, speed: 0.019 },
      { x: 0.90, y: 0.28, scale: 0.65, speed: 0.014 },
      { x: 0.28, y: 0.34, scale: 0.7, speed: 0.013 },
      { x: 0.68, y: 0.32, scale: 0.55, speed: 0.011 },
    ]

    for (const cloud of clouds) {
      const cx = ((cloud.x + cloudOffset * cloud.speed) % 1.0) * w
      const cy = cloud.y * h
      const s = cloud.scale
      const baseRx = 90 * s
      const baseRy = 28 * s

      // Puffy cumulus bumps — each drawn as 3 concentric ellipses for soft edges
      const bumps = [
        { dx: -0.42, dy: -0.08, rx: 0.48, ry: 0.45, c: 0xc8ccd8, a: 0.18 },
        { dx: -0.20, dy: -0.38, rx: 0.62, ry: 0.58, c: 0xd6dae6, a: 0.24 },
        { dx: 0.05, dy: -0.48, rx: 0.70, ry: 0.62, c: 0xe0e4ee, a: 0.28 },
        { dx: 0.32, dy: -0.35, rx: 0.60, ry: 0.55, c: 0xd8dce8, a: 0.25 },
        { dx: 0.52, dy: -0.12, rx: 0.45, ry: 0.42, c: 0xc8ccd8, a: 0.18 },
        { dx: 0.00, dy: 0.08, rx: 0.85, ry: 0.52, c: 0xc4c8d6, a: 0.22 },
        { dx: -0.28, dy: 0.12, rx: 0.72, ry: 0.48, c: 0xbcc0ce, a: 0.19 },
        { dx: 0.30, dy: 0.15, rx: 0.68, ry: 0.46, c: 0xbcc0ce, a: 0.19 },
        { dx: -0.48, dy: 0.32, rx: 0.55, ry: 0.38, c: 0xb0b4c2, a: 0.15 },
        { dx: 0.45, dy: 0.35, rx: 0.52, ry: 0.36, c: 0xb0b4c2, a: 0.15 },
      ]

      for (const b of bumps) {
        const bx = cx + b.dx * baseRx
        const by = cy + b.dy * baseRy
        const brx = b.rx * baseRx
        const bry = b.ry * baseRy
        // Soft edge: 3 layers with decreasing alpha
        for (let layer = 2; layer >= 0; layer--) {
          const scale = 1 + layer * 0.12
          const la = b.a * Math.pow(0.45, layer)
          weatherGraphics.beginFill(b.c, la)
          weatherGraphics.drawEllipse(bx, by, brx * scale, bry * scale)
          weatherGraphics.endFill()
        }
        // Top highlight
        weatherGraphics.beginFill(0xedf0f6, b.a * 0.35)
        weatherGraphics.drawEllipse(bx - brx * 0.15, by - bry * 0.25, brx * 0.45, bry * 0.35)
        weatherGraphics.endFill()
      }
    }
    return
  }

  // ── Rainy / Thunderstorm ──
  if (props.weather === 'rainy' || props.weather === 'thunderstorm') {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const tintAlpha = props.weather === 'thunderstorm' ? 0.20 : 0.10
    const tintColor = props.weather === 'thunderstorm' ? 0x384058 : 0x5870a0

    weatherGraphics.beginFill(tintColor, tintAlpha)
    weatherGraphics.drawRect(0, 0, w, h)
    weatherGraphics.endFill()

    // Lightning flash + bolt
    if (lightningAlpha > 0.003) {
      const flashColor = isDark ? 0x9098a8 : 0xffe880
      const flashAlpha = isDark ? lightningAlpha * 0.55 : lightningAlpha * 0.85
      weatherGraphics.beginFill(flashColor, flashAlpha)
      weatherGraphics.drawRect(0, 0, w, h)
      weatherGraphics.endFill()

      // Bolt with volumetric glow
      if (lightningAlpha > 0.05) {
        const boltX = w * 0.20 + Math.random() * w * 0.60
        const boltColor = isDark ? 0xdde8ff : 0xfff8c0
        const glowColor = isDark ? 0x6a7aac : 0xffd060
        const boltAlpha = Math.min(1, lightningAlpha * 1.6)

        // Build bolt path once
        const points: { x: number; y: number }[] = []
        let by = 0
        let bx = boltX
        points.push({ x: bx, y: by })
        while (by < h) {
          by += 10 + Math.random() * 30
          bx += (Math.random() - 0.5) * 90
          points.push({ x: bx, y: Math.min(h, by) })
        }

        // Draw glow layers (wide, low alpha)
        for (let g = 3; g >= 1; g--) {
          weatherGraphics.lineStyle(10 + g * 10, glowColor, boltAlpha * 0.08 * g)
          weatherGraphics.moveTo(points[0].x, points[0].y)
          for (let i = 1; i < points.length; i++) weatherGraphics.lineTo(points[i].x, points[i].y)
        }
        // Draw main bolt
        weatherGraphics.lineStyle(4, boltColor, boltAlpha)
        weatherGraphics.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) weatherGraphics.lineTo(points[i].x, points[i].y)
        // Hot core
        weatherGraphics.lineStyle(1.5, 0xffffff, boltAlpha * 0.8)
        weatherGraphics.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) weatherGraphics.lineTo(points[i].x, points[i].y)
        weatherGraphics.lineStyle(0)

        // Multiple branches
        const branchCount = 1 + Math.floor(Math.random() * 3)
        for (let b = 0; b < branchCount; b++) {
          const startIdx = 2 + Math.floor(Math.random() * (points.length - 4))
          const start = points[startIdx]
          const len = 40 + Math.random() * 90
          const angle = Math.PI / 2 + (Math.random() - 0.5) * 1.8
          const endX = start.x + Math.cos(angle) * len
          const endY = start.y + Math.sin(angle) * len
          // Branch glow
          weatherGraphics.lineStyle(8, glowColor, boltAlpha * 0.12)
          weatherGraphics.moveTo(start.x, start.y)
          weatherGraphics.lineTo(endX, endY)
          // Branch core
          weatherGraphics.lineStyle(2, boltColor, boltAlpha * 0.65)
          weatherGraphics.moveTo(start.x, start.y)
          weatherGraphics.lineTo(endX, endY)
          // Tiny sub-branch
          if (Math.random() < 0.5) {
            const midX = (start.x + endX) * 0.5
            const midY = (start.y + endY) * 0.5
            const subLen = 20 + Math.random() * 35
            const subAngle = angle + (Math.random() - 0.5) * 1.2
            weatherGraphics.lineStyle(1.5, boltColor, boltAlpha * 0.4)
            weatherGraphics.moveTo(midX, midY)
            weatherGraphics.lineTo(midX + Math.cos(subAngle) * subLen, midY + Math.sin(subAngle) * subLen)
          }
        }
        weatherGraphics.lineStyle(0)
      }
    }

    // Rain streaks — diagonal from top-right to bottom-left, per-drop wind variation
    const rainColor = isDark ? 0xb8d4ff : 0x4488cc
    for (const drop of raindrops) {
      const wx = drop.targetX
      const wy = drop.y
      const windDrift = drop.length * drop.windFactor
      weatherGraphics.lineStyle(1.3, rainColor, drop.alpha)
      weatherGraphics.moveTo(wx, wy)
      weatherGraphics.lineTo(wx - windDrift, wy + drop.length)
      weatherGraphics.lineStyle(0)
    }

    // Splash elliptical ripples + spray droplets
    const splashStrokeColor = isDark ? 0xc8e0ff : 0x4488cc
    const splashFillColor = isDark ? 0xd8ecff : 0x5599dd
    const splashDotColor = isDark ? 0xe8f4ff : 0x66aaee
    const splashParticleColor = isDark ? 0xd0e8ff : 0x5599dd
    for (const s of splashes) {
      const progress = s.life / s.maxLife
      const alpha = (1 - progress) * 0.75
      const r = s.radius * (1 + progress * 3.0)
      // Perspective-flattened elliptical ripple (isometric ground plane)
      const rx = r * 1.35
      const ry = r * 0.55
      // Outer fading ring
      weatherGraphics.lineStyle(1.0, splashStrokeColor, alpha * 0.55)
      weatherGraphics.drawEllipse(s.x, s.y, rx, ry)
      weatherGraphics.lineStyle(0)
      // Middle brighter ring
      weatherGraphics.lineStyle(0.7, splashFillColor, alpha * 0.75)
      weatherGraphics.drawEllipse(s.x, s.y, rx * 0.55, ry * 0.55)
      weatherGraphics.lineStyle(0)
      // Bright center dot
      weatherGraphics.beginFill(splashDotColor, alpha * 0.85)
      weatherGraphics.drawEllipse(s.x, s.y, rx * 0.18, ry * 0.12)
      weatherGraphics.endFill()
    }
    // Splash particles (spray droplets with gravity)
    for (const p of splashParticles) {
      const progress = p.life / p.maxLife
      const alpha = (1 - progress) * 0.70
      // Soft glow + bright core for each droplet
      weatherGraphics.beginFill(splashParticleColor, alpha * 0.35)
      weatherGraphics.drawCircle(p.x, p.y, p.size * 1.6)
      weatherGraphics.endFill()
      weatherGraphics.beginFill(splashDotColor, alpha * 0.8)
      weatherGraphics.drawCircle(p.x, p.y, p.size * 0.55)
      weatherGraphics.endFill()
    }
    return
  }
}

// ═══════════════════════════════════════════
//  SCENE ASSEMBLY
// ═══════════════════════════════════════════

function renderScene(): void {
  if (!app || !gridGraphics) return
  gridGraphics.clear()

  const { cols, rows } = computeGridDimensions(props.trees.length, props.terrain, props.isBackground ?? false)
  const tileKinds: TileKind[][] = []
  for (let gy = 0; gy < rows; gy++) {
    tileKinds[gy] = []
    for (let gx = 0; gx < cols; gx++)
      tileKinds[gy][gx] = getTileKind(gx, gy, props.terrain, rows, cols)
  }

  interface Cell { gx: number; gy: number; kind: TileKind }
  const cells: Cell[] = []
  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++)
      cells.push({ gx, gy, kind: tileKinds[gy][gx] })
  cells.sort((a, b) => depthSortKey(a.gx, a.gy) - depthSortKey(b.gx, b.gy))

  // Draw cubes only — trees are rendered as sprites on treeContainer
  for (const cell of cells)
    drawCube(gridGraphics, cell.gx, cell.gy, cell.kind)

  // Sync tree sprites (position + scale from animation progress)
  syncTreeSprites()

  drawWeatherOverlay()
  buildTileScreenMap()
}

// ═══════════════════════════════════════════
//  TILE SCREEN MAP (for rain-tile collision)
// ═══════════════════════════════════════════

function buildTileScreenMap(): void {
  if (!app) return
  const { cols, rows } = computeGridDimensions(props.trees.length, props.terrain, props.isBackground ?? false)
  const z = zoomLevel.value
  tileScreenDiamonds = []
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const kind = getTileKind(gx, gy, props.terrain, rows, cols)
      const { x: ix, y: iy } = gridToScreen(gx, gy, { tileWidth: TILE_W, tileHeight: TILE_H, offsetX: 0, offsetY: 0 })
      const h = getCubeHeight(kind, gx, gy)
      const cx = ix * z + camX
      const cy = iy * z + camY
      const hw = TILE_W / 2 * z
      const hh = TILE_H / 2 * z
      const topY = cy - hh - h * z
      const botY = cy + hh - h * z
      tileScreenDiamonds.push({ cx, cy, top: topY, bot: botY, left: cx - hw, right: cx + hw, hw, hh })
    }
  }
}

// ═══════════════════════════════════════════
//  CAMERA + ZOOM (grid only)
// ═══════════════════════════════════════════

function centerCamera(): void {
  if (!app) return
  const { cols, rows } = computeGridDimensions(props.trees.length, props.terrain, props.isBackground ?? false)
  const center = gridToScreen(cols / 2 - 0.5, rows / 2 - 0.5, { tileWidth: TILE_W, tileHeight: TILE_H, offsetX: 0, offsetY: 0 })
  camX = app.screen.width / 2 - center.x * zoomLevel.value
  camY = app.screen.height * 0.38 - center.y * zoomLevel.value
}

function applyCamera(): void {
  if (!gridGraphics || !treeContainer) return
  gridGraphics.x = camX
  gridGraphics.y = camY
  gridGraphics.scale.set(zoomLevel.value)
  treeContainer.x = camX
  treeContainer.y = camY
  treeContainer.scale.set(zoomLevel.value)
}

// ── Panning ──
function onPointerDown(e: PointerEvent) {
  if (props.isBackground) return
  if (!(e.target as HTMLElement)?.closest?.('canvas')) return
  isPanning = true
  panStart = { x: e.clientX - camX, y: e.clientY - camY }
}
function onPointerMove(e: PointerEvent) {
  if (!isPanning) return
  camX = e.clientX - panStart.x
  camY = e.clientY - panStart.y
  applyCamera()
}
function onPointerUp() { isPanning = false }

// ── Zoom (wheel) ──
function onWheel(e: WheelEvent) {
  if (!app || !gridGraphics || props.isBackground) return
  e.preventDefault()

  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return

  // Mouse position relative to canvas
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  // World position under mouse before zoom
  const wx = (mx - camX) / zoomLevel.value
  const wy = (my - camY) / zoomLevel.value

  // Apply zoom delta
  const factor = e.deltaY > 0 ? 0.92 : 1.08
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel.value * factor))
  zoomLevel.value = newZoom

  // Adjust camera to keep world point under mouse
  camX = mx - wx * newZoom
  camY = my - wy * newZoom
  applyCamera()
}

// ═══════════════════════════════════════════
//  FULL RENDER + LIFECYCLE
// ═══════════════════════════════════════════

function fullRender(forceAnimate = false): void {
  if (!app) return
  const { cols, rows } = computeGridDimensions(props.trees.length, props.terrain, props.isBackground ?? false)

  const tileKinds: TileKind[][] = []
  for (let gy = 0; gy < rows; gy++) {
    tileKinds[gy] = []
    for (let gx = 0; gx < cols; gx++)
      tileKinds[gy][gx] = getTileKind(gx, gy, props.terrain, rows, cols)
  }

  const existingIds = new Set(treePlacements.value.keys())
  const currentIds = new Set(props.trees.map(t => t.id))
  const hasNewTrees = props.trees.some(t => !existingIds.has(t.id))
  const hasRemovedTrees = [...existingIds].some(id => !currentIds.has(id))

  if (hasNewTrees || hasRemovedTrees || treePlacements.value.size === 0 || forceAnimate)
    treePlacements.value = assignTreePositions(props.trees, tileKinds, rows, cols)

  if (forceAnimate) { startGrowthAnimation(props.trees.map(t => t.id)); return }

  const treesToAnimate = props.trees.filter(t => (treeAnimProgress.value.get(t.id) ?? 1) < 1)

  if (treesToAnimate.length === 0 && props.trees.length > 0 && !isAnimating) {
    if (!props.trees.some(t => treeAnimProgress.value.has(t.id))) {
      startGrowthAnimation(props.trees.map(t => t.id)); return
    }
  }

  if (treesToAnimate.length > 0 && !isAnimating) {
    startGrowthAnimation(treesToAnimate.map(t => t.id)); return
  }

  renderScene()
  applyCamera()

  if (props.weather === 'rainy' || props.weather === 'thunderstorm' || props.weather === 'cloudy' || props.weather === 'sunny')
    startWeatherTicker()
  else
    stopWeatherTicker()
}

onMounted(() => {
  if (!canvasRef.value || !containerRef.value) return
  terrainSeed.value = Math.random() * 1000

  const w = containerRef.value.clientWidth || 700
  const h = Math.max(480, containerRef.value.clientHeight || 480)

  app = new PIXI.Application({
    view: canvasRef.value, width: w, height: h,
    backgroundColor: 0x000000, backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1, autoDensity: true,
  })

  gridGraphics = new PIXI.Graphics()
  treeContainer = new PIXI.Container()
  weatherGraphics = new PIXI.Graphics()
  glowBlurFilter = new PIXI.BlurFilter(6)
  glowBlurFilter.quality = 3
  app.stage.addChild(gridGraphics)
  app.stage.addChild(treeContainer)
  app.stage.addChild(weatherGraphics)

  if (props.weather === 'rainy' || props.weather === 'thunderstorm') {
    initRaindrops()
    if (props.weather === 'thunderstorm') lightningTimer = 1 + Math.random() * 3
  }
  if (props.weather === 'sunny') initSparkles()

  heightNoiseCache.clear()
  centerCamera()
  fullRender()

  const onResize = () => {
    if (!app || !containerRef.value) return
    const nw = containerRef.value.clientWidth || 700
    const nh = Math.max(480, containerRef.value.clientHeight || 480)
    app.renderer.resize(nw, nh)
    if (props.weather === 'rainy' || props.weather === 'thunderstorm') initRaindrops()
    if (props.weather === 'sunny') initSparkles()
    centerCamera()
    renderScene()
    applyCamera()
  }
  window.addEventListener('resize', onResize)

  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    stopWeatherTicker()
    if (app) app.ticker.remove(onAnimationTick)
    for (const [, sprite] of treeSprites) sprite.destroy()
    treeSprites.clear()
    textureCache.clear()
    app?.destroy(true, { children: true })
    app = null; gridGraphics = null; treeContainer = null; weatherGraphics = null
    glowBlurFilter?.destroy(); glowBlurFilter = null
    heightNoiseCache.clear()
  })
})

// ── Watchers ──

watch(() => props.forceRefresh, () => {
  if (!app) return
  heightNoiseCache.clear()
  treeAnimProgress.value = new Map()
  centerCamera()
  fullRender(true)
})

let prevWeather: WeatherType | null = null
let prevTerrain: TerrainType | null = props.terrain
watch(() => [props.trees, props.terrain, props.weather], () => {
  if (!app) return
  const weatherChanged = props.weather !== prevWeather
  prevWeather = props.weather
  const terrainChanged = props.terrain !== prevTerrain
  prevTerrain = props.terrain

  // Only restart weather effects when weather actually changed
  if (weatherChanged) {
    stopWeatherTicker()
    if (props.weather === 'rainy' || props.weather === 'thunderstorm') {
      initRaindrops()
      lightningTimer = props.weather === 'thunderstorm' ? 1 + Math.random() * 3 : 0
      lightningAlpha = 0
    }
    if (props.weather === 'sunny') initSparkles()
  }
  heightNoiseCache.clear()

  const { cols, rows } = computeGridDimensions(props.trees.length, props.terrain, props.isBackground ?? false)
  const tileKinds: TileKind[][] = []
  for (let gy = 0; gy < rows; gy++) {
    tileKinds[gy] = []
    for (let gx = 0; gx < cols; gx++)
      tileKinds[gy][gx] = getTileKind(gx, gy, props.terrain, rows, cols)
  }
  const idsChanged =
    props.trees.length !== treePlacements.value.size ||
    props.trees.some(t => !treePlacements.value.has(t.id))

  // Keep positions stable when only weather/object identity (fetchTrees) changes
  if (idsChanged || terrainChanged || treePlacements.value.size === 0)
    treePlacements.value = assignTreePositions(props.trees, tileKinds, rows, cols)

  centerCamera()
  fullRender()
}, { deep: true })
</script>

<style scoped>
.iso-container {
  width: 100%;
  min-height: 480px;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(180deg, #d4dce8 0%, #c8d4e0 40%, #bcc8d4 100%);
  cursor: grab;
  touch-action: none;
}
[data-theme="dark"] .iso-container {
  background: linear-gradient(180deg, #1e2428 0%, #1a2018 40%, #161c14 100%);
}
.iso-container.is-bg {
  border-radius: 0;
  min-height: 100%;
  background: transparent;
  cursor: default;
}
.iso-container:not(.is-bg):active { cursor: grabbing; }
.iso-canvas { width: 100%; height: 100%; display: block; }
</style>
