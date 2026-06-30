/**
 * Backlink 同步纯函数单测（M7，见 spec.md §3.12）：`src/backlinks.ts` 的
 * {@link linkAnchor} / {@link computeHeadingRenames} / {@link rewriteBacklinksInContent}。
 *
 * 与 Obsidian 运行时耦合的反查 / 写回（`getBacklinksForFile` / `vault.process`）在 main.ts，
 * 由 main.test.ts 的集成测试覆盖；本文件只测可纯验证的核心逻辑。
 */
import { describe, expect, it } from "vitest";
import {
	computeHeadingRenames,
	displayAnchor,
	linkAnchor,
	rewriteBacklinksInContent,
	type HeadingRename,
} from "../../src/backlinks";
import { WORD_JOINER as WJ } from "../../src/numbering";

/** 把改名表转成 from→to 的 Map（rewrite 入参形式）。 */
function asMap(renames: HeadingRename[]): Map<string, string> {
	return new Map(renames.map((r) => [r.from, r.to]));
}

describe("linkAnchor：标题 → 链接锚点归一", () => {
	it("剥 Word Joiner（插件不可见标记）", () => {
		expect(linkAnchor(`1 ${WJ}简介`)).toBe("1 简介");
	});

	it("去 Obsidian 不允许的字符 [ ] # | ^，折叠空白并 trim", () => {
		expect(linkAnchor("  标题  含   空白  ")).toBe("标题 含 空白");
		expect(linkAnchor("a#b|c^d[e]f")).toBe("abcdef");
	});

	it("纯文本原样（保留普通标点）", () => {
		expect(linkAnchor("1.2 设计：原则")).toBe("1.2 设计：原则");
	});
});

describe("displayAnchor：写入用锚点保留 WJ（确保链接可解析到含 WJ 的标题）", () => {
	it("保留 Word Joiner（与 linkAnchor 的唯一区别）", () => {
		expect(displayAnchor(`1 ${WJ}简介`)).toBe(`1 ${WJ}简介`);
		// 对照：linkAnchor 剥 WJ。
		expect(linkAnchor(`1 ${WJ}简介`)).toBe("1 简介");
	});

	it("裸标题（无 WJ）：与 linkAnchor 等价", () => {
		expect(displayAnchor("简介")).toBe("简介");
		expect(displayAnchor("  标题  含   空白  ")).toBe("标题 含 空白");
	});
});

describe("computeHeadingRenames：旧→新 标题锚点改名表", () => {
	it("首次编号：裸标题 → 带前缀（from 剥 WJ 匹配；to 保留 WJ 以能解析）", () => {
		const renames = computeHeadingRenames("## 简介", `## 1 ${WJ}简介`);
		// from 剥 WJ（匹配既有链接）；to 保留 WJ（写入的新链接字节对齐含 WJ 的标题）。
		expect(renames).toEqual([{ from: "简介", to: `1 ${WJ}简介` }]);
	});

	it("重排：1.1 → 1.2（to 保留 WJ）", () => {
		const renames = computeHeadingRenames(`## 1.1 ${WJ}简介`, `## 1.2 ${WJ}简介`);
		expect(renames).toEqual([{ from: "1.1 简介", to: `1.2 ${WJ}简介` }]);
	});

	it("清除编号：带前缀 → 裸标题", () => {
		const renames = computeHeadingRenames(`## 1 ${WJ}简介`, "## 简介");
		expect(renames).toEqual([{ from: "1 简介", to: "简介" }]);
	});

	it("锚点未变（仅 WJ 差异）：不产生改名", () => {
		expect(computeHeadingRenames(`## 1 ${WJ}简介`, `## 1 ${WJ}简介`)).toEqual([]);
		// 同一标题文本、有无 WJ 归一后相同 → 无改名。
		expect(computeHeadingRenames("## 简介", `## ${WJ}简介`)).toEqual([]);
	});

	it("多标题：仅变化者入表，按行配对互不串台", () => {
		const before = ["## 甲", "## 乙"].join("\n");
		const after = [`## 1 ${WJ}甲`, `## 2 ${WJ}乙`].join("\n");
		expect(computeHeadingRenames(before, after)).toEqual([
			{ from: "甲", to: `1 ${WJ}甲` },
			{ from: "乙", to: `2 ${WJ}乙` },
		]);
	});

	it("重复旧锚点（同名标题多处）：歧义，整体剔除不改", () => {
		const before = ["## 附录", "## 附录"].join("\n");
		const after = [`## 1 ${WJ}附录`, `## 2 ${WJ}附录`].join("\n");
		// 两个「附录」→ 旧锚点歧义，保守不改。
		expect(computeHeadingRenames(before, after)).toEqual([]);
	});

	it("空标题不入表", () => {
		expect(computeHeadingRenames("## ", `## 1 ${WJ}`)).toEqual([]);
	});
});

