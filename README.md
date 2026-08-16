<div align="center">

<img src="frontend/public/assets/logo.png" alt="DailyLikeTrees Logo" width="120" />

# 🌳 DailyLikeTrees · 如树日常

*日复一日，如树般生长。每一次专注，都在你的森林里种下一棵树。*

[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## ✨ 这是什么？

**DailyLikeTrees（如树日常）** 是一款受 Forest 专注森林启发的多平台专注辅助应用。

设定一个专注目标 → 完成它 → 在你的等距「专注森林」中种下一棵树。日积月累，终成一片林。

> 🖥️ 当前开发阶段：**多平台 MVP — Web + Electron 桌面 + Android（适配中）**
> 📚 开发文档见 [docs/](docs/)

---

## 🎯 核心功能

<table>
<tr>
<td width="50%">

### ⏱️ 计时器
SVG 环形拖拽设时（15~120 分钟，自动吸附常用时长），支持倒计时 / 正计时 / 自由模式，30 秒以上专注即可种树。

### 🌳 专注森林
PixiJS WebGL 驱动的等距（Isometric）森林渲染，37 种树木精灵，黄金比例（0.618）动态网格布局，树与树之间永不重叠。

### ☀️ 天气效果渲染
晴天（体积光束 + 丁达尔光尘）、多云（蓬松积云）、雨天（涟漪水花）、雷雨（多层闪电），PixiJS + CSS 双层渲染。

</td>
<td width="50%">

### 🏔️ 地形生成
平原 / 溪流 / 山地三种地形，柏林噪声驱动的高低错落地块，溪流支持曲流与小岛。切换地形时树木自动重新分布。

### 🎵 环境音
Web Audio API 多层环境音（雨声 / 溪流 / 风 / 雷 / 森林）实时混合，跨页面无缝衔接，地形 / 天气音独立开关。

</td>
</tr>
</table>

**更多特性：**
- 🌓 **深色 / 浅色主题** — 全局 CSS 自定义属性驱动，天气颜色随主题自适应
- 📋 **待办记事** — 完整的 Todo CRUD + 「正在做」标记，乐观更新 + 自动回滚
- 🖼️ **森林背景** — 将任意时间段的森林设为主页动态背景，天气联动主界面
- 🏓 **专注悬浮球** — 应用失焦时弹出迷你计时 / 待办窗口，可脱离主窗口悬浮
- 📱 **PWA 就绪** — Hash 路由 + 响应式布局，可安装到桌面

---

## 🛠 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| **前端框架** | Vue 3 + Composition API | `<script setup>` + TypeScript |
| **状态管理** | Pinia | 5 个 Store 模块（timer / todos / forest / audio / settings） |
| **构建工具** | Vite 8 | 极速 HMR，`base: './'` 兼容 file:// 协议 |
| **森林渲染** | PixiJS 7.4 | WebGL 等距 2D 渲染（注意：**v7 API**，非 v8） |
| **音频引擎** | Web Audio API | 多层环境音 + BGM 实时混音 |
| **后端框架** | FastAPI | Python 异步 Web 框架 |
| **数据库** | SQLite3 + SQLAlchemy | 轻量级，零配置 |
| **类型验证** | Pydantic v2 | 请求 / 响应 Schema |
| **桌面端** | Electron 33 | 主力桌面壳（内嵌 Chromium，无需额外运行时） |
| **移动端** | Capacitor 8 | PWA → 原生 Android APK |
| **后端打包** | PyInstaller | 将 Python 后端编译为独立 exe |

---

## 🚀 快速开始

### 前置要求

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **npm** ≥ 9

### 1. 克隆仓库

```bash
git clone https://github.com/2678725875-dot/DailyLikeTrees.git
cd DailyLikeTrees
```

### 2. 启动后端

```bash
cd backend

# 创建虚拟环境（推荐）
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动服务（端口 8000）
uvicorn app.main:app --reload
```

访问 [http://localhost:8000/docs](http://localhost:8000/docs) 查看 Swagger API 文档。

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 [http://localhost:5173](http://localhost:5173) 即可使用。

> ⚠️ 两个服务需要**同时运行**。前端的 API 请求直接连接后端 8000 端口（由 CORS 放行）。

### 4. 桌面应用（Electron）

> 🖥️ 桌面端唯一方案。内嵌 Chromium 130，无需安装任何额外运行时。

**开发模式：**

```bash
cd electron-app
npm install
npm start
```

Electron 窗口自动打开，优先加载 Vite dev server，失败则回退本地 `dist/`。

**生产构建：**

```bash
# 1. 构建 backend.exe（见下方「后端打包」）
# 2. 构建 Electron 安装包（自动构建前端 → 复制 dist → electron-builder）
cd electron-app
npm run build
```

构建产物位于 `electron-app/release/`：
- `DailyLikeTrees Setup 0.x.x.exe` — NSIS 安装包（含 backend.exe）
- `win-unpacked/DailyLikeTrees.exe` — 绿色免安装版

> 📦 应用自动启动 / 停止 backend.exe，用户**无需安装 Python** 或任何运行环境。

#### 后端打包

```bash
cd backend
pip install pyinstaller
pyinstaller --onefile --name backend \
    --collect-all uvicorn --collect-all fastapi \
    --collect-all sqlalchemy --collect-all aiosqlite \
    run.py

# 产物位于 backend/dist/backend.exe（Electron 构建时自动打包）
```

### 5. 移动端（Android）— 适配未完成

> 📱 基于 Capacitor，PWA 转原生 APK。

```bash
cd frontend
npm run android:sync    # 同步前端到 Capacitor
npm run android:build   # 完整构建 → APK
```

APK 输出：`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 📁 项目结构

```
DailyLikeTrees/
├── docs/                            # 开发文档（仅 CLAUDE.md、PROJECT.md 上传仓库）
│   ├── CLAUDE.md                    # Claude Code 项目指引
│   └── PROJECT.md                   # 项目总纲 · 最高规则文件
│
├── electron-app/                    # Electron 桌面应用（主力）
│   ├── main.js                      # 主进程：窗口管理 / 后端拉起 / IPC
│   ├── preload.js                   # contextBridge API 暴露
│   └── package.json                 # electron-builder 构建配置
│
├── frontend/                        # Vue 3 + Vite 前端（全端共用唯一 UI 代码源）
│   ├── public/assets/
│   │   ├── audio/                   # 音频素材（环境音 + BGM）
│   │   │   ├── ambiance/            # plain / creek / mountain / sunny / cloudy / rain / thunder
│   │   │   └── music/               # calm-1 / calm-2 / calm-3
│   │   ├── trees/species/           # 37 种树木精灵（tree1~tree37，PNG）
│   │   └── logo.png                 # 应用图标
│   ├── src/
│   │   ├── components/
│   │   │   ├── timer/               # CircularTimer / TreePreview / TreeSpeciesPicker
│   │   │   ├── board/               # TodoBoard / TodoItem / TodoAddForm
│   │   │   ├── forest/              # IsometricGrid（核心渲染器）/ BackgroundForest
│   │   │   ├── audio/               # AudioControlPanel
│   │   │   ├── icons/               # IconSvg 矢量图标系统
│   │   │   ├── settings/            # SettingsPanel / DevToolsPanel
│   │   │   └── layout/              # AppShell / CustomTitleBar / FloatingBall
│   │   ├── composables/             # useAudioEngine / useCircularTimer / useWeatherInfo …
│   │   ├── stores/                  # Pinia: timer / todos / forest / audio / settings
│   │   ├── services/                # api.ts（双后端路由）/ localDb.ts（IndexedDB）
│   │   ├── types/                   # TypeScript 类型定义
│   │   ├── utils/                   # 等距坐标 / 素材路径 / 树木生长 / 常量
│   │   ├── views/                   # HomeView / ForestViewPage / FloatingBallView
│   │   └── styles/                  # CSS 变量 / 主题 / 基础样式
│   └── android/                     # Capacitor Android 项目
│
├── backend/                         # FastAPI + SQLite3 后端
│   ├── app/
│   │   ├── models/                  # ORM: FocusSession / PlantedTree / Todo / UserSetting
│   │   ├── schemas/                 # Pydantic 请求 / 响应模型
│   │   ├── routers/                 # sessions / trees / todos / settings
│   │   ├── services/                # 业务逻辑层
│   │   └── utils/                   # 树木成长阶段计算
│   └── run.py                       # PyInstaller 入口脚本
│
├── README.md                        # 本文件
└── LICENSE                          # MIT
```

---

## 🔌 API 概览

| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/api/sessions` | 完成一次专注 → 种下一棵树 |
| `GET` | `/api/sessions` | 获取最近会话列表 |
| `GET` | `/api/trees?filter=today\|week\|month\|total` | 获取森林树木 + 统计 |
| `DELETE` | `/api/trees?filter=today\|week\|total` | 清空某时间段树木（开发者工具） |
| `GET` / `POST` | `/api/todos` | 待办列表 / 创建待办 |
| `PATCH` / `DELETE` | `/api/todos/{id}` | 更新 / 删除待办 |
| `PUT` | `/api/todos/reorder` | 重排待办顺序 |
| `GET` / `PUT` | `/api/settings` | 读写用户设置 |

### 树木成长阶段

| 专注时长 | 阶段 |
|----------|------|
| 0–14 分钟 | 🌱 种子 |
| 15–29 分钟 | 🌿 萌芽 |
| 30–59 分钟 | 🪴 树苗 |
| ≥ 60 分钟 | 🌳 大树 |

> 💡 少于 30 秒的专注不会种树（前端静默丢弃，刻意设计）。

---

## 🎵 音频素材

项目音频文件位于 `frontend/public/assets/audio/`，来自 [Freesound.org](https://freesound.org)（CC0 许可）。

如需替换：
1. 将音频文件放入对应目录（`ambiance/` 或 `music/`）
2. 编辑 `frontend/src/utils/assetPaths.ts` 更新路径映射
3. 推荐参数：环境音 96–128kbps 单声道，BGM 128–192kbps 立体声

---

## 🤝 开发指引

- 动手前必读 [`docs/PROJECT.md`](docs/PROJECT.md)（项目最高规则，含红线契约与已知问题清单）
- 快捷指引见 [`docs/CLAUDE.md`](docs/CLAUDE.md)

**后续计划：**

- [x] 多端架构（Web / Electron / Android）
- [ ] Android 适配完善（竖屏布局 / 设置面板）
- [ ] iOS 适配
- [ ] 多人专注房间
- [ ] 更多树种 & 自定义森林主题
- [ ] 专注统计 & 周报
- [ ] 浏览器扩展（屏蔽 distracting 网站）

---

## 📄 许可

MIT License — 详见 [LICENSE](LICENSE) 文件。

---

<div align="center">

**🌳 每一棵树，都见证了你专注的时光。**

Made with ❤️ by [Ultraism](https://github.com/2678725875-dot)

</div>
