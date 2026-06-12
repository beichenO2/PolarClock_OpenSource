"""
PolarClaw Project SDK — Clock adapter (Python).

Uses port-sdk call() for event emission and service discovery.
Falls back to direct file append when SOTAgent is unreachable.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

SOURCE_PROJECT = "clock"

_EVENTS_PATH = os.environ.get(
    "LOBSTER_EVENTS_PATH",
    str(Path(__file__).resolve().parents[3] / "SOTAgent" / "data" / "lobster-events.jsonl"),
)

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "PolarPort" / "src" / "sdk" / "python"))
try:
    from polarisor_port_sdk import call as _port_sdk_call
    _HAS_PORT_SDK = True
except ImportError:
    _HAS_PORT_SDK = False


def _file_append_event(event: dict[str, Any]) -> None:
    events_path = Path(_EVENTS_PATH)
    events_path.parent.mkdir(parents=True, exist_ok=True)
    with open(events_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def emit_event(
    event_type: str,
    severity: str,
    payload: dict[str, Any],
    dedup_key: str,
    target_project: Optional[str] = None,
) -> dict[str, Any]:
    """Emit a lobster event via port-sdk call(), file append fallback."""
    event: dict[str, Any] = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "type": event_type,
        "source_project": SOURCE_PROJECT,
        "severity": severity,
        "payload": payload,
        "dedup_key": dedup_key,
    }
    if target_project:
        event["target_project"] = target_project

    if _HAS_PORT_SDK:
        try:
            _port_sdk_call("sotagent.lobster.emit", event, validate_input=False, validate_output=False)
        except Exception:
            _file_append_event(event)
    else:
        _file_append_event(event)

    return event


def emit_bug(
    message: str,
    component: str,
    operation: str,
    error: Optional[str] = None,
    severity: str = "error",
) -> dict[str, Any]:
    """Emit a bug event for Clock failures."""
    return emit_event(
        event_type="bug",
        severity=severity,
        payload={
            "message": message[:500],
            "component": component,
            "operation": operation,
            **({"error": error[:300]} if error else {}),
        },
        dedup_key=f"clock:bug:{component}:{operation}",
    )


def get_status() -> dict[str, Any]:
    """Return Clock project status for PolarClaw Pilot Runtime."""
    if _HAS_PORT_SDK:
        try:
            result = _port_sdk_call("polarclaw.lobster.status", {"project": SOURCE_PROJECT},
                                     validate_input=False, validate_output=False)
            if result.get("ok"):
                return result["data"]
        except Exception:
            pass

    polaris_info: dict[str, Any] = {}
    polaris_path = Path(__file__).resolve().parents[2] / "polaris.json"
    try:
        if polaris_path.exists():
            data = json.loads(polaris_path.read_text(encoding="utf-8"))
            polaris_info = {
                "name": data.get("name"),
                "status": data.get("status"),
                "version": data.get("version"),
                "requirements_count": len(data.get("requirements", [])),
            }
    except Exception:
        pass

    data_dir = Path(__file__).resolve().parents[2] / "backend" / "data"
    return {
        "project": SOURCE_PROJECT,
        "status": "active",
        "health": {
            "polaris": polaris_info,
            "events_path": _EVENTS_PATH,
            "events_file_exists": os.path.exists(_EVENTS_PATH),
            "data_dir_exists": data_dir.exists(),
            "data_dir_writable": os.access(str(data_dir), os.W_OK) if data_dir.exists() else False,
        },
    }


def run_health_check() -> dict[str, Any]:
    """Run health checks for Clock."""
    if _HAS_PORT_SDK:
        try:
            result = _port_sdk_call("polarclaw.lobster.health", {"project": SOURCE_PROJECT},
                                     validate_input=False, validate_output=False)
            if result.get("ok"):
                return result["data"]
        except Exception:
            pass

    checks: list[dict[str, Any]] = []
    clock_root = Path(__file__).resolve().parents[2]

    checks.append({
        "name": "polaris.json",
        "ok": (clock_root / "polaris.json").exists(),
    })
    checks.append({
        "name": "contracts_dir",
        "ok": (clock_root / "contracts").is_dir(),
    })
    checks.append({
        "name": "lobster_targets",
        "ok": (clock_root / "lobster" / "targets").is_dir(),
    })

    data_dir = clock_root / "backend" / "data"
    checks.append({
        "name": "data_dir_writable",
        "ok": data_dir.exists() and os.access(str(data_dir), os.W_OK),
    })

    api_ok = False
    try:
        import urllib.request
        req = urllib.request.Request("http://127.0.0.1:15550/api/health", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            api_ok = resp.status == 200
    except Exception:
        pass
    checks.append({
        "name": "clock_api",
        "ok": api_ok,
        "detail": None if api_ok else "API not reachable",
    })

    return {
        "healthy": all(c["ok"] for c in checks if c["name"] != "clock_api"),
        "checks": checks,
    }


def run_target_test() -> dict[str, Any]:
    """Run target tests (contract validation)."""
    if _HAS_PORT_SDK:
        try:
            result = _port_sdk_call("polarclaw.lobster.test", {"project": SOURCE_PROJECT},
                                     validate_input=False, validate_output=False)
            if result.get("ok"):
                return result["data"]
        except Exception:
            pass

    tests: list[dict[str, Any]] = []

    schema_path = Path(__file__).resolve().parents[2] / "contracts" / "lobster-event.schema.json"
    examples_path = Path(__file__).resolve().parents[2] / "contracts" / "examples" / "lobster-event.example.json"

    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        examples = json.loads(examples_path.read_text(encoding="utf-8"))

        required = schema.get("required", [])
        valid_types = schema.get("properties", {}).get("type", {}).get("enum", [])

        passed = 0
        failed = 0
        for ex in examples:
            missing = [f for f in required if f not in ex]
            if missing:
                failed += 1
                continue
            if ex.get("type") not in valid_types:
                failed += 1
                continue
            if ex.get("source_project") != "clock":
                failed += 1
                continue
            passed += 1

        tests.append({
            "name": "contract_tests",
            "ok": failed == 0,
            "detail": f"{passed} passed, {failed} failed",
        })
    except Exception as e:
        tests.append({
            "name": "contract_tests",
            "ok": False,
            "detail": str(e)[:200],
        })

    return {
        "passed": all(t["ok"] for t in tests),
        "tests": tests,
    }
