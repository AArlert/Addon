/**
 * Frontmatter 处理（Milestone 2）。
 *
 * 插件对 frontmatter 的**唯一**交互：读取单文件开关键 `obsidian-auto-headings`
 * （值仅 `ON` / `OFF`，**大小写敏感**）。本模块还提供 frontmatter 区块的行范围，
 * 供解析器跳过其内部内容（避免把 YAML 里的 `# 注释` 误判为标题）。
 */

/** Frontmatter 区块的行范围。无 frontmatter 时 `start === end === 0`。 */
export interface FrontmatterRange {
	/** 区块首行（开启的 `---`）下标。 */
	start: number;
	/** 正文首行下标（闭合 `---` 的下一行）；即区块的**排他**结束。 */
	end: number;
}

/**
 * 探测文件开头的 YAML frontmatter 区块。
 *
 * 仅当**首行**恰为 `---`（修剪后）且其后存在闭合的 `---` 行时才认定存在
 * frontmatter（与 Obsidian 行为一致）。否则返回空范围 `{ start: 0, end: 0 }`，
 * 例如首行的 `---` 实为分隔线（无闭合）时。
 */
export function findFrontmatter(lines: string[]): FrontmatterRange {
	if (lines.length === 0 || lines[0].trim() !== "---") {
		return { start: 0, end: 0 };
	}
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			return { start: 0, end: i + 1 };
		}
	}
	// 首行是 `---` 但没有闭合：不视为 frontmatter。
	return { start: 0, end: 0 };
}

/** 匹配 frontmatter 中的开关键，捕获其原始值（不含首尾空白）。 */
const SWITCH_RE = /^obsidian-auto-headings:[ \t]*(\S.*?)[ \t]*$/;

/**
 * 解析单文件开关键的值。
 *
 * @returns `"ON"` / `"OFF"`（仅当值**恰好**为全大写的 `ON` / `OFF` 时），
 *          否则 `null`（键缺省，或值非法——含 `on`、`off`、`On`、带引号等）。
 *          调用方约定：返回 `"OFF"` 才阻止处理；其余（含 `null`）跟随全局开关。
 */
export function parseAutoHeadingsSwitch(content: string): "ON" | "OFF" | null {
	const lines = content.split("\n");
	const fm = findFrontmatter(lines);
	if (fm.end === 0) {
		return null;
	}
	for (let i = fm.start + 1; i < fm.end - 1; i++) {
		const m = lines[i].match(SWITCH_RE);
		if (m) {
			const value = m[1];
			if (value === "ON") return "ON";
			if (value === "OFF") return "OFF";
			return null; // 非法值（大小写不符 / 带引号等）：忽略该键。
		}
	}
	return null;
}
