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

---

## 2026-06-28 — 升版 0.3.15：新建 doc/testplan.md 测试计划 + 工作流程接线（M3 打磨）

**交接人：** 分支 `claude/obsidian-auto-headings-testplan-nwl2pt`

**做了什么：**

- **新建 [`doc/testplan.md`](./testplan.md)**——这个 Addon 的**测试场景清单与真值表**，按「操作（尤其
  操作序列）→ 预期结果 → 当前状态（✅/❌/⚠️/🔲）」逐条枚举，同时面向**开发期 Agent**（dev_tests）与
  **手动实测用户**（user_tests）。重点是 §1「状态转移测试」：把「已编号文件 → 改某模板字段 → 再触发」
  当一等公民来测，因为绝大多数诡异 bug 都出在这里。
- **实测复现并登记了一类 bug（§3 已知 bug 汇总）**：在已编号内容上**改格式字段后再触发会前缀叠加**——
  - B1 改标题间隔符（空格→`、`）→ `一、一 标题`（=用户报告的原始现象）
  - B5 标题间隔符 `. `→空格 → `1 1. 标题`
  - B4 序号间隔符 `.`→`-` → `1-1 1.1 子`
  - B2 加前缀「第」→ `第1 1 标题`；B3 加后缀「章」→ `1章 标题` 实为 `1章 1 标题`
  - C3 调高 topLevel 后，移出编号范围的浅标题残留旧前缀（`# 1 篇` 的 `1 ` 不被清）
  根因均在 `src/numbering.ts`：`stripPrefix` 把 `prefix/suffix/numberSeparator/titleSeparator` 当**当前值
  字面量**写进剥离正则，这些字段一改、旧前缀就匹配不上。**序号样式（numeral）此前已用"全样式并集
  token"修过（B6/B7 ✅），但这几个字面量字段没做同等放宽。**
- **工作流程接线**：根 `CLAUDE.md` §4.1 把 `testplan.md` 纳入 Addon 文档结构表、§5 开发流程新增「动手前
  先在 testplan 加场景 / 完工后回填状态」两步；`README.md`、`doc/spec.md` §2.3、`tests/user_tests/README.md`
  各加指向 testplan 的交叉引用。
- 升版 0.3.14 → **0.3.15**（manifest/package/package-lock/versions），重生 `release/`。

**没做什么（明确边界）：**

- **没有修任何 bug、没改引擎代码**。本周期只立测试计划、登记 bug、接线文档。§3 的 ❌ 全部留给后续周期。
- testplan 里标 ❌/🔲 的场景**尚未**落成 `tests/dev_tests/` 的失败回归测试——下一步要做。

**下一步（给接手 Agent 的明确起点）：**

1. 优先修 **B 类**（用户实际报告）：让 `stripPrefix` 对 `prefix/suffix/numberSeparator/titleSeparator`
   的旧值也能剥离（思路见 testplan §3 末「统一修复思路」），**难点是守住不误伤真实标题**——务必同步
   补 testplan B/C/E 类的 dev_tests + user_tests 双向验证「既剥得净、又不误伤」。
2. 每修好一条，把 testplan 对应行 ❌→✅、更新 §3 汇总表、补回归测试、bump 版本。
3. 之后再按 testplan 把 🔲（白名单 M4 / 清除 M6 / 开关 M5 / 防抖 J 类等）逐步补测试覆盖。

**验证方式：**

- `npm test`（106 passed）/ `npm run lint` / `npm run format:check` 全绿；`npm run release` 已重生
  `release/`（manifest 显示 0.3.15）。
- bug 复现：见 testplan §2 B/C 类「当前实测」列；可用 `renumberContent` 串两次（旧配置编号 → 改字段 →
  再编号）即得叠加输出。

---

## 2026-06-26 — 升版 0.3.14：修复标题间隔符预览失真（尾随空格被 trim）（M3 打磨）

**交接人**：agent（claude/obsidian-auto-headings-m3-y4vnoo 分支）

**用户反馈两点疑似 bug**：①标题间隔符默认是空格，改成别的后想改回空格、在输入框敲一个空格「似乎
识别不出来」；②间隔符填 `". "` 好像只能格式化成 `"."`。要求确认并修复，诉求是「用户在间隔符里敲
什么，插件就用什么」。

**核查结论（实测）：实际编号一直是对的，bug 只在 GUI 预览。**

- `renumberContent` 实测：`sep=" "` → `## 1 章`、`sep=". "` → `## 1. 章`，且二次编号幂等；
  `serializeTemplate`/`normalizeTemplate` 往返也**原样保留** `" "` 与 `". "`。即引擎与存储早已「敲啥用啥」。
- 真正的坑在 `previewLevel`：它对 `buildPrefix` 结果做了 `.replace(/\s+$/, "")`，把**预览**里的尾随
  空白吃掉，于是面板把 `" "` 显示成 `1标题`、`". "` 显示成 `1.标题`，让用户**误判**「空格没生效 /
  `. ` 被吃成 `.`」。

**做了什么**：

- `numbering.ts`：`previewLevel` **去掉尾随 trim**，原样返回 `buildPrefix` 前缀（`["1 ","2 ","3 "]`、
  `["1. ",…]`）。预览经 `previewText` 拼 `${s}标题` 后即 `1 标题` / `1. 标题`，尾随空格因其后紧跟
  「标题」而清晰可见，用户能得到「确实生效」的反馈。更新了该函数 JSDoc。
- 测试：`numbering.test.ts` 新增 `previewLevel` describe（空格 / `". "` / `"、"` 三例如实保留），共
  **106 passed**。
- spec.md §2.3 边界表新增一行（间隔符含尾随空白＝所见即所得 + 预览已修复说明）。
- 版本 0.3.13 → **0.3.14**（manifest/package/lock/versions/release/manifest + README 版本号），
  `npm run release` 重建产物。

**没做什么**（明确边界）：**未改编号 / 存储逻辑**（本就正确）；**未碰 M4+**；未改 `textCell` 输入控件——
HTML 文本框里只含一个空格时看起来「空」是输入框固有现象（值其实是 `" "`，placeholder 因有值而隐藏），
现在靠**预览**给出生效反馈即可，不过度改造控件。

**下一步**：继续 M3 打磨（按实测反馈），或经定优先级后推进 M4 白名单 / M5 / M6。

**验证方式**：`npm test`（106 passed）、`npm run lint`、`npm run format:check` 全绿；`npm run release`
重建产物。Obsidian 实测：模板某级标题间隔符填一个空格 → 预览显示 `1 标题`（有可见间距）、文件得
`## 1 章`；填 `". "` → 预览 `1. 标题`、文件得 `## 1. 章`。

---

## 2026-06-26 — 升版 0.3.13：新增「祖先序号渲染」开关 ancestorNumeral（M3 打磨）

