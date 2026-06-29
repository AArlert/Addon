import {
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	Notice,
	Plugin,
	type EditorChange,
} from "obsidian";
import {
	AutoHeadingsSettings,
	DEFAULT_SETTINGS,
	clampDebounceDelay,
	defaultPathRules,
} from "./settings";
import { AutoHeadingsSettingTab } from "./settings/SettingsTab";
import { readFileSwitch } from "./frontmatter";
import { renumberContent, type Template } from "./numbering";
import { parseHeadings, type Heading } from "./parser";
import { resolvePathRule } from "./pathrules";
import { TemplateStore } from "./templates/TemplateStore";

/**
 * obsidian-auto-headings 插件入口。
 *
 * Milestone 2：editor onChange 监听 + 各文件防抖计时器；以单一事务整文件重写回编辑器；
 * 「立即重新编号」命令；面板全局开关 ↔ 全局命令双向同步；读取 frontmatter 单文件开关。
 * 注：插件**永不改写标题层级**，多个 H1 按各模板的「起始编号层级」处理（见 numbering.ts）。
 *
 * Milestone 3：接入 {@link TemplateStore}（首次启用自动创建 templates/default.json）。
 *
 * Milestone 4：白名单随模板自动生效——{@link renumberContent} 缺省即按 `template.whitelist`
 * 计算豁免（命中者不写前缀、不占计数器槽位，见 numbering.ts）。
 *
 * Milestone 5：**按路径选模板** + **开关/命令重构**（见 spec.md §3.1/§3.2/§3.8）——
 * - 路径规则解析 {@link getTemplateForFile}：按 `settings.pathRules` 为每个文件挑选模板，
 *   无命中则无可用模板（自动静默跳过 / 手动弹 Notice）。
 * - 「是否运行」两层化：`autoNumber`（全局自动编号面板开关）与文件级 frontmatter 强制。
 * - **自动触发**：`autoNumber` 开 或 `fm:ON`，且 `fm≠OFF`（见 {@link shouldAutoTrigger}）。
 * - **手动命令**：绕过全局开关与 `fm:OFF`，仅受「能否命中模板」约束。
 */
export default class AutoHeadingsPlugin extends Plugin {
	settings: AutoHeadingsSettings = { ...DEFAULT_SETTINGS, pathRules: defaultPathRules() };

	/** 模板存储：读写 templates/*.json，首次启用时自动创建目录与默认模板。 */
	templateStore!: TemplateStore;

	private settingTab!: AutoHeadingsSettingTab;

	/** 以文件路径为键的防抖计时器；编辑另一个笔记不会取消当前笔记的待处理更新。 */
	private readonly debounceTimers = new Map<string, number>();

	async onload(): Promise<void> {
		await this.loadSettings();

		// 初始化模板存储：确保 templates/ 目录与 default.json 存在并载入全部模板。
		const pluginDir =
			this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		this.templateStore = new TemplateStore(this.app.vault.adapter, pluginDir);
		await this.templateStore.init();

		this.settingTab = new AutoHeadingsSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		// 全局切换命令：与「全局自动编号」面板开关双向同步（统一经由 setAutoNumber）。
		this.addCommand({
			id: "toggle-auto-headings",
			name: "切换全局自动编号（全局）",
			callback: async () => {
				await this.setAutoNumber(!this.settings.autoNumber);
				new Notice(this.settings.autoNumber ? "已启用全局自动编号" : "已禁用全局自动编号");
			},
		});

		// 立即重新编号：绕过防抖、绕过全局开关与 frontmatter OFF（手动命令路径，见 spec.md §3.1）。
		this.addCommand({
			id: "renumber-now",
			name: "立即重新编号（当前文件）",
			editorCallback: (editor, ctx) => {
				this.runImmediateRenumber(editor, ctx);
			},
		});

		// 实时编辑监听：editor onChange → 重置该文件的防抖计时器。
		this.registerEvent(
			this.app.workspace.on("editor-change", (editor, info) => {
				this.scheduleRenumber(editor, info);
			}),
		);
	}

	onunload(): void {
		// 清理所有待处理的防抖计时器，避免向已卸载插件的回调写入。
		for (const timer of this.debounceTimers.values()) {
			window.clearTimeout(timer);
		}
		this.debounceTimers.clear();
	}

	/**
	 * 设置「全局自动编号」开关并持久化，作为面板开关与命令之间的单一数据源，确保两者双向同步。
	 */
	async setAutoNumber(autoNumber: boolean): Promise<void> {
		this.settings.autoNumber = autoNumber;
		await this.saveSettings();
		// 若设置面板当前打开，刷新以反映最新状态（含「兜底缺失提示条」的显隐）。
		this.settingTab.display();
	}

