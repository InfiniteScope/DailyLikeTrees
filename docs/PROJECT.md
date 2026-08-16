# PROJECT.md — DailyLikeTrees 项目总纲

> **本文档是该项目开发的最高规则文件 一定程度上可作为HANDOVER文档阅读。**
> 任何 AI 助手 / 开发者在本仓库动手前必须完整阅读本文档。
> 与 CLAUDE.md / README.md 冲突时，**以本文档为准**，并将冲突修正回各文档。
> 修改代码时不得违反第 4 章的「红线规则」；遇到第 8 章的「已知问题」时先对照，不得擅自重构。

---

## 0. 项目演进历史（必读背景）

- **v0.1.0 之前**：Web MVP（DeepSeek v4pro 起步）→ MIMO-v2.5 改良视觉 → kimi k2.7code 优化天气效果
- **核心迭代**：37 种 PNG 树精灵替换 SVG → 包豪斯风格 UI → 溪流/山地地形算法重写 → 开发者工具 → 环境音分层绑定 → 用户设置记忆
- **桌面端**：最初 Tauri（WebView2 不稳定、白屏、窗口控制 bug 反复）→ **改用 Electron 33 为主力**，Tauri 保留为备选壳
- **移动端**：Capacitor 8 + PWA（`VITE_LOCAL_BACKEND=true` 走 IndexedDB，无本地后端）
- **现状**：多平台 MVP 可用。Electron 0.2.0 是当前最完整的产品形态；Android 适配未完成（竖屏、布局差距大等遗留问题）

**教训沉淀**：历史上多次"越改越坏"（如 Tauri 窗口控制、横竖屏 UI 混乱）。根源都是**未经充分阅读就重构关键路径**。重装铁律：先理解、再小步改、每步验证。

---

## 1. 项目定位

**DailyLikeTrees（如树日常）**：Forest 专注森林的开源替代品 —— 设专注计时 → 完成 → 在等距森林种一棵树。数据全部本地（无账号、无云同步），强调视觉精致（包豪斯 + 自然动效）与多端一致性。

## 2. 平台矩阵与运行时检测

| 优先级 | 运行时 | 检测标志 | `usePlatform()` 结果 |
|---|---|---|---|
| 1 | **Electron**（主力桌面） | `window.electronAPI` | `pc` |
| 2 | **Tauri v2**（备选桌面） | `window.__TAURI_INTERNALS__` | `pc`（UA 含 tauri-mobile 才 mobile） |
| 3 | **Capacitor**（Android） | `window.Capacitor` | `mobile` |
| 4 | 浏览器 | UA + 触屏启发式 | `pc` / `mobile` |

- 检测在**模块加载期一次性锁定**（`usePlatform.ts` + `router/index.ts`），运行期不切换
- 路由为 hash 模式（PWA/file:// 兼容），`/` 与 `/forest` 按平台分 PC/Mobile 两套视图，`/floating` 共享
- **平台特有的 UI 规则**：窗口控制按钮（最小化/最大化/关闭）仅 Electron/Tauri 渲染（CustomTitleBar）；悬浮球在桌面是独立原生窗口、浏览器是 Teleport 内联球

## 3. 仓库结构总览

