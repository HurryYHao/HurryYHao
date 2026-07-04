#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline

echo "Building the Next.js project..."
pnpm next build

echo "Bundling server with tsup..."
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Build completed successfully!"

echo ""
echo "========================================="
echo "  部署说明："
echo "========================================="
echo "  1. 确保服务器上已安装 Node.js 20+ 和 pnpm"
echo "  2. 复制以下文件到服务器："
echo "     - dist/ 目录"
echo "     - .next/ 目录"
echo "     - package.json"
echo "     - pnpm-lock.yaml"
echo "     - public/ 目录（如果有）"
echo "  3. 在服务器上创建 .env 文件（参考 .env.example）"
echo "  4. 运行 pnpm install --prod 安装生产依赖"
echo "  5. 运行 pnpm start 启动服务"
echo "========================================="