**交接人**：agent（claude/obsidian-auto-headings-m3-y4vnoo 分支）

**背景**：上一周期（0.3.12）评估指出——当前「继承前级」对混合序号样式只支持「祖先各自套用自身
样式」(Model A)，故 `H2=中文/H3=阿拉伯` 得 `一.1`，无法表达中文书惯例（章 `一` / 节 `1.1`）。
用户拍板：①加每模板开关、默认保持现状；②`H4=a)` 两种语义都要（已由每级「继承前级」覆盖）；
③祖先段只取裸数字、不带祖先的前缀/后缀（本就如此）。本周期实现该开关。

**做了什么**：
- `numbering.ts`：新增 `AncestorNumeral = "self" | "arabic"`、`DEFAULT_ANCESTOR_NUMERAL = "self"`、
  `normalizeAncestorNumeral`；`Template` 加字段 `ancestorNumeral`；`DEFAULT_TEMPLATE` 补 `self`。
  `buildPrefix` 在拼祖先段时按策略选样式：**末段（当前级）始终套本级样式**，祖先段在 `arabic`
  下一律阿拉伯、`self` 下各自套自身样式（`i < lastIndex` 判定是否祖先）。占位段（skipFill）不受影响。
- `schema.ts`：`normalizeTemplate` 解析 `ancestorNumeral`（缺失/非法回退 `self`），随 `serializeTemplate` 落盘。
- `settings/SettingsTab.ts`：模板编辑面板「起始编号层级」下拉之后，新增「祖先序号渲染」下拉
  （各自样式 `1.a.①` / 统一阿拉伯 `一 / 1.1`），改动即存盘 + `renumberActiveFile` + 重渲染预览。
- **剥离无需改动**：`stripPrefix` 的祖先段 token 本就是全样式并集（`innerSegmentToken`），故
  `arabic` 写出的 `1.1` 能剥、由 `self` 切到 `arabic` 时旧的 `一.1` 也能被识别改写（已加幂等回归）。
- 测试：`numbering.test.ts` +6（self 保持 `一.1`；arabic 得 `一`/`1.1`/`1.1.1`；末段非阿拉伯保留
  `1.1.①`；arabic+H4 继承得 `1.1.a)`；H4 不继承得独立 `a)` 与策略无关；self→arabic 改写幂等），
  `schema.test.ts` +1（规范化/回退）。共 **103 passed**。
- 版本 0.3.12 → **0.3.13**（manifest/package/lock/versions/release/manifest + README 版本号与功能条目），
  `npm run release` 重建 `release/`（含 zip）。spec.md §3.5/§3.6 补该字段、组合规则与设计取舍。

**没做什么**（明确边界）：**未碰 M4+ 功能**；未提供第三种「祖先＝当前级样式」(Model B，会把
`1.1.a)` 变成 `a.a.a)`，无意义)；未让祖先段携带祖先自己的前缀/后缀（按用户③，只取裸数字）；
`numberSeparator`/`titleSeparator`/`prefix`/`suffix` 仍取**当前级**的（既有行为，未改）。

**下一步**：M3 继续打磨（按实测反馈），或经定优先级后推进 M4 白名单（spec.md §3.7）/ M5（§3.1/§3.2/§3.8）/
M6（§3.10）。若日后再加序号样式或第三种祖先策略，记得同步 `buildPrefix` 的祖先分支与
`stripPrefix` 的并集 token。

**验证方式**：`cd obsidian-auto-headings && npm test`（103 passed）、`npm run lint`、`npm run format:check`
全绿；`npm run release` 重建产物。Obsidian 实测：模板设 H2=中文、H3=阿拉伯、「祖先序号渲染」选
「统一阿拉伯」→ H2 标题 `一`、H3 子节 `1.1`、`1.1.1`；选「各自样式」→ 回到 `一.1`。

---

## 2026-06-26 — 升版 0.3.12：release 脚本额外打包 zip（M3 打磨 / 交付物增强）

**交接人**：agent（claude/obsidian-auto-headings-m3-y4vnoo 分支）

**用户诉求**（直接做）：`npm run release` 除了在 `release/` 平铺原来的三个独立文件，**还要生成一个
zip**；zip 内是一个 `obsidian-auto-headings/` 文件夹，里面放那三个文件。这样既能直接下载、解压即得
标准插件目录，也方便日后发布 GitHub Release。

**做了什么**：
- 新增 devDependency **`adm-zip`**（纯 JS、跨平台，避免依赖系统 `zip` CLI）。
- 重写 `scripts/sync-release.mjs`：平铺三文件后，再把 `main.js`/`manifest.json`/`styles.css` 以
  `obsidian-auto-headings/<file>` 路径塞进 zip，写出 `release/obsidian-auto-headings.zip`。
  zip 内文件夹名 = `manifest.json` 的 `id`。**固定每个条目时间戳**（2020-01-01），使内容不变时
  zip 字节稳定、不产生无意义的 git 改动（已验证连跑两次 md5 一致）。
- `release/README.md`：新增「方式一（zip）/ 方式二（独立文件）」两种安装说明。
- 版本 0.3.11 → **0.3.12**（manifest/package/package-lock/versions/release/manifest + README 版本号），
  `npm run release` 重建 `release/`（含新 zip）。

**没做什么**（明确边界）：未改任何编号逻辑 / 测试（仍 96 passed）；**未碰 M4+ 功能**；zip 文件名采用
**稳定名**（不含版本号）以免历史里堆积多份；zip 内**不含** `release/README.md`（按用户要求只放三文件）。
关于「继承前级」对混合序号样式的设计评估（H2=一/H3=1.1 诉求）见下方「评估」一节，本周期**仅评估、未改代码**。

**评估：当前「继承前级」能否表达「H2=一、H3=1.1、H4=a)」？（结论：不能，缺一个自由度，非 bug）**
- 实测当前引擎对「每个祖先段套用其**自身级别**的样式」（Model A，0.3.2 的有意设计）：
  `H2=cjk,H3=arabic` → `一.1`（用户想要 `1.1`）；`H2=arabic,H3=alpha,H4=circled` → `1.a.①`。
- 根因：每级单一的 `numeral` 字段同时承担两个**会冲突**的职责——「本级**独立**显示成什么」与
  「本级**作为祖先**出现在更深前缀里显示成什么」。中文书惯例（章 `一`、节 `1.1`）要求祖先转阿拉伯；
  而提纲惯例（`1.a.①` / `I.A.1`）要求祖先保留各自样式。两者**方向相反**，单一固定模型无法兼得。
- 结论：不是 bug，是**缺一个自由度**。建议加**每模板**开关「祖先序号渲染」= {各自样式（默认=现状）|
  统一阿拉伯}。默认值＝现状，向后兼容；选「统一阿拉伯」即得 `一` / `1.1` / `1.1.a)`。`stripPrefix`
  的剥离 token 本就纳入全样式并集，加该开关无需改动剥离、已天然兼容。
