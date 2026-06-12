# State

## 项目信息
- **项目名称**：PolarClock - 番茄钟时间管理系统
- **当前 Milestone**：Post-MVP 扩展（Phase 12 PWA 离线支持已落地）
- **最后更新**：2026-04-14

---

## 技术栈

### 前端
- **框架**：React 18 + Vite
- **路由**：React Router v6
- **状态管理**：Zustand
- **PWA**：`vite-plugin-pwa` + Workbox（precache + runtime caching）
- **UI 组件**：TailwindCSS
- **甘特图**：自研组件
- **端口**：4555

### 后端
- **框架**：FastAPI
- **数据存储**：JSON 文件
- **端口**：15550

### 部署
- **平台**：Tailscale Funnel
- **URL 路径**：`/clock`
- **外部访问**：通过 Tailscale 网络

---

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DATA_DIR` | 数据存储目录 | `./data` |
| `CLOCK_SYNC_KEY` | PolarClaw 同步 API Key（存于 `data/sync_key.txt`） | 无（默认免认证） |

---

## 文件结构

```
Clock/
├── backend/
│   ├── main.py
│   ├── routers/
│   │   ├── __init__.py      # atomic_json_write 共享工具
│   │   ├── timer.py         # +声音偏好/预设 API (REQ-303)
│   │   ├── tasks.py         # +标签/搜索/批量操作 (REQ-302)
│   │   ├── stats.py         # +完成率/导出/仪表板/streak (REQ-203/204)
│   │   ├── schedule.py      # +今日日程汇总
│   │   ├── users.py         # +偏好/导出/登出/账号删除 (REQ-102)
│   │   ├── history.py       # 历史记录 CRUD
│   │   ├── habits.py        # 习惯追踪 + 自动打卡
│   │   ├── backup.py        # 数据备份恢复
│   │   ├── sync.py          # PolarClaw 联动（snapshot + SSE + 服务级 Key）
│   │   └── devmode.py       # 开发者模式路由
│   ├── tests/
│   │   ├── conftest.py
│   │   └── test_api.py      # 97 tests (REQ-401)
│   └── data/
│       └── *.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── GanttChart.tsx
│   │   │   ├── AxisSelector.tsx
│   │   │   ├── Layout.tsx
│   │   │   ├── InstallPrompt.tsx
│   │   │   └── ServiceWorkerUpdatePrompt.tsx
│   │   ├── pages/
│   │   │   ├── Timer.tsx
│   │   │   ├── Tasks.tsx
│   │   │   ├── TaskDetail.tsx
│   │   │   ├── AxisEdit.tsx
│   │   │   ├── Schedule.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Login.tsx
│   │   ├── stores/
│   │   │   ├── timerStore.ts
│   │   │   ├── taskStore.ts
│   │   │   ├── userStore.ts
│   │   │   ├── mealStore.ts
│   │   │   └── scheduleStore.ts
│   │   ├── utils/
│   │   │   └── offlineSync.ts
│   │   └── pwa.ts
│   ├── public/sounds/   # 结束铃 MP3（work-end / rest-end / meditation-end）
│   ├── package.json
│   └── vite.config.ts   # PWA manifest + Workbox 缓存策略
├── SSOT/
├── .planning/
│   └── codebase/        # GSD 代码库映射（如 CONVENTIONS.md、TESTING.md）
├── scripts/
├── README.md
└── deploy-tailscale.md
```

### 通知铃声子系统
- 内置铃声：`frontend/public/sounds/`（`work-end.mp3` / `rest-end.mp3` / `meditation-end.mp3`）。
- 用户自定义铃声：上传到后端 `data/{username}/sounds/`，mp3/wav/ogg 格式，≤1MB。
- 播放路径统一：到点时 `sounds.ts` 的 `playSceneEndSound(scene)` 读取用户声音偏好（`sound_prefs.json`），解析为内置/自定义/静音 URL，再播放。三条场景路径（工作/休息/冥想结束）全部经此统一入口。
- 浏览器可能拦截「无用户手势」的自动播放；计时页在到点失败或超时未出声时会显示「🔊 播放铃声」；开始番茄/休息/冥想时会调用 `unlockAudioForSession()` 以提升成功率。
- `capabilities.json` 已登记 `clock.sounds.*` 系列能力（list/upload/delete/preferences），可供 PolarClaw Agentic 调用。

---

## 功能开关

| 功能 | 状态 |
|------|------|
| 番茄钟计时 | ✅ 已实现 |
| 15分钟休闲时间 | ✅ 已实现 |
| 运动提醒（4工作番茄） | ✅ 已实现 |
| 运动计时（可超时） | ✅ 已实现 |
| 洗澡提醒 | ✅ 已实现 |
| 任务管理 + 甘特图 | ✅ 已实现 |
| 二象限任务选择 | ✅ 已实现 |
| Deadline 48h优先级提升 | ✅ 已实现 |
| 黑客松项目管理 | ❌ 已移除 |
| 黑客松归档 | ❌ 已移除 |
| 课程 Block | ✅ 已实现 |
| 吃饭时间设置 | ✅ 已实现 |
| 吃饭提醒（提前1小时） | ✅ 已实现 |
| 多用户支持 | ✅ 已实现 |
| 登录持久化 | ✅ 已实现 |
| 浏览器通知 | ✅ 已实现 |
| 音频提醒 | ✅ 已实现 |
| PWA 离线缓存 | ✅ 已实现 |
| PWA 安装/更新提示 | ✅ 已实现 |
| 键盘导航 | ✅ 已实现 |
| 拖拽式 axis 编辑 | ✅ 已实现 |
| 番茄钟历史记录 (REQ-201) | ✅ 已实现 |
| 统计面板 API (REQ-202) | ✅ 已实现 |
| 任务完成率追踪 (REQ-203) | ✅ 后端 API 已实现 |
| 数据导出 JSON/CSV (REQ-204) | ✅ 后端 API 已实现 |
| 自定义番茄钟时长 (REQ-301) | ✅ 已实现 |
| 标签分类系统 (REQ-302) | ✅ 后端 API 已实现 |
| 声音自定义 (REQ-303) | ✅ 前后端完整实现（上传/删除/偏好/统一播放路径） |
| 番茄钟任务关联 (REQ-304) | ✅ 已实现 |
| 暗色模式偏好 (REQ-102) | ✅ 后端 API 已实现 |
| 统一错误响应 (REQ-402) | ✅ 已实现 |
| 后端单元测试 (REQ-401) | ✅ 97 tests passing |
| 习惯追踪系统 | ✅ CRUD + 自动打卡 |
| 数据备份恢复 | ✅ 创建/对比/恢复/删除 |
| 原子文件写入 | ✅ 全部 10 个 save 函数 |
| JSON 损坏恢复 | ✅ 全部 10 个 load 函数 |
| 请求计时中间件 | ✅ X-Process-Time header |
| 输入验证约束 | ✅ Pydantic Field 约束 |
| 任务搜索 | ✅ GET /api/tasks/search |
| 批量任务操作 | ✅ bulk/archive、bulk/delete |
| 仪表板 API | ✅ GET /api/stats/dashboard |
| 连续天数追踪 | ✅ GET /api/stats/streak |
| 用户数据导出 | ✅ GET /api/users/me/export |
| PolarClaw 同步 API | ✅ snapshot + SSE + 用户列表 + Key 管理 |
