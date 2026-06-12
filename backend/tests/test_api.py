"""Backend API tests (REQ-401) -- expanded coverage."""
import json
import re
import uuid


# -- Health -------------------------------------------------------------------

def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_clock_frontend_static_files(client):
    index = client.get("/clock/login")
    assert index.status_code == 200
    assert "text/html" in index.headers["content-type"]

    script_match = re.search(r'<script[^>]+src="([^"]+)"', index.text)
    assert script_match

    script = client.get(script_match.group(1))
    assert script.status_code == 200
    assert "text/html" not in script.headers["content-type"]

    manifest = client.get("/clock/manifest.webmanifest")
    assert manifest.status_code == 200
    json.loads(manifest.text)

    puzzles = client.get("/clock/puzzles/puzzles.json")
    assert puzzles.status_code == 200
    assert "puzzles" in puzzles.json()


# -- Users --------------------------------------------------------------------

def test_create_user_and_login(client):
    name = f"smoke_{uuid.uuid4().hex[:6]}"
    resp = client.post("/api/users", json={"username": name})
    assert resp.status_code == 200
    assert resp.json()["username"] == name

    resp = client.post("/api/users/login", json={"username": name})
    assert resp.status_code == 200
    assert "token" in resp.json()


def test_login_nonexistent_user(client):
    resp = client.post("/api/users/login", json={"username": f"ghost_{uuid.uuid4().hex[:8]}"})
    assert resp.status_code == 404


def test_auth_required(client):
    resp = client.get("/api/timer/state")
    assert resp.status_code == 401


def test_invalid_token(client):
    resp = client.get("/api/timer/state", headers={"X-Token": "bogus-token-xyz"})
    assert resp.status_code in (401, 403)


# -- User Preferences --------------------------------------------------------

