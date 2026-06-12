# Clock — 部署指南

> 番茄钟 + 任务管理 + 甘特图：前后端分离，后端计时避免浏览器休眠

## 环境要求

- 技术栈：Python FastAPI (后端) + React (前端), JSON 存储
- 安装：`cd backend && pip install -r requirements.txt`

## 安装步骤

```bash
cd ~/Polarisor/Clock
cd backend && pip install -r requirements.txt
```

## 启动方式

```bash
cd ~/Polarisor/Clock
cd backend && uvicorn main:app --host 0.0.0.0 --port 15550
```

## 端口分配

| 端口 | 用途 |
|---|---|
| 15550 | 主服务 |

## 健康检查确认

```bash
curl -s http://127.0.0.1:15550/api/health
```

## 回滚方式

```bash
cd ~/Polarisor/Clock
git log --oneline -5
git checkout <previous-commit>
cd backend && pip install -r requirements.txt
cd backend && uvicorn main:app --host 0.0.0.0 --port 15550
```
