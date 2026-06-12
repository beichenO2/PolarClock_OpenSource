#!/bin/bash
# =============================================================================
# PolarClock - Tailscale Funnel 保障脚本
# =============================================================================
# 功能：确保 /4555 路由已注册到 Tailscale Funnel，指向 localhost:4555
#
# 防冲突策略：
#   1. flock 锁文件 → 防止多个实例并发运行
#   2. 幂等检查    → 路由已存在则跳过，不重复设置
#   3. 在线检测    → Tailscale 未连接时优雅退出，等下次重试
#
# 使用方式：
#   直接运行：bash scripts/ensure-funnel.sh
#   由 LaunchAgent com.polarclock.funnel 在开机及每 5 分钟调用
# =============================================================================

set -uo pipefail

# ── 配置 ─────────────────────────────────────────────────────────────────────
TAILSCALE="/usr/local/bin/tailscale"
TARGET_PATH="/4555"
TARGET_DEST="http://localhost:4555"
LOCK_FILE="/tmp/polarclock-funnel-ensure.lock"
LOG_DIR="$HOME/Library/Logs/PolarClock"

# ── 日志函数 ─────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

log() {
    local level="$1"; shift
    echo "$(date '+%Y-%m-%d %H:%M:%S') [funnel] [$level] $*" | tee -a "$LOG_DIR/funnel.log"
}

# ── 获取 flock 锁，防止并发运行 ───────────────────────────────────────────────
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    log "SKIP" "另一个实例正在运行 (lock: $LOCK_FILE)，本次跳过"
    exit 0
fi

# 脚本退出时自动释放锁（flock 随 fd 关闭自动释放，这里 cleanup trap 只做日志）
trap 'log "INFO" "脚本退出，释放锁"' EXIT

log "INFO" "======= 开始检查 Tailscale Funnel ======="

# ── 检查 tailscale 命令是否可用 ───────────────────────────────────────────────
if [ ! -x "$TAILSCALE" ]; then
    # 尝试 PATH 中查找
    TAILSCALE_PATH=$(command -v tailscale 2>/dev/null || true)
    if [ -z "$TAILSCALE_PATH" ]; then
        log "ERROR" "tailscale 命令未找到，请确认已安装 Tailscale"
        exit 1
    fi
    TAILSCALE="$TAILSCALE_PATH"
fi

log "INFO" "使用 tailscale: $TAILSCALE"

# ── 检查 Tailscale 是否在线 ───────────────────────────────────────────────────
TS_STATUS=$("$TAILSCALE" status --json 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('BackendState', 'Unknown'))
except:
    print('Unknown')
" 2>/dev/null || echo "Unknown")

if [ "$TS_STATUS" != "Running" ]; then
    log "WARN" "Tailscale 未处于 Running 状态（当前: $TS_STATUS），跳过本次配置，等待下次重试"
    exit 0
fi

log "INFO" "Tailscale 在线 (状态: $TS_STATUS)"

# ── 检查 Funnel 路由是否已正确配置 ───────────────────────────────────────────
FUNNEL_STATUS=$("$TAILSCALE" funnel status 2>/dev/null || echo "")

if echo "$FUNNEL_STATUS" | grep -qF "proxy http://localhost:4555"; then
    log "INFO" "✓ /4555 → http://localhost:4555 路由已存在，无需操作"
    log "INFO" "当前 Funnel 路由表："
    echo "$FUNNEL_STATUS" | while IFS= read -r line; do
        log "INFO" "  $line"
    done
    exit 0
fi

# ── 路由不存在，执行配置 ──────────────────────────────────────────────────────
log "INFO" "⚙️  路由 $TARGET_PATH 未找到，正在配置..."
log "INFO" "执行: $TAILSCALE funnel --bg --set-path $TARGET_PATH $TARGET_DEST"

if "$TAILSCALE" funnel --bg --set-path "$TARGET_PATH" "$TARGET_DEST" >> "$LOG_DIR/funnel.log" 2>&1; then
    log "INFO" "✓ Funnel 路由配置成功"
    # 验证配置结果
    sleep 1
    NEW_STATUS=$("$TAILSCALE" funnel status 2>/dev/null || echo "")
    log "INFO" "配置后路由表："
    echo "$NEW_STATUS" | while IFS= read -r line; do
        log "INFO" "  $line"
    done
else
    log "ERROR" "✗ Funnel 路由配置失败，退出码: $?"
    exit 1
fi
