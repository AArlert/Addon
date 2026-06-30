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
> 改 `src/numbering.ts`（1100+ 行）/ `src/settings/SettingsTab.ts`（1000+ 行）这类大文件，**先用 `grep`/`rg` 定位再读**，别整读。

> 一句话：**改代码 → `npm run bump` → 写本文件新块 + `status.jsonl` → `npm run docs` → `npm run release` → 提交（含 `release/`）。**

---

## 2026-06-30 0.6.8 工作流瘦身：文档归档 + 版本号一键同步脚本（claude/workflow-optimization-discussion-v8tdxg）

### 背景

单次任务的 Claude 额度越来越高，根因是「只增不减的叙事仪式」+「宽改动面」：`log.md` 已 1458 行/37 块、
`testplan.md` 439 行/129 场景，每次任务都得在海量信息里找重点；小改动也要手改 4~5 处版本号。
本周期把「机械整理」脚本化，让 Agent 跑一行命令挪动、只写语义部分。**经讨论确认：测试体系（引擎单测 + UVM/fuzz）全保，它是省 token 的保险，不在瘦身范围内。**

### 做了什么

- **新增 `npm run bump`（`scripts/bump.mjs`）**：一条命令把版本号同步进 `package.json` / `manifest.json` /
  `package-lock.json`（顶层 + `packages[""]`）/ `versions.json`（追加 `<新版本>: minAppVersion`）/ `release/manifest.json`。
  支持 `bump`（打磨递增 `*`）/ `bump minor`（进新 Milestone，`*` 归零）/ `bump 0.7.0`（显式）。本周期用它 0.6.7 → 0.6.8。
- **新增 `npm run docs`（`scripts/docs.mjs`）**：每周期收尾跑一次，三件事——
  1. **归档 log.md**：只保留最新 N 个「带日期周期块」（默认 N=3），更旧的整体移入 `doc/log-archive.md`（倒序）。
     按标题是否含日期 `YYYY-MM-DD` 区分「周期块」与「常青块」（强制规则 / 目录结构约定 / 安装说明），常青块永不归档。
  2. **testplan 摘要**：扫真值表按状态计数，并列出全部**非 ✅** 行（ID + 行号）——Agent 读这份摘要即可，不必整读 439 行。**只读不改，零信息损失**（不删 ✅ 行，避免丢 user_tests 映射）。
  3. **校验 status.jsonl** 首行为合法状态 JSON。
  支持 `--keep N` 改保留数、`--check` 只检查不挪动（CI 友好）。
- **本周期归档**：log.md 由 37 块滚动到「最新 3 周期块 + 3 常青块」，旧 31 块进 `log-archive.md`。
- **`status.jsonl` 首行减肥**：从 ~200 token 的密集 blob 砍成「版本 + 一句话现状 + 下一步」，细节下沉 log。
- **CLAUDE.md（根）§4 / §4.1 + 本文件强制规则**：写入新的脚本化周期流程（写新块 → `bump` → `docs` → `release`）与「grep 优先、禁整读大文件」纪律。

### 没做什么

- 未拆 `numbering.ts`（1114 行）/ `SettingsTab.ts`（1015 行）大文件（属激进档，本轮不做）。
- 未删 / 未折叠 testplan 的 ✅ 行（改用摘要脚本达到同等 token 收益，不做有损删除）。
- i18n 冻结不扩展，但**不回头删**（已落地，删它换零用户价值）。
- 无产品行为改动，故 testplan 场景与 dev_tests 断言未动。

### 下一步

- 实测验证脚本化流程在下个真实开发周期顺手（写块 → bump → docs → release）。
- 可选：把 `npm run docs --check` 接入质量门槛 / CI，防止 log.md 再次膨胀。

### 验证方式

- `npm run bump` 后五处版本号一致（已验 0.6.8）。
- `npm run docs` 后 log.md 仅剩 3 周期块 + 常青块，log-archive.md 含 31 旧块且倒序；重复跑幂等（无新归档）。
- `npm test` / `npm run lint` / `npm run format:check` / `npm run release` 全绿。

---

## 2026-06-30 0.6.7 修 U4（标题前导空白非幂等）+ explore 转正回归（claude/heading-numbering-idempotency-equdp0）

### 做了什么

