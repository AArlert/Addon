import { describe, expect, it } from "vitest";
import { parseHeadings, type Heading } from "../src/parser";
import {
	DEFAULT_TEMPLATE,
	HeadingCounter,
	buildPrefix,
	numberHeadings,
	renderNumeral,
	renumberContent,
	stripPrefix,
	type Template,
} from "../src/numbering";

describe("HeadingCounter", () => {
	it("同级标题依次累加", () => {
		const c = new HeadingCounter();
		c.bump(2);
		expect(c.current(2)).toBe(1);
		c.bump(2);
		expect(c.current(2)).toBe(2);
	});

	it("推进父级时将更深级别归零", () => {
		const c = new HeadingCounter();
		c.bump(2); // c2=1
		c.bump(3); // c3=1
		c.bump(3); // c3=2
		expect(c.sequence(3)).toEqual([1, 2]);
		c.bump(2); // c2=2, c3 归零
		expect(c.current(3)).toBe(0);
		expect(c.sequence(2)).toEqual([2]);
	});

	it("sequence 返回 H2 到指定级别的计数序列", () => {
		const c = new HeadingCounter();
		c.bump(2);
		c.bump(3);
		c.bump(4);
		expect(c.sequence(4)).toEqual([1, 1, 1]);
	});

	it("reset 清空全部计数器", () => {
		const c = new HeadingCounter();
		c.bump(2);
		c.bump(3);
		c.reset();
		expect(c.sequence(6)).toEqual([0, 0, 0, 0, 0]);
	});

	it("拒绝越界级别", () => {
		const c = new HeadingCounter();
		expect(() => c.bump(1)).toThrow();
		expect(() => c.bump(7)).toThrow();
	});
});

describe("renderNumeral", () => {
	it("渲染阿拉伯数字", () => {
		expect(renderNumeral("arabic", 1)).toBe("1");
		expect(renderNumeral("arabic", 42)).toBe("42");
	});

	it("非阿拉伯样式在本里程碑尚未实现", () => {
		expect(() => renderNumeral("cjk", 1)).toThrow();
	});
});

describe("buildPrefix（默认模板）", () => {
	it("继承前级时跨级以序号间隔符拼接", () => {
		const c = new HeadingCounter();
		c.bump(2);
		expect(buildPrefix(DEFAULT_TEMPLATE, 2, c)).toBe("1 ");
		c.bump(3);
		expect(buildPrefix(DEFAULT_TEMPLATE, 3, c)).toBe("1.1 ");
		c.bump(4);
		expect(buildPrefix(DEFAULT_TEMPLATE, 4, c)).toBe("1.1.1 ");
	});

	it("关闭继承前级时仅呈现本级序号", () => {
		const template: Template = {
			...DEFAULT_TEMPLATE,
			levels: {
				...DEFAULT_TEMPLATE.levels,
				h3: {
					prefix: "",
					numeral: "arabic",
					numberSeparator: ".",
					titleSeparator: ") ",
					inherit: false,
				},
			},
		};
		const c = new HeadingCounter();
		c.bump(2);
		c.bump(3);
		c.bump(3);
		expect(buildPrefix(template, 3, c)).toBe("2) ");
	});

	it("应用前缀与标题间隔符字段", () => {
		const template: Template = {
			...DEFAULT_TEMPLATE,
			levels: {
				...DEFAULT_TEMPLATE.levels,
				h2: {
					prefix: "第",
					numeral: "arabic",
					numberSeparator: ".",
					titleSeparator: "章 ",
					inherit: true,
				},
			},
		};
		const c = new HeadingCounter();
		c.bump(2);
		expect(buildPrefix(template, 2, c)).toBe("第1章 ");
	});
});

