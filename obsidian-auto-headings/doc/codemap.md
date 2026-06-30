<!-- 自动生成 by scripts/codemap.mjs — 请勿手改。改源码后 `npm run docs` 重新生成；pre-commit 守卫会拦下过期的 codemap。 -->
# 代码符号地图（codemap）

> 给「grep 优先、禁整读大文件」纪律用：先在本表搜函数/方法名 → 拿 `文件:行号` 与一句话意图 →
> 再去 grep / 读那一处。覆盖：**全局索引**（全部文件）；**大纲**仅列超过 300 行的大文件。

## 索引（154 个符号 → 位置，按名排序）

| 符号 | 位置 |
|------|------|
| `affixAlternation` | `src/numbering.ts:655` |
| `analyzeWhitelist` | `src/numbering.ts:868` |
| `AncestorNumeral` | `src/numbering.ts:44` |
| `assertCountedLevel` | `src/numbering.ts:324` |
| `AutoHeadingsPlugin` | `src/main.ts:44` |
| `AutoHeadingsPlugin.applyRenumber` | `src/main.ts:500` |
| `AutoHeadingsPlugin.clearAllVaultNumbering` | `src/main.ts:375` |
| `AutoHeadingsPlugin.currentFileHeadings` | `src/main.ts:210` |
| `AutoHeadingsPlugin.currentFilePath` | `src/main.ts:219` |
| `AutoHeadingsPlugin.getTemplateForFile` | `src/main.ts:155` |
| `AutoHeadingsPlugin.loadSettings` | `src/main.ts:393` |
| `AutoHeadingsPlugin.messages` | `src/main.ts:59` |
| `AutoHeadingsPlugin.onload` | `src/main.ts:63` |
| `AutoHeadingsPlugin.onunload` | `src/main.ts:129` |
| `AutoHeadingsPlugin.renameTemplate` | `src/main.ts:229` |
| `AutoHeadingsPlugin.renumberActiveFile` | `src/main.ts:254` |
| `AutoHeadingsPlugin.runClearForeignNumbering` | `src/main.ts:330` |
| `AutoHeadingsPlugin.runClearNumbering` | `src/main.ts:282` |
| `AutoHeadingsPlugin.runImmediateRenumber` | `src/main.ts:466` |
| `AutoHeadingsPlugin.saveSettings` | `src/main.ts:422` |
| `AutoHeadingsPlugin.scheduleRenumber` | `src/main.ts:430` |
| `AutoHeadingsPlugin.setAutoNumber` | `src/main.ts:140` |
| `AutoHeadingsPlugin.shouldAutoTrigger` | `src/main.ts:175` |
| `AutoHeadingsPlugin.strippableAffixes` | `src/main.ts:194` |
| `AutoHeadingsPlugin.syncBacklinks` | `src/main.ts:545` |
| `AutoHeadingsSettings` | `src/settings.ts:17` |
| `AutoHeadingsSettingTab` | `src/settings/SettingsTab.ts:80` |
| `AutoHeadingsSettingTab.constructor` | `src/settings/SettingsTab.ts:89` |
| `AutoHeadingsSettingTab.deleteTemplate` | `src/settings/SettingsTab.ts:469` |
| `AutoHeadingsSettingTab.display` | `src/settings/SettingsTab.ts:99` |
| `AutoHeadingsSettingTab.previewText` | `src/settings/SettingsTab.ts:902` |
| `AutoHeadingsSettingTab.renderDangerZone` | `src/settings/SettingsTab.ts:830` |
| `AutoHeadingsSettingTab.renderEditPanel` | `src/settings/SettingsTab.ts:478` |
| `AutoHeadingsSettingTab.renderPathRuleRow` | `src/settings/SettingsTab.ts:254` |
| `AutoHeadingsSettingTab.renderPathRules` | `src/settings/SettingsTab.ts:205` |
| `AutoHeadingsSettingTab.renderTemplateRow` | `src/settings/SettingsTab.ts:413` |
| `AutoHeadingsSettingTab.renderWhitelistEditor` | `src/settings/SettingsTab.ts:712` |
| `AutoHeadingsSettingTab.requestDeleteTemplate` | `src/settings/SettingsTab.ts:459` |
| `AutoHeadingsSettingTab.saveAndPreview` | `src/settings/SettingsTab.ts:886` |
| `AutoHeadingsSettingTab.t` | `src/settings/SettingsTab.ts:95` |
| `AutoHeadingsSettingTab.textCell` | `src/settings/SettingsTab.ts:870` |
| `AutoHeadingsSettingTab.updatePathDatalist` | `src/settings/SettingsTab.ts:377` |
| `buildPrefix` | `src/numbering.ts:527` |
| `cjkSection` | `src/numbering.ts:358` |
| `clampDebounceDelay` | `src/settings.ts:62` |
| `CleanupOptions` | `src/cleanup.ts:13` |
| `clearForeignNumberingContent` | `src/cleanup.ts:66` |
| `clearNumberingContent` | `src/cleanup.ts:34` |
| `ClearVaultModal` | `src/settings/SettingsTab.ts:999` |
| `ClearVaultModal.constructor` | `src/settings/SettingsTab.ts:1002` |
| `ClearVaultModal.onClose` | `src/settings/SettingsTab.ts:1026` |
| `ClearVaultModal.onOpen` | `src/settings/SettingsTab.ts:1007` |
| `computeHeadingRenames` | `src/backlinks.ts:54` |
| `computeWhitelistExemptions` | `src/numbering.ts:793` |
| `createDefaultTemplate` | `src/templates/schema.ts:166` |
| `DEFAULT_WHITELIST` | `src/numbering.ts:159` |
| `defaultLevel` | `src/templates/schema.ts:52` |
| `defaultPathRules` | `src/settings.ts:48` |
| `DeleteTemplateModal` | `src/settings/SettingsTab.ts:920` |
| `DeleteTemplateModal.applyAndClose` | `src/settings/SettingsTab.ts:972` |
| `DeleteTemplateModal.constructor` | `src/settings/SettingsTab.ts:927` |
| `DeleteTemplateModal.onClose` | `src/settings/SettingsTab.ts:988` |
| `DeleteTemplateModal.onOpen` | `src/settings/SettingsTab.ts:934` |
| `detectObsidianLang` | `src/i18n.ts:28` |
| `escapeRegExp` | `src/numbering.ts:608` |
| `FileSwitch` | `src/frontmatter.ts:16` |
| `getLevelFormat` | `src/numbering.ts:331` |
| `getMessages` | `src/i18n.ts:499` |
| `hasRootRule` | `src/pathrules.ts:112` |
| `Heading` | `src/parser.ts:14` |
| `HeadingCounter` | `src/numbering.ts:286` |
| `HeadingCounter.bump` | `src/numbering.ts:294` |
| `HeadingCounter.current` | `src/numbering.ts:304` |
| `HeadingCounter.reset` | `src/numbering.ts:319` |
| `HeadingCounter.sequence` | `src/numbering.ts:313` |
| `HeadingRename` | `src/backlinks.ts:19` |
| `isDisabledByFrontmatter` | `src/frontmatter.ts:82` |
| `isFolderPattern` | `src/pathrules.ts:48` |
| `isForcedOnByFrontmatter` | `src/frontmatter.ts:91` |
| `isObject` | `src/templates/schema.ts:63` |
| `Lang` | `src/i18n.ts:15` |
| `LangSetting` | `src/i18n.ts:18` |
| `LevelFormat` | `src/numbering.ts:120` |
| `LevelKey` | `src/templates/schema.ts:35` |
| `linkAnchor` | `src/backlinks.ts:38` |
| `linkBasename` | `src/main.ts:604` |
| `LinkTarget` | `src/main.ts:598` |
| `matchLabel` | `src/settings/SettingsTab.ts:54` |
| `Messages` | `src/i18n.ts:46` |
| `normalizeAncestorNumeral` | `src/numbering.ts:50` |
| `normalizeBottomLevel` | `src/numbering.ts:74` |
| `normalizeFilePath` | `src/pathrules.ts:42` |
| `normalizeForWhitelist` | `src/numbering.ts:771` |
| `normalizeLevel` | `src/templates/schema.ts:76` |
| `normalizeNumeral` | `src/templates/schema.ts:71` |
| `normalizePattern` | `src/pathrules.ts:32` |
| `normalizeSkipFill` | `src/numbering.ts:109` |
| `normalizeSkipFill` | `src/templates/schema.ts:116` |
| `normalizeString` | `src/templates/schema.ts:67` |
| `normalizeTemplate` | `src/templates/schema.ts:138` |
| `normalizeTopLevel` | `src/numbering.ts:58` |
| `normalizeWhitelist` | `src/templates/schema.ts:93` |
| `NumberedHeading` | `src/numbering.ts:908` |
| `numberHeadings` | `src/numbering.ts:953` |
| `NumberOptions` | `src/numbering.ts:922` |
| `numeralLabel` | `src/settings/SettingsTab.ts:34` |
| `NumeralStyle` | `src/numbering.ts:18` |
| `numeralTokenPattern` | `src/numbering.ts:661` |
| `parseHeadings` | `src/parser.ts:47` |
| `pathMatchesTarget` | `src/backlinks.ts:82` |
| `PathRule` | `src/pathrules.ts:21` |
| `previewLevel` | `src/numbering.ts:585` |
| `readFileSwitch` | `src/frontmatter.ts:27` |
| `renderNumeral` | `src/numbering.ts:497` |
| `renumberContent` | `src/numbering.ts:1101` |
| `resolveLang` | `src/i18n.ts:38` |
| `resolvePathRule` | `src/pathrules.ts:94` |
| `rewriteBacklinksInContent` | `src/backlinks.ts:102` |
| `ruleMatches` | `src/pathrules.ts:58` |
| `ruleSpecificity` | `src/pathrules.ts:76` |
| `sanitizePlaceholder` | `src/numbering.ts:100` |
| `serializeTemplate` | `src/templates/schema.ts:160` |
| `SkipFill` | `src/numbering.ts:88` |
| `stripForeignNumbering` | `src/numbering.ts:1077` |
| `stripHeadingPrefix` | `src/numbering.ts:731` |
| `stripInlineMarkdown` | `src/numbering.ts:756` |
| `stripPrefix` | `src/numbering.ts:708` |
| `stripPrefixBroad` | `src/numbering.ts:1043` |
| `Template` | `src/numbering.ts:184` |
| `templateFileName` | `src/templates/schema.ts:181` |
| `TemplateStore` | `src/templates/TemplateStore.ts:25` |
| `TemplateStore.all` | `src/templates/TemplateStore.ts:118` |
| `TemplateStore.basename` | `src/templates/TemplateStore.ts:112` |
| `TemplateStore.constructor` | `src/templates/TemplateStore.ts:35` |
| `TemplateStore.create` | `src/templates/TemplateStore.ts:160` |
| `TemplateStore.delete` | `src/templates/TemplateStore.ts:180` |
| `TemplateStore.filePath` | `src/templates/TemplateStore.ts:42` |
| `TemplateStore.get` | `src/templates/TemplateStore.ts:123` |
| `TemplateStore.getDefault` | `src/templates/TemplateStore.ts:128` |
| `TemplateStore.has` | `src/templates/TemplateStore.ts:133` |
| `TemplateStore.init` | `src/templates/TemplateStore.ts:50` |
| `TemplateStore.nextUntitledName` | `src/templates/TemplateStore.ts:140` |
| `TemplateStore.readFile` | `src/templates/TemplateStore.ts:100` |
| `TemplateStore.readOrDefault` | `src/templates/TemplateStore.ts:86` |
| `TemplateStore.reload` | `src/templates/TemplateStore.ts:62` |
| `TemplateStore.rename` | `src/templates/TemplateStore.ts:201` |
| `TemplateStore.save` | `src/templates/TemplateStore.ts:171` |
| `toAlpha` | `src/numbering.ts:445` |
| `toCircled` | `src/numbering.ts:432` |
| `toCJK` | `src/numbering.ts:386` |
| `toRoman` | `src/numbering.ts:477` |
| `WhitelistEntry` | `src/numbering.ts:147` |
| `WhitelistEntryHit` | `src/numbering.ts:844` |
| `WhitelistPreview` | `src/numbering.ts:855` |

