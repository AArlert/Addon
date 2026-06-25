# obsidian-auto-headings 开发日志与协作交接

本文件用于多 agent / 多人协作的**握手交接**：每个开发周期结束时，记录「做了什么、
没做什么、下一步干嘛」，让接手者无需通读全部代码即可继续。倒序排列（最新在最上）。

> 配套文档：完整需求与功能规格见 [`README.md`](./README.md)（含 7 个 Milestone 的 Roadmap）。

---

## ⚠️ 强制规则（所有 Agent 必须遵守）

1. **每个开发周期都必须产出可供 Obsidian 实测的插件**，放在仓库的 **`release/`** 文件夹。
   完成代码改动后，**务必运行 `npm run release`**（= `npm run build` + 同步脚本），它会把
   `main.js` / `manifest.json` / `styles.css` 刷新进 `release/`。**不要只改源码而忘记重新生成
   `release/`**——用户是直接拿 `release/` 里的文件丢进 `.obsidian/plugins/` 实测的。
2. **`release/` 必须随提交一起入库**（`.gitignore` 已对 `release/main.js` 设例外放行）。
   提交前自检：`git status` 应能看到 `release/` 下的文件已更新/已暂存。
3. 改动若影响行为或版本，记得同步 `manifest.json` / `package.json` / `versions.json` 的版本号，
   并在本文件**最上方追加一条新的周期记录**（做了什么 / 没做什么 / 下一步）。
4. 合并前的质量门槛：`npm test`、`npm run lint`、`npm run format:check` 全绿。

> 一句话：**写完代码 → `npm run release` → 提交（含 `release/`）→ 在本文件追加交接记录。**

---

## 目录结构约定（按职责分类）

```
obsidian-auto-headings/
├── src/                  ← 源代码（TypeScript）
│   ├── main.ts             插件入口：生命周期、命令、防抖、事务写回、模板接线
│   ├── parser.ts           Markdown 标题解析（ATX、代码块边界）
│   ├── numbering.ts        计数器状态机、序号渲染器、前缀拼装、H1 降级、整文重排
│   ├── frontmatter.ts      单文件开关（obsidian-auto-headings: ON/OFF）读取
│   ├── settings.ts         设置数据模型（全局开关、防抖延迟）
│   ├── settings/
│   │   └── SettingsTab.ts  设置 GUI（全局开关 + 模板编辑器）
│   └── templates/
│       ├── schema.ts       模板 schema 校验/序列化/文件名安全化
│       └── TemplateStore.ts 模板文件 CRUD（vault adapter 读写 templates/*.json）
├── tests/                ← 单元测试（Vitest，无需 Obsidian 运行时）
│   ├── parser.test.ts
│   ├── numbering.test.ts
│   ├── schema.test.ts
│   ├── frontmatter.test.ts
│   └── settings.test.ts
├── doc/                  ← 文档
│   ├── README.md           需求/规格/Roadmap（原项目根 README，已移入此处）
│   └── log.md              本文件：开发日志与交接协议
├── release/              ← 可分发插件文件（交付物，可直接丢进 .obsidian 测试）★每周期必更新
│   ├── main.js             生产构建（npm run release 生成并同步）
│   ├── manifest.json
│   ├── styles.css
│   └── README.md           安装说明
├── scripts/
│   └── sync-release.mjs    把构建产物同步到 release/（被 npm run release 调用）
├── manifest.json         ← 插件清单（Obsidian 约定须在插件根目录）
├── versions.json         ← 版本 → 最低 Obsidian 版本映射
├── styles.css            ← 面板样式源（构建时随插件加载，并复制入 release/）
├── package.json / tsconfig.json / esbuild.config.mjs / vitest.config.ts
├── .eslintrc.json / .prettierrc.json / .eslintignore / .prettierignore
└── LICENSE
```

构建/工具配置文件按惯例留在项目根（Obsidian 与 esbuild/tsc 默认从此处寻找）。

---

## 如何安装到 Obsidian 测试

将 `release/` 下的三个文件复制到你的 Vault：

```
<你的 Vault>/.obsidian/plugins/obsidian-auto-headings/
├── main.js
├── manifest.json
└── styles.css
```

然后在 Obsidian：设置 → 第三方插件 → 启用 `Auto Headings`。首次启用会在该插件文件夹下
自动创建 `templates/default.json`。

> 重新生成产物：在项目根运行 `npm install && npm run release`，脚本会自动把
> `main.js`、`manifest.json`、`styles.css` 同步进 `release/`。

---

## 2026-06-25 — 白名单（M4）设计加固：保留全部/部分/子树，补齐健壮性规格（仅改文档）

**交接人**：agent（claude/claude-md-docs-1upx6r 分支）

