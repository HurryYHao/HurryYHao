#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"


start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    
    # 日志目录：生产环境用 /tmp，开发环境用 /app/work/logs/bypass
    if [ -w "/app/work/logs" ] 2>/dev/null; then
        LOG_DIR="/app/work/logs/bypass"
    else
        LOG_DIR="/tmp/live-analysis-logs"
    fi
    mkdir -p "${LOG_DIR}" 2>/dev/null || LOG_DIR="/tmp"
    
    PORT=${DEPLOY_RUN_PORT} node dist/server.js 2>&1 | tee -a "${LOG_DIR}/app.log"
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
