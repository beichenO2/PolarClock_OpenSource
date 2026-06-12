"""
开发者模式路由 — DEV MODE ONLY
=====================================
仅在后端以 --dev-mode 参数启动时，才会挂载此路由。
正常启动时此文件中的路由完全不暴露，普通用户无法访问。

用途：测试时快速推进时间相关功能，例如：
  - 快速完成一个番茄钟（跳过等待时间）
  - 快速注入历史统计记录（模拟多天工作）
  - 重置计时器到特定状态
  - 偏移统计数据的时间戳（模拟几天后的数据）
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime, timedelta
import logging
import os
import json

from routers.users import get_user_data_dir

router = APIRouter()
logger = logging.getLogger("polarclock.devmode")

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data"))
STATE_FILE = os.path.join(DATA_DIR, "timer_state.json")
STATS_FILE = os.path.join(DATA_DIR, "stats.json")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _load_json(path: str, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return default


def _save_json(path: str, data):
    from routers import atomic_json_write
    atomic_json_write(path, data, indent=2, ensure_ascii=False)


# ── /dev/status ────────────────────────────────────────────────────────────────

@router.get("/status")
def dev_status():
    """Confirm dev mode is active."""
    return {
        "dev_mode": True,
        "message": "🛠️  开发者模式已启用 — 勿在生产环境使用",
        "endpoints": [
            "POST /api/dev/timer/fast-complete   快速完成当前番茄钟",
            "POST /api/dev/timer/reset           重置计时器到 idle",
            "POST /api/dev/timer/fast-start      以极短时间（5s）启动番茄钟，便于测试超时",
            "POST /api/dev/stats/inject          注入历史统计数据（模拟多天工作）",
            "POST /api/dev/stats/reset           清空统计数据",
            "GET  /api/dev/status                本状态页",
        ],
    }


# ── /dev/timer/fast-complete ───────────────────────────────────────────────────

@router.post("/timer/fast-complete")
async def dev_fast_complete(task_id: Optional[str] = None, user_id: Optional[str] = None):
    """
    快速完成一个番茄钟：
    1. 把计时器状态设为"刚刚完成的番茄"
    2. 调用 complete_session 逻辑，往 stats 里注入一条完整番茄记录
    3. 同步更新任务的 pomodor_completed
    """
    state = _load_json(STATE_FILE, {})

    duration_minutes = state.get("work_duration_minutes", 45)
    if task_id is None:
        task_id = state.get("current_task_id")

    uid = user_id or "dev-user"
    from routers.stats import record_completion
    record_completion(
        user_id=uid,
        record_type="pomodoro",
        duration_minutes=duration_minutes,
        task_id=task_id,
    )

    if task_id:
        from routers.tasks import load_tasks, save_tasks
        tasks = load_tasks(uid)
        if task_id in tasks:
            tasks[task_id]["pomodor_completed"] = tasks[task_id].get("pomodor_completed", 0) + 1
            save_tasks(uid, tasks)

    state["status"] = "idle"
    state["started_at"] = None
    state["works_since_leisure"] = state.get("works_since_leisure", 0) + 1
    state["works_since_exercise"] = state.get("works_since_exercise", 0) + 1
    state["current_session"] = state.get("current_session", 1) + 1
    state["remaining_seconds"] = duration_minutes * 60
    state["break_type"] = "none"
    _save_json(STATE_FILE, state)

    try:
        from routers.timer import broadcast_state_to_user
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(broadcast_state_to_user(uid))
    except Exception as e:
        logger.warning("dev broadcast failed for user %s: %s", uid, e)

    return {
        "ok": True,
        "message": f"✅ 已注入一个完整番茄钟记录（{duration_minutes} 分钟）",
        "task_id": task_id,
        "total_injected_session": state["current_session"] - 1,
    }


# ── /dev/timer/fast-start ──────────────────────────────────────────────────────

class FastStartRequest(BaseModel):
    duration_seconds: int = 5  # 默认 5 秒后就触发"番茄结束"
    task_id: Optional[str] = None

@router.post("/timer/fast-start")
async def dev_fast_start(req: FastStartRequest):
    """
    用极短时长（默认 5 秒）启动番茄钟，方便测试"番茄计时结束"流程。
    """
    state = _load_json(STATE_FILE, {})
    state["mode"] = "pomodoro"
    state["status"] = "running"
    state["remaining_seconds"] = req.duration_seconds
    state["started_at"] = datetime.now().isoformat()
    state["elapsed_overtime_seconds"] = 0
    if req.task_id:
        state["current_task_id"] = req.task_id
    _save_json(STATE_FILE, state)

    try:
        from routers.timer import broadcast_state_to_user
        import asyncio
        asyncio.create_task(broadcast_state_to_user("dev-user"))
    except Exception as e:
        logger.warning("dev broadcast failed: %s", e)

    return {
        "ok": True,
        "message": f"⏱️  已以 {req.duration_seconds} 秒时长启动番茄钟，{req.duration_seconds} 秒后自动触发结束",
    }


# ── /dev/timer/reset ───────────────────────────────────────────────────────────

@router.post("/timer/reset")
async def dev_reset_timer():
    """强制重置计时器到初始 idle 状态。"""
    default_state = {
        "mode": "pomodoro",
        "status": "idle",
        "remaining_seconds": 2700,
        "elapsed_overtime_seconds": 0,
        "current_session": 1,
        "total_sessions": 4,
        "started_at": None,
        "current_task_id": None,
        "work_duration_minutes": 45,
        "short_break_minutes": 10,
        "leisure_break_minutes": 15,
        "long_break_minutes": 15,
        "break_type": "none",
        "works_since_leisure": 0,
        "works_since_exercise": 0,
        "exercise_reminder_due": False,
        "bath_reminder_due": False,
        "exercise_type": "boxing",
    }
    _save_json(STATE_FILE, default_state)

    try:
        from routers.timer import broadcast_state_to_user
        import asyncio
        asyncio.create_task(broadcast_state_to_user("dev-user"))
    except Exception as e:
        logger.warning("dev broadcast failed: %s", e)

    return {"ok": True, "message": "🔄 计时器已重置为初始状态"}


# ── /dev/stats/inject ──────────────────────────────────────────────────────────

class InjectStatsRequest(BaseModel):
    days_back: int = 0          # 0=今天, 1=昨天, 2=前天……
    count: int = 4              # 注入几个番茄
    duration_minutes: int = 45  # 每个番茄时长
    task_id: Optional[str] = None

@router.post("/stats/inject")
def dev_inject_stats(req: InjectStatsRequest):
    """
    批量注入历史番茄记录，用于测试热力图、趋势图等跨日统计功能。

    例：days_back=3, count=6 → 三天前注入 6 个番茄记录
    """
    stats = _load_json(STATS_FILE, {"history": [], "daily_goals": {}})
    if "history" not in stats:
        stats["history"] = []

    target_date = datetime.now() - timedelta(days=req.days_back)

    import uuid
    for i in range(req.count):
        # Spread across the day: 09:00, 10:00, 11:00... etc.
        hour = 9 + (i % 9)
        completed_at = target_date.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()
        record = {
            "id": str(uuid.uuid4()),
            "type": "pomodoro",
            "duration_minutes": req.duration_minutes,
            "completed_at": completed_at,
            "is_partial": False,
        }
        if req.task_id:
            record["task_id"] = req.task_id
        stats["history"].append(record)

    _save_json(STATS_FILE, stats)
    return {
        "ok": True,
        "message": f"✅ 已注入 {req.count} 条番茄记录到 {req.days_back} 天前（{target_date.strftime('%Y-%m-%d')}）",
        "total_records": len(stats["history"]),
    }


# ── /dev/stats/reset ───────────────────────────────────────────────────────────

@router.post("/stats/reset")
def dev_reset_stats():
    """清空所有统计历史记录（危险！仅测试用）。"""
    _save_json(STATS_FILE, {"history": [], "daily_goals": {}})
    return {"ok": True, "message": "🗑️  统计数据已清空"}
