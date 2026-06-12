from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, Literal, Set, Dict
from datetime import datetime
import asyncio
import time
import threading
import os
import json
import logging

from routers.users import get_current_user, get_user_data_dir

logger = logging.getLogger("polarclock.timer")

router = APIRouter()

# ── Per-user WebSocket connections ────────────────────────────────────────────
# Dict[user_id -> Set[WebSocket]]
_user_connections: Dict[str, Set[WebSocket]] = {}

# Per-user ticker tasks
_user_tickers: Dict[str, asyncio.Task] = {}

_lock = threading.Lock()


def _get_state_file(user_id: str) -> str:
    return os.path.join(get_user_data_dir(user_id), "timer_state.json")


# --- Timer State Model ---
class TimerState(BaseModel):
    mode: Literal["pomodoro", "exercise", "meditation"] = "pomodoro"
    status: Literal["idle", "running", "paused", "finished"] = "idle"
    remaining_seconds: int = 2700
    elapsed_overtime_seconds: int = 0
    current_session: int = 1
    total_sessions: int = 4
    started_at: Optional[str] = None
    current_task_id: Optional[str] = None
    work_duration_minutes: int = 45
    meditation_duration_minutes: int = 20
    short_break_minutes: int = 10
    leisure_break_minutes: int = 15
    long_break_minutes: int = 15
    break_type: Literal["none", "short", "leisure", "long"] = "none"
    works_since_leisure: int = 0
    works_since_exercise: int = 0
    exercise_reminder_due: bool = False
    bath_reminder_due: bool = False
    exercise_type: Literal["boxing", "running"] = "boxing"
    exercise_phase: Literal["none", "exercise", "rest", "shower"] = "none"


class TimerStartRequest(BaseModel):
    mode: Literal["pomodoro", "exercise", "meditation"] = "pomodoro"
    work_duration_minutes: Optional[int] = None
    task_id: Optional[str] = None


class ExerciseConfig(BaseModel):
    exercise_type: Literal["boxing", "running"] = "boxing"
    planned_duration_minutes: int = Field(30, ge=5, le=180)
    overtime_enabled: bool = True


class TimerSettingsUpdate(BaseModel):
    work_duration_minutes: Optional[int] = Field(None, ge=1, le=180)
    short_break_minutes: Optional[int] = Field(None, ge=1, le=60)
    leisure_break_minutes: Optional[int] = Field(None, ge=1, le=120)
    long_break_minutes: Optional[int] = Field(None, ge=1, le=120)


class BreakStartRequest(BaseModel):
    break_type: Literal["short", "leisure", "long"] = "short"


class SwitchTaskRequest(BaseModel):
    task_id: Optional[str] = None


class SoundPreferences(BaseModel):
    work_end_sound: Optional[str] = "default"
    rest_end_sound: Optional[str] = "default"
    meditation_end_sound: Optional[str] = "default"
    volume: Optional[int] = 100  # 0-100


# ── Per-user state helpers ────────────────────────────────────────────────────

def load_state(user_id: str) -> dict:
    state_file = _get_state_file(user_id)
    if not os.path.exists(state_file):
        return TimerState().model_dump()
    try:
        with open(state_file, "r") as f:
            state = json.load(f)
    except (json.JSONDecodeError, ValueError):
        return TimerState().model_dump()
    defaults = TimerState().model_dump()
    for key, value in defaults.items():
        if key not in state:
            state[key] = value
    return state


def save_state(user_id: str, state: dict):
    from routers import atomic_json_write
    atomic_json_write(_get_state_file(user_id), state, indent=2)


def get_computed_state(user_id: str) -> dict:
    state = load_state(user_id)
    if state["status"] == "running" and state["started_at"]:
        elapsed = int(time.time() - datetime.fromisoformat(state["started_at"]).timestamp())
        remaining = state["remaining_seconds"] - elapsed
        if remaining <= 0:
            exercise_phase = state.get("exercise_phase", "none")
            allow_overtime = (state["mode"] == "exercise" and exercise_phase == "exercise")
            if allow_overtime:
                state["remaining_seconds"] = 0
                state["elapsed_overtime_seconds"] = abs(remaining)
            else:
                state["remaining_seconds"] = 0
                state["elapsed_overtime_seconds"] = 0
        else:
            state["remaining_seconds"] = remaining
            state["elapsed_overtime_seconds"] = 0
    return state


# ── Per-user WebSocket management ─────────────────────────────────────────────