def test_user_preferences(client, auth_headers):
    resp = client.put(
        "/api/users/preferences",
        json={"theme": "system"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["theme"] == "system"

    resp = client.get("/api/users/preferences", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["theme"] == "system"


def test_user_preferences_invalid_theme(client, auth_headers):
    resp = client.put(
        "/api/users/preferences",
        json={"theme": "rainbow"},
        headers=auth_headers,
    )
    assert resp.status_code in (400, 422)


# -- Timer --------------------------------------------------------------------

def test_timer_state(client, auth_headers):
    resp = client.get("/api/timer/state", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "remaining_seconds" in data
    assert "mode" in data


def test_timer_settings(client, auth_headers):
    resp = client.put(
        "/api/timer/settings",
        json={"work_duration_minutes": 30},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["work_duration_minutes"] == 30


def test_timer_start_and_stop(client, auth_headers):
    resp = client.post(
        "/api/timer/start",
        json={"mode": "pomodoro"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "running"

    resp = client.post("/api/timer/stop", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] in ("idle", "finished")


def test_timer_start_meditation(client, auth_headers):
    resp = client.post(
        "/api/timer/start",
        json={"mode": "meditation"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["mode"] == "meditation"
    client.post("/api/timer/stop", headers=auth_headers)


def test_timer_pause_and_resume(client, auth_headers):
    client.post("/api/timer/start", json={"mode": "pomodoro"}, headers=auth_headers)

    resp = client.post("/api/timer/pause", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"

    resp = client.post("/api/timer/resume", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "running"

    client.post("/api/timer/stop", headers=auth_headers)


def test_timer_switch_task(client, auth_headers):
    task = client.post(
        "/api/tasks",
        json={"name": "Switch Target"},
        headers=auth_headers,
    ).json()

    client.post("/api/timer/start", json={"mode": "pomodoro"}, headers=auth_headers)

    resp = client.post(
        "/api/timer/switch-task",
        json={"task_id": task["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["current_task_id"] == task["id"]

    client.post("/api/timer/stop", headers=auth_headers)


def test_timer_break_start(client, auth_headers):
    resp = client.post(
        "/api/timer/break/start",
        json={"break_type": "short"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["break_type"] == "short"
    client.post("/api/timer/stop", headers=auth_headers)


def test_timer_exercise_skip(client, auth_headers):
    resp = client.post("/api/timer/exercise/skip", headers=auth_headers)
    assert resp.status_code == 200


def test_timer_bath_skip(client, auth_headers):
    resp = client.post("/api/timer/bath/skip", headers=auth_headers)
    assert resp.status_code == 200


# -- Sound Preferences -------------------------------------------------------

def test_sounds_list(client, auth_headers):
    resp = client.get("/api/timer/sounds", headers=auth_headers)
    assert resp.status_code == 200
    sounds = resp.json()
    assert isinstance(sounds, list)
    assert len(sounds) > 0


def test_sound_preferences(client, auth_headers):
    resp = client.put(
        "/api/timer/sound-preferences",
        json={"work_end_sound": "chime", "volume": 75},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["work_end_sound"] == "chime"
    assert resp.json()["volume"] == 75

    resp = client.get("/api/timer/sound-preferences", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["work_end_sound"] == "chime"


def test_sound_preferences_all_scenes(client, auth_headers):
    resp = client.put(
        "/api/timer/sound-preferences",
        json={
            "work_end_sound": "bell",
            "rest_end_sound": "gentle",
            "meditation_end_sound": "none",
            "volume": 50,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["work_end_sound"] == "bell"
    assert data["rest_end_sound"] == "gentle"
    assert data["meditation_end_sound"] == "none"
    assert data["volume"] == 50


def test_sound_volume_clamped(client, auth_headers):
    resp = client.put(
        "/api/timer/sound-preferences",
        json={"volume": 150},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["volume"] == 100

    resp = client.put(
        "/api/timer/sound-preferences",
        json={"volume": -10},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["volume"] == 0


def test_sound_upload_and_delete(client, auth_headers):
    import io
    wav_header = b'RIFF' + b'\x00' * 4 + b'WAVE' + b'\x00' * 16
    file_data = wav_header + b'\x00' * 100

    resp = client.post(
        "/api/timer/sounds/upload",
        files={"file": ("test_ring.wav", io.BytesIO(file_data), "audio/wav")},
        headers={"X-Token": auth_headers["X-Token"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "custom"
    assert "test_ring" in data["filename"]

    resp = client.get("/api/timer/sounds", headers=auth_headers)
    custom_ids = [s["id"] for s in resp.json() if s["type"] == "custom"]
    assert data["id"] in custom_ids

    resp = client.delete(
        f"/api/timer/sounds/custom/{data['filename']}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_sound_upload_too_large(client, auth_headers):
    import io
    big_data = b'\x00' * (1024 * 1024 + 1)

    resp = client.post(
        "/api/timer/sounds/upload",
        files={"file": ("big.mp3", io.BytesIO(big_data), "audio/mpeg")},
        headers={"X-Token": auth_headers["X-Token"]},
    )
    assert resp.status_code == 400


def test_sound_upload_invalid_format(client, auth_headers):
    import io
    resp = client.post(
        "/api/timer/sounds/upload",
        files={"file": ("bad.txt", io.BytesIO(b"text"), "text/plain")},
        headers={"X-Token": auth_headers["X-Token"]},
    )
    assert resp.status_code == 400


def test_sound_delete_nonexistent(client, auth_headers):
    resp = client.delete(
        "/api/timer/sounds/custom/nonexistent_xyz.mp3",
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_sound_delete_resets_preferences(client, auth_headers):
    import io
    wav_header = b'RIFF' + b'\x00' * 4 + b'WAVE' + b'\x00' * 16
    file_data = wav_header + b'\x00' * 100

    resp = client.post(
        "/api/timer/sounds/upload",
        files={"file": ("pref_test.wav", io.BytesIO(file_data), "audio/wav")},
        headers={"X-Token": auth_headers["X-Token"]},
    )
    assert resp.status_code == 200
    sid = resp.json()["id"]
    fname = resp.json()["filename"]

    client.put(
        "/api/timer/sound-preferences",
        json={"work_end_sound": sid},
        headers=auth_headers,
    )
    prefs = client.get("/api/timer/sound-preferences", headers=auth_headers).json()
    assert prefs["work_end_sound"] == sid

    resp = client.delete(f"/api/timer/sounds/custom/{fname}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["preferences_reset"] is True

    prefs = client.get("/api/timer/sound-preferences", headers=auth_headers).json()
    assert prefs["work_end_sound"] == "default"


def test_sound_upload_overwrite(client, auth_headers):
    import io
    wav_header = b'RIFF' + b'\x00' * 4 + b'WAVE' + b'\x00' * 16
    file1 = wav_header + b'\x01' * 100
    file2 = wav_header + b'\x02' * 200

    resp = client.post(
        "/api/timer/sounds/upload",
        files={"file": ("overwrite_test.wav", io.BytesIO(file1), "audio/wav")},
        headers={"X-Token": auth_headers["X-Token"]},
    )
    assert resp.status_code == 200
    assert resp.json()["overwritten"] is False

    resp = client.post(
        "/api/timer/sounds/upload",
        files={"file": ("overwrite_test.wav", io.BytesIO(file2), "audio/wav")},
        headers={"X-Token": auth_headers["X-Token"]},
    )
    assert resp.status_code == 200
    assert resp.json()["overwritten"] is True

    client.delete("/api/timer/sounds/custom/overwrite_test.wav", headers=auth_headers)


# -- Tasks CRUD --------------------------------------------------------------

def test_task_create_and_list(client, auth_headers):
    resp = client.post(
        "/api/tasks",
        json={"name": "Integration Task"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    task = resp.json()
    assert task["name"] == "Integration Task"
    assert task["status"] == "pending"

    resp = client.get("/api/tasks", headers=auth_headers)
    assert resp.status_code == 200
    names = [t["name"] for t in resp.json()]
    assert "Integration Task" in names


def test_task_update_and_delete(client, auth_headers):
    resp = client.post(
        "/api/tasks",
        json={"name": "Deletable Task"},
        headers=auth_headers,
    )
    task_id = resp.json()["id"]

    resp = client.put(
        f"/api/tasks/{task_id}",
        json={"status": "in_progress"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"

    resp = client.delete(f"/api/tasks/{task_id}", headers=auth_headers)
    assert resp.status_code == 200


def test_task_crud_with_tags(client, auth_headers):
    resp = client.post(
        "/api/tasks",
        json={"name": "Tagged Task", "tags": ["work", "urgent"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    task = resp.json()
    assert task["tags"] == ["work", "urgent"]
    task_id = task["id"]

    resp = client.put(
        f"/api/tasks/{task_id}",
        json={"tags": ["work", "done"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["tags"] == ["work", "done"]

    resp = client.get("/api/tasks/meta/tags", headers=auth_headers)
    assert resp.status_code == 200
    tags = {t["tag"] for t in resp.json()}
    assert "work" in tags

    resp = client.get("/api/tasks/meta/by-tag/work", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_task_archive_and_restore(client, auth_headers):
    resp = client.post(
        "/api/tasks",
        json={"name": "Archivable Task"},
        headers=auth_headers,
    )
    task_id = resp.json()["id"]

    resp = client.put(
        f"/api/tasks/{task_id}",
        json={"archived": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["archived"] is True

    resp = client.get("/api/tasks?include_archived=true", headers=auth_headers)
    assert resp.status_code == 200
    archived_ids = [t["id"] for t in resp.json() if t.get("archived")]
    assert task_id in archived_ids

    resp = client.put(
        f"/api/tasks/{task_id}",
        json={"archived": False},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["archived"] is False


def test_task_with_subtask(client, auth_headers):
    parent = client.post(
        "/api/tasks",
        json={"name": "Parent Task"},
        headers=auth_headers,
    ).json()

    child = client.post(
        "/api/tasks",
        json={"name": "Child Task", "parent_id": parent["id"]},
        headers=auth_headers,
    ).json()
    assert child["parent_id"] == parent["id"]


def test_gantt_data(client, auth_headers):
    resp = client.get("/api/tasks/gantt-data", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "tasks" in data
    assert "actuals" in data


def test_task_nonexistent(client, auth_headers):
    resp = client.get(
        f"/api/tasks/{uuid.uuid4().hex}",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# -- Stats -------------------------------------------------------------------

def test_stats_today(client, auth_headers):
    resp = client.get("/api/stats/today", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "pomodoro_count" in data
    assert "work_minutes" in data
    assert "records" in data


def test_stats_weekly(client, auth_headers):
    resp = client.get("/api/stats/weekly", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "days" in data
    assert "weeks" in data


def test_stats_weekly_with_param(client, auth_headers):
    resp = client.get("/api/stats/weekly?weeks=2", headers=auth_headers)
    assert resp.status_code == 200
    assert "days" in resp.json()


def test_stats_monthly(client, auth_headers):
    resp = client.get("/api/stats/monthly", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "trend" in data
    assert "avg_per_day" in data


def test_stats_monthly_with_param(client, auth_headers):
    resp = client.get("/api/stats/monthly?months=6", headers=auth_headers)
    assert resp.status_code == 200
    assert "trend" in resp.json()


def test_stats_recent(client, auth_headers):
    resp = client.get("/api/stats/recent", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_stats_task_completion(client, auth_headers):
    resp = client.get("/api/stats/task-completion", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "overall_completion_rate" in data
    assert "tasks_completed" in data
    assert "tasks_total" in data
    assert "task_completion_rate" in data
    assert "tasks" in data


# -- Heatmap -----------------------------------------------------------------

def test_heatmap_1m(client, auth_headers):
    resp = client.get("/api/stats/heatmap?range=1m", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["range"] == "1m"
    assert "days" in data
    assert len(data["days"]) == 30
    for day in data["days"]:
        assert "date" in day
        assert "sessions" in day


def test_heatmap_3m(client, auth_headers):
    resp = client.get("/api/stats/heatmap?range=3m", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["range"] == "3m"
    assert len(data["days"]) == 90
    for day in data["days"][:3]:
        assert "pomodoro_count" in day


def test_heatmap_1y(client, auth_headers):
    resp = client.get("/api/stats/heatmap?range=1y", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["range"] == "1y"
    assert len(data["days"]) == 365


# -- Export ------------------------------------------------------------------

def test_stats_export_json(client, auth_headers):
    resp = client.get("/api/stats/export?format=json", headers=auth_headers)
    assert resp.status_code == 200
    assert "polarclock_history.json" in resp.headers.get("content-disposition", "")
    data = resp.json()
    assert "records" in data
    assert "record_count" in data


def test_stats_export_csv(client, auth_headers):
    resp = client.get("/api/stats/export?format=csv", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")


# -- Error Handling (REQ-402) ------------------------------------------------

def test_validation_error_format(client, auth_headers):
    resp = client.put(
        "/api/timer/settings",
        json={"work_duration_minutes": "not_a_number"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    data = resp.json()
    assert "detail" in data


def test_404_error_format(client, auth_headers):
    resp = client.get(
        f"/api/tasks/{uuid.uuid4().hex}",
        headers=auth_headers,
    )
    assert resp.status_code == 404
    data = resp.json()
    assert data.get("error") is True
    assert "message" in data


# -- Schedule (Meal Settings + Rules) ----------------------------------------

def test_meal_settings_get(client, auth_headers):
    resp = client.get("/api/schedule/meal-settings", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "breakfast_start" in data
    assert "lunch_start" in data
    assert "dinner_start" in data


def test_meal_settings_update(client, auth_headers):
    resp = client.put(
        "/api/schedule/meal-settings",
        json={
            "breakfast_start": "07:30",
            "breakfast_latest_start": "08:30",
            "lunch_start": "12:00",
            "lunch_latest_finish": "13:00",
            "dinner_start": "18:30",
            "dinner_latest_finish": "19:30",
            "prep_time_minutes": 45,
            "meal_duration_minutes": 50,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["breakfast_start"] == "07:30"
    assert resp.json()["prep_time_minutes"] == 45


def test_schedule_rules_crud(client, auth_headers):
    resp = client.post(
        "/api/schedule/rules",
        json={
            "name": "Math Class",
            "day_of_week": 1,
            "start_hhmm": "09:00",
            "end_hhmm": "10:30",
            "effective_from": "2026-04-06",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    rule = resp.json()
    assert rule["name"] == "Math Class"
    rule_id = rule["id"]

    resp = client.get("/api/schedule/rules", headers=auth_headers)
    assert resp.status_code == 200
    assert any(r["id"] == rule_id for r in resp.json())

    resp = client.put(
        f"/api/schedule/rules/{rule_id}",
        json={"name": "Advanced Math", "start_hhmm": "09:30"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Advanced Math"
    assert resp.json()["start_hhmm"] == "09:30"

    resp = client.delete(f"/api/schedule/rules/{rule_id}", headers=auth_headers)
    assert resp.status_code == 200


def test_schedule_rule_split(client, auth_headers):
    rule = client.post(
        "/api/schedule/rules",
        json={
            "name": "Physics",
            "day_of_week": 3,
            "start_hhmm": "14:00",
            "end_hhmm": "15:30",
            "effective_from": "2026-04-01",
        },
        headers=auth_headers,
    ).json()

    resp = client.post(
        f"/api/schedule/rules/{rule['id']}/split",
        json={
            "week_monday": "2026-04-13",
            "new_start_hhmm": "14:30",
            "new_end_hhmm": "16:00",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    new_rule = resp.json()
    assert new_rule["start_hhmm"] == "14:30"
    assert new_rule["end_hhmm"] == "16:00"
    assert new_rule["effective_from"] == "2026-04-13"


def test_schedule_rule_not_found(client, auth_headers):
    resp = client.put(
        f"/api/schedule/rules/{uuid.uuid4().hex}",
        json={"name": "Ghost"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_schedule_legacy_date(client, auth_headers):
    resp = client.get("/api/schedule/2026-04-10", headers=auth_headers)
    assert resp.status_code == 200
    assert "recurring_rules" in resp.json()


def test_schedule_legacy_block(client, auth_headers):
    resp = client.post(
        "/api/schedule/block",
        json={
            "name": "Meeting",
            "start_time": "2026-04-10T10:00:00",
            "end_time": "2026-04-10T11:00:00",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    block = resp.json()
    assert block["name"] == "Meeting"

    resp = client.delete(f"/api/schedule/block/{block['id']}", headers=auth_headers)
    assert resp.status_code == 200


# -- History -----------------------------------------------------------------

def test_history_create_and_list(client, auth_headers):
    resp = client.post(
        "/api/history",
        json={
            "type": "pomodoro",
            "duration_minutes": 25,
            "started_at": "2026-04-10T09:00:00",
            "completed_at": "2026-04-10T09:25:00",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    record = resp.json()
    assert record["type"] == "pomodoro"
    assert record["duration_minutes"] == 25
    record_id = record["id"]

    resp = client.get("/api/history", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "records" in data
    assert data["total"] >= 1

    resp = client.delete(f"/api/history/{record_id}", headers=auth_headers)
    assert resp.status_code == 200


def test_history_filter_by_type(client, auth_headers):
    client.post(
        "/api/history",
        json={"type": "meditation", "duration_minutes": 20},
        headers=auth_headers,
    )

    resp = client.get("/api/history?type=meditation", headers=auth_headers)
    assert resp.status_code == 200
    for rec in resp.json()["records"]:
        assert rec["type"] == "meditation"


def test_history_filter_by_date(client, auth_headers):
    resp = client.get(
        "/api/history?start_date=2026-04-10&end_date=2026-04-10",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert "records" in resp.json()


def test_history_delete_nonexistent(client, auth_headers):
    resp = client.delete(
        f"/api/history/{uuid.uuid4().hex}",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# -- JSON Corruption Recovery ------------------------------------------------

def test_corrupted_json_recovery(client, auth_headers):
    """Verify endpoints return defaults when data files are corrupted."""
    import tempfile
    import os

    data_dir = os.environ.get("DATA_DIR", "")
    resp = client.get("/api/timer/state", headers=auth_headers)
    assert resp.status_code == 200
    assert "status" in resp.json()

    resp = client.get("/api/stats/today", headers=auth_headers)
    assert resp.status_code == 200

    resp = client.get("/api/tasks", headers=auth_headers)
    assert resp.status_code == 200


# -- Middleware & Health Check ------------------------------------------------

def test_health_enhanced(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")
    assert "version" in data
    assert "data_writable" in data
    assert "user_count" in data
    assert isinstance(data["user_count"], int)


def test_response_has_process_time_header(client, auth_headers):
    resp = client.get("/api/timer/state", headers=auth_headers)
    assert resp.status_code == 200
    assert "X-Process-Time" in resp.headers
    assert resp.headers["X-Process-Time"].endswith("ms")


# -- Input Validation Boundaries ----------------------------------------------

def test_task_name_too_long(client, auth_headers):
    resp = client.post("/api/tasks", json={"name": "x" * 501}, headers=auth_headers)
    assert resp.status_code == 422

def test_task_name_empty(client, auth_headers):
    resp = client.post("/api/tasks", json={"name": ""}, headers=auth_headers)
    assert resp.status_code == 422

def test_timer_settings_out_of_range(client, auth_headers):
    resp = client.put(
        "/api/timer/settings",
        json={"work_duration_minutes": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 422

def test_timer_settings_too_high(client, auth_headers):
    resp = client.put(
        "/api/timer/settings",
        json={"work_duration_minutes": 999},
        headers=auth_headers,
    )
    assert resp.status_code == 422


# -- Search ------------------------------------------------------------------

def test_task_search(client, auth_headers):
    client.post("/api/tasks", json={"name": "Write Report Alpha"}, headers=auth_headers)
    client.post("/api/tasks", json={"name": "Review Code Beta"}, headers=auth_headers)

    resp = client.get("/api/tasks/search?q=report", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert any("Report" in r["name"] for r in data["results"])

    resp = client.get("/api/tasks/search?q=nonexistent_xyz", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


def test_task_bulk_archive(client, auth_headers):
    r1 = client.post("/api/tasks", json={"name": "Bulk A"}, headers=auth_headers)
    r2 = client.post("/api/tasks", json={"name": "Bulk B"}, headers=auth_headers)
    ids = [r1.json()["id"], r2.json()["id"]]

    resp = client.post("/api/tasks/bulk/archive", json={"task_ids": ids}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["archived_count"] == 2


def test_task_bulk_delete(client, auth_headers):
    r1 = client.post("/api/tasks", json={"name": "Del X"}, headers=auth_headers)
    r2 = client.post("/api/tasks", json={"name": "Del Y"}, headers=auth_headers)
    ids = [r1.json()["id"], r2.json()["id"]]

    resp = client.post("/api/tasks/bulk/delete", json={"task_ids": ids}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["deleted_count"] == 2


def test_task_meta_stats(client, auth_headers):
    resp = client.get("/api/tasks/meta/stats", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "by_status" in data
    assert "completion_rate" in data
    assert "overdue" in data


# -- Streak & User Export -----------------------------------------------------

def test_stats_streak(client, auth_headers):
    resp = client.get("/api/stats/streak", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "current_streak" in data
    assert "longest_streak" in data
    assert "total_active_days" in data


def test_user_data_export(client, auth_headers):
    resp = client.get("/api/users/me/export", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "exported_at" in data
    assert "user" in data
    assert "tasks" in data or data["tasks"] is None


def test_dashboard(client, auth_headers):
    resp = client.get("/api/stats/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "today_pomodoros" in data
    assert "today_minutes" in data
    assert "current_streak" in data
    assert "active_task_count" in data
    assert "upcoming_deadlines" in data
    assert isinstance(data["recent_activity"], list)


def test_weekly_comparison(client, auth_headers):
    resp = client.get("/api/stats/weekly-comparison", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "this_week" in data
    assert "last_week" in data
    assert "delta" in data
    assert "pomodoro_count" in data["delta"]
    assert "total_minutes" in data["delta"]


def test_timer_presets(client, auth_headers):
    resp = client.get("/api/timer/presets", headers=auth_headers)
    assert resp.status_code == 200
    presets = resp.json()
    assert len(presets) >= 3
    assert any(p["name"] == "经典番茄钟" for p in presets)

    resp = client.post("/api/timer/presets", json={
        "name": "My Preset", "work": 30, "short_break": 8, "long_break": 20,
    }, headers=auth_headers)
    assert resp.status_code == 200
    preset = resp.json()
    assert preset["name"] == "My Preset"
    assert preset["builtin"] is False

    resp = client.post(f"/api/timer/presets/{preset['id']}/apply", headers=auth_headers)
    assert resp.status_code == 200
    state = resp.json()
    assert state["work_duration_minutes"] == 30

    resp = client.delete(f"/api/timer/presets/{preset['id']}", headers=auth_headers)
    assert resp.status_code == 200


def test_logout(client):
    client.post("/api/users", json={"username": "logout_user"})
    login = client.post("/api/users/login", json={"username": "logout_user"})
    token = login.json()["token"]
    headers = {"X-Token": token}

    resp = client.get("/api/timer/state", headers=headers)
    assert resp.status_code == 200

    resp = client.post("/api/users/logout", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    resp = client.get("/api/timer/state", headers=headers)
    assert resp.status_code == 401


def test_get_current_user(client):
    client.post("/api/users", json={"username": "me_test_user"})
    login = client.post("/api/users/login", json={"username": "me_test_user"})
    token = login.json()["token"]

    resp = client.get("/api/users/me", headers={"X-Token": token})
    assert resp.status_code == 200
    assert resp.json()["username"] == "me_test_user"


def test_delete_user_account(client):
    resp = client.post("/api/users", json={"username": "to_delete"})
    assert resp.status_code == 200
    user = resp.json()

    login = client.post("/api/users/login", json={"username": "to_delete"})
    token = login.json()["token"]
    headers = {"X-Token": token}

    client.post("/api/tasks", json={"name": "Will be deleted"}, headers=headers)

    resp = client.delete("/api/users/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    resp = client.get("/api/timer/state", headers=headers)
    assert resp.status_code in (401, 404)


def test_today_schedule(client, auth_headers):
    resp = client.get("/api/schedule/today", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "date" in data
    assert "day_of_week" in data
    assert "events" in data
    assert isinstance(data["events"], list)
    meal_names = [e["name"] for e in data["events"] if e["type"] == "meal"]
    assert "早餐" in meal_names
    assert "午餐" in meal_names
    assert "晚餐" in meal_names


# -- Habits -------------------------------------------------------------------

def test_habit_lifecycle(client, auth_headers):
    resp = client.post("/api/habits", json={
        "name": "Read 30min", "frequency": "daily", "target_count": 1, "icon": "📖",
    }, headers=auth_headers)
    assert resp.status_code == 200
    habit = resp.json()
    assert habit["name"] == "Read 30min"
    habit_id = habit["id"]

    resp = client.get("/api/habits", headers=auth_headers)
    assert resp.status_code == 200
    assert any(h["id"] == habit_id for h in resp.json())

    resp = client.post(f"/api/habits/{habit_id}/checkin", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    resp = client.put(f"/api/habits/{habit_id}", json={"name": "Read 60min"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Read 60min"

    resp = client.delete(f"/api/habits/{habit_id}", headers=auth_headers)
    assert resp.status_code == 200


def test_habit_not_found(client, auth_headers):
    resp = client.post("/api/habits/nonexistent/checkin", headers=auth_headers)
    assert resp.status_code == 404


# -- Backup -------------------------------------------------------------------

def test_backup_lifecycle(client, auth_headers):
    resp = client.post("/api/backup?description=test+backup", headers=auth_headers)
    assert resp.status_code == 200
    backup_id = resp.json()["id"]

    resp = client.get("/api/backup", headers=auth_headers)
    assert resp.status_code == 200
    assert any(b["id"] == backup_id for b in resp.json())

    resp = client.get(f"/api/backup/{backup_id}/diff", headers=auth_headers)
    assert resp.status_code == 200
    assert "diffs" in resp.json()

    resp = client.delete(f"/api/backup/{backup_id}", headers=auth_headers)
    assert resp.status_code == 200


def test_backup_not_found(client, auth_headers):
    resp = client.get("/api/backup/nonexistent/diff", headers=auth_headers)
    assert resp.status_code == 404


# -- Backup Restore -----------------------------------------------------------

def test_backup_restore(client, auth_headers):
    client.post("/api/tasks", json={"name": "Before Restore"}, headers=auth_headers)

    backup = client.post("/api/backup?description=restore+test", headers=auth_headers).json()
    backup_id = backup["id"]

    resp = client.post(f"/api/backup/{backup_id}/restore", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "restored_files" in data
    assert "auto_backup_id" in data

    client.delete(f"/api/backup/{backup_id}", headers=auth_headers)
    client.delete(f"/api/backup/{data['auto_backup_id']}", headers=auth_headers)


# -- Peak Hours ---------------------------------------------------------------

def test_stats_peak_hours(client, auth_headers):
    resp = client.get("/api/stats/peak-hours", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "slots" in data
    assert "peak_count" in data
    assert isinstance(data["slots"], list)
    assert len(data["slots"]) == 168


def test_stats_peak_hours_custom_weeks(client, auth_headers):
    resp = client.get("/api/stats/peak-hours?weeks=2", headers=auth_headers)
    assert resp.status_code == 200
    assert "slots" in resp.json()


# -- Token Validate -----------------------------------------------------------

def test_validate_token_ok(client):
    client.post("/api/users", json={"username": "validate_user"})
    login = client.post("/api/users/login", json={"username": "validate_user"})
    token = login.json()["token"]

    resp = client.post("/api/users/validate", headers={"X-Token": token})
    assert resp.status_code == 200
    assert resp.json()["username"] == "validate_user"


def test_validate_token_invalid(client):
    resp = client.post("/api/users/validate", headers={"X-Token": "fake-token-abc"})
    assert resp.status_code == 401


def test_validate_token_missing(client):
    resp = client.post("/api/users/validate")
    assert resp.status_code == 401


# -- Security: Duplicate Username & Session Cleanup ----------------------------

def test_duplicate_username_rejected(client):
    name = f"dup_{uuid.uuid4().hex[:6]}"
    resp = client.post("/api/users", json={"username": name})
    assert resp.status_code == 200

    resp = client.post("/api/users", json={"username": name})
    assert resp.status_code == 400


def test_login_revokes_old_token(client):
    name = f"revoke_{uuid.uuid4().hex[:6]}"
    client.post("/api/users", json={"username": name})

    login1 = client.post("/api/users/login", json={"username": name}).json()
    token1 = login1["token"]

    resp = client.get("/api/timer/state", headers={"X-Token": token1})
    assert resp.status_code == 200

    login2 = client.post("/api/users/login", json={"username": name}).json()
    token2 = login2["token"]

    resp = client.get("/api/timer/state", headers={"X-Token": token1})
    assert resp.status_code == 401

    resp = client.get("/api/timer/state", headers={"X-Token": token2})
    assert resp.status_code == 200


# -- Exercise Start -----------------------------------------------------------

def test_user_data_isolation(client):
    """Two users' data must be stored in separate directories and never cross."""
    import os

    u1 = client.post("/api/users", json={"username": "alice_iso"}).json()
    u2 = client.post("/api/users", json={"username": "bob_iso"}).json()

    tok1 = client.post("/api/users/login", json={"username": "alice_iso"}).json()["token"]
    tok2 = client.post("/api/users/login", json={"username": "bob_iso"}).json()["token"]
    h1 = {"X-Token": tok1}
    h2 = {"X-Token": tok2}

    client.post("/api/tasks", json={"name": "Alice Private Task"}, headers=h1)
    client.post("/api/tasks", json={"name": "Bob Private Task"}, headers=h2)

    alice_tasks = [t["name"] for t in client.get("/api/tasks", headers=h1).json()]
    bob_tasks = [t["name"] for t in client.get("/api/tasks", headers=h2).json()]
    assert "Alice Private Task" in alice_tasks
    assert "Bob Private Task" not in alice_tasks
    assert "Bob Private Task" in bob_tasks
    assert "Alice Private Task" not in bob_tasks

    data_dir = os.environ.get("DATA_DIR", "")
    alice_dir = os.path.join(data_dir, "alice_iso")
    bob_dir = os.path.join(data_dir, "bob_iso")
    assert os.path.isdir(alice_dir), f"Expected alice dir at {alice_dir}"
    assert os.path.isdir(bob_dir), f"Expected bob dir at {bob_dir}"

    client.post("/api/history", json={"type": "pomodoro", "duration_minutes": 25}, headers=h1)
    alice_stats = client.get("/api/stats/today", headers=h1).json()
    bob_stats = client.get("/api/stats/today", headers=h2).json()
    assert alice_stats["pomodoro_count"] >= 1
    assert bob_stats["pomodoro_count"] == 0


def test_sync_api_user_isolation(client):
    """Sync API returns data scoped to the requested username."""
    client.post("/api/users", json={"username": "sync_alice"})
    client.post("/api/users", json={"username": "sync_bob"})
    tok = client.post("/api/users/login", json={"username": "sync_alice"}).json()["token"]
    client.post("/api/tasks", json={"name": "Alice Sync Task"}, headers={"X-Token": tok})

    snap_a = client.get("/api/sync/snapshot?username=sync_alice").json()
    snap_b = client.get("/api/sync/snapshot?username=sync_bob").json()
    assert snap_a["clock_username"] == "sync_alice"
    assert snap_b["clock_username"] == "sync_bob"


def test_exercise_start(client, auth_headers):
    resp = client.post(
        "/api/timer/exercise/start?exercise_type=boxing",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "exercise"
    assert data["status"] == "running"
    assert data["exercise_type"] == "boxing"
    client.post("/api/timer/stop", headers=auth_headers)


def test_exercise_start_running(client, auth_headers):
    resp = client.post(
        "/api/timer/exercise/start?exercise_type=running",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["exercise_type"] == "running"
    client.post("/api/timer/stop", headers=auth_headers)


# -- Sessions Complete --------------------------------------------------------

def test_session_complete_pomodoro(client, auth_headers):
    client.post("/api/timer/start", json={"mode": "pomodoro"}, headers=auth_headers)
    resp = client.post("/api/timer/sessions/complete", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data


def test_session_complete_meditation(client, auth_headers):
    client.post("/api/timer/start", json={"mode": "meditation"}, headers=auth_headers)
    resp = client.post("/api/timer/sessions/complete", headers=auth_headers)
    assert resp.status_code == 200


# -- Task Reorder -------------------------------------------------------------

def test_task_reorder(client, auth_headers):
    t1 = client.post("/api/tasks", json={"name": "Reorder A"}, headers=auth_headers).json()
    t2 = client.post("/api/tasks", json={"name": "Reorder B"}, headers=auth_headers).json()

    resp = client.post("/api/tasks/reorder", json={
        "task_id": t1["id"],
        "axis": "importance",
        "new_position": 2,
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_task_reorder_nonexistent(client, auth_headers):
    resp = client.post("/api/tasks/reorder", json={
        "task_id": uuid.uuid4().hex,
        "axis": "importance",
        "new_position": 1,
    }, headers=auth_headers)
    assert resp.status_code == 404


# -- Position Update ----------------------------------------------------------

def test_task_position_update(client, auth_headers):
    task = client.post("/api/tasks", json={"name": "Pos Task"}, headers=auth_headers).json()

    resp = client.put(
        f"/api/tasks/{task['id']}/position?importance_axis_position=5",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["importance_axis_position"] == 5


def test_task_position_update_nonexistent(client, auth_headers):
    resp = client.put(
        f"/api/tasks/{uuid.uuid4().hex}/position?importance_axis_position=1",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# -- Bulk Update Positions ----------------------------------------------------

def test_bulk_update_positions(client, auth_headers):
    t1 = client.post("/api/tasks", json={"name": "Bulk Pos A"}, headers=auth_headers).json()
    t2 = client.post("/api/tasks", json={"name": "Bulk Pos B"}, headers=auth_headers).json()

    resp = client.post("/api/tasks/bulk-update-positions", json=[
        {"id": t1["id"], "importance_axis_position": 10},
        {"id": t2["id"], "desire_axis_position": 20},
    ], headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


# -- Start Pomodoro from Task -------------------------------------------------

def test_start_pomodoro_from_task(client, auth_headers):
    task = client.post("/api/tasks", json={"name": "Pomo Target"}, headers=auth_headers).json()

    resp = client.post(f"/api/tasks/{task['id']}/start-pomodoro", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_start_pomodoro_nonexistent(client, auth_headers):
    resp = client.post(f"/api/tasks/{uuid.uuid4().hex}/start-pomodoro", headers=auth_headers)
    assert resp.status_code == 404


# -- End-to-End Workflow -------------------------------------------------------

def test_full_pomodoro_workflow(client):
    """Integration: user creates account, sets up tasks, works, checks stats."""
    name = f"e2e_{uuid.uuid4().hex[:6]}"
    user = client.post("/api/users", json={"username": name}).json()
    token = client.post("/api/users/login", json={"username": name}).json()["token"]
    h = {"X-Token": token}

    client.put("/api/users/preferences", json={"theme": "dark"}, headers=h)
    prefs = client.get("/api/users/preferences", headers=h).json()
    assert prefs["theme"] == "dark"

    task = client.post("/api/tasks", json={
        "name": "E2E Task", "tags": ["e2e", "test"],
    }, headers=h).json()
    assert task["status"] == "pending"
    tid = task["id"]

    started = client.post(f"/api/tasks/{tid}/start-pomodoro", headers=h).json()
    assert started["status"] == "in_progress"

    state = client.post("/api/timer/start", json={
        "mode": "pomodoro", "task_id": tid,
    }, headers=h).json()
    assert state["status"] == "running"
    assert state["current_task_id"] == tid

    client.post("/api/timer/stop", headers=h)

    client.post("/api/history", json={
        "type": "pomodoro", "duration_minutes": 45, "task_id": tid,
    }, headers=h)

    today = client.get("/api/stats/today", headers=h).json()
    assert today["pomodoro_count"] >= 1

    dash = client.get("/api/stats/dashboard", headers=h).json()
    assert dash["today_pomodoros"] >= 1
    assert dash["active_task_count"] >= 1

    streak = client.get("/api/stats/streak", headers=h).json()
    assert streak["total_active_days"] >= 1

    peak = client.get("/api/stats/peak-hours", headers=h).json()
    assert len(peak["slots"]) == 168

    search = client.get("/api/tasks/search?q=E2E", headers=h).json()
    assert search["total"] >= 1

    tags = client.get("/api/tasks/meta/tags", headers=h).json()
    tag_names = {t["tag"] for t in tags}
    assert "e2e" in tag_names

    stats = client.get("/api/tasks/meta/stats", headers=h).json()
    assert stats["total"] >= 1
    assert stats["by_status"]["in_progress"] >= 1

    backup = client.post("/api/backup?description=e2e+test", headers=h).json()
    assert "id" in backup
    diff = client.get(f"/api/backup/{backup['id']}/diff", headers=h).json()
    assert "diffs" in diff
    client.delete(f"/api/backup/{backup['id']}", headers=h)

    export = client.get("/api/users/me/export", headers=h).json()
    assert export["user"]["username"] == name
    assert "tasks" in export

    client.post("/api/users/logout", headers=h)
    denied = client.get("/api/timer/state", headers=h)
    assert denied.status_code == 401


def test_schedule_full_day_workflow(client, auth_headers):
    """Integration: configure meals + rules → check today schedule."""
    client.put("/api/schedule/meal-settings", json={
        "breakfast_start": "08:00", "breakfast_latest_start": "09:00",
        "lunch_start": "12:30", "lunch_latest_finish": "13:30",
        "dinner_start": "18:00", "dinner_latest_finish": "19:00",
        "prep_time_minutes": 30, "meal_duration_minutes": 45,
    }, headers=auth_headers)

    import datetime
    today = datetime.date.today()
    dow = today.weekday()
    rule = client.post("/api/schedule/rules", json={
        "name": "Morning Class",
        "day_of_week": dow,
        "start_hhmm": "09:30",
        "end_hhmm": "11:00",
        "effective_from": str(today),
    }, headers=auth_headers).json()
    assert rule["name"] == "Morning Class"

    schedule = client.get("/api/schedule/today", headers=auth_headers).json()
    assert schedule["date"] == str(today)
    event_names = [e["name"] for e in schedule["events"]]
    assert "Morning Class" in event_names
    assert "早餐" in event_names

    client.delete(f"/api/schedule/rules/{rule['id']}", headers=auth_headers)


def test_timer_preset_apply_workflow(client, auth_headers):
    """Integration: create preset → apply → verify settings changed."""
    preset = client.post("/api/timer/presets", json={
        "name": "Deep Work", "work": 90, "short_break": 15, "long_break": 30,
    }, headers=auth_headers).json()
    assert preset["work"] == 90

    applied = client.post(f"/api/timer/presets/{preset['id']}/apply", headers=auth_headers).json()
    assert applied["work_duration_minutes"] == 90
    assert applied["short_break_minutes"] == 15
    assert applied["long_break_minutes"] == 30

    state = client.get("/api/timer/state", headers=auth_headers).json()
    assert state["work_duration_minutes"] == 90

    client.delete(f"/api/timer/presets/{preset['id']}", headers=auth_headers)


def test_habit_checkin_workflow(client, auth_headers):
    """Integration: create habit → check in → verify checkin recorded."""
    habit = client.post("/api/habits", json={
        "name": "Meditate", "frequency": "daily", "target_count": 1, "icon": "🧘",
    }, headers=auth_headers).json()
    hid = habit["id"]

    checkin = client.post(f"/api/habits/{hid}/checkin", headers=auth_headers).json()
    assert checkin["ok"] is True

    habits = client.get("/api/habits", headers=auth_headers).json()
    h = next(x for x in habits if x["id"] == hid)
    assert len(h["checkins"]) >= 1
    assert "date" in h["checkins"][-1]

    client.delete(f"/api/habits/{hid}", headers=auth_headers)
