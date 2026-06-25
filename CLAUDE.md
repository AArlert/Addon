# CLAUDE.md

本文件为 AI 助手（Claude Code 等）提供本仓库的导航与协作约定。**动手前先读完本文件**，尤其是
对应子项目的「强制规则」。

## 1. 仓库总览

`Addon` 是一个**个人 vibe coding 单仓库（monorepo）**，收纳浏览器扩展与 Obsidian 插件，每个插件
是仓库根下的一个独立子目录，**各自携带完整的 `package.json` 与工具链**——没有顶层 workspace、没有
根 `package.json`。请始终 `cd` 进具体子项目再执行 npm 命令。

| 目录 | 类型 | 状态 |
|------|------|------|
| [`obsidian-auto-headings/`](./obsidian-auto-headings/) | Obsidian 插件：自动为 Markdown 标题编号 | **active**，已完成 Milestone 0–3（共 7 个） |
| [`chrome-tab-tree/`](./chrome-tab-tree/) | Chromium 扩展（MV3）：侧边面板树状标签页 | **spec-only**，仅有设计文档，尚无任何代码 |

### 命名规范（新增插件时遵守）

| 前缀 | 类别 |
|------|------|
| `chrome-` | Chromium 浏览器扩展（Manifest V3，通用 Chromium，不用 Edge 专属 API） |
| `obsidian-` | Obsidian 插件 |

## 2. 语言与文风约定（重要）

- **所有代码注释、文档、commit message、PR 描述、开发日志一律使用简体中文。** 新写的代码请延续
  周边的中文注释密度与风格。
- **用户界面国际化**：仓库总目标是所有插件支持中文 + 英文两种界面。但 `obsidian-auto-headings`
  **首版仅提供中文界面**，文案内联硬编码，多语言留待后续版本（见其 Roadmap M7）。`chrome-tab-tree`
  规划用标准 `_locales` 提供中英双语。
- 标识符（变量/函数/类型名）用英文；面向用户的字符串、命令名、Notice 文案用中文。

## 3. obsidian-auto-headings（主力开发项目）

一款根据可配置「模板」自动为 Markdown 标题写入编号前缀的 Obsidian 插件。**唯一权威的需求/规格/
Roadmap 文档是 [`obsidian-auto-headings/doc/README.md`](./obsidian-auto-headings/doc/README.md)**——
任何关于「应该怎么表现」的疑问都以它为准。开发交接历史见
[`doc/log.md`](./obsidian-auto-headings/doc/log.md)。

### 3.1 ⚠️ 强制规则（在此项目工作时必须遵守）

这些规则来自用户反馈，已固化为团队约定（原文见 `doc/log.md` 顶部）：

1. **每个开发周期都必须产出可供 Obsidian 实测的插件**，放在 `obsidian-auto-headings/release/`。
   写完代码后**务必运行 `npm run release`**（= build + 同步脚本），它把 `main.js` / `manifest.json`
   / `styles.css` 刷新进 `release/`。**不要只改源码而忘记重新生成 `release/`。**
2. **`release/` 必须随提交入库**（`.gitignore` 已对 `release/main.js` 设例外放行）。提交前用
   `git status` 自检 `release/` 下文件已更新/已暂存。
3. 改动若影响行为或版本，同步更新 `manifest.json` / `package.json` / `versions.json` 的版本号，
   并在 `doc/log.md` **最上方追加一条新的周期记录**（做了什么 / 没做什么 / 下一步）。
4. 合并前质量门槛：`npm test`、`npm run lint`、`npm run format:check` **全绿**。

> 一句话流程：**写代码 → `npm run release` → 提交（含 `release/`）→ 在 `doc/log.md` 追加交接记录。**

### 3.2 命令（先 `cd obsidian-auto-headings`）

| 命令 | 作用 |
|------|------|
| `npm install` | 安装依赖 |
| `npm run dev` | esbuild watch 增量构建（开发时常驻；配合 Hot Reload 插件热重载） |
| `npm run build` | 类型检查（`tsc -noEmit`）+ 生产构建 |
| `npm run release` | `build` + `scripts/sync-release.mjs` 同步产物到 `release/`（**每周期必跑**） |
| `npm test` | Vitest 一次性跑全部单测（无需 Obsidian 运行时） |
| `npm run test:watch` | Vitest watch |
| `npm run lint` | ESLint（`.ts`） |
| `npm run format` / `format:check` | Prettier 写入 / 仅检查 |

### 3.3 源码结构与职责

