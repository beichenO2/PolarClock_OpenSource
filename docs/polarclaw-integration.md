# Clock ↔ PolarClaw 联动集成指南

## 概览

Clock（PolarClock 番茄钟系统）通过 `/api/sync/*` 端点将用户的实时状态、日程表、工作记录以 JSON 格式暴露给外部系统。PolarClaw（龙虾智能体）可以通过这些端点获取用户的 Clock 数据，实现：

- 龙虾知道你当前在工作还是休息（实时状态感知）
- 龙虾知道你今天的日程安排（课程、三餐时间）
- 龙虾知道你今天做了多少番茄钟（工作量追踪）

---

## 1. Clock 端 API

### 端点列表

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/sync/snapshot?username=xxx` | GET | 获取用户完整状态快照（一次性拉取） |
| `/api/sync/events?username=xxx` | GET | SSE 实时事件流（状态变化时推送） |
| `/api/sync/users` | GET | 列出所有 Clock 用户（用于映射） |
| `/api/sync/generate-key` | POST | 生成/重置同步 API Key（需管理员 token） |

### 认证方式

所有 `/api/sync/*` 端点使用 `X-Sync-Key` header 认证（服务级 API Key）：

```bash
# 1. 先用管理员账号登录获取 token
curl -X POST http://localhost:15550/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "admin"}'
# 返回: {"user": {...}, "token": "xxx"}

# 2. 用管理员 token 生成 sync key
curl -X POST http://localhost:15550/api/sync/generate-key \
  -H 'X-Token: <管理员token>'
# 返回: {"sync_key": "clk_sync_...", "note": "..."}

# 3. 之后所有 sync 请求带上这个 key
curl http://localhost:15550/api/sync/snapshot?username=guojia \
  -H 'X-Sync-Key: clk_sync_...'
```

> 如果没有生成过 sync key，端点默认免认证（方便本地开发）。生产环境务必生成 key。

### 快照数据结构

```json
{
  "clock_username": "guojia",
  "clock_user_id": "1be5b656-...",
  "generated_at": "2026-04-14T15:30:00",
  "user_status": "working",
  "timer": {
    "mode": "pomodoro",
    "status": "running",
    "remaining_seconds": 1800,
    "elapsed_overtime_seconds": 0,
    "current_session": 2,
    "total_sessions": 4,
    "break_type": "none",
    "exercise_reminder_due": false,
    "bath_reminder_due": false,
    "current_task_id": "uuid-of-task"
  },
  "schedule": {
    "date": "2026-04-14",
    "day_of_week": 0,
    "events": [
      {"name": "早餐", "start": "08:00", "end": "09:00", "type": "meal"},
      {"name": "高等数学", "start": "10:00", "end": "11:30", "type": "class"},
      {"name": "午餐", "start": "13:00", "end": "14:00", "type": "meal"},
      {"name": "晚餐", "start": "19:00", "end": "20:00", "type": "meal"}
    ]
  },
  "today_summary": {
    "pomodoros_completed": 5,
    "work_minutes": 225,
    "sessions": [
      {"type": "pomodoro", "duration_minutes": 45, "completed_at": "...", "task_id": "..."},
      {"type": "exercise", "duration_minutes": 30, "completed_at": "...", "task_id": null}
    ]
  }
}
```

### `user_status` 字段含义

| 值 | 含义 |
|-----|------|
| `idle` | 空闲，没在计时 |
| `working` | 正在做番茄钟（工作模式） |
| `resting` | 正在休息（短休息/长休息/休闲时间） |
| `meditating` | 正在冥想 |
| `exercising` | 正在运动 |
| `paused` | 暂停中 |

### SSE 事件流

连接 `/api/sync/events?username=xxx` 后：
1. 立即收到一个 `snapshot` 事件（完整初始状态）
2. 之后每次状态变化收到 `timer_change` 或 `schedule_change` 事件
3. 每 30 秒收到一个 keepalive 注释（防止连接超时）

```javascript
const evtSource = new EventSource(
  'http://localhost:15550/api/sync/events?username=guojia',
  { headers: { 'X-Sync-Key': 'clk_sync_...' } }
);

evtSource.addEventListener('snapshot', (e) => {
  const data = JSON.parse(e.data);
  console.log('Initial state:', data.user_status);
});

evtSource.addEventListener('timer_change', (e) => {
  const data = JSON.parse(e.data);
  console.log('Status changed to:', data.user_status);
});
```

---

## 2. PolarClaw 端配置

### 方案 A：通过 PolarClaw 集成适配器（推荐）

在 PolarClaw 的 `apps/integrations/` 下新建 `clock-adapter.mjs`，封装 Clock API 调用。适配器应该：

1. 启动时从环境变量读取配置：
   - `CLOCK_API_URL` — Clock 后端地址（如 `http://localhost:15550`）
   - `CLOCK_SYNC_KEY` — 同步 API Key
2. 提供 `getSnapshot(username)` 和 `subscribeEvents(username, callback)` 方法
3. 注册到 PolarClaw 的工具系统，让龙虾可以主动调用

### 方案 B：通过 PolarClaw 的 proactive 模块

利用 PolarClaw 已有的 `@polarclaw/proactive` 调度器，添加一个定时任务：
- 每分钟轮询 `/api/sync/snapshot`
- 将结果存入 PolarClaw 的 memory 模块
- 龙虾在对话中自动获取用户当前状态

### 用户名映射

PolarClaw 侧需要知道「我的 Clock 用户名是什么」。推荐通过对话设置：

**用户对龙虾说：**
> "记住，我的 Clock 用户名是 guojia"

龙虾应将此信息存入 memory（`clock_username: "guojia"`），后续调用 Clock API 时自动使用。

技术实现：在 PolarClaw 的 memory 或 user profile 中增加 `clock_username` 字段：

```sql
-- PolarClaw users db
ALTER TABLE users ADD COLUMN clock_username TEXT;
```

或者更简单地通过 PolarClaw 的 memory store：

```javascript
await memory.save(userId, 'clock_username', 'guojia');
```

---

## 3. 如何让龙虾了解 Clock 项目

龙虾需要「知道 Clock 是什么、能做什么」才能正确使用 Clock 数据。有三种方式：

### 方式一：通过 PolarClaw Skills（推荐）

在 PolarClaw 的 `skills/` 目录下创建一个 `clock-integration/SKILL.md`：

```markdown
# Clock 集成

## 什么是 Clock
Clock（PolarClock）是一个番茄钟时间管理系统。它追踪用户的工作状态、日程安排和习惯。

## 你能获取什么数据
- 用户当前状态：working / resting / meditating / exercising / idle / paused
- 今日日程：课程、三餐时间
- 今日工作记录：完成了多少番茄钟，工作了多少分钟
- 番茄钟详情：当前是第几个番茄，剩余多少秒

## 如何获取
调用 Clock 同步 API：
- GET {CLOCK_API_URL}/api/sync/snapshot?username={clock_username}
- 需要 X-Sync-Key header

## 使用场景
- 用户问"我今天做了多少"时，查询 today_summary
- 用户状态是 working 时，避免发送非紧急消息打扰
- 用户状态是 idle 超过一定时间时，可以主动关心
- 根据日程安排提醒用户即将有课或该吃饭了
```

### 方式二：通过 PolarClaw Memory 写入项目信息

在龙虾的 memory 中存入关于 Clock 的知识：

```javascript
await memory.save('system', 'project_clock', {
  description: 'PolarClock 番茄钟时间管理系统',
  api_url: process.env.CLOCK_API_URL,
  capabilities: ['user_status', 'schedule', 'work_history', 'timer_state'],
  status_values: ['idle', 'working', 'resting', 'meditating', 'exercising', 'paused'],
});
```

### 方式三：通过对话直接告诉龙虾

最简单的方式 — 直接跟龙虾说：

> "我有一个叫 Clock 的番茄钟系统，运行在 http://localhost:15550。你可以通过 /api/sync/snapshot?username=guojia 获取我的实时状态和日程。API Key 是 xxx。以后当你需要知道我在干什么的时候，就调用这个 API。"

龙虾会把这段话存入长期记忆，之后就能自动使用。

---

## 4. PolarClaw 环境变量配置

在 PolarClaw 的 `.env` 文件中添加：

```env
# Clock 集成
CLOCK_API_URL=http://localhost:15550
CLOCK_SYNC_KEY=clk_sync_xxx   # 从 /api/sync/generate-key 获取
CLOCK_DEFAULT_USERNAME=guojia  # 默认关联的 Clock 用户名
```

---

## 5. 端到端流程示例

```
1. 用户在 Clock 中开始番茄钟
2. Clock 后端更新 timer state → 触发 SSE 推送 timer_change 事件
3. PolarClaw 的 Clock 适配器收到事件，更新内部状态
4. 用户在 Telegram 问龙虾："我今天效率怎么样？"
5. 龙虾调用 Clock API 获取 snapshot
6. 龙虾回复："你今天完成了 5 个番茄钟，工作了 225 分钟，目前正在第 6 个番茄钟的工作中，还剩 28 分钟。下一个是短休息。加油！"
```
