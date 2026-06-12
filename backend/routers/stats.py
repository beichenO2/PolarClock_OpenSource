from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional, Literal, List
from datetime import datetime, timedelta
import json
import os
import uuid

from routers.users import get_current_user, get_user_data_dir

router = APIRouter()


class HistoryRecord(BaseModel):
    id: str
    type: Literal["pomodoro", "exercise", "break", "meditation"]
    duration_minutes: int
    completed_at: str
    task_id: Optional[str] = None
    exercise_type: Optional[Literal["boxing", "running"]] = None


def _history_file(user_id: str) -> str:
    return os.path.join(get_user_data_dir(user_id), "pomodoro_history.json")


def load_history(user_id: str) -> List[dict]:
    fpath = _history_file(user_id)
    if not os.path.exists(fpath):
        return []
    try:
        with open(fpath, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return []


def save_history(user_id: str, records: List[dict]):
    from routers import atomic_json_write
    atomic_json_write(_history_file(user_id), records, indent=2)


def record_completion(
    user_id: str,
    record_type: str,
    duration_minutes: int,
    task_id: Optional[str] = None,
    exercise_type: Optional[str] = None,
    is_partial: bool = False,
    started_at: Optional[str] = None,
):
    """Called internally by timer.py when a session completes (or is stopped early)."""
    if duration_minutes < 5:
        return None
    records = load_history(user_id)
    record = {
        "id": str(uuid.uuid4()),
        "type": record_type,
        "duration_minutes": duration_minutes,
        "completed_at": datetime.now().isoformat(),
        "started_at": started_at or datetime.now().isoformat(),
        "task_id": task_id,
        "exercise_type": exercise_type,
        "is_partial": is_partial,
    }
    records.append(record)
    save_history(user_id, records)
    return record


@router.get("/today", summary="今日统计", description="返回当天番茄数、工作/运动/冥想/休息分钟数和详细记录列表")
def get_today_stats(current_user: dict = Depends(get_current_user)):
    """Get today's statistics."""
    uid = current_user["id"]
    records = load_history(uid)
    today = datetime.now().date()

    today_records = []
    for r in records:
        try:
            completed = datetime.fromisoformat(r["completed_at"]).date()
            if completed == today:
                today_records.append(r)
        except (ValueError, KeyError):
            continue

    work_pomodoro_count = sum(1 for r in today_records if r["type"] == "pomodoro")
    exercise_pomodoro_count = sum(1 for r in today_records if r["type"] == "exercise")
    meditation_count = sum(1 for r in today_records if r["type"] == "meditation")
    pomodoro_count = work_pomodoro_count + exercise_pomodoro_count
    work_minutes = sum(r["duration_minutes"] for r in today_records if r["type"] == "pomodoro")
    exercise_minutes = sum(r["duration_minutes"] for r in today_records if r["type"] == "exercise")
    meditation_minutes = sum(r["duration_minutes"] for r in today_records if r["type"] == "meditation")
    break_minutes = sum(r["duration_minutes"] for r in today_records if r["type"] == "break")

    return {
        "date": str(today),
        "pomodoro_count": pomodoro_count,
        "meditation_count": meditation_count,
        "work_minutes": work_minutes,
        "exercise_minutes": exercise_minutes,
        "meditation_minutes": meditation_minutes,
        "break_minutes": break_minutes,
        "total_minutes": work_minutes + exercise_minutes + meditation_minutes + break_minutes,
        "records": today_records[-10:],
    }


@router.get("/weekly", summary="周统计", description="按天聚合最近N周的番茄数和工作时长，附周汇总")
def get_weekly_stats(weeks: int = 4, current_user: dict = Depends(get_current_user)):
    """Get weekly heatmap data."""
    uid = current_user["id"]
    records = load_history(uid)
    today = datetime.now().date()
    start_date = today - timedelta(days=weeks * 7 - 1)

    daily_counts: dict = {}
    current = start_date
    while current <= today:
        date_str = str(current)
        daily_counts[date_str] = {
            "date": date_str,
            "weekday": current.strftime("%a"),
            "pomodoro_count": 0,
            "work_minutes": 0,
            "exercise_minutes": 0,
            "meditation_minutes": 0,
        }
        current += timedelta(days=1)

    for r in records:
        try:
            completed = datetime.fromisoformat(r["completed_at"]).date()
            date_str = str(completed)
            if date_str in daily_counts:
                if r["type"] == "pomodoro":
                    daily_counts[date_str]["pomodoro_count"] += 1
                    daily_counts[date_str]["work_minutes"] += r["duration_minutes"]
                elif r["type"] == "exercise":
                    daily_counts[date_str]["pomodoro_count"] += 1
                    daily_counts[date_str]["exercise_minutes"] += r["duration_minutes"]
                elif r["type"] == "meditation":
                    daily_counts[date_str]["meditation_minutes"] += r["duration_minutes"]
        except (ValueError, KeyError):
            continue

    days = sorted(daily_counts.values(), key=lambda d: d["date"])

    week_summaries = []
    for i in range(weeks):
        week_start = today - timedelta(days=(weeks - 1 - i) * 7 + today.weekday())
        week_end = week_start + timedelta(days=6)
        week_days = [d for d in days if week_start.isoformat() <= d["date"] <= week_end.isoformat()]
        total_pomodoros = sum(d["pomodoro_count"] for d in week_days)
        total_work = sum(d["work_minutes"] + d["exercise_minutes"] for d in week_days)
        week_summaries.append({
            "week_start": str(week_start),
            "week_end": str(week_end),
            "pomodoro_count": total_pomodoros,
            "work_minutes": total_work,
        })

    return {"days": days, "weeks": week_summaries, "total_days": len(days)}


@router.get("/monthly", summary="月度趋势", description="返回每日番茄计数趋势线数据、最大值、总计和日均")
def get_monthly_stats(months: int = 3, current_user: dict = Depends(get_current_user)):
    """Get monthly trend data."""
    uid = current_user["id"]
    records = load_history(uid)
    today = datetime.now().date()
    start_date = today - timedelta(days=months * 30)

    daily_data: dict = {}
    current = start_date
    while current <= today:
        daily_data[str(current)] = 0
        current += timedelta(days=1)

    for r in records:
        try:
            completed = datetime.fromisoformat(r["completed_at"]).date()
            date_str = str(completed)
            if date_str in daily_data and r["type"] in ("pomodoro", "exercise", "meditation"):
                daily_data[date_str] += 1
        except (ValueError, KeyError):
            continue

    trend = [{"date": d, "count": c} for d, c in sorted(daily_data.items())]
    return {
        "trend": trend,
        "max_count": max((c for c in daily_data.values()), default=0),
        "total_pomodoros": sum(daily_data.values()),
        "avg_per_day": round(sum(daily_data.values()) / max(len(daily_data), 1), 1),
    }


@router.get("/recent", summary="最近记录", description="返回最近N条历史记录")
def get_recent_records(limit: int = 20, current_user: dict = Depends(get_current_user)):
    """Get most recent completion records."""
    uid = current_user["id"]
    records = load_history(uid)
    return records[-limit:][::-1]


@router.get("/task-completion", summary="任务完成率", description="计算每个任务的番茄钟完成率和整体完成指标")
def get_task_completion(current_user: dict = Depends(get_current_user)):
    """Task completion rate tracking (REQ-203)."""
    uid = current_user["id"]
    records = load_history(uid)

    from routers.tasks import load_tasks, compute_aggregates
    tasks = load_tasks(uid)
    compute_aggregates(tasks)

    task_stats = []
    for tid, task in tasks.items():
        total = task.get("pomodor_total", 0)
        completed = task.get("pomodor_completed", 0)
        rate = round(completed / total * 100, 1) if total > 0 else 0.0

        task_records = [r for r in records if r.get("task_id") == tid]
        total_minutes = sum(r.get("duration_minutes", 0) for r in task_records)

        task_stats.append({
            "task_id": tid,
            "task_name": task.get("name", ""),
            "status": task.get("status", "pending"),
            "pomodoro_total": total,
            "pomodoro_completed": completed,
            "completion_rate": rate,
            "total_work_minutes": total_minutes,
            "session_count": len(task_records),
            "parent_id": task.get("parent_id"),
            "archived": task.get("archived", False),
        })

    active_tasks = [t for t in task_stats if not t["archived"]]
    all_with_target = [t for t in active_tasks if t["pomodoro_total"] > 0]
    overall_rate = 0.0
    if all_with_target:
        total_target = sum(t["pomodoro_total"] for t in all_with_target)
        total_done = sum(t["pomodoro_completed"] for t in all_with_target)
        overall_rate = round(total_done / total_target * 100, 1) if total_target > 0 else 0.0

    completed_tasks = sum(1 for t in active_tasks if t["status"] == "completed")
    total_active = len(active_tasks)

    return {
        "overall_completion_rate": overall_rate,
        "tasks_completed": completed_tasks,
        "tasks_total": total_active,
        "task_completion_rate": round(completed_tasks / total_active * 100, 1) if total_active > 0 else 0.0,
        "tasks": sorted(task_stats, key=lambda t: t["completion_rate"], reverse=True),
    }


@router.get("/export", summary="数据导出", description="导出全部历史记录为CSV或JSON格式")
def export_data(
    format: Literal["json", "csv"] = "json",
    current_user: dict = Depends(get_current_user),
):
    """Export pomodoro history as JSON or CSV (REQ-204)."""
    from fastapi.responses import Response
    uid = current_user["id"]
    records = load_history(uid)

    if format == "csv":
        import csv
        import io
        output = io.StringIO()
        if records:
            fieldnames = ["id", "type", "duration_minutes", "completed_at", "started_at", "task_id", "exercise_type", "is_partial"]
            writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for r in records:
                writer.writerow(r)
        csv_content = output.getvalue()
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=polarclock_history.csv"},
        )
    else:
        export_data_json = {
            "exported_at": datetime.now().isoformat(),
            "record_count": len(records),
            "records": records,
        }
        return Response(
            content=json.dumps(export_data_json, indent=2, ensure_ascii=False),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=polarclock_history.json"},
        )