- **修 U4**（`src/numbering.ts`）——根因：`stripPrefix` 按 WJ 剥离后，正文可能带前导 ASCII 空白（脏编辑/破坏前缀残留）；白名单/超界分支输出 `${hashes} ${text}` 时多一个空格，下次 parser `[ \t]+` 贪婪吞掉全部前导空格，两次解析出不同 `rawText`，非幂等。修法：
  - `stripHeadingPrefix` 末尾追加 `.replace(/^[ \t]+/, "")`（去首 ASCII 空白），覆盖白名单分支和编号分支。
  - `numberHeadings` 超界分支（`level < top || level > bottom`）的 `text` 同样追加 `.replace(/^[ \t]+/, "")`。
  - 仅去 ASCII `[ \t]`（不动全角空格 U+3000），与 parser `HEADING_RE` 的 `[ \t]+` 对称，修复现有全角空格白名单测试（`## 　目录　`）。
- **4 条回归测试**（`tests/dev_tests/numbering.test.ts`，「U4：标题正文含 WJ 后前导空白时幂等」块）：白名单分支 / 超界分支 / 编号分支 / 多前导空格极端情况，全部幂等。
- **explore 转正**（`tests/dev_tests/random_sequence.test.ts`）：U4 是 explore 记分板最后一个未修 bug，修后 seed=95 单跑通过、8000×80 全绿无新 bug；去掉 `it.skip` 门控，explore 幂等性记分板变为常规 CI（500×60）。`AAH_FUZZ_MODE` 环境变量保留但不再作 skip 门控。
- **testplan §3.2 U4**：状态 ⚠️→✅，补根因说明与修复方案。
- **版本**：0.6.6 → 0.6.7，release/ 重建。

### 没做什么

- 未改其他模块（编号逻辑 / 白名单 / 路径规则 / i18n / 设置面板）。
- U3（字母样式吞英文起头标题）属设计取舍，explore 框架内部通过 `EXPLORE_GEN` 约束规避，未作修改。

### 下一步

- 手验：① 插件写出 `## 1 ⁠  - 列表式标题`（前导空格）后两次触发结果相同；② explore 8000×80 常绿监控。
- 可选：清理 `random_sequence.test.ts` 中已过时的 `MODE` 常量（不再使用，但无害）。

### 验证方式

`npm test`（232 passed / 0 skipped）、`npm run lint`、`npm run format:check`、`npm run release` 全绿。
`AAH_FUZZ_RUNS=8000 AAH_FUZZ_OPS=80 npx vitest run tests/dev_tests/random_sequence.test.ts`：2 tests passed。

---

## 2026-06-30 0.6.6 方案A(WJ 边界根治正文被吃) + UVM 真实白名单升级 + 清理外来编号命令 + 白名单集成修复（claude/obsidian-auto-headings-polish-gvq9cf）

### 做了什么（按用户给的顺序：先升框架、再方案A、再修 bug，外加新命令）

- **UVM 框架升级（`tests/dev_tests/uvm/framework.ts`）**——把「插件全部可设置 + 用户可操作」更全地纳入激励空间：
  - **真实白名单驱动**：删去旧版注入的 `isWhitelisted` 回调，改由 `template.whitelist`（随机 0–2 条、匹配方式含 **exact/partial/subtree**）驱动引擎 `computeWhitelistExemptions`——旧版**完全没覆盖子树 / 部分匹配 / 子标题随根豁免**。新增 `setWhitelist` 激励（增 / 删 / 改条目）。
  - **bottomLevel 维度**：新增 `setBottomLevel` 激励（[topLevel,6] 随机）+ topLevel 抬高时联动抬 bottomLevel。
  - **覆盖率新 bin**：whitelist-exact/partial/subtree、subtree-带子标题、bottomLevel-narrowed（默认 500×60 闭合）。
  - **撞 bug**：默认（参考模型）8000×80 全绿 → 证实引擎 exact/partial/subtree 豁免在「带历史前缀 vs 裸文档」两侧一致、无前缀敏感分叉（即用户报告的子树 bug **不是引擎 bug**）。explore（叠加脏编辑）撞出 **U4**（标题以**空白**起头时连续触发非幂等，parser `[ \t]+` 收拢所致），登记 testplan §3.2 未修。
