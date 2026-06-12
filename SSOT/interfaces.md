# Interfaces

## 用户管理

### User
```json
{
  "id": "uuid",
  "username": "string",
  "created_at": "ISO8601"
}
```

## 番茄钟

### TimerMode
```
pomodoro | exercise | meditation
```

### PomodoroConfig
```json
{
  "work_duration_minutes": 45,
  "break_duration_minutes": 10,
  "long_break_after_count": 4,
  "long_break_duration_minutes": 15
}
```

### ExerciseConfig
```json
{
  "exercise_type": "boxing | running",
  "planned_duration_minutes": 30 | 60,
  "overtime_enabled": true
}
```

### TimerState
```json
{
  "mode": "pomodoro | exercise | meditation",
  "status": "idle | running | paused | finished",
  "remaining_seconds": 0,
  "elapsed_overtime_seconds": 0,
  "current_session": 1,
  "total_sessions": 4,
  "started_at": "ISO8601 | null",
  "work_duration_minutes": 45,
  "short_break_minutes": 10,
  "leisure_break_minutes": 15,
  "long_break_minutes": 15,
  "break_type": "none | short | leisure | long",
  "works_since_leisure": 0,
  "works_since_exercise": 0,
  "exercise_reminder_due": false,
  "bath_reminder_due": false,
  "exercise_type": "boxing | running"
}
```

### HackathonProject
```json
{
  "id": "uuid",
  "name": "string",
  "total_duration_hours": 24 | 48 | 72,
  "sub_projects": [
    {
      "id": "uuid",
      "name": "string",
      "planned_hours": 8,
      "pomodoro_sessions": 10,
      "status": "pending | in_progress | completed"
    }
  ]
}
```

## 任务管理

### Task
```json
{
  "id": "uuid",
  "name": "string",
  "deadline": "ISO8601 | null",
  "importance_axis_position": 1,
  "desire_axis_position": 1,
  "parent_id": "uuid | null",
  "children": ["uuid"],
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "status": "pending | in_progress | completed",
  "start_date": "YYYY-MM-DD | null",
  "end_date": "YYYY-MM-DD | null",
  "date_blocks": [{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}],
  "pomodor_completed": 0,
  "pomodor_total": 0,
  "archived": false,
  "pinned": false,
  "tags": ["string"],
  "questions": [{"id": "uuid", "question": "string", "answer": "string"}],
  "dependencies": ["uuid"],
  "story": "string"
}
```

### TaskAxis（填写时的数据结构）
```json
{
  "axis_type": "importance | desire",
  "tasks": [
    {
      "task_id": "uuid",
      "position": 0.0
    }
  ]
}
```

## 甘特图管理

### GanttView（甘特图视图）
```json
{
  "view_type": "overall | project | hackathon",
  "tasks": ["Task"],
  "time_range": {
    "start": "ISO8601",
    "end": "ISO8601"
  }
}
```

### GanttLink（甘特图关联/同步逻辑）
- 同一任务在不同甘特图中共享进度
- 番茄钟完成 → 自动更新所有相关甘特图
- 黑客松归档 → 同步到项目和总体甘特图

### HackathonArchive（历史黑客松）
```json
{
  "id": "uuid",
  "name": "string",
  "total_duration_hours": 24 | 48 | 72,
  "completed_at": "ISO8601",
  "contributed_tasks": ["task_id"],
  "total_pomodoros": 10
}
```

## 日程管理

### MealSettings
```json
{
  "breakfast_start": "08:00",
  "breakfast_latest_start": "09:00",
  "lunch_start": "13:00",
  "lunch_latest_finish": "14:00",
  "dinner_start": "19:00",
  "dinner_latest_finish": "20:00",
  "prep_time_minutes": 60,
  "meal_duration_minutes": 60
}
```

### BlockedPeriod（课程 block）
```json
{
  "id": "uuid",
  "name": "string",
  "start_time": "ISO8601",
  "end_time": "ISO8601",
  "recurring": "none | daily | weekly"
}
```

### DailySchedule
```json
{
  "date": "YYYY-MM-DD",
  "blocked_periods": ["BlockedPeriod"],
  "meal_blocks": [
    {
      "type": "breakfast | lunch | dinner",
      "start_time": "ISO8601",
      "end_time": "ISO8601"
    }
  ],
  "pomodoro_sessions": ["TimerSession"]
}
```

