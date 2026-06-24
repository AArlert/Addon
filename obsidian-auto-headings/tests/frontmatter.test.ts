import { describe, expect, it } from "vitest";
import { findFrontmatter, parseAutoHeadingsSwitch } from "../src/frontmatter";

describe("findFrontmatter", () => {
	it("识别开头的 frontmatter 区块范围", () => {
		const lines = ["---", "title: 笔记", "obsidian-auto-headings: ON", "---", "正文"]
			.join("\n")
			.split("\n");
		expect(findFrontmatter(lines)).toEqual({ start: 0, end: 4 });
	});

	it("无 frontmatter 时返回空范围", () => {
		expect(findFrontmatter(["# 标题", "正文"])).toEqual({ start: 0, end: 0 });
	});

	it("首行 `---` 但无闭合时不视为 frontmatter", () => {
		expect(findFrontmatter(["---", "正文没有闭合"])).toEqual({ start: 0, end: 0 });
	});

	it("四个短横线（分隔线）不是 frontmatter 定界符", () => {
		expect(findFrontmatter(["----", "正文"])).toEqual({ start: 0, end: 0 });
	});
});

describe("parseAutoHeadingsSwitch", () => {
	function withFm(value: string): string {
		return ["---", `obsidian-auto-headings: ${value}`, "---", "## 章"].join("\n");
	}

	it("识别 ON / OFF", () => {
		expect(parseAutoHeadingsSwitch(withFm("ON"))).toBe("ON");
		expect(parseAutoHeadingsSwitch(withFm("OFF"))).toBe("OFF");
	});

	it("大小写敏感：on / off / Off 等均视为非法（返回 null）", () => {
		expect(parseAutoHeadingsSwitch(withFm("on"))).toBeNull();
		expect(parseAutoHeadingsSwitch(withFm("off"))).toBeNull();
		expect(parseAutoHeadingsSwitch(withFm("Off"))).toBeNull();
		expect(parseAutoHeadingsSwitch(withFm("On"))).toBeNull();
	});

	it("带引号的值视为非法", () => {
		expect(parseAutoHeadingsSwitch(withFm('"ON"'))).toBeNull();
	});

	it("键缺省或无 frontmatter 时返回 null", () => {
		expect(
			parseAutoHeadingsSwitch(["---", "title: 笔记", "---", "## 章"].join("\n")),
		).toBeNull();
		expect(parseAutoHeadingsSwitch("## 章\n正文")).toBeNull();
	});

	it("frontmatter 之外的同名行不影响判定", () => {
		// 正文里的伪键不应被解析为开关。
		const content = ["## 章", "obsidian-auto-headings: OFF"].join("\n");
		expect(parseAutoHeadingsSwitch(content)).toBeNull();
	});
});