- **方案A（`src/numbering.ts`，用户拍板「直接默认、不适配历史」）**——`stripPrefix` 改为**纯 Word Joiner 边界**：含 WJ → 精确剥到标记后；**无 WJ → 整段视为正文、原样返回**（不再正则猜前缀）。删去不再使用的容差正则机器（`tolerantSeparator`/`tolerantInnerSeparator`/`innerSegmentToken`/`lastSegmentToken`/`unionToken`/`ALWAYS_STRIPPABLE_STYLES`）。**根治**「2024 年度总结 / API 设计 等正文被当编号吃」整类问题（U1/U2/U3 一并消除，known_bugs.test 三条转为「正文保留+幂等」回归）。`stripPrefixBroad`（「清除编号」用）保持激进正则不变。`level/template/options` 三参降级为签名兼容（`_` 前缀）。
- **新命令「清理非本插件的标题编号」（用户追加需求，配合方案A）**——`src/numbering.ts` 加 `stripForeignNumbering`（更广手写惯例正则：全样式 + `第…章` + 成对括号 `(1)`/`（一）`/`[1]`/`【1】` + `1.`/`1)`/`一、`，序号后须跟分隔/右括号才剥，故 `100`/`三` 不误剥）；`src/cleanup.ts` 加 `clearForeignNumberingContent`（**只剥不含 WJ 的标题**、保留插件自己写的 WJ 编号）；`main.ts` 注册命令 `clear-foreign-numbering` + `runClearForeignNumbering`；i18n 加 `cmdClearForeign`/`noticeForeignCleared`/`noticeNoForeign`。
- **白名单子树「集成 bug」修复（WL-int）**——定位为**预览口径不一致**（白名单编辑器预览的是「正在编辑的模板」，文件却按路径规则解析到另一个模板编号）。修：`SettingsTab` 白名单预览在「当前文件实际模板 ≠ 正在编辑模板」或「无命中模板」时显示 ⚠ 提示、预览标注「假设」（i18n `wlPreviewOtherTemplate`/`wlPreviewNoTemplate` + `.ah-wl-mismatch` 样式）；`main.test.ts` 加集成回归（子树白名单经自动触发路径正确豁免根+子标题、幂等；并附「机制说明」用例）。
- **测试**：numbering（stripPrefix/2024 折中块/C3/空标题等约 8 组改写为方案A 语义 + bottomLevel 区间块沿用）、known_bugs（U1/U2/U3 转正）、cleanup（新增 clearForeignNumbering 7 例 + C3 调整）、main（strippableAffixes 改 WJ + 子树集成 2 例）、whitelist（D7 改 WJ）、i18n（形状一致自动校验新键）。
- **文档**：spec §2.3（2024 行）/§2.4（标「方案A 已落地」+ 改锚点）/§3.5（方案A 剥离）/§3.10（三入口 + 新命令 + stripForeignNumbering）/Roadmap M7；testplan §3.2（U1/U2/U3→✅ 方案A 根治 + U4 登记）/§3.3（WL-int→✅）；README / release/README（新命令 + 方案A）。

### 没做什么

- **U4 未修**（标题正文以空白起头 → parser `[ \t]+` 收拢致非幂等）：explore 专属脏输入边角，正常输入不触发，登记 testplan §3.2 待后续。
- explore 模式仍 `it.skip`、不进 CI（撞 U4）；默认模式（参考模型）才是 CI 常绿网。
- 历史（0.6.4 前无 WJ）前缀不再被常规重排识别——用户明示「无线上用户、不适配」。

### 下一步

- 手验：① `## 2024 年度总结` 触发后 `2024` 保留；② 导入带手写 `1.2 ` 编号的文档 → 命令「清理非本插件的标题编号」清掉 → 再自动编号；③ 在「模板 A」白名单编辑器里，当前文件用「模板 B」时面板出现 ⚠ 模板不一致提示。
- 可选：修 U4（标题前导空白）；放开 explore 对应约束转回归。

### 验证方式

`npm test`（227 passed + 1 skipped）、`npm run test:fuzz`（默认 5000×80 全绿；explore 仅撞 U4）、`npm run lint`、`npm run format:check` 全绿；`npm run build` + `npm run release` 重建 release/。版本 0.6.5→**0.6.6**。

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