## 运动提醒

### ExerciseReminder
```json
{
  "after_work_sessions": 4,
  "exercise_type": "boxing | running",
  "duration_minutes": 30 | 60
}
```

### BathReminder
```json
{
  "after_exercise": true,
  "delay_minutes": 30
}
```

---

## 页面路径（前端路由）

| 路径 | 页面 | 说明 |
|------|------|------|
| `/clock/login` | 登录页 | 用户名登录 |
| `/clock/home` | 首页 | 当前状态 + 快速开始 |
| `/clock/timer` | 全屏计时器 | 主计时页面 |
| `/clock/tasks` | 任务管理 | 任务列表 + 甘特图 |
| `/clock/tasks/:id` | 任务详情 | 子任务 + 甘特图分支 |
| `/clock/tasks/:id/axis/importance` | 重要程度编辑 | 拖拽式 axis 编辑 |
| `/clock/tasks/:id/axis/desire` | 想干程度编辑 | 拖拽式 axis 编辑 |
| `/clock/hackathon` | 黑客松 | 项目管理 |
| `/clock/schedule` | 日程 | 吃饭/课程 block |
| `/clock/settings` | 设置 | 用户设置 |

## API 端点（后端，前缀 `/api`）

### 用户
- `POST /api/users` - 创建用户
- `GET /api/users/preferences` - 获取用户偏好（theme, language）(REQ-102)
- `PUT /api/users/preferences` - 更新用户偏好 (REQ-102)
- `GET /api/users/me/export` - 用户全量数据备份导出（tasks/history/schedule/timer/prefs）
- `GET /api/users/:id` - 获取用户信息
- `POST /api/users/login` - 用户登录（用户名）
- `POST /api/users/validate` - 验证 token

### 番茄钟
- `GET /api/timer/state` - 获取当前状态
- `PUT /api/timer/settings` - 更新计时器设置（work/break 时长）(REQ-301)
- `POST /api/timer/start` - 开始计时
- `POST /api/timer/pause` - 暂停
- `POST /api/timer/resume` - 继续
- `POST /api/timer/stop` - 停止
- `POST /api/timer/switch-task` - 切换当前任务
- `POST /api/timer/sessions/complete` - 标记会话完成
- `POST /api/timer/break/start` - 开始休息（short/leisure/long）
- `POST /api/timer/exercise/start` - 开始运动（boxing/running）
- `POST /api/timer/exercise/skip` - 跳过运动提醒
- `POST /api/timer/bath/skip` - 跳过洗澡提醒
- `GET /api/timer/sounds` - 获取可用提醒音列表（内置 + 用户自定义）(REQ-303)
- `POST /api/timer/sounds/upload` - 上传自定义声音（mp3/wav/ogg, ≤1MB）(REQ-303)
- `GET /api/timer/sounds/custom/{filename}` - 读取用户自定义声音文件 (REQ-303)
- `DELETE /api/timer/sounds/custom/{filename}` - 删除用户自定义声音（自动重置引用偏好）(REQ-303)
- `GET /api/timer/sound-preferences` - 获取声音偏好（各场景铃声 + 音量）(REQ-303)
- `PUT /api/timer/sound-preferences` - 更新声音偏好 (REQ-303)
- `GET /api/timer/presets` - 获取计时器预设列表（含内置默认预设）
- `POST /api/timer/presets` - 创建自定义预设
- `DELETE /api/timer/presets/:id` - 删除自定义预设
- `POST /api/timer/presets/:id/apply` - 应用预设到当前计时器

### 任务
- `POST /api/tasks` - 创建任务（支持 tags 字段，name 1-500字）
- `GET /api/tasks` - 获取所有任务
- `GET /api/tasks/search?q=` - 全文搜索（名称/故事/标签）
- `GET /api/tasks/gantt-data` - 获取甘特图数据（任务 + 实际工作记录）
- `GET /api/tasks/meta/tags` - 获取所有标签及使用次数 (REQ-302)
- `GET /api/tasks/meta/by-tag/:tag` - 按标签筛选任务 (REQ-302)
- `GET /api/tasks/meta/stats` - 任务统计（按状态计数/完成率/逾期数）
- `GET /api/tasks/:id` - 获取任务详情
- `PUT /api/tasks/:id` - 更新任务（支持 tags 字段）
- `DELETE /api/tasks/:id` - 删除任务
- `POST /api/tasks/bulk/archive` - 批量归档
- `POST /api/tasks/bulk/delete` - 批量删除（含递归子任务）
- `POST /api/tasks/reorder` - 重排序
- `PUT /api/tasks/:id/position` - 更新轴位置
- `POST /api/tasks/bulk-update-positions` - 批量更新位置
- `POST /api/tasks/:id/start-pomodoro` - 从任务开始番茄钟

