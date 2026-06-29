# CLAUDE.md

本仓库面向 AI 助手的通用开发守则。各 Addon 的需求、规格、进度在该 Addon 的 `doc/` 里。

> 动手前：先读本文件，再读目标 Addon 的 `doc/`。

## 1. 仓库结构

个人 monorepo，收纳浏览器扩展与 Obsidian 插件。每个 Addon 是根下的独立子目录，各自带完整 `package.json`——没有顶层 workspace。执行任何 npm 命令前先 `cd` 进对应子目录。

命名前缀：`chrome-`（Chromium MV3 扩展）、`obsidian-`（Obsidian 插件）。

## 2. 语言与代码风格

- **所有注释、文档、commit message、PR 描述一律简体中文**；标识符用英文；面向用户的字符串用中文。
- 界面国际化目标：中文 + 英文；是否首版双语见各 Addon 的 `doc/`。
- 遵循各子项目自带的 `.prettierrc.json` / `.eslintrc.json` / `tsconfig.json`。提交前跑 `npm run format` 与 `npm run lint`。
- TypeScript `strict: true`、ESM；公共导出写中文 JSDoc（意图 + 边界情况）。

## 3. Agent 交接与记忆系统 ★

接手时按此顺序读（不要通读代码或全部日志）：

1. **`doc/status.jsonl`**（首行 = 当前总览；其下每行一条倒序概括）——一眼看清现状。
2. **`doc/log.md` 最新一块**（尤其「下一步」）——开工起点；需要历史时再按需往下翻。
3. **`doc/spec.md`**——涉及规格改动时查阅并同步更新。

**每个开发周期结束必须同时维护（缺一不可）：**

- `doc/log.md` 顶部追加记录，包含：日期 / 交接人（分支名）、做了什么、没做什么、下一步、验证方式。
- `doc/status.jsonl` 首行下方插入一行概括（JSON，含 `date` / `version` / `summary`），并更新首行。

> 各 Addon 的 `doc/log.md` 顶部可能有该 Addon 专属强制规则，优先级高于本文件，必须先读。

### 3.1 每个 Addon 的文档结构

| 文件 | 职责 | 何时改 |
|------|------|--------|
| `<addon>/README.md` | 简介：功能 + Milestone 概览 + 指向 `doc/` 的链接 | 功能 / 里程碑变化时 |
| `<addon>/doc/spec.md` | 详细规格 / 设计决策 / Roadmap | 涉及规格改动时 |
| `<addon>/doc/log.md` | 详细交接日志（倒序） | 每周期追加 |
| `<addon>/doc/status.jsonl` | 状态索引（首行总览 + 每周期一句话概括，倒序） | 每周期更新 |
| `<addon>/doc/testplan.md` | 场景真值表：操作序列 + 预期结果 + 状态（✅/❌/⚠️/🔲）+ 已知 bug | 加功能 / 修 bug 时先改这里 |

`testplan.md` 与 `tests/dev_tests/`（自动化单测）、`tests/user_tests/`（实测样例）一一对应。

## 4. 通用开发流程

1. `cd` 进目标 Addon，`npm install`。
2. 有 `testplan.md` 时：**先**在其中加 / 改场景行（操作 + 预期 + 初始状态），再动代码。
3. 改代码，配套补 / 改 `tests/dev_tests/` 与 `tests/user_tests/`，可追溯回 testplan 场景 ID。
4. 质量门槛全绿：`npm test`、`npm run lint`、`npm run format:check`。有 `npm run test:fuzz` 的，动核心逻辑后额外压一遍；修好已登记 bug 后放开对应的随机测试约束。
5. 有产物 / 发布步骤的（见其 `doc/`），重新生成并随提交入库。
6. 回填 `testplan.md`：场景行状态 🔲/❌ → ✅，更新已知 bug 汇总。
7. 更新 `doc/log.md` 与 `doc/status.jsonl`（见 §3）。
8. 提交。

### 4.1 版本号

格式 `0.M.*`：`M` = 当前 Milestone，`*` 在该里程碑内持续递增至满意再进入下一个。**凡实质改动（含纯文档）都要 bump `*`**，同步 `manifest.json` / `package.json` / `versions.json` 及 lockfile、`release/` 副本。

**例外**：纯仓库级改动（本 `CLAUDE.md`、CI、钩子等）不升任何 Addon 版本号。

## 5. Git 与提交

- Commit message 用中文，Conventional Commits + scope：`feat(auto-headings): …`、`chore(repo): …`。
- 改某 Addon 时提交自包含：源码 + 测试 + 产物 + `doc/log.md`。
- **仅在用户明确要求时才创建 Pull Request。**

### 5.1 会话收尾：合并回 `master`（用户长期授权）

质量门槛全绿后：工作分支自包含提交并推送 → `checkout master` → `pull` → `merge --no-ff <分支>` → 推 `master`。网络失败按 2/4/8/16s 退避重试。有冲突或行为存疑就停下问用户。长期授权**仅限合并到 `master`**。

## 6. 各 Addon 进度速览

| Addon | 类型 | 状态 | 详情 |
|-------|------|------|------|
| [`obsidian-auto-headings/`](./obsidian-auto-headings/) | Obsidian 插件：按模板自动为 Markdown 标题编号 | 开发中（M3 打磨） | [`README`](./obsidian-auto-headings/README.md) · [`spec`](./obsidian-auto-headings/doc/spec.md) · [`log`](./obsidian-auto-headings/doc/log.md) · [`status`](./obsidian-auto-headings/doc/status.jsonl) |
| [`chrome-tab-tree/`](./chrome-tab-tree/) | Chromium 扩展（MV3）：侧边面板树状标签页 | 仅设计文档，未开始编码 | [`README`](./chrome-tab-tree/README.md) · [`spec`](./chrome-tab-tree/doc/spec.md) · [`log`](./chrome-tab-tree/doc/log.md) · [`status`](./chrome-tab-tree/doc/status.jsonl) |

## 7. 开发环境

SessionStart 钩子（`.claude/hooks/session-start.sh`）在远程会话启动时自动安装各 Addon 的依赖。**新增带工具链的 Addon 时记得加进该脚本。**
