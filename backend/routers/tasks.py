from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
import json
import os
import uuid
from datetime import datetime, timedelta

from routers.users import get_current_user, get_user_data_dir
from routers.stats import _history_file

router = APIRouter()


def _tasks_file(user_id: str) -> str:
    return os.path.join(get_user_data_dir(user_id), "tasks.json")


class PositionUpdate(BaseModel):
    id: Optional[str] = None
    task_id: Optional[str] = None
    importance_axis_position: Optional[int] = None
    desire_axis_position: Optional[int] = None


def load_tasks(user_id: str) -> dict:
    fname = _tasks_file(user_id)
    if not os.path.exists(fname):
        return {}
    try:
        with open(fname, "r") as f:
            data = json.load(f)
    except (json.JSONDecodeError, ValueError):
        return {}

    needs_save = False
    all_tasks = list(data.values())
    root_tasks = [t for t in all_tasks if not t.get("parent_id")]

    # ── Phase 1: Migrate float positions (root tasks → 1..N integers) ──
    for t in root_tasks:
        imp = t.get("importance_axis_position", 0)
        des = t.get("desire_axis_position", 0)
        if isinstance(imp, float) or (isinstance(imp, (int, float)) and imp < 1):
            needs_save = True
            break
        if isinstance(des, float) or (isinstance(des, (int, float)) and des < 1):
            needs_save = True
            break

    if needs_save and root_tasks:
        sorted_by_imp = sorted(root_tasks, key=lambda x: x.get("importance_axis_position", 0))
        sorted_by_des = sorted(root_tasks, key=lambda x: x.get("desire_axis_position", 0))
        for i, t in enumerate(sorted_by_imp):
            data[t["id"]]["importance_axis_position"] = i + 1
        for i, t in enumerate(sorted_by_des):
            data[t["id"]]["desire_axis_position"] = i + 1
        needs_save = True

    # ── Phase 2: Fix subtask floats ──
    for t in all_tasks:
        imp = t.get("importance_axis_position", 1)
        des = t.get("desire_axis_position", 1)
        if isinstance(imp, float):
            data[t["id"]]["importance_axis_position"] = max(1, round(imp)) if imp > 0 else 1
            needs_save = True
        if isinstance(des, float):
            data[t["id"]]["desire_axis_position"] = max(1, round(des)) if des > 0 else 1
            needs_save = True

    # ── Phase 3: Migrate start_date/end_date → date_blocks ──
    for t in all_tasks:
        if "date_blocks" not in t:
            start = t.get("start_date")
            end = t.get("end_date")
            if start and end:
                data[t["id"]]["date_blocks"] = [{"start": start, "end": end}]
            elif start:
                data[t["id"]]["date_blocks"] = [{"start": start, "end": start}]
            else:
                data[t["id"]]["date_blocks"] = []
            needs_save = True

    # ── Phase 4: Ensure archived field exists ──
    for t in all_tasks:
        if "archived" not in t:
            data[t["id"]]["archived"] = False
            needs_save = True

    # ── Phase 5: Ensure questions field exists ──
    for t in all_tasks:
        if "questions" not in t:
            data[t["id"]]["questions"] = []
            needs_save = True

    # ── Phase 6: Ensure dependencies field exists ──
    for t in all_tasks:
        if "dependencies" not in t:
            data[t["id"]]["dependencies"] = []
            needs_save = True

    # ── Phase 7: Ensure story field exists ──
    for t in all_tasks:
        if "story" not in t:
            data[t["id"]]["story"] = ""
            needs_save = True

    # ── Phase 8: Ensure tags field exists (REQ-302) ──
    for t in all_tasks:
        if "tags" not in t:
            data[t["id"]]["tags"] = []
            needs_save = True

    if needs_save:
        from routers import atomic_json_write
        atomic_json_write(_tasks_file(user_id), data, indent=2)

    return data


def save_tasks(user_id: str, tasks: dict):
    from routers import atomic_json_write
    atomic_json_write(_tasks_file(user_id), tasks, indent=2)