@router.get("/heatmap", summary="活动热力图", description="返回1月/3月/1年范围的每日活动数据用于热力图渲染")
def get_heatmap(time_range: str = Query("1m", alias="range"), current_user: dict = Depends(get_current_user)):
    """Get heatmap data."""
    uid = current_user["id"]
    records = load_history(uid)
    today = datetime.now().date()

    if time_range == "1m":
        days_count = 30
        start_date = today - timedelta(days=days_count - 1)

        daily: dict = {}
        current = start_date
        while current <= today:
            daily[str(current)] = []
            current += timedelta(days=1)

        for r in records:
            try:
                completed = datetime.fromisoformat(r["completed_at"]).date()
                date_str = str(completed)
                if date_str not in daily:
                    continue
                rtype = r.get("type", "")
                if rtype not in ("pomodoro", "exercise", "meditation"):
                    continue
                stored_started = r.get("started_at")
                if stored_started:
                    started_at = stored_started
                else:
                    completed_dt = datetime.fromisoformat(r["completed_at"])
                    started_dt = completed_dt - timedelta(minutes=r.get("duration_minutes", 0))
                    started_at = started_dt.isoformat()
                daily[date_str].append({
                    "started_at": started_at,
                    "duration_minutes": r.get("duration_minutes", 0),
                    "type": rtype,
                })
            except (ValueError, KeyError):
                continue

        days_list = [{"date": d, "sessions": daily[d]} for d in sorted(daily.keys())]
        return {"range": time_range, "days": days_list}

    else:
        days_count = 90 if time_range == "3m" else 365
        start_date = today - timedelta(days=days_count - 1)

        daily_counts: dict = {}
        current = start_date
        while current <= today:
            daily_counts[str(current)] = {
                "date": str(current),
                "pomodoro_count": 0,
                "exercise_count": 0,
                "meditation_count": 0,
            }
            current += timedelta(days=1)

        for r in records:
            try:
                completed = datetime.fromisoformat(r["completed_at"]).date()
                date_str = str(completed)
                if date_str not in daily_counts:
                    continue
                rtype = r.get("type", "")
                if rtype == "pomodoro":
                    daily_counts[date_str]["pomodoro_count"] += 1
                elif rtype == "exercise":
                    daily_counts[date_str]["pomodoro_count"] += 1
                    daily_counts[date_str]["exercise_count"] += 1
                elif rtype == "meditation":
                    daily_counts[date_str]["meditation_count"] += 1
            except (ValueError, KeyError):
                continue

        return {
            "range": time_range,
            "days": sorted(daily_counts.values(), key=lambda d: d["date"]),
        }


