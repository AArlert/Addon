import { describe, expect, it } from "vitest";
import { isDisabledByFrontmatter, readFileSwitch } from "../../src/frontmatter";

function withFrontmatter(value: string): string {
	return ["---", `obsidian-auto-headings: ${value}`, "---", "# 文档", "## 章"].join("\n");
}

describe("readFileSwitch", () => {
	it("识别合法的 ON / OFF", () => {
		expect(readFileSwitch(withFrontmatter("ON"))).toBe("ON");
		expect(readFileSwitch(withFrontmatter("OFF"))).toBe("OFF");
	});

	it("大小写敏感：on/off/On/Off 等均视为非法（返回 null）", () => {
		expect(readFileSwitch(withFrontmatter("on"))).toBeNull();
		expect(readFileSwitch(withFrontmatter("off"))).toBeNull();
		expect(readFileSwitch(withFrontmatter("On"))).toBeNull();
		expect(readFileSwitch(withFrontmatter("Off"))).toBeNull();
		expect(readFileSwitch(withFrontmatter("true"))).toBeNull();
	});

	it("键缺省时返回 null", () => {
		const content = ["---", "title: 我的笔记", "---", "# 文档"].join("\n");
		expect(readFileSwitch(content)).toBeNull();
	});

	it("无 frontmatter 时返回 null", () => {
		expect(readFileSwitch("# 文档\n## 章")).toBeNull();
		expect(readFileSwitch("")).toBeNull();
	});

	it("未闭合的 frontmatter 返回 null", () => {
		const content = ["---", "obsidian-auto-headings: OFF", "# 文档"].join("\n");
		expect(readFileSwitch(content)).toBeNull();
	});

	it("frontmatter 必须位于文件最开头", () => {
		const content = ["正文", "---", "obsidian-auto-headings: OFF", "---"].join("\n");
		expect(readFileSwitch(content)).toBeNull();
	});

	it("容忍值两侧的引号与空白", () => {
		expect(readFileSwitch(withFrontmatter('"ON"'))).toBe("ON");
		expect(readFileSwitch(withFrontmatter("'OFF'"))).toBe("OFF");
		expect(readFileSwitch(withFrontmatter("  ON  "))).toBe("ON");
	});

	it("以 ... 闭合的 frontmatter 也能识别", () => {
		const content = ["---", "obsidian-auto-headings: OFF", "...", "# 文档"].join("\n");
		expect(readFileSwitch(content)).toBe("OFF");
	});

	it("取第一个匹配键", () => {
		const content = [
			"---",
			"obsidian-auto-headings: OFF",
			"obsidian-auto-headings: ON",
			"---",
		].join("\n");
		expect(readFileSwitch(content)).toBe("OFF");
	});
});

describe("isDisabledByFrontmatter", () => {
	it("仅 OFF 视为关闭", () => {
		expect(isDisabledByFrontmatter(withFrontmatter("OFF"))).toBe(true);
		expect(isDisabledByFrontmatter(withFrontmatter("ON"))).toBe(false);
		expect(isDisabledByFrontmatter(withFrontmatter("off"))).toBe(false);
		expect(isDisabledByFrontmatter("# 文档")).toBe(false);
	});
});