```
DailyLikeTrees/
├── frontend/                      # Vue 3 + Vite 8 前端（唯一 UI 代码源，所有端共用）
│   ├── public/assets/
│   │   ├── trees/species/tree1..tree37/variant_0.png   # 37 种树精灵（PNG，各 1 个变体）
│   │   ├── audio/ambiance/        # plain/creek/mountain/sunny/cloudy/rainny_day/thunder_rain.mp3
│   │   ├── audio/music/calm-1/2/3.mp3
│   │   ├── logo.png / favicon.png / manifest.json / sw.js / icons.svg
│   │   ├── terrain/  weather/     # （遗留占位图，实际渲染不依赖它们）
│   ├── src/
│   │   ├── components/
│   │   │   ├── forest/    IsometricGrid.vue（核心渲染器 1552 行）/ BackgroundForest.vue
│   │   │   ├── timer/     CircularTimer / TimerDisplay / TimerModeSelector / TreePreview / TreeSpeciesPicker
│   │   │   ├── board/     TodoBoard / TodoItem / TodoAddForm
│   │   │   ├── audio/     AudioControlPanel
│   │   │   ├── settings/  SettingsPanel / DevToolsPanel / DevTestButton（死代码）
│   │   │   ├── layout/    AppShell / AppHeader / CustomTitleBar / WeatherStatus / FloatingBall
│   │   │   ├── icons/     IconSvg（手写 SVG 图标库）
│   │   │   └── mobile/layout/AppShellMobile.vue
│   │   ├── views/         HomeView / ForestViewPage / FloatingBallView / mobile/{HomeView,ForestViewPage}.vue
│   │   ├── stores/        timer / todos / forest / audio / settings（Pinia 5 模块）
│   │   ├── composables/   useAudioEngine / useAmbianceController / usePlatform / useWeatherInfo
│   │   ├── services/      api.ts（双后端路由）/ localDb.ts（IndexedDB 后端）
│   │   ├── utils/         isometric / treeGrowth / assetPaths / constants
│   │   ├── types/         timer / todo / tree / forest / settings
│   │   └── router/  main.ts  App.vue  styles/
│   ├── src-tauri/         # Tauri 备选壳（desktop.rs 与 Electron main.js 同构；mobile.rs 空壳）
│   ├── android/           # Capacitor Android 工程（appId: com.dailyliketrees.app）
│   ├── vite.config.ts     # 只有 vue 插件 + base:'./'（红线）
│   └── .env.pwa           # VITE_LOCAL_BACKEND=true
├── backend/               # FastAPI + SQLite（PyInstaller 打包为 backend.exe）
│   ├── app/models/        # FocusSession / PlantedTree / Todo / UserSetting
│   ├── app/schemas/       # Pydantic 模型
│   ├── app/routers/       # sessions / trees / todos / settings
│   ├── app/services/      # session_service（种树事务）/ tree_service / todo_service / settings_service
│   ├── app/utils/growth.py
│   └── run.py             # PyInstaller GUI 入口（stdout 重定向 backend.log）
├── electron-app/          # Electron 主力桌面壳（main.js / preload.js）
├── CLAUDE.md              # 精简版指引（保留）
├── README.md              # 对外文档（保留）
└── 提示词暂存*.md / 主创意文档.md  # 需求演进存档（gitignore）
```

**关键索引**（改到对应功能先读这些文件）：
- 计时器：`stores/timer.ts` → `components/timer/CircularTimer.vue`
- 森林渲染：`components/forest/IsometricGrid.vue`（最大最复杂文件）
- 种树/树查询：`backend/app/services/session_service.py` + `routers/trees.py` + `frontend/src/services/localDb.ts`
- 音频：`composables/useAudioEngine.ts` + `useAmbianceController.ts` + `stores/audio.ts` + `AudioControlPanel.vue`
- 悬浮球：`components/layout/FloatingBall.vue` + `views/FloatingBallView.vue` + `electron-app/main.js`
- 桌面壳：`electron-app/main.js`（与 `frontend/src-tauri/src/desktop.rs` 保持同构）

---

## 4. 最高架构契约（红线规则 —— 不可违反）

1. **PixiJS 必须用 v7 API**（`pixi.js ^7.4.3`）。严禁 v8 写法：`new PIXI.Application({view})` 同步构造；`beginFill/endFill/lineStyle/drawCircle`；**不要** `await app.init()` / `g.fill()` / `g.stroke()`。v8 代码会静默失败或抛错。

2. **`vite.config.ts` 的 `base: './'` 是强制项**。Electron `file://` 协议下绝对路径 `/assets/...` 会解析到文件系统根目录。所有 JS 侧资源路径必须经 `utils/assetPaths.ts`（基于 `import.meta.env.BASE_URL`），禁止硬编码绝对路径。注意 `index.html` 里 `/favicon.png`、`/manifest.json`、`/sw.js` 是绝对路径，是已知隐患（见 8.x）。

3. **`#app` 元素禁止加 `display:flex` / `align-items:center`**——会压垮整个布局为移动比例（历史事故）。居中由 `.main-content` 负责。

4. **禁止全局 `button:active { transform: scale() }`**——与组件级按压动效冲突（历史事故）。各组件自己管理按压微交互。

