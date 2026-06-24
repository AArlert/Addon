import {
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	Notice,
	Plugin,
	type EditorChange,
} from "obsidian";
import { AutoHeadingsSettings, DEFAULT_SETTINGS, clampDebounceDelay } from "./settings";
import { AutoHeadingsSettingTab } from "./settings/SettingsTab";
import { isDisabledByFrontmatter } from "./frontmatter";
import { DEFAULT_TEMPLATE, RenumberMode, renumberContent } from "./numbering";

/**
 * obsidian-auto-headings 插件入口。
 *
 * Milestone 2：editor onChange 监听 + 各文件防抖计时器；H1 双模式降级；以单一事务
 * 整文件重写回编辑器；「立即重新编号」命令（格式化模式）；面板全局开关 ↔ 全局命令
 * 双向同步；读取 frontmatter 单文件开关。模板系统仍使用内置硬编码默认模板
 * （DEFAULT_TEMPLATE），完整模板/白名单/路径配置见后续里程碑。
 */
export default class AutoHeadingsPlugin extends Plugin {
	settings: AutoHeadingsSettings = { ...DEFAULT_SETTINGS };

	private settingTab!: AutoHeadingsSettingTab;

	/** 以文件路径为键的防抖计时器；编辑另一个笔记不会取消当前笔记的待处理更新。 */
	private readonly debounceTimers = new Map<string, number>();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.settingTab = new AutoHeadingsSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		// 全局切换命令：与面板开关双向同步（统一经由 setEnabled）。
		this.addCommand({
			id: "toggle-auto-headings",
			name: "切换自动编号（全局）",
			callback: async () => {
				await this.setEnabled(!this.settings.enabled);
				new Notice(this.settings.enabled ? "已启用自动编号" : "已禁用自动编号");
			},
		});

		// 立即重新编号：绕过防抖，对当前文件执行一次完整格式化（H1 级联降级）。
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
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		this.settings.debounceDelay = clampDebounceDelay(this.settings.debounceDelay);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * 实时编辑触发：重置该文件的防抖计时器；到期后以**实时模式**重新编号
	 * （H1 仅改本行，不级联）。计时器以文件路径为单位互相独立。
	 */
	private scheduleRenumber(editor: Editor, info: MarkdownView | MarkdownFileInfo): void {
		const file = info.file;
		if (!file) {
			return;
		}
		// 全局开关关闭时不安排任何更新。
		if (!this.settings.enabled) {
			return;
		}

		const path = file.path;
		const existing = this.debounceTimers.get(path);
		if (existing !== undefined) {
			window.clearTimeout(existing);
		}

		const timer = window.setTimeout(() => {
			this.debounceTimers.delete(path);
			// 计时器到期时再次校验生效条件（其间用户可能已关闭全局开关）。
			if (!this.settings.enabled) {
				return;
			}
			this.applyRenumber(editor, "live");
		}, this.settings.debounceDelay);

		this.debounceTimers.set(path, timer);
	}

	/**
	 * 「立即重新编号」命令的处理：绕过防抖，以**格式化模式**（H1 级联降级）
	 * 立即对当前编辑器执行一次完整重新编号。仍遵守生效判定（全局开关、frontmatter）。
	 */
	private runImmediateRenumber(editor: Editor, ctx: MarkdownView | MarkdownFileInfo): void {
		if (!this.settings.enabled) {
			new Notice("自动编号已全局禁用，未执行");
			return;
		}
		// 若有待处理的实时更新，先取消，避免随后重复触发。
		const path = ctx.file?.path;
		if (path) {
			const existing = this.debounceTimers.get(path);
			if (existing !== undefined) {
				window.clearTimeout(existing);
				this.debounceTimers.delete(path);
			}
		}

		const changed = this.applyRenumber(editor, "format");
		new Notice(changed ? "已重新编号" : "无需改动");
	}

	/**
	 * 对给定编辑器执行一次重新编号，并以**单一事务**写回变化的行。
	 *
	 * - 受 frontmatter 单文件开关约束：值为 `OFF` 时跳过（不处理）。
	 * - 仅当内容确有变化时才发起事务，避免无谓的撤销记录与光标抖动。
	 * - 整文件重写永不增删行，故按行索引逐行比较即可定位变化。
	 *
	 * @returns 是否实际写入了改动。
	 */
	private applyRenumber(editor: Editor, mode: RenumberMode): boolean {
		const oldContent = editor.getValue();

		// 单文件开关：frontmatter 显式 OFF 时不处理。
		if (isDisabledByFrontmatter(oldContent)) {
			return false;
		}

		const newContent = renumberContent(oldContent, DEFAULT_TEMPLATE, { mode });
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
