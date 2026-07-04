#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

PORT=5000
MONITOR_PORT=5001
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"

start_services() {
    cd "${COZE_WORKSPACE_PATH}"
    
    echo "Starting AI Live Analysis System with Monitor in production mode..."
    echo ""
    echo "  Main Application: http://localhost:${DEPLOY_RUN_PORT}"
    echo "  Monitor Dashboard: http://localhost:${DEPLOY_RUN_PORT}/dashboard/system-monitor"
    echo "  Monitor Service:  http://localhost:${MONITOR_PORT}"
    echo ""
    
    # 启动监控服务
    echo "Starting monitor service..."
    node -r tsx ./scripts/monitor-server.ts &
    MONITOR_PID=$!
    
    # 等待监控服务启动
    sleep 2
    
    # 启动主应用
    echo "Starting main application..."
    PORT=${DEPLOY_RUN_PORT} node dist/server.js &
    MAIN_PID=$!
    
    # 捕获退出信号并清理
    trap 'echo "Shutting down services..."; kill $MAIN_PID $MONITOR_PID 2>/dev/null; exit' SIGINT SIGTERM
    
    # 等待进程
    wait
}

echo "Starting production services..."
start_services