describe("rewriteBacklinksInContent：在引用文件内重写标题链接", () => {
	const renames = asMap([{ from: "简介", to: "1 简介" }]);

	it("基本：[[a#简介]] → [[a#1 简介]]", () => {
		const r = rewriteBacklinksInContent("见 [[a#简介]] 一节", "a", false, renames);
		expect(r.content).toBe("见 [[a#1 简介]] 一节");
		expect(r.count).toBe(1);
	});

	it("保留别名 |alias", () => {
		const r = rewriteBacklinksInContent("[[a#简介|看这里]]", "a", false, renames);
		expect(r.content).toBe("[[a#1 简介|看这里]]");
	});

	it("保留嵌入前缀 !", () => {
		const r = rewriteBacklinksInContent("![[a#简介]]", "a", false, renames);
		expect(r.content).toBe("![[a#1 简介]]");
	});

	it("带文件夹路径 / .md 后缀按 basename 命中", () => {
		expect(rewriteBacklinksInContent("[[notes/a#简介]]", "a", false, renames).content).toBe(
			"[[notes/a#1 简介]]",
		);
		expect(rewriteBacklinksInContent("[[a.md#简介]]", "a", false, renames).content).toBe(
			"[[a.md#1 简介]]",
		);
	});

	it("路径指向别的文件：不改", () => {
		const r = rewriteBacklinksInContent("[[other#简介]]", "a", false, renames);
		expect(r.content).toBe("[[other#简介]]");
		expect(r.count).toBe(0);
	});

	it("同文件内链 [[#简介]]：仅 isSameFile 时改", () => {
		expect(rewriteBacklinksInContent("[[#简介]]", "a", true, renames).content).toBe(
			"[[#1 简介]]",
		);
		expect(rewriteBacklinksInContent("[[#简介]]", "a", false, renames).content).toBe(
			"[[#简介]]",
		);
	});

	it("块引用 ^id 与多级锚点 #A#B：保守跳过", () => {
		expect(rewriteBacklinksInContent("[[a#^blk]]", "a", false, renames).content).toBe(
			"[[a#^blk]]",
		);
		expect(rewriteBacklinksInContent("[[a#简介#细节]]", "a", false, renames).content).toBe(
			"[[a#简介#细节]]",
		);
	});

	it("无 subpath 的纯文件链接：不动", () => {
		expect(rewriteBacklinksInContent("[[a]]", "a", false, renames).content).toBe("[[a]]");
	});

	it("subpath 不在改名表：不改", () => {
		expect(rewriteBacklinksInContent("[[a#其它]]", "a", false, renames).content).toBe(
			"[[a#其它]]",
		);
	});

	it("一行多个链接：分别计数", () => {
		const m = asMap([
			{ from: "甲", to: "1 甲" },
			{ from: "乙", to: "2 乙" },
		]);
		const r = rewriteBacklinksInContent("[[a#甲]] 与 [[a#乙]]", "a", false, m);
		expect(r.content).toBe("[[a#1 甲]] 与 [[a#2 乙]]");
		expect(r.count).toBe(2);
	});
});