async def broadcast_state_to_user(user_id: str):
    conns = _user_connections.get(user_id, set())
    if not conns:
        return
    state = get_computed_state(user_id)
    dead = set()
    for ws in conns:
        try:
            await ws.send_json(state)
        except Exception:
            dead.add(ws)
    conns.difference_update(dead)


async def _user_ticker(user_id: str):
    while True:
        await asyncio.sleep(1)
        conns = _user_connections.get(user_id, set())
        if conns:
            await broadcast_state_to_user(user_id)
        else:
            # No connections — stop ticker to save resources
            _user_tickers.pop(user_id, None)
            return


def _ensure_ticker(user_id: str, loop: asyncio.AbstractEventLoop):
    task = _user_tickers.get(user_id)
    if task is None or task.done():
        _user_tickers[user_id] = loop.create_task(_user_ticker(user_id))


async def save_and_broadcast(user_id: str, state: dict):
    save_state(user_id, state)
    await broadcast_state_to_user(user_id)
    try:
        from routers.sync import notify_sync_subscribers, _derive_user_status
        await notify_sync_subscribers(user_id, "timer_change", {
            "user_status": _derive_user_status(state),
            "timer": {
                "mode": state.get("mode"),
                "status": state.get("status"),
                "remaining_seconds": state.get("remaining_seconds"),
                "break_type": state.get("break_type"),
                "current_task_id": state.get("current_task_id"),
            },
        })
    except Exception:
        pass


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    """Per-user WebSocket. Client must pass ?token=<X-Token> as query param."""
    await websocket.accept()

    # Resolve user from token query param
    from routers.users import load_sessions, load_users
    token_val = websocket.query_params.get("token")
    user_id = None
    if token_val:
        sessions = load_sessions()
        if token_val in sessions:
            uid = sessions[token_val]
            users = load_users()
            if uid in users:
                user_id = uid

    if not user_id:
        await websocket.send_json({"error": "未授权"})
        await websocket.close(code=4001)
        return

    if user_id not in _user_connections:
        _user_connections[user_id] = set()
    _user_connections[user_id].add(websocket)

    loop = asyncio.get_event_loop()
    _ensure_ticker(user_id, loop)

    try:
        state = get_computed_state(user_id)
        await websocket.send_json(state)
    except Exception:
        _user_connections[user_id].discard(websocket)
        return

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        _user_connections[user_id].discard(websocket)
    except Exception:
        _user_connections[user_id].discard(websocket)


# ── REST endpoints ────────────────────────────────────────────────────────────

@router.get("/state", summary="获取计时器状态", description="返回当前计时器完整状态（模式、剩余秒数、会话等）")
def get_state(current_user: dict = Depends(get_current_user)):
    return get_computed_state(current_user["id"])


