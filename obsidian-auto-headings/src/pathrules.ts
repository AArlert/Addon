/**
 * 按路径配置：路径规则的数据模型与解析（Milestone 5，见 spec.md §3.8）。
 *
 * 一条**路径规则**把一个「路径模式」映射到一个模板名。某文件命中某条规则时，便用该规则
 * 指定的模板（连同其各级格式与白名单）为它编号。本模块是**纯函数**（不依赖 Obsidian 运行时），
 * 故可独立单测（见 `tests/dev_tests/pathrules.test.ts`）。
 *
 * **路径模式的两类写法（按 GUI 约定）：**
 * - **文件夹规则**：以 `/` 结尾（如 `Projects/`），匹配该文件夹及其**全部子项**。
 * - **文件规则**：不以 `/` 结尾（如 `读书笔记/深度工作.md`），仅**精确匹配**该文件。
 * - **根规则 `/`**：特殊的文件夹规则，匹配仓库下**所有文件**，是具体度最低的兜底（即「全局默认」）。
 *
 * **解析逻辑（见 spec.md §3.8）：**
 * 1. 收集所有与当前文件匹配的规则（`/` 根规则匹配所有文件）。
 * 2. **最具体**者优先：精确文件路径 ＞ 最长文件夹前缀 ＞ `/` 根规则。
 * 3. 并列时**行号更大**（列表中靠后）者胜出，便于在末尾追加规则覆盖既有规则。
 * 4. 无任何规则匹配（含 `/` 根规则被删的情形）：返回 `null`——该文件**无可用模板**。
 */

/** 一条路径规则：把路径模式映射到模板名。持久化于 `data.json` 的 `pathRules` 数组。 */
export interface PathRule {
	/** 路径模式：`/`（根）、`Foo/`（文件夹）、`Foo/bar.md`（文件）。 */
	pattern: string;
	/** 命中时使用的模板名（即 `templates/*.json` 的模板显示名）。 */
	template: string;
}

/**
 * 归一化路径模式：折叠反斜杠与重复斜杠、去首尾空白；`/`（及空串）一律视为根。
 * 非根模式去掉前导 `/` 与 `./`（Obsidian 文件路径相对仓库根、不带前导斜杠）。
 */
function normalizePattern(pattern: string): string {
	let p = pattern.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
	if (p === "/" || p === "") {
		return "/";
	}
	p = p.replace(/^\.?\//, "");
	return p === "" ? "/" : p;
}

/** 归一化文件路径：折叠反斜杠与重复斜杠、去前导 `/` 与 `./` 及首尾空白。 */
function normalizeFilePath(filePath: string): string {
	const p = filePath.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
	return p.replace(/^\.?\//, "");
}

/** 某模式是否为文件夹规则（根 `/` 或以 `/` 结尾）。 */
function isFolderPattern(normalized: string): boolean {
	return normalized === "/" || normalized.endsWith("/");
}

/**
 * 判断某路径模式是否匹配给定文件路径。
 * - 根 `/`：匹配所有文件。
 * - 文件夹 `Foo/`：匹配路径以 `Foo/` 开头的文件（含深层子项）。
 * - 文件 `Foo/bar.md`：仅精确相等时匹配。
 */
export function ruleMatches(pattern: string, filePath: string): boolean {
	const p = normalizePattern(pattern);
	const f = normalizeFilePath(filePath);
	if (p === "/") {
		return true;
	}
	if (p.endsWith("/")) {
		return f.startsWith(p);
	}
	return f === p;
}

/**
 * 路径模式的**具体度**评分（越大越具体），用于解析时挑选最具体的匹配：
 * - 根 `/`：`0`（最低）。
 * - 文件夹：按归一化后的字符长度（更长 = 更深 = 更具体）。
 * - 文件：在文件夹之上加一个足够大的基数，确保**任何精确文件匹配都胜过任何文件夹匹配**。
 */
export function ruleSpecificity(pattern: string): number {
	const p = normalizePattern(pattern);
	if (p === "/") {
		return 0;
	}
	if (isFolderPattern(p)) {
		return p.length;
	}
	// 文件规则：恒高于一切文件夹规则。
	return 1_000_000 + p.length;
}

/**
 * 解析当前文件应使用的路径规则。
 *
 * 返回命中的、**最具体**的规则（并列时取列表中靠后者）；无任何规则匹配时返回 `null`
 * （该文件无可用模板，调用方据此决定静默跳过或提示，见 spec.md §3.8 第 4 条）。
 */
export function resolvePathRule(rules: PathRule[], filePath: string): PathRule | null {
	let best: PathRule | null = null;
	let bestSpec = -1;
	rules.forEach((rule) => {
		if (!ruleMatches(rule.pattern, filePath)) {
			return;
		}
		const spec = ruleSpecificity(rule.pattern);
		// `>=` 配合正向遍历：并列时后出现的规则覆盖先前的（行号更大者胜出）。
		if (spec >= bestSpec) {
			best = rule;
			bestSpec = spec;
		}
	});
	return best;
}

/** 列表中是否存在根规则（`/`）。用于「兜底缺失提示条」的判定（见 spec.md §3.8）。 */
export function hasRootRule(rules: PathRule[]): boolean {
	return rules.some((rule) => normalizePattern(rule.pattern) === "/");
}
