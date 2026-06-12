"""
Clock ↔ PolarClaw 联动同步路由
============================
提供两种数据获取方式:
1. GET /api/sync/snapshot?username=xxx  — 一次性获取用户完整状态快照
2. GET /api/sync/events?username=xxx    — SSE 流，实时推送状态/日程变化

认证: 通过 X-Sync-Key header（服务级 API Key），不依赖用户 session token。
"""

import asyncio
import json
import logging
import os
import time
from datetime import date, datetime
from typing import Optional, Dict, Set

from fastapi import APIRouter, HTTPException, Header, Query
from fastapi.responses import StreamingResponse

from routers.users import load_users, get_user_data_dir
from routers.timer import load_state, get_computed_state
from routers.schedule import load_schedule, _load_meal_settings
from routers.stats import load_history

logger = logging.getLogger("polarclock.sync")

router = APIRouter()

SYNC_KEY_FILE = os.path.join(
    os.environ.get("DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")),
    "sync_key.txt",
)


def _load_sync_key() -> Optional[str]:
    if os.path.exists(SYNC_KEY_FILE):
        with open(SYNC_KEY_FILE, "r") as f:
            return f.read().strip() or None
    return None


def _verify_sync_key(x_sync_key: Optional[str] = Header(None)):
    stored_key = _load_sync_key()
    if stored_key is None:
        return
    if x_sync_key != stored_key:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Sync-Key")


def _resolve_user(username: str) -> dict:
    """Resolve a Clock username to user record. Raises 404 if not found."""
    users = load_users()
    for u in users.values():
        if u["username"] == username:
            return u
    raise HTTPException(status_code=404, detail=f"用户 '{username}' 不存在")


def _derive_user_status(timer_state: dict) -> str:
    """Derive a human-readable status from timer state."""
    status = timer_state.get("status", "idle")
    mode = timer_state.get("mode", "pomodoro")
    break_type = timer_state.get("break_type", "none")

    if status == "idle":
        return "idle"
    if status == "paused":
        return "paused"
    if status != "running":
        return status

    if mode == "meditation":
        return "meditating"
    if mode == "exercise":
        return "exercising"
    if break_type in ("short", "leisure", "long"):
        return "resting"
    return "working"


def _build_snapshot(user: dict) -> dict:
    """Build a complete JSON snapshot for PolarClaw consumption."""
    uid = user["id"]
    username = user["username"]

    timer_state = get_computed_state(uid)
    user_status = _derive_user_status(timer_state)

    today = date.today()
    today_str = today.isoformat()
    dow = today.weekday()
    schedule_data = load_schedule(uid)
    meal_settings = _load_meal_settings(uid)

    today_blocks = []
    for r in schedule_data.get("recurring_rules", []):
        if r["day_of_week"] != dow:
            continue
        eff_from = r.get("effective_from", "")
        eff_until = r.get("effective_until")
        if eff_from and eff_from > today_str:
            continue
        if eff_until and eff_until < today_str:
            continue
        today_blocks.append({
            "id": r["id"],
            "name": r["name"],
            "start": r["start_hhmm"],
            "end": r["end_hhmm"],
            "type": "class",
        })

    meal_windows = [
        {"name": "早餐", "start": meal_settings["breakfast_start"],
         "end": meal_settings["breakfast_latest_start"], "type": "meal"},
        {"name": "午餐", "start": meal_settings["lunch_start"],
         "end": meal_settings["lunch_latest_finish"], "type": "meal"},
        {"name": "晚餐", "start": meal_settings["dinner_start"],
         "end": meal_settings["dinner_latest_finish"], "type": "meal"},
    ]

    all_events = sorted(today_blocks + meal_windows, key=lambda e: e["start"])

    history_records = load_history(uid)
    today_history = [
        r for r in history_records
        if r.get("completed_at", "").startswith(today_str)
    ]

    today_pomodoros = sum(1 for r in today_history if r.get("type") == "pomodoro")
    today_work_minutes = sum(
        r.get("duration_minutes", 0) for r in today_history
        if r.get("type") == "pomodoro"
    )

    return {
        "clock_username": username,
        "clock_user_id": uid,
        "generated_at": datetime.now().isoformat(),
        "user_status": user_status,
        "timer": {
            "mode": timer_state.get("mode"),
            "status": timer_state.get("status"),
            "remaining_seconds": timer_state.get("remaining_seconds"),
            "elapsed_overtime_seconds": timer_state.get("elapsed_overtime_seconds"),
            "current_session": timer_state.get("current_session"),
            "total_sessions": timer_state.get("total_sessions"),
            "break_type": timer_state.get("break_type"),
            "exercise_reminder_due": timer_state.get("exercise_reminder_due"),
            "bath_reminder_due": timer_state.get("bath_reminder_due"),
            "current_task_id": timer_state.get("current_task_id"),
        },
        "schedule": {
            "date": today_str,
            "day_of_week": dow,
            "events": all_events,
        },
        "today_summary": {
            "pomodoros_completed": today_pomodoros,
            "work_minutes": today_work_minutes,
            "sessions": [
                {
                    "type": r.get("type"),
                    "duration_minutes": r.get("duration_minutes"),
                    "completed_at": r.get("completed_at"),
                    "task_id": r.get("task_id"),
                }
                for r in today_history
            ],
        },
    }