- 待用户确认的歧义（见对话）：①「统一阿拉伯」下同一章在标题处显示 `一`、在子节号里显示 `1`，这种
  「同号不同形」是否可接受（中文书确实如此）；②`H4=a)` 指**不继承**的独立 `a)`，还是继承的 `1.1.a)`；
  ③祖先段是否需要带祖先自己的前缀/后缀（如 `第一章`→子节里要不要 `第1章.…`，通常不要）。

**下一步**：等用户就上面三点拍板后，再实现「祖先序号渲染」开关（M3 打磨范畴）：`Template` 加字段
（如 `ancestorNumeral: "self" | "arabic"`，默认 `self`）→ `buildPrefix` 渲染祖先段时按它选样式 →
schema 解析/兜底 → GUI 加下拉 → 补单测（两模型在 cjk/alpha/circled 组合下的输出与往返剥离）。

**验证方式**：`cd obsidian-auto-headings && npm test`（96 passed）、`npm run lint`、`npm run format:check`
全绿；`npm run release` 后 `unzip -l release/obsidian-auto-headings.zip` 应见 `obsidian-auto-headings/`
下三文件；连跑两次 `npm run release`，`md5sum release/obsidian-auto-headings.zip` 两次一致。

---

## 2026-06-26 — 升版 0.3.11：修复「空行直接转标题致编号重复叠加」bug（M3 打磨）

**交接人**：agent（claude/obsidian-auto-headings-m3-y4vnoo 分支）

**用户诉求**：(1) 按 0.3.10 文档要求更新设计与产出，开发**停留在 M3 持续打磨**，不碰 M4+ 里程碑。
(2) 修复一个实测 bug：用户在**本行无文字**时用快捷键直接把当前行转成 H2/H3 等标题，插件会插入
**两个一模一样的编号**（如 `1.1.1 1.1.1`）；删掉后面那个又会再生一个新的。

**根因**：用户在空行按快捷键，Obsidian 写入 `### `（带尾随空格）。插件首轮编号得 `### 1.1 `
（标题文本为空，行尾即「标题间隔符」那个空格）。下一轮 `parseHeadings` 会 **trim 掉行尾空白**
（`parser.ts`），读到的 `text` 变成 `1.1`（无尾随空格）。而 `stripPrefix` 的前缀正则**末尾要求
标题间隔符**（空格），故 `1.1` 配不上 → 被当成正文 → 在其左侧再叠一层新前缀 → `### 1.1 1.1`。
删掉后面那个 `1.1` 后剩 `### 1.1 `，重新触发又走同一条路，循环复生。

**修复**（最小且不引入回归）：
- `parser.ts`：`Heading` 新增 `rawText` 字段——与 `text` 唯一区别是**保留行尾空白**（`m[2]` 不 trim）。
- `numbering.ts`：新增 `stripHeadingPrefix(heading, level, template)`，改用 `heading.rawText`（即
  `1.1 `，**带间隔符空格**）调用 `stripPrefix`，再 trim 结果；`numberHeadings` 的白名单分支与正常
  分支都改用它。这样空标题前缀 `1.1 ` 能被干净剥成空（幂等），而 `# 三` 这类「**本身就是序号字样、
  行尾无空格**」的真实标题因缺间隔符**不被误剥**。
- **关键取舍**：曾试过在 `stripPrefix` 末尾把标题间隔符放宽为「间隔符 或 行尾 `$`」，但会把 `# 三`
  这类纯序号字样标题误剥（撞上既有回归测试），故**回退**，改走「剥离用保留空白的 rawText」这条更
  精准、无副作用的路径。

**做了什么**：上述两处源码修复；`doc/spec.md` §2.3 边界表新增一行（空行转标题的幂等保证）；
`numbering.test.ts` 新增 3 条回归（空 H3 多轮幂等不叠加、删残留不复生、`# 一/二/三` 真实序号标题
不误剥）、`parser.test.ts` 新增 1 条（`text` 去尾空白 vs `rawText` 保留），共 **96 passed**；
版本 0.3.10 → **0.3.11**（manifest/package/package-lock/versions/release/manifest），`npm run release`
重建 `release/`（含 `main.js`）；根 `README.md` 版本号 0.3.10 → 0.3.11。

**没做什么**（明确边界）：**未碰 M4+ 任何功能**（白名单匹配、按路径选模板、开关重构、清除编号均按
原状停在「待开发」）；未改 `stripPrefix` 的剥离 token 策略与计数器状态机；未触碰「手写 `1.1 标题`
会被当前缀剥掉」这一既有且已文档化的固有歧义（与本次无关）。

**下一步**：继续 M3 打磨（按用户实测反馈），或在用户/接手者定优先级后推进 M4 白名单（`spec.md`
§3.7）/ M5 开关重构+路径系统（§3.1/§3.2/§3.8）/ M6 清除编号（§3.10）。

**验证方式**：`cd obsidian-auto-headings && npm test`（96 passed）、`npm run lint`、`npm run format:check`
全绿；`npm run release` 后 `git status` 见 `release/` 更新。Obsidian 实测：在空行按快捷键转 H3，
反复编辑/保存只得单个 `1.1`（不叠成 `1.1 1.1`）；把模板 `topLevel` 设 H1 时 `# 三` 仍呈现为 `3 三`
（序号字样标题不被吞）。

---

## 2026-06-26 — 升版 0.3.10：开关重构 + 路径 `/` 根规则 + 清除编号（仅改规格文档）

**交接人**：agent（claude/obsidian-auto-headings-logic-2rih7m 分支）

**用户诉求**（M5/M6 的设计定调，本周期**只更新文档、不动代码/测试**）：
1. **开关两层化**：「启用插件」≠「自动编号」。装了插件但得在面板开「全局自动编号」才会自动跑；
   否则只按 frontmatter `obsidian-auto-headings` 的值、或用户手动命令才工作。
2. **frontmatter `ON` 获得独立语义**：文件级强制自动编号（即便全局关）；`OFF` 文件级强制关闭。
   **手动命令绕过**全局开关与 `OFF`（用户敲命令即「我要」），且不弹 fm 值提示。
3. **路径系统**：取消单独的「全局默认模板选择器」，改为路径规则表里一条**可删的 `/` 根规则**充当
   全库兜底；删掉它即「只在特定路径编号」。无规则命中时：自动静默跳过、手动弹 Notice。
4. **删模板**：A+B 结合——被路径规则引用时弹确认对话框，列出受影响规则并可降级到「默认」/改投/连删。
5. **删模板/删规则不回滚已格式化文件**（冻结现状）；新增**「清除当前文件编号」命令** + 面板
   **[清除全库编号]** 按钮（二次确认、不做成命令防误触），剥离器用全样式并集、独立于模板。