@router.get("/peak-hours", summary="高效时段分析", description="按小时×星期聚合番茄钟会话，识别最高效工作时段")
def get_peak_hours(weeks: int = Query(4, ge=1, le=52), current_user: dict = Depends(get_current_user)):
    """Aggregate pomodoro sessions by hour-of-day and day-of-week."""
    uid = current_user["id"]
    records = load_history(uid)
    cutoff = datetime.now() - timedelta(weeks=weeks)

    grid: dict[tuple[int, int], dict] = {}
    for dow in range(7):
        for hour in range(24):
            grid[(dow, hour)] = {"count": 0, "total_minutes": 0}

    for r in records:
        if r.get("type") != "pomodoro":
            continue
        try:
            started = r.get("started_at")
            if not started:
                continue
            dt = datetime.fromisoformat(started)
            if dt < cutoff:
                continue
            key = (dt.weekday(), dt.hour)
            grid[key]["count"] += 1
            grid[key]["total_minutes"] += r.get("duration_minutes", 0)
        except (ValueError, KeyError):
            continue

    slots = []
    peak_count = 0
    for (dow, hour), data in sorted(grid.items()):
        avg_min = round(data["total_minutes"] / max(data["count"], 1), 1)
        slots.append({
            "day_of_week": dow,
            "hour": hour,
            "session_count": data["count"],
            "total_minutes": data["total_minutes"],
            "avg_duration": avg_min,
        })
        if data["count"] > peak_count:
            peak_count = data["count"]

    return {"weeks": weeks, "slots": slots, "peak_count": peak_count}


