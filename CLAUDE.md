# CLAUDE.md

本文件是 `Addon` 仓库面向所有 AI 助手的**通用开发守则**。它只讲「在本仓库怎么干活」，**不记录任何
Addon 的具体进度**——各 Addon 的需求、规格、进度与交接记录都在该 Addon 自己的 `doc/` 里。

> 动手前：先读完本文件，再读你要改的那个 Addon 的 `doc/`（规格 + 交接日志）。

## 1. 仓库结构

`Addon` 是个人 vibe coding 单仓库（monorepo），收纳浏览器扩展与 Obsidian 插件。每个 Addon 是仓库根
下的一个独立子目录，**各自携带完整的 `package.json` 与工具链**——没有顶层 workspace、没有根
`package.json`。执行任何 npm 命令前先 `cd` 进对应子目录。

### 命名规范（新增 Addon 时遵守）

| 前缀 | 类别 |
|------|------|
| `chrome-` | Chromium 浏览器扩展（Manifest V3，通用 Chromium，不用 Edge 专属 API） |
| `obsidian-` | Obsidian 插件 |

## 2. 语言与文风

- **所有代码注释、文档、commit message、PR 描述、开发日志一律用简体中文**；新代码延续周边的中文
  注释密度与风格。
- 标识符（变量/函数/类型名）用英文；面向用户的字符串、命令名、提示文案用中文。
- **界面国际化**：仓库总目标是所有 Addon 支持中文 + 英文。是否首版即双语由各 Addon 自定，见其 `doc/`。

## 3. 代码风格

- 遵循**各子项目自带的** `.prettierrc.json` / `.eslintrc.json` / `tsconfig.json`——不要跨项目套用
  个人偏好。提交前在该子目录跑 `npm run format` 与 `npm run lint`。
- TypeScript 默认 `strict: true`、ESM。
- 公共导出的函数/类型写中文 JSDoc，说明意图与边界情况。

## 4. Agent 交接与记忆系统 ★

跨会话、跨 agent 的「记忆」分**三层**，**接手前按此顺序读，既不通读代码、也不通读越来越长的日志**：

1. **`doc/status.jsonl`（先读这个）** —— 极简**状态索引**。**首行（最上）**是当前总览（版本号 /
   里程碑 / 下一步等）；其下**每行一条「一句话概括」**（JSON 单行，倒序，**最新一行紧贴首行下方**）。
   一眼看清「现在到哪了、最近几次干了啥」，再决定要不要深读。
2. **`doc/log.md` 的最新一块** —— 详细交接。**默认只读最新这一块**（尤其其「下一步」）即可上手；
   需要更早的来龙去脉时，再按 `status.jsonl` 的索引**按需**往下翻对应的历史块，**不必从头通读**。
3. **`doc/spec.md`** —— 详细需求 / 规格 / Roadmap；改动涉及规格时查阅、并同步更新它。

**每个开发周期结束，必须同时维护两份记忆（缺一不可）：**

- 在 `doc/log.md` **顶部追加一条详细记录**，固定包含：
  - **日期 / 交接人**（分支名）
  - **做了什么**
  - **没做什么**（明确边界，避免越界到后续里程碑）
  - **下一步**（给接手 agent 的明确起点）
  - **验证方式**（如何复现你跑过的测试 / 构建）
- 在 `doc/status.jsonl` **首行下方插入一行概括**（一句话 JSON，含 `date` / `version` / `summary`），
  并**更新首行**的版本号 / 下一步等总览，使其始终反映最新状态。

> 写概括务必**简洁**——它是给接手者的「目录」，不是复述 `log.md`。详细只进 `log.md`。

> 每个 Addon 的 `doc/log.md` 顶部还可能写有该 Addon 专属的**强制规则**（如产物/发布约定）。这些规则
> 优先级高于本文件的通用守则，务必先读、严格遵守。

### 4.1 每个 Addon 的文档结构（统一约定）

每个 Addon 固定以下文档，**职责分明、各管一摊**（前四份必备；`testplan.md` 在功能有"操作序列 /
状态转移"风险的 Addon 强烈建议有，本质上是测试与 bug 的真值表）：

| 文件 | 角色 | 谁看 / 何时改 |
|------|------|---------------|
| `<addon>/README.md` | **简介**（入口）：当前功能 + Milestone 概览 + 指向 `doc/` 的链接，**简短** | 给人看；功能 / 里程碑状态变化时更新 |
| `<addon>/doc/spec.md` | **详细规格**：需求 / 设计决策 / 功能规格 / 架构 / Roadmap | 改动涉及规格时同步更新 |
| `<addon>/doc/log.md` | **详细交接日志**（倒序，最新在最上） | 每周期追加一块 |
| `<addon>/doc/status.jsonl` | **状态索引**（首行总览 + 每周期一句话概括，倒序） | 每周期插一行 + 更新首行 |
| `<addon>/doc/testplan.md` | **测试场景与真值表**：操作（尤其**操作序列**）+ 预期结果 + 当前状态（✅/❌/⚠️/🔲）+ 已知 bug 汇总 | 加功能 / 修 bug 时**先在此加/改场景行**，再写测试、改码、回填状态 |

> `testplan.md` 同时服务**开发期 Agent**（标 ❌ 的是待修 bug、🔲 的是待补测试）与**手动实测用户**
> （照"操作步骤 + 预期结果"在真实环境点一遍）。它与 `tests/dev_tests/`（自动化单测）、
> `tests/user_tests/`（可复制粘贴的实测样例）一一呼应：testplan 列场景，两个目录给可执行/可操作的实现。

