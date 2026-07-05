#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"


start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    
    # 确保运行时日志写入 app.log
    LOG_DIR="/app/work/logs/bypass"
    mkdir -p "${LOG_DIR}"
    
    PORT=${DEPLOY_RUN_PORT} node dist/server.js 2>&1 | tee -a "${LOG_DIR}/app.log"
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
