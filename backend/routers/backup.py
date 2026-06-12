from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json
import os
import shutil

from routers.users import get_current_user, get_user_data_dir

router = APIRouter()

BACKUP_DIR_NAME = "backups"
DATA_FILES = ["tasks.json", "pomodoro_history.json", "habits.json", "schedule.json", "preferences.json"]


def _backup_dir(user_id: str) -> str:
    d = os.path.join(get_user_data_dir(user_id), BACKUP_DIR_NAME)
    os.makedirs(d, exist_ok=True)
    return d


@router.get("", summary="列出备份", description="返回用户所有可用备份及其元信息")
def list_backups(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    bdir = _backup_dir(uid)
    backups = []
    for name in sorted(os.listdir(bdir), reverse=True):
        fpath = os.path.join(bdir, name)
        if not os.path.isdir(fpath):
            continue
        meta_file = os.path.join(fpath, "meta.json")
        meta = {}
        if os.path.exists(meta_file):
            try:
                with open(meta_file) as f:
                    meta = json.load(f)
            except Exception:
                pass
        backups.append({
            "id": name,
            "created_at": meta.get("created_at", name),
            "description": meta.get("description", ""),
            "files": meta.get("files", []),
        })
    return backups


@router.post("", summary="创建备份", description="备份当前所有用户数据文件")
def create_backup(
    description: Optional[str] = "",
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["id"]
    user_dir = get_user_data_dir(uid)
    bdir = _backup_dir(uid)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(bdir, timestamp)
    os.makedirs(backup_path, exist_ok=True)

    backed_up = []
    for fname in DATA_FILES:
        src = os.path.join(user_dir, fname)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(backup_path, fname))
            backed_up.append(fname)

    meta = {
        "created_at": datetime.now().isoformat(),
        "description": description or f"Backup {timestamp}",
        "files": backed_up,
    }
    from routers import atomic_json_write
    atomic_json_write(os.path.join(backup_path, "meta.json"), meta, indent=2)

    return {"id": timestamp, **meta}


class DiffItem(BaseModel):
    file: str
    status: str
    current_records: int = 0
    backup_records: int = 0


@router.get("/{backup_id}/diff", summary="备份对比", description="对比当前数据与备份的差异")
def diff_backup(backup_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    user_dir = get_user_data_dir(uid)
    backup_path = os.path.join(_backup_dir(uid), backup_id)
    if not os.path.isdir(backup_path):
        raise HTTPException(status_code=404, detail="Backup not found")

    diffs = []
    for fname in DATA_FILES:
        current_file = os.path.join(user_dir, fname)
        backup_file = os.path.join(backup_path, fname)
        has_current = os.path.exists(current_file)
        has_backup = os.path.exists(backup_file)

        if not has_current and not has_backup:
            continue

        def count_records(fpath: str) -> int:
            try:
                with open(fpath) as f:
                    data = json.load(f)
                if isinstance(data, list):
                    return len(data)
                if isinstance(data, dict):
                    return len(data)
                return 1
            except Exception:
                return 0

        cur_count = count_records(current_file) if has_current else 0
        bak_count = count_records(backup_file) if has_backup else 0

        if not has_backup:
            status = "new"
        elif not has_current:
            status = "deleted"
        elif cur_count != bak_count:
            status = "modified"
        else:
            try:
                with open(current_file) as f:
                    cur_data = f.read()
                with open(backup_file) as f:
                    bak_data = f.read()
                status = "unchanged" if cur_data == bak_data else "modified"
            except Exception:
                status = "unknown"

        diffs.append({
            "file": fname,
            "status": status,
            "current_records": cur_count,
            "backup_records": bak_count,
        })

    return {"backup_id": backup_id, "diffs": diffs}


@router.post("/{backup_id}/restore", summary="恢复备份", description="从指定备份恢复数据文件")
def restore_backup(backup_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    user_dir = get_user_data_dir(uid)
    backup_path = os.path.join(_backup_dir(uid), backup_id)
    if not os.path.isdir(backup_path):
        raise HTTPException(status_code=404, detail="Backup not found")

    auto_backup = create_backup(description=f"Auto-backup before restore from {backup_id}", current_user=current_user)

    restored = []
    for fname in DATA_FILES:
        src = os.path.join(backup_path, fname)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(user_dir, fname))
            restored.append(fname)

    return {
        "ok": True,
        "restored_files": restored,
        "auto_backup_id": auto_backup["id"],
    }


@router.delete("/{backup_id}", summary="删除备份")
def delete_backup(backup_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    backup_path = os.path.join(_backup_dir(uid), backup_id)
    if not os.path.isdir(backup_path):
        raise HTTPException(status_code=404, detail="Backup not found")
    shutil.rmtree(backup_path)
    return {"ok": True}