describe("stripPrefix（默认模板）", () => {
	it("剥离单级与多级阿拉伯前缀", () => {
		expect(stripPrefix("1 标题", 2, DEFAULT_TEMPLATE)).toBe("标题");
		expect(stripPrefix("1.2.3 标题", 4, DEFAULT_TEMPLATE)).toBe("标题");
	});

	it("无前缀时原样返回", () => {
		expect(stripPrefix("没有编号的标题", 2, DEFAULT_TEMPLATE)).toBe("没有编号的标题");
	});

	it("重复运行 buildPrefix→stripPrefix 能干净还原", () => {
		const c = new HeadingCounter();
		c.bump(2);
		c.bump(3);
		const prefixed = buildPrefix(DEFAULT_TEMPLATE, 3, c) + "标题";
		expect(stripPrefix(prefixed, 3, DEFAULT_TEMPLATE)).toBe("标题");
	});
});

describe("numberHeadings", () => {
	function headingsOf(content: string): Heading[] {
		return parseHeadings(content);
	}

	it("首个 H1 不编号、不计数", () => {
		const result = numberHeadings(headingsOf("# 文档标题\n## 第一章"), DEFAULT_TEMPLATE);
		expect(result[0].prefix).toBeNull();
		expect(result[1].prefix).toBe("1 ");
	});

	it("对 H2–H6 完整编号", () => {
		const content = ["# 标题", "## 章", "### 节", "### 节", "## 章"].join("\n");
		const result = numberHeadings(headingsOf(content), DEFAULT_TEMPLATE);
		expect(result.map((h) => h.prefix)).toEqual([null, "1 ", "1.1 ", "1.2 ", "2 "]);
	});

	it("剥离已有前缀后重新编号（幂等）", () => {
		const content = ["# 标题", "## 9 旧编号", "### 7.3 旧编号"].join("\n");
		const result = numberHeadings(headingsOf(content), DEFAULT_TEMPLATE);
		expect(result[1].numberedLine).toBe("## 1 旧编号");
		expect(result[2].numberedLine).toBe("### 1.1 旧编号");
	});

	it("白名单标题不写前缀且不占计数器槽位（不跳号）", () => {
		const content = ["# 标题", "## 章", "## 参考文献", "## 章"].join("\n");
		const isWhitelisted = (h: Heading) => h.text.trim() === "参考文献";
		const result = numberHeadings(headingsOf(content), DEFAULT_TEMPLATE, { isWhitelisted });
		expect(result.map((h) => h.prefix)).toEqual([null, "1 ", null, "2 "]);
	});

	it("白名单子标题在父级未变时正常编号、不跳号", () => {
		// 对应 README 3.5 示例：H3 白名单不占槽位，其后 H3 仍从 1 起。
		const content = ["# 标题", "## 章", "### 白名单节", "### 正常节"].join("\n");
		const isWhitelisted = (h: Heading) => h.text === "白名单节";
		const result = numberHeadings(headingsOf(content), DEFAULT_TEMPLATE, { isWhitelisted });
		expect(result.map((h) => h.prefix)).toEqual([null, "1 ", null, "1.1 "]);
	});
});

describe("renumberContent", () => {
	it("仅改写标题行，正文与代码块原样保留", () => {
		const content = ["# 文档", "正文一", "## 章", "```", "# 代码注释", "```", "### 节"].join(
			"\n",
		);
		const expected = [
			"# 文档",
			"正文一",
			"## 1 章",
			"```",
			"# 代码注释",
			"```",
			"### 1.1 节",
		].join("\n");
		expect(renumberContent(content)).toBe(expected);
	});

	it("无 H2 及以上标题时内容保持不变", () => {
		const content = ["# 仅有文档标题", "正文"].join("\n");
		expect(renumberContent(content)).toBe(content);
	});

	it("处理标题层级跳跃（H2 → H4）", () => {
		const content = ["## 章", "#### 跳级"].join("\n");
		const result = renumberContent(content);
		// H4 直接出现：缺失的 H3（c3=0）不实例化、不参与拼接，故为 1.1 而非 1.0.1。
		expect(result).toBe(["## 1 章", "#### 1.1 跳级"].join("\n"));
	});

	it("默认即使用内置默认模板", () => {
		expect(renumberContent("## 章")).toBe("## 1 章");
	});
});
