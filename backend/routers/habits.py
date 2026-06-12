from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
import json
import os
import uuid

from routers.users import get_current_user, get_user_data_dir

router = APIRouter()


def _habits_file(user_id: str) -> str:
    return os.path.join(get_user_data_dir(user_id), "habits.json")


def load_habits(user_id: str) -> dict:
    fpath = _habits_file(user_id)
    if not os.path.exists(fpath):
        return {}
    try:
        with open(fpath, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return {}


def save_habits(user_id: str, data: dict):
    from routers import atomic_json_write
    atomic_json_write(_habits_file(user_id), data, indent=2)


class HabitCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    frequency: Literal["daily", "weekly"] = "daily"
    target_count: int = Field(1, ge=1, le=99)
    auto_checkin_trigger: Optional[Literal["exercise_complete", "pomodoro_complete", "meditation_complete"]] = None
    icon: str = Field("🎯", max_length=4)


class HabitUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    frequency: Optional[Literal["daily", "weekly"]] = None
    target_count: Optional[int] = Field(None, ge=1, le=99)
    auto_checkin_trigger: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=4)
    archived: Optional[bool] = None


@router.get("", summary="获取习惯列表")
def list_habits(include_archived: bool = False, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    habits = load_habits(uid)
    result = list(habits.values())
    if not include_archived:
        result = [h for h in result if not h.get("archived", False)]
    return result


@router.post("", summary="创建习惯")
def create_habit(data: HabitCreate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    habits = load_habits(uid)
    habit_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    habit = {
        "id": habit_id,
        "name": data.name,
        "frequency": data.frequency,
        "target_count": data.target_count,
        "auto_checkin_trigger": data.auto_checkin_trigger,
        "icon": data.icon,
        "created_at": now,
        "archived": False,
        "checkins": [],
    }
    habits[habit_id] = habit
    save_habits(uid, habits)
    return habit


@router.put("/{habit_id}", summary="更新习惯")
def update_habit(habit_id: str, data: HabitUpdate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    habits = load_habits(uid)
    if habit_id not in habits:
        raise HTTPException(status_code=404, detail="Habit not found")
    habit = habits[habit_id]
    for field in ("name", "frequency", "target_count", "auto_checkin_trigger", "icon", "archived"):
        val = getattr(data, field, None)
        if val is not None:
            habit[field] = val
    save_habits(uid, habits)
    return habit


@router.post("/{habit_id}/checkin", summary="习惯打卡", description="手动或自动触发的打卡记录")
def checkin_habit(habit_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    habits = load_habits(uid)
    if habit_id not in habits:
        raise HTTPException(status_code=404, detail="Habit not found")
    habit = habits[habit_id]
    today = datetime.now().strftime("%Y-%m-%d")
    habit.setdefault("checkins", []).append({
        "date": today,
        "timestamp": datetime.now().isoformat(),
    })
    save_habits(uid, habits)
    return {"ok": True, "habit_id": habit_id, "date": today}


@router.delete("/{habit_id}", summary="删除习惯")
def delete_habit(habit_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    habits = load_habits(uid)
    if habit_id not in habits:
        raise HTTPException(status_code=404, detail="Habit not found")
    del habits[habit_id]
    save_habits(uid, habits)
    return {"ok": True}


def trigger_auto_checkin(user_id: str, trigger: str):
    """Called by timer.py when a session completes to auto-checkin matching habits."""
    habits = load_habits(user_id)
    today = datetime.now().strftime("%Y-%m-%d")
    changed = False
    for habit in habits.values():
        if habit.get("archived"):
            continue
        if habit.get("auto_checkin_trigger") != trigger:
            continue
        today_count = sum(1 for c in habit.get("checkins", []) if c.get("date") == today)
        if today_count >= habit.get("target_count", 1):
            continue
        habit.setdefault("checkins", []).append({
            "date": today,
            "timestamp": datetime.now().isoformat(),
            "auto": True,
        })
        changed = True
    if changed:
        save_habits(user_id, habits)
