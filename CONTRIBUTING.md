# Contributing to PolarClock

## 开发环境设置

### 前置要求

- Python 3.9+
- Node.js 18+
- npm 9+

### 克隆与启动

```bash
git clone <repo-url> && cd Clock

# 后端
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py                  # http://localhost:15550

# 前端（另一个终端）
cd frontend
npm install
npm run dev                     # http://localhost:4555
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 15550 | 后端端口 |
| `VITE_API_BASE` | `/api` | 前端 API 前缀 |

## 项目结构

```
backend/routers/     → 每个路由模块一个文件，Pydantic model 定义在文件顶部
frontend/src/pages/  → 页面组件，对应路由
frontend/src/stores/ → Zustand store，一个 store 一个文件
frontend/src/utils/  → 纯工具函数，无 React 依赖
frontend/src/i18n/   → 翻译文件，zh.ts / en.ts
```

## 代码规范

### TypeScript (前端)

- 使用函数组件 + hooks
- Store 使用 Zustand `create()` 模式
- 新页面使用 `React.lazy` + `Suspense` 实现代码分割
- 重型组件使用 `React.memo` 优化
- 所有用户可见文本使用 `useTranslation` (i18n)
- CSS 使用 TailwindCSS + CSS variables (`var(--color-*)`)
- 避免 `any` 类型，新增 interface/type 定义

### Python (后端)

- 路由函数使用 FastAPI 装饰器 `@router.get/post/put/delete`
- 请求/响应模型使用 Pydantic `BaseModel`
- 所有端点添加 `summary` 和 `description` 参数
- 用户认证通过 `X-Token` header
- JSON 文件读写使用 `load_*` / `save_*` 辅助函数

### 通用规则

- 不添加纯叙述性注释（如 "导入模块"）
- 只注释非显而易见的意图或约束
- 文件末尾保留空行

## 测试

### 后端 (pytest)

```bash
cd backend
pytest -v                       # 运行所有 50+ 测试
pytest tests/test_timer.py -v   # 单文件
```

测试文件位于 `backend/tests/`，覆盖所有 API 路由。

### 前端 (Vitest)

```bash
cd frontend
npm test                        # 运行所有 25+ 测试
npx vitest run --reporter=verbose
```

测试文件位于 `frontend/src/test/`。

- Store 测试：mock `fetch`，验证状态变更
- 组件测试：mock stores + 依赖，用 `@testing-library/react` render + 断言
- 新组件必须添加对应测试文件

### 写测试的建议

- 使用 `vi.mock()` mock 外部依赖（stores, utils, API）
- 多元素匹配时使用 `getAllByText` 替代 `getByText`
- 每个 `describe` 块的 `beforeEach` 中 `vi.clearAllMocks()`

## PR 工作流

1. **创建分支**: `git checkout -b feat/your-feature`
2. **开发**: 按上述代码规范编写代码
3. **测试**: 确保所有测试通过 (`pytest -v` + `npm test`)
4. **构建验证**: `cd frontend && npx vite build`（无错误）
5. **提交**: 简洁的 commit message，中/英均可
6. **创建 PR**: 描述改动内容和测试方法

### Commit Message 格式

```
feat: 添加环境白噪音功能
fix: 修复备份恢复时的路径问题
test: 补充 Timer 页面组件测试
docs: 更新 README 架构图
```

### PR 检查清单

- [ ] 后端测试通过 (`pytest -v`)
- [ ] 前端测试通过 (`npm test`)
- [ ] 前端构建无错误 (`npx vite build`)
- [ ] 新增 API 端点有 Swagger 文档
- [ ] 新增用户可见文本有 i18n 翻译
- [ ] 无 `console.log` 残留（dev 调试除外）

## API 开发

新增 API 端点步骤：

1. 在 `backend/routers/` 中创建/编辑路由文件
2. 定义 Pydantic 请求/响应模型
3. 添加 `summary` 和 `description` 到装饰器
4. 在 `backend/main.py` 注册路由（如果是新文件）
5. 在 `backend/tests/` 添加测试
6. 在前端 store 中添加 fetch 方法
