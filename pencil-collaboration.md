# Pencil 原型协作指南

## 目标
通过 Pencil 插件进行 UI 原型协作，确保实现前对齐视觉和交互方向。

## 协作流程

1. **我方**：根据需求描述，生成 Pencil 草稿设计说明（详细线框图在 `pencil-prototype.md`）
2. **你方**：在 Pencil 中打开文件，按照线框图绘制页面
3. **协作**：通过 Cursor 对话描述修改，我方更新设计文档
4. **确认**：双方达成一致后，进入实现阶段

## 详细原型文档
👉 参考 `pencil-prototype.md` 获取完整线框图

## 页面清单（路由在 `/clock/*` 下）

| 页面 | 路由 | 优先级 |
|------|------|--------|
| 登录 | `/clock/login` | P0 |
| 首页 | `/clock/home` | P0 |
| 全屏计时器 | `/clock/timer` | P0 |
| 任务管理 | `/clock/tasks` | P0 |
| 任务详情 | `/clock/tasks/:id` | P0 |
| 黑客松 | `/clock/hackathon` | P1 |
| 日程 | `/clock/schedule` | P1 |
| 设置 | `/clock/settings` | P2 |

## 键盘导航约定

所有页面为扁平关系，通过 **左/右方向键** 切换：

```
Home ←→ Timer ←→ Tasks ←→ Hackathon ←→ Schedule ←→ Settings
```

## 组件状态

### Timer 组件
- `idle`：初始状态，显示 45:00
- `running`：倒计时中，数字实时变化
- `paused`：暂停，显示当前时间，闪烁效果
- `finished`：归零，响铃 + 通知

### 任务卡片
- `pending`：默认灰色
- `in_progress`：高亮边框
- `completed`：划线 + 透明

### 甘特图
- 横向：时间轴
- 纵向：任务层级（缩进表示嵌套）
- 拖拽：调整时间/时长/依赖

---

## Pencil 文件使用说明

1. 在 Cursor IDE 所在电脑安装 Pencil 插件（如果需要）
2. 使用 Pencil 新建原型
3. 按照上述页面清单创建页面框架
4. 对齐后，在 Cursor 中描述你的修改

---

## 设计原则

1. **功能性优先**：不是展示型，而是操作型
2. **大字体**：计时器数字要占满屏幕
3. **扁平导航**：不需要面包屑，所有页面平等跳转
4. **暗色主题**：减少视觉疲劳