	/**
	 * 按路径规则解析**某文件**应使用的模板（见 spec.md §3.8）。
	 *
	 * 用 `settings.pathRules` 对文件路径做具体度解析，命中规则后按模板名取模板。无任何规则
	 * 匹配（含 `/` 根规则被删）、或规则引用的模板已不存在时，返回 `null`（该文件**无可用模板**）。
	 *
	 * @param filePath 文件在仓库中的相对路径；为空时返回 `null`。
	 */
	getTemplateForFile(filePath: string | undefined | null): Template | null {
		if (!filePath) {
			return null;
		}
		const rule = resolvePathRule(this.settings.pathRules, filePath);
		if (!rule) {
			return null;
		}
		return this.templateStore.get(rule.template) ?? null;
	}

	/**
	 * **自动触发**是否应进行（见 spec.md §3.1 自动路径）。判定顺序：
	 * - frontmatter `OFF` → 不触发（即便全局开关开）。
	 * - frontmatter `ON` → 触发（文件级强制 opt-in，即便全局开关关）。
	 * - 缺省 / 非法值 → 跟随「全局自动编号」开关。
	 *
	 * 注意：本判定仅决定「是否够格自动触发」，是否真正写入还取决于能否命中模板（见
	 * {@link getTemplateForFile}）。手动命令不走此判定。
	 */
	private shouldAutoTrigger(content: string): boolean {
		const sw = readFileSwitch(content);
		if (sw === "OFF") {
			return false;
		}
		if (sw === "ON") {
			return true;
		}
		return this.settings.autoNumber;
	}

	/**
	 * 收集**全部模板各级别在用的前缀 / 后缀并集**，供剥离时识别历史前缀（方案 A，见
	 * {@link renumberContent} 的 `strippablePrefixes` / `strippableSuffixes`）。
	 *
	 * 解决 testplan B2/B3：用户把某模板的前缀（如「第」）改走、或在多模板间切换后，文件里用
	 * **旧前缀**写出的历史编号若只认当前模板值就剥不掉、会叠加。把所有模板用过的前后缀都纳入候选，
	 * 旧前缀即可被剥净。`stripPrefix` 自身还会并入「当前级别值 + 空串」，故此处只需提供跨模板的并集。
	 */
	strippableAffixes(): { prefixes: string[]; suffixes: string[] } {
		const prefixes = new Set<string>([""]);
		const suffixes = new Set<string>([""]);
		for (const tpl of this.templateStore.all()) {
			for (const level of Object.values(tpl.levels)) {
				prefixes.add(level.prefix);
				suffixes.add(level.suffix);
			}
		}
		return { prefixes: [...prefixes], suffixes: [...suffixes] };
	}