## 大文件大纲（> 300 行）

### src/i18n.ts （502 行）

- L15 `type Lang` — 已落地的界面语言。
- L18 `type LangSetting` — 语言设置项：`auto` 跟随 Obsidian 界面语言，其余为显式锁定。
- L28 `export function detectObsidianLang(): Lang` — 探测 Obsidian 的界面语言。Obsidian 把界面语言存于 `localStorage["language"]`
- L38 `export function resolveLang(setting: LangSetting | undefined): Lang` — 将语言设置解析为具体语言：显式 `zh`/`en` 原样返回；`auto`/缺失走 。
- L46 `interface Messages` — 全部界面文案的接口（纯字符串直接给值，需插值者给函数）。
- L499 `export function getMessages(lang: Lang): Messages` — 取某语言的文案表。

### src/main.ts （608 行）

- L44 `class AutoHeadingsPlugin` — obsidian-auto-headings 插件入口。
- L59 `messages(): Messages` — 当前界面语言的文案表（按 `settings.language` 解析，见  / ）。
- L63 `async onload(): Promise<void>`
- L129 `onunload(): void`
- L140 `async setAutoNumber(autoNumber: boolean): Promise<void>` — 设置「全局自动编号」开关并持久化，作为面板开关与命令之间的单一数据源，确保两者双向同步。
- L155 `getTemplateForFile(filePath: string | undefined | null): Template | null` — 按路径规则解析**某文件**应使用的模板（见 spec.md §3.8）。
- L175 `private shouldAutoTrigger(content: string): boolean` — **自动触发**是否应进行（见 spec.md §3.1 自动路径）。判定顺序：
- L194 `strippableAffixes(): { prefixes: string[]; suffixes: string[] }` — 收集**全部模板各级别在用的前缀 / 后缀并集**，供剥离时识别历史前缀（方案 A，见
- L210 `currentFileHeadings(): Heading[]` — 解析**当前活动 Markdown 文件**的标题列表，供设置面板的白名单实时命中预览使用（见
- L219 `currentFilePath(): string | null` — 当前活动 Markdown 文件的路径（无活动视图时为 null），供设置面板的白名单预览取模板。
- L229 `async renameTemplate(oldName: string, newName: string): Promise<boolean>` — 重命名模板，并同步更新 `data.json` 中引用该模板名的路径规则（见 spec.md §3.6/§3.8）。
- L254 `renumberActiveFile(): void` — 在设置面板修改模板 / 路径规则后，立即对**所有已打开的 Markdown 文件**重新编号，使格式调整即时可见。
- L282 `private runClearNumbering(editor: Editor, ctx: MarkdownView | MarkdownFileInfo): void` — 「清除当前文件编号」命令（**手动路径**，见 spec.md §3.10）：剥离当前文件所有标题的编号
- L330 `private runClearForeignNumbering(editor: Editor, ctx: MarkdownView | MarkdownFileInfo): void` — 「清理非本插件的标题编号」命令（**手动路径**，0.6.6，见 spec.md §3.10）：只剥**不含 WJ** 的
- L375 `async clearAllVaultNumbering(): Promise<void>` — 清除全库所有 Markdown 文件的编号前缀（见 spec.md §3.10「清除全库编号」按钮）。
- L393 `async loadSettings(): Promise<void>`
- L422 `async saveSettings(): Promise<void>`
- L430 `private scheduleRenumber(editor: Editor, info: MarkdownView | MarkdownFileInfo): void` — 实时编辑触发（**自动路径**）：达到自动触发资格才重置该文件的防抖计时器；到期后再次
- L466 `private runImmediateRenumber(editor: Editor, ctx: MarkdownView | MarkdownFileInfo): void` — 「立即重新编号」命令（**手动路径**，见 spec.md §3.1）：绕过防抖、绕过「全局自动编号」开关
- L500 `private applyRenumber(editor: Editor, template: Template, target?: LinkTarget | null): boolean` — 用给定模板对编辑器执行一次重新编号，并以**单一事务**写回变化的行。
- L545 `private async syncBacklinks( target: LinkTarget | null | undefined, oldContent: string, newContent:…` — Backlink 同步（M7，见 spec.md §3.12）：标题文本改写后，更新别的文件里指向旧标题锚点的内部链接。
- L598 `interface LinkTarget` — Backlink 同步所需的最小目标文件形状（真实为 Obsidian `TFile`，测试可传同形对象）。
- L604 `function linkBasename(path: string): string` — 从文件路径取 basename（去目录与 `.md` 后缀），用作 `TFile.basename` 缺失时的回退。

