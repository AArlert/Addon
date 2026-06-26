import { App, PluginSettingTab, Setting } from "obsidian";
import type AutoHeadingsPlugin from "../main";
import { normalizeTopLevel, type NumeralStyle, previewLevel, type Template } from "../numbering";
import { DEFAULT_TEMPLATE_NAME, LEVEL_KEYS, type LevelKey } from "../templates/schema";

/** 序号样式下拉的选项（值 → 中文标签，含示例字形）。 */
const NUMERAL_OPTIONS: Record<NumeralStyle, string> = {
	arabic: "阿拉伯 (1, 2, 3)",
	cjk: "中文 (一, 二, 三)",
	circled: "带圈 (①, ②, ③)",
	"lower-alpha": "小写字母 (a, b, c)",
	"upper-alpha": "大写字母 (A, B, C)",
};

/**
 * 设置页面（Milestone 3：模板系统）。
 *
 * 顶部为面板全局开关；其下为模板区：
 * - 「+ 新增模板」按钮新增模板；
 * - 每个模板一行，右侧有「删除」（默认模板禁用）与「编辑」按钮；
 * - 「编辑」向下展开行内面板：起始编号层级下拉 + H1–H6 六行 × 六列（前缀 / 序号 /
 *   序号间隔符 / 后缀 / 标题间隔符 / 继承前级）+ 跳级占位策略，附实时预览；
 *   低于起始层级的行置灰；非默认模板可在面板内改名。
 *
 * 白名单编辑器与路径规则管理器分别在 Milestone 4 / 5 加入。
 */
export class AutoHeadingsSettingTab extends PluginSettingTab {
	private readonly plugin: AutoHeadingsPlugin;

	/** 当前展开编辑面板的模板名（null 表示全部折叠）。 */
	private expandedTemplate: string | null = null;