**做了什么**（仅 `doc/spec.md` + 根 `README.md` + 版本号文件）：
- `spec.md`：§3.1 重写为「开关、命令与生效判定」（双层开关 + 命令表 + 自动/手动两条生效路径）；
  §3.2 重写单文件开关（`ON` 强制语义 + 矩阵 + `OFF` 不清除）；§3.6 补「删模板知情确认+安全降级」
  对话框与「不回滚」原则；§3.8 改为 `/` 根规则并入表格、可删、兜底提示条、无命中处理；
  §3.9 触发流程判定行更新；**新增 §3.10 清除编号**（双入口 + 全样式并集剥离器 + 与 `OFF` 分工 + 风险）；
  §2.3 边界表补 7 行；§4 架构图补 PathRuleStore/cleanup 模块与 M5–M6 接线说明；目录加 §3.10。
- 根 `README.md`：版本号 0.3.9→0.3.10；M5/M6 概览描述更新（已 prettier 对齐表格）。
- 版本号：`manifest.json` / `package.json` / `package-lock.json` / `versions.json` / `release/manifest.json`
  统一升 0.3.10。

**没做什么**（明确边界）：**未写任何源码 / 测试**——M5/M6 全部功能仍未实现，本周期纯规格定稿；
未重建 `release/main.js`（无源码改动，仅同步了 `release/manifest.json` 版本号元数据）；未触碰白名单（M4）。

**下一步**：先做 **M4 白名单系统**（`spec.md` §3.7，数据模型 `WhitelistEntry` 已在 M3 落地），
还是先做本轮定稿的 **M5 开关重构/路径系统**，由用户/接手者定优先级。实现 M5 时严格按新版 §3.1/§3.2/§3.8
的「自动 vs 手动」两条路径与 `/` 根规则模型；实现 M6 清除编号时按 §3.10 的全样式并集剥离器。
**动代码后务必 `npm run release` 重生 `release/main.js` 并入库**（本轮因纯文档未触发）。

**验证方式**：`cd obsidian-auto-headings && npm run format:check` 全绿（prettier 已对齐 README 表格）；
本轮未改源码故未跑 test/lint（沿用上一周期 92 passed）。人工：`spec.md` 目录含 §3.10，§3.1 标题为
「开关、命令与生效判定」。

---

## 2026-06-26 — 协作机制：文档结构重整 + status.jsonl 状态索引（不升版本号）

**交接人**：agent（claude/obsidian-inpage-title-compat-rc1emf 分支）

**用户诉求**（仓库级协作机制，**非对本插件功能的更新，故不升版本号**，仍 0.3.9）：
1. 在根 `CLAUDE.md` 写清「版本号里程碑内持续打磨」原则（`0.M.*`，`*` 持续递增直到该里程碑满意）。
2. log.md 越来越长——约定接手时**只读最新一块**，按需再翻历史。
3. 新建 `doc/status.jsonl` 极简状态索引（首行总览 + 每周期一句话概括，倒序），接手**先读它**；
   并把历史 log 概括进去。
4. 把 `doc/README.md`（详细规格）**更名为 `doc/spec.md`**，在 Addon 根**新建简短 `README.md`**
   （当前功能 + Milestone 概览）。以上一并写进 `CLAUDE.md`，并对 `chrome-tab-tree` 同样应用。

**做了什么**：
- **根 `CLAUDE.md`**：§4 改为「三层记忆」读序（status.jsonl → log.md 最新块 → spec.md）+ 每周期同维护
  log+status；新增 §4.1「文档结构」表（README / spec / log / status 职责）；新增 §5.1「版本号里程碑内
  持续打磨」（含「协作机制类改动不升版本」例外）；§7 速览表链接改指 README/spec/log/status。
- **本 Addon**：`doc/README.md` → `doc/spec.md`（`git mv` 保留历史）；新建根 `README.md`（简介 + 当前
  功能 + Milestone 概览）；新建 `doc/status.jsonl`（首行 0.3.9 总览 + 14 行历史概括）。log.md 顶部
  补「接手怎么读」与「历史条目中的『README §X』即 spec.md」消歧；目录结构树更新为 README/spec/status。
  release/README.md、status.jsonl 内的旧 `README §X` 指针改为 `spec.md`。
- **chrome-tab-tree**：同样把根 `README.md` → `doc/spec.md`、新建简短根 `README.md`、新建 `doc/status.jsonl`；
  log.md 指针改 spec.md。

**没做什么**：**未升版本号**（协作机制类，0.3.9 不变）；未改任何源码 / 测试 / 行为 / 产物二进制；
历史 log 块内的「README §X」prose 不逐条改写（用顶部消歧说明统一覆盖）。

**下一步**：Milestone 4 白名单系统（`spec.md` §3.7），接法见下方 0.3.7 记录的「下一步」。

**验证方式**：`cd obsidian-auto-headings && npm test`（92 passed）、`npm run lint`、`npm run format:check`
全绿（仅文档/结构改动，行为不变）。人工：`doc/` 下应有 spec.md / log.md / status.jsonl，根有简短 README.md。

---

## 2026-06-26 — 升版 0.3.9：README 与实现对齐（补全「后缀」等过时描述）

**交接人**：agent（claude/obsidian-inpage-title-compat-rc1emf 分支）

**用户诉求**：(1) 重申「做了更改就升版本号，哪怕功能没动」，本周期升到 **0.3.9**（0.3.* 全程
属 Milestone 3 的持续打磨迭代，`*` 可一直递增，直到 M3 满意无明显 bug）。(2) README 多处仍按
**加入「后缀」字段之前**的旧规格描述（如「前缀/序号/序号间隔符/标题间隔符/继承前级」缺了「后缀」），
要求对照 `log.md` 与源代码**交叉审查并更正**，让 README 与实际实现一致。

**做了什么**：
1. **版本号**：`package.json` / `manifest.json` / `versions.json` / `package-lock.json` / `release/manifest.json`
   全部 0.3.8 → **0.3.9**；`npm run release` 重新生成 `release/`。
