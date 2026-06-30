import { App, Modal, PluginSettingTab, Setting } from "obsidian";
import type AutoHeadingsPlugin from "../main";
import type { Messages } from "../i18n";
import {
	type AncestorNumeral,
	analyzeWhitelist,
	normalizeAncestorNumeral,
	normalizeBottomLevel,
	normalizeTopLevel,
	type NumeralStyle,
	previewLevel,
	type Template,
	type WhitelistEntry,
} from "../numbering";
import { hasRootRule, type PathRule } from "../pathrules";
import { DEBOUNCE_DEFAULT, DEBOUNCE_MAX, DEBOUNCE_MIN, clampDebounceDelay } from "../settings";
import { DEFAULT_TEMPLATE_NAME, LEVEL_KEYS, type LevelKey } from "../templates/schema";

/** 序号样式下拉的固定遍历顺序。 */
const NUMERAL_ORDER: NumeralStyle[] = [
	"arabic",
	"cjk",
	"circled",
	"lower-alpha",
	"upper-alpha",
	"lower-roman",
	"upper-roman",
];

/** 白名单匹配方式下拉的固定遍历顺序。 */
const MATCH_ORDER: WhitelistEntry["match"][] = ["exact", "partial", "subtree"];

/** 取序号样式在当前语言下的下拉标签（含示例字形）。 */
function numeralLabel(style: NumeralStyle, t: Messages): string {
	switch (style) {
		case "arabic":
			return t.numeralArabic;
		case "cjk":
			return t.numeralCjk;
		case "circled":
			return t.numeralCircled;
		case "lower-alpha":
			return t.numeralLowerAlpha;
		case "upper-alpha":
			return t.numeralUpperAlpha;
		case "lower-roman":
			return t.numeralLowerRoman;
		case "upper-roman":
			return t.numeralUpperRoman;
	}
}

/** 取白名单匹配方式在当前语言下的下拉标签。 */
function matchLabel(match: WhitelistEntry["match"], t: Messages): string {
	switch (match) {
		case "exact":
			return t.matchExact;
		case "partial":
			return t.matchPartial;
		case "subtree":
			return t.matchSubtree;
	}
}

/** 删模板对话框里「连规则一并删除」的下拉哨兵值（不会与任何模板名冲突）。 */
const DELETE_RULES_SENTINEL = " __delete_rules__";

/**
 * 设置页面。
 *
 * 顶部为**语言选择**与「全局自动编号」面板开关；其下为**路径规则**区（Milestone 5）与**模板**区：
 * - 路径规则区：可视化表格（路径模式 → 模板），可增删、可拖拽排序，附**分层路径补全**（输入 `/`
 *   先给根与第一层，逐层展开）、每行**清空输入**按钮与「无根规则」兜底提示；列表可滚动。
 * - 模板区：「+ 新增模板」、每个模板一行（删除 / 编辑）、行内展开编辑面板（H1–H6 × 六列 +
 *   起始 / 结束编号层级 + 跳级占位 + 祖先序号渲染 + 白名单编辑器）。
 *
 * 底部「危险区域」（清除全库编号）**默认折叠**，点击标题展开。
 * 全部界面文案经 {@link Messages} 中英双语（Milestone 6），由 `settings.language` 决定。
 */
export class AutoHeadingsSettingTab extends PluginSettingTab {
	private readonly plugin: AutoHeadingsPlugin;

	/** 当前展开编辑面板的模板名（null 表示全部折叠）。 */
	private expandedTemplate: string | null = null;

	/** 「危险区域」是否展开（默认折叠，见 spec.md §3.10）。 */
	private dangerExpanded = false;