5. **相机变换与天气分离**：`gridGraphics` / `treeContainer` 挂相机变换（x/y/scale）；`weatherGraphics` 必须保持在屏幕坐标 (0,0)、不受相机影响，覆盖全视口。雨滴落点是"目标制"（指向地块菱形），相机平移后必须重建落点映射。

6. **双后端编译期切换**：`VITE_LOCAL_BACKEND === 'true'`（仅 `.env.pwa`）→ 全部 API 走 `localDb.ts`（IndexedDB）；否则 axios → `http://127.0.0.1:8000`。**不要**在运行期动态切换；两个后端的响应形状必须保持对称（`{data}` 包装），Pinia store 不感知差异。

7. **生长阶段阈值有 3 份实现，必须同步修改**：`backend/app/utils/growth.py`、`frontend/src/services/localDb.ts`（本地复制）、`frontend/src/utils/treeGrowth.ts`。阈值：0-14min→seed(0)、15-29→sprout(1)、30-59→sapling(2)、60+→mature(3)。树精灵缩放 `growthStageScale = [0.35, 0.50, 0.65, 0.80]`（`types/tree.ts`）。

8. **一次专注 = 1 行 FocusSession + 4 行 PlantedTree**（today/week/month/total 四个 `time_filter_key`）。删除必须级联删 4 行 + 父 session（`tree_service.delete_trees_by_filter` 与 `localDb.deleteTreesByFilter` 已对称实现）。`time_filter_key` 格式：`2026-08-16`（日）、`2026-W33`（ISO 周）、`2026-08`（月）、`total`。

9. **前端 API 必须传命名 filter**（`today|week|month|total`），由后端 `routers/trees.py` 的 `_compute_filter_key()` 转成 DB key。严禁前端传原始日期。

10. **前端渲染时随机化树木位置**：后端存的 `grid_x/grid_y` 被前端忽略，改为 Fisher-Yates 洗牌 + 顺序分配；只有非水/非岩地块可种。位置在 terrain 变化或 forceRefresh 时重排。

11. **音频引擎是模块级单例**（`useAudioEngine.ts` 模块顶层持有 ctx/activeLayers），`init()` 必须由用户手势触发（浏览器自动播放策略）；`useAmbianceController` **只能挂在 App.vue**（永不卸载的组件），不能在各 view 挂 watcher（历史 bug：路由切换导致开关失效）。播放用 generation 计数器防异步竞态。

12. **计时完成 <30 秒静默丢弃**（`stores/timer.ts` 的 `complete()` 直接 return，不调 API）。UI 层面：free 模式 paused 且 ≥30s 才显示「结束」，否则「放弃」。这是刻意设计，勿改。

13. **Electron 环境变量**：`ELECTRON_RUN_AS_NODE=1` 会让 Electron 变纯 Node。`npm start` 脚本必须 `set ELECTRON_RUN_AS_NODE=` 清除后再启动。

14. **electron-builder 的 `files` 只认本地 `dist/**/*`**：构建流程 = 构建前端 → `copy:dist`（fs.cpSync 复制 `../frontend/dist` 到本地 `dist/`）→ electron-builder。跨目录 glob（`"../frontend/dist/**/*"`）不生效。**backend.exe 由 `frontend/src-tauri/binaries/` 产出，Electron 的 extraResources 直接复用**（跨壳耦合，勿拆）。

15. **CSS 主题走 `[data-theme]` 自定义属性**，组件一律用 `var(--color-*)`，禁止硬编码颜色。天气/雨滴等效果颜色需随主题自适应（浅色雨滴蓝、闪电黄；深色闪电减频减亮）。

16. **平台感知组件（CustomTitleBar / FloatingBall）必须检查运行时再渲染桌面特性**——浏览器不能出现最小化/最大化按钮（历史 bug）。

---

## 5. 核心业务逻辑

### 5.1 计时器（`stores/timer.ts` + `CircularTimer.vue`）

- 状态机：`idle → running → paused → completed`；三模式：countdown / countup / free
- countdown/countup 到达 target 自动 `complete()`；**paused 时没有「结束」按钮**（设计如此）；free 模式 running 时也不能直接结束（需先暂停）
- 拖拽：SVG `createSVGPoint()` + `getScreenCTM().inverse()` 精确映射；仅当距圆心 85–145px 才启用（中心留给 TreePreview）；`setPointerCapture` 保证跟手；吸附档位 `[15,25,30,45,60,90,120]` 分钟（±2min）
- `complete()`：清 interval → status=completed → `<30s` 丢弃 → `POST /api/sessions` → `fetchTrees()`（fire-and-forget，**网络失败无重试无队列**，见 8.x）
- free 模式进度条按 `elapsed % 3600` 循环
- 庆祝 toast：completed 且 ≥30s 时显示（注意：`getGrowthStage` 的 import 历史缺失过，运行时 ReferenceError 会静默断流 —— 重装时警惕）