2. **README 对照源码（`numbering.ts` 的 `LevelFormat`/`Template`/`DEFAULT_TEMPLATE`、`schema.ts` 的
   `serializeTemplate`）逐处更正**：
   - §3.6 字段数「五个」→「**六个**」结构化字段（prefix / numeral / **suffix** / numberSeparator /
     titleSeparator / inherit）；字段说明同步补 `suffix`、`levels.h1`、`topLevel`、`skipFill`。
   - §3.6「字段如何组合」示例块表头补 **后缀** 列，新增「第1.1章」示例行 + 后缀语义注释。
   - §3.6 两份 JSON 示例（学术风格 / 默认）补全每级 `suffix`、新增 `h1` 级、补模板级 `skipFill`/
     `topLevel`，字段顺序对齐 `serializeTemplate` 实际落盘输出。
   - §3.6 设置 GUI ASCII 布局图补 **后缀** 列、加 H1 置灰行、加「起始编号层级」下拉与「跳级缺失
     层级 / 占位字符」底栏，与实际面板一致。
   - §4 存储分层表：`data.json` 内容删去**白名单**（白名单随模板存于 `templates/*.json`，非 data.json）。
   - §4 架构图：`TemplateStore.ts` 归位到 `templates/`（与 `schema.ts` 同级）、`PathRuleStore` 标注
     「M5 规划，尚未实现」。
   - §5 Roadmap M3：schema 字段列表补 `suffix` 与模板级 `topLevel`/`skipFill`；编辑面板「五级×五列」
     → 「六级 H1–H6 × 六列〔含后缀〕+ 起始层级下拉 + 跳级占位」。
   - `log.md` 目录结构注释里过时的「H1 降级」→「起始层级 topLevel」（`demoteStrayH1s` 已于 0.3.7 移除）。

**没做什么**：未改任何**源代码 / 测试 / 行为**（纯文档 + 版本号 + 重生产物）；历史日志条目里的
「H1 降级」等描述属当时记录，**刻意保留**不改写。未触碰白名单（M4）、按路径选模板（M5）。

**下一步**：Milestone 4 白名单系统（README §3.7），接法见下方 0.3.7 记录的「下一步」。

**验证方式**：`cd obsidian-auto-headings && npm test`（92 passed）、`npm run lint`、
`npm run format:check` 全绿；`npm run release` 后 `git status` 见 `release/` 与各版本文件更新。
人工对照：README §3.6/§4 的字段、JSON、GUI 图、存储表均含「后缀」且与 `numbering.ts`/`schema.ts` 一致。

---

## 2026-06-26 — 厘清与 Obsidian「页内标题」的兼容关系（仅改文档）

**交接人**：agent（claude/obsidian-inpage-title-compat-rc1emf 分支）

**用户问题**：开启 Obsidian「外观 → 页内标题（将文件名作为可编辑的标题在文件内容中显示）」后，
这个官方功能与本插件有什么冲突？能否兼容？不能则适配。

**结论（核查后）：无破坏性冲突，且已天然兼容，无需改动行为。**

- **核查**：页内标题是编辑器从 `file.basename` 生成的**渲染层 widget**，不进入 CodeMirror 文本缓冲区。
  本插件全程只读写 Markdown 源文本——读 `editor.getValue()`（`main.ts:211`）、按行号 `editor.transaction`
  写回（`main.ts:240`）、`parseHeadings` 只扫源文本里的 `#` 行。两者分属渲染层 / 源文本层，互不污染：
  插件不会给页内标题编号，也不会因它行错位；阅读模式下插件不运行。
- **唯一关系是写作习惯搭配**：默认 `topLevel=H2` 是为「正文手写 `# 文档标题`」设计；开了页内标题后
  标题改由文件名承担，正文 `#` 常直接是章节，想给正文 H1 编号把模板 `topLevel` 设为 H1 即可（0.3.7 已支持）。
- **刻意不做自动适配**：按外观开关自动改 `topLevel` 违反「插件绝不替用户改 `#` 层级、不替用户做主」
  的核心原则（README §3.4），故只做**文档化指引**。

**做了什么**：README §2.3 边界表新增「页内标题」一行；§3.4 末尾新增「与 Obsidian『页内标题』的关系」
小节（含 `topLevel` 搭配表与「不自动改写」的说明）。

**没做什么**：**未改任何源码 / 测试 / 产物**——无代码改动，故未重新生成 `release/`、未改版本号
（仍 0.3.8，强制规则 1 针对代码改动）。未触碰白名单（M4）、按路径选模板（M5）。

**下一步**：Milestone 4 白名单系统（README §3.7），接法见下方 0.3.7 记录的「下一步」。

**验证方式**：本次为文档改动，`cd obsidian-auto-headings && npm test`（仍 92 passed）、`npm run lint`、
`npm run format:check` 维持全绿（未触碰源码，行为不变）。Obsidian 实测：开启页内标题后，文件名标题
不被编号、正文行不错位；把模板 `topLevel` 设为 H1 时正文 H1 章节正常编号为 `1`/`2`/…。

---

## 2026-06-26 — 修复两个实测 bug：改样式后前缀叠加 + 改模板后不更新（0.3.8）

**交接人**：agent（claude/obsidian-headings-format-bugs-4i4slj 分支）

**用户在 0.3.7 实测反馈两个 bug**：
1. 已格式化后，在「默认」模板里调整格式，会在文件里**追加新前缀而非改写旧的**，出现
   「1.2.1 1.二.1」这种叠加。
2. 有时调整格式后**文件压根没更新、什么改动都没有**。

**根因 & 修复**：

- **Bug 1（前缀叠加）**：`stripPrefix` 的剥离 token 只取「模板当前在用的样式」（+ arabic）。
  当把某级（如 H3）从中文改回阿拉伯、且**模板里再无任何级使用中文**时，cjk 字符类从 token 里
  消失，旧的 `1.二.1` 配不上、剥不掉，于是被当成正文、左侧再叠一层新 `1.2.1`。这正是 0.3.2 日志
  里「有意的边界」收敛取舍，现成了用户实打实的 bug。
  **修复**（`numbering.ts`）：把剥离拆成**父级段**与**末段**两类 token——
  - 父级（内层）段 `innerSegmentToken`：纳入**全部**序号样式。父级段恒被序号间隔符夹住，放宽到
    全样式不会误伤正文，却能清掉「样式被改走后残留」的父级旧段（如 `1.二.1` 里的 `二`）。
  - 末段 `lastSegmentToken`：arabic/cjk/带圈**始终**纳入（误伤面小，与长期存在的「2024 总结会被
    arabic 剥」一致），字母样式（lower/upper-alpha）**仅在模板实际使用时**纳入——否则会把
    「API 设计」「TODO 列表」这类英文词开头标题误剥。
  - 删除旧的 `templateNumeralStyles` / `numeralUnionToken`，新增 `ALWAYS_STRIPPABLE_STYLES` /
    `unionToken` / `innerSegmentToken` / `lastSegmentToken`。循环剥离与幂等性不变。
  - **取舍**：字母样式作为**末段**被改走（如 H3=字母→改回阿拉伯）后的残留仍剥不掉——这与
    「英文词开头标题不被误剥」直接冲突，无法两全；选择保护英文标题（更常见）。父级位置的字母
    残留则已能剥。

- **Bug 2（调整后不更新）**：在设置面板改模板只调 `templateStore.save()` 写盘，**从不触发当前
  打开文件的重新编号**，须等用户在编辑器里再敲一下才生效，故看起来「没更新」。
  **修复**：`main.ts` 新增 `renumberActiveFile()`（取活动 MarkdownView、跑同一套 `applyRenumber`，
  受全局开关/frontmatter 约束、无活动编辑器或无变化时静默跳过）；`SettingsTab` 在每处模板改动
  （网格各字段 `saveAndPreview`、起始编号层级、跳级策略、占位字符）保存后调用它，使格式调整即时
  反映到当前笔记。

