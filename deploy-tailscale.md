# Tailscale Funnel 部署指南

## 概述

使用 Tailscale Funnel 将 PolarClock 暴露到外网。
多个项目共享同一台机器的 Funnel，通过「端口号/项目名」的路径结构区分。

## 访问地址

```
https://mac-studio.tail056852.ts.net/4555/clock/
```

登录页：`https://mac-studio.tail056852.ts.net/4555/clock/login`

## 路径结构说明

```
tailscale域名 / 端口号 / 项目名 / 页面
    ↓              ↓        ↓
mac-studio...   4555     clock    /home, /timer, ...
```

- **端口号**（`/4555`）：Tailscale Funnel 的路由规则，转发到 `localhost:4555`
- **项目名**（`/clock`）：App 内部的路由前缀，用于区分同端口下的不同项目
- 注意：Tailscale Funnel **不剥离**路径前缀，完整路径透传给 backend

## 当前 Funnel 路由表

```
https://mac-studio.tail056852.ts.net
|-- /          → localhost:3000
|-- /4555      → localhost:4555  (PolarClock 本项目)
|-- /clawdbot  → localhost:18789
|-- /KnowLever → localhost:8123
```

## 前端配置

### Vite（`frontend/vite.config.ts`）

```ts
base: '/4555/clock/',
```

### React Router（`frontend/src/App.tsx`）

所有路由使用 `/4555/clock/` 前缀：
- `/4555/clock/login`
- `/4555/clock/home`
- `/4555/clock/timer`
- 等...

### PWA Manifest

```ts
start_url: '/4555/clock/home',
scope: '/4555/clock/',
```

## 启动服务

```bash
# 后端
cd backend && python main.py &

# 前端
cd frontend && npm run dev
```

前端监听 4555 端口，Tailscale Funnel 将 `/4555/*` 流量转发至此。

## Funnel 管理命令

```bash
# 查看当前状态
tailscale funnel status

# 添加/更新路径
tailscale funnel --bg --set-path /4555 http://localhost:4555

# 删除路径
tailscale funnel --bg --set-path /4555 off
```

## 验证部署

1. 本地：`http://localhost:4555/4555/clock/login`
2. 外网：`https://mac-studio.tail056852.ts.net/4555/clock/login`

## 故障排除

```bash
tailscale funnel status
lsof -i :4555
lsof -i :15550
```