# ── SSE subscriber registry ──────────────────────────────────────────────────

_sse_subscribers: Dict[str, Set[asyncio.Queue]] = {}


async def notify_sync_subscribers(user_id: str, event_type: str, data: dict):
    """Called from timer/schedule routers when state changes."""
    queues = _sse_subscribers.get(user_id, set())
    dead = set()
    for q in queues:
        try:
            q.put_nowait({"event": event_type, "data": data})
        except asyncio.QueueFull:
            dead.add(q)
    _sse_subscribers.get(user_id, set()).difference_update(dead)


def register_sse_subscriber(user_id: str) -> asyncio.Queue:
    queue = asyncio.Queue(maxsize=64)
    _sse_subscribers.setdefault(user_id, set()).add(queue)
    return queue


def unregister_sse_subscriber(user_id: str, queue: asyncio.Queue):
    subs = _sse_subscribers.get(user_id, set())
    subs.discard(queue)
    if not subs:
        _sse_subscribers.pop(user_id, None)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/snapshot",
    summary="获取用户完整状态快照",
    description="PolarClaw 调用此端点获取指定用户的实时状态、今日日程、工作记录。",
)
def get_snapshot(
    username: str = Query(..., description="Clock 用户名"),
    x_sync_key: Optional[str] = Header(None),
):
    _verify_sync_key(x_sync_key)
    user = _resolve_user(username)
    return _build_snapshot(user)


@router.get(
    "/users",
    summary="获取所有用户列表",
    description="PolarClaw 用于发现可用的 Clock 用户，做用户名映射。",
)
def list_sync_users(x_sync_key: Optional[str] = Header(None)):
    _verify_sync_key(x_sync_key)
    users = load_users()
    return [
        {"username": u["username"], "user_id": u["id"], "created_at": u["created_at"]}
        for u in users.values()
    ]


@router.get(
    "/events",
    summary="SSE 实时事件流",
    description="订阅指定用户的状态变化。事件类型: timer_change, schedule_change, session_complete",
)
async def sse_events(
    username: str = Query(..., description="Clock 用户名"),
    x_sync_key: Optional[str] = Header(None),
):
    _verify_sync_key(x_sync_key)
    user = _resolve_user(username)
    uid = user["id"]

    queue = register_sse_subscriber(uid)

    async def event_generator():
        try:
            initial = _build_snapshot(user)
            yield f"event: snapshot\ndata: {json.dumps(initial, ensure_ascii=False)}\n\n"

            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                    event_type = msg.get("event", "update")
                    payload = json.dumps(msg.get("data", {}), ensure_ascii=False)
                    yield f"event: {event_type}\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield f": keepalive\n\n"
        finally:
            unregister_sse_subscriber(uid, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/generate-key",
    summary="生成/重置同步 API Key",
    description="生成一个新的服务级 API Key 用于 PolarClaw 集成。需要管理员 token。",
)
def generate_sync_key(x_token: Optional[str] = Header(None)):
    from routers.users import get_current_user
    user = get_current_user(x_token)
    if user["username"] != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可生成同步密钥")

    import secrets
    new_key = f"clk_sync_{secrets.token_urlsafe(32)}"
    os.makedirs(os.path.dirname(SYNC_KEY_FILE), exist_ok=True)
    with open(SYNC_KEY_FILE, "w") as f:
        f.write(new_key)
    logger.info("Sync API key regenerated by admin")
    return {"sync_key": new_key, "note": "请妥善保管，将此 key 配置到 PolarClaw 的环境变量中"}