### src/numbering.ts （1115 行）

- L18 `type NumeralStyle` — 序号样式枚举（见 README 3.6）。
- L44 `type AncestorNumeral` — 「祖先序号渲染」策略：继承前级时，前缀里的**祖先段**（比当前级浅的各段）以何种样式呈现。
- L50 `export function normalizeAncestorNumeral(value: unknown): AncestorNumeral` — 规范化「祖先序号渲染」：非法/缺失（含旧模板）回退默认 `self`。
- L58 `export function normalizeTopLevel(value: unknown): number` — 规范化「起始编号层级」`topLevel`：夹到合法范围 [1, 6]，非数字回退默认 H2。
- L74 `export function normalizeBottomLevel(value: unknown): number` — 规范化「结束编号层级」`bottomLevel`：夹到合法范围 [1, 6]，非数字回退默认 H6（无下界）。
- L88 `type SkipFill` — 跳级（如 H3 → H5，中间缺 H4）时，缺失中间层级的占位策略（由用户在设置中选择）。
- L100 `export function sanitizePlaceholder(raw: string): string` — 收口占位字符：**仅允许数字**。
- L109 `export function normalizeSkipFill(skipFill: SkipFill | undefined): SkipFill` — 规范化占位策略：`fill` 模式下占位文本收口为纯数字（见 ），为空回退 `0`。
- L120 `interface LevelFormat` — 单个标题级别（H2–H6）的显示格式。
- L147 `interface WhitelistEntry` — 白名单条目：由**词语** `text` 与**匹配方式** `match` 组成。
- L159 `export function DEFAULT_WHITELIST(): WhitelistEntry[]` — 默认模板预填充的白名单词表（Milestone 4，见 spec.md §3.7）：覆盖常见的结构性 / 非内容标题，
- L184 `interface Template` — 一个具名模板：为 H1–H6 各级定义显示格式，并附带白名单、跳级占位策略与起始编号层级。
- L286 `class HeadingCounter` — 计数器状态机。内部维护 `[c1, c2, c3, c4, c5, c6]`，分别对应 H1–H6。
- L294 `bump(level: number): void` — 推进给定级别的计数器：`c[level]` 加一，所有更深级别归零。
- L304 `current(level: number): number` — 返回某级当前的纯阿拉伯计数值。
- L313 `sequence(level: number): number[]` — 返回从 H1 到 `level` 的计数序列（纯阿拉伯整数）。
- L319 `reset(): void` — 将所有计数器归零（用于复用同一实例重新编号另一文件）。
- L324 `function assertCountedLevel(level: number): void`
- L331 `function getLevelFormat(template: Template, level: number): LevelFormat | undefined` — 取模板中对应级别的格式；级别不在 1–6 时返回 undefined。
- L358 `function cjkSection(n: number): string` — 将 1–9999 的整数转换为中文数字（不含大节单位）。
- L386 `function toCJK(value: number): string` — 将一个正整数渲染为中文数字（简体习惯）。
- L432 `function toCircled(value: number): string` — 将 1–50 的整数渲染为带圈数字；超出范围回退为 `(n)`。
- L445 `function toAlpha(value: number, base: number): string` — 将正整数渲染为双射 26 进制字母序列（a, b, …, z, aa, ab, …）。
- L477 `function toRoman(value: number, uppercase: boolean): string` — 将正整数渲染为罗马数字；`uppercase` 为 true 时输出大写。超出范围（<1）回退为阿拉伯。
- L497 `export function renderNumeral(style: NumeralStyle, value: number): string` — 将一个纯阿拉伯整数渲染为指定序号样式的字符串。
- L527 `export function buildPrefix(template: Template, level: number, counter: HeadingCounter): string` — 依据模板与当前计数器状态，为某级标题拼装编号前缀。
- L585 `export function previewLevel(template: Template, level: number, count = 3): string[]` — 为设置 GUI 生成某级的实时预览前缀序列（如 H3 → `["1.1.1 ", "1.1.2 ", "1.1.3 "]`）。
- L608 `function escapeRegExp(s: string): string` — 把字符串中的正则元字符转义，使其可作为字面量拼入正则。
- L655 `function affixAlternation(values: readonly string[]): string` — 把一组前缀 / 后缀字面量拼成「能匹配其中任一者」的正则片段（按长度降序，使较长字面量优先匹配）。
- L661 `function numeralTokenPattern(style: NumeralStyle): string` — 某序号样式可能出现的字符类片段，用于剥离已有前缀。
- L708 `export function stripPrefix( text: string, _level?: number, _template?: Template, _options: Pick<Nu…` — 剥离标题文本中由本插件写入的编号前缀（**方案 A，0.6.6：纯 Word Joiner 边界**）。
- L731 `function stripHeadingPrefix( heading: Heading, level: number, template: Template, options: Pick<Num…` — 剥离一个已解析标题的编号前缀，并去除结果的行尾空白。
- L756 `function stripInlineMarkdown(s: string): string` — 去除行内 Markdown 标记，仅用于白名单归一化（见 ）。
- L771 `export function normalizeForWhitelist(text: string): string` — 白名单命中判定前对文本的**归一化**（见 spec.md §3.7）。**仅用于命中判定，绝不改写写入文件的内容。**
- L793 `export function computeWhitelistExemptions( headings: Heading[], template: Template, options: Pick<…` — 计算一篇文档里应被白名单**豁免**（不写前缀、不占计数器槽位）的标题集合。
- L844 `interface WhitelistEntryHit` — 中单个白名单条目的命中信息（供设置面板角标与 ⚠ 告警）。
- L855 `interface WhitelistPreview` — 的结果：用于设置面板的实时命中预览与逐条角标 / 告警。
- L868 `export function analyzeWhitelist( headings: Heading[], template: Template, options: Pick<NumberOpti…` — 针对**当前活动文件**分析白名单命中情况，供设置面板实时预览（命中数 + 标题清单）与逐条角标 / ⚠ 告警。
- L908 `interface NumberedHeading` — 重新编号后的单个标题。
- L922 `interface NumberOptions` — /  的可选项。
- L953 `export function numberHeadings( headings: Heading[], template: Template, options: NumberOptions = {…` — 对一组标题应用模板与计数器，计算每个标题的编号前缀。
- L1043 `export function stripPrefixBroad( rawText: string, knownPrefixes: readonly string[] = [], knownSuff…` — 全样式宽松前缀剥离——用于 M6「清除编号」命令（见 `cleanup.ts`）。
- L1077 `export function stripForeignNumbering(rawText: string): string` — 剥离一段标题文本里**外来 / 手写**的编号前缀——用于 0.6.6「清理非本插件的标题编号」命令
- L1101 `export function renumberContent( content: string, template: Template = DEFAULT_TEMPLATE, options: N…` — 解析整篇文档、重新编号编号范围内（`>= topLevel`）的标题，并返回重写后的完整内容。

