# obsidian-auto-headings 开发日志与协作交接

本文件用于多 agent / 多人协作的**握手交接**：每个开发周期结束时，记录「做了什么、
没做什么、下一步干嘛」，让接手者无需通读全部代码即可继续。倒序排列（最新在最上）。

**接手前怎么读**（见根 [`CLAUDE.md`](../../CLAUDE.md) §4）：先读 [`status.jsonl`](./status.jsonl)
（状态索引）→ 再读**本文件最新一块**的「下一步」即可上手；需要更早来龙去脉时才按需往下翻历史块，
**不必从头通读**。

> 配套文档：完整需求与功能规格见 [`spec.md`](./spec.md)（含 7 个 Milestone 的 Roadmap）；
> 面向读者的简介见上一级 [`../README.md`](../README.md)。
>
> **注**：本日志**历史条目**中出现的「README §X.Y」均指原规格文档——它已更名为 `spec.md`
> （章节号不变），请按 `spec.md` 对应章节查阅。

---

## ⚠️ 强制规则（所有 Agent 必须遵守）

1. **每个开发周期都必须产出可供 Obsidian 实测的插件**，放在仓库的 **`release/`** 文件夹。
   完成代码改动后，**务必运行 `npm run release`**（= `npm run build` + 同步脚本），它会把
   `main.js` / `manifest.json` / `styles.css` 刷新进 `release/`。**不要只改源码而忘记重新生成
   `release/`**——用户是直接拿 `release/` 里的文件丢进 `.obsidian/plugins/` 实测的。
2. **`release/` 必须随提交一起入库**（`.gitignore` 已对 `release/main.js` 设例外放行）。
   提交前自检：`git status` 应能看到 `release/` 下的文件已更新/已暂存。
3. 改动若影响行为或版本，**跑 `npm run bump`** 一键同步版本号（`package.json` / `manifest.json` /
   `package-lock.json` / `versions.json` / `release/manifest.json`），并在本文件**最上方追加一条新的周期记录**。
4. 写完新周期块后**跑 `npm run docs`**：把旧周期块归档进 `log-archive.md`（只保留最新 3 块），
   顺带打印 testplan 摘要自检。**先写新块、后跑脚本**——脚本只搬旧块，不碰你刚写的块。
5. 合并前的质量门槛：`npm test`、`npm run lint`、`npm run format:check` 全绿。

> **省 token 读盘**：接手只读本文件**最新一块**（更早翻 `log-archive.md`）；`testplan` 跑 `npm run docs` 看摘要即可；
> 改 `src/numbering.ts`（1100+ 行）/ `src/settings/SettingsTab.ts`（1000+ 行）这类大文件，**先查 `doc/codemap.md`**
> （自动生成的符号地图：符号→文件:行号 + 大文件大纲带意图）拿函数名/位置，再 `grep`/`rg` 定位那一处，别整读。

> 一句话：**改代码 → `npm run bump` → 写本文件新块 + `status.jsonl` → `npm run docs` → `npm run release` → 提交（含 `release/`）。**

---

## 2026-06-30 0.7.1 Backlink 同步落地（M7 核心，opt-in 默认关）+ UVM 纳入往返不变量（claude/obsidian-auto-headings-release-lfniw0）

### 背景

承 0.7.0 立项：Backlink 同步是上架前唯一硬短板。先扒了竞品 **Header Enhancer** 的 `src/backlinks.ts` 实现
（命令驱动 / `getBacklinksForFile` 反查 / `vault.read`+`vault.modify` 写回 / 子串匹配 / 不处理别名与重复标题），
确认架构可抄、四处可做得更稳。spec §3.12 已据此补全（4 改进 + 2 风险规避）。本周期落地实现。

### 做了什么

