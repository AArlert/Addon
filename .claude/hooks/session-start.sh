#!/bin/bash
# SessionStart 钩子：为 Claude Code on the web 远程会话预装依赖，
# 确保测试、lint、构建在会话开始时即可运行。
#
# 本仓库是 monorepo：每个子项目各自携带工具链，无顶层 package.json。
# 当前唯一有代码与依赖的子项目是 obsidian-auto-headings；
# chrome-tab-tree 目前仅有设计文档，无需安装。
set -euo pipefail

# 仅在远程环境（Claude Code on the web）运行；本地开发不受影响。
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
	exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# obsidian-auto-headings：安装 npm 依赖（npm install 可复用容器缓存）。
if [ -f "$PROJECT_DIR/obsidian-auto-headings/package.json" ]; then
	echo "==> 安装 obsidian-auto-headings 依赖"
	npm install --prefix "$PROJECT_DIR/obsidian-auto-headings"
fi

echo "==> SessionStart 钩子完成"
