#!/bin/bash
# SessionStart 钩子：为 Claude Code on the web 远程会话预装依赖，
# 确保测试、lint、构建在会话开始时即可运行。
#
# 本仓库是 monorepo：每个子项目各自携带工具链，无顶层 package.json。
# 当前唯一有代码与依赖的子项目是 obsidian-auto-headings；
# chrome-tab-tree 目前仅有设计文档，无需安装。
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# 启用共享 git 钩子（.githooks/pre-commit：防 doc/log.md 膨胀的文档守卫）。
# 本地与远程会话都启用——只是设个 git 配置，轻量且安全。
if [ -d "$PROJECT_DIR/.githooks" ]; then
	git -C "$PROJECT_DIR" config core.hooksPath .githooks || true
	echo "==> 已启用 .githooks（pre-commit 文档守卫）"
fi

# 以下仅在远程环境（Claude Code on the web）运行；本地开发不重复装依赖。
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
	exit 0
fi

# obsidian-auto-headings：安装 npm 依赖（npm install 可复用容器缓存）。
if [ -f "$PROJECT_DIR/obsidian-auto-headings/package.json" ]; then
	echo "==> 安装 obsidian-auto-headings 依赖"
	npm install --prefix "$PROJECT_DIR/obsidian-auto-headings"
fi

echo "==> SessionStart 钩子完成"
