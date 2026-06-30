/**
 * 国际化（i18n，Milestone 6）：设置面板、命令名与 Notice 的**中英双语**文案。
 *
 * 设计：
 * - {@link Lang} 仅含已落地的两种语言（`zh` / `en`）；用户可在设置里选「自动 / 中文 / English」
 *   （{@link LangSetting}），「自动」由 {@link detectObsidianLang} 跟随 Obsidian 界面语言。
 * - {@link Messages} 是**全部文案**的扁平接口：纯字符串直接给值，需插值的（如范围、计数）给函数。
 *   两套实现 {@link zh} / {@link en} 形状完全一致，由 TypeScript 保证不漏键。
 * - 文案是**界面字符串**，不翻译用户数据（模板名「默认」、白名单词条等保持原样）。
 *
 * 仓库守则要求注释 / 文档用简体中文；面向用户的字符串则按所选语言呈现，故本文件**同时**含中英文案。
 */

/** 已落地的界面语言。 */
export type Lang = "zh" | "en";

/** 语言设置项：`auto` 跟随 Obsidian 界面语言，其余为显式锁定。 */
export type LangSetting = "auto" | Lang;

/** 语言设置的默认值：自动（跟随 Obsidian）。 */
export const DEFAULT_LANG_SETTING: LangSetting = "auto";

/**
 * 探测 Obsidian 的界面语言。Obsidian 把界面语言存于 `localStorage["language"]`
 * （英文时通常缺省 / 为空）。以 `zh` 前缀（含 `zh-TW` 等）判为中文，其余一律英文。
 * 读取失败（无 `window` / 受限环境）时回退英文（与 Obsidian 默认界面一致）。
 */
export function detectObsidianLang(): Lang {
	try {
		const v = window.localStorage.getItem("language") ?? "";
		return v.toLowerCase().startsWith("zh") ? "zh" : "en";
	} catch {
		return "en";
	}
}

/** 将语言设置解析为具体语言：显式 `zh`/`en` 原样返回；`auto`/缺失走 {@link detectObsidianLang}。 */
export function resolveLang(setting: LangSetting | undefined): Lang {
	if (setting === "zh" || setting === "en") {
		return setting;
	}
	return detectObsidianLang();
}

/** 全部界面文案的接口（纯字符串直接给值，需插值者给函数）。 */
export interface Messages {
	// —— 语言设置 ——
	languageName: string;
	languageDesc: string;
	langAuto: string;
	langZh: string;
	langEn: string;
	languageChangeHint: string;

	// —— 全局自动编号 ——
	autoNumberName: string;
	autoNumberDesc: string;

	// —— 防抖延迟 ——
	debounceName: string;
	debounceDesc: (min: number, max: number, def: number) => string;
	resetTooltip: (def: number) => string;

	// —— Backlink 同步 ——
	updateBacklinksName: string;
	updateBacklinksDesc: string;

	// —— 路径规则 ——
	pathRulesHeading: string;
	pathRulesDesc: string;
	pathNoRootWarn: string;
	addRootRule: string;
	addRule: string;
	pathColPattern: string;
	pathColTemplate: string;
	pathEmpty: string;
	pathInputPlaceholder: string;
	templateMissingSuffix: (name: string) => string;
	clearInputTooltip: string;
	deleteRuleTooltip: string;

	// —— 模板区 ——
	templatesHeading: string;
	templatesDesc: string;
	addTemplate: string;
	defaultTemplateDesc: string;
	collapseTooltip: string;
	editTooltip: string;
	deleteBtn: string;
	defaultCannotDelete: string;

	// —— 模板编辑面板 ——
	templateNameName: string;
	templateNameDesc: string;
	topLevelName: string;
	topLevelDesc: string;
	bottomLevelName: string;
	bottomLevelDesc: string;
	ancestorName: string;
	ancestorDesc: string;
	ancestorSelf: string;
	ancestorArabic: string;

	// 网格表头与占位符
	colLevel: string;
	colPrefix: string;
	colNumeral: string;
	colNumberSep: string;
	colSuffix: string;
	colTitleSep: string;
	colInherit: string;
	colPreview: string;
	phPrefix: string;
	phSuffix: string;
	phSpace: string;
	previewInactive: string;
	previewHeadingWord: string;