### 5.2 种树事务（`backend/app/services/session_service.py`）

1. insert FocusSession → `db.flush()` 拿 id
2. `actual_seconds / 60` → `get_growth_stage`（阈值见红线 7）
3. `_assign_grid_position()`：查 today key 下最大 `grid_y`，行内计数，**每行 8 列**，行满换行（顺序分配，但前端忽略）
4. insert 4 行 PlantedTree（同 grid 位置、四个 filter key）
5. commit → refresh → 返回 `{session, tree}`

**已知缺陷**：查询→计算→插入非原子，并发两会话可能同格；`status='abandoned'` 字段从未被写入过；API 层不校验 `actual_seconds` 合法性。

### 5.3 森林渲染（`components/forest/IsometricGrid.vue`）

- **网格密度**：`树木数:地块数 = 0.618`（背景模式 0.30）；`computeGridDimensions(treeCount, terrain, isBg)` 反推格数 + 纵横比护栏；`getGridScale = sqrt(rows*cols)/7` 夹 [0.5, 2.0]
- **噪声**：手写 `hash33` + 双线性插值 + `fbm`（3 倍频），**无第三方噪声库**。地形种子 `Math.random()*1000` 每次 mount 重生成（每次进森林地形都不同，刻意设计）
- **地形**：
  - plain：全地块可种
  - creek：旋转坐标系（随机 θ）+ 三频 FBM 曲流中心线 + 多级宽度判定（不规则河岸）+ 宽河段（cw>2.0）可生成小岛；溪流数随网格变大增多（<30 格 1 条 / 30-80 格 2 条 / >80 格 3 条）；水占 ~22%（可种比例 0.78）
  - mountain：3 个峰，按距峰距离分层概率分配 rock/rock_edge/plain（<1.3×scale 88% 岩…远端 2%）；岩石 ~28%（可种 0.72）；**rock 不可种，rock_edge 可种**
  - 高度：`getCubeHeight`（含地形偏移种子），立方体三面色（顶亮/左中/右暗）+ 细黑描边
- **树木精灵**：anchor(0.5, 0.9) 贴地块顶面（y 减地块高）；`getRandomVariantPath(species_id, id)` 用树 id 作种子保证变体稳定；缩放 = 阶段缩放 × 动画进度；透明度 0.15→1.0
- **深度排序**：`depthSortKey(gx,gy) = gx+gy`，大者后渲染（在前）
- **生长动画**：700ms ease-out-cubic + 55ms stagger；`forceRefresh` prop 递增 → 全量重播动画（解决"再次点击当前 filter 无动画"的历史 bug）；新树只动画新增
- **相机**：pointer 拖拽平移 + wheel 缩放（0.92/1.08，夹 [0.5, 3.0]，保持鼠标下世界点不动）；`centerCamera()` 对准 (w/2, h×0.38)；`isBackground` 时禁缩放
- **天气**（都在屏幕坐标）：
  - sunny：3 条光轴 × 90 横截条 × 12 层高斯圆 + 16 层太阳辉光圈 + 6 镜头耀斑 + 40 丁达尔尘埃微粒（`BlurFilter(6)` 柔化）+ 全屏暖色 0xffe8b0@0.014。**性能重头（每帧 ~3240 圆）**
  - cloudy：冷色遮罩 + 12 朵云（10 椭圆鼓包 × 3 层羽化 + 高光），右飘 `cloudOffset += dt*0.06`
  - rainy：**77 滴**；thunderstorm：**170 滴**（历史调过：80% 雨量）。雨滴目标制落向地块菱形（`tileScreenDiamonds` 每 tick 重建），触地 → 椭圆涟漪 + 重力喷雾 + 冠溅粒子
  - 闪电：`lightningAlpha *= pow(0.015, dt)` 指数衰减；深色模式更少更暗（timer 3~10s vs 1.5~6.5s）；分叉主 bolt + 分支 + 50% 子分支，路径每帧重随机