	constructor(app: App, plugin: AutoHeadingsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** 当前界面语言的文案表（随 `settings.language` 实时解析）。 */
	private get t(): Messages {
		return this.plugin.messages();
	}

	display(): void {
		const { containerEl } = this;
		const t = this.t;
		containerEl.empty();

		// —— 版本号（右上角，低调但清晰）——
		containerEl.createDiv({
			cls: "ah-version",
			text: `v${this.plugin.manifest.version}`,
		});

		// —— 语言选择（Milestone 6）——
		new Setting(containerEl)
			.setName(t.languageName)
			.setDesc(t.languageDesc)
			.addDropdown((dd) => {
				dd.addOption("auto", t.langAuto);
				dd.addOption("zh", t.langZh);
				dd.addOption("en", t.langEn);
				dd.setValue(this.plugin.settings.language).onChange(async (value) => {
					this.plugin.settings.language = (
						value === "zh" || value === "en" ? value : "auto"
					) as typeof this.plugin.settings.language;
					await this.plugin.saveSettings();
					this.display(); // 立即用新语言重绘面板。
				});
			});

		// —— 全局自动编号开关（两层开关的「面板层」，见 spec.md §3.1）——
		new Setting(containerEl)
			.setName(t.autoNumberName)
			.setDesc(t.autoNumberDesc)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoNumber).onChange(async (value) => {
					await this.plugin.setAutoNumber(value);
				}),
			);