@router.get("/streak", summary="连续天数", description="返回当前和最长的连续工作天数")
def get_streak(current_user: dict = Depends(get_current_user)):
    """Calculate current and longest pomodoro streaks."""
    uid = current_user["id"]
    records = load_history(uid)

    active_dates: set = set()
    for r in records:
        if r.get("type") != "pomodoro":
            continue
        completed = r.get("completed_at")
        if completed:
            try:
                active_dates.add(datetime.fromisoformat(completed).date())
            except (ValueError, TypeError):
                pass

    if not active_dates:
        return {"current_streak": 0, "longest_streak": 0, "total_active_days": 0}

    sorted_dates = sorted(active_dates)
    today = datetime.now().date()

    longest = 1
    current_run = 1
    for i in range(1, len(sorted_dates)):
        if (sorted_dates[i] - sorted_dates[i - 1]).days == 1:
            current_run += 1
            longest = max(longest, current_run)
        else:
            current_run = 1

    current_streak = 0
    check = today
    while check in active_dates:
        current_streak += 1
        check -= timedelta(days=1)

    return {
        "current_streak": current_streak,
        "longest_streak": longest,
        "total_active_days": len(active_dates),
    }


@router.get("/dashboard", summary="仪表板汇总", description="一次请求获取首页所需的全部统计数据")
def get_dashboard(current_user: dict = Depends(get_current_user)):
    """Aggregate dashboard data: today stats, streak, upcoming deadlines, recent activity."""
    uid = current_user["id"]
    records = load_history(uid)
    today = datetime.now().date()
    now = datetime.now()

    today_records = [
        r for r in records
        if r.get("completed_at", "")[:10] == str(today) and r.get("type") == "pomodoro"
    ]
    today_minutes = sum(r.get("duration_minutes", 0) for r in today_records)

    active_dates: set = set()
    for r in records:
        if r.get("type") == "pomodoro" and r.get("completed_at"):
            try:
                active_dates.add(datetime.fromisoformat(r["completed_at"]).date())
            except (ValueError, TypeError):
                pass

    current_streak = 0
    check = today
    while check in active_dates:
        current_streak += 1
        check -= timedelta(days=1)

    from routers.tasks import load_tasks
    tasks = load_tasks(uid)
    active_tasks = [t for t in tasks.values() if not t.get("archived", False)]

    upcoming = []
    for t in active_tasks:
        if t.get("deadline") and t.get("status") != "completed":
            try:
                dl = datetime.fromisoformat(t["deadline"].replace("Z", "+00:00"))
                hours_left = (dl - now).total_seconds() / 3600
                if 0 < hours_left <= 72:
                    upcoming.append({
                        "id": t["id"],
                        "name": t["name"],
                        "deadline": t["deadline"],
                        "hours_remaining": round(hours_left, 1),
                    })
            except (ValueError, TypeError):
                pass
    upcoming.sort(key=lambda x: x["hours_remaining"])

    recent = sorted(records, key=lambda r: r.get("completed_at", ""), reverse=True)[:5]

    return {
        "today_pomodoros": len(today_records),
        "today_minutes": today_minutes,
        "current_streak": current_streak,
        "active_task_count": len(active_tasks),
        "upcoming_deadlines": upcoming[:5],
        "recent_activity": recent,
    }