	/**
	 * 解析**当前活动 Markdown 文件**的标题列表，供设置面板的白名单实时命中预览使用（见
	 * SettingsTab 白名单编辑器）。无活动 Markdown 视图时返回空数组。
	 */
	currentFileHeadings(): Heading[] {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			return [];
		}
		return parseHeadings(view.editor.getValue());
	}

	/** 当前活动 Markdown 文件的路径（无活动视图时为 null），供设置面板的白名单预览取模板。 */
	currentFilePath(): string | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.file?.path ?? null;
	}

	/**
	 * 重命名模板，并同步更新 `data.json` 中引用该模板名的路径规则（见 spec.md §3.6/§3.8）。
	 *
	 * @returns 重命名是否成功（名称冲突、为空或为默认模板时失败）。
	 */
	async renameTemplate(oldName: string, newName: string): Promise<boolean> {
		const ok = await this.templateStore.rename(oldName, newName);
		if (ok) {
			let changed = false;
			for (const rule of this.settings.pathRules) {
				if (rule.template === oldName) {
					rule.template = newName;
					changed = true;
				}
			}
			if (changed) {
				await this.saveSettings();
			}
		}
		return ok;
	}

	/**
	 * 在设置面板修改模板后，立即对**当前活动 Markdown 文件**重新编号，使格式调整即时可见。
	 *
	 * 走与自动触发一致的判定（{@link shouldAutoTrigger} + 按路径解析模板）：全局开关关、
	 * frontmatter `OFF`、或无可用模板时静默跳过；无活动编辑器时不动作。
	 */
	renumberActiveFile(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			return;
		}
		const editor = view.editor;
		if (!this.shouldAutoTrigger(editor.getValue())) {
			return;
		}
		const template = this.getTemplateForFile(view.file?.path);
		if (!template) {
			return;
		}
		this.applyRenumber(editor, template);
	}

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Record<string, unknown>;
		const merged = Object.assign(
			{},
			DEFAULT_SETTINGS,
			{ pathRules: defaultPathRules() },
			data,
		) as Record<string, unknown>;
		// 迁移：历史字段 `enabled`（M2–M4）→ `autoNumber`（M5）。
		if (typeof data.enabled === "boolean" && typeof data.autoNumber !== "boolean") {
			merged.autoNumber = data.enabled;
		}
		delete merged.enabled;
		// pathRules 缺失 / 非数组时回退到默认（`/`→「默认」）。
		if (!Array.isArray(merged.pathRules)) {
			merged.pathRules = defaultPathRules();
		}
		this.settings = merged as unknown as AutoHeadingsSettings;
		this.settings.debounceDelay = clampDebounceDelay(this.settings.debounceDelay);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * 实时编辑触发（**自动路径**）：达到自动触发资格才重置该文件的防抖计时器；到期后再次
	 * 校验资格与模板命中，命中则整文件重排。计时器以文件路径为单位互相独立。
	 */
	private scheduleRenumber(editor: Editor, info: MarkdownView | MarkdownFileInfo): void {
		const file = info.file;
		if (!file) {
			return;
		}
		// 不够格自动触发（全局开关关且非 fm:ON，或 fm:OFF）时不安排任何更新。
		if (!this.shouldAutoTrigger(editor.getValue())) {
			return;
		}

		const path = file.path;
		const existing = this.debounceTimers.get(path);
		if (existing !== undefined) {
			window.clearTimeout(existing);
		}

		const timer = window.setTimeout(() => {
			this.debounceTimers.delete(path);
			// 计时器到期时再次校验（其间用户可能改了开关或 frontmatter）。
			if (!this.shouldAutoTrigger(editor.getValue())) {
				return;
			}
			const template = this.getTemplateForFile(path);
			if (!template) {
				return; // 无可用模板：自动触发静默跳过（不打扰）。
			}
			this.applyRenumber(editor, template);
		}, this.settings.debounceDelay);

		this.debounceTimers.set(path, timer);
	}

	/**
	 * 「立即重新编号」命令（**手动路径**，见 spec.md §3.1）：绕过防抖、绕过「全局自动编号」开关
	 * 与 frontmatter `OFF`，仅受「能否命中模板」约束；命中不到模板时弹 Notice 反馈。
	 */
	private runImmediateRenumber(editor: Editor, ctx: MarkdownView | MarkdownFileInfo): void {
		// 若有待处理的实时更新，先取消，避免随后重复触发。
		const path = ctx.file?.path;
		if (path) {
			const existing = this.debounceTimers.get(path);
			if (existing !== undefined) {
				window.clearTimeout(existing);
				this.debounceTimers.delete(path);
			}
		}

		const template = this.getTemplateForFile(path);
		if (!template) {
			new Notice("当前文件未匹配任何路径规则，无法编号");
			return;
		}

		const changed = this.applyRenumber(editor, template);
		new Notice(changed ? "已重新编号" : "无需改动");
	}

	/**
	 * 用给定模板对编辑器执行一次重新编号，并以**单一事务**写回变化的行。
	 *
	 * 本方法只做「剥旧前缀 + 按模板写新前缀」的机械动作，**不**再判定开关 / frontmatter / 模板命中
	 * （这些由调用方按自动 / 手动路径分别判定，见 {@link scheduleRenumber} / {@link runImmediateRenumber}）。
	 *
	 * - 仅当内容确有变化时才发起事务，避免无谓的撤销记录与光标抖动。
	 * - 整文件重写永不增删行，故按行索引逐行比较即可定位变化。
	 *
	 * @returns 是否实际写入了改动。
	 */
	private applyRenumber(editor: Editor, template: Template): boolean {
		const oldContent = editor.getValue();

		const { prefixes, suffixes } = this.strippableAffixes();
		const newContent = renumberContent(oldContent, template, {
			strippablePrefixes: prefixes,
			strippableSuffixes: suffixes,
		});
		if (newContent === oldContent) {
			return false;
		}

		const oldLines = oldContent.split("\n");
		const newLines = newContent.split("\n");
		const changes: EditorChange[] = [];
		for (let i = 0; i < newLines.length; i++) {
			if (oldLines[i] !== newLines[i]) {
				changes.push({
					from: { line: i, ch: 0 },
					to: { line: i, ch: oldLines[i].length },
					text: newLines[i],
				});
			}
		}
		if (changes.length === 0) {
			return false;
		}

		// 单一事务：多处行替换合并为一条撤销记录。
		editor.transaction({ changes });
		return true;
	}
}