def _maybe_create_recurring_instance(tasks: dict, completed_task_id: str):
    """When a recurring task is completed, create a new pending instance."""
    task = tasks.get(completed_task_id)
    if not task or not task.get("recurrence"):
        return
    rule = task["recurrence"]
    rtype = rule.get("type", "daily")
    interval = rule.get("interval", 1)

    now = datetime.now()
    if rtype == "daily":
        next_deadline = (now + timedelta(days=interval)).strftime("%Y-%m-%d")
    elif rtype == "weekly":
        next_deadline = (now + timedelta(weeks=interval)).strftime("%Y-%m-%d")
    elif rtype == "monthly":
        month = now.month + interval
        year = now.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        day = min(now.day, 28)
        next_deadline = f"{year}-{month:02d}-{day:02d}"
    else:
        return

    new_id = str(uuid.uuid4())
    new_task = {
        "id": new_id,
        "name": task["name"],
        "deadline": next_deadline,
        "importance_axis_position": task.get("importance_axis_position", 1),
        "desire_axis_position": task.get("desire_axis_position", 1),
        "parent_id": task.get("parent_id"),
        "children": [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "status": "pending",
        "pomodor_completed": 0,
        "pomodor_total": task.get("pomodor_total", 0),
        "start_date": None,
        "end_date": None,
        "date_blocks": [],
        "archived": False,
        "pinned": False,
        "questions": [],
        "dependencies": [],
        "story": task.get("story", ""),
        "tags": task.get("tags", []),
        "recurrence": rule,
        "recurring_from": completed_task_id,
    }
    tasks[new_id] = new_task
    if task.get("parent_id") and task["parent_id"] in tasks:
        parent = tasks[task["parent_id"]]
        if new_id not in parent.get("children", []):
            parent.setdefault("children", []).append(new_id)


def load_history(user_id: str) -> list:
    fname = _history_file(user_id)
    if not os.path.exists(fname):
        return []
    try:
        with open(fname, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return []


def cascade_status(tasks_dict: dict, task_id: str, new_status: str):
    """Recursively set status on task and all descendants."""
    task = tasks_dict.get(task_id)
    if not task:
        return
    task["status"] = new_status
    task["updated_at"] = datetime.now().isoformat()
    for child_id in task.get("children", []):
        cascade_status(tasks_dict, child_id, new_status)


def cascade_archive(tasks_dict: dict, task_id: str, archived: bool):
    """Recursively set archived flag on task and all descendants."""
    task = tasks_dict.get(task_id)
    if not task:
        return
    task["archived"] = archived
    task["updated_at"] = datetime.now().isoformat()
    for child_id in task.get("children", []):
        cascade_archive(tasks_dict, child_id, archived)


def compute_aggregates(tasks_dict):
    """Compute aggregated metrics for parent tasks from their children."""
    all_tasks = list(tasks_dict.values())

    def aggregate(task_id):
        task = tasks_dict.get(task_id)
        if not task:
            return
        children = [t for t in all_tasks if t.get("parent_id") == task_id]
        if not children:
            return

        for child in children:
            aggregate(child["id"])

        children = [tasks_dict[c["id"]] for c in children if c["id"] in tasks_dict]

        task["pomodor_completed"] = sum(c.get("pomodor_completed", 0) for c in children)
        task["pomodor_total"] = sum(c.get("pomodor_total", 0) for c in children)

        statuses = [c.get("status", "pending") for c in children]
        if all(s == "completed" for s in statuses):
            task["status"] = "completed"
        elif any(s == "in_progress" for s in statuses):
            task["status"] = "in_progress"

        # Parent date_blocks = encompassing range of all children blocks
        all_starts = []
        all_ends = []
        for c in children:
            for blk in c.get("date_blocks", []):
                if blk.get("start"):
                    all_starts.append(blk["start"])
                if blk.get("end"):
                    all_ends.append(blk["end"])
        if all_starts and all_ends:
            task["date_blocks"] = [{"start": min(all_starts), "end": max(all_ends)}]

    root_tasks = [t for t in all_tasks if not t.get("parent_id")]
    for root in root_tasks:
        aggregate(root["id"])


def get_leaf_task_ids(tasks_dict: dict) -> set:
    """Return IDs of tasks that have no children (leaf nodes at any depth)."""
    parent_ids = {t["parent_id"] for t in tasks_dict.values() if t.get("parent_id")}
    return {tid for tid in tasks_dict if tid not in parent_ids}


class RecurrenceRule(BaseModel):
    type: Literal["daily", "weekly", "monthly"] = "daily"
    interval: int = Field(1, ge=1, le=365)


class TaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    deadline: Optional[str] = None
    parent_id: Optional[str] = None
    pomodor_total: Optional[int] = Field(None, ge=1, le=999)
    tags: Optional[List[str]] = Field(None, max_length=50)
    recurrence: Optional[RecurrenceRule] = None


class TaskUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=500)
    deadline: Optional[str] = None
    status: Optional[Literal["pending", "in_progress", "completed"]] = None
    importance_axis_position: Optional[int] = Field(None, ge=0)
    desire_axis_position: Optional[int] = Field(None, ge=0)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    date_blocks: Optional[List[dict]] = None   # [{start, end}, ...]
    pomodor_total: Optional[int] = Field(None, ge=1, le=999)
    pomodor_completed: Optional[int] = Field(None, ge=0, le=999)
    archived: Optional[bool] = None
    pinned: Optional[bool] = None
    questions: Optional[List[dict]] = None     # [{id, question, answer}, ...]
    dependencies: Optional[List[str]] = None   # [task_id, ...] — root tasks only
    story: Optional[str] = Field(None, max_length=10000)
    tags: Optional[List[str]] = Field(None, max_length=50)
    recurrence: Optional[RecurrenceRule] = None


class ReorderRequest(BaseModel):
    task_id: str
    axis: Literal["importance", "desire"]
    new_position: int


@router.get("")
def get_tasks(include_archived: bool = False, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    tasks = load_tasks(uid)
    compute_aggregates(tasks)

    # Deadline urgency boost
    now = datetime.now()
    for task_id, task in tasks.items():
        if task.get("deadline") and task.get("status") != "completed":
            try:
                deadline = datetime.fromisoformat(task["deadline"].replace("Z", "+00:00"))
                hours_until = (deadline - now).total_seconds() / 3600
                if 0 < hours_until <= 48:
                    task["importance_axis_position"] = 1
            except (ValueError, TypeError):
                pass

    result = list(tasks.values())
    if not include_archived:
        result = [t for t in result if not t.get("archived", False)]

    return result


@router.get("/gantt-data", summary="甘特图数据", description="返回任务的日期区间和实际记录用于甘特图渲染")
def get_gantt_data(include_archived: bool = False, current_user: dict = Depends(get_current_user)):
    """Return tasks + actual work records for Gantt chart."""
    uid = current_user["id"]
    tasks = load_tasks(uid)
    compute_aggregates(tasks)
    history = load_history(uid)

    actuals: dict = {}
    for record in history:
        tid = record.get("task_id")
        if tid:
            if tid not in actuals:
                actuals[tid] = []
            completed_at = record.get("completed_at")
            started_at = record.get("started_at")
            if not started_at and completed_at:
                try:
                    completed_dt = datetime.fromisoformat(completed_at)
                    started_dt = completed_dt - timedelta(minutes=record.get("duration_minutes", 0))
                    started_at = started_dt.isoformat()
                except Exception:
                    started_at = completed_at
            actuals[tid].append({
                "id": record.get("id"),
                "type": record.get("type"),
                "duration_minutes": record.get("duration_minutes"),
                "completed_at": completed_at,
                "started_at": started_at,
            })

    result = list(tasks.values())
    if not include_archived:
        result = [t for t in result if not t.get("archived", False)]

    return {"tasks": result, "actuals": actuals}


@router.get("/search")
def search_tasks(
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    include_archived: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """Full-text search across task names, stories, and tags."""
    uid = current_user["id"]
    tasks = load_tasks(uid)
    compute_aggregates(tasks)
    query = q.lower()

    matches = []
    for t in tasks.values():
        if not include_archived and t.get("archived", False):
            continue
        name_match = query in t.get("name", "").lower()
        story_match = query in (t.get("story") or "").lower()
        tag_match = any(query in tag.lower() for tag in t.get("tags", []))
        if name_match or story_match or tag_match:
            matches.append(t)

    return {"total": len(matches), "results": matches}


@router.get("/meta/tags", summary="获取所有标签", description="返回所有已使用标签及其出现次数")
def get_all_tags(current_user: dict = Depends(get_current_user)):
    """Return all unique tags used across tasks (REQ-302)."""
    uid = current_user["id"]
    tasks = load_tasks(uid)
    tags: dict = {}
    for t in tasks.values():
        for tag in t.get("tags", []):
            if tag not in tags:
                tags[tag] = 0
            tags[tag] += 1
    return [{"tag": tag, "count": count} for tag, count in sorted(tags.items())]


@router.get("/meta/by-tag/{tag}")
def get_tasks_by_tag(tag: str, include_archived: bool = False, current_user: dict = Depends(get_current_user)):
    """Return tasks filtered by tag (REQ-302)."""
    uid = current_user["id"]
    tasks = load_tasks(uid)
    compute_aggregates(tasks)
    result = [t for t in tasks.values() if tag in t.get("tags", [])]
    if not include_archived:
        result = [t for t in result if not t.get("archived", False)]
    return result


@router.get("/{task_id}")
def get_task(task_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    tasks = load_tasks(uid)
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="任务不存在")
    compute_aggregates(tasks)
    return tasks[task_id]


@router.post("", summary="创建任务", description="创建新任务，支持父任务、标签、优先级等")
def create_task(data: TaskCreate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    tasks = load_tasks(uid)
    task_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    # ── Determine initial rank positions ────────────────────────────────────────
    # Leaf tasks are the ones that participate in importance/desire ranking.
    # We need positions BEFORE adding the new task.
    leaf_ids = get_leaf_task_ids(tasks)
    current_leaf_count = len(leaf_ids)

    if data.parent_id and data.parent_id in tasks:
        parent = tasks[data.parent_id]
        sibling_count = len(parent.get("children", []))

        if sibling_count == 0:
            # ── First child: inherit parent's ranking positions ──────────────────
            # Parent was a leaf; it exits the leaf pool and this child steps into
            # its exact rank slot. Other leaf ranks stay unchanged.
            imp_pos = parent.get("importance_axis_position", current_leaf_count + 1)
            des_pos = parent.get("desire_axis_position", current_leaf_count + 1)
            # Parent leaves the leaf pool: its slot is now occupied by the child.
            # No renumbering needed — positions of other leaves are untouched.
        else:
            # ── Subsequent child: append at the bottom of the leaf ranking ───────
            # After adding this task the leaf count grows by 1 (since parent was
            # already a non-leaf, one existing leaf is NOT displaced).
            imp_pos = current_leaf_count + 1
            des_pos = current_leaf_count + 1
    else:
        # ── New root task: append at the bottom of the leaf ranking ─────────────
        imp_pos = current_leaf_count + 1
        des_pos = current_leaf_count + 1

    task = {
        "id": task_id,
        "name": data.name,
        "deadline": data.deadline,
        "importance_axis_position": imp_pos,
        "desire_axis_position": des_pos,
        "parent_id": data.parent_id,
        "children": [],
        "created_at": now,
        "updated_at": now,
        "status": "pending",
        "pomodor_completed": 0,
        "pomodor_total": data.pomodor_total or 0,
        "start_date": None,
        "end_date": None,
        "date_blocks": [],
        "archived": False,
        "pinned": False,
        "questions": [],
        "dependencies": [],
        "story": "",
        "tags": data.tags or [],
        "recurrence": data.recurrence.model_dump() if data.recurrence else None,
    }
    if data.parent_id:
        if data.parent_id not in tasks:
            raise HTTPException(status_code=404, detail="父任务不存在")
        tasks[data.parent_id]["children"].append(task_id)
    tasks[task_id] = task
    save_tasks(uid, tasks)
    return task


@router.put("/{task_id}")
def update_task(task_id: str, data: TaskUpdate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    tasks = load_tasks(uid)
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="任务不存在")
    task = tasks[task_id]

    if data.name is not None:
        task["name"] = data.name
    if data.deadline is not None:
        task["deadline"] = data.deadline
    if data.importance_axis_position is not None:
        task["importance_axis_position"] = data.importance_axis_position
    if data.desire_axis_position is not None:
        task["desire_axis_position"] = data.desire_axis_position
    if data.start_date is not None:
        task["start_date"] = data.start_date
    if data.end_date is not None:
        task["end_date"] = data.end_date
    if data.date_blocks is not None:
        task["date_blocks"] = data.date_blocks
        # Keep start_date/end_date in sync for backwards compat
        if data.date_blocks:
            all_starts = [b["start"] for b in data.date_blocks if b.get("start")]
            all_ends   = [b["end"]   for b in data.date_blocks if b.get("end")]
            task["start_date"] = min(all_starts) if all_starts else None
            task["end_date"]   = max(all_ends)   if all_ends   else None
        else:
            task["start_date"] = None
            task["end_date"]   = None
    if data.pomodor_total is not None:
        task["pomodor_total"] = data.pomodor_total
    if data.pomodor_completed is not None:
        task["pomodor_completed"] = data.pomodor_completed
    if data.pinned is not None:
        task["pinned"] = data.pinned
    if data.questions is not None:
        task["questions"] = data.questions
    if data.dependencies is not None:
        task["dependencies"] = data.dependencies
    if data.story is not None:
        task["story"] = data.story
    if data.tags is not None:
        task["tags"] = data.tags
    if data.recurrence is not None:
        task["recurrence"] = data.recurrence.model_dump()

    # Status change with cascade
    if data.status is not None:
        cascade_status(tasks, task_id, data.status)
        if data.status == "completed":
            cascade_archive(tasks, task_id, True)
            _maybe_create_recurring_instance(tasks, task_id)
        elif data.status in ("pending", "in_progress"):
            cascade_archive(tasks, task_id, False)

    # Explicit archived toggle
    if data.archived is not None:
        cascade_archive(tasks, task_id, data.archived)
        if not data.archived:
            # Restoring: also set status to pending
            cascade_status(tasks, task_id, "pending")

    task["updated_at"] = datetime.now().isoformat()
    tasks[task_id] = task
    save_tasks(uid, tasks)
    return task


@router.delete("/{task_id}", summary="删除/归档任务", description="软删除任务(归档)或硬删除")
def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    tasks = load_tasks(uid)
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="任务不存在")

    task = tasks[task_id]
    is_root = not task.get("parent_id")

    if task["parent_id"] and task["parent_id"] in tasks:
        parent = tasks[task["parent_id"]]
        if task_id in parent["children"]:
            parent["children"].remove(task_id)

    def delete_recursive(tid):
        t = tasks.get(tid)
        if not t:
            return
        for child_id in list(t.get("children", [])):
            delete_recursive(child_id)
        del tasks[tid]

    delete_recursive(task_id)

    # After deletion, renumber ALL leaf tasks (leaves may have changed if the
    # deleted task was the last child, making its parent a leaf again).
    for axis in ("importance_axis_position", "desire_axis_position"):
        leaf_ids_after = get_leaf_task_ids(tasks)
        sorted_leaves = sorted(
            [t for tid, t in tasks.items() if tid in leaf_ids_after],
            key=lambda x: x.get(axis, 999)
        )
        for i, t in enumerate(sorted_leaves):
            t[axis] = i + 1

    save_tasks(uid, tasks)
    return {"ok": True}


@router.post("/reorder", summary="重排任务顺序", description="批量更新任务排序位置")
def reorder_task(data: ReorderRequest, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    tasks = load_tasks(uid)

    if data.task_id not in tasks:
        raise HTTPException(status_code=404, detail="任务不存在")

    field = f"{data.axis}_axis_position"
    task = tasks[data.task_id]
    old_pos = task.get(field, 1)
    new_pos = data.new_position

    if old_pos == new_pos:
        return {"ok": True}

    # ── Operate on leaf tasks (only leaves participate in ranking) ────────────
    leaf_ids = get_leaf_task_ids(tasks)
    leaf_tasks = {tid: t for tid, t in tasks.items() if tid in leaf_ids}
    max_pos = len(leaf_tasks)
    new_pos = max(1, min(max_pos, new_pos))

    if new_pos > old_pos:
        for tid, t in leaf_tasks.items():
            pos = t.get(field, 0)
            if old_pos < pos <= new_pos:
                t[field] = pos - 1
    else:
        for tid, t in leaf_tasks.items():
            pos = t.get(field, 0)
            if new_pos <= pos < old_pos:
                t[field] = pos + 1

    task[field] = new_pos
    save_tasks(uid, tasks)
    return {"ok": True, "positions": {tid: t.get(field) for tid, t in leaf_tasks.items()}}


@router.put("/{task_id}/position")
def update_position(task_id: str,
                    importance_axis_position: Optional[float] = None,
                    desire_axis_position: Optional[float] = None,
                    current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    tasks = load_tasks(uid)
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="任务不存在")
    if importance_axis_position is not None:
        tasks[task_id]["importance_axis_position"] = int(importance_axis_position)
    if desire_axis_position is not None:
        tasks[task_id]["desire_axis_position"] = int(desire_axis_position)
    tasks[task_id]["updated_at"] = datetime.now().isoformat()
    save_tasks(uid, tasks)
    return tasks[task_id]


@router.post("/bulk-update-positions")
def bulk_update_positions(updates: List[PositionUpdate], current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    tasks = load_tasks(uid)
    for u in updates:
        tid = u.id or u.task_id
        if tid and tid in tasks:
            if u.importance_axis_position is not None:
                tasks[tid]["importance_axis_position"] = u.importance_axis_position
            if u.desire_axis_position is not None:
                tasks[tid]["desire_axis_position"] = u.desire_axis_position
    save_tasks(uid, tasks)
    return {"ok": True}


@router.post("/{task_id}/start-pomodoro")
def start_pomodoro(task_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    tasks = load_tasks(uid)
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="任务不存在")
    tasks[task_id]["status"] = "in_progress"
    tasks[task_id]["updated_at"] = datetime.now().isoformat()
    save_tasks(uid, tasks)
    return tasks[task_id]


class BulkActionRequest(BaseModel):
    task_ids: List[str] = Field(..., min_length=1, max_length=200)


@router.post("/bulk/archive")
def bulk_archive(data: BulkActionRequest, current_user: dict = Depends(get_current_user)):
    """Archive multiple tasks at once."""
    uid = current_user["id"]
    tasks = load_tasks(uid)
    archived = []
    for tid in data.task_ids:
        if tid in tasks:
            tasks[tid]["archived"] = True
            tasks[tid]["updated_at"] = datetime.now().isoformat()
            archived.append(tid)
    save_tasks(uid, tasks)
    return {"ok": True, "archived_count": len(archived), "archived_ids": archived}


@router.post("/bulk/delete")
def bulk_delete(data: BulkActionRequest, current_user: dict = Depends(get_current_user)):
    """Delete multiple tasks at once (recursive, includes children)."""
    uid = current_user["id"]
    tasks = load_tasks(uid)
    deleted = []

    def delete_recursive(tid: str):
        if tid not in tasks:
            return
        for child_id in list(tasks[tid].get("children", [])):
            delete_recursive(child_id)
        del tasks[tid]
        deleted.append(tid)

    for tid in data.task_ids:
        delete_recursive(tid)

    save_tasks(uid, tasks)
    return {"ok": True, "deleted_count": len(deleted), "deleted_ids": deleted}


@router.get("/meta/stats")
def get_task_stats(current_user: dict = Depends(get_current_user)):
    """Return task counts by status and overall metrics."""
    uid = current_user["id"]
    tasks = load_tasks(uid)
    all_tasks = list(tasks.values())
    active = [t for t in all_tasks if not t.get("archived", False)]
    archived = [t for t in all_tasks if t.get("archived", False)]

    status_counts = {"pending": 0, "in_progress": 0, "completed": 0}
    for t in active:
        s = t.get("status", "pending")
        if s in status_counts:
            status_counts[s] += 1

    total_active = len(active)
    completion_rate = (
        round(status_counts["completed"] / total_active * 100, 1)
        if total_active > 0 else 0.0
    )

    overdue = 0
    now = datetime.now()
    for t in active:
        if t.get("deadline") and t.get("status") != "completed":
            try:
                dl = datetime.fromisoformat(t["deadline"].replace("Z", "+00:00"))
                if dl < now:
                    overdue += 1
            except (ValueError, TypeError):
                pass

    return {
        "total": len(all_tasks),
        "active": total_active,
        "archived": len(archived),
        "by_status": status_counts,
        "completion_rate": completion_rate,
        "overdue": overdue,
    }
