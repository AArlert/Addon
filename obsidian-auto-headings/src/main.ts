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
import { renumberContent, type Template } from "./numbering";
import { TemplateStore } from "./templates/TemplateStore";

/**
 * obsidian-auto-headings 插件入口。
 *
 * Milestone 2：editor onChange 监听 + 各文件防抖计时器；以单一事务整文件重写回编辑器；
 * 「立即重新编号」命令；面板全局开关 ↔ 全局命令双向同步；读取 frontmatter 单文件开关。
 * 注：插件**永不改写标题层级**，多个 H1 按各模板的「起始编号层级」处理（见 numbering.ts）。
 *
 * Milestone 3：接入 {@link TemplateStore}（首次启用自动创建 templates/default.json）；
 * 编号改用 {@link getActiveTemplate} 返回的全局默认模板（GUI 编辑即时生效）。
 * 白名单匹配（M4）与按路径选模板（M5）见后续里程碑。
 */
export default class AutoHeadingsPlugin extends Plugin {
	settings: AutoHeadingsSettings = { ...DEFAULT_SETTINGS };

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

		// 全局切换命令：与面板开关双向同步（统一经由 setEnabled）。
		this.addCommand({
			id: "toggle-auto-headings",
			name: "切换自动编号（全局）",
			callback: async () => {
				await this.setEnabled(!this.settings.enabled);
				new Notice(this.settings.enabled ? "已启用自动编号" : "已禁用自动编号");
			},
		});

		// 立即重新编号：绕过防抖，对当前文件执行一次完整重新编号。
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

	/**
	 * 返回当前用于编号的模板。
	 *
	 * Milestone 3 暂以全局默认模板（「默认」）作用于所有文件；按路径选用不同模板的
	 * 解析逻辑在 Milestone 5 加入。在 GUI 中编辑「默认」模板会即时改变编号行为。
	 */
	getActiveTemplate(): Template {
		return this.templateStore.getDefault();
	}

	/**
	 * 重命名模板，并同步更新 `data.json` 中引用该模板名的路径规则（路径规则见
	 * Milestone 5；当前尚无规则，故仅做模板文件改名）。
	 *
	 * @returns 重命名是否成功（名称冲突、为空或为默认模板时失败）。
	 */
	async renameTemplate(oldName: string, newName: string): Promise<boolean> {
		const ok = await this.templateStore.rename(oldName, newName);
		// 路径规则引用的同步更新预留给 Milestone 5（届时遍历 settings 中的规则改名）。
		return ok;
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
			this.applyRenumber(editor);
		}, this.settings.debounceDelay);

		this.debounceTimers.set(path, timer);
	}

	/**
	 * 「立即重新编号」命令的处理：绕过防抖，立即对当前编辑器执行一次完整重新编号。
	 * 仍遵守生效判定（全局开关、frontmatter）。
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

		const changed = this.applyRenumber(editor);
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
	private applyRenumber(editor: Editor): boolean {
		const oldContent = editor.getValue();

		// 单文件开关：frontmatter 显式 OFF 时不处理。
		if (isDisabledByFrontmatter(oldContent)) {
			return false;
		}

		const newContent = renumberContent(oldContent, this.getActiveTemplate());
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