	// 跳级占位
	skipFillName: string;
	skipFillDesc: string;
	skipFillFill: string;
	skipFillDrop: string;
	placeholderName: string;
	placeholderDesc: string;

	// 序号样式下拉（值 → 标签）
	numeralArabic: string;
	numeralCjk: string;
	numeralCircled: string;
	numeralLowerAlpha: string;
	numeralUpperAlpha: string;
	numeralLowerRoman: string;
	numeralUpperRoman: string;

	// 白名单匹配方式（值 → 标签）
	matchExact: string;
	matchPartial: string;
	matchSubtree: string;

	// 白名单编辑器
	whitelistName: string;
	whitelistDesc: string;
	wlInputPlaceholder: string;
	wlEmpty: string;
	wlChipWarnTitle: string;
	wlPreviewNoFile: string;
	wlPreviewNone: string;
	wlPreviewSome: (count: number, titles: string) => string;
	/** 当前文件实际使用的模板 ≠ 正在编辑的模板时的警示（预览仅为假设）。 */
	wlPreviewOtherTemplate: (appliedName: string) => string;
	wlPreviewNoTemplate: string;

	// —— 危险区域 ——
	dangerHeading: string;
	dangerExpandHint: string;
	clearVaultName: string;
	clearVaultDesc: string;
	clearVaultBtn: string;

	// 删除模板对话框
	delModalTitle: (name: string) => string;
	delModalBody: (count: number) => string;
	delModalEmptyPath: string;
	delModalRedirect: string;
	delModalDeleteRules: string;
	cancel: string;
	confirmDelete: string;

	// 清除全库对话框
	clearVaultModalTitle: string;
	clearVaultModalBody: string;
	confirmClearVault: string;

	// —— 命令名（main.ts）——
	cmdToggle: string;
	cmdRenumber: string;
	cmdClear: string;
	cmdClearForeign: string;

	// —— Notice（main.ts）——
	noticeEnabled: string;
	noticeDisabled: string;
	noticeNothingToClear: string;
	noticeCleared: string;
	noticeClearedVault: (count: number) => string;
	noticeNoRule: string;
	noticeRenumbered: string;
	noticeNoChange: string;
	noticeNoForeign: string;
	noticeForeignCleared: string;
	noticeBacklinksUpdated: (count: number) => string;
}