- 清理：onUnmounted 必须 destroy 全部 sprite + `app.destroy(true, {children:true})`

### 5.4 双天气系统（易混淆，务必区分）

| 系统 | 来源 | 用途 |
|---|---|---|
| **模拟天气** | `stores/forest.ts` 的 `weather`（sunny/cloudy/rainy/thunderstorm） | 森林渲染 + 环境音选层 + 背景森林天气覆盖 |
| **真实天气** | Open-Meteo（`useWeatherInfo.ts`：权限 → 定位 6s 超时 → IP 双 API 竞速 → 北京兜底） | Header 左上角天气/温度/时间显示（`settings.weatherEnabled` 控制，默认关） |

两者**完全无关**。改天气相关功能时先确认改的是哪套。

### 5.5 背景森林（BackgroundForest.vue + HomeView）

- `localStorage['bgForest']` 存 filter（today/week/month/total）；HomeView 首次启动若非法则默认 `'today'`
- 渲染：固定定位、`opacity:0.22`、`pointer-events:none`，内嵌 `IsometricGrid is-background`（密度 0.30）
- 叠加：对比度纱幕（浅色 rgba(255,255,255,0.55) / 深色 rgba(0,0,0,0.50)）+ **全透明度** CSS 天气层（雨滴 div、闪电 setTimeout 递归链、晴光 CSS 渐变、云 blob）
- 同步机制：全局 CustomEvent `bg-forest-update`（设为背景）与 `bg-weather-update`（天气影响主页）；HomeView 监听后在 z-index:10 层叠加同款天气
- 设为背景反馈：ForestViewPage 写 localStorage → toast → dispatch 事件

### 5.6 音频（4 层架构）

`AudioControlPanel.vue`（UI）→ `stores/audio.ts`（状态+级联）→ `useAmbianceController.ts`（常驻 watcher）→ `useAudioEngine.ts`（单例引擎）

- 环境音 = 地形层（plain/creek/mountain）+ 天气层（sunny/cloudy/rain/thunder）两层组合，每层独立 gain 0.5 → master 0.8；BGM gain 0.4；`source.loop = true`
- **开关级联**：主开关 OFF → 双子开关都 OFF；主开关 ON → 双子都 ON；双子全 OFF → 主 OFF；任一子 ON → 主 ON
- BGM 同曲不重启（`currentBgmTrack === track && bgmSource` 短路）——修复"切页面音乐从头播"的历史 bug
- 音频文件**已真实存在**（10 个 mp3，见第 3 章目录）——CLAUDE.md 第 6 条「音频是占位符」已过时，勿再误报
- 首次交互前 AudioContext 可能 suspended（浏览器策略），按钮需可重试

### 5.7 悬浮球（三套实现）

- **触发**：失焦 + 1s 轮询 `checkFocus()`；`settings.floatingBallEnabled` 开启；浏览器端为 Teleport 内联球，桌面端为原生窗口
- **Electron**：`electronAPI.openFloating({width:130, height:75})`；状态同步走 `sendEvent('fb:state')` / `onEvent` 订阅，elapsed 每 3s 节流推送
- **Tauri**：动态 import `WebviewWindow('floating-ball')`，`plugin:event|emit` / `listen`
- **浮窗页**（FloatingBallView，无 shell）：收到 `timerStatus==='running'` 后本地 setInterval 自走秒；展开/收起调 `resizeFloating(260,380)/(130,75)`；整窗 `-webkit-app-region: drag`；点击 todo 反发 `fb:set-active` 回主窗口
- **已知缺陷**：每次开浮窗都注册新 `onEvent` 订阅，可能累积监听器

### 5.8 设置与开发者工具

- 设置双存储：localStorage（theme/weatherEnabled/floatingBallEnabled）+ 后端 UserSetting（key-value 字符串表，bool 存 `'true'/'false'`）；`dev_mode` **只存后端**
- 开发者选项：SettingsPanel 弹确认框 → `enableDevMode()` → `settings.devMode`；开启后左下角 DevToolsPanel：批量种树 1–1000（for 循环逐次 `completeSession`，时长 [10,20,35,65]min 覆盖 4 阶段）+ 清空（**只有 today/week/total 三个选项，无 month**——注意与后端 DELETE 对称）
- DevTestButton.vue 是**死代码**（无任何引用），清理时可直接删

