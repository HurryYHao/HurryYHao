#!/bin/bash

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
# Try frozen lockfile first (faster), fall back to normal install
if ! pnpm install --prefer-frozen-lockfile --prefer-offline --reporter=append-only 2>&1; then
  echo "Frozen lockfile install failed, retrying with normal install..."
  pnpm install --reporter=append-only 2>&1 || {
    echo "Normal install also failed, trying with no-lockfile..."
    pnpm install --no-frozen-lockfile 2>&1
  }
fi

echo "Verifying tsx is available..."
if ! npx tsx --version > /dev/null 2>&1; then
  echo "tsx not found, installing explicitly..."
  pnpm add -D tsx 2>&1
fi

if command -v coze > /dev/null 2>&1 && coze check-bins --help > /dev/null 2>&1; then
  coze check-bins --fix
fi

echo "Dependencies installed successfully."