	constructor(app: App, plugin: AutoHeadingsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// —— 版本号（右上角，低调但清晰）——
		containerEl.createDiv({
			cls: "ah-version",
			text: `v${this.plugin.manifest.version}`,
		});

		// —— 全局开关 ——
		new Setting(containerEl)
			.setName("启用自动编号")
			.setDesc("控制整个插件是否对任何文件生效。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
					await this.plugin.setEnabled(value);
				}),
			);

		// —— 模板区 ——
		new Setting(containerEl).setName("模板").setHeading();
		containerEl.createEl("p", {
			cls: "ah-section-desc",
			text: "为各级标题（H2–H6）定义编号的显示格式。当前「默认」模板用于所有文件；按路径选用不同模板将在后续版本加入。",
		});

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("+ 新增模板")
				.setCta()
				.onClick(async () => {
					const created = await this.plugin.templateStore.create();
					this.expandedTemplate = created.name; // 新建后自动展开。
					this.display();
				}),
		);

		const listEl = containerEl.createDiv({ cls: "ah-template-list" });
		for (const template of this.plugin.templateStore.all()) {
			this.renderTemplateRow(listEl, template);
		}
	}

	/** 渲染单个模板的行（标题行 + 可展开编辑面板）。 */
	private renderTemplateRow(parent: HTMLElement, template: Template): void {
		const isDefault = template.name === DEFAULT_TEMPLATE_NAME;
		const expanded = this.expandedTemplate === template.name;

		const rowEl = parent.createDiv({ cls: "ah-template-row" });

		// —— 标题行 ——
		const header = new Setting(rowEl).setName(template.name);
		if (isDefault) {
			header.setDesc("内置默认模板，不可删除；可编辑。");
		}

		header.addExtraButton((btn) =>
			btn
				.setIcon(expanded ? "chevron-down" : "chevron-right")
				.setTooltip(expanded ? "折叠" : "编辑")
				.onClick(() => {
					this.expandedTemplate = expanded ? null : template.name;
					this.display();
				}),
		);

		header.addButton((btn) => {
			btn.setButtonText("删除").setWarning();
			if (isDefault) {
				btn.setDisabled(true);
				btn.setTooltip("默认模板不可删除");
			} else {
				btn.onClick(async () => {
					await this.plugin.templateStore.delete(template.name);
					if (this.expandedTemplate === template.name) {
						this.expandedTemplate = null;
					}
					this.display();
				});
			}
			return btn;
		});

		// —— 展开的编辑面板 ——
		if (expanded) {
			this.renderEditPanel(rowEl, template, isDefault);
		}
	}

	/** 渲染某模板的行内编辑面板：可选改名 + 五级×五列网格 + 实时预览。 */
	private renderEditPanel(parent: HTMLElement, template: Template, isDefault: boolean): void {
		const panel = parent.createDiv({ cls: "ah-edit-panel" });

		// 改名（默认模板名固定，不提供）。
		if (!isDefault) {
			new Setting(panel)
				.setName("模板名称")
				.setDesc("重命名后将自动更新对应的模板文件。")
				.addText((text) => {
					text.setValue(template.name);
					const commit = async () => {
						const next = text.getValue().trim();
						if (next === "" || next === template.name) {
							text.setValue(template.name); // 还原非法/未变更输入。
							return;
						}
						const ok = await this.plugin.renameTemplate(template.name, next);
						if (ok) {
							this.expandedTemplate = next;
						}
						this.display();
					};
					// 失焦或回车时提交，避免逐键创建中间文件。
					text.inputEl.addEventListener("blur", commit);
					text.inputEl.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							text.inputEl.blur();
						}
					});
				});
		}

		// —— 起始编号层级（下拉，每个模板各自决定）——
		const top = normalizeTopLevel(template.topLevel);
		new Setting(panel)
			.setName("起始编号层级")
			.setDesc(
				"从哪一级标题开始编号：比它浅的标题不编号、也不会被改写（如默认 H2：H1 作标题/分节，多个 H1 各自原样保留）。它及更深的标题正常编号，并以它为序号第一段。",
			)
			.addDropdown((dd) => {
				for (let l = 1; l <= 6; l++) {
					dd.addOption(String(l), `H${l}`);
				}
				dd.setValue(String(top)).onChange(async (value) => {
					template.topLevel = normalizeTopLevel(Number(value));
					await this.plugin.templateStore.save(template);
					this.plugin.renumberActiveFile();
					this.display(); // 重新渲染以更新各级行的「生效/置灰」与预览。
				});
			});

		// 网格表头（列序：级别 → 前缀 → 序号 → 序号间隔符 → 后缀 → 标题间隔符 → 继承前级 → 预览）。
		const grid = panel.createDiv({ cls: "ah-grid" });
		const headRow = grid.createDiv({ cls: "ah-grid-row ah-grid-head" });
		for (const label of [
			"级别",
			"前缀",
			"序号",
			"序号间隔符",
			"后缀",
			"标题间隔符",
			"继承前级",
			"预览",
		]) {
			headRow.createDiv({ cls: "ah-grid-cell", text: label });
		}

		// 每级一行（H1–H6）。低于起始编号层级的行置灰，表示当前不参与编号。
		const previewEls = new Map<LevelKey, HTMLElement>();
		LEVEL_KEYS.forEach((key, i) => {
			const level = i + 1;
			const fmt = template.levels[key];
			const inactive = level < top;
			const row = grid.createDiv({
				cls: inactive ? "ah-grid-row ah-grid-row-inactive" : "ah-grid-row",
			});

			row.createDiv({ cls: "ah-grid-cell ah-level-label", text: `H${level}` });

			// 前缀。
			this.textCell(row, fmt.prefix, "前缀", async (v) => {
				fmt.prefix = v;
				await this.saveAndPreview(template, level, key, previewEls);
			});

			// 序号样式下拉。
			const numCell = row.createDiv({ cls: "ah-grid-cell" });
			const select = numCell.createEl("select", { cls: "dropdown" });
			(Object.keys(NUMERAL_OPTIONS) as NumeralStyle[]).forEach((style) => {
				const opt = select.createEl("option", {
					value: style,
					text: NUMERAL_OPTIONS[style],
				});
				if (style === fmt.numeral) {
					opt.selected = true;
				}
			});
			select.addEventListener("change", async () => {
				fmt.numeral = select.value as NumeralStyle;
				await this.saveAndPreview(template, level, key, previewEls);
			});

			// 序号间隔符。
			this.textCell(row, fmt.numberSeparator, ".", async (v) => {
				fmt.numberSeparator = v;
				await this.saveAndPreview(template, level, key, previewEls);
			});

			// 后缀（序号之后、标题间隔符之前，如「章」「节」）。
			this.textCell(row, fmt.suffix, "后缀", async (v) => {
				fmt.suffix = v;
				await this.saveAndPreview(template, level, key, previewEls);
			});

			// 标题间隔符。
			this.textCell(row, fmt.titleSeparator, "空格", async (v) => {
				fmt.titleSeparator = v;
				await this.saveAndPreview(template, level, key, previewEls);
			});

			// 继承前级勾选框。
			const inheritCell = row.createDiv({ cls: "ah-grid-cell ah-inherit-cell" });
			const checkbox = inheritCell.createEl("input", { type: "checkbox" });
			checkbox.checked = fmt.inherit;
			checkbox.addEventListener("change", async () => {
				fmt.inherit = checkbox.checked;
				await this.saveAndPreview(template, level, key, previewEls);
			});

			// 预览。
			const previewCell = row.createDiv({ cls: "ah-grid-cell ah-preview-cell" });
			previewCell.setText(this.previewText(template, level));
			previewEls.set(key, previewCell);
		});

		// —— 跳级缺失层级的占位策略（每个模板各自决定）——
		const skipFill = template.skipFill;
		new Setting(panel)
			.setName("跳级缺失层级")
			.setDesc(
				"标题跳级时（如 H3 后直接跟 H5），缺失的中间层级如何呈现：补位则保留一段并填入下方占位符（H5 得四段）；不补位则省略该段（H5 呈现为三段、与 H4 同形）。",
			)
			.addDropdown((dd) =>
				dd
					.addOption("fill", "补位")
					.addOption("drop", "不补位（省略该段）")
					.setValue(skipFill.mode)
					.onChange(async (value) => {
						template.skipFill =
							value === "drop"
								? { mode: "drop" }
								: {
										mode: "fill",
										placeholder:
											skipFill.mode === "fill" ? skipFill.placeholder : "0",
									};
						await this.plugin.templateStore.save(template);
						this.plugin.renumberActiveFile();
						this.display(); // 重新渲染以显示/隐藏占位输入框。
					}),
			);

		if (skipFill.mode === "fill") {
			new Setting(panel)
				.setName("占位字符")
				.setDesc(
					"补位时填入缺失层级的文本，仅限数字（如 0 得 1.1.0.1、1 得 1.1.1.1）；非数字会被自动滤除、留空按 0 处理。限数字是为确保编号始终能被干净剥离、不重复叠加。",
				)
				.addText((text) =>
					text
						.setPlaceholder("0")
						.setValue(skipFill.placeholder)
						.onChange(async (value) => {
							// 仅保留数字，并即时回写输入框（滤除非法字符）。
							const digits = value.replace(/\D/g, "");
							if (digits !== value) {
								text.setValue(digits);
							}
							template.skipFill = { mode: "fill", placeholder: digits };
							await this.plugin.templateStore.save(template);
							this.plugin.renumberActiveFile();
						}),
				);
		}

		// 白名单（Milestone 4）占位提示。
		panel.createEl("p", {
			cls: "ah-section-desc",
			text: "白名单编辑器将在后续里程碑加入；现有白名单条目会被保留。",
		});
	}

	/** 创建一个文本输入单元格，封装 onChange。 */
	private textCell(
		row: HTMLElement,
		value: string,
		placeholder: string,
		onChange: (value: string) => void | Promise<void>,
	): void {
		const cell = row.createDiv({ cls: "ah-grid-cell" });
		const input = cell.createEl("input", { type: "text", cls: "ah-text-input" });
		input.value = value;
		input.placeholder = placeholder;
		input.addEventListener("input", () => {
			void onChange(input.value);
		});
	}

	/** 保存模板并刷新该级的预览文本。 */
	private async saveAndPreview(
		template: Template,
		level: number,
		key: LevelKey,
		previewEls: Map<LevelKey, HTMLElement>,
	): Promise<void> {
		const el = previewEls.get(key);
		if (el) {
			el.setText(this.previewText(template, level));
		}
		await this.plugin.templateStore.save(template);
		// 模板改动后立即对当前活动文件重新编号，使格式调整即时可见（修复「调整后没更新」）。
		this.plugin.renumberActiveFile();
	}

	/** 计算某级的预览字符串（取前三个同级序号示例）；低于起始编号层级时显示「（不编号）」。 */
	private previewText(template: Template, level: number): string {
		if (level < normalizeTopLevel(template.topLevel)) {
			return "（不编号）";
		}
		const samples = previewLevel(template, level);
		return samples.map((s) => `${s}标题`).join("    ");
	}
}