/** 简体中文文案。 */
const zh: Messages = {
	languageName: "语言",
	languageDesc: "设置面板与命令的显示语言。「自动」跟随 Obsidian 界面语言。",
	langAuto: "自动（跟随 Obsidian）",
	langZh: "中文",
	langEn: "English",
	languageChangeHint: "命令名称将在下次重载插件后更新为新语言。",

	autoNumberName: "全局自动编号",
	autoNumberDesc:
		"开启后，编辑文件时自动为标题编号。关闭则插件常驻但不自动触碰文件；仍可对个别文件用 frontmatter「obsidian-auto-headings: ON」强制开启，或用「立即重新编号」命令手动触发。",

	debounceName: "防抖延迟",
	debounceDesc: (min, max, def) =>
		`编辑停顿后多少毫秒触发自动编号。范围 ${min}–${max} ms，默认 ${def} ms。`,
	resetTooltip: (def) => `恢复默认 ${def} ms`,

	updateBacklinksName: "同步内部链接（Backlink）",
	updateBacklinksDesc:
		"编号 / 清除改写标题后，自动更新其它文件里指向该标题的内部链接（如 [[文件#标题]]），避免断链。会修改被引用文件，且这些改动不在被改文件的撤销历史内——建议先备份。默认关闭。",

	pathRulesHeading: "路径规则",
	pathRulesDesc:
		"把路径映射到模板：文件夹规则以「/」结尾（匹配其下全部文件），文件规则写完整路径；「/」根规则匹配全库（即全局默认）。最具体的规则优先，并列时靠后者胜出。",
	pathNoRootWarn: "⚠ 无根路径规则（/），「全局自动编号」开启时不命中任何规则的文件将不被编号。",
	addRootRule: "+ 添加 / 根规则",
	addRule: "+ 添加规则",
	pathColPattern: "路径模式",
	pathColTemplate: "模板",
	pathEmpty: "（暂无规则；添加一条「/」根规则即对全库生效）",
	pathInputPlaceholder: "如 Projects/ 或 读书笔记/深度工作.md 或 /",
	templateMissingSuffix: (name) => `${name}（已失效）`,
	clearInputTooltip: "清空此路径",
	deleteRuleTooltip: "删除此规则",

	templatesHeading: "模板",
	templatesDesc:
		"为各级标题定义编号的显示格式与白名单。哪个文件用哪个模板由上方「路径规则」决定。",
	addTemplate: "+ 新增模板",
	defaultTemplateDesc: "内置默认模板，不可删除；可编辑。",
	collapseTooltip: "折叠",
	editTooltip: "编辑",
	deleteBtn: "删除",
	defaultCannotDelete: "默认模板不可删除",

	templateNameName: "模板名称",
	templateNameDesc: "重命名后将自动更新对应的模板文件与引用它的路径规则。",
	topLevelName: "起始编号层级",
	topLevelDesc:
		"从哪一级标题开始编号：比它浅的标题不编号、也不会被改写（如默认 H2：H1 作标题/分节，多个 H1 各自原样保留）。它及更深的标题（直到「结束编号层级」）正常编号，并以它为序号第一段。",
	bottomLevelName: "结束编号层级",
	bottomLevelDesc:
		"编号到哪一级标题为止：比它更深的标题不编号、也不会被改写（仅当残留旧编号时被剥除）。与「起始编号层级」配合即可只编号「H2–H4」这样的区间。默认 H6 = 无下界。须 ≥ 起始层级。",
	ancestorName: "祖先序号渲染",
	ancestorDesc:
		"继承前级时，前缀里更浅层级（祖先）的序号用什么样式：「各自样式」每个祖先套用其自身样式（如 H3=字母、H4=带圈得 1.a.①）；「统一阿拉伯」祖先一律阿拉伯、仅当前级套自身样式（如 H2=中文得标题「一」、H3 子节得「1.1」，适合中文书）。",
	ancestorSelf: "各自样式（1.a.①）",
	ancestorArabic: "统一阿拉伯（一 / 1.1）",

	colLevel: "级别",
	colPrefix: "前缀",
	colNumeral: "序号",
	colNumberSep: "序号间隔符",
	colSuffix: "后缀",
	colTitleSep: "标题间隔符",
	colInherit: "继承前级",
	colPreview: "预览",
	phPrefix: "前缀",
	phSuffix: "后缀",
	phSpace: "空格",
	previewInactive: "（不编号）",
	previewHeadingWord: "标题",

	skipFillName: "跳级缺失层级",
	skipFillDesc:
		"标题跳级时（如 H3 后直接跟 H5），缺失的中间层级如何呈现：补位则保留一段并填入下方占位符（H5 得四段）；不补位则省略该段（H5 呈现为三段、与 H4 同形）。",
	skipFillFill: "补位",
	skipFillDrop: "不补位（省略该段）",
	placeholderName: "占位字符",
	placeholderDesc:
		"补位时填入缺失层级的文本，仅限数字（如 0 得 1.1.0.1、1 得 1.1.1.1）；非数字会被自动滤除、留空按 0 处理。限数字是为确保编号始终能被干净剥离、不重复叠加。",

	numeralArabic: "阿拉伯 (1, 2, 3)",
	numeralCjk: "中文 (一, 二, 三)",
	numeralCircled: "带圈 (①, ②, ③)",
	numeralLowerAlpha: "小写字母 (a, b, c)",
	numeralUpperAlpha: "大写字母 (A, B, C)",
	numeralLowerRoman: "小写罗马 (i, ii, iii)",
	numeralUpperRoman: "大写罗马 (I, II, III)",

	matchExact: "全部",
	matchPartial: "部分",
	matchSubtree: "子树",

	whitelistName: "白名单",
	whitelistDesc:
		"命中的标题不编号、也不占用计数器槽位（不跳号）。匹配方式：全部（完全相等）、部分（包含该词）、子树（命中标题及其下属子标题整体豁免）。",
	wlInputPlaceholder: "输入词语后按 Enter 添加…",
	wlEmpty: "（暂无条目）",
	wlChipWarnTitle:
		"命中的标题下还有子标题，子标题不会被豁免、会错挂到上一已编号祖先。建议改用「子树」整块豁免。",
	wlPreviewNoFile: "（打开一个含标题的 Markdown 文件以预览本白名单的命中）",
	wlPreviewNone: "当前文件无标题被本白名单豁免。",
	wlPreviewSome: (count, titles) => `当前文件将豁免 ${count} 个标题：${titles}`,
	wlPreviewOtherTemplate: (appliedName) =>
		`⚠ 当前文件按路径规则实际使用模板「${appliedName}」，不是正在编辑的这个模板；下方预览仅为「假如本文件用此模板」的假设，实际编号以「${appliedName}」的白名单为准。`,
	wlPreviewNoTemplate:
		"⚠ 当前文件未命中任何路径规则（无可用模板），不会被自动编号；下方预览仅为假设。",

	dangerHeading: "危险区域",
	dangerExpandHint: "（点击展开）",
	clearVaultName: "清除全库编号",
	clearVaultDesc:
		"一次性剥离全库所有 Markdown 文件中本插件写入的编号前缀，把标题还原为裸标题。此操作通过 Vault API 写回、不在 Obsidian 撤销历史内，建议先备份。仅清除编号前缀，不改变其他内容。",
	clearVaultBtn: "清除全库编号…",

	delModalTitle: (name) => `删除模板「${name}」`,
	delModalBody: (count) => `以下 ${count} 条路径规则正在使用此模板：`,
	delModalEmptyPath: "（空路径）",
	delModalRedirect: "删除后这些规则改用",
	delModalDeleteRules: "删除这些规则",
	cancel: "取消",
	confirmDelete: "确认删除",

	clearVaultModalTitle: "清除全库编号",
	clearVaultModalBody:
		"这将从全库所有 Markdown 文件中剥离本插件写入的编号前缀，把标题还原为裸标题。此操作通过 Vault API 写回、不在 Obsidian 撤销历史内，建议先备份。确认继续？",
	confirmClearVault: "确认清除全库",

	cmdToggle: "切换全局自动编号（全局）",
	cmdRenumber: "立即重新编号（当前文件）",
	cmdClear: "清除当前文件编号",
	cmdClearForeign: "清理非本插件的标题编号（当前文件）",

	noticeEnabled: "已启用全局自动编号",
	noticeDisabled: "已禁用全局自动编号",
	noticeNothingToClear: "当前文件无可清除的编号前缀",
	noticeCleared: "已清除编号",
	noticeClearedVault: (count) => `已清除全库编号（共修改 ${count} 个文件）`,
	noticeNoRule: "当前文件未匹配任何路径规则，无法编号",
	noticeRenumbered: "已重新编号",
	noticeNoChange: "无需改动",
	noticeNoForeign: "当前文件无可清理的外来编号",
	noticeForeignCleared: "已清理非本插件的标题编号",
	noticeBacklinksUpdated: (count) => `已更新 ${count} 处内部链接`,
};