- **新增 `src/backlinks.ts`（纯函数核心，可纯单测）**：
  - `linkAnchor`：标题→锚点归一（剥 WJ + 去 `[ ] # | ^` + 折叠空白 + trim），**两侧同口径**故含不含 WJ 都匹配，写出链接剥 WJ 干净。
  - `computeHeadingRenames(old,new)`：两侧 `parseHeadings` 按 `lineIndex` 配对（编号不重排行），取变化且非空者；**重复旧锚点歧义剔除**（保守不改）。
  - `rewriteBacklinksInContent`：正则扫 `[[…]]`/`![[…]]`，basename 命中 + subpath 归一命中才改，**保留别名 `|alias` 与嵌入 `!`**；块引用 `^`/多级锚点 `#A#B`/同文件内链分别处理。
- **接线 `src/main.ts`**：新增 `syncBacklinks(target,old,new)`——`updateBacklinks` 开 + 改名表非空才进入（日常打字零开销）；`getBacklinksForFile` 取 `.data` Map 反查、`vault.process` **原子**写回（优于 Header Enhancer 的 read+modify）；半公开 API 缺失静默降级、**绝不打断编号**。挂到 `applyRenumber`（自动/手动/改模板三路径）+ 两个清除命令。
- **设置 / i18n / GUI**：`settings.updateBacklinks`（默认 false + loadSettings 迁移）；i18n 加 `updateBacklinksName/Desc` + `noticeBacklinksUpdated`（中英）；SettingsTab 防抖滑块下加开关。
- **比 Header Enhancer 改进 4 处**（spec §3.12）：原子 `vault.process` / 保留别名嵌入 / 重复标题保守不改 / 自动路径 gate。规避 2 风险：未文档化 API 适配降级、不用子串匹配。
- **扩大 UVM 验证范围**：framework 新增**第三块记分板** `checkBacklinkRoundTrip`（两 oracle 都跑）——断言改名表幂等 + 链接重写往返一致（`[[Target#旧]]` 重写后恰指向同标题新名），覆盖率加 `backlink-rename` bin。**8000×80 全绿**（撞出并修正一处不变量边界：标题被编号吃成空锚点时按设计不改名，排除出断言）。
- **测试**：新增 `backlinks.test.ts`（20，纯函数：归一/改名表/重写各边界）；`main.test.ts` +4（集成：开关开/关、清除同步、幂等不改）。**256 passed**（+24）。
- 文档：spec §3.12 重写 + TOC、testplan 新增 **M 类**（M1–M12）+ §4 三记分板、README 功能条 + Milestone。bump 0.7.0→0.7.1。

### 没做什么

- **未在 Obsidian 内实测 WJ 链接解析**（testplan M11，**user_tests 必验**）：写出的链接剥 WJ、真实标题含 WJ，需确认能解析；若否，改为生成侧保留 WJ（`linkAnchor` 仅匹配侧剥），一行可切。
- 重复同名标题精确消歧（`#标题-1`）、多级锚点 `#A#B`、全库扫描修历史断链：**保守跳过**，留 M8 backlog。
- 同文件内链 `[[#锚点]]` 在「本文件正编辑且有未保存改动」时与编辑器缓冲的冲突：边角，登记已知限制。
- 未 bump 1.0 / 未提交社区 PR：**依然内测打磨**（M7 进行中）。

### 下一步

1. **user_tests 实测 M11**（WJ 链接解析）+ M7/M12（同文件内链、大库性能）——这是 1.0 前最后的运行时确认。
2. 实测无碍后：英文 README + 截图 → `npm run bump 1.0.0` → 打 `v1.0.0` Release → 提交 `obsidian-releases` PR。

### 验证方式

- `npm test` 256 passed；`AAH_FUZZ_RUNS=8000 AAH_FUZZ_OPS=80` 两记分板 + backlink 往返全绿；lint / format / build / release 全绿。
- backlink 纯函数边界（别名/嵌入/块引用/多级/basename/重复/同文件）由 `backlinks.test.ts` 钉死；触发接线由 `main.test.ts` 集成覆盖。

---

## 2026-06-30 0.7.0 上架冲刺立项：竞品分析 + Roadmap 重构 + Backlink 定为 1.0 前置（claude/obsidian-auto-headings-release-lfniw0）

### 背景