**做了什么**：上述两处源码修复；`numbering.test.ts` 新增 4 条回归（中文改回阿拉伯不叠加、直接
清理 `1.2.1 1.二.1` 脏前缀、纯阿拉伯不误伤 `API 设计`/`TODO 列表`、内层放宽不误伤 `a.b.c 记法`），
共 **92 passed**；版本 0.3.7 → 0.3.8，重建 `release/`。

**没做什么**：未碰白名单（M4）、按路径选模板（M5）；字母样式作为**末段**被改走后的残留未处理
（见上「取舍」，刻意）；README 未改（剥离实现细节非用户可见规格，行为仍符合「手动前缀会被覆盖」）。

**下一步**：Milestone 4 白名单系统（README §3.7），接法见下方 0.3.7 记录的「下一步」。

**验证方式**：`cd obsidian-auto-headings && npm test`（92 passed）、`npm run lint`、
`npm run format:check` 全绿；`npm run release` 后 `git status` 见 `release/` 更新。Obsidian 实测：
默认模板某级改成中文再改回阿拉伯，旧 `1.二.1` 被改写为 `1.2.1`（不叠加）；在设置面板改格式时，
当前打开的笔记即时重新编号。

---

## 2026-06-25 — 起始编号层级 topLevel 取代 H1 降级；占位限数字；列序调整（0.3.7）

**交接人**：agent（claude/heading-numbering-fourth-level-76p04p 分支）

**用户诉求**：旧的「首个 H1 作标题、其余 H1 连同子树降级」太替用户做主、自由度不足。改为：
插件**永不改写 `#` 层级**；多个 H1 的处理由每模板的**起始编号层级 `topLevel`**（下拉，默认 H2）决定。
另：占位字符只允许「能被干净剥离」的字符（即数字）；模板列序调成 前缀 序号 序号间隔符 后缀 标题间隔符。

**做了什么**：
1. **topLevel（核心）**：`Template` 新增 `topLevel`（1–6，默认 2）与 `levels.h1`；`HeadingCounter`
   扩为 c1–c6（levels 1–6）。`numberHeadings` 改为：每个非白名单标题都 `bump`（即便低于 topLevel，
   作为**重置边界**），仅 `>= topLevel` 的标题输出前缀并剥离旧前缀（更浅的不剥离，避免误伤
   「2024 总结」）。`buildPrefix` 序号段从 `topLevel` 起截取。**删除 `demoteStrayH1s` 与
   `RenumberMode`**（live/format 合并），`renumberContent`/main.ts 去掉 `mode`，「立即重新编号」
   退化为普通重排。新增 `normalizeTopLevel`/`DEFAULT_TOP_LEVEL`。
   - 多 H1 语义：默认 H2 下所有 H1 原样保留、各自重置其下 H2；topLevel=H1 则 H1 也编号。
2. **schema**：`LEVEL_KEYS` 加 `h1`；`normalizeTemplate` 解析 `levels.h1` 与 `topLevel`（旧模板缺省
   回退 H2）。
3. **GUI**：模板面板加「起始编号层级」**下拉**（H1–H6）；网格扩为 H1–H6 六行、低于 topLevel 的行
   置灰（`.ah-grid-row-inactive`）、预览显示「（不编号）」；列序按用户要求调为
   前缀/序号/序号间隔符/后缀/标题间隔符/继承前级（`styles.css` 列模板同步）。
4. **占位限数字**：`sanitizePlaceholder` 改为只保留数字（空回退 0），`normalizeSkipFill` 与 schema
   都经它收口；GUI 占位输入即时滤除非数字。
5. **测试**：删 demote 用例、改 HeadingCounter 为 c1 基、补 topLevel/多 H1/重置边界/不误伤标题
   等用例（共 89 passed）。**文档**：README §2.3/3.3/3.4/3.5/3.6/3.9/Roadmap 全面改写
   （H1 降级 → topLevel）；`user_tests/03-多个H1.md` 重写。版本 0.3.6 → 0.3.7，重建 `release/`。

**没做什么**：未实现白名单匹配（M4，"首 H1 作标题+其余编号"需 topLevel=H1 + 白名单豁免标题行，
M4 落地后即可）；未做按路径选模板（M5）；未做每文件 frontmatter 覆写 topLevel（未来可选增项）。
版本仍停在 0.3.*（0.4.* 预留给 M4）。

**下一步**：Milestone 4 白名单系统（README §3.7）。注意把白名单接入 `numberHeadings` 的
`isWhitelisted` 透明分支即可与 topLevel 协同（白名单透明、topLevel 决定范围）。

**验证方式**：`npm test`（89 passed）、`npm run lint`、`npm run format:check` 全绿；
`npm run release` 后 `git status` 见 `release/` 更新。手动：模板面板切「起始编号层级」H1/H2/H3，
对多 H1 文档实测；多个 `#` 不再被改写为 `##`。

---

## 2026-06-25 — 占位字符限数字 + 新增「后缀」模板字段（0.3.6）

**交接人**：agent（claude/heading-numbering-fourth-level-76p04p 分支）

**用户诉求**：(1) 占位字符不应允许会导致「无法干净剥离」的字符；(2) 模板每级加「后缀」字段，
使字段顺序为 **前缀 + 序号 + 后缀**，以支持「第1章」式编号。

**做了什么**：
1. **占位字符限数字**：新增 `sanitizePlaceholder`（滤除非数字、空回退 `0`），`normalizeSkipFill`
   与 schema 的 `skipFill` 解析都经它收口；GUI「占位字符」输入即时滤除非数字并回写。
   原因：`stripPrefix` 的剥离并集**恒含** arabic 的 `\d+`，故纯数字占位无论之后改占位/切 drop
   都能被干净剥离，不会重复叠加；`-`/`*` 等非数字在策略变更后会失配残留，故禁止。
2. **后缀字段**：`LevelFormat` 增 `suffix`（默认空）。`buildPrefix` 输出顺序改为
   `前缀 + 完整序号 + 后缀 + 标题间隔符`（如「第」+「1」+「章」+「 」→「第1章 」）；`stripPrefix`
   的正则同步纳入后缀，保证带后缀的前缀也能幂等剥离。后缀作用于**完整序号**（含继承父级），
   即「第1.1章」而非每段都带后缀。schema `normalizeLevel` 解析/兜底 `suffix`，旧模板缺省为空。
3. **GUI**：模板编辑网格新增「后缀」列（位于「序号」与「序号间隔符」之间）；
   `styles.css` 网格列数 7→8。
