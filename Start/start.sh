#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$SCRIPT_DIR/.pid"

cd "$PROJECT_DIR"

# ── Helpers ────────────────────────────────────────────────────────────────────

is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        fi
    fi
    return 1
}

do_stop() {
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -z "$pid" ]; then
        echo "Not running (no PID file)"
        return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
        echo "Process $pid not alive, cleaning up"
        rm -f "$PID_FILE"
        return 0
    fi
    echo "Stopping process $pid ..."
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 15); do
        if ! kill -0 "$pid" 2>/dev/null; then
            break
        fi
        sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
        echo "Process did not exit, sending SIGKILL"
        kill -9 "$pid" 2>/dev/null || true
        sleep 1
    fi
    rm -f "$PID_FILE"
    echo "Stopped"
}

do_status() {
    local pid
    if pid=$(is_running); then
        echo "Running (pid=$pid)"
        return 0
    else
        echo "Not running"
        return 1
    fi
}

do_start() {
    # Idempotent: if already running, report and exit cleanly
    local pid
    if pid=$(is_running); then
        echo "Already running (pid=$pid)"
        return 0
    fi

    # Clean up stale PID file
    rm -f "$PID_FILE"

    # Install backend Python deps if needed
    if [ -f "backend/requirements.txt" ]; then
        pip install -q -r backend/requirements.txt 2>/dev/null || \
        pip3 install -q -r backend/requirements.txt 2>/dev/null || true
    fi

    # Install frontend deps if needed
    if [ -f "frontend/package.json" ] && [ ! -d "frontend/node_modules" ]; then
        echo "Installing frontend dependencies ..."
        (cd frontend && npm install --silent)
    fi

    # Build frontend if not built or source is newer
    if [ -f "frontend/package.json" ]; then
        if [ ! -d "frontend/dist" ] || [ "frontend/package.json" -nt "frontend/dist/index.html" ]; then
            echo "Building frontend ..."
            (cd frontend && npm run build)
        fi
    fi

    # Start backend in background
    echo "Starting backend ..."
    nohup python backend/main.py > backend/server.log 2>&1 &
    local daemon_pid=$!
    echo "$daemon_pid" > "$PID_FILE"

    # Wait for port to become available (max 30s)
    for i in $(seq 1 30); do
        # Try default port 15550, or any uvicorn process listening
        local listener
        listener=$(lsof -iTCP:15550 -sTCP:LISTEN -P -n -t 2>/dev/null | head -1 || true)
        if [ -n "$listener" ]; then
            echo "Ready (pid=$daemon_pid, port=15550)"
            return 0
        fi
        sleep 1
    done

    echo "Timed out waiting for service, check backend/server.log" >&2
    rm -f "$PID_FILE"
    return 1
}

do_restart() {
    do_stop
    sleep 1
    do_start
}

# ── Main ───────────────────────────────────────────────────────────────────────

COMMAND="${1:-start}"

case "$COMMAND" in
    start)
        do_start
        ;;
    stop)
        do_stop
        ;;
    restart)
        do_restart
        ;;
    status)
        do_status
        ;;
    *)
        echo "Usage: bash Start/start.sh [start|stop|restart|status]" >&2
        exit 1
        ;;
esac