```
obsidian-auto-headings/
├── src/
│   ├── main.ts              入口：生命周期、命令、各文件防抖计时器、单一事务写回、模板接线
│   ├── parser.ts            Markdown 标题解析（ATX 标题、围栏代码块边界识别），不依赖模板
│   ├── numbering.ts         核心引擎：HeadingCounter 计数状态机、序号渲染器、前缀拼装、
│   │                        stripPrefix、H1 双模式降级、renumberContent 整文重排
│   ├── frontmatter.ts       单文件开关读取（手写解析，大小写敏感的 ON/OFF）
│   ├── settings.ts          设置数据模型（enabled 全局开关、debounceDelay）
│   ├── settings/SettingsTab.ts  设置 GUI（全局开关 + 模板编辑器）
│   └── templates/
│       ├── schema.ts        模板 schema 容错校验/序列化/文件名安全化
│       └── TemplateStore.ts 模板文件 CRUD（经 app.vault.adapter 读写 templates/*.json）
├── tests/                   Vitest 单测（parser / numbering / schema / frontmatter / settings）
├── doc/                     README.md（需求规格 + Roadmap）、log.md（开发日志/交接）
├── release/                 ★交付物：可直接丢进 .obsidian/plugins 的产物，每周期必更新且入库
├── scripts/sync-release.mjs 产物同步脚本
├── manifest.json / versions.json / styles.css   Obsidian 约定须在插件根目录
└── package.json / tsconfig.json / esbuild.config.mjs / vitest.config.ts / .eslintrc.json …
```

数据流：`main.ts` 监听 `editor-change` → 防抖到期 → `renumberContent(content, template, {mode})`
（`parser` 解析 → `numbering` 降级 H1 + 计数 + 拼前缀）→ 以单一 `editor.transaction` 写回变化的行。

### 3.4 关键设计要点（改代码前务必理解，细节见 doc/README.md）

- **整文件重写**：每次触发对整篇文档重新编号，而非局部修改——逻辑更简单、结果更一致。
- **计数模型**：内部计数器 `[c2..c6]` 全程用纯阿拉伯整数；序号样式（cjk/circled/alpha…）只在写入时
  套用。**跨级拼接时父级一律阿拉伯数字，仅本级套样式**。
- **H1 处理**：首个 H1 = 文档标题，永不编号/计数。后续错位 H1 分两种模式：`live`（防抖自动）仅把本行
  `#`→`##` 不动子树；`format`（「立即重新编号」命令）级联降级，子树整体下移一级。
- **白名单**（M4，**尚未实现**）：命中者不写前缀且**不占计数器槽位**（不跳号）。`numberHeadings`
  已留 `isWhitelisted` 回调通道，但 `main.ts` 当前未传入。
- **frontmatter 开关**：仅读取 `obsidian-auto-headings` 键，值仅 `ON`/`OFF`（**大小写敏感**，故刻意
  手写解析、不用 YAML 解析器）。插件**绝不向 frontmatter 写任何配置**。
- **模板存储分层**：`data.json`（loadData/saveData）存全局开关、防抖延迟、（未来的）路径规则；
  `templates/*.json`（vault adapter）存各模板定义。所有 JSON 读取经 `normalizeTemplate` **容错**——
  单个坏文件不应让插件崩溃。

### 3.5 进度与边界

- **已完成**：M0 脚手架、M1 解析+计数引擎、M2 写回+防抖+H1 双模式+全局开关/命令+frontmatter 读取、
  M3 模板系统（5 种序号样式、TemplateStore CRUD、GUI 行内编辑器+实时预览）。
- **未完成**：M4 白名单匹配（数据通道已就绪，命中判定/优先级/GUI chip 编辑器未做）、M5 按路径配置、
  M6 防抖滑块 UI 等完善、M7 Backlog（多语言、罗马数字、批量重排…）。
- 接手某个 Milestone 前，先读 `doc/log.md` 最新一条的「下一步」与 `doc/README.md` 对应 Roadmap 勾选项。

## 4. chrome-tab-tree（待实现）

目前**只有设计文档** [`chrome-tab-tree/README.md`](./chrome-tab-tree/README.md)，无任何代码。文档已
明确：MV3、Side Panel API（Chromium ≥ 114）、Service Worker 维护以 `windowId` 为键的标签页树并写入
`chrome.storage.local`、通过 `openerTabId` 建立父子关系、父节点关闭时内联提示（提升/一并关闭）、
`_locales` 中英双语。若开始实现，按文档第 6 节 Roadmap 从 Milestone 0 起步，沿用 `chrome-` 前缀与
中文注释约定。

## 5. 代码风格

- **Prettier**（`.prettierrc.json`）：制表符缩进（tabWidth 4）、双引号、有分号、`trailingComma: all`、
  `printWidth: 100`、LF 换行。提交前跑 `npm run format`。
- **TypeScript**：`strict: true`，ESM（`"type": "module"`）。
- **ESLint**：`eslint:recommended` + `@typescript-eslint/recommended`；未用变量以 `_` 前缀豁免。
- 公共导出函数/类型写中文 JSDoc，说明意图与边界情况（参考现有 `numbering.ts` 的注释密度）。

## 6. Git 与提交约定

- Commit message 用中文，遵循 Conventional Commits 带子项目 scope，例如：
  `feat(auto-headings): 完成 Milestone 3 模板系统`、`chore(auto-headings): …`。
- **改 obsidian-auto-headings 时，提交必须同时包含更新后的 `release/` 与 `doc/log.md` 交接记录**
  （见 §3.1）。
- 仅在用户明确要求时才创建 Pull Request。