用户决定上架 Obsidian 社区。两轮深度竞品调研（Number Headings / Auto Heading / Header Enhancer /
Auto Numbered Headings）结论：①龙头 Number Headings 已停更 ~2.5 年、38+ issue 堆积，**窗口开放**；
②我们的差异化（自定义模板 / 按路径选模板 / 清除·清理外来编号）**竞品全无**；③**唯一硬短板 = Backlink 同步**
（改标题后 `[[file#heading]]` 断链，社区呼声第一，仅 Header Enhancer 解决）。用户拍板：**Backlink 必做、
版本号必 bump**。轻度用户「过度设计」质疑由「默认模板 + `/` 根规则（最低优先级）」开箱即得 `1.1.1` 化解——
非新功能，是定位答案。

### 做了什么（纯文档规划周期，未碰 src / 测试）

- **新建 `doc/competitive.md`**：竞品全景 + 功能对比矩阵 + 社区痛点排序 + 定位结论 + 发布策略。
  数据来自各竞品仓库 / Release / Issues / 论坛（2024–2026），下载量为调研约值（标注）。
- **`spec.md` 新增 §3.12 Backlink 同步**（1.0 前置）：问题 / 设计原则（挂编号写回后、opt-in、WJ 锚点边界）/
  四步流程（改名表 → 反查 backlink → 单事务重写锚点 → Notice）/ 边界（重复标题消歧 `#标题-1`、块引用、
  大库性能、undo 一致性、历史断链）。
- **`spec.md` Roadmap 重构**：M6 标 ✅ 完成；**M7 改为「上架冲刺」**（Backlink 核心 + 英文 README + `1.0.0` 转正
  + 提交 `obsidian-releases` PR + 发布自检）；原 backlog（批量 / 导出 / 预览）下沉**新建 M8**，并加「扫描修复历史
  断链」「（观察）Visual-only」两项。
- **README Milestone 表**同步：M6→完成、M7→上架冲刺(进行中)、M8→Backlog；版本说明补「M7 完成转 1.0.0」+ 指向 competitive.md。
- **bump 0.6.9 → 0.7.0**（`npm run bump minor`，进入 M7）。

### 没做什么

- **未实现 Backlink**（本周期只立规格 + 排期）；未碰任何 `src/` 逻辑、未改测试（232 passed 不变）。
- 未写英文 README（M7 物料阶段做）；未提交社区 PR。
- §3.12 的开放问题（重复锚点消歧、undo 合批与否）留实现期定夺并登记 testplan。

### 下一步

1. **实现 Backlink 同步**（M7 核心）：先在 `numbering` 输出「旧→新标题文本」改名集；新增 `backlinks.ts`
   走 `metadataCache.getBacklinksForFile` 反查 + 单事务重写锚点；opt-in 开关进 settings + SettingsTab。
2. testplan 先加 Backlink 场景行（含重复标题 / 块引用 / undo 边界）再动代码。
3. Backlink 绿后：英文 README + 截图 → `npm run bump 1.0.0` → 打 `v1.0.0` Release → 提交 `obsidian-releases` PR。

### 验证方式

- 本周期纯文档：`npm test`（232 passed）/ `npm run lint` / `npm run format:check` / `npm run release` 全绿（行为未变）。
- spec / README / competitive 三处 Roadmap 口径一致（M6✅ / M7 上架冲刺 / M8 backlog）。

---

## 2026-06-30 0.6.9 代码符号地图（codemap）自动生成 + 接入文档守卫（claude/workflow-optimization-discussion-v8tdxg）

### 背景

承接 0.6.8「grep 优先、禁整读大文件」纪律——但 Agent 得先知道有哪些函数名可 grep。
方案评估后选「自动生成 + 守卫 + grep 查询」（手维护必漂移；纯 rg 现查抓不准类方法）。

### 做了什么

- **新增 `scripts/codemap.mjs` + `npm run codemap`**：用已装的 `typescript` compiler API 走 AST，
  扫 `src/` 全部 .ts，产出 `doc/codemap.md`。选 AST 而非正则的理由：最大文件 `SettingsTab.ts`（1016 行）
  几乎全是**类方法**，正则抓类方法很脆，AST 能准确拿 function / 类方法 / class / interface / type。**零新依赖**。
