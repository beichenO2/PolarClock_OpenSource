"""
PolarClock 后端入口
===================
正常启动：  python main.py
开发者模式：python main.py --dev-mode

开发者模式会额外挂载 /api/dev/* 路由，用于测试时快速推进时间相关功能。
开发者模式下会在启动日志中打印明显警告。正常用户启动时此路由完全不可见。
"""

import sys
import argparse
import time
import logging
import platform
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from routers import timer, tasks, schedule, users, stats, history, habits, backup, achievements, sync
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# ── Parse CLI args ─────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="PolarClock Backend")
parser.add_argument(
    "--dev-mode",
    action="store_true",
    default=False,
    help="启用开发者模式：加载 /api/dev/* 测试路由（仅测试使用，勿在生产环境启用）",
)
parser.add_argument("--host", default="0.0.0.0", help="监听地址")
parser.add_argument("--port", type=int, default=15550, help="监听端口")

# Only parse known args so uvicorn reload flags don't break things
args, _ = parser.parse_known_args()

DEV_MODE: bool = args.dev_mode

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))
os.makedirs(DATA_DIR, exist_ok=True)
_startup_logger = logging.getLogger("polarclock")


def _migrate_user_data_dirs():
    """Migrate from old data/users/{user_id}/ layout to data/{username}/ layout."""
    import shutil
    import json as _json

    old_users_dir = os.path.join(DATA_DIR, "users")
    if not os.path.isdir(old_users_dir):
        return

    users_file = os.path.join(DATA_DIR, "users.json")
    if not os.path.exists(users_file):
        return

    try:
        with open(users_file, "r") as f:
            users = _json.load(f)
    except (ValueError, _json.JSONDecodeError):
        return

    migrated = 0
    for entry in os.listdir(old_users_dir):
        old_path = os.path.join(old_users_dir, entry)
        if not os.path.isdir(old_path):
            continue
        user = users.get(entry)
        if not user:
            continue
        username = user["username"]
        new_path = os.path.join(DATA_DIR, username)
        if os.path.exists(new_path):
            continue
        shutil.move(old_path, new_path)
        migrated += 1

    try:
        if not os.listdir(old_users_dir):
            os.rmdir(old_users_dir)
    except OSError:
        pass

    if migrated:
        _startup_logger.info("Migrated %d user data directories to data/{username}/ layout", migrated)


@asynccontextmanager
async def lifespan(application: FastAPI):
    _migrate_user_data_dirs()
    data_ok = os.path.isdir(DATA_DIR) and os.access(DATA_DIR, os.W_OK)
    _startup_logger.info(
        "PolarClock %s starting — Python %s, data_dir=%s (writable=%s), dev_mode=%s",
        application.version, platform.python_version(), DATA_DIR, data_ok, DEV_MODE,
    )
    if not data_ok:
        _startup_logger.warning("Data directory is NOT writable — persistence will fail!")
    yield


# ── App setup ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="PolarClock API",
    version="1.1.0",
    description="PolarClock 番茄钟生产力系统后端 API" + (" [DEV MODE]" if DEV_MODE else ""),
    lifespan=lifespan,
    openapi_tags=[
        {"name": "users", "description": "用户注册、登录、偏好设置"},
        {"name": "timer", "description": "番茄钟计时引擎、WebSocket 实时状态"},
        {"name": "tasks", "description": "任务 CRUD、标签、甘特图数据"},
        {"name": "schedule", "description": "日程编排、三餐时间、课程 Block"},
        {"name": "stats", "description": "统计面板、热力图、数据导出"},
        {"name": "history", "description": "番茄钟/运动/冥想历史记录"},
        {"name": "habits", "description": "习惯追踪与自动打卡"},
        {"name": "backup", "description": "数据备份与恢复"},
        {"name": "achievements", "description": "成就系统与进度追踪"},
        {"name": "sync", "description": "外部系统同步（PolarClaw 集成）"},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Allow all origins for Tailscale Funnel access
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("polarclock")


@app.middleware("http")
async def request_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time"] = f"{elapsed_ms:.1f}ms"
    if not request.url.path.startswith("/api/health"):
        logger.info(
            "%s %s → %d (%.1fms)",
            request.method, request.url.path, response.status_code, elapsed_ms,
        )
    return response


# ── Unified error handling (REQ-402) ─────────────────────────────────────────
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    code_map = {
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        400: "BAD_REQUEST",
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "code": code_map.get(exc.status_code, f"HTTP_{exc.status_code}"),
            "message": exc.detail,
            "path": str(request.url.path),
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": True,
            "code": "VALIDATION_ERROR",
            "message": "请求参数验证失败",
            "detail": exc.errors(),
            "path": str(request.url.path),
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    try:
        from adapters.polarclaw import emit_bug
        emit_bug(
            message=str(exc),
            component="api",
            operation=f"unhandled:{request.url.path}",
            error=str(exc)[:300],
        )
    except Exception:
        pass
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "code": "INTERNAL_ERROR",
            "message": "服务器内部错误",
            "detail": str(exc) if DEV_MODE else None,
            "path": str(request.url.path),
        },
    )


# ── Standard routers ───────────────────────────────────────────────────────────
app.include_router(users.router,     prefix="/api/users",     tags=["users"])
app.include_router(timer.router,     prefix="/api/timer",     tags=["timer"])
app.include_router(tasks.router,     prefix="/api/tasks",     tags=["tasks"])
app.include_router(schedule.router,  prefix="/api/schedule",  tags=["schedule"])
app.include_router(stats.router,     prefix="/api/stats",     tags=["stats"])
app.include_router(history.router,   prefix="/api/history",   tags=["history"])
app.include_router(habits.router,    prefix="/api/habits",    tags=["habits"])
app.include_router(backup.router,    prefix="/api/backup",    tags=["backup"])
app.include_router(achievements.router, prefix="/api/achievements", tags=["achievements"])
app.include_router(sync.router,         prefix="/api/sync",         tags=["sync"])