### 统计
- `GET /api/stats/today` - 今日统计 (REQ-201)
- `GET /api/stats/weekly?weeks=4` - 周统计（热力图数据）(REQ-202)
- `GET /api/stats/monthly?months=3` - 月统计（趋势数据）(REQ-202)
- `GET /api/stats/recent?limit=20` - 最近完成记录 (REQ-201)
- `GET /api/stats/heatmap?range=1m|3m|1y` - 热力图数据 (REQ-202)
- `GET /api/stats/task-completion` - 任务完成率追踪 (REQ-203)
- `GET /api/stats/export?format=json|csv` - 数据导出 (REQ-204)
- `GET /api/stats/streak` - 连续天数追踪（当前/最长/总活跃天）
- `GET /api/stats/dashboard` - 仪表板汇总（今日/streak/即将到期/最近活动）
- `GET /api/stats/weekly-comparison` - 本周 vs 上周对比（番茄数/分钟/增减百分比）
- `GET /api/stats/peak-hours?weeks=4` - 高峰时段热力图

### 日程
- `GET /api/schedule/:date` - 获取某日日程
- `POST /api/schedule/block` - 添加 block 时段
- `DELETE /api/schedule/block/:id` - 删除 block 时段
- `GET /api/schedule/meal-settings` - 获取吃饭设置
- `PUT /api/schedule/meal-settings` - 更新吃饭设置
- `GET /api/schedule/meal-windows` - 获取可用吃饭窗口
- `GET /api/schedule/today` - 今日日程汇总（课程块 + 三餐时间→统一时间线）

### 历史记录
- `POST /api/history` - 记录番茄钟/运动/冥想会话
- `GET /api/history` - 列出历史记录（支持日期/任务/类型过滤 + 分页）
- `DELETE /api/history/:id` - 删除历史记录

### 习惯追踪
- `GET /api/habits` - 获取习惯列表
- `POST /api/habits` - 创建习惯（支持自动打卡触发器）
- `PUT /api/habits/:id` - 更新习惯
- `POST /api/habits/:id/checkin` - 习惯打卡
- `DELETE /api/habits/:id` - 删除习惯

### 外部同步（PolarClaw 集成）
- `GET /api/sync/snapshot?username=` - 获取用户完整状态快照（timer + schedule + today work）
- `GET /api/sync/events?username=` - SSE 实时事件流（timer_change / schedule_change）
- `GET /api/sync/users` - 列出所有 Clock 用户（用于映射）
- `POST /api/sync/generate-key` - 生成/重置同步 API Key（需管理员 token）

### 数据备份
- `GET /api/backup` - 列出所有备份
- `POST /api/backup` - 创建备份
- `GET /api/backup/:id/diff` - 备份对比（当前 vs 备份差异）
- `POST /api/backup/:id/restore` - 恢复备份（自动创建恢复前备份）
- `DELETE /api/backup/:id` - 删除备份

### 信息消费工作台（前端 Vite 代理，非 Clock backend）

前端路径 `/clock/feed`。开发环境经 `vite.config.ts` 代理：

| 前缀 | 目标 | 用途 |
| --- | --- | --- |
| `/digist-api` | digist HTTP API（默认 `localhost:3800`） | `GET /api/recommend`、`POST /api/video/digest`、`GET/POST/DELETE /api/sources`、`POST /api/crawl/trigger`、契约占位 `POST /api/feedback` |
| `/gw/knowlever-rag` | KnowLever RAG（默认 `localhost:18080`） | 优先 `GET /api/digist/report`（若未部署则降级 `GET /api/topics/.../pages` 与 `GET /api/digest-feed`）、`POST /api/compile/trigger`、`POST /api/ingest` |

推荐项扩展字段（`digest_status`、`source_type`、`local_play_url` 等）以后端 digist 返回为准；Clock 仅渲染与本地状态覆盖。
