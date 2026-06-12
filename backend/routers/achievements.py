"""Achievement system — 20+ achievements with progress tracking."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, timedelta
import json
import os
import logging

from routers.users import get_current_user, get_user_data_dir

router = APIRouter()
logger = logging.getLogger("polarclock.achievements")

ACHIEVEMENTS = [
    {"id": "first_pomodoro",    "name": "初心番茄",   "desc": "完成第一个番茄钟",           "icon": "🍅", "target": 1,    "category": "pomodoro"},
    {"id": "pomodoro_10",       "name": "番茄学徒",   "desc": "累计完成 10 个番茄钟",        "icon": "🌱", "target": 10,   "category": "pomodoro"},
    {"id": "pomodoro_50",       "name": "番茄匠人",   "desc": "累计完成 50 个番茄钟",        "icon": "🌿", "target": 50,   "category": "pomodoro"},
    {"id": "pomodoro_100",      "name": "番茄大师",   "desc": "累计完成 100 个番茄钟",       "icon": "🌳", "target": 100,  "category": "pomodoro"},
    {"id": "pomodoro_500",      "name": "番茄传奇",   "desc": "累计完成 500 个番茄钟",       "icon": "🏆", "target": 500,  "category": "pomodoro"},
    {"id": "focus_1h",          "name": "专注一小时", "desc": "累计专注 60 分钟",             "icon": "⏱️", "target": 60,   "category": "focus"},
    {"id": "focus_10h",         "name": "深度工作",   "desc": "累计专注 10 小时",             "icon": "🔥", "target": 600,  "category": "focus"},
    {"id": "focus_100h",        "name": "百小时俱乐部","desc": "累计专注 100 小时",           "icon": "💎", "target": 6000, "category": "focus"},
    {"id": "streak_3",          "name": "三日连胜",   "desc": "连续 3 天完成番茄钟",          "icon": "🔗", "target": 3,    "category": "streak"},
    {"id": "streak_7",          "name": "一周坚持",   "desc": "连续 7 天完成番茄钟",          "icon": "📅", "target": 7,    "category": "streak"},
    {"id": "streak_30",         "name": "月度达人",   "desc": "连续 30 天完成番茄钟",         "icon": "🗓️", "target": 30,   "category": "streak"},
    {"id": "streak_100",        "name": "百日之约",   "desc": "连续 100 天完成番茄钟",        "icon": "👑", "target": 100,  "category": "streak"},
    {"id": "task_first",        "name": "任务启航",   "desc": "完成第一个任务",               "icon": "✅", "target": 1,    "category": "task"},
    {"id": "task_10",           "name": "效率先锋",   "desc": "累计完成 10 个任务",           "icon": "📋", "target": 10,   "category": "task"},
    {"id": "task_50",           "name": "任务收割机", "desc": "累计完成 50 个任务",           "icon": "🎯", "target": 50,   "category": "task"},
    {"id": "exercise_first",    "name": "运动初体验", "desc": "完成第一次运动计时",           "icon": "🏃", "target": 1,    "category": "health"},
    {"id": "exercise_20",       "name": "运动达人",   "desc": "累计完成 20 次运动",           "icon": "💪", "target": 20,   "category": "health"},
    {"id": "meditation_first",  "name": "初次冥想",   "desc": "完成第一次冥想",               "icon": "🧘", "target": 1,    "category": "health"},
    {"id": "meditation_20",     "name": "禅定大师",   "desc": "累计完成 20 次冥想",           "icon": "🪷", "target": 20,   "category": "health"},
    {"id": "early_bird",        "name": "早起鸟儿",   "desc": "在早上 6-8 点完成番茄钟",      "icon": "🐦", "target": 5,    "category": "special"},
    {"id": "night_owl",         "name": "夜猫子",     "desc": "在晚上 22-24 点完成番茄钟",    "icon": "🦉", "target": 5,    "category": "special"},
    {"id": "weekend_warrior",   "name": "周末战士",   "desc": "在周末完成 10 个番茄钟",       "icon": "⚔️", "target": 10,   "category": "special"},
    {"id": "perfect_day",       "name": "完美一天",   "desc": "一天内完成 8 个番茄钟",        "icon": "🌟", "target": 1,    "category": "special"},
]


def _achievements_file(uid: str) -> str:
    return os.path.join(get_user_data_dir(uid), "achievements.json")


def _load_progress(uid: str) -> dict:
    fpath = _achievements_file(uid)
    if not os.path.exists(fpath):
        return {"unlocked": {}, "progress": {}}
    try:
        with open(fpath, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return {"unlocked": {}, "progress": {}}


def _save_progress(uid: str, data: dict):
    from routers import atomic_json_write
    atomic_json_write(_achievements_file(uid), data, indent=2, ensure_ascii=False)


def check_achievements(uid: str) -> List[str]:
    """Evaluate all achievements, return list of newly unlocked IDs."""
    prog = _load_progress(uid)

    from routers.stats import load_history
    history = load_history(uid)

    from routers.tasks import load_tasks
    tasks_dict = load_tasks(uid)
    tasks = list(tasks_dict.values()) if isinstance(tasks_dict, dict) else tasks_dict

    newly = []

    pom_count = sum(1 for r in history if r.get("type") == "pomodoro")
    ex_count = sum(1 for r in history if r.get("type") == "exercise")
    med_count = sum(1 for r in history if r.get("type") == "meditation")
    focus_min = sum(r.get("duration_minutes", 0) for r in history if r.get("type") == "pomodoro")
    completed_tasks = sum(1 for t in tasks if t.get("status") == "completed")

    dates_with_pom: set = set()
    early_count = 0
    night_count = 0
    weekend_pom = 0
    daily_counts: dict = {}
    for r in history:
        if r.get("type") != "pomodoro":
            continue
        ts = r.get("completed_at") or r.get("ended_at", "")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue
        d = dt.strftime("%Y-%m-%d")
        dates_with_pom.add(d)
        daily_counts[d] = daily_counts.get(d, 0) + 1
        if 6 <= dt.hour < 8:
            early_count += 1
        if 22 <= dt.hour <= 23:
            night_count += 1
        if dt.weekday() >= 5:
            weekend_pom += 1

    streak = 0
    if dates_with_pom:
        today = date.today()
        d = today
        while d.isoformat() in dates_with_pom:
            streak += 1
            d -= timedelta(days=1)

    perfect_days = sum(1 for c in daily_counts.values() if c >= 8)

    metric_map = {
        "first_pomodoro": pom_count, "pomodoro_10": pom_count, "pomodoro_50": pom_count,
        "pomodoro_100": pom_count, "pomodoro_500": pom_count,
        "focus_1h": focus_min, "focus_10h": focus_min, "focus_100h": focus_min,
        "streak_3": streak, "streak_7": streak, "streak_30": streak, "streak_100": streak,
        "task_first": completed_tasks, "task_10": completed_tasks, "task_50": completed_tasks,
        "exercise_first": ex_count, "exercise_20": ex_count,
        "meditation_first": med_count, "meditation_20": med_count,
        "early_bird": early_count, "night_owl": night_count,
        "weekend_warrior": weekend_pom, "perfect_day": perfect_days,
    }

    for ach in ACHIEVEMENTS:
        aid = ach["id"]
        val = metric_map.get(aid, 0)
        prog["progress"][aid] = val
        if aid not in prog.get("unlocked", {}) and val >= ach["target"]:
            prog["unlocked"][aid] = datetime.now().isoformat()
            newly.append(aid)

    _save_progress(uid, prog)
    return newly


@router.get("", summary="成就列表", description="返回全部成就及用户进度")
def list_achievements(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    check_achievements(uid)
    prog = _load_progress(uid)
    result = []
    for a in ACHIEVEMENTS:
        aid = a["id"]
        result.append({
            "id": aid, "name": a["name"], "desc": a["desc"],
            "icon": a["icon"], "category": a["category"], "target": a["target"],
            "current": prog["progress"].get(aid, 0),
            "unlocked": aid in prog.get("unlocked", {}),
            "unlocked_at": prog.get("unlocked", {}).get(aid),
        })
    return result


@router.post("/check", summary="触发成就检查", description="重新评估并返回新解锁的成就")
def trigger_check(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    newly = check_achievements(uid)
    return {"newly_unlocked": newly}