- **做了什么**：与用户评审白名单匹配设计后，**保留** `全部/部分/子树` 三种面向用户的匹配方式
  （直观、好操作），但在 README 把此前的语义漏洞补成明确规格：
  - **匹配归一化**（健壮性核心）：比较前对标题与条目做「剥前缀 → 去行内 Markdown → NFKC →
    trim 并折叠空白 → 转小写」，**仅用于判定、不改写文件**；解决 `**目录**`、全角空格、大小写
    导致的「肉眼相同却不命中」。
  - 把「优先级取最强」澄清为**良定义的并集**：被任一条目命中即豁免；命中它的条目中有「子树」
    则连同子树一并豁免（`子树 > 全部 = 部分`）。
  - 点明「全部/部分」是谓词、「子树」是范围，二者正交；首版**不**提供「部分+子树」组合（留待后续
    高级选项）。明确「子树」根判定按**精确**命中。
  - 「自身被全部/部分豁免、却含子标题」会使子标题错挂到上一个已编号祖先 → 面板 ⚠ 告警引导改用
    子树；引擎不做隐式改写。补充**当前文件实时命中预览**与**条目去重**。
  - 更新 §2.3 边界表、§3.5 计数注意项、§3.7 全节、§5 的 M4 清单。
  - 按用户要求，把**默认模板预填充中英常用结构性标题词表**（目录/附录/附图/附表/参考文献/致谢/
    摘要/索引 及其英文，默认全部匹配）记为 **Milestone 4** 内容，写进 §3.7 词表与 M4 清单。
- **没做什么**：**未改动任何源码**——`WhitelistEntry`（`numbering.ts`）与校验器（`schema.ts`）已
  正确承载 `text + match(exact/partial/subtree)`，无需变动；实际匹配器、归一化、预览、告警、默认
  词表的**落地全部属 M4**，本次只更新规格。因无代码改动，**未重新生成 `release/`**（强制规则 1
  针对代码改动；本周期产物无变化）。
- **下一步**：实现 **Milestone 4**，严格按 README §3.7 新规格：归一化函数（注意只用于匹配）、
  并集解析、子树范围扫描（基于 `parser.ts` 扁平标题列表按级别推算，无父子链）、把判定接到
  `numberHeadings` 的 `isWhitelisted` 回调、扩充 `DEFAULT_TEMPLATE.whitelist` 为上述中英词表、
  以及面板内的 chip 编辑器/去重/⚠ 告警/当前文件命中预览。补单测：归一化各分支、并集优先、子树范围、
  含子标题告警场景。
- **验证方式**：本次为文档改动，`cd obsidian-auto-headings && npm test && npm run lint &&
  npm run format:check` 维持全绿（未触碰源码，行为不变）。

---

## 2026-06-25 — 仓库改用统一 Agent 交接约定（未触碰插件代码）

**交接人**：agent（claude/claude-md-docs-1upx6r 分支）

- **做了什么**：仓库新增顶层 `CLAUDE.md`（通用开发守则）与 Claude Code on the web 的 SessionStart
  钩子（`.claude/`，远程会话自动 `npm install`）；并把「每个 Addon 用 `doc/log.md` 倒序交接」固化
  为全仓库统一约定（见根 `CLAUDE.md` §4）。本文件即该约定在 obsidian-auto-headings 的落地，口径与
  新增的 `chrome-tab-tree/doc/log.md` 一致。
- **没做什么**：未改动任何插件功能代码 / 测试 / 产物；版本号不变（仍 0.3.0）。本项目顶部的
  ⚠️ 强制规则（每周期必跑 `npm run release` 并提交 `release/`）继续有效，优先级高于通用守则。
- **下一步**：插件开发主线不变——见下方 M3 记录的「下一步」（Milestone 4 白名单系统）。
- **验证方式**：本次为文档/工程约定改动，无需重跑插件测试；`npm test` / `npm run lint` 维持上一周期
  的全绿状态。

---

## 2026-06-24 — 交付物规范化（产物文件夹 + 强制约定）

**交接人**：agent（claude/obsidian-auto-headings-m3-t051ro 分支）

用户反馈：希望「每次工作都产出可供 Obsidian 实测的插件」，且产物文件夹用英文名。本次：

1. **产物文件夹 `产物/` → 重命名为 `release/`**（英文、语义清晰）；安装说明文件改名为
   `release/README.md`。同步更新 `.gitignore` / `.eslintignore` / `.prettierignore` 引用。
2. **新增 `npm run release` 脚本**（`scripts/sync-release.mjs`）：一条命令完成「生产构建 +
   把 main.js/manifest.json/styles.css 同步进 `release/`」，让每周期重生产物零成本。
3. **在本文件顶部新增「⚠️ 强制规则」**：要求所有 Agent 每个周期都用 `npm run release`
   重生 `release/` 并随提交入库——这是本次反馈的核心，已固化为团队约定。
4. 重新生成并提交了 Milestone 3 的最新 `release/`（版本 0.3.0），可直接安装实测。

未触碰任何插件功能代码；测试/lint/格式化保持全绿。

---

## 2026-06-24 — Milestone 3：模板系统（完成）

**交接人**：agent（claude/obsidian-auto-headings-m3-t051ro 分支）

### 背景 / 触发反馈
用户在 Obsidian 1.10.4 实测 M2 产物，反馈「GUI 只有全局开关，没看到其他功能」。
M3 的目标正是把模板系统补全，让设置面板真正可用。