@router.get("/weekly-comparison", summary="周对比", description="本周 vs 上周数据对比")
def get_weekly_comparison(current_user: dict = Depends(get_current_user)):
    """Compare this week's productivity with last week."""
    uid = current_user["id"]
    records = load_history(uid)
    today = datetime.now().date()

    this_week_start = today - timedelta(days=today.weekday())
    last_week_start = this_week_start - timedelta(days=7)
    last_week_end = this_week_start - timedelta(days=1)

    def week_stats(start: "date", end: "date") -> dict:
        week_records = []
        for r in records:
            try:
                d = datetime.fromisoformat(r["completed_at"]).date()
                if start <= d <= end:
                    week_records.append(r)
            except (ValueError, KeyError):
                continue
        pomodoros = [r for r in week_records if r.get("type") == "pomodoro"]
        return {
            "pomodoro_count": len(pomodoros),
            "total_minutes": sum(r.get("duration_minutes", 0) for r in pomodoros),
            "sessions": len(week_records),
            "active_days": len(set(
                datetime.fromisoformat(r["completed_at"]).date()
                for r in week_records
                if r.get("completed_at")
            )),
        }

    this_week = week_stats(this_week_start, today)
    last_week = week_stats(last_week_start, last_week_end)

    def delta(this_val: int, last_val: int) -> dict:
        diff = this_val - last_val
        pct = round(diff / last_val * 100, 1) if last_val > 0 else (100.0 if diff > 0 else 0.0)
        return {"value": diff, "percent": pct}

    return {
        "this_week": this_week,
        "last_week": last_week,
        "delta": {
            "pomodoro_count": delta(this_week["pomodoro_count"], last_week["pomodoro_count"]),
            "total_minutes": delta(this_week["total_minutes"], last_week["total_minutes"]),
        },
        "period": {
            "this_week_start": this_week_start.isoformat(),
            "last_week_start": last_week_start.isoformat(),
        },
    }