- **`doc/codemap.md` 两段式**（本次 146 符号 / 267 行）：
  - **全局索引**（覆盖全部文件）：`符号 → 文件:行号` 表，按名排序——解决「这函数在哪个文件」，
    一次 grep 命中，替代全仓 content grep。
  - **大文件大纲**（仅 > 300 行：numbering/SettingsTab/main/i18n）：逐符号一行，带签名 + JSDoc 首行意图
    （§2 已强制中文 JSDoc，白送）。Agent 读这行就知道函数干嘛，不必读函数体。
- **接入既有基建**：`docs.mjs` 加 `syncCodemap()`——`npm run docs` 默认重新生成 codemap；
  `docs --check`（pre-commit 守卫调用）比对新鲜度，**改了源码没重生成 codemap 就拦下提交**。漂移归零。
- **CLAUDE.md §3 + 本文件强制规则**：补「grep 大文件前先查 `doc/codemap.md` 拿函数名/位置」。

### 没做什么

- 小文件（< 300 行，9 个）不出大纲——直接 grep 源码已够便宜，只进全局索引。
- 未碰任何 `src/` 逻辑、未改测试（codemap 是纯派生产物，无产品行为改动）。
- 意图行偶有空 `{@link}` 残留（JSDoc 内联标签被剥后留「见 / 」），无害，未特殊处理。

### 下一步

- 实测：改某函数后 `npm run docs` 重生成 codemap，pre-commit 守卫能否拦下「忘了重生成」。
- 可选：若以后 i18n 文案表的非函数符号噪声大，可在大纲里按 kind 过滤。

### 验证方式

- 生成器确定性：连跑两次 `md5sum doc/codemap.md` 一致。
- 守卫三态退出码：codemap 最新 → `docs --check` exit 0；篡改 → exit 1；`npm run docs` 修复 → exit 0。
- `doc/` 已在 `.prettierignore`，prettier 不改 codemap.md（md5 不变），守卫不误报。
- `npm test`（232 passed）/ `npm run lint` / `npm run format:check` / `npm run release` 全绿。

---

## 目录结构约定（按职责分类）

```
obsidian-auto-headings/
├── src/                  ← 源代码（TypeScript）
│   ├── main.ts             插件入口：生命周期、命令、防抖、事务写回、模板接线
│   ├── parser.ts           Markdown 标题解析（ATX、代码块边界）
│   ├── numbering.ts        计数器状态机、序号渲染器、前缀拼装、起始层级 topLevel、整文重排
│   ├── frontmatter.ts      单文件开关（obsidian-auto-headings: ON/OFF）读取
│   ├── settings.ts         设置数据模型（全局开关、防抖延迟）
│   ├── settings/
│   │   └── SettingsTab.ts  设置 GUI（全局开关 + 模板编辑器）
│   └── templates/
│       ├── schema.ts       模板 schema 校验/序列化/文件名安全化
│       └── TemplateStore.ts 模板文件 CRUD（vault adapter 读写 templates/*.json）
├── tests/                ← 测试
│   ├── dev_tests/          自动化单元测试（Vitest，无需 Obsidian 运行时，npm test 跑它）
│   │   ├── parser.test.ts
│   │   ├── numbering.test.ts
│   │   ├── schema.test.ts
│   │   ├── frontmatter.test.ts
│   │   └── settings.test.ts
│   └── user_tests/         可复制粘贴进 Obsidian 实测的 .md 样例（每个对应 testplan 某场景）
├── README.md             ← 面向读者的简介（当前功能 + Milestone 概览，入口文档）
├── doc/                  ← 文档
│   ├── spec.md             详细需求/规格/Roadmap（原 doc/README.md，已更名）
│   ├── testplan.md         测试场景与真值表（操作序列 + 预期 + 状态 + 已知 bug 汇总）
│   ├── log.md              本文件：开发日志与交接协议（详细）
│   └── status.jsonl        状态索引：首行总览 + 每周期一句话概括（接手先读）
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
