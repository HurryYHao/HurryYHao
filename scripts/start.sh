#!/bin/bash

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-5000}"

cd "${COZE_WORKSPACE_PATH}"

# 日志目录：统一使用 /tmp，避免任何权限问题
LOG_DIR="/tmp/live-analysis-logs"
mkdir -p "${LOG_DIR}" 2>/dev/null || true

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
echo "Log dir: ${LOG_DIR}"

PORT=${DEPLOY_RUN_PORT} node dist/server.js 2>&1 | tee -a "${LOG_DIR}/app.log"
