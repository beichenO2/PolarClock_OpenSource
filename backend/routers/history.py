from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from datetime import datetime
import uuid

from routers.users import get_current_user
from routers.stats import load_history, save_history

router = APIRouter()


class HistoryCreate(BaseModel):
    type: Literal["pomodoro", "exercise", "break", "meditation"]
    duration_minutes: int = Field(..., ge=0, le=1440)
    task_id: Optional[str] = None
    exercise_type: Optional[Literal["boxing", "running"]] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    is_partial: bool = False


class HistoryRecord(BaseModel):
    id: str
    type: str
    duration_minutes: int
    completed_at: str
    started_at: Optional[str] = None
    task_id: Optional[str] = None
    exercise_type: Optional[str] = None
    is_partial: bool = False


class HistoryListResponse(BaseModel):
    total: int
    records: List[HistoryRecord]


@router.post("", response_model=HistoryRecord, summary="记录新会话", description="手动添加番茄钟/运动/冥想历史记录")
def create_history(data: HistoryCreate, current_user: dict = Depends(get_current_user)):
    """Record a pomodoro/exercise/meditation session (REQ-201)."""
    uid = current_user["id"]
    now = datetime.now().isoformat()

    record = {
        "id": str(uuid.uuid4()),
        "type": data.type,
        "duration_minutes": data.duration_minutes,
        "completed_at": data.completed_at or now,
        "started_at": data.started_at or now,
        "task_id": data.task_id,
        "exercise_type": data.exercise_type,
        "is_partial": data.is_partial,
    }

    records = load_history(uid)
    records.append(record)
    save_history(uid, records)
    return record


@router.get("", summary="查询历史记录", description="按日期范围、类型、任务ID过滤历史记录，支持分页")
def list_history(
    start_date: Optional[str] = Query(None, description="Filter start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Filter end date (YYYY-MM-DD)"),
    task_id: Optional[str] = Query(None, description="Filter by task ID"),
    record_type: Optional[str] = Query(None, alias="type", description="Filter by type"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    """List pomodoro session history with optional date/task filters (REQ-201)."""
    uid = current_user["id"]
    records = load_history(uid)

    if start_date:
        records = [
            r for r in records
            if r.get("completed_at", "")[:10] >= start_date
        ]

    if end_date:
        records = [
            r for r in records
            if r.get("completed_at", "")[:10] <= end_date
        ]

    if task_id:
        records = [r for r in records if r.get("task_id") == task_id]

    if record_type:
        records = [r for r in records if r.get("type") == record_type]

    total = len(records)
    records = list(reversed(records))
    page = records[offset:offset + limit]

    return {"total": total, "records": page}


@router.delete("/{record_id}", summary="删除历史记录")
def delete_history(record_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a specific history record."""
    uid = current_user["id"]
    records = load_history(uid)
    new_records = [r for r in records if r.get("id") != record_id]
    if len(new_records) == len(records):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="记录不存在")
    save_history(uid, new_records)
    return {"ok": True}