> 历史沿革：原先详细规格放在 `doc/README.md`，现已更名为 `doc/spec.md`，并在 Addon 根新建简短的
> `README.md` 作入口。维护 / 引用规格时认准 `spec.md`。

## 5. 通用开发流程

1. `cd` 进目标 Addon，`npm install`。
2. 若该 Addon 有 `doc/testplan.md`：**动手前先在其中加/改对应场景行**（操作 + 预期 + 初始状态），
   把"要做什么、应得到什么"先写成可核对的真值；尤其为任何"改配置后再触发"补**状态转移**场景。
3. 改代码，配套补 / 改单元测试（`tests/dev_tests/`）与（必要时）实测样例（`tests/user_tests/`），
   使它们可追溯回 testplan 的场景 ID。
4. **质量门槛全绿**（以该 Addon 实际提供的脚本为准）：`npm test`、`npm run lint`、`npm run format:check`。
   若该 Addon 备有**随机序列 / 属性测试**（如 `npm run test:fuzz`），**动了核心逻辑后额外压一遍**；修好
   某个已登记 bug 后，记得放开其在随机测试里对应的约束，让覆盖面随之扩大（详见该 Addon 的 testplan）。
5. 若该 Addon 有产物 / 发布步骤（见其 `doc/`），按其要求重新生成并随提交入库。
6. **回填 `testplan.md`**：把刚做完的场景行状态从 🔲/❌ 改成 ✅（修了 bug 还要更新其"已知 bug 汇总"）。
7. 在该 Addon 的 `doc/log.md` 追加详细交接记录，并在 `doc/status.jsonl` 更新状态（见 §4）。
8. 提交。

### 5.1 版本号：里程碑内持续打磨

- 各 Addon 的版本号采用 **`0.M.*`**：`M` 对应**当前 Milestone**，`*` 在该里程碑内**持续递增**
  （可至几十甚至更多），直到这个里程碑**打磨到满意、无明显 bug**，才进入下一个里程碑（`M+1`，
  `*` 归零）。即 `0.3.*` 全程都属 Milestone 3 的迭代打磨。
- **凡对某 Addon 的实质改动都要 bump `*`**——功能 / 规格 / 修复 / 界面文案 / 文档 / 产物，**哪怕只
  改文档、行为没变**，「做了更改就升版本号」。bump 时同步 `manifest.json` / `package.json` /
  `versions.json`（及 lockfile、`release/` 内的副本）。
- **唯一例外**：纯**仓库级 / 协作机制类**改动（本 `CLAUDE.md` 守则、`log.md` / `status.jsonl` 约定、
  CI / 钩子、与具体 Addon 功能无关的元文档）**不升任何 Addon 的版本号**——它不是「对具体项目的更新」。

## 6. Git 与提交

- Commit message 用中文，遵循 Conventional Commits 带 scope：`feat(auto-headings): …`、
  `chore(tab-tree): …`；仓库级（CLAUDE.md、CI、钩子等）用 `docs(repo): …` / `chore(repo): …`。
- 改某 Addon 时，提交应**自包含**：源码 + 测试 + 该 Addon 要求的产物 + `doc/log.md` 交接记录。
- **仅在用户明确要求时才创建 Pull Request。**

### 6.1 会话收尾：把工作分支合并回 `master`（用户长期授权）

一项工作（升级 / 修 bug / 加功能）完成后，**直接把工作分支合并回 `master`**——用户用 `master`
的 `release/` 实测、给反馈，无需等 PR review（git 可回溯，缩短反馈环）。约定：

- **前提：质量门槛全绿**（`npm test` / `lint` / `format:check`，要求产物者已 `npm run release` 入库）。
  「直接合并」省的是 PR review，不是自测——**绝不合并红的或半成品**。
- 先在工作分支完成自包含提交并推送，再 `checkout master` → `pull` → `merge --no-ff <分支>` → 推 `master`
  （`--no-ff` 留合并记录便于回滚；网络失败按 2/4/8/16s 退避重试）。
- 有冲突或行为存疑就**停下问用户**，别硬合。
- 长期授权**仅限合并到 `master`**；推其他分支仍需明确许可。

## 7. 各 Addon 进度速览

简表，**仅供导航**；任何细节以各 Addon 自己的 `doc/` 为准。

| Addon | 类型 | 状态 | 详情 |
|------|------|------|------|
| [`obsidian-auto-headings/`](./obsidian-auto-headings/) | Obsidian 插件：按模板自动为 Markdown 标题编号 | 开发中（M3 打磨） | [`README`](./obsidian-auto-headings/README.md) · [`spec`](./obsidian-auto-headings/doc/spec.md) · [`log`](./obsidian-auto-headings/doc/log.md) · [`status`](./obsidian-auto-headings/doc/status.jsonl) |
| [`chrome-tab-tree/`](./chrome-tab-tree/) | Chromium 扩展（MV3）：侧边面板树状标签页 | 仅设计文档，未开始编码 | [`README`](./chrome-tab-tree/README.md) · [`spec`](./chrome-tab-tree/doc/spec.md) · [`log`](./chrome-tab-tree/doc/log.md) · [`status`](./chrome-tab-tree/doc/status.jsonl) |

## 8. 开发环境（Claude Code on the web）

仓库配置了 SessionStart 钩子（`.claude/hooks/session-start.sh`）：远程会话启动时自动为带 npm 工具链
的 Addon 安装依赖，使测试 / lint / 构建开箱即用。**新增带工具链的 Addon 时，记得把它加进该脚本。**
