from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
import json
import os
import uuid
from datetime import datetime

router = APIRouter()

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data"))
USERS_FILE = os.path.join(DATA_DIR, "users.json")
SESSIONS_FILE = os.path.join(DATA_DIR, "sessions.json")

_uid_to_username: dict = {}


# ── Shared helpers (imported by all other routers) ────────────────────────────

def get_user_data_dir(user_id: str) -> str:
    """Return and create the per-user data directory: data/{username}/"""
    username = _uid_to_username.get(user_id)
    if username is None:
        users = load_users()
        for uid, u in users.items():
            _uid_to_username[uid] = u["username"]
        username = _uid_to_username.get(user_id, user_id)
    d = os.path.join(DATA_DIR, username)
    os.makedirs(d, exist_ok=True)
    return d


def get_current_user(x_token: Optional[str] = Header(None)) -> dict:
    """FastAPI Depends — resolve X-Token header to a user dict.
    Raises 401 if token is missing or invalid."""
    if not x_token:
        raise HTTPException(status_code=401, detail="未登录，请先登录")
    sessions = load_sessions()
    if x_token not in sessions:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    user_id = sessions[x_token]
    users = load_users()
    if user_id not in users:
        raise HTTPException(status_code=401, detail="用户不存在")
    return users[user_id]


def load_users():
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return {}


def save_users(users):
    from routers import atomic_json_write
    atomic_json_write(USERS_FILE, users, indent=2)


