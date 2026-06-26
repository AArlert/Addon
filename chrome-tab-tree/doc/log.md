# chrome-tab-tree 开发日志与交接

本文件是 chrome-tab-tree 的**交接记忆**：每个开发周期结束追加一条（倒序，最新在最上），固定记录
「做了什么 / 没做什么 / 下一步 / 验证方式」，让接手 agent 无需通读代码即可继续。约定见根
[`CLAUDE.md`](../../CLAUDE.md) §4。

**接手前怎么读**：先读 [`status.jsonl`](./status.jsonl)（状态索引）→ 再读**本文件最新一块**的
「下一步」即可上手。

> 配套文档：完整需求 / 技术调研 / 规格 / Roadmap 见 [`spec.md`](./spec.md)（原项目根 `README.md`，
> 已更名移入 `doc/`）；面向读者的简介见上一级 [`../README.md`](../README.md)。

---

## 2026-06-25 — 建立交接记忆文件（尚未开始编码）

**交接人**：agent（claude/claude-md-docs-1upx6r 分支）

- **做了什么**：建立本 `log.md`，把本 Addon 纳入仓库统一的 agent 交接约定（根 CLAUDE.md §4）。
- **现状**：项目仅有设计文档 [`spec.md`](./spec.md)，**无任何代码、无 `package.json`**。
- **没做什么**：未开始任何实现（Milestone 0 及以后均未动）。
- **下一步**：按 [`spec.md`](./spec.md) 第 6 节 Roadmap 从 **Milestone 0（项目初始化）** 起步——`manifest.json`
  （MV3，声明 `sidePanel` / `tabs` / `storage` 权限）、Service Worker 最小骨架、侧边面板 HTML/JS
  最小骨架、`_locales/zh_CN` 与 `_locales/en` 基础文案、开发加载 / 热重载流程。沿用 `chrome-` 前缀
  与中文注释约定。建好 `package.json` 后记得把本 Addon 加入 `.claude/hooks/session-start.sh`。
- **验证方式**：暂无（尚无构建）。M0 起以「`chrome://extensions` → 开发者模式 → 加载已解压的扩展」
  实测。
