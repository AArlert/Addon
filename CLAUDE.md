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

跨会话、跨 agent 的「记忆」靠一个极简约定：**每个 Addon 在自己的 `doc/log.md` 维护一份开发日志**
（倒序，最新在最上）。它是交接的唯一权威来源，让接手者无需通读代码即可继续。

**每个开发周期结束，必须在对应 Addon 的 `doc/log.md` 顶部追加一条记录**，固定包含：

- **日期 / 交接人**（分支名）
- **做了什么**
- **没做什么**（明确边界，避免越界到后续里程碑）
- **下一步**（给接手 agent 的明确起点）
- **验证方式**（如何复现你跑过的测试 / 构建）

**接手某个 Addon 前的标准动作**：读它的 `doc/README.md`（需求/规格/Roadmap）→ 读 `doc/log.md`
最新一条的「下一步」→ 再动代码。

> 每个 Addon 的 `doc/log.md` 顶部还可能写有该 Addon 专属的**强制规则**（如产物/发布约定）。这些规则
> 优先级高于本文件的通用守则，务必先读、严格遵守。

## 5. 通用开发流程

1. `cd` 进目标 Addon，`npm install`。
2. 改代码，配套补 / 改单元测试。
3. **质量门槛全绿**（以该 Addon 实际提供的脚本为准）：`npm test`、`npm run lint`、`npm run format:check`。
4. 若该 Addon 有产物 / 发布步骤（见其 `doc/`），按其要求重新生成并随提交入库。
5. 在该 Addon 的 `doc/log.md` 追加交接记录（见 §4）。
6. 提交。

## 6. Git 与提交

- Commit message 用中文，遵循 Conventional Commits 带 scope：`feat(auto-headings): …`、
  `chore(tab-tree): …`；仓库级（CLAUDE.md、CI、钩子等）用 `docs(repo): …` / `chore(repo): …`。
- 改某 Addon 时，提交应**自包含**：源码 + 测试 + 该 Addon 要求的产物 + `doc/log.md` 交接记录。
- **仅在用户明确要求时才创建 Pull Request。**

## 7. 各 Addon 进度速览

简表，**仅供导航**；任何细节以各 Addon 自己的 `doc/` 为准。

| Addon | 类型 | 状态 | 详情 |
|------|------|------|------|
| [`obsidian-auto-headings/`](./obsidian-auto-headings/) | Obsidian 插件：按模板自动为 Markdown 标题编号 | 开发中 | [`doc/README.md`](./obsidian-auto-headings/doc/README.md) · [`doc/log.md`](./obsidian-auto-headings/doc/log.md) |
| [`chrome-tab-tree/`](./chrome-tab-tree/) | Chromium 扩展（MV3）：侧边面板树状标签页 | 仅设计文档，未开始编码 | [`README.md`](./chrome-tab-tree/README.md) · [`doc/log.md`](./chrome-tab-tree/doc/log.md) |

## 8. 开发环境（Claude Code on the web）

仓库配置了 SessionStart 钩子（`.claude/hooks/session-start.sh`）：远程会话启动时自动为带 npm 工具链
的 Addon 安装依赖，使测试 / lint / 构建开箱即用。**新增带工具链的 Addon 时，记得把它加进该脚本。**
