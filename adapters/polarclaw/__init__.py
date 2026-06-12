"""
PolarClaw Project SDK Adapter for Clock.

Compatibility layer: writes events directly to SOTAgent lobster-events.jsonl
until the real polarclaw-project-sdk package is available.
"""
from .sdk import emit_event, emit_bug, get_status, run_health_check, run_target_test

__all__ = ["emit_event", "emit_bug", "get_status", "run_health_check", "run_target_test"]
