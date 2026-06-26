# chrome-tab-tree

> 一款 Chromium 扩展（Manifest V3），在侧边面板（Side Panel）中将当前窗口的标签页以父子树状结构可视化展示，恢复浏览器抹去的标签页开启脉络。支持中文与英文界面。

本文件是面向读者的**简介**；详细需求 / 技术调研 / 规格 / Roadmap 见 [`doc/spec.md`](./doc/spec.md)，
开发交接日志见 [`doc/log.md`](./doc/log.md)，状态索引见 [`doc/status.jsonl`](./doc/status.jsonl)。

## 当前状态

**仅设计文档，尚未开始编码**（无任何代码、无 `package.json`）。下一步从 Milestone 0 起步，
详见 `doc/log.md` 最新一条的「下一步」。

## 规划功能（详见 `doc/spec.md`）

- 侧边面板内以**树状结构**展示当前窗口所有标签页。
- 仅当标签页经**页内中键点击**或**右键 → 在新标签页打开**（`openerTabId` 非空）创建时建立父子关系；
  其余方式作为根节点。
- 关闭**父标签页**时内联询问：把子标签提升为兄弟节点，还是一并递归关闭。
- 树状态跨会话持久化（`chrome.storage.local`）。
- 面向通用 Chromium（Chrome / Edge / Brave 等），不用 Edge 专属 API；界面中英双语（`_locales`）。

## Milestone 概览

| Milestone | 内容 | 状态 |
|-----------|------|------|
| M0 | 项目初始化（manifest MV3 / SW 骨架 / 侧边面板骨架 / i18n 基础） | ⏳ 未开始 |
| M1+ | 见 `doc/spec.md` §6 Roadmap | 🗓 规划中 |

> 版本号采用 `0.M.*`：`M` 为当前 Milestone，`*` 在该里程碑内持续打磨递增。详见根 `CLAUDE.md` §5.1。
