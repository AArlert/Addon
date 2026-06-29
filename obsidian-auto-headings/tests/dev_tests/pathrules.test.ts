/**
 * 路径规则解析的单元测试（Milestone 5，见 src/pathrules.ts 与 spec.md §3.8）。
 *
 * 覆盖：匹配判定（根 / 文件夹 / 文件）、具体度排序（文件 ＞ 最长文件夹前缀 ＞ 根）、
 * 并列取靠后、无命中返回 null、归一化（反斜杠 / 前导斜杠 / 多斜杠）、hasRootRule。
 * 对应 testplan §K（路径规则）。
 */
import { describe, expect, it } from "vitest";
import {
	hasRootRule,
	type PathRule,
	resolvePathRule,
	ruleMatches,
	ruleSpecificity,
} from "../../src/pathrules";

describe("ruleMatches", () => {
	it("根 / 匹配所有文件", () => {
		expect(ruleMatches("/", "a.md")).toBe(true);
		expect(ruleMatches("/", "deep/nested/note.md")).toBe(true);
	});

	it("文件夹规则匹配其下全部文件（含深层）", () => {
		expect(ruleMatches("Projects/", "Projects/a.md")).toBe(true);
		expect(ruleMatches("Projects/", "Projects/sub/b.md")).toBe(true);
		expect(ruleMatches("Projects/", "Other/a.md")).toBe(false);
		// 前缀相同但不在文件夹内（无分隔斜杠）不应误命中。
		expect(ruleMatches("Proj/", "Projects/a.md")).toBe(false);
	});

	it("文件规则仅精确匹配", () => {
		expect(ruleMatches("读书笔记/深度工作.md", "读书笔记/深度工作.md")).toBe(true);
		expect(ruleMatches("读书笔记/深度工作.md", "读书笔记/其它.md")).toBe(false);
	});

	it("归一化：反斜杠 / 前导斜杠 / 重复斜杠", () => {
		expect(ruleMatches("Projects\\", "Projects/a.md")).toBe(true);
		expect(ruleMatches("/Projects/", "Projects/a.md")).toBe(true);
		expect(ruleMatches("Projects//", "Projects/a.md")).toBe(true);
		expect(ruleMatches("Projects/", "/Projects/a.md")).toBe(true);
	});
});

describe("ruleSpecificity", () => {
	it("根 < 文件夹 < 文件", () => {
		expect(ruleSpecificity("/")).toBe(0);
		expect(ruleSpecificity("Projects/")).toBeLessThan(ruleSpecificity("a/b.md"));
		expect(ruleSpecificity("/")).toBeLessThan(ruleSpecificity("Projects/"));
	});

	it("更长（更深）的文件夹前缀更具体", () => {
		expect(ruleSpecificity("a/b/c/")).toBeGreaterThan(ruleSpecificity("a/"));
	});
});

describe("resolvePathRule", () => {
	const rules: PathRule[] = [
		{ pattern: "/", template: "默认" },
		{ pattern: "Projects/", template: "技术文档" },
		{ pattern: "Projects/sub/", template: "深层" },
		{ pattern: "Projects/sub/special.md", template: "专属" },
	];

	it("精确文件规则胜过文件夹与根", () => {
		expect(resolvePathRule(rules, "Projects/sub/special.md")?.template).toBe("专属");
	});

	it("最长文件夹前缀优先", () => {
		expect(resolvePathRule(rules, "Projects/sub/other.md")?.template).toBe("深层");
		expect(resolvePathRule(rules, "Projects/top.md")?.template).toBe("技术文档");
	});

	it("仅根规则兜底", () => {
		expect(resolvePathRule(rules, "随手记/x.md")?.template).toBe("默认");
	});

	it("无任何规则匹配 → null", () => {
		expect(resolvePathRule([], "a.md")).toBeNull();
		// 删掉根规则后，不在任何文件夹内的文件无命中。
		const noRoot: PathRule[] = [{ pattern: "Projects/", template: "技术文档" }];
		expect(resolvePathRule(noRoot, "随手记/x.md")).toBeNull();
	});

	it("具体度并列时，列表中靠后的规则胜出", () => {
		const dup: PathRule[] = [
			{ pattern: "Notes/", template: "A" },
			{ pattern: "Notes/", template: "B" },
		];
		expect(resolvePathRule(dup, "Notes/x.md")?.template).toBe("B");
	});
});

describe("hasRootRule", () => {
	it("识别 / 根规则（含归一化写法）", () => {
		expect(hasRootRule([{ pattern: "/", template: "默认" }])).toBe(true);
		expect(hasRootRule([{ pattern: "Projects/", template: "技术文档" }])).toBe(false);
		expect(hasRootRule([])).toBe(false);
	});
});