@router.put("/settings", summary="更新计时器设置", description="修改工作/短休息/长休息时长等计时器参数")
async def update_timer_settings(
    data: TimerSettingsUpdate,
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["id"]
    with _lock:
        state = load_state(uid)
        if data.work_duration_minutes is not None:
            state["work_duration_minutes"] = data.work_duration_minutes
        if data.short_break_minutes is not None:
            state["short_break_minutes"] = data.short_break_minutes
        if data.leisure_break_minutes is not None:
            state["leisure_break_minutes"] = data.leisure_break_minutes
        if data.long_break_minutes is not None:
            state["long_break_minutes"] = data.long_break_minutes
        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


@router.post("/start", summary="开始计时", description="启动新的番茄钟/运动/冥想会话")
async def start_timer(
    req: TimerStartRequest = TimerStartRequest(),
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["id"]
    with _lock:
        state = load_state(uid)
        if req.work_duration_minutes:
            state["work_duration_minutes"] = req.work_duration_minutes
        state["mode"] = req.mode
        state["status"] = "running"
        if req.mode == "meditation":
            state["remaining_seconds"] = state.get("meditation_duration_minutes", 20) * 60
        else:
            state["remaining_seconds"] = state["work_duration_minutes"] * 60
        state["elapsed_overtime_seconds"] = 0
        state["started_at"] = datetime.now().isoformat()
        state["break_type"] = "none"
        if req.task_id is not None:
            state["current_task_id"] = req.task_id
        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


@router.post("/pause", summary="暂停计时")
async def pause_timer(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    with _lock:
        state = load_state(uid)
        if state["status"] != "running":
            raise HTTPException(status_code=400, detail="计时器不在运行中")
        elapsed = int((time.time() - datetime.fromisoformat(state["started_at"]).timestamp()))
        state["remaining_seconds"] = max(0, state["remaining_seconds"] - elapsed)
        state["status"] = "paused"
        state["started_at"] = None
        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


@router.post("/resume", summary="继续计时")
async def resume_timer(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    with _lock:
        state = load_state(uid)
        if state["status"] != "paused":
            raise HTTPException(status_code=400, detail="计时器不在暂停中")
        state["status"] = "running"
        state["started_at"] = datetime.now().isoformat()
        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


@router.post("/stop", summary="停止计时", description="停止当前会话并记录已完成的时间")
async def stop_timer(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    with _lock:
        # Use computed remaining (wall-clock adjusted). Disk `remaining_seconds` is not
        # written every tick while running, so load_state alone double-counts wall time and
        # can produce nonsense partial durations (e.g. 193 min).
        computed = get_computed_state(uid)

        if computed["status"] in ("running", "paused") and computed["mode"] in ("pomodoro", "meditation"):
            if computed["mode"] == "meditation":
                original_secs = computed.get("meditation_duration_minutes", 20) * 60
            else:
                original_secs = computed["work_duration_minutes"] * 60
            rem = max(0, computed["remaining_seconds"])
            rem = min(rem, original_secs)
            elapsed_sec = min(original_secs, original_secs - rem)
            elapsed_minutes = int(elapsed_sec / 60)
            if elapsed_minutes >= 5:
                from routers.stats import record_completion
                task_id = computed.get("current_task_id")
                started_at = computed.get("started_at")
                record_type = "meditation" if computed["mode"] == "meditation" else "pomodoro"
                record_completion(
                    user_id=uid,
                    record_type=record_type,
                    duration_minutes=elapsed_minutes,
                    task_id=task_id,
                    is_partial=True,
                    started_at=started_at,
                )
                if task_id and computed["mode"] == "pomodoro":
                    try:
                        from routers.tasks import load_tasks as _load, save_tasks as _save
                        all_tasks = _load(uid)
                        if task_id in all_tasks:
                            all_tasks[task_id]["pomodor_completed"] = all_tasks[task_id].get("pomodor_completed", 0) + 1
                            _save(uid, all_tasks)
                    except Exception as e:
                        logger.warning("Failed to update task %s pomodoro count on stop: %s", task_id, e)

        state = load_state(uid)
        state["status"] = "idle"
        state["remaining_seconds"] = state["work_duration_minutes"] * 60
        state["elapsed_overtime_seconds"] = 0
        state["started_at"] = None
        state["break_type"] = "none"
        state["current_task_id"] = None
        state["exercise_phase"] = "none"
        state["mode"] = "pomodoro"
        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


@router.post("/switch-task", summary="切换关联任务", description="将当前计时器关联到指定任务")
async def switch_task(
    req: SwitchTaskRequest,
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["id"]
    with _lock:
        state = load_state(uid)
        state["current_task_id"] = req.task_id
        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


@router.post("/sessions/complete", summary="完成当前会话", description="手动标记当前会话完成，触发记录和统计更新")
async def complete_session(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    with _lock:
        state = load_state(uid)
        mode = state["mode"]

        if mode == "meditation":
            from routers.stats import record_completion
            started_at = state.get("started_at")
            record_completion(
                user_id=uid,
                record_type="meditation",
                duration_minutes=state.get("meditation_duration_minutes", 20),
                started_at=started_at,
            )
            try:
                from routers.habits import trigger_auto_checkin
                trigger_auto_checkin(uid, "meditation_complete")
            except Exception as e:
                logger.warning("Habit auto-checkin failed (meditation): %s", e)
            state["status"] = "idle"
            state["mode"] = "pomodoro"
            state["remaining_seconds"] = state["work_duration_minutes"] * 60
            state["elapsed_overtime_seconds"] = 0
            state["started_at"] = None

        elif mode == "pomodoro":
            state["works_since_leisure"] += 1
            state["works_since_exercise"] += 1

            from routers.stats import record_completion
            task_id = state.get("current_task_id")
            started_at = state.get("started_at")
            record_completion(
                user_id=uid,
                record_type="pomodoro",
                duration_minutes=state["work_duration_minutes"],
                task_id=task_id,
                started_at=started_at,
            )
            try:
                from routers.habits import trigger_auto_checkin
                trigger_auto_checkin(uid, "pomodoro_complete")
            except Exception as e:
                logger.warning("Habit auto-checkin failed (pomodoro): %s", e)
            try:
                from routers.achievements import check_achievements
                check_achievements(uid)
            except Exception as e:
                logger.warning("Achievement check failed: %s", e)

            if task_id:
                try:
                    from routers.tasks import load_tasks as _load_tasks, save_tasks as _save_tasks
                    all_tasks = _load_tasks(uid)
                    if task_id in all_tasks:
                        all_tasks[task_id]["pomodor_completed"] = all_tasks[task_id].get("pomodor_completed", 0) + 1
                        _save_tasks(uid, all_tasks)
                except Exception as e:
                    logger.warning("Failed to update task %s pomodoro count: %s", task_id, e)

            if state["works_since_exercise"] >= 4:
                state["exercise_reminder_due"] = True
                state["works_since_exercise"] = 0

            if state["works_since_leisure"] >= 2:
                state["break_type"] = "leisure"
                state["remaining_seconds"] = state["leisure_break_minutes"] * 60
                state["works_since_leisure"] = 0
            else:
                state["break_type"] = "short"
                state["remaining_seconds"] = state["short_break_minutes"] * 60

            state["status"] = "idle"
            state["current_session"] += 1

        elif mode == "exercise":
            exercise_phase = state.get("exercise_phase", "exercise")

            if exercise_phase == "exercise":
                # Exercise done → start 30-min rest (still counts as pomodoro)
                state["exercise_phase"] = "rest"
                state["status"] = "running"
                state["remaining_seconds"] = 30 * 60
                state["elapsed_overtime_seconds"] = 0
                state["started_at"] = datetime.now().isoformat()

            elif exercise_phase == "rest":
                # Rest done → record 60 min exercise, start 20-min shower (NOT pomodoro)
                from routers.stats import record_completion
                record_completion(
                    user_id=uid,
                    record_type="exercise",
                    duration_minutes=60,
                    exercise_type=state.get("exercise_type", "boxing"),
                )
                try:
                    from routers.habits import trigger_auto_checkin
                    trigger_auto_checkin(uid, "exercise_complete")
                except Exception as e:
                    logger.warning("Habit auto-checkin failed (exercise): %s", e)
                state["exercise_phase"] = "shower"
                state["status"] = "running"
                state["remaining_seconds"] = 20 * 60
                state["elapsed_overtime_seconds"] = 0
                state["started_at"] = datetime.now().isoformat()

            elif exercise_phase == "shower":
                # Shower done → return to idle
                state["exercise_phase"] = "none"
                state["bath_reminder_due"] = False
                state["status"] = "idle"
                state["mode"] = "pomodoro"
                state["remaining_seconds"] = state["work_duration_minutes"] * 60
                state["elapsed_overtime_seconds"] = 0
                state["started_at"] = None

        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


@router.post("/break/start", summary="开始休息", description="进入短休息/娱乐休息/长休息")
async def start_break(
    req: BreakStartRequest = BreakStartRequest(),
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["id"]
    break_type = req.break_type
    with _lock:
        state = load_state(uid)
        if break_type == "short":
            state["remaining_seconds"] = state["short_break_minutes"] * 60
            state["break_type"] = "short"
        elif break_type == "leisure":
            state["remaining_seconds"] = state["leisure_break_minutes"] * 60
            state["break_type"] = "leisure"
        elif break_type == "long":
            state["remaining_seconds"] = state["long_break_minutes"] * 60
            state["break_type"] = "long"
        state["status"] = "running"
        state["started_at"] = datetime.now().isoformat()
        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


@router.post("/exercise/skip", summary="跳过运动提醒")
async def skip_exercise(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    with _lock:
        state = load_state(uid)
        state["exercise_reminder_due"] = False
        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


@router.post("/bath/skip", summary="跳过洗澡提醒")
async def skip_bath(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    with _lock:
        state = load_state(uid)
        state["bath_reminder_due"] = False
        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


@router.post("/exercise/start", summary="开始运动", description="启动拳击/跑步运动会话")
async def start_exercise(
    exercise_type: Literal["boxing", "running"] = "boxing",
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["id"]
    with _lock:
        state = load_state(uid)
        state["mode"] = "exercise"
        state["status"] = "running"
        state["exercise_type"] = exercise_type
        state["exercise_reminder_due"] = False
        state["exercise_phase"] = "exercise"
        state["remaining_seconds"] = 30 * 60
        state["elapsed_overtime_seconds"] = 0
        state["started_at"] = datetime.now().isoformat()
        save_state(uid, state)
    await broadcast_state_to_user(uid)
    return state


# ── Sound preferences (REQ-303) ──────────────────────────────────────────────

AVAILABLE_SOUNDS = [
    {"id": "default", "name": "默认铃声", "type": "builtin"},
    {"id": "bell", "name": "清脆铃声", "type": "builtin"},
    {"id": "chime", "name": "风铃", "type": "builtin"},
    {"id": "gentle", "name": "柔和提示", "type": "builtin"},
    {"id": "none", "name": "静音", "type": "builtin"},
]


def _prefs_file(user_id: str) -> str:
    return os.path.join(get_user_data_dir(user_id), "sound_prefs.json")


def _load_sound_prefs(user_id: str) -> dict:
    fpath = _prefs_file(user_id)
    defaults = {"work_end_sound": "default", "rest_end_sound": "default", "meditation_end_sound": "default", "volume": 100}
    if not os.path.exists(fpath):
        return defaults
    try:
        with open(fpath, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return defaults


def _custom_sounds_dir(user_id: str) -> str:
    d = os.path.join(get_user_data_dir(user_id), "sounds")
    os.makedirs(d, exist_ok=True)
    return d


_ALLOWED_EXTENSIONS = {'mp3', 'wav', 'ogg'}
_ALLOWED_MIME_PREFIXES = {'audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg', 'audio/x-ogg', 'application/ogg'}
_MAX_SOUND_SIZE = 1 * 1024 * 1024


def _sanitize_filename(name: str) -> str:
    """Strip path separators and control chars; keep only the basename."""
    import re
    base = os.path.basename(name)
    base = base.replace('/', '_').replace('\\', '_').replace('\x00', '')
    base = re.sub(r'[^\w.\-\u4e00-\u9fff]', '_', base)
    return base or 'sound.mp3'


def _list_user_custom_sounds(user_id: str) -> list:
    d = _custom_sounds_dir(user_id)
    result = []
    for fname in sorted(os.listdir(d)):
        if fname.lower().endswith(tuple(f'.{e}' for e in _ALLOWED_EXTENSIONS)):
            sid = f"custom_{fname}"
            result.append({"id": sid, "name": fname, "type": "custom", "filename": fname})
    return result


@router.get("/sounds", summary="获取可用声音列表", description="返回内置声音和用户自定义声音")
def list_sounds(current_user: dict = Depends(get_current_user)):
    """List available notification sounds (builtin + custom)."""
    uid = current_user["id"]
    return AVAILABLE_SOUNDS + _list_user_custom_sounds(uid)


@router.post("/sounds/upload", summary="上传自定义声音", description="上传MP3/WAV/OGG文件(最大1MB)作为通知声音。同名文件会被覆盖。")
async def upload_sound_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a custom notification sound (mp3/wav/ogg, max 1MB). Same-name files are overwritten."""
    uid = current_user["id"]

    if not file.filename:
        raise HTTPException(status_code=400, detail="未提供文件名")

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"仅支持 {'/'.join(sorted(_ALLOWED_EXTENSIONS))} 格式")

    if file.content_type and not any(file.content_type.startswith(m) for m in _ALLOWED_MIME_PREFIXES):
        raise HTTPException(status_code=400, detail=f"不支持的 MIME 类型: {file.content_type}")

    content = await file.read()
    if len(content) > _MAX_SOUND_SIZE:
        raise HTTPException(status_code=400, detail="文件大小不能超过 1MB")

    safe_name = _sanitize_filename(file.filename)
    dest = os.path.join(_custom_sounds_dir(uid), safe_name)
    overwritten = os.path.exists(dest)
    with open(dest, "wb") as f:
        f.write(content)

    sid = f"custom_{safe_name}"
    return {"id": sid, "name": safe_name, "type": "custom", "filename": safe_name, "overwritten": overwritten}


@router.get("/sounds/custom/{filename}")
def serve_custom_sound(filename: str, current_user: dict = Depends(get_current_user)):
    """Serve a user's custom sound file."""
    from fastapi.responses import FileResponse
    uid = current_user["id"]
    safe = _sanitize_filename(filename)
    fpath = os.path.join(_custom_sounds_dir(uid), safe)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="声音文件不存在")
    return FileResponse(fpath)


@router.delete("/sounds/custom/{filename}", summary="删除自定义声音", description="删除用户上传的自定义通知声音文件")
def delete_custom_sound(filename: str, current_user: dict = Depends(get_current_user)):
    """Delete a user's custom sound file and clear preferences referencing it."""
    uid = current_user["id"]
    safe = _sanitize_filename(filename)
    fpath = os.path.join(_custom_sounds_dir(uid), safe)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="声音文件不存在")
    os.remove(fpath)

    sid = f"custom_{safe}"
    prefs = _load_sound_prefs(uid)
    changed = False
    for key in ("work_end_sound", "rest_end_sound", "meditation_end_sound"):
        if prefs.get(key) == sid:
            prefs[key] = "default"
            changed = True
    if changed:
        from routers import atomic_json_write
        atomic_json_write(_prefs_file(uid), prefs, indent=2)

    return {"ok": True, "preferences_reset": changed}


@router.get("/sound-preferences", summary="获取声音偏好设置")
def get_sound_prefs(current_user: dict = Depends(get_current_user)):
    """Get user's sound preferences."""
    return _load_sound_prefs(current_user["id"])


@router.put("/sound-preferences", summary="更新声音偏好设置")
def update_sound_prefs(prefs: SoundPreferences, current_user: dict = Depends(get_current_user)):
    """Update user's sound preferences."""
    uid = current_user["id"]
    current = _load_sound_prefs(uid)
    if prefs.work_end_sound is not None:
        current["work_end_sound"] = prefs.work_end_sound
    if prefs.rest_end_sound is not None:
        current["rest_end_sound"] = prefs.rest_end_sound
    if prefs.meditation_end_sound is not None:
        current["meditation_end_sound"] = prefs.meditation_end_sound
    if prefs.volume is not None:
        current["volume"] = max(0, min(100, prefs.volume))
    from routers import atomic_json_write
    atomic_json_write(_prefs_file(uid), current, indent=2)
    return current


# ── Timer Presets ─────────────────────────────────────────────────────────────

def _presets_file(user_id: str) -> str:
    return os.path.join(get_user_data_dir(user_id), "timer_presets.json")


def _load_presets(user_id: str) -> list:
    fpath = _presets_file(user_id)
    if not os.path.exists(fpath):
        return [
            {"id": "default-25", "name": "经典番茄钟", "work": 25, "short_break": 5, "long_break": 15, "builtin": True},
            {"id": "default-45", "name": "深度工作", "work": 45, "short_break": 10, "long_break": 15, "builtin": True},
            {"id": "default-90", "name": "超长专注", "work": 90, "short_break": 15, "long_break": 30, "builtin": True},
        ]
    try:
        with open(fpath, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return []


class PresetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    work: int = Field(..., ge=1, le=180)
    short_break: int = Field(..., ge=1, le=60)
    long_break: int = Field(..., ge=1, le=120)


@router.get("/presets", summary="获取计时器预设列表")
def get_presets(current_user: dict = Depends(get_current_user)):
    return _load_presets(current_user["id"])


@router.post("/presets", summary="创建计时器预设")
def create_preset(data: PresetCreate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    presets = _load_presets(uid)
    import uuid as _uuid
    preset = {
        "id": str(_uuid.uuid4()),
        "name": data.name,
        "work": data.work,
        "short_break": data.short_break,
        "long_break": data.long_break,
        "builtin": False,
    }
    presets.append(preset)
    from routers import atomic_json_write
    atomic_json_write(_presets_file(uid), presets, indent=2)
    return preset


@router.delete("/presets/{preset_id}", summary="删除计时器预设")
def delete_preset(preset_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    presets = _load_presets(uid)
    new_presets = [p for p in presets if p["id"] != preset_id or p.get("builtin")]
    if len(new_presets) == len(presets):
        raise HTTPException(status_code=404, detail="预设不存在或为内置预设")
    from routers import atomic_json_write
    atomic_json_write(_presets_file(uid), new_presets, indent=2)
    return {"ok": True}


@router.post("/presets/{preset_id}/apply", summary="应用计时器预设")
def apply_preset(preset_id: str, current_user: dict = Depends(get_current_user)):
    """Apply a preset's settings to the current timer state."""
    uid = current_user["id"]
    presets = _load_presets(uid)
    preset = next((p for p in presets if p["id"] == preset_id), None)
    if not preset:
        raise HTTPException(status_code=404, detail="预设不存在")

    state = load_state(uid)
    state["work_duration_minutes"] = preset["work"]
    state["short_break_minutes"] = preset["short_break"]
    state["long_break_minutes"] = preset["long_break"]
    if state["status"] == "idle":
        state["remaining_seconds"] = preset["work"] * 60
    save_state(uid, state)
    return state