### src/settings/SettingsTab.ts （1030 行）

- L34 `function numeralLabel(style: NumeralStyle, t: Messages): string` — 取序号样式在当前语言下的下拉标签（含示例字形）。
- L54 `function matchLabel(match: WhitelistEntry["match"], t: Messages): string` — 取白名单匹配方式在当前语言下的下拉标签。
- L80 `class AutoHeadingsSettingTab` — 设置页面。
- L89 `constructor(app: App, plugin: AutoHeadingsPlugin)`
- L95 `private get t(): Messages` — 当前界面语言的文案表（随 `settings.language` 实时解析）。
- L99 `display(): void`
- L205 `private renderPathRules(containerEl: HTMLElement): void` — 渲染路径规则区（见 spec.md §3.8）：可视化表格（路径模式 → 模板），可增删、可拖拽排序、可滚动；
- L254 `private renderPathRuleRow(table: HTMLElement, rule: PathRule, index: number): void` — 渲染单条路径规则行（拖拽手柄 + 行号 + 路径输入[含清空] + 模板下拉 + 删除）。
- L377 `private updatePathDatalist(datalist: HTMLDataListElement, inputValue: string): void` — **分层**填充路径补全 `<datalist>`：仅列出当前输入所在目录的**直接子项**（输入 `/` 先给根与
- L413 `private renderTemplateRow(parent: HTMLElement, template: Template): void` — 渲染单个模板的行（标题行 + 可展开编辑面板）。
- L459 `private async requestDeleteTemplate(template: Template): Promise<void>` — 删除模板：若**未被任何路径规则引用**则直接删除；否则弹出「知情确认 + 安全降级」对话框
- L469 `async deleteTemplate(name: string): Promise<void>` — 真正执行模板删除并刷新面板（收起其编辑面板）。
- L478 `private renderEditPanel(parent: HTMLElement, template: Template, isDefault: boolean): void` — 渲染某模板的行内编辑面板：可选改名 + 起始/结束层级 + 五级×五列网格 + 实时预览。
- L712 `private renderWhitelistEditor(panel: HTMLElement, template: Template): void` — 渲染某模板的白名单编辑器（模板级配置，见 spec.md §3.7）。
- L830 `private renderDangerZone(containerEl: HTMLElement): void` — 渲染「危险区域」（**默认折叠**，见 spec.md §3.10）：点击标题展开后才显示「清除全库编号」。
- L870 `private textCell( row: HTMLElement, value: string, placeholder: string, onChange: (value: string) =…` — 创建一个文本输入单元格，封装 onChange。
- L886 `private async saveAndPreview( template: Template, level: number, key: LevelKey, previewEls: Map<Lev…` — 保存模板并刷新该级的预览文本。
- L902 `private previewText(template: Template, level: number): string` — 计算某级的预览字符串（取前三个同级序号示例）；在编号区间之外时显示「（不编号）」。
- L920 `class DeleteTemplateModal` — 删除被路径规则引用的模板时的「知情确认 + 安全降级」对话框（见 spec.md §3.6）。
- L927 `constructor(app: App, templateName: string, affected: PathRule[], tab: AutoHeadingsSettingTab)`
- L934 `onOpen(): void`
- L972 `private async applyAndClose(plugin: AutoHeadingsPlugin): Promise<void>` — 按选择改写 / 删除受影响规则，再删除模板，刷新面板并关闭。
- L988 `onClose(): void`
- L999 `class ClearVaultModal` — 「清除全库编号」二次确认对话框（见 spec.md §3.10）。
- L1002 `constructor(app: App, plugin: AutoHeadingsPlugin)`
- L1007 `onOpen(): void`
- L1026 `onClose(): void`