4. **测试**：numbering 新增后缀用例、占位限数字（数字幂等 + 非数字收口）用例；schema 新增
   suffix 与占位数字收口用例；并修订上一周期「自定义 `-` 占位」用例为数字。共 90 passed。
5. 文档：README §3.6 字段表加「后缀」行、拼接公式加后缀、`skipFill` 说明改为「仅限数字」；
   `user_tests/02` 占位说明改数字、新增 `06-前缀后缀第几章.md`。版本 0.3.5 → 0.3.6，重建 `release/`。

**没做什么**：未改计数器状态机、白名单（M4）、错位 H1；后缀仅作用于本级完整序号，不向子级传播
（与前缀一致）；按路径选模板仍属后续里程碑。

**下一步**：按 README Roadmap 推进（白名单 M4、按路径选模板 M5）。

**验证方式**：`npm test`（90 passed）、`npm run lint`、`npm run format:check` 全绿；
`npm run release` 后 `git status` 见 `release/` 更新。手动：模板某级填前缀「第」后缀「章」→
H2 得「第1章 标题」；占位字符输入非数字会被自动清掉。

---

## 2026-06-25 — 跳级占位策略改为「每个模板可配置」（0.3.5）

**交接人**：agent（claude/heading-numbering-fourth-level-76p04p 分支）

**用户诉求**：跳级缺失层级「补还是不补、补 0/1/任意字符」众口难调，应做成**选项**；且
**不要全局设置，由每个模板自行决定**（「默认」模板将默认套用于所有 md，等价于全局默认，其他模板再各自覆盖）。

**做了什么**：
1. **数据模型**（`numbering.ts`）：新增 `SkipFill = {mode:"drop"} | {mode:"fill",placeholder}`、
   `DEFAULT_SKIP_FILL`（补 `0`）、`normalizeSkipFill`（fill 空占位→`0` 兜底）。`Template` 增加
   **模板级**字段 `skipFill`；`DEFAULT_TEMPLATE` 默认补 `0`（与 0.3.4 行为一致）。
2. **引擎接线**：`buildPrefix` / `stripPrefix` 改为从 `template.skipFill` 读取策略——
   drop 丢弃缺失段、fill 以 placeholder 字面量补段；`numeralUnionToken` 把 fill 占位纳入剥离
   并集，保证**自定义占位（如 `-`）写出的前缀也能幂等剥离**，不会重复叠加。
3. **持久化**（`templates/schema.ts`）：`normalizeTemplate` 解析/校验 `skipFill`，缺失（旧模板）
   或非法回退默认补 `0`，fill 空占位回退 `0`；随 `serializeTemplate` 一并落盘。
4. **GUI**：模板编辑面板底部新增「跳级缺失层级」下拉（补位 / 不补位）+「占位字符」文本框
   （仅补位时显示），每模板独立、即时存盘。**未做成全局设置**（按用户要求）。
5. **测试**：numbering 新增 skipFill 五用例（fill 0/1/自定义 `-` 幂等/drop/空占位兜底）；
   schema 新增 4 用例（缺失/drop/自定义/非法回退）。共 86 passed。
6. 文档：README 边界表与 §3.6 增补 `skipFill` 字段说明；`user_tests/02` 说明该选项。
   版本 0.3.4 → 0.3.5，重新生成 `release/`。

**没做什么**：未把该策略做成全局设置（刻意，按用户要求归属模板）；未触碰计数器状态机、白名单
（M4）、错位 H1 等；按路径选模板仍属后续里程碑。

**下一步**：按 README Roadmap 推进（白名单 M4、按路径选模板 M5 等）。路径模板上线后，
「默认」模板的 `skipFill` 即为全局默认、其余模板各自覆盖的语义会自然生效。

**验证方式**：`npm test`（86 passed）、`npm run lint`、`npm run format:check` 全绿；
`npm run release` 后 `git status` 见 `release/` 更新。手动：设置面板展开某模板 → 底部切换
「跳级缺失层级」与「占位字符」，对 H2/H3 后直接写 H5 的文档实测 `1.1.0.1` / `1.1.1.1` / `1.1.1`。

---

## 2026-06-25 — 修复跳级标题少一段序号 + 面板版本号 + 测试目录重组（0.3.4）

**交接人**：agent（claude/heading-numbering-fourth-level-76p04p 分支）

**用户反馈**：从「第四级标题」（即 H5）起序号少一位——H3 后直接跟 H5 时，H5 被当作 H4
（如 `5.a.a` 三段，应为四段）。而当中间的 H4 真实存在时，H5 正常呈现四段。

**做了什么**：
1. **跳级序号修复**（`buildPrefix` @ `src/numbering.ts`）：原逻辑对跳级时计数器为 0 的中间
   祖先**整段丢弃**，导致 H_n 段数少于其深度。改为**如实呈现该 0**——故 H3→H5 得 `1.1.0.1`
   （四段，`0` 显式标示缺失的 H4），既不被当作 H4 的 `1.1.1`，也用 `0` 区别于「真实 H4=1」时
   的 `1.1.1.1`。（注：本周期内曾先用「1 占位」`1.1.1.1`，经用户确认改为 `0` 占位以消歧。）
   **关键不变量**：占位只影响显示，该级计数器仍保持 0，直到真正出现该级标题才从 1 累加——
   故跳级 H5 在前、随后首个真实 H4 仍为 `1.1.1`（不被借号）。
2. **设置面板版本号**：`SettingsTab.display()` 在面板右上角渲染 `v{manifest.version}`
   （新增 `.ah-version` 样式：右对齐、`--text-faint`、`--font-ui-smaller`，低调但清晰）。
3. **测试目录重组**：`tests/*.test.ts` 全部移入 **`tests/dev_tests/`**（agent 维护的自动化单测，
   `vitest include` 为 `tests/**/*.test.ts` 仍能发现；导入路径 `../src`→`../../src`）。新增
   **`tests/user_tests/`**：5 个 `.md` 场景文件供用户复制进真实 Vault 实测边界（基础嵌套 / 跳级 /
   多 H1 / 白名单 / 代码块内井号），每个文件先文字说明场景与预期、再用代码块给可复制内容
   （阅读模式一键复制）；附 `README.md` 说明用法与「后续按场景/模板扩展」的约定。
   `tests/user_tests/` 已加入 `.prettierignore`（刻意排版的 fixture，免被 prettier 改写）。
4. 同步修订 README「边界情况」表跳级一行；更新 `numbering.test.ts` 跳级用例为 `0` 占位预期。
5. 版本 0.3.3 → 0.3.4（manifest/package/versions），`npm run release` 重新生成 `release/`。

**没做什么**：未改动计数器状态机（`HeadingCounter` 累加/归零语义不变，跳级中间级别仍不实例化）；
未触碰白名单（M4，`user_tests/04` 已标注「功能开发中」）、错位 H1 降级等其他逻辑。

