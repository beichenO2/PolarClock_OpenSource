from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, date

from routers.users import get_current_user, get_user_data_dir

logger = logging.getLogger("polarclock.schedule")

router = APIRouter()


# ── Storage helpers ────────────────────────────────────────────────────────────

def _schedule_file(user_id: str) -> str:
    return os.path.join(get_user_data_dir(user_id), "schedule.json")

def _meal_settings_file(user_id: str) -> str:
    return os.path.join(get_user_data_dir(user_id), "meal_settings.json")

def load_schedule(user_id: str) -> dict:
    fpath = _schedule_file(user_id)
    if not os.path.exists(fpath):
        return {"recurring_rules": [], "blocked_periods": []}
    try:
        with open(fpath, "r") as f:
            data = json.load(f)
    except (json.JSONDecodeError, ValueError):
        return {"recurring_rules": [], "blocked_periods": []}

    # ── Migrate old blocked_periods → recurring_rules (one-time) ──────────────
    if "recurring_rules" not in data:
        rules = []
        for bp in data.get("blocked_periods", []):
            try:
                raw_start = bp["start_time"].replace("Z", "+00:00")
                raw_end   = bp["end_time"].replace("Z", "+00:00")
                start_dt  = datetime.fromisoformat(raw_start).astimezone()
                end_dt    = datetime.fromisoformat(raw_end).astimezone()
                # Use local time: 0=Mon … 6=Sun (Python weekday())
                dow = start_dt.weekday()
                rules.append({
                    "id":              bp.get("id", str(uuid.uuid4())),
                    "name":            bp.get("name", "Block"),
                    "day_of_week":     dow,
                    "start_hhmm":      start_dt.strftime("%H:%M"),
                    "end_hhmm":        end_dt.strftime("%H:%M"),
                    "effective_from":  start_dt.date().isoformat(),
                    "effective_until": None,
                })
            except Exception as e:
                logger.warning("Skipped unmigrable blocked_period %s: %s", bp.get("id", "?"), e)
        data["recurring_rules"] = rules
        save_schedule(user_id, data)

    return data


def save_schedule(user_id: str, data: dict):
    from routers import atomic_json_write
    atomic_json_write(_schedule_file(user_id), data, indent=2, ensure_ascii=False)
    try:
        import asyncio
        from routers.sync import notify_sync_subscribers
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(notify_sync_subscribers(user_id, "schedule_change", {
                "rules_count": len(data.get("recurring_rules", [])),
            }))
    except Exception:
        pass


def find_rule(data: dict, rule_id: str) -> Optional[dict]:
    for r in data.get("recurring_rules", []):
        if r["id"] == rule_id:
            return r
    return None


def prev_day(date_str: str) -> str:
    """Return the ISO date string for the day before date_str."""
    d = date.fromisoformat(date_str)
    return (d - timedelta(days=1)).isoformat()


# ── Models ─────────────────────────────────────────────────────────────────────

class CreateRuleRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    day_of_week: int = Field(..., ge=0, le=6)
    start_hhmm: str       # "09:00"
    end_hhmm: str         # "10:30"
    effective_from: str   # "2026-03-31"  ISO date


class UpdateRuleRequest(BaseModel):
    name: Optional[str] = None
    start_hhmm: Optional[str] = None
    end_hhmm: Optional[str] = None
    effective_until: Optional[str] = None


class SplitRuleRequest(BaseModel):
    """
    Split a rule at week_monday (end old rule the day before, create new rule from week_monday).
    Returns the new rule.
    """
    week_monday: str       # "2026-04-07"  ISO date = Monday of current week
    new_start_hhmm: str
    new_end_hhmm: str
    new_name: Optional[str] = None


# ── Meal settings (kept) ───────────────────────────────────────────────────────

class MealSettings(BaseModel):
    breakfast_start: str = "08:00"
    breakfast_latest_start: str = "09:00"
    lunch_start: str = "13:00"
    lunch_latest_finish: str = "14:00"
    dinner_start: str = "19:00"
    dinner_latest_finish: str = "20:00"
    prep_time_minutes: int = Field(60, ge=0, le=180)
    meal_duration_minutes: int = Field(60, ge=10, le=180)


