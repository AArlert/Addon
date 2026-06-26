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