# ── PolarClaw Lobster SDK Adapter endpoints ───────────────────────────────────
@app.get("/api/lobster/status", tags=["lobster"])
async def lobster_status():
    from adapters.polarclaw import get_status
    return get_status()


@app.get("/api/lobster/health", tags=["lobster"])
async def lobster_health():
    from adapters.polarclaw import run_health_check
    result = run_health_check()
    status_code = 200 if result["healthy"] else 503
    return JSONResponse(status_code=status_code, content=result)


@app.post("/api/lobster/test", tags=["lobster"])
async def lobster_test():
    from adapters.polarclaw import run_target_test
    result = run_target_test()
    status_code = 200 if result["passed"] else 500
    return JSONResponse(status_code=status_code, content=result)


# ── Dev-mode router (only when --dev-mode is passed) ──────────────────────────
if DEV_MODE:
    from routers import devmode
    app.include_router(devmode.router, prefix="/api/dev", tags=["🛠️ dev-mode"])
    print("\n" + "=" * 60)
    print("  ⚠️   开发者模式已启用 (DEV MODE ACTIVE)")
    print("  ⚠️   /api/dev/* 路由已加载")
    print("  ⚠️   请勿在生产环境使用此模式")
    print("=" * 60 + "\n")


@app.get("/api/health")
def health_check():
    data_ok = os.path.isdir(DATA_DIR) and os.access(DATA_DIR, os.W_OK)
    from routers.users import load_users
    user_count = len(load_users()) if data_ok else 0
    return {
        "status": "ok" if data_ok else "degraded",
        "dev_mode": DEV_MODE,
        "version": app.version,
        "data_writable": data_ok,
        "user_count": user_count,
    }


# ── External service reverse proxies ──────────────────────────────────────────
import httpx

_PROXY_ROUTES = {
    "/digist-api": os.environ.get("DIGIST_API_URL", "http://127.0.0.1:3800"),
    "/gw/knowlever-rag": os.environ.get("KNOWLEVER_RAG_URL", "http://127.0.0.1:18080"),
}

_proxy_client = httpx.AsyncClient(timeout=30.0, follow_redirects=True, trust_env=False)


@app.api_route("/digist-api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
@app.api_route("/gw/knowlever-rag/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def _reverse_proxy(request: Request, path: str):
    for prefix, target in _PROXY_ROUTES.items():
        if request.url.path.startswith(prefix):
            upstream_url = f"{target}/{path}"
            if request.url.query:
                upstream_url += f"?{request.url.query}"
            headers = {
                k: v for k, v in request.headers.items()
                if k.lower() not in ("host", "connection", "transfer-encoding")
            }
            try:
                body = await request.body()
                resp = await _proxy_client.request(
                    method=request.method,
                    url=upstream_url,
                    headers=headers,
                    content=body if body else None,
                )
                excluded = {"transfer-encoding", "connection", "content-encoding", "content-length"}
                resp_headers = {
                    k: v for k, v in resp.headers.items()
                    if k.lower() not in excluded
                }
                from starlette.responses import Response
                return Response(
                    content=resp.content,
                    status_code=resp.status_code,
                    headers=resp_headers,
                )
            except httpx.ConnectError:
                return JSONResponse(
                    {"error": True, "code": "UPSTREAM_UNAVAILABLE", "message": f"Service at {target} is not running"},
                    status_code=502,
                )
            except httpx.TimeoutException:
                return JSONResponse(
                    {"error": True, "code": "UPSTREAM_TIMEOUT", "message": f"Service at {target} timed out"},
                    status_code=504,
                )
    return JSONResponse({"error": True, "code": "NO_PROXY_MATCH"}, status_code=500)


_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIST / "assets")), name="static-assets")

    def _safe_dist_file(relative_path: str):
        candidate = (_FRONTEND_DIST / relative_path.lstrip("/")).resolve()
        try:
            candidate.relative_to(_FRONTEND_DIST.resolve())
        except ValueError:
            return None
        return candidate if candidate.is_file() else None

    @app.get("/{full_path:path}")
    async def _spa_catchall(full_path: str):
        direct_file = _safe_dist_file(full_path)
        if direct_file is not None:
            return FileResponse(str(direct_file))

        if full_path.startswith("clock/"):
            clock_file = _safe_dist_file(full_path[len("clock/"):])
            if clock_file is not None:
                return FileResponse(str(clock_file))

        index = _FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return JSONResponse({"error": "frontend not built"}, 404)


if __name__ == "__main__":
    import uvicorn
    port = args.port
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'PolarPort', 'src', 'sdk', 'python'))
        from polarisor_port_sdk import claim_port_sync, register_capabilities_sync
        port = claim_port_sync(service="polarclock", project="Clock", preferred=args.port)

        cap_path = os.path.join(os.path.dirname(__file__), '..', 'capabilities.json')
        if os.path.exists(cap_path):
            try:
                register_capabilities_sync(cap_path)
            except Exception as e:
                print(f"[Clock] capability registration failed (non-fatal): {e}")
    except Exception as e:
        print(f"[Clock] PolarPort SDK unavailable, using default port {port}: {e}")

    uvicorn.run(
        app,
        host=args.host,
        port=port,
        log_level="info",
    )