def _load_meal_settings(user_id: str) -> dict:
    fpath = _meal_settings_file(user_id)
    if not os.path.exists(fpath):
        return MealSettings().model_dump()
    try:
        with open(fpath, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return MealSettings().model_dump()


@router.get("/meal-settings", summary="获取三餐时间设置")
def get_meal_settings(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    return _load_meal_settings(uid)


@router.put("/meal-settings", summary="更新三餐时间设置")
def update_meal_settings(settings: MealSettings, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    from routers import atomic_json_write
    atomic_json_write(_meal_settings_file(uid), settings.model_dump(), indent=2)
    return settings


# ── Rule endpoints ─────────────────────────────────────────────────────────────

@router.get("/rules", summary="获取日程规则列表", description="返回所有周期性日程规则")
def get_rules(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    data = load_schedule(uid)
    return data.get("recurring_rules", [])


@router.post("/rules", summary="创建日程规则", description="添加新的周期性日程规则")
def create_rule(req: CreateRuleRequest, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    data = load_schedule(uid)
    rule = {
        "id":             str(uuid.uuid4()),
        "name":           req.name,
        "day_of_week":    req.day_of_week,
        "start_hhmm":     req.start_hhmm,
        "end_hhmm":       req.end_hhmm,
        "effective_from": req.effective_from,
        "effective_until": None,
    }
    data.setdefault("recurring_rules", []).append(rule)
    save_schedule(uid, data)
    return rule


@router.put("/rules/{rule_id}")
def update_rule(rule_id: str, req: UpdateRuleRequest, current_user: dict = Depends(get_current_user)):
    """In-place update — used when the rule started in the same week (no past weeks affected)."""
    uid = current_user["id"]
    data = load_schedule(uid)
    rule = find_rule(data, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    if req.name is not None:
        rule["name"] = req.name
    if req.start_hhmm is not None:
        rule["start_hhmm"] = req.start_hhmm
    if req.end_hhmm is not None:
        rule["end_hhmm"] = req.end_hhmm
    if req.effective_until is not None:
        rule["effective_until"] = req.effective_until
    save_schedule(uid, data)
    return rule


@router.delete("/rules/{rule_id}", summary="删除日程规则")
def delete_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    """Hard delete — used when the rule started in the same week."""
    uid = current_user["id"]
    data = load_schedule(uid)
    original_len = len(data.get("recurring_rules", []))
    data["recurring_rules"] = [r for r in data.get("recurring_rules", []) if r["id"] != rule_id]
    if len(data["recurring_rules"]) == original_len:
        raise HTTPException(status_code=404, detail="规则不存在")
    save_schedule(uid, data)
    return {"ok": True}


@router.post("/rules/{rule_id}/split")
def split_rule(rule_id: str, req: SplitRuleRequest, current_user: dict = Depends(get_current_user)):
    """
    后复权：split an existing rule at week_monday.
    - Old rule: effective_until = week_monday - 1 day  (past weeks preserved)
    - New rule: effective_from = week_monday (or actual date within the week), modified times
    Returns the new rule.
    """
    uid = current_user["id"]
    data = load_schedule(uid)
    old_rule = find_rule(data, rule_id)
    if not old_rule:
        raise HTTPException(status_code=404, detail="规则不存在")

    # End the old rule just before this week
    old_rule["effective_until"] = prev_day(req.week_monday)

    # Create a new rule from this week forward with the updated times
    new_rule = {
        "id":             str(uuid.uuid4()),
        "name":           req.new_name if req.new_name is not None else old_rule["name"],
        "day_of_week":    old_rule["day_of_week"],
        "start_hhmm":     req.new_start_hhmm,
        "end_hhmm":       req.new_end_hhmm,
        "effective_from": req.week_monday,
        "effective_until": None,
    }
    data["recurring_rules"].append(new_rule)
    save_schedule(uid, data)
    return new_rule


@router.get("/today", summary="今日日程汇总", description="返回今日所有日程块和三餐时间窗口")
def get_today_schedule(current_user: dict = Depends(get_current_user)):
    """Combine today's recurring rules + meal windows into a unified timeline."""
    uid = current_user["id"]
    today = date.today()
    dow = today.weekday()
    today_str = today.isoformat()

    data = load_schedule(uid)
    rules = data.get("recurring_rules", [])

    blocks = []
    for r in rules:
        if r["day_of_week"] != dow:
            continue
        eff_from = r.get("effective_from", "")
        eff_until = r.get("effective_until")
        if eff_from and eff_from > today_str:
            continue
        if eff_until and eff_until < today_str:
            continue
        blocks.append({
            "id": r["id"],
            "name": r["name"],
            "start": r["start_hhmm"],
            "end": r["end_hhmm"],
            "type": "class",
        })

    meals = _load_meal_settings(uid)
    meal_windows = [
        {"name": "早餐", "start": meals["breakfast_start"], "end": meals["breakfast_latest_start"], "type": "meal"},
        {"name": "午餐", "start": meals["lunch_start"], "end": meals["lunch_latest_finish"], "type": "meal"},
        {"name": "晚餐", "start": meals["dinner_start"], "end": meals["dinner_latest_finish"], "type": "meal"},
    ]

    all_events = blocks + meal_windows
    all_events.sort(key=lambda e: e["start"])

    return {
        "date": today_str,
        "day_of_week": dow,
        "events": all_events,
    }


# ── Legacy endpoints (backward compat) ────────────────────────────────────────

@router.get("/{date}")
def get_schedule(date: str, current_user: dict = Depends(get_current_user)):
    """Legacy: returns all rules (frontend no longer relies on date filtering here)."""
    uid = current_user["id"]
    data = load_schedule(uid)
    return {
        "date": date,
        "recurring_rules": data.get("recurring_rules", []),
        # keep blocked_periods for any consumer still using it
        "blocked_periods": [],
    }


@router.post("/block", summary="创建日程块", description="在指定日期添加时间块")
def add_blocked_period(data_in: dict, current_user: dict = Depends(get_current_user)):
    """Legacy shim: convert old blocked_period payload to a recurring rule."""
    uid = current_user["id"]
    try:
        start_dt = datetime.fromisoformat(data_in["start_time"])
        end_dt   = datetime.fromisoformat(data_in["end_time"])
    except Exception:
        raise HTTPException(status_code=400, detail="无效的时间格式")

    data = load_schedule(uid)
    rule = {
        "id":             str(uuid.uuid4()),
        "name":           data_in.get("name", "Block"),
        "day_of_week":    start_dt.weekday(),
        "start_hhmm":     start_dt.strftime("%H:%M"),
        "end_hhmm":       end_dt.strftime("%H:%M"),
        "effective_from": start_dt.date().isoformat(),
        "effective_until": None,
    }
    data.setdefault("recurring_rules", []).append(rule)
    save_schedule(uid, data)
    return rule


@router.delete("/block/{block_id}", summary="删除日程块")
def delete_blocked_period(block_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    data = load_schedule(uid)
    data["recurring_rules"] = [r for r in data.get("recurring_rules", []) if r["id"] != block_id]
    save_schedule(uid, data)
    return {"ok": True}
