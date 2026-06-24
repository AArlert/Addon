import { describe, expect, it } from "vitest";
import { parseHeadings } from "../src/parser";
import { computeHeadingEdits, demoteMisplacedH1s, renumberContent } from "../src/numbering";

describe("demoteMisplacedH1s", () => {
	it("首个 H1 保留为文档标题，不降级", () => {
		const headings = parseHeadings(["# 文档", "## 章"].join("\n"));
		const live = demoteMisplacedH1s(headings, "live");
		expect(live.map((h) => h.level)).toEqual([1, 2]);
	});

	it("实时模式：错位 H1 仅自身降为 H2，子树不动", () => {
		const content = ["# 文档", "## 第一章", "# 附录", "## 小节"].join("\n");
		const headings = parseHeadings(content);
		const live = demoteMisplacedH1s(headings, "live");
		// # 附录 → H2；## 小节 保持 H2 不变。
		expect(live.map((h) => h.level)).toEqual([1, 2, 2, 2]);
	});

	it("格式化模式：错位 H1 降级且其子树整体下移一级", () => {
		const content = ["# 文档", "## 第一章", "# 附录", "## 小节", "### 细节"].join("\n");
		const headings = parseHeadings(content);
		const fmt = demoteMisplacedH1s(headings, "format");
		// # 附录 → H2；## 小节 → H3；### 细节 → H4。第一章不受影响。
		expect(fmt.map((h) => h.level)).toEqual([1, 2, 2, 3, 4]);
	});

	it("格式化模式：级联在下一个原始 H1 处停止", () => {
		const content = ["# 文档", "# A", "## A1", "# B", "## B1"].join("\n");
		const headings = parseHeadings(content);
		const fmt = demoteMisplacedH1s(headings, "format");
		// # A→H2, ## A1→H3；# B→H2, ## B1→H3。
		expect(fmt.map((h) => h.level)).toEqual([1, 2, 3, 2, 3]);
	});

	it("格式化模式：下移在 H6 封顶", () => {
		const content = ["# 文档", "# 错位", "###### 已是最深"].join("\n");
		const headings = parseHeadings(content);
		const fmt = demoteMisplacedH1s(headings, "format");
		expect(fmt.map((h) => h.level)).toEqual([1, 2, 6]);
	});

	it("保留行下标", () => {
		const content = ["# 文档", "正文", "# 附录"].join("\n");
		const headings = parseHeadings(content);
		const fmt = demoteMisplacedH1s(headings, "format");
		expect(fmt.map((h) => h.lineIndex)).toEqual([0, 2]);
	});
});

describe("renumberContent — 错位 H1 与模式", () => {
	it("实时模式：错位 H1 降为 H2 并参与编号，子树原样", () => {
		const content = ["# 文档", "## 第一章", "# 附录", "## 小节"].join("\n");
		const result = renumberContent(content, undefined, { mode: "live" });
		expect(result).toBe(["# 文档", "## 1 第一章", "## 2 附录", "## 3 小节"].join("\n"));
	});

	it("格式化模式：错位 H1 级联降级后编号", () => {
		const content = ["# 文档", "## 第一章", "# 附录", "## 小节"].join("\n");
		const result = renumberContent(content, undefined, { mode: "format" });
		// 附录成为第 2 个 H2；小节降为其 H3 子级 2.1。
		expect(result).toBe(["# 文档", "## 1 第一章", "## 2 附录", "### 2.1 小节"].join("\n"));
	});

	it("默认模式为 live", () => {
		const content = ["# 文档", "# 附录", "## 小节"].join("\n");
		expect(renumberContent(content)).toBe(
			renumberContent(content, undefined, { mode: "live" }),
		);
	});
});

describe("renumberContent — frontmatter", () => {
	it("跳过 frontmatter，不把 YAML 里的 `# 注释` 当标题", () => {
		const content = ["---", "title: 笔记", "# 这是 YAML 注释", "---", "## 章"].join("\n");
		const result = renumberContent(content);
		expect(result).toBe(
			["---", "title: 笔记", "# 这是 YAML 注释", "---", "## 1 章"].join("\n"),
		);
	});
});

describe("computeHeadingEdits", () => {
	it("仅返回内容实际变化的标题行", () => {
		// `## 1 章` 已是正确编号，应无改动；`## 节` 需要加前缀。
		const content = ["## 1 章", "### 节"].join("\n");
		const edits = computeHeadingEdits(content);
		expect(edits).toEqual([{ lineIndex: 1, newText: "### 1.1 节" }]);
	});

	it("已完全编号的文档返回空集合（幂等）", () => {
		const content = renumberContent(["# 文档", "## 章", "### 节"].join("\n"));
		expect(computeHeadingEdits(content)).toEqual([]);
	});

	it("无 H2+ 标题时返回空集合", () => {
		expect(computeHeadingEdits(["# 仅文档标题", "正文"].join("\n"))).toEqual([]);
	});
});
