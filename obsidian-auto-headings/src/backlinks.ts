/**
 * Backlink 同步（M7，1.0 发布前置，见 spec.md §3.12）。
 *
 * 编号 / 清除 / 清理外来编号都会**改写标题文本**（加 / 改 / 去前缀），这会使指向旧标题锚点的内部链接
 * `[[file#旧标题]]` 断链。本模块提供**纯函数核心**：算「旧→新」改名表、在引用文件内重写链接锚点。
 * 与 Obsidian 运行时耦合的部分（`metadataCache.getBacklinksForFile` 反查 + `vault.process` 写回）在
 * `main.ts` 的 `syncBacklinks`；本模块刻意保持无依赖、可纯单测。
 *
 * 设计要点（参考竞品 Header Enhancer 的 `backlinks.ts`，并在其偷懒处做稳，见 spec.md §3.12）：
 * - **逐行配对**：编号逐行就地改写、不重排行，故旧 / 新文档按 `lineIndex` 配对即得「旧→新」，无需模糊匹配。
 * - **锚点归一 {@link linkAnchor}**：两侧同口径，使既有链接含不含 WJ 都能匹配；写出的新链接剥 WJ、干净可读。
 * - **重复锚点保守不改**：同名标题多处时锚点歧义，剔出改名表，避免错改。
 */

import { WORD_JOINER } from "./numbering";
import { parseHeadings } from "./parser";

/** 一条「旧锚点 → 新锚点」改名（均为 {@link linkAnchor} 归一后的形式）。 */
export interface HeadingRename {
	/** 旧锚点（归一后），= 既有链接 `[[file#from]]` 里 `#` 之后那段的归一形式。 */
	from: string;
	/** 新锚点（归一后），写入新链接 `[[file#to]]`。 */
	to: string;
}

/** 匹配 wikilink / 嵌入：捕获可选的 `!`（嵌入）与内部 `path#sub|alias`。 */
const WIKILINK_RE = /(!?)\[\[([^\]\n]+?)\]\]/g;

/**
 * 把一段标题文本归一为 Obsidian 标题链接的**锚点形式**，用于改名表键与链接 subpath 的**双侧**匹配。
 *
 * 处理：剥 Word Joiner（插件写入的不可见标记，见 {@link WORD_JOINER}）→ 去 Obsidian 在标题链接里
 * **不允许**的字符 `[ ] # | ^` → 折叠内部空白为单个空格 → trim。
 *
 * 两侧同口径是关键：既有链接可能含 / 不含 WJ（取决于创建时机），都剥 WJ 后即可稳定匹配；生成的新
 * 链接也走它（剥 WJ）→ 链接干净。**仅用于匹配 / 生成锚点，不改写标题本身。**
 */
export function linkAnchor(text: string): string {
	return text
		.split(WORD_JOINER)
		.join("")
		.replace(/[[\]#|^]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * 计算「旧文档 → 新文档」的标题锚点改名表（纯函数，见 spec.md §3.12 流程①）。
 *
 * 编号永不增删行，故按 `lineIndex` 配对旧 / 新标题即可。仅收录**锚点实际变化**（`from !== to`、
 * 且两端非空）的标题；**重复的旧锚点**（同名标题出现多处）视为歧义，整体剔除（保守不改，避免错改
 * 到同名的另一处）。
 */
export function computeHeadingRenames(oldContent: string, newContent: string): HeadingRename[] {
	const oldHeadings = parseHeadings(oldContent);
	const newByLine = new Map(parseHeadings(newContent).map((h) => [h.lineIndex, h]));

	// 统计旧锚点出现次数：>1 者歧义，剔除。
	const oldAnchorCount = new Map<string, number>();
	for (const h of oldHeadings) {
		const a = linkAnchor(h.text);
		if (a) oldAnchorCount.set(a, (oldAnchorCount.get(a) ?? 0) + 1);
	}

	const renames: HeadingRename[] = [];
	const seen = new Set<string>();
	for (const h of oldHeadings) {
		const nh = newByLine.get(h.lineIndex);
		if (!nh) continue; // 该行不再是标题（编号流程下不会发生，防御）。
		const from = linkAnchor(h.text);
		const to = linkAnchor(nh.text);
		if (!from || !to || from === to) continue;
		if ((oldAnchorCount.get(from) ?? 0) > 1) continue; // 歧义：同名标题多处，保守不改。
		if (seen.has(from)) continue;
		seen.add(from);
		renames.push({ from, to });
	}
	return renames;
}

/** 判断 wikilink 的**路径段**是否指向目标文件（按 basename 命中，容 `folder/`、`.md` 后缀）。 */
function pathMatchesTarget(pathPart: string, targetBasename: string, isSameFile: boolean): boolean {
	if (pathPart === "") {
		// `[[#锚点]]`：同文件内链，仅当源文件即目标文件时命中。
		return isSameFile;
	}
	const last = pathPart.split("/").pop() ?? pathPart;
	const base = last.replace(/\.md$/i, "");
	return base === targetBasename;
}

/**
 * 在一个引用文件的内容里，重写指向目标文件、且 subpath 落在改名表里的标题链接（纯函数，见 spec.md §3.12 流程③）。
 *
 * 扫描全部 `[[…]]` / `![[…]]`，对每个链接解析 `path#subpath|alias`：
 * - 路径段 basename 须命中目标文件（`[[#锚点]]` 仅当 `isSameFile`）；
 * - subpath 须存在、非块引用（不以 `^` 起头）、单段（不含二级 `#`，多级锚点保守跳过）；
 * - subpath 经 {@link linkAnchor} 归一后须在 `renames` 中；命中则替换为新锚点，**保留 `|别名` 与 `!` 嵌入前缀**。
 *
 * @returns 重写后的内容与命中改写的链接数。
 */
export function rewriteBacklinksInContent(
	content: string,
	targetBasename: string,
	isSameFile: boolean,
	renames: Map<string, string>,
): { content: string; count: number } {
	let count = 0;
	const out = content.replace(WIKILINK_RE, (whole, bang: string, inner: string) => {
		const pipeIdx = inner.indexOf("|");
		const linkPart = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
		const alias = pipeIdx >= 0 ? inner.slice(pipeIdx) : ""; // 含前导 `|`
		const hashIdx = linkPart.indexOf("#");
		if (hashIdx < 0) return whole; // 无 subpath，非标题链接。
		const pathPart = linkPart.slice(0, hashIdx);
		const subpath = linkPart.slice(hashIdx + 1);
		if (subpath.startsWith("^")) return whole; // 块引用，跳过。
		if (subpath.includes("#")) return whole; // 多级锚点，保守跳过。
		if (!pathMatchesTarget(pathPart, targetBasename, isSameFile)) return whole;
		const to = renames.get(linkAnchor(subpath));
		if (to === undefined) return whole;
		count++;
		return `${bang}[[${pathPart}#${to}${alias}]]`;
	});
	return { content: out, count };
}
