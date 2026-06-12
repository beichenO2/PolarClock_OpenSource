# Roadmap

## Done（已完成）✅

### Phase 0: 基础设施
- [x] 初始化前后端项目结构
- [x] 配置 Tailscale Funnel 部署
- [x] 配置开发环境热重载

### Phase 2: 核心番茄钟
- [x] 实现后端计时引擎（防休眠）
- [x] 实现前端全屏时钟 UI
- [x] 实现浏览器 Notification + 音频通知
- [x] 实现番茄钟 → 短休息 → 长休息循环
- [x] 实现15分钟休闲时间（每2个工作番茄后）
- [x] 实现4工作番茄后运动提醒
- [x] 实现运动计时+超时+洗澡提醒

### Phase 3: 任务管理
- [x] 任务 CRUD API + JSON 存储
- [x] 甘特图组件（无限嵌套子任务，可选）
- [x] 多层级甘特图（总体 → 项目 → 子任务）
- [x] 甘特图层级间跳转与联动
- [x] 甘特图拖拽移动/调整大小（start_date/end_date 持久化）
- [x] 二象限 "Last Thing to Do" 整数排序可视化
- [x] Deadline 48h 自动优先级提升

### Phase 4: 黑客松模式
- [x] 黑客松项目创建（主题 + 子项目）
- [x] 黑客松独占甘特图
- [x] 点击时间块选择任务（非新建）
- [x] 黑客松完成 → 归档到历史黑客松

### Phase 5: 日程编排
- [x] 一日三餐时间设置
- [x] 吃饭时间自动空出逻辑（提前1小时提醒点外卖）
- [x] 课程 Block 管理

### Phase 6: 健康管理
- [x] 4 工作番茄后运动提醒
- [x] 运动计时（拳击/跑步，可超时）
- [x] 运动后洗澡提醒

### Phase 7: 多用户
- [x] 用户创建（仅用户名）
- [x] 用户登录
- [x] 用户数据隔离

---

## In Progress（进行中）

### Phase 8: UI/UX 打磨（后端部分完成）
- [x] REQ-102 暗色模式用户偏好 API（GET/PUT /api/users/preferences）
- [ ] REQ-101 响应式设计（前端）
- [ ] REQ-103 番茄钟页面动画优化（前端）
- [ ] REQ-104 统一设计语言（前端）

### Phase 9: 数据统计面板（后端完成）
- [x] REQ-201 番茄钟历史记录（record_completion + GET /api/stats/recent）
- [x] REQ-202 统计面板 API（today/weekly/monthly/heatmap）
- [x] REQ-203 任务完成率追踪 API（GET /api/stats/task-completion）
- [x] REQ-204 数据导出 JSON/CSV（GET /api/stats/export）
- [ ] 前端统计面板 UI 组件

### Phase 10: 功能增强（后端完成）
- [x] REQ-301 自定义番茄钟时长（PUT /api/timer/settings）
- [x] REQ-302 标签系统（tasks tags + GET /api/tasks/meta/tags）
- [x] REQ-303 声音自定义（完整前后端：上传/列表/删除/偏好 API + 前端统一播放路径 + Settings UI + capabilities 登记）
- [x] REQ-304 番茄钟与任务关联（current_task_id + record_completion）
- [ ] 前端标签设置 UI

### Phase 11: 技术改进（部分完成）
- [x] REQ-401 后端单元测试（97 tests passing, 全 API 端点 100% 覆盖 + 4 个端到端集成测试）
- [x] REQ-402 API 统一错误响应格式（HTTPException/ValidationError handlers）
- [ ] REQ-403 前端性能优化（懒加载、甘特图渲染）

### Phase 13: PolarClaw 联动集成
- [x] /api/sync/snapshot — 用户完整状态快照（timer + schedule + today work）
- [x] /api/sync/events — SSE 实时推送（timer_change / schedule_change）
- [x] /api/sync/users — 用户列表接口
- [x] /api/sync/generate-key — 服务级 API Key 管理
- [x] Timer/Schedule 变更自动通知 SSE 订阅者
- [x] 集成文档（docs/polarclaw-integration.md）

### Phase 13b: Feed 信息消费工作台
- [x] 推荐 Tab：KnowLever 动态报告优先 + 降级 digest-feed/wiki；刷新收集 vs 重新编译分离
- [x] 视频 Tab：自动消化 digist、`local_play_url` 站内 `<video>`
- [x] 信息源 Tab：digist `/api/sources`，权重 → `/api/recommend?weights=`
- [x] 不感兴趣原因枚举 · `POST /api/feedback` 契约占位

### Phase 12: PWA 离线支持
- [x] REQ-501 Service Worker 离线缓存（静态资源 CacheFirst、API NetworkFirst、字体运行时缓存）
- [x] 离线状态恢复与重连后同步队列（Timer 状态缓存 + online flush）
- [x] REQ-503 PWA 安装与更新提示（主屏安装提示 + SW 更新提示）
