#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --reporter=append-only 2>&1 || pnpm install --reporter=append-only 2>&1
if command -v coze > /dev/null 2>&1 && coze check-bins --help > /dev/null 2>&1; then
  coze check-bins --fix
fi