		// —— 防抖延迟（滑块，M6，见 spec.md §3.9）——
		new Setting(containerEl)
			.setName(t.debounceName)
			.setDesc(t.debounceDesc(DEBOUNCE_MIN, DEBOUNCE_MAX, DEBOUNCE_DEFAULT))
			.addSlider((slider) =>
				slider
					.setLimits(DEBOUNCE_MIN, DEBOUNCE_MAX, 50)
					.setValue(this.plugin.settings.debounceDelay)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.debounceDelay = clampDebounceDelay(value);
						await this.plugin.saveSettings();
					}),
			)
			.addExtraButton((btn) =>
				btn
					.setIcon("reset")
					.setTooltip(t.resetTooltip(DEBOUNCE_DEFAULT))
					.onClick(async () => {
						this.plugin.settings.debounceDelay = DEBOUNCE_DEFAULT;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		// —— Backlink 同步开关（M7，opt-in，默认关，见 spec.md §3.12）——
		new Setting(containerEl)
			.setName(t.updateBacklinksName)
			.setDesc(t.updateBacklinksDesc)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.updateBacklinks).onChange(async (value) => {
					this.plugin.settings.updateBacklinks = value;
					await this.plugin.saveSettings();
				}),
			);

		// —— 路径规则区（Milestone 5）——
		this.renderPathRules(containerEl);

		// —— 模板区 ——
		new Setting(containerEl).setName(t.templatesHeading).setHeading();
		containerEl.createEl("p", { cls: "ah-section-desc", text: t.templatesDesc });

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText(t.addTemplate)
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

		// —— 危险区域（默认折叠，见 spec.md §3.10）——
		this.renderDangerZone(containerEl);
	}

	/**
	 * 渲染路径规则区（见 spec.md §3.8）：可视化表格（路径模式 → 模板），可增删、可拖拽排序、可滚动；
	 * 顶部在「无 `/` 根规则且全局自动编号=开」时显示兜底缺失提示条与快捷添加按钮。
	 */
	private renderPathRules(containerEl: HTMLElement): void {
		const t = this.t;
		const rules = this.plugin.settings.pathRules;

		new Setting(containerEl).setName(t.pathRulesHeading).setHeading();
		containerEl.createEl("p", { cls: "ah-section-desc", text: t.pathRulesDesc });

		// —— 兜底缺失提示条 ——
		if (!hasRootRule(rules) && this.plugin.settings.autoNumber) {
			const warn = containerEl.createDiv({ cls: "ah-path-warn" });
			warn.createSpan({ text: t.pathNoRootWarn });
			new Setting(containerEl).addButton((btn) =>
				btn
					.setButtonText(t.addRootRule)
					.setCta()
					.onClick(async () => {
						rules.unshift({ pattern: "/", template: DEFAULT_TEMPLATE_NAME });
						await this.plugin.saveSettings();
						this.plugin.renumberActiveFile();
						this.display();
					}),
			);
		}

		new Setting(containerEl).addButton((btn) =>
			btn.setButtonText(t.addRule).onClick(async () => {
				rules.push({ pattern: "", template: DEFAULT_TEMPLATE_NAME });
				await this.plugin.saveSettings();
				this.display();
			}),
		);

		// —— 规则表格（可滚动；表头 sticky）——
		const table = containerEl.createDiv({ cls: "ah-path-table" });
		const head = table.createDiv({ cls: "ah-path-row ah-path-head" });
		for (const label of ["", "#", t.pathColPattern, t.pathColTemplate, ""]) {
			head.createDiv({ cls: "ah-path-cell", text: label });
		}

		if (rules.length === 0) {
			table.createEl("p", { cls: "ah-section-desc", text: t.pathEmpty });
		}

		rules.forEach((rule, index) => {
			this.renderPathRuleRow(table, rule, index);
		});
	}

	/** 渲染单条路径规则行（拖拽手柄 + 行号 + 路径输入[含清空] + 模板下拉 + 删除）。 */
	private renderPathRuleRow(table: HTMLElement, rule: PathRule, index: number): void {
		const t = this.t;
		const rules = this.plugin.settings.pathRules;
		const row = table.createDiv({ cls: "ah-path-row" });
		row.setAttr("draggable", "true");

		// 拖拽手柄（整行可拖；手柄仅作视觉提示）。
		row.createDiv({ cls: "ah-path-cell ah-path-handle", text: "⠿" });

		// 行号。
		row.createDiv({ cls: "ah-path-cell ah-path-index", text: String(index + 1) });

		// 路径模式输入（接**分层** datalist 补全 + 行内清空按钮）。
		const patternCell = row.createDiv({ cls: "ah-path-cell ah-path-pattern-cell" });
		const input = patternCell.createEl("input", { type: "text", cls: "ah-text-input" });
		input.value = rule.pattern;
		input.placeholder = t.pathInputPlaceholder;

		// 每行独立的 datalist，随输入分层更新（输入 `/` 先给根 + 第一层，逐层展开）。
		const datalist = patternCell.createEl("datalist") as HTMLDataListElement;
		datalist.id = `ah-path-suggest-${index}`;
		input.setAttr("list", datalist.id);
		this.updatePathDatalist(datalist, input.value);
		input.addEventListener("input", () => this.updatePathDatalist(datalist, input.value));

		const commitPattern = async () => {
			rule.pattern = input.value.trim();
			input.value = rule.pattern;
			await this.plugin.saveSettings();
			this.plugin.renumberActiveFile();
			this.display(); // 重新渲染以更新「兜底提示条」等。
		};
		input.addEventListener("blur", () => void commitPattern());
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				input.blur();
			}
		});

		// 清空此路径的小按钮（只清空输入框文本，不删除整条规则）。
		const clearBtn = patternCell.createEl("span", {
			cls: "ah-input-clear",
			text: "✕",
		});
		clearBtn.setAttr("aria-label", t.clearInputTooltip);
		clearBtn.title = t.clearInputTooltip;
		clearBtn.addEventListener("click", () => {
			input.value = "";
			this.updatePathDatalist(datalist, "");
			input.focus();
		});

		// 模板下拉。
		const tplCell = row.createDiv({ cls: "ah-path-cell" });
		const select = tplCell.createEl("select", { cls: "dropdown" });
		for (const tpl of this.plugin.templateStore.all()) {
			const opt = select.createEl("option", { value: tpl.name, text: tpl.name });
			if (tpl.name === rule.template) {
				opt.selected = true;
			}
		}
		// 规则引用的模板已不存在（理论上不应发生）时，补一个失效项以免静默改投。
		if (!this.plugin.templateStore.has(rule.template)) {
			const opt = select.createEl("option", {
				value: rule.template,
				text: t.templateMissingSuffix(rule.template),
			});
			opt.selected = true;
		}
		select.addEventListener("change", async () => {
			rule.template = select.value;
			await this.plugin.saveSettings();
			this.plugin.renumberActiveFile();
		});

		// 删除整条规则（无背景的 ✕，不再是被椭圆按钮包住的样式）。
		const delCell = row.createDiv({ cls: "ah-path-cell" });
		const del = delCell.createEl("span", { cls: "ah-path-del", text: "✕" });
		del.setAttr("aria-label", t.deleteRuleTooltip);
		del.title = t.deleteRuleTooltip;
		del.addEventListener("click", async () => {
			rules.splice(index, 1);
			await this.plugin.saveSettings();
			this.plugin.renumberActiveFile();
			this.display();
		});

		// —— 拖拽排序 ——
		row.addEventListener("dragstart", (e) => {
			e.dataTransfer?.setData("text/plain", String(index));
			row.addClass("ah-path-dragging");
		});
		row.addEventListener("dragend", () => row.removeClass("ah-path-dragging"));
		row.addEventListener("dragover", (e) => {
			e.preventDefault();
			row.addClass("ah-path-dragover");
		});
		row.addEventListener("dragleave", () => row.removeClass("ah-path-dragover"));
		row.addEventListener("drop", async (e) => {
			e.preventDefault();
			row.removeClass("ah-path-dragover");
			const from = Number(e.dataTransfer?.getData("text/plain"));
			if (!Number.isInteger(from) || from === index) {
				return;
			}
			const [moved] = rules.splice(from, 1);
			rules.splice(index, 0, moved);
			await this.plugin.saveSettings();
			this.plugin.renumberActiveFile();
			this.display();
		});
	}

	/**
	 * **分层**填充路径补全 `<datalist>`：仅列出当前输入所在目录的**直接子项**（输入 `/` 先给根与
	 * 第一层文件夹/文件，选定某文件夹后再出现其下一层），避免一次抛出全库路径让用户无从选择。
	 *
	 * 实现：取输入里最后一个 `/` 之前的部分为「基目录」`base`，列出 `path` 恰好落在 `base` 下一层
	 * 的文件夹（以 `/` 结尾）与文件；根（`base===""`）下额外补一个 `/` 选项。最多 50 项防溢出。
	 */
	private updatePathDatalist(datalist: HTMLDataListElement, inputValue: string): void {
		datalist.empty();
		const slash = inputValue.lastIndexOf("/");
		const base = slash >= 0 ? inputValue.slice(0, slash + 1) : "";

		const vault = this.plugin.app.vault as unknown as {
			getAllLoadedFiles?: () => Array<{ path: string; children?: unknown }>;
		};
		const all = vault.getAllLoadedFiles?.() ?? [];

		const options: string[] = [];
		if (base === "") {
			options.push("/"); // 根规则始终可选。
		}
		for (const f of all) {
			if (!f.path || f.path === "/") {
				continue;
			}
			// 仅取 base 的直接子项：path 须以 base 开头，且剩余部分不含更深的 `/`。
			if (!f.path.startsWith(base)) {
				continue;
			}
			const rest = f.path.slice(base.length);
			if (rest === "" || rest.includes("/")) {
				continue;
			}
			const isFolder = Array.isArray(f.children);
			options.push(isFolder ? `${f.path}/` : f.path);
		}

		for (const value of options.slice(0, 50)) {
			datalist.createEl("option", { value });
		}
	}

	/** 渲染单个模板的行（标题行 + 可展开编辑面板）。 */
	private renderTemplateRow(parent: HTMLElement, template: Template): void {
		const t = this.t;
		const isDefault = template.name === DEFAULT_TEMPLATE_NAME;
		const expanded = this.expandedTemplate === template.name;

		const rowEl = parent.createDiv({ cls: "ah-template-row" });

		// —— 标题行 ——
		const header = new Setting(rowEl).setName(template.name);
		if (isDefault) {
			header.setDesc(t.defaultTemplateDesc);
		}

		header.addExtraButton((btn) =>
			btn
				.setIcon(expanded ? "chevron-down" : "chevron-right")
				.setTooltip(expanded ? t.collapseTooltip : t.editTooltip)
				.onClick(() => {
					this.expandedTemplate = expanded ? null : template.name;
					this.display();
				}),
		);

		header.addButton((btn) => {
			btn.setButtonText(t.deleteBtn).setWarning();
			if (isDefault) {
				btn.setDisabled(true);
				btn.setTooltip(t.defaultCannotDelete);
			} else {
				btn.onClick(() => {
					void this.requestDeleteTemplate(template);
				});
			}
			return btn;
		});

		// —— 展开的编辑面板 ——
		if (expanded) {
			this.renderEditPanel(rowEl, template, isDefault);
		}
	}

	/**
	 * 删除模板：若**未被任何路径规则引用**则直接删除；否则弹出「知情确认 + 安全降级」对话框
	 * （列出受影响规则，可降级到「默认」/ 改投他模板 / 连规则一并删，见 spec.md §3.6）。
	 */
	private async requestDeleteTemplate(template: Template): Promise<void> {
		const affected = this.plugin.settings.pathRules.filter((r) => r.template === template.name);
		if (affected.length === 0) {
			await this.deleteTemplate(template.name);
			return;
		}
		new DeleteTemplateModal(this.plugin.app, template.name, affected, this).open();
	}

	/** 真正执行模板删除并刷新面板（收起其编辑面板）。 */
	async deleteTemplate(name: string): Promise<void> {
		await this.plugin.templateStore.delete(name);
		if (this.expandedTemplate === name) {
			this.expandedTemplate = null;
		}
		this.display();
	}

	/** 渲染某模板的行内编辑面板：可选改名 + 起始/结束层级 + 五级×五列网格 + 实时预览。 */
	private renderEditPanel(parent: HTMLElement, template: Template, isDefault: boolean): void {
		const t = this.t;
		const panel = parent.createDiv({ cls: "ah-edit-panel" });

		// 改名（默认模板名固定，不提供）。
		if (!isDefault) {
			new Setting(panel)
				.setName(t.templateNameName)
				.setDesc(t.templateNameDesc)
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

		const top = normalizeTopLevel(template.topLevel);
		const bottom = normalizeBottomLevel(template.bottomLevel);

		// —— 起始编号层级（下拉，每个模板各自决定）——
		new Setting(panel)
			.setName(t.topLevelName)
			.setDesc(t.topLevelDesc)
			.addDropdown((dd) => {
				for (let l = 1; l <= 6; l++) {
					dd.addOption(String(l), `H${l}`);
				}
				dd.setValue(String(top)).onChange(async (value) => {
					const next = normalizeTopLevel(Number(value));
					template.topLevel = next;
					// 保持 结束层级 ≥ 起始层级：起始抬高到结束之上时，把结束一并抬上去。
					if (normalizeBottomLevel(template.bottomLevel) < next) {
						template.bottomLevel = next;
					}
					await this.plugin.templateStore.save(template);
					this.plugin.renumberActiveFile();
					this.display(); // 重新渲染以更新各级行的「生效/置灰」与预览。
				});
			});

		// —— 结束编号层级（下拉，M6：编号区间下界，支持只编号 H2–H4 这样的区间）——
		new Setting(panel)
			.setName(t.bottomLevelName)
			.setDesc(t.bottomLevelDesc)
			.addDropdown((dd) => {
				// 只列 ≥ 起始层级 的选项，从根上避免配出空区间。
				for (let l = top; l <= 6; l++) {
					dd.addOption(String(l), `H${l}`);
				}
				dd.setValue(String(Math.max(bottom, top))).onChange(async (value) => {
					template.bottomLevel = normalizeBottomLevel(Number(value));
					await this.plugin.templateStore.save(template);
					this.plugin.renumberActiveFile();
					this.display();
				});
			});

		// —— 祖先序号渲染（下拉，每个模板各自决定）——
		const ancestorNumeral = normalizeAncestorNumeral(template.ancestorNumeral);
		new Setting(panel)
			.setName(t.ancestorName)
			.setDesc(t.ancestorDesc)
			.addDropdown((dd) => {
				dd.addOption("self", t.ancestorSelf);
				dd.addOption("arabic", t.ancestorArabic);
				dd.setValue(ancestorNumeral).onChange(async (value) => {
					template.ancestorNumeral = value as AncestorNumeral;
					await this.plugin.templateStore.save(template);
					this.plugin.renumberActiveFile();
					this.display(); // 重新渲染以更新各级预览。
				});
			});

		// 网格表头（列序：级别 → 前缀 → 序号 → 序号间隔符 → 后缀 → 标题间隔符 → 继承前级 → 预览）。
		const grid = panel.createDiv({ cls: "ah-grid" });
		const headRow = grid.createDiv({ cls: "ah-grid-row ah-grid-head" });
		for (const label of [
			t.colLevel,
			t.colPrefix,
			t.colNumeral,
			t.colNumberSep,
			t.colSuffix,
			t.colTitleSep,
			t.colInherit,
			t.colPreview,
		]) {
			headRow.createDiv({ cls: "ah-grid-cell", text: label });
		}

		// 每级一行（H1–H6）。在编号区间 [起始, 结束] 之外的行置灰，表示当前不参与编号。
		const previewEls = new Map<LevelKey, HTMLElement>();
		LEVEL_KEYS.forEach((key, i) => {
			const level = i + 1;
			const fmt = template.levels[key];
			const inactive = level < top || level > bottom;
			const row = grid.createDiv({
				cls: inactive ? "ah-grid-row ah-grid-row-inactive" : "ah-grid-row",
			});

			row.createDiv({ cls: "ah-grid-cell ah-level-label", text: `H${level}` });

			// 前缀。
			this.textCell(row, fmt.prefix, t.phPrefix, async (v) => {
				fmt.prefix = v;
				await this.saveAndPreview(template, level, key, previewEls);
			});

			// 序号样式下拉。
			const numCell = row.createDiv({ cls: "ah-grid-cell" });
			const select = numCell.createEl("select", { cls: "dropdown" });
			NUMERAL_ORDER.forEach((style) => {
				const opt = select.createEl("option", {
					value: style,
					text: numeralLabel(style, t),
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
			this.textCell(row, fmt.suffix, t.phSuffix, async (v) => {
				fmt.suffix = v;
				await this.saveAndPreview(template, level, key, previewEls);
			});

			// 标题间隔符。
			this.textCell(row, fmt.titleSeparator, t.phSpace, async (v) => {
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
			.setName(t.skipFillName)
			.setDesc(t.skipFillDesc)
			.addDropdown((dd) =>
				dd
					.addOption("fill", t.skipFillFill)
					.addOption("drop", t.skipFillDrop)
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
				.setName(t.placeholderName)
				.setDesc(t.placeholderDesc)
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

		// —— 白名单编辑器（Milestone 4，模板级）——
		this.renderWhitelistEditor(panel, template);
	}

	/**
	 * 渲染某模板的白名单编辑器（模板级配置，见 spec.md §3.7）。
	 *
	 * - 顶部输入框：键入词语后按 Enter 添加为一枚条目（默认「全部匹配」）；完全相同的 (词语, 匹配方式)
	 *   自动去重。
	 * - 每枚条目（chip）显示词语 + 匹配方式下拉（全部 / 部分 / 子树）+ 命中数角标 + ✕ 删除；当条目为
	 *   全部 / 部分且命中的标题含子标题时，附 ⚠ 提示引导改用子树（见 testplan D5）。
	 * - 底部针对**当前活动文件**实时列出「本白名单将豁免的标题」（命中数 + 标题清单）。
	 */
	private renderWhitelistEditor(panel: HTMLElement, template: Template): void {
		const t = this.t;
		const section = panel.createDiv({ cls: "ah-whitelist" });

		new Setting(section).setName(t.whitelistName).setDesc(t.whitelistDesc);

		// —— 添加输入框 ——
		const inputRow = section.createDiv({ cls: "ah-wl-input-row" });
		const input = inputRow.createEl("input", { type: "text", cls: "ah-wl-input" });
		input.placeholder = t.wlInputPlaceholder;
		const addEntry = async () => {
			const text = input.value.trim();
			if (text === "") {
				return;
			}
			// 去重：完全相同的 (词语, 匹配方式=全部) 不重复添加。
			const exists = template.whitelist.some((e) => e.text === text && e.match === "exact");
			if (!exists) {
				template.whitelist.push({ text, match: "exact" });
				await this.plugin.templateStore.save(template);
				this.plugin.renumberActiveFile();
			}
			input.value = "";
			this.display();
		};
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void addEntry();
			}
		});

		// —— 已有条目（chips）——
		const affixes = this.plugin.strippableAffixes();
		const headings = this.plugin.currentFileHeadings();
		const analysis = analyzeWhitelist(headings, template, {
			strippablePrefixes: affixes.prefixes,
			strippableSuffixes: affixes.suffixes,
		});
		const chipsEl = section.createDiv({ cls: "ah-wl-chips" });
		if (template.whitelist.length === 0) {
			chipsEl.createEl("span", { cls: "ah-section-desc", text: t.wlEmpty });
		}
		template.whitelist.forEach((entry, index) => {
			const hit = analysis.perEntry[index];
			const chip = chipsEl.createDiv({ cls: "ah-wl-chip" });
			chip.createEl("span", { cls: "ah-wl-chip-text", text: entry.text });

			// 匹配方式下拉。
			const select = chip.createEl("select", { cls: "dropdown ah-wl-chip-match" });
			MATCH_ORDER.forEach((m) => {
				const opt = select.createEl("option", { value: m, text: matchLabel(m, t) });
				if (m === entry.match) {
					opt.selected = true;
				}
			});
			select.addEventListener("change", async () => {
				entry.match = select.value as WhitelistEntry["match"];
				await this.plugin.templateStore.save(template);
				this.plugin.renumberActiveFile();
				this.display();
			});

			// 命中数角标。
			chip.createEl("span", {
				cls: "ah-wl-chip-count",
				text: String(hit?.count ?? 0),
			});

			// ⚠ 含子标题告警（全部 / 部分命中却含子标题，应改用子树）。
			if (hit?.warnHasChildren) {
				const warn = chip.createEl("span", { cls: "ah-wl-chip-warn", text: "⚠" });
				warn.title = t.wlChipWarnTitle;
			}

			// ✕ 删除。
			const del = chip.createEl("span", { cls: "ah-wl-chip-del", text: "✕" });
			del.addEventListener("click", async () => {
				template.whitelist.splice(index, 1);
				await this.plugin.templateStore.save(template);
				this.plugin.renumberActiveFile();
				this.display();
			});
		});

		// —— 模板不一致警示（修复 WL-int：预览用「正在编辑的模板」，但文件实际按路径规则解析到的
		// 可能是另一个模板；不提示会让「预览说豁免、文件却被编号」显得是 bug，见 testplan §3.3）——
		if (headings.length > 0) {
			const appliedTpl = this.plugin.getTemplateForFile(this.plugin.currentFilePath());
			if (!appliedTpl) {
				section.createEl("p", {
					cls: "ah-section-desc ah-wl-mismatch",
					text: t.wlPreviewNoTemplate,
				});
			} else if (appliedTpl.name !== template.name) {
				section.createEl("p", {
					cls: "ah-section-desc ah-wl-mismatch",
					text: t.wlPreviewOtherTemplate(appliedTpl.name),
				});
			}
		}

		// —— 当前文件实时命中预览 ——
		const preview = section.createEl("p", { cls: "ah-section-desc ah-wl-preview" });
		if (headings.length === 0) {
			preview.setText(t.wlPreviewNoFile);
		} else if (analysis.exempted.length === 0) {
			preview.setText(t.wlPreviewNone);
		} else {
			const titles = analysis.exempted.map((h) => h.text).join(" · ");
			preview.setText(t.wlPreviewSome(analysis.exempted.length, titles));
		}
	}

	/**
	 * 渲染「危险区域」（**默认折叠**，见 spec.md §3.10）：点击标题展开后才显示「清除全库编号」。
	 * 折叠默认值降低误触全库改动的风险。
	 */
	private renderDangerZone(containerEl: HTMLElement): void {
		const t = this.t;
		const heading = new Setting(containerEl).setName(t.dangerHeading).setHeading();
		if (!this.dangerExpanded) {
			heading.setDesc(t.dangerExpandHint);
		}
		heading.addExtraButton((btn) =>
			btn
				.setIcon(this.dangerExpanded ? "chevron-down" : "chevron-right")
				.setTooltip(this.dangerExpanded ? t.collapseTooltip : t.editTooltip)
				.onClick(() => {
					this.dangerExpanded = !this.dangerExpanded;
					this.display();
				}),
		);
		// 标题整体可点击切换展开。
		heading.settingEl.addClass("ah-danger-heading");
		heading.nameEl.addEventListener("click", () => {
			this.dangerExpanded = !this.dangerExpanded;
			this.display();
		});

		if (!this.dangerExpanded) {
			return;
		}

		new Setting(containerEl)
			.setName(t.clearVaultName)
			.setDesc(t.clearVaultDesc)
			.addButton((btn) =>
				btn
					.setButtonText(t.clearVaultBtn)
					.setWarning()
					.onClick(() => {
						new ClearVaultModal(this.app, this.plugin).open();
					}),
			);
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

	/** 计算某级的预览字符串（取前三个同级序号示例）；在编号区间之外时显示「（不编号）」。 */
	private previewText(template: Template, level: number): string {
		const top = normalizeTopLevel(template.topLevel);
		const bottom = normalizeBottomLevel(template.bottomLevel);
		if (level < top || level > bottom) {
			return this.t.previewInactive;
		}
		const samples = previewLevel(template, level);
		const word = this.t.previewHeadingWord;
		return samples.map((s) => `${s}${word}`).join("    ");
	}
}

/**
 * 删除被路径规则引用的模板时的「知情确认 + 安全降级」对话框（见 spec.md §3.6）。
 *
 * 列出受影响的全部路径规则，并让用户选择删除后这些规则的去向：降级到「默认」（缺省）/ 改投他模板 /
 * 连同这些规则一并删除。确认后先按选择改写 / 删除规则，再删除模板，最后刷新设置面板。
 */
class DeleteTemplateModal extends Modal {
	private readonly templateName: string;
	private readonly affected: PathRule[];
	private readonly tab: AutoHeadingsSettingTab;
	/** 受影响规则的去向：模板名 或「连规则一并删除」哨兵；缺省降级到「默认」。 */
	private redirect: string = DEFAULT_TEMPLATE_NAME;

	constructor(app: App, templateName: string, affected: PathRule[], tab: AutoHeadingsSettingTab) {
		super(app);
		this.templateName = templateName;
		this.affected = affected;
		this.tab = tab;
	}

	onOpen(): void {
		const { contentEl } = this;
		const plugin = (this.tab as unknown as { plugin: AutoHeadingsPlugin }).plugin;
		const t = plugin.messages();
		contentEl.empty();
		contentEl.createEl("h3", { text: t.delModalTitle(this.templateName) });
		contentEl.createEl("p", { text: t.delModalBody(this.affected.length) });
		const ul = contentEl.createEl("ul");
		for (const rule of this.affected) {
			ul.createEl("li", { text: rule.pattern || t.delModalEmptyPath });
		}

		// 可选模板（排除正在删除的模板）+「连规则一并删除」。
		new Setting(contentEl).setName(t.delModalRedirect).addDropdown((dd) => {
			for (const tpl of plugin.templateStore.all()) {
				if (tpl.name !== this.templateName) {
					dd.addOption(tpl.name, tpl.name);
				}
			}
			dd.addOption(DELETE_RULES_SENTINEL, t.delModalDeleteRules);
			dd.setValue(this.redirect).onChange((value) => {
				this.redirect = value;
			});
		});

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText(t.cancel).onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText(t.confirmDelete)
					.setWarning()
					.onClick(async () => {
						await this.applyAndClose(plugin);
					}),
			);
	}

	/** 按选择改写 / 删除受影响规则，再删除模板，刷新面板并关闭。 */
	private async applyAndClose(plugin: AutoHeadingsPlugin): Promise<void> {
		const rules = plugin.settings.pathRules;
		if (this.redirect === DELETE_RULES_SENTINEL) {
			plugin.settings.pathRules = rules.filter((r) => r.template !== this.templateName);
		} else {
			for (const rule of rules) {
				if (rule.template === this.templateName) {
					rule.template = this.redirect;
				}
			}
		}
		await plugin.saveSettings();
		await this.tab.deleteTemplate(this.templateName);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * 「清除全库编号」二次确认对话框（见 spec.md §3.10）。
 *
 * 刻意**不注册为命令**，避免快捷键 / 命令面板误触发大面积改动（见 spec.md §3.10）。
 * 点击「确认清除全库」后调用 {@link AutoHeadingsPlugin.clearAllVaultNumbering}。
 */
class ClearVaultModal extends Modal {
	private readonly plugin: AutoHeadingsPlugin;

	constructor(app: App, plugin: AutoHeadingsPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		const t = this.plugin.messages();
		contentEl.empty();
		contentEl.createEl("h3", { text: t.clearVaultModalTitle });
		contentEl.createEl("p", { text: t.clearVaultModalBody });
		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText(t.cancel).onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText(t.confirmClearVault)
					.setWarning()
					.onClick(async () => {
						this.close();
						await this.plugin.clearAllVaultNumbering();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
