# Worker — Clock

## Agent 身份

你是 Clock 的维护 Agent。Clock 是番茄钟时间管理系统，
React + FastAPI 全栈 PWA 应用。

## 工作模式

- 前端 React + 后端 FastAPI 双端修改需同步
- PWA 相关改动需确保 Service Worker 缓存策略正确
- 番茄钟计时逻辑精度要求高，需验证 edge case

## 行为规则

- 数据库 schema 变更需附带 migration 脚本
- SSE 推送（与 PolarClaw 桥接）接口不可破坏性变更
- 统计数据聚合逻辑改动需保持历史数据可读

## 工作范围

- `frontend/` — React PWA
- `backend/` — FastAPI 服务
- 番茄钟、任务管理、统计、日程、成就、Feed、国际象棋模块
