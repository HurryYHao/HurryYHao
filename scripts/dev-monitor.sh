#!/bin/bash
set -Eeuo pipefail

PORT=3000
MONITOR_PORT=3001
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-${PORT}}"

cd "${COZE_WORKSPACE_PATH}"

kill_port_if_listening() {
    local port=$1
    local pids
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${port}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -z "${pids}" ]]; then
      echo "Port ${port} is free."
      return
    fi
    echo "Port ${port} in use by PIDs: ${pids} (SIGKILL)"
    echo "${pids}" | xargs -I {} kill -9 {}
    sleep 1
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${port}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -n "${pids}" ]]; then
      echo "Warning: port ${port} still busy after SIGKILL, PIDs: ${pids}"
    else
      echo "Port ${port} cleared."
    fi
}

echo "Clearing ports ${DEPLOY_RUN_PORT} and ${MONITOR_PORT} before start."
kill_port_if_listening ${DEPLOY_RUN_PORT}
kill_port_if_listening ${MONITOR_PORT}

echo "Starting AI Live Analysis System with Monitor on ports ${DEPLOY_RUN_PORT} and ${MONITOR_PORT}..."
echo ""
echo "  Main Application: http://localhost:${DEPLOY_RUN_PORT}"
echo "  Monitor Dashboard: http://localhost:${DEPLOY_RUN_PORT}/dashboard/system-monitor"
echo "  Monitor Service:  http://localhost:${MONITOR_PORT}"
echo ""

# 启动监控服务
echo "Starting monitor service..."
pnpm tsx ./scripts/monitor-server.ts &
MONITOR_PID=$!

# 等待监控服务启动
sleep 2

# 启动主应用
echo "Starting main application..."
PORT=${DEPLOY_RUN_PORT} pnpm tsx watch src/server.ts &
MAIN_PID=$!

# 捕获退出信号并清理
trap 'echo "Shutting down services..."; kill $MAIN_PID $MONITOR_PID 2>/dev/null; exit' SIGINT SIGTERM

# 等待进程
wait