### 5.9 待办

- `stores/todos.ts`：乐观更新 + 失败回滚；`fetchTodos(retries=3)`（1s 间隔，专为 Electron 后端启动竞态设计）
- TodoItem：单击=设为正在做（activeTodoId）、双击=编辑、勾选完成；**完成 active 项时自动清除 active 状态**（历史需求）

---

## 6. 数据层

### 6.1 SQLite（`backend/data.db` 开发 / `%APPDATA%\DailyLikeTrees\data.db` 打包后）

| 表 | 关键字段 | 说明 |
|---|---|---|
| `focus_sessions` | timer_mode, target_seconds, actual_seconds, status, species_id, started_at, ended_at | status 只有 'completed' 实际被写入 |
| `planted_trees` | session_id(FK), species_id, growth_stage(0-3), grid_x, grid_y, **time_filter_key(索引)**, planted_at | 每 session 4 行 |
| `todos` | content, completed(0/1), sort_order(Float) | |
| `user_settings` | key(PK), value(String), updated_at | 通用 key-value |

无迁移工具（无 Alembic）、无 WAL、`check_same_thread: False`。改表结构 = 删库重建（或手写迁移脚本）。

### 6.2 localStorage keys

| Key | 内容 |
|---|---|
| `dlt_audio_settings` | audio store 全量（7 字段） |
| `dlt_forest_prefs` | terrain / weather 记忆 |
| `theme` / `weatherEnabled` / `floatingBallEnabled` | settings store（与后端双写） |
| `bgForest` | 背景森林的 filter |

### 6.3 IndexedDB（`dlt_local_db` v1，PWA/移动端）

4 个 store：sessions（created_at 索引）、trees（session_id + time_filter_key 索引）、todos（sort_order 索引）、settings（keyPath）。镜像后端全部逻辑（含 4 行树、growth 阈值、filter key 计算、级联删除）。**两端逻辑漂移是最大维护风险**。

---

## 7. 各平台壳

### 7.1 Electron（主力，`electron-app/`）

- 主窗口 1320×950（小屏按比例缩放，下限 960×692），`frame:false` + CustomTitleBar 拖拽（`-webkit-app-region: drag`）
- `startBackend()`：生产 → taskkill 清理（**含 `taskkill /F /T /IM python.exe`，会杀用户机器上所有 Python 进程——高危**）→ 800ms 忙等自旋 → 从 `process.resourcesPath/backend.exe` 与 exe 目录二选一 spawn；开发 → `python -m uvicorn app.main:app`（cwd=backend）
- 加载：dev 先 `loadURL('http://localhost:5173')` 失败异步回退 `loadFile(dist/index.html)`；浮窗 `loadURL('http://localhost:5173/#/floating')`
- IPC 通道：`window:minimize/toggleMaximize/close/isMaximized`、`window:maximizeChange`（推送）、`floating:open/close/resize`、`fb:event` 中继（`fb:request-state`/`fb:set-active` → 主窗；`fb:state` → 浮窗）
- `preload.js` 暴露 `window.electronAPI`（contextBridge；contextIsolation:true / nodeIntegration:false / sandbox:false）
- 无健康检查：spawn 后不确认 8000 端口就绪（前端靠 todos 重试兜底）
- 版本号在 `package.json`（当前 0.2.0），打包后需同步 `bundle` 目录

### 7.2 Tauri（备选，`frontend/src-tauri/`）

- `desktop.rs` 与 Electron main.js 同构：backend.exe 候选搜索、端口清理、窗口缩放、退出杀进程树；**内嵌 tiny_http 静态服务器**（WebView2 149+ 无法渲染 tauri:// 协议 → 随机端口 serve dist）；目录穿越防护（canonicalize + starts_with）
- 固定 WebView2 Runtime（`WebView2Fixed` 目录）解决兼容性
- `mobile.rs` 是空壳（Tauri 移动端未实现，仅 TODO）

### 7.3 Capacitor（Android，`frontend/android/`）

- PWA 构建（`VITE_LOCAL_BACKEND=true`）→ `cap sync` → Gradle debug APK
- 数据全走 IndexedDB，无本地后端；`androidScheme:'https'`、`allowMixedContent:false`
- **适配未完成**（README 明示不稳定）：竖屏布局问题、设置 tab 事件无消费方（AppShellMobile emit 无人监听）等

