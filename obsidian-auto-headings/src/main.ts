import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { AutoHeadingsSettings, DEFAULT_SETTINGS, clampDebounce } from "./settings";
import { AutoHeadingsSettingTab } from "./settings/SettingsTab";
import { parseAutoHeadingsSwitch } from "./frontmatter";
import { DEFAULT_TEMPLATE, RenumberMode, computeHeadingEdits } from "./numbering";

/**
 * obsidian-auto-headings 插件入口。
 *
 * Milestone 2：编辑器变化监听 + 各文件防抖、错位 H1 双模式（实时仅改本行 /
 * 格式化级联降级）、以单一事务整文件重写、「立即重新编号」命令、frontmatter
 * 单文件开关（ON/OFF，大小写敏感）。编号使用 Milestone 1 的硬编码默认模板；
 * 可配置模板、白名单、按路径配置将在后续里程碑加入。
 */
export default class AutoHeadingsPlugin extends Plugin {
	settings: AutoHeadingsSettings = { ...DEFAULT_SETTINGS };

	private settingTab!: AutoHeadingsSettingTab;

	/** 以文件路径为键的防抖计时器；编辑不同文件互不取消。 */
	private readonly debounceTimers = new Map<string, number>();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.settingTab = new AutoHeadingsSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		// 编辑器内容变化：在防抖延迟后以「实时模式」重新编号当前文件。
		this.registerEvent(
			this.app.workspace.on("editor-change", (_editor, info) => {
				if (!this.settings.enabled) {
					return;
				}
				const path = info.file?.path;
				if (path) {
					this.scheduleRenumber(path);
				}
			}),
		);

		this.addCommand({
			id: "toggle-auto-headings",
			name: "切换自动编号（全局）",
			callback: async () => {
				await this.setEnabled(!this.settings.enabled);
				new Notice(this.settings.enabled ? "已启用自动编号" : "已禁用自动编号");
			},
		});

		// 立即重新编号：绕过防抖、采用「格式化模式」（错位 H1 级联降级）。
		// 这是用户主动触发的一次性整理，因此即便全局开关关闭也执行；但仍尊重
		// frontmatter 中 OFF 的单文件豁免。
		this.addCommand({
			id: "renumber-now",
			name: "立即重新编号（当前文件）",
			editorCallback: (editor: Editor) => {
				const changed = this.renumberEditor(editor, "format");
				if (!changed && parseAutoHeadingsSwitch(editor.getValue()) === "OFF") {
					new Notice("该文件 frontmatter 设为 OFF，已跳过自动编号");
				}
			},
		});
	}

	onunload(): void {
		for (const timer of this.debounceTimers.values()) {
			window.clearTimeout(timer);
		}
		this.debounceTimers.clear();
	}

	/**
	 * 设置全局开关并持久化，作为面板开关与命令之间的单一数据源，
	 * 确保两者双向同步。
	 */
	async setEnabled(enabled: boolean): Promise<void> {
		this.settings.enabled = enabled;
		await this.saveSettings();
		// 若设置面板当前打开，刷新以反映最新状态。
		this.settingTab.display();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** 为某文件安排（或重置）一次防抖的实时重新编号。 */
	private scheduleRenumber(path: string): void {
		const existing = this.debounceTimers.get(path);
		if (existing !== undefined) {
			window.clearTimeout(existing);
		}
		const timer = window.setTimeout(() => {
			this.debounceTimers.delete(path);
			if (!this.settings.enabled) {
				return;
			}
			const editor = this.getMarkdownEditor(path);
			// 文件已在计时器触发前关闭：取消写入，不向已关闭的文件写入。
			if (!editor) {
				return;
			}
			this.renumberEditor(editor, "live");
		}, clampDebounce(this.settings.debounceMs));
		this.debounceTimers.set(path, timer);
	}

	/**
	 * 对给定编辑器执行一次重新编号，以单一事务写回（一步撤销、保留未变行的光标）。
	 * 当 frontmatter 将该文件设为 OFF、或无需改动时不写入。
	 * @returns 是否实际写入了改动。
	 */
	private renumberEditor(editor: Editor, mode: RenumberMode): boolean {
		const content = editor.getValue();
		if (parseAutoHeadingsSwitch(content) === "OFF") {
			return false;
		}
		const edits = computeHeadingEdits(content, DEFAULT_TEMPLATE, { mode });
		if (edits.length === 0) {
			return false;
		}
		editor.transaction({
			changes: edits.map((edit) => ({
				from: { line: edit.lineIndex, ch: 0 },
				to: { line: edit.lineIndex, ch: editor.getLine(edit.lineIndex).length },
				text: edit.newText,
			})),
		});
		return true;
	}

	/** 在所有打开的 Markdown 叶子中查找显示指定文件的编辑器；找不到返回 null。 */
	private getMarkdownEditor(path: string): Editor | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === path) {
				return view.editor;
			}
		}
		return null;
	}
}