**下一步**：继续按 README Roadmap 推进（白名单 M4 等）。功能（如按路径区分模板）上线后，按
`tests/user_tests/README.md` 的约定补充对应场景的 `.md` 实测文件。

**验证方式**：项目根 `npm test`（78 passed）、`npm run lint`、`npm run format:check` 全绿；
`npm run release` 后 `git status` 可见 `release/` 已更新。手动复现跳级：H2/H3 后直接写 H5，
默认模板下应得 `1.1.0.1`（四段）；面板版本号见设置页右上角。

---

## 2026-06-25 — 修复两个编号 bug：父级样式继承 + 改模板后前缀重复叠加（0.3.2）

**交接人**：agent（claude/obsidian-headings-numbering-o8n6uf 分支）

用户实测反馈两个问题，本周期一并修复：

- **Bug 1（父级被强制成阿拉伯数字）**：原设计「跨级拼接时父级一律以阿拉伯数字呈现，仅本级套
  numeral 样式」（见旧 README §3.5/§3.6）。当把 H3 设为字母、H4 设为带圈时，H4 前缀显示成
  `3.1.①` 而非 `3.a.①`——父级的字母/带圈样式无法向下可见。**改为**：`buildPrefix` 让**每一级父级
  各自套用其所在级别的 numeral 样式**（内部计数器仍是纯阿拉伯整数，样式只在写入时套用）。这是
  对既有规格的有意修订，已同步改写 README §3.5/§3.6 相关表述。
- **Bug 2（改默认模板后前缀重复）**：先用旧模板（如 H4=带圈）格式化好，再把该级样式改成别的
  （如 arabic）后重新编号，会出现 `#### 3.1.1 3.1.① 子节` 这种**新前缀叠加在旧前缀左侧**的脏
  数据。**根因**：`stripPrefix` 的剥离 token 死扣「本级当前 numeral 样式」，样式一改，旧前缀里的
  `①` 配不上新 token（`\d+`），剥不掉，于是被当成标题正文、左侧再叠一层新前缀。**修复**：剥离时
  改用「模板**当前在用的全部样式**的并集 token」（始终含 arabic，便于迁移旧前缀与默认模板），每一段
  序号都用并集去匹配；并**循环剥离**直至稳定，可清理历史上已叠加的多层脏前缀。
- **做了什么**：
  - `numbering.ts`：`buildPrefix` 父级改套各自级别样式；新增 `templateNumeralStyles` /
    `numeralUnionToken`；`stripPrefix` 改用并集 token + 循环剥离；cjk 字符类补 `兆`。
  - `tests/numbering.test.ts`：更新原「父级 arabic」断言为新行为；新增两组回归——
    「父级套各自样式（含跨级路径往返还原、整文幂等）」与「改样式后不叠加 + 多层脏前缀循环清理 +
    纯阿拉伯模板不误伤英文词开头标题」。测试 70 → 76 全绿。
  - README §3.5/§3.6 改写「父级一律 arabic」为「父级各自套用其级别样式」。
  - 版本 0.3.1 → **0.3.2**（package/manifest/versions 同步），重跑 `npm run release` 刷新 `release/`。
- **没做什么**：未碰白名单（M4）/ 路径规则（M5）。并集启发式有一处**有意的边界**：若某样式仅被
  「正被改走的那一级」使用、改后模板里再无任何级用它，则该旧样式不在并集中，旧前缀剥不掉——
  这是为「纯阿拉伯模板不误伤 `API 设计` 这类英文词开头标题」而做的收敛取舍（并集只纳入模板**实际
  启用**的样式）。用户的实际场景（带圈仍用于 H6）不受影响。带圈 >50 的回退形式 `(n)` 仍不剥离。
- **下一步**：继续 Milestone 4（白名单系统，按 README §3.7 规格）。若日后扩展 numeral 样式，
  记得同步 `numeralTokenPattern`（剥离字符类）与 `buildPrefix`（父级套各自样式）的约定。
- **验证方式**：`cd obsidian-auto-headings && npm test && npm run lint && npm run format:check` 全绿
  （76 例）；Obsidian 实测：H3 字母/H4 带圈时前缀呈 `1.a.①`；把某级样式改掉后重新编号不再出现
  `1.1.1 1.1.①` 这类叠加，原有脏文件再格式化一次即被清理。

---

## 2026-06-25 — 修复 bug：非 arabic 序号样式下 H3–H6 标题被反复重写（0.3.1）

**交接人**：agent（claude/claude-md-docs-1upx6r 分支）

- **现象**：把模板某级序号样式改为非阿拉伯（cjk/带圈/字母）后，H3–H6 标题每个防抖周期被反复
  改写，前缀不断累加成「一堆重复序号 + 连接符」，标题文本被污染。H2 不受影响。
- **根因**：`stripPrefix`（`numbering.ts`）构造的剥离正则用**本级 numeral 的 token** 去匹配
  **所有**序号段；但 `buildPrefix` 的继承前缀里**父级序号恒为阿拉伯数字**、仅本级套用 numeral
  样式（如 cjk 的 H3 前缀是 `1.一`）。于是父级的 `1` 配不上 cjk 的字符类，整条前缀漏配 → 剥不掉
  → 下一周期再次 `buildPrefix` 叠加，雪崩。H2 无父级段故幸免。
- **做了什么**：
  - 修复 `stripPrefix` 的继承分支正则为 `(?:\d+{sep})*{token}`——零个或多个「阿拉伯父级 + 分隔符」
    后接本级 numeral token，与 `buildPrefix` 的结构严格对应（含跳级时父级段数可变）。
  - 新增回归测试（`tests/numbering.test.ts`）：四种非 arabic 样式在 H3/H4 的
    `buildPrefix→stripPrefix` 往返还原；cjk 模板 `renumberContent` 连续两次结果一致（不累加）。
    测试 65 → 70 全绿。
  - 版本 0.3.0 → **0.3.1**（`package.json`/`manifest.json`/`versions.json` 同步），重跑
    `npm run release` 刷新 `release/`。`minAppVersion` 保持 `1.4.0`（用户实测于 Obsidian 1.12.4，
    远高于下限；此 bug 与版本无关）。
- **没做什么**：未改其它逻辑；带圈数字 >50 的回退形式 `(n)` 仍无法被剥离（独立的小众边界，本次不涉）。
  白名单匹配仍属 M4，未动。
- **下一步**：继续 Milestone 4（按 README §3.7 规格）。若实现自定义 numeral 样式扩展，注意同步
  `numeralTokenPattern` 与 `buildPrefix` 的「父级 arabic、本级套样式」约定。
- **验证方式**：`cd obsidian-auto-headings && npm test && npm run lint && npm run format:check` 全绿；
  Obsidian 实测：把模板 H3 改 cjk，编辑触发后标题稳定为 `1.一 …` 且多次保存不再累加。

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
