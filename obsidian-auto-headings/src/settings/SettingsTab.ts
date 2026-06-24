import { App, PluginSettingTab, Setting } from "obsidian";
import type AutoHeadingsPlugin from "../main";

/**
 * 设置页面骨架。
 *
 * Milestone 0 仅提供面板顶部的「启用自动编号」全局开关。模板编辑器、
 * 白名单编辑器、路径规则管理器与防抖延迟滑块等将在后续里程碑中加入。
 */
export class AutoHeadingsSettingTab extends PluginSettingTab {
	private readonly plugin: AutoHeadingsPlugin;

	constructor(app: App, plugin: AutoHeadingsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("启用自动编号")
			.setDesc("控制整个插件是否对任何文件生效。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
					await this.plugin.setEnabled(value);
				}),
			);
	}
}
