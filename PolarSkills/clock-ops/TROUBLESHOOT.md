# Clock — 故障排查

> 番茄钟 + 任务管理 + 甘特图：前后端分离，后端计时避免浏览器休眠

## 健康检查

```bash
# 进程存活
pgrep -f "Clock" || echo "NOT RUNNING"

# HTTP 端点
curl -s http://127.0.0.1:15550/api/health
```

## 关键端口

| 端口 | 说明 |
|---|---|
| 15550 | Clock 主服务 |

## 常见故障

### 1. 计时不准

**修复**：`确认后端进程存活，前端只做展示`

### 2. PWA 缓存过期

**修复**：`清除 Service Worker: chrome://serviceworker-internals`

### 3. Tailscale Funnel 不通

**修复**：`tailscale funnel status 检查`

## 依赖服务

- Tailscale Funnel (外部访问)

## 紧急恢复

```bash
cd ~/Polarisor/Clock
cd backend && uvicorn main:app --host 0.0.0.0 --port 15550
curl -s http://127.0.0.1:15550/api/health && echo 'OK' || echo 'BROKEN'
```
