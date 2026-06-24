/**
 * 单文件开关（frontmatter）读取（见 README 3.2）。
 *
 * 插件**仅读取**一个 frontmatter 键 `obsidian-auto-headings`，用于局部控制单个文件：
 * - 合法值仅 `ON` 与 `OFF`（**大小写敏感**，仅接受全大写）。
 * - `OFF`：即便面板全局开关为「开」，该文件也不被处理。
 * - `ON` 或该键缺省：跟随面板全局开关。
 * - 非法值（非 `ON`/`OFF`，含 `on`、`off`、`On` 等）：忽略该键，按缺省处理（跟随全局开关）。
 *
 * 注意：此处**刻意手写解析**而非依赖 Obsidian 的 YAML 解析器——后者会把 YAML 1.1 的
 * `ON`/`OFF` 视为布尔值并丢失原始大小写，无法满足「大小写敏感」的判定要求。
 */

/** 单文件开关的判定结果：`ON` / `OFF` / `null`（缺省或非法，跟随全局开关）。 */
export type FileSwitch = "ON" | "OFF" | null;

/** 插件读取的唯一 frontmatter 键。 */
const SWITCH_KEY = "obsidian-auto-headings";

/**
 * 从文件原始内容中读取单文件开关。
 *
 * frontmatter 必须位于文件**最开头**：第一行恰为 `---`，并由其后的 `---`（或 `...`）闭合。
 * 在该区块内查找首个 `obsidian-auto-headings` 键，按上述规则判定。
 */
export function readFileSwitch(content: string): FileSwitch {
	const lines = content.split("\n");
	// frontmatter 必须从第一行的 `---` 开始（允许行尾的 \r）。
	if (lines.length === 0 || lines[0].replace(/\r$/, "").trim() !== "---") {
		return null;
	}

	// 查找闭合行。
	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		const t = lines[i].replace(/\r$/, "").trim();
		if (t === "---" || t === "...") {
			end = i;
			break;
		}
	}
	if (end === -1) {
		return null; // 未闭合的 frontmatter，按缺省处理。
	}

	for (let i = 1; i < end; i++) {
		const line = lines[i].replace(/\r$/, "");
		const colon = line.indexOf(":");
		if (colon === -1) {
			continue;
		}
		const key = line.slice(0, colon).trim();
		if (key !== SWITCH_KEY) {
			continue;
		}
		let value = line.slice(colon + 1).trim();
		// 去除成对的引号，使 `"ON"` / `'OFF'` 也能识别。
		if (
			value.length >= 2 &&
			((value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'")))
		) {
			value = value.slice(1, -1);
		}
		if (value === "ON") {
			return "ON";
		}
		if (value === "OFF") {
			return "OFF";
		}
		return null; // 非法值：忽略该键，跟随全局开关。
	}

	return null;
}

/**
 * 判断某文件是否被 frontmatter 明确关闭。仅当开关值恰为 `OFF` 时返回 `true`。
 * 缺省、`ON`、非法值均返回 `false`（即跟随全局开关）。
 */
export function isDisabledByFrontmatter(content: string): boolean {
	return readFileSwitch(content) === "OFF";
}