---

## 8. 已知问题与历史坑（重装时对照清单）

### 8.1 功能性 bug（代码已确认）

| # | 问题 | 位置 |
|---|---|---|
| F1 | TreeSpeciesPicker 选中后不自动关闭（`selectAndClose` 未 emit close） | `components/timer/TreeSpeciesPicker.vue` |
| F2 | 背景模式（is-background）下 canvas 仍可被 pointer 拖拽平移（onPointerDown 未拦截） | `IsometricGrid.vue` |
| F3 | 移动端 SettingsPanel 的 `@close` 无消费方（组件未声明 emits） | `components/settings/SettingsPanel.vue` + `mobile/HomeView.vue` |
| F4 | AppShellMobile 底部"设置"tab 事件无人消费（点了没反应） | `AppShellMobile.vue` |
| F5 | FloatingBall 每次开浮窗都注册新 onEvent 订阅（监听器累积） | `components/layout/FloatingBall.vue` |
| F6 | free 模式 running 时无法直接结束（必须先暂停）；countdown/countup paused 无"结束"按钮 | `CircularTimer.vue` |
| F7 | 庆祝 toast 的 setTimeout 未清理 | `CircularTimer.vue` |
| F8 | `fetchTrees()` 无重试（todos 有 3 次）→ Electron 启动竞态下森林空加载 | `stores/forest.ts` |
| F9 | `complete()` 网络失败无重试无持久化队列 → 树静默丢失 | `stores/timer.ts` |
| F10 | trees 数组变化（fetchTrees 返回）会全量重排所有树位置（雨天上演瞬移） | `IsometricGrid.vue` watch |
| F11 | `index.html` 的 `/favicon.png` `/manifest.json` `/sw.js` 绝对路径与 `base:'./'` 冲突，Electron file:// 下 404 | `frontend/index.html` |
| F12 | 时间 key 用服务端本地日期 vs 前端本地时区 → 跨时区数据错位；localDb 手写 ISO 周与 Python isocalendar 边界可能不一致 | `backend/routers/trees.py` / `localDb.ts` |

### 8.2 高危代码（动之前必须三思）

| # | 问题 | 位置 |
|---|---|---|
| H1 | `taskkill /F /T /IM python.exe` 杀用户机器**所有** Python 进程 | `electron-app/main.js:46` |
| H2 | 后端固定端口 8000，无占用检测（仅壳层"尽力清理"） | `run.py` / `main.js` |
| H3 | CORS `allow_origins=["*"]` + `allow_credentials=True`（规范上无效组合） | `backend/app/main.py` |
| H4 | `DELETE /api/trees?filter=` 无鉴权无确认（开发者工具暴露在生产 API） | `backend/app/routers/trees.py` |
| H5 | 种树位置分配非原子（查询→计算→插入），并发同格 | `session_service.py` |
| H6 | settings 双写（localStorage + 后端）无冲突策略，后端不可用时更改静默丢失 | `stores/settings.ts` |

### 8.3 设计债 / 遗留

- `FocusSession.status='abandoned'` 从未写入；API 不校验 actual_seconds
- 每树 4 行冗余存储（删除需级联）；`PlantedTree` 无 grid 唯一约束
- 37 种树各只有 variant_0（variant 系统是预留能力，未启用）
- 音频引擎对 404 静默容忍（历史占位设计）——现在文件已齐，可考虑报错
- 仓库根目录曾被提交 `DailyLikeTrees-portable.zip`（已 gitignore，如存在可删）
- 移动端整体适配未完成（README 已声明）

### 8.5 测试基建（2026-08 已建立）

