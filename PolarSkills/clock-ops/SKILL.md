# Clock — 使用指南

> 番茄钟 + 任务管理 + 甘特图：前后端分离，后端计时避免浏览器休眠

## 核心信息

| 维度 | 值 |
|---|---|
| 健康端点 | 端口 15550（/api/health） |
| 启动命令 | `cd backend && uvicorn main:app --host 0.0.0.0 --port 15550` |
| 安装命令 | `cd backend && pip install -r requirements.txt` |
| 技术栈 | Python FastAPI (后端) + React (前端), JSON 存储 |

## 快速启动

```bash
cd ~/Polarisor/Clock
cd backend && pip install -r requirements.txt
cd backend && uvicorn main:app --host 0.0.0.0 --port 15550
```

## 健康检查

```bash
curl -s http://127.0.0.1:15550/api/health
```

## 依赖服务

- Tailscale Funnel (外部访问)