def load_sessions():
    if not os.path.exists(SESSIONS_FILE):
        return {}
    try:
        with open(SESSIONS_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return {}


def save_sessions(sessions):
    from routers import atomic_json_write
    atomic_json_write(SESSIONS_FILE, sessions, indent=2)


class UserCreate(BaseModel):
    username: str


class UserLogin(BaseModel):
    username: str


class User(BaseModel):
    id: str
    username: str
    created_at: str


class LoginResponse(BaseModel):
    user: User
    token: str


def _try_bind_polarisor(clock_user_id: str, username: str):
    """Best-effort: register this Clock user in PolarPrivate identity_bindings."""
    try:
        import httpx
        pp_port = os.environ.get("POLARPRIVATE_PORT", "12790")
        pp_url = f"http://127.0.0.1:{pp_port}"
        sdk_port_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                                     "..", "PolarPort", "src", "sdk", "python", "polarisor_port_sdk.py")
        if os.path.exists(sdk_port_path):
            import importlib.util
            spec = importlib.util.spec_from_file_location("polarisor_port_sdk", sdk_port_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            discovered = mod.get_port_sync("polarprivate")
            if discovered:
                pp_url = f"http://127.0.0.1:{discovered}"

        with httpx.Client(timeout=3.0) as client:
            resp = client.get(f"{pp_url}/api/identity-bindings/resolve",
                            params={"service": "clock", "external_username": clock_user_id})
            if resp.status_code == 200:
                return
            resp = client.get(f"{pp_url}/api/users")
            if resp.status_code == 200:
                users_list = resp.json().get("items", [])
                for u in users_list:
                    if u.get("username", "").lower() == username.lower():
                        client.post(f"{pp_url}/api/identity-bindings", json={
                            "user_id": u["id"],
                            "service": "clock",
                            "external_username": clock_user_id,
                            "display_name": username,
                        })
                        return
    except Exception:
        pass


@router.post("", response_model=User, summary="注册新用户", description="创建账户并返回用户信息和认证token")
def create_user(data: UserCreate):
    users = load_users()
    for u in users.values():
        if u["username"] == data.username:
            raise HTTPException(status_code=400, detail="用户名已存在")
    user_id = str(uuid.uuid4())
    users[user_id] = {
        "id": user_id,
        "username": data.username,
        "created_at": datetime.now().isoformat()
    }
    save_users(users)
    _uid_to_username[user_id] = data.username
    _try_bind_polarisor(user_id, data.username)
    return users[user_id]


# ── User preferences (REQ-102 dark mode, general settings) ──────────────────

def _prefs_file(user_id: str) -> str:
    return os.path.join(get_user_data_dir(user_id), "preferences.json")


def load_user_preferences(user_id: str) -> dict:
    fpath = _prefs_file(user_id)
    defaults = {"theme": "light", "language": "zh-CN"}
    if not os.path.exists(fpath):
        return defaults
    try:
        with open(fpath, "r") as f:
            prefs = json.load(f)
    except (json.JSONDecodeError, ValueError):
        return defaults
    for k, v in defaults.items():
        prefs.setdefault(k, v)
    return prefs


class UserPreferencesUpdate(BaseModel):
    theme: Optional[str] = None  # "light" | "dark" | "system"
    language: Optional[str] = None


@router.get("/preferences", summary="获取用户偏好")
def get_preferences(current_user: dict = Depends(get_current_user)):
    return load_user_preferences(current_user["id"])


@router.put("/preferences", summary="更新用户偏好")
def update_preferences(data: UserPreferencesUpdate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    prefs = load_user_preferences(uid)
    if data.theme is not None:
        if data.theme not in ("light", "dark", "system"):
            raise HTTPException(status_code=400, detail="theme 必须为 light/dark/system")
        prefs["theme"] = data.theme
    if data.language is not None:
        prefs["language"] = data.language
    from routers import atomic_json_write
    atomic_json_write(_prefs_file(uid), prefs, indent=2)
    return prefs


@router.get("/me", summary="获取当前用户信息")
def get_current_user_info(current_user: dict = Depends(get_current_user)):
    return current_user


@router.get("/{user_id}", response_model=User)
def get_user(user_id: str, x_token: Optional[str] = Header(None)):
    if x_token:
        sessions = load_sessions()
        if x_token in sessions:
            token_user_id = sessions[x_token]
            if token_user_id != user_id:
                raise HTTPException(status_code=403, detail="无权限")
    users = load_users()
    if user_id not in users:
        raise HTTPException(status_code=404, detail="用户不存在")
    return users[user_id]


@router.post("/login", response_model=LoginResponse, summary="用户登录", description="验证凭据并返回会话token")
def login(data: UserLogin):
    users = load_users()
    for uid, u in users.items():
        if u["username"] == data.username:
            token = str(uuid.uuid4())
            sessions = load_sessions()
            stale = [t for t, u_id in sessions.items() if u_id == uid]
            for old_token in stale:
                del sessions[old_token]
            sessions[token] = uid
            save_sessions(sessions)
            return LoginResponse(user=u, token=token)
    raise HTTPException(status_code=404, detail="用户不存在")


@router.post("/validate", summary="验证Token", description="检查X-Token是否有效")
def validate_token(x_token: Optional[str] = Header(None)):
    if not x_token:
        raise HTTPException(status_code=401, detail="未提供 token")
    sessions = load_sessions()
    if x_token not in sessions:
        raise HTTPException(status_code=401, detail="无效的 token")
    user_id = sessions[x_token]
    users = load_users()
    if user_id not in users:
        raise HTTPException(status_code=404, detail="用户不存在")
    return users[user_id]


@router.post("/logout", summary="用户登出", description="使当前 token 失效")
def logout(x_token: Optional[str] = Header(None)):
    if not x_token:
        raise HTTPException(status_code=401, detail="未提供 token")
    sessions = load_sessions()
    if x_token in sessions:
        del sessions[x_token]
        save_sessions(sessions)
    return {"ok": True}


@router.get("/me/export", summary="用户数据导出", description="导出当前用户的全部数据用于备份")
def export_user_data(current_user: dict = Depends(get_current_user)):
    """Export all user data (tasks, history, preferences, timer state, schedule)."""
    from fastapi.responses import Response
    from datetime import datetime as dt
    uid = current_user["id"]
    data_dir = get_user_data_dir(uid)

    def _load_json(filename: str):
        fpath = os.path.join(data_dir, filename)
        if not os.path.exists(fpath):
            return None
        try:
            with open(fpath, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, ValueError):
            return None

    export = {
        "exported_at": dt.now().isoformat(),
        "user": current_user,
        "tasks": _load_json("tasks.json"),
        "timer_state": _load_json("timer_state.json"),
        "pomodoro_history": _load_json("pomodoro_history.json"),
        "schedule": _load_json("schedule.json"),
        "meal_settings": _load_json("meal_settings.json"),
        "preferences": _load_json("preferences.json"),
        "sound_prefs": _load_json("sound_prefs.json"),
    }
    content = json.dumps(export, indent=2, ensure_ascii=False)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=polarclock_backup_{uid}.json"},
    )


class BindPolarisorRequest(BaseModel):
    polarisor_user_id: str


@router.post("/me/bind-polarisor", summary="绑定 Polarisor 身份",
             description="将当前 Clock 用户绑定到 PolarPrivate polarisor_user_id")
def bind_polarisor(data: BindPolarisorRequest, current_user: dict = Depends(get_current_user)):
    """Create a PolarPrivate identity_binding linking this Clock user to a polarisor_user_id."""
    try:
        import httpx
        pp_port = os.environ.get("POLARPRIVATE_PORT", "12790")
        pp_url = f"http://127.0.0.1:{pp_port}"
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(f"{pp_url}/api/identity-bindings", json={
                "user_id": data.polarisor_user_id,
                "service": "clock",
                "external_username": current_user["id"],
                "display_name": current_user.get("username"),
            })
            if resp.status_code == 409:
                return {"ok": True, "status": "already_bound"}
            resp.raise_for_status()
            return {"ok": True, "binding": resp.json()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PolarPrivate 不可用: {e}")


@router.get("/me/polarisor-id", summary="获取 Polarisor 身份",
            description="解析当前 Clock 用户的 polarisor_user_id")
def get_polarisor_id(current_user: dict = Depends(get_current_user)):
    """Resolve this Clock user's polarisor_user_id via PolarPrivate."""
    try:
        import httpx
        pp_port = os.environ.get("POLARPRIVATE_PORT", "12790")
        pp_url = f"http://127.0.0.1:{pp_port}"
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(f"{pp_url}/api/identity-bindings/resolve",
                            params={"service": "clock", "external_username": current_user["id"]})
            if resp.status_code == 404:
                return {"bound": False, "polarisor_user_id": None}
            resp.raise_for_status()
            data = resp.json()
            return {"bound": True, "polarisor_user_id": data["user_id"], "polarisor_username": data["username"]}
    except Exception:
        return {"bound": False, "polarisor_user_id": None, "error": "PolarPrivate unavailable"}


@router.delete("/me", summary="删除账号", description="删除当前用户账号及所有相关数据")
def delete_user_account(current_user: dict = Depends(get_current_user)):
    """Permanently delete user account and all associated data."""
    import shutil
    uid = current_user["id"]

    users = load_users()
    if uid in users:
        del users[uid]
        save_users(users)

    sessions = load_sessions()
    expired_tokens = [t for t, u in sessions.items() if u == uid]
    for token in expired_tokens:
        del sessions[token]
    save_sessions(sessions)

    user_dir = get_user_data_dir(uid)
    if os.path.isdir(user_dir):
        shutil.rmtree(user_dir, ignore_errors=True)

    return {"ok": True, "deleted_user_id": uid}
