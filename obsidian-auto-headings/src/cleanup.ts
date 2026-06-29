/**
 * M6 全样式并集剥离器：清除编号，独立于任何模板（见 spec.md §3.10）。
 *
 * 对外暴露 {@link clearNumberingContent}，用于：
 * - 「清除当前文件编号」命令（main.ts）：对 Editor 内容调用后以单一事务写回。
 * - 「清除全库编号」按钮（SettingsTab.ts）：对每个 .md 文件读取 → 清除 → 写回。
 */

import { parseHeadings } from "./parser";
import { stripPrefixBroad } from "./numbering";

/** {@link clearNumberingContent} 的可选项。 */
export interface CleanupOptions {
	/** 已知前缀候选（含空串；由 main.ts 传入全模板前缀并集，提高对历史前缀的识别率）。 */
	strippablePrefixes?: readonly string[];
	/** 已知后缀候选（同上）。 */
	strippableSuffixes?: readonly string[];
}

/**
 * 剥离内容中**所有标题**（代码块外）的编号前缀，返回无编号的裸标题文本。
 *
 * 使用**全样式并集**剥离器（arabic ∪ cjk ∪ circled ∪ lower-alpha ∪ upper-alpha），独立于任何
 * 模板——不管历史编号是用哪个模板、哪种序号样式写入的，都尽力剥净。仅剥一层（「2024 折中」）。
 *
 * **已知风险（spec §3.10 / §2.3 预期取舍）**：若标题文本恰以序号样字（含字母）开头紧跟分隔符
 * （如用户手写的 `## 1.1 标题`、`## a) 备注`），全样式剥离器可能将其误当作插件前缀剥掉。
 * 这是「清除编号」命令固有的权衡——与 {@link stripPrefix} 的既有风险同源。
 *
 * @param content 待清除的 Markdown 文件全文。
 * @param options 可选的前后缀候选（传入全模板前后缀并集可提高识别率）。
 * @returns 剥除编号前缀后的文件全文；若无任何标题则原样返回。
 */
export function clearNumberingContent(content: string, options: CleanupOptions = {}): string {
	const headings = parseHeadings(content);
	if (headings.length === 0) {
		return content;
	}

	const prefixes = options.strippablePrefixes ?? [];
	const suffixes = options.strippableSuffixes ?? [];

	const lines = content.split("\n");
	for (const h of headings) {
		const hashes = "#".repeat(h.level);
		const text = stripPrefixBroad(h.rawText, prefixes, suffixes);
		lines[h.lineIndex] = `${hashes} ${text}`;
	}
	return lines.join("\n");
}
