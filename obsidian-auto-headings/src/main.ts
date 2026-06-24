import { Notice, Plugin } from "obsidian";
import { AutoHeadingsSettings, DEFAULT_SETTINGS } from "./settings";
import { AutoHeadingsSettingTab } from "./settings/SettingsTab";

/**
 * obsidian-auto-headings 插件入口。
 *
 * Milestone 0：最小化加载/卸载、设置持久化、设置页面骨架，以及与面板开关
 * 双向同步的全局切换命令。核心解析、计数、写入等逻辑将在后续里程碑实现。
 */
export default class AutoHeadingsPlugin extends Plugin {
	settings: AutoHeadingsSettings = { ...DEFAULT_SETTINGS };

	private settingTab!: AutoHeadingsSettingTab;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.settingTab = new AutoHeadingsSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.addCommand({
			id: "toggle-auto-headings",
			name: "切换自动编号（全局）",
			callback: async () => {
				await this.setEnabled(!this.settings.enabled);
				new Notice(this.settings.enabled ? "已启用自动编号" : "已禁用自动编号");
			},
		});
	}

	onunload(): void {
		// Milestone 0 暂无需清理的资源；防抖计时器等将在后续里程碑加入。
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
}
