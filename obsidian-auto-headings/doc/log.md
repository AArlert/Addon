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

## 2026-06-30 0.7.5 UVM 扩展阶段 1：清除命令 S4/S5 + 两层门控 S6（缺口①②）（claude/obsidian-headings-uvm-test-y8wdjh）

**做了什么**：按用户「1、2 都做，跑压力测试，不 debug 只记录」落地扩展蓝图**阶段 1**——把两类真实用户操作
纳入 `framework.ts` 激励空间与记分板（原框架只压 `renumberContent`）：

- **缺口①清除命令**：新增激励 `clearNumbering`（DUT `clearNumberingContent`）/ `clearForeign`
  （DUT `clearForeignNumberingContent`），配 **S4 清除还原律**（清除编号 → 还原裸文档）+ **S5 清外来不动律**
  （清外来 → 不动自家 WJ 编号）。守卫：只在「裸文档为 clear 定点」（`clear(bare)===bare`）时施加并断言，
  自动排除自食前缀 / 白名单豁免 / 像外来编号的裸标题；且**仅参考模式**施加。
- **缺口②两层触发门控**：新增 `setFrontmatterSwitch`（true/false/非法/删除，渲染成真实 `---` 块）/
  `setAutoNumber`（全局开关）。触发分**手动**（`manualTrigger`，绕过门控，对应「立即重新编号」）/**自动**
  （`trigger`，过真实 `readFileSwitch` + 全局开关的 `shouldAutoTrigger`）。**S6 门控**：门控关时 `rendered`
  冻结（自动触发不应用）、且真实 `readFileSwitch` 解析与结构化 fm 状态一致（`checkGate`）。
- 新增覆盖率 bin（gated-off / fm=false·true·illegal / autoNumber-off-trigger / manual-trigger /
  clear-restore(S4) / clear-foreign-noop(S5)），500×60 默认运行**闭合**。

**压力测试结果（不 debug 只记录）**：8000×80 两记分板（参考 + explore 幂等）+ S4/S5/S6 **全绿，未发现引擎 bug**。
唯一记录的边界：explore 模式 `mutatePrefix` 故意抹掉 WJ 后，「清外来」剥掉失去 WJ 的残缺前缀属**预期**
（用户破坏了编号、插件靠 WJ 认不出是自家的），S5「无操作」前提随之不成立——故 S4/S5 仅在参考（干净）模式
施加。登记为 testplan §3.2 取舍 **S5b**（非 bug）。

**没做什么**：未改任何 `src/`（只改 `tests/dev_tests/uvm/framework.ts` + 文档）——插件行为零变化，260 测试不变。
缺口③（多文件 + 多模板 + 路径规则，S7）、缺口④（Backlink 开关门控）属结构性升级，留**阶段 2**（World→Vault）。

**下一步**：评审阶段 1 后按 testplan §4.1.5 做阶段 2（`World→Vault` 多文件多模板 + S7 模板解析稳定律 +
真实 `strippableAffixes()` 并集）。M7 上架冲刺主线（Obsidian 复测 M11 → 英文 README → 1.0.0 → 社区 PR）并行不受影响。

**验证方式**：`npm test` 260 passed；`AAH_FUZZ_RUNS=8000 AAH_FUZZ_OPS=80` 两记分板全绿；lint / format / 覆盖率闭合全绿。
复现单条：`AAH_FUZZ_SEED=<n> AAH_FUZZ_RUNS=1 AAH_FUZZ_OPS=80 npx vitest run tests/dev_tests/random_sequence.test.ts`。

---

## 2026-06-30 0.7.4 UVM 扩展蓝图（纯文档·待评审，未碰 src/测试）（claude/obsidian-headings-uvm-test-y8wdjh）

**做了什么**：应需求「把插件展现给用户的**全部**操作纳入 UVM 验证框架」，先做**分析 + 书面方案**
（用户选 D：先交付蓝图评审，暂不写代码）。逐文件核对了用户操作面（main.ts 命令/门控、SettingsTab
全部 GUI 操作、pathrules/frontmatter/cleanup 语义），与现框架 `OpKind` 激励空间对照，定位四大缺口：
①清除命令（`clearNumberingContent`/`clearForeignNumberingContent`）整个 DUT 家族零覆盖；②两层触发门控
（frontmatter×全局 autoNumber）UVM 永远无条件触发；③多模板+路径规则+多文件（真实 `strippableAffixes()`
并集从未跑到，现用假并集近似）；④Backlink 开关门控未在随机空间建模。为每个缺口配恒成立新记分板
S4 清除还原律 / S5 清外来不动律 / S6 门控冻结律 / S7 模板解析稳定律，并给出 `World→Vault` 结构升级、
新增 `OpKind` 清单、需求驱动约束（非盲目随机）、覆盖率 bin、分阶段实现路线。

**落点**：`doc/testplan.md` 新增 §4.1「扩展蓝图」（人类操作全清单×覆盖状态表 + 缺口排序 + 四不变量 +
World→Vault 设计 + 分阶段）；`tests/dev_tests/uvm/README.md` 新增「升级蓝图」摘要（指向 testplan §4.1）。
全部明确标注**规划/待实现**，不暗示已有测试。bump 0.7.3→0.7.4。

**没做什么**：未改 `framework.ts` / 任何 `src/` / 任何测试——行为零变化，260 测试与 8000×80 不受影响。
未实现 S4–S7 任何一条。

**下一步**：评审本蓝图后按 §4.1.5 落地。建议**阶段 1 先行**（清除命令新激励 + S4/S5 + 两层门控 + S6，
单 `World` 内增量，风险低），跑 explore 实测确立 S4/S5 的排除项（自食前缀/白名单豁免/空标题）；
阶段 2 再做 `World→Vault` 多文件多模板重构 + S7 + 真实并集。M7 上架冲刺主线（Obsidian 复测 M11 →
英文 README → bump 1.0.0 → 社区 PR）不受影响，UVM 扩展属并行的验证强化。

**验证方式**：纯文档改动，`npm test` / `lint` / `format:check` 应仍全绿（行为未变）；`npm run docs` 归档自检。

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
