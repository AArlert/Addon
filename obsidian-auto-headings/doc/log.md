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

## 2026-06-30 0.7.3 修 Backlink 实测断链：写入链接保留 WJ（M11 根治）（claude/obsidian-auto-headings-release-lfniw0）

### 背景

用户实测 0.7.2 backlink：开开关后，指向**编号标题**的内部链接「没更新 / 不生效」，唯独在被引用文件里手动跑
「清除编号」命令才生效。关键线索：**清除后是裸标题（无 WJ）→ 链接生效；编号态（含 WJ）→ 链接失效**。

### 根因（M11 落实为真 bug）

编号写入的标题含不可见 Word Joiner（`## 1 ⁠标题`）。0.7.1 的 `linkAnchor` 在**写入侧也剥 WJ**，于是写出
`[[a#1 标题]]`（无 WJ）。**Obsidian 标题锚点解析按字节比对、不剥 WJ**，故剥了 WJ 的链接解析不到含 WJ 的标题
→ 显示断链（用户感知「没更新」）。清除编号得裸标题，链接（无 WJ）反而能解析——正是用户观察到的现象。

### 做了什么

- **`src/backlinks.ts` 拆双口径锚点**：
  - `linkAnchor`（**匹配用**：改名表 `from` + 引用链接 subpath）：仍**剥 WJ**，含不含 WJ 的既有链接都能匹配。
  - 新增 `displayAnchor`（**写入用**：改名表 `to`）：**保留 WJ** + 去 `[ ] # | ^` + 折叠空白（WJ 不在 `\s` 内，
    不受折叠影响）。写出的链接 `[[a#1 ⁠标题]]` 与真实标题字节对齐 → Obsidian 必然解析（裸标题无 WJ 时两者等价）。
  - `computeHeadingRenames`：`from=linkAnchor(旧)`、变化判定 `linkAnchor(新)`、`to=displayAnchor(新)`（仅 WJ 差异不算变化）。
- **测试**：`backlinks.test.ts` 加 `displayAnchor` 块 + 改 `computeHeadingRenames` 期望（`to` 带 WJ）；`main.test.ts`
  集成期望链接含 WJ。UVM 往返记分板**无需改**（两侧都过 `linkAnchor` 比较，WJ 无关），8000×80 全绿。260 passed（+2）。
- 文档：spec §3.12 锚点归一改「匹配/写入双口径」+ M11 标已修；testplan M11→✅(待 Obsidian 复测)、新增 M13（只在编号
  改写标题时同步，对「已编号后手敲的不匹配链接」不主动修——设计取舍）。bump 0.7.2→0.7.3。

### 没做什么

- 未改 WJ 在标题里的存在本身（方案 A 核心，保留）；只改链接生成口径。
- 「已编号态、之后手敲不匹配链接」不主动修（需真实标题变更触发）——属设计取舍，登记 testplan M13。

### 下一步

1. **用户 Obsidian 复测 M11**：编号标题 + 别处链接 → 改动标题（增删上方标题致重排）→ 链接应自动跟新且**可点开解析**。
2. 无碍后英文 README → bump 1.0.0 → 提交社区 PR。

### 验证方式

- `npm test` 260 passed；8000×80 两记分板 + backlink 往返全绿；lint / format / build / release 全绿。
- `displayAnchor` 保留 WJ、`linkAnchor` 剥 WJ 由 `backlinks.test.ts` 钉死；集成链接含 WJ 由 `main.test.ts` 覆盖。

---

## 2026-06-30 0.7.2 修三个实测 GUI / 触发 bug（改模板不刷新 / 新增模板卡顿 / 整行可拖动）（claude/obsidian-auto-headings-release-lfniw0）

### 背景

用户实测 0.7.1 报三个 bug（其中 N1 导致 backlink 无法实测，因为改模板不触发重排）：

### 做了什么

- **N1 改模板样式后已编号标题不刷新**（一→①，根因，连带 backlink 测不了）：`renumberActiveFile` 原用
  `getActiveViewOfType(MarkdownView)`，**设置面板是模态层、打开时活动视图常为 `null`** → 静默跳过。
  改为遍历 **`getLeavesOfType("markdown")` 全部打开叶子**逐个重排（仍按 shouldAutoTrigger + 路径解析模板门控），
  顺带支持多文件同时刷新。`main.test.ts` 加两条回归（一→①刷新、多叶子同时重排）。
- **N2 新增模板卡顿 / GUI 不第一时间显示**：新增按钮原 `await templateStore.create()`（含磁盘写入）后才
  `display()`，慢盘 / 同步库阻塞。`TemplateStore.create` 改**同步加内存 + 后台落盘**（`void write().catch()`），
  点击即重绘；落盘失败仅退化为「重启丢该模板」，无破坏。按钮 onClick 去掉 await。
- **N3 路径规则整行可拖动**：`draggable` 原设在整行 `row`（妨碍路径输入框选词）。改为 `draggable` +
  `dragstart`/`dragend` 只挂 `⠿` 手柄，行仅作放置目标（dragover/drop 不变）。新增 i18n `dragHandleTooltip`。

### 没做什么

- 未碰编号引擎 / backlink 核心（纯触发层 + GUI + TemplateStore）。
- 白名单预览的 `currentFileHeadings/currentFilePath` 仍用 `getActiveViewOfType`（同源潜在问题，但未被报告、
  且「当前文件」预览语义在多叶子下本就模糊，留观察）。

### 下一步

1. 用户重测：改模板样式即时刷新 → 进而**实测 M11**（WJ 链接能否被 Obsidian 解析，1.0 前必验）。
2. 无碍后英文 README → bump 1.0.0 → 提交社区 PR。

### 验证方式

- `npm test` 258 passed（+2）；lint / format / build / release 全绿。
- N1 回归：`main.test.ts` 改样式后 `## 一 ⁠章`→`## ① ⁠章`、多叶子各自 `## 1 ⁠X`。

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
