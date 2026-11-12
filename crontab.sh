#!/usr/bin/env bash
# ============================================================
# 脚本名称: crontab.sh
# 用途:     端口 7611 守护脚本（配合 crontab 使用）
# 用法:
#   ./crontab.sh            无参数: 端口 7611 已占用 -> skip
#                                     端口 7611 空闲   -> 启动 start.sh
#   ./crontab.sh restart    有参数: 端口 7611 已占用 -> 先 kill 再启动
#                                     端口 7611 空闲   -> 直接启动
# 平台:     macOS / Linux 通用
# ============================================================

set -euo pipefail

# 可通过环境变量覆盖: PORT=7612 ./crontab.sh
PORT="${PORT:-7611}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
START_SCRIPT="$SCRIPT_DIR/start.sh"
LOG_FILE="$SCRIPT_DIR/crontab.log"

# ---------- 工具函数 ----------

# 获取占用指定端口的 PID 列表（macOS 用 lsof, Linux 备选 fuser）
get_pids_on_port() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti tcp:"$PORT" 2>/dev/null || true
    elif command -v fuser >/dev/null 2>&1; then
        fuser "$PORT"/tcp 2>/dev/null || true
    else
        echo "错误: 系统缺少 lsof/fuser, 无法检测端口" >&2
        exit 1
    fi
}

# 启动服务（nohup 后台运行, 防止 cron 会话退出导致进程被杀）
start_service() {
    echo "[$(date '+%F %T')] [start] 启动服务 (端口 $PORT) ..."
    PORT="$PORT" nohup "$START_SCRIPT" >>"$LOG_FILE" 2>&1 &
    echo "[$(date '+%F %T')] [done] 已启动, PID: $!, 日志: $LOG_FILE"
}

# ---------- 主逻辑 ----------

if [ ! -x "$START_SCRIPT" ]; then
    echo "错误: 找不到可执行的 $START_SCRIPT" >&2
    exit 1
fi

pids="$(get_pids_on_port)"

if [ -n "$pids" ]; then
    # 端口被占用
    if [ "$#" -eq 0 ]; then
        # 无参数 -> skip
        echo "[$(date '+%F %T')] [skip] 端口 $PORT 已在运行 (PID: $(echo "$pids" | tr '\n' ' '))"
        exit 0
    fi

    # 有参数 -> 先 kill 再启动
    echo "[$(date '+%F %T')] [kill] 端口 $PORT 被占用 (PID: $(echo "$pids" | tr '\n' ' ')), 正在终止..."
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true

    # 优雅等待最多 5 秒
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        [ -z "$(get_pids_on_port)" ] && break
        sleep 0.5
    done

    # 还没退就强杀
    pids="$(get_pids_on_port)"
    if [ -n "$pids" ]; then
        echo "[$(date '+%F %T')] [kill -9] 强制终止: $(echo "$pids" | tr '\n' ' ')"
        # shellcheck disable=SC2086
        kill -9 $pids 2>/dev/null || true
        sleep 1
    fi
fi

start_service