/** English copy. */
const en: Messages = {
	languageName: "Language",
	languageDesc:
		'Display language for the settings panel and commands. "Auto" follows Obsidian\'s UI language.',
	langAuto: "Auto (follow Obsidian)",
	langZh: "中文",
	langEn: "English",
	languageChangeHint: "Command names update to the new language after the plugin is reloaded.",

	autoNumberName: "Global auto-numbering",
	autoNumberDesc:
		'When on, headings are numbered automatically as you edit. When off, the plugin stays loaded but never touches files automatically; you can still force a single file on with the frontmatter "obsidian-auto-headings: ON", or trigger manually with the "Renumber now" command.',

	debounceName: "Debounce delay",
	debounceDesc: (min, max, def) =>
		`How many milliseconds after you stop editing before auto-numbering runs. Range ${min}–${max} ms, default ${def} ms.`,
	resetTooltip: (def) => `Reset to default ${def} ms`,

	updateBacklinksName: "Sync internal links (backlinks)",
	updateBacklinksDesc:
		"When numbering or clearing rewrites a heading, automatically update internal links in other files that point to it (e.g. [[file#heading]]) so they don't break. This modifies the referencing files, and those edits are NOT in their undo history — back up first. Off by default.",

	pathRulesHeading: "Path rules",
	pathRulesDesc:
		'Map paths to templates: folder rules end with "/" (match every file under them), file rules use the full path, and the "/" root rule matches the whole vault (the global default). The most specific rule wins; on ties, the later one wins.',
	pathNoRootWarn:
		'⚠ No root path rule (/). With "Global auto-numbering" on, files that match no rule will not be numbered.',
	addRootRule: "+ Add / root rule",
	addRule: "+ Add rule",
	pathColPattern: "Path pattern",
	pathColTemplate: "Template",
	pathEmpty: '(No rules yet; add a "/" root rule to cover the whole vault.)',
	pathInputPlaceholder: "e.g. Projects/ or Notes/Deep Work.md or /",
	templateMissingSuffix: (name) => `${name} (missing)`,
	clearInputTooltip: "Clear this path",
	deleteRuleTooltip: "Delete this rule",

	templatesHeading: "Templates",
	templatesDesc:
		"Define the numbering format and whitelist for each heading level. Which file uses which template is decided by the Path rules above.",
	addTemplate: "+ New template",
	defaultTemplateDesc: "Built-in default template; cannot be deleted, but can be edited.",
	collapseTooltip: "Collapse",
	editTooltip: "Edit",
	deleteBtn: "Delete",
	defaultCannotDelete: "The default template cannot be deleted",

	templateNameName: "Template name",
	templateNameDesc:
		"Renaming automatically updates the matching template file and any path rules that reference it.",
	topLevelName: "Start level",
	topLevelDesc:
		"The shallowest heading level to number: shallower headings are neither numbered nor rewritten (e.g. default H2: H1 acts as the title/section, multiple H1s are kept as-is). This level and deeper ones (up to the End level) are numbered, with this level as the first segment.",
	bottomLevelName: "End level",
	bottomLevelDesc:
		"The deepest heading level to number: deeper headings are neither numbered nor rewritten (only stripped if they carry leftover numbering). Combine with the Start level to number a range like H2–H4. Default H6 = no lower bound. Must be ≥ the Start level.",
	ancestorName: "Ancestor numeral rendering",
	ancestorDesc:
		'When inheriting, which style the shallower (ancestor) segments of the prefix use: "Own style" renders each ancestor in its own style (e.g. H3=letters, H4=circled gives 1.a.①); "All Arabic" renders every ancestor as Arabic and only the current level in its own style (e.g. H2=Chinese gives the title "一" while H3 gives "1.1", suited to Chinese books).',
	ancestorSelf: "Own style (1.a.①)",
	ancestorArabic: "All Arabic (一 / 1.1)",

	colLevel: "Level",
	colPrefix: "Prefix",
	colNumeral: "Numeral",
	colNumberSep: "Number sep.",
	colSuffix: "Suffix",
	colTitleSep: "Title sep.",
	colInherit: "Inherit",
	colPreview: "Preview",
	phPrefix: "Prefix",
	phSuffix: "Suffix",
	phSpace: "Space",
	previewInactive: "(not numbered)",
	previewHeadingWord: "Heading",

	skipFillName: "Skipped levels",
	skipFillDesc:
		"When headings skip a level (e.g. H5 right after H3), how the missing middle levels appear: Fill keeps a segment filled with the placeholder below (H5 gets four segments); Drop omits it (H5 shows three segments, same shape as H4).",
	skipFillFill: "Fill",
	skipFillDrop: "Drop (omit the segment)",
	placeholderName: "Placeholder",
	placeholderDesc:
		"The text used to fill a missing level; digits only (e.g. 0 gives 1.1.0.1, 1 gives 1.1.1.1). Non-digits are filtered out automatically; empty is treated as 0. Digits-only keeps numbering cleanly strippable and non-stacking.",

	numeralArabic: "Arabic (1, 2, 3)",
	numeralCjk: "Chinese (一, 二, 三)",
	numeralCircled: "Circled (①, ②, ③)",
	numeralLowerAlpha: "Lowercase letters (a, b, c)",
	numeralUpperAlpha: "Uppercase letters (A, B, C)",
	numeralLowerRoman: "Lowercase Roman (i, ii, iii)",
	numeralUpperRoman: "Uppercase Roman (I, II, III)",

	matchExact: "Exact",
	matchPartial: "Partial",
	matchSubtree: "Subtree",

	whitelistName: "Whitelist",
	whitelistDesc:
		"Matched headings are not numbered and do not take a counter slot (no number is skipped). Match modes: Exact (fully equal), Partial (contains the word), Subtree (the matched heading and its descendant headings are all exempt).",
	wlInputPlaceholder: "Type a word and press Enter to add…",
	wlEmpty: "(No entries yet)",
	wlChipWarnTitle:
		"The matched heading has child headings; the children stay numbered and would attach to the previous numbered ancestor. Use “Subtree” to exempt the whole block.",
	wlPreviewNoFile: "(Open a Markdown file with headings to preview this whitelist's matches.)",
	wlPreviewNone: "No heading in the current file is exempted by this whitelist.",
	wlPreviewSome: (count, titles) =>
		`This whitelist will exempt ${count} heading(s) in the current file: ${titles}`,
	wlPreviewOtherTemplate: (appliedName) =>
		`⚠ By the path rules, the current file actually uses template "${appliedName}", not the one you're editing. The preview below is hypothetical ("if this file used this template"); actual numbering follows "${appliedName}"'s whitelist.`,
	wlPreviewNoTemplate:
		"⚠ The current file matches no path rule (no template applies), so it won't be auto-numbered. The preview below is hypothetical.",

	dangerHeading: "Danger zone",
	dangerExpandHint: "(click to expand)",
	clearVaultName: "Clear numbering in the whole vault",
	clearVaultDesc:
		"Strip the numbering prefixes this plugin wrote from every Markdown file in the vault, restoring bare headings. This writes back via the Vault API and is NOT in Obsidian's undo history — back up first. Only numbering prefixes are removed; nothing else changes.",
	clearVaultBtn: "Clear vault numbering…",

	delModalTitle: (name) => `Delete template "${name}"`,
	delModalBody: (count) => `The following ${count} path rule(s) use this template:`,
	delModalEmptyPath: "(empty path)",
	delModalRedirect: "After deletion, these rules use",
	delModalDeleteRules: "Delete these rules",
	cancel: "Cancel",
	confirmDelete: "Confirm delete",

	clearVaultModalTitle: "Clear vault numbering",
	clearVaultModalBody:
		"This will strip the numbering prefixes this plugin wrote from every Markdown file in the vault, restoring bare headings. It writes back via the Vault API and is NOT in Obsidian's undo history — back up first. Continue?",
	confirmClearVault: "Confirm clear vault",

	cmdToggle: "Toggle global auto-numbering (global)",
	cmdRenumber: "Renumber now (current file)",
	cmdClear: "Clear numbering in current file",
	cmdClearForeign: "Clear non-plugin heading numbering (current file)",

	noticeEnabled: "Global auto-numbering enabled",
	noticeDisabled: "Global auto-numbering disabled",
	noticeNothingToClear: "No numbering prefix to clear in the current file",
	noticeCleared: "Numbering cleared",
	noticeClearedVault: (count) => `Vault numbering cleared (${count} file(s) changed)`,
	noticeNoRule: "The current file matches no path rule; cannot number it",
	noticeRenumbered: "Renumbered",
	noticeNoChange: "No change needed",
	noticeNoForeign: "No foreign (non-plugin) numbering to clear in the current file",
	noticeForeignCleared: "Cleared non-plugin heading numbering",
	noticeBacklinksUpdated: (count) => `Updated ${count} internal link(s)`,
};

/** 取某语言的文案表。 */
export function getMessages(lang: Lang): Messages {
	return lang === "en" ? en : zh;
}