- **后端 pytest**（`backend/tests/`，34 用例）：种树事务（1 session → 4 行）、growth 阈值边界、filter key 格式、级联删除、todos CRUD/reorder、settings 默认值与 bool 字符串存储。隔离方案：`conftest.py` 用内存 SQLite（StaticPool）+ `app.dependency_overrides[get_db]`，**绝不触碰真实 data.db**（TestClient 不用 context manager，避免触发 lifespan）
- **前端 vitest**（`frontend/test/`，21 用例）：`localDb ↔ treeGrowth ↔ 后端` 三处实现对称性（growth 阈值、filter key 格式、种树事务镜像、级联删除、todos、settings）+ fake-indexeddb 隔离（每个用例全新 IDBFactory）
- **CI**（`.github/workflows/ci.yml`）：push main / PR 时跑 frontend（typecheck → build → vitest）+ backend（pytest）
- **已知收益**：对称性测试已抓到并修复一个真实漂移 bug（localDb 首个 todo 的 sort_order 从 1 起、后端从 0 起）
- **纪律**：改 growth 阈值 / filter key 计算时，三处实现 + 两端测试断言表必须同步改（`backend/tests/test_growth.py` ↔ `frontend/test/treeGrowth.test.ts`）

### 8.4 历史教训（Prompt 存档中反复踩的坑）

1. **改动窗口控制/平台检测/布局前**：务必先读 `usePlatform.ts`、`CustomTitleBar.vue`、`main.js`，历史上多次"越改越坏"
2. **视觉迭代纪律**：所有改动保持包豪斯风格（无衬线细体、少 emoji、标准 UI 图标如 @lucide/vue、IconSvg）；图标绘制后必须自查可读性（历史多次被批"看不出是什么"）
3. **换资源必须同步路径表**：换树/音频后检查 `assetPaths.ts` 映射与文件名一致（历史：换 PNG 后森林仍显示旧 SVG）
4. **前端效果性能**：晴天光束/雨天菱形重建是已知性能重头，优化时"几乎不影响视觉效果"为前提
5. **UI 比例**：桌面端布局用百分比/弹性布局，严禁写死 px 导致竖屏 UI 事故

---

## 9. 开发流程与构建发布

### 9.1 日常开发

```bash
# 后端（端口 8000 固定）
cd backend && python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# 前端（无 proxy，靠 CORS 直连 8000）
cd frontend && npm run dev

# 类型检查（提交前必跑）
npx vue-tsc --noEmit

# 桌面开发模式（自动拉起后端 uvicorn + 加载 localhost:5173）
cd electron-app && npm start
```

### 9.2 发布流程（桌面）

```bash
# 1. 构建 backend.exe（PyInstaller）
cd backend && pyinstaller --onefile --name backend --collect-all uvicorn --collect-all fastapi --collect-all sqlalchemy --collect-all aiosqlite run.py
# 2. 复制到 Tauri 资源目录（Electron extraResources 复用此产物！）
cp backend/dist/backend.exe frontend/src-tauri/binaries/backend.exe
# 3. 构建 Electron 安装包（自动 build frontend → copy dist → electron-builder）
cd electron-app && npm run build
# 产物：electron-app/release/DailyLikeTrees Setup x.x.x.exe + win-unpacked/
```

**版本发布纪律**：每次发布同步更新 `electron-app/package.json` 版本号、README、bundle 目录（用户反复强调过）。

### 9.3 移动端（Android）

```bash
cd frontend && npm run android:sync    # build:pwa → cap sync
npm run android:build                  # 完整 Gradle debug APK
# APK: frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 10. 重装建议路线图（按优先级）

1. **止血**：修复 8.1 的 F1–F12 功能性 bug（每项改动小、风险可控）
2. **安全**：移除 H1 的 python.exe 全局 kill（改为只杀自己 spawn 的 PID 树）、CORS 收紧、DELETE 加确认参数
3. **可靠**：`complete()` 失败重试/队列、`fetchTrees()` 加重试、后端端口动态探测、settings 双写冲突策略
4. **一致性**：三份 growth 阈值与 filter key 计算收敛为单一来源（前端生成 key 传入后端，或后端返回 key）；localDb 与后端逻辑对齐测试（测试基建已建立，见 §8.5）
5. **体验**：移动端适配（竖屏布局、设置 tab）
6. **工程质量**：CI 已建立（§8.5）；后续可加 Electron 手动触发 release workflow（PyInstaller + electron-builder）

---

*文档版本：v1.2（2026-08-16）。v1.0 重装前盘点；v1.1 彻底移除 Tauri，docs/ 目录建立；v1.2 建立测试基建（后端 pytest 34 用例、前端 vitest 21 用例、CI workflow，详见 §8.5）。本文档随重装进度持续维护，每次重大架构变更必须回写本文档。*