### 本周期做了什么（Milestone 3 全部勾选）
1. **序号渲染器**（`src/numbering.ts` `renderNumeral`）：补全 `cjk`（中文数字，含
   十位规范化「十一」与万/亿大节进位）、`circled`（①…㊿，超界回退 `(n)`）、
   `lower-alpha` / `upper-alpha`（双射 26 进制，z→aa）。原先仅 `arabic`。
2. **模板 schema**（`src/templates/schema.ts`，新增）：`normalizeTemplate` 容错校验
   （缺失/非法字段回退默认，不抛错）、`serializeTemplate`、`createDefaultTemplate`、
   `templateFileName`（跨平台文件名安全化，「默认」→ `default.json`）。
3. **TemplateStore**（`src/templates/TemplateStore.ts`，新增）：用 `app.vault.adapter`
   读写 `templates/*.json`；`init()` 首次自动建目录 + 写 `default.json`；
   `create / save / delete / rename` CRUD；默认模板恒置顶、不可删/改名；单个损坏 JSON
   不影响整体加载。
4. **设置 GUI**（`src/settings/SettingsTab.ts` 重写）：模板列表 +「+ 新增模板」+ 每行
   「删除 / 编辑」；编辑向下展开行内面板（H2–H6 × 前缀/序号/序号间隔符/标题间隔符/
   继承前级 五列）+ 每级**实时预览**；非默认模板可在面板内改名（失焦/回车提交）。
5. **样式**（`styles.css`，新增）：编辑面板的网格布局。
6. **接线**（`src/main.ts`）：`onload` 初始化 TemplateStore；编号改用
   `getActiveTemplate()`（当前 = 全局默认模板「默认」），故在 GUI 编辑「默认」会**即时
   改变编号行为**；新增 `renameTemplate()` 钩子（为 M5 路径规则同步预留）。
7. **预览辅助**（`src/numbering.ts` `previewLevel`）：供 GUI 生成同级序号示例。
8. **测试**：新增 `tests/schema.test.ts`（11 例）；更新 `tests/numbering.test.ts`
   原「非 arabic 抛错」断言为各样式正确性断言。**全量 65 例通过，tsc / eslint 清白。**
9. **工程整理**：README 移入 `doc/`；新增可分发产物文件夹（后于同日重命名为 `release/`）；
   版本 0.0.1 → 0.3.0；更新 `.gitignore`（放行 `release/main.js`）/ `.prettierignore` / `.eslintignore`。

### 没做什么（明确的边界，未越界到后续 Milestone）
- **白名单匹配未实现（M4）**：模板已携带 `whitelist` 数据并在 GUI 保留，但 exact /
  partial / subtree 的命中判定与优先级、子树范围计算、计数周期集成**尚未实现**；
  GUI 中白名单编辑器仅有占位提示。`numberHeadings` 仍通过 `isWhitelisted` 回调注入
  （目前 main 未传入，即无白名单生效）。
- **按路径配置未实现（M5）**：当前所有文件统一使用「默认」模板。`renameTemplate` 里
  对 `data.json` 路径规则引用的同步是空操作（无规则可同步）。全局默认模板选择器、
  路径规则表格、路径补全均未做。
- **防抖延迟滑块 UI（M6）**：`debounceDelay` 已在数据模型与逻辑中生效，但设置面板尚无
  调节滑块。
- 多语言、更多序号样式（罗马数字等）、批量重排（M7 Backlog）。

### 已知限制 / 注意点
- 预览中 `circled` 仅覆盖 1–50，超出回退 `(n)`；`stripPrefix` 的带圈正则也仅覆盖常见区段。
- `stripPrefix` 存在设计内歧义：标题本身以「数字+标题间隔符」开头时会被当作旧前缀剥离
  （与 README「手动编辑前缀属预期、会被覆盖」一致）。
- GUI 字段为逐键 `input` 即时保存（写文件）；改名为失焦/回车提交以避免产生中间文件。

### 下一步（给接手 agent）
1. **Milestone 4 — 白名单系统**：在 `numbering.ts` 实现三种匹配与优先级（全部＜部分＜
   子树）、子树范围计算；在 `main.ts` 把当前模板的白名单接成 `isWhitelisted` 传入
   `renumberContent`；在 `SettingsTab` 的编辑面板内做白名单 chip 编辑器（输入回车添加、
   匹配方式下拉、x 删除）。数据通道（`Template.whitelist` + 序列化）已就绪。
2. **Milestone 5 — 按路径配置**：`PathRuleStore`、全局默认模板选择器、路径规则表格 +
   Obsidian 路径补全；解析后用 `getActiveTemplate(filePath)` 选模板；补全
   `renameTemplate` 中对路径规则的同步。
3. 建议：为 TemplateStore 增加针对 vault adapter 的集成测试（可 mock adapter）。

### 验证方式
```bash
cd obsidian-auto-headings
npm install
npm test           # 65 例
npm run lint
npm run release    # 构建并同步可实测插件到 release/
```
