import { describe, expect, it } from "vitest";
import { parseHeadings, type Heading } from "../src/parser";
import {
	DEFAULT_TEMPLATE,
	HeadingCounter,
	buildPrefix,
	demoteStrayH1s,
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

	it("渲染中文数字（含十位规范化与大节单位）", () => {
		expect(renderNumeral("cjk", 1)).toBe("一");
		expect(renderNumeral("cjk", 10)).toBe("十");
		expect(renderNumeral("cjk", 11)).toBe("十一");
		expect(renderNumeral("cjk", 20)).toBe("二十");
		expect(renderNumeral("cjk", 105)).toBe("一百零五");
		expect(renderNumeral("cjk", 110)).toBe("一百一十");
		expect(renderNumeral("cjk", 1024)).toBe("一千零二十四");
		expect(renderNumeral("cjk", 10000)).toBe("一万");
		expect(renderNumeral("cjk", 10005)).toBe("一万零五");
	});

	it("渲染带圈数字（含跨区段与超界回退）", () => {
		expect(renderNumeral("circled", 1)).toBe("①");
		expect(renderNumeral("circled", 20)).toBe("⑳");
		expect(renderNumeral("circled", 21)).toBe("㉑");
		expect(renderNumeral("circled", 50)).toBe("㊿");
		expect(renderNumeral("circled", 51)).toBe("(51)");
	});

	it("渲染双射 26 进制字母序列", () => {
		expect(renderNumeral("lower-alpha", 1)).toBe("a");
		expect(renderNumeral("lower-alpha", 26)).toBe("z");
		expect(renderNumeral("lower-alpha", 27)).toBe("aa");
		expect(renderNumeral("lower-alpha", 28)).toBe("ab");
		expect(renderNumeral("upper-alpha", 1)).toBe("A");
		expect(renderNumeral("upper-alpha", 52)).toBe("AZ");
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

describe("非 arabic 序号样式（回归：H3+ 继承前缀曾因父级 arabic 漏配而反复重写）", () => {
	const STYLES = ["cjk", "circled", "lower-alpha", "upper-alpha"] as const;

	/** 构造各级同样式、继承前级、点分、空格分隔的模板。 */
	function templateWith(numeral: (typeof STYLES)[number]): Template {
		const lvl = {
			prefix: "",
			numeral,
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		};
		return {
			name: "t",
			levels: {
				h2: { ...lvl },
				h3: { ...lvl },
				h4: { ...lvl },
				h5: { ...lvl },
				h6: { ...lvl },
			},
			whitelist: [],
		};
	}

	for (const numeral of STYLES) {
		it(`buildPrefix→stripPrefix 在 H3/H4 对 ${numeral} 能干净还原`, () => {
			const tpl = templateWith(numeral);
			const c = new HeadingCounter();
			c.bump(2); // c2=1
			c.bump(3); // c3=1（父级与本级均套用 numeral）
			expect(stripPrefix(buildPrefix(tpl, 3, c) + "标题", 3, tpl)).toBe("标题");
			c.bump(4); // c4=1
			expect(stripPrefix(buildPrefix(tpl, 4, c) + "标题", 4, tpl)).toBe("标题");
		});
	}

	it("cjk 模板连续两次编号结果一致（不累加前缀）", () => {
		const tpl = templateWith("cjk");
		const content = ["# 文档", "## 章", "### 节", "#### 子节"].join("\n");
		const once = renumberContent(content, tpl, { mode: "live" });
		const twice = renumberContent(once, tpl, { mode: "live" });
		expect(twice).toBe(once);
		// 父级各自套用其级别样式（此处各级均 cjk），而非一律阿拉伯。
		expect(once).toContain("### 一.一 节");
		expect(once).toContain("#### 一.一.一 子节");
	});
});

describe("父级序号套用各自级别样式（Bug 1：继承前级时父级不再一律 arabic）", () => {
	/** H2 arabic / H3 lower-alpha / H4 circled / H5 upper-alpha，均继承前级、点分、空格。 */
	function mixedTemplate(): Template {
		const mk = (numeral: Template["levels"]["h2"]["numeral"]): Template["levels"]["h2"] => ({
			prefix: "",
			numeral,
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		});
		return {
			name: "mixed",
			levels: {
				h2: mk("arabic"),
				h3: mk("lower-alpha"),
				h4: mk("circled"),
				h5: mk("upper-alpha"),
				h6: mk("arabic"),
			},
			whitelist: [],
		};
	}

	it("H3/H4/H5 的前缀让父级以各自样式呈现", () => {
		const tpl = mixedTemplate();
		const c = new HeadingCounter();
		c.bump(2); // H2=1
		expect(buildPrefix(tpl, 2, c)).toBe("1 ");
		c.bump(3); // H3=1 → 父级 arabic「1」+ 本级 alpha「a」
		expect(buildPrefix(tpl, 3, c)).toBe("1.a ");
		c.bump(4); // H4=1 → 「1」「a」「①」
		expect(buildPrefix(tpl, 4, c)).toBe("1.a.① ");
		c.bump(5); // H5=1 → 「1」「a」「①」「A」
		expect(buildPrefix(tpl, 5, c)).toBe("1.a.①.A ");
	});

	it("buildPrefix→stripPrefix 在混合样式下能干净还原（含跨级路径）", () => {
		const tpl = mixedTemplate();
		const c = new HeadingCounter();
		c.bump(2);
		c.bump(3);
		c.bump(4);
		c.bump(5);
		const prefixed = buildPrefix(tpl, 5, c) + "标题";
		expect(prefixed).toBe("1.a.①.A 标题");
		expect(stripPrefix(prefixed, 5, tpl)).toBe("标题");
	});

	it("混合样式整文编号幂等（连续两次结果一致）", () => {
		const tpl = mixedTemplate();
		const content = ["# 文档", "## 章", "### 节", "#### 子节", "##### 细目"].join("\n");
		const once = renumberContent(content, tpl, { mode: "live" });
		const twice = renumberContent(once, tpl, { mode: "live" });
		expect(twice).toBe(once);
		expect(once).toContain("### 1.a 节");
		expect(once).toContain("#### 1.a.① 子节");
		expect(once).toContain("##### 1.a.①.A 细目");
	});
});

describe("模板样式变更后不重复叠加前缀（Bug 2：改默认模板后出现重复编号）", () => {
	function uniform(numeral: Template["levels"]["h2"]["numeral"]): Template {
		const lvl: Template["levels"]["h2"] = {
			prefix: "",
			numeral,
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		};
		return {
			name: "t",
			levels: { h2: lvl, h3: lvl, h4: lvl, h5: lvl, h6: lvl },
			whitelist: [],
		};
	}

	/** 在 uniform 模板基础上把某一级换成另一种样式。 */
	function withLevel(
		base: Template,
		key: keyof Template["levels"],
		numeral: Template["levels"]["h2"]["numeral"],
	): Template {
		return {
			...base,
			levels: { ...base.levels, [key]: { ...base.levels[key], numeral } },
		};
	}

	it("某级样式从带圈改为阿拉伯后，旧带圈前缀被剥离而非叠加", () => {
		// 旧模板 H4 = circled，H6 也 = circled（对应用户场景：带圈样式仍在模板中存在）。
		const oldTpl = withLevel(withLevel(uniform("arabic"), "h4", "circled"), "h6", "circled");
		const content = ["# 文档", "## 章", "### 节", "#### 子节"].join("\n");
		const formatted = renumberContent(content, oldTpl, { mode: "live" });
		expect(formatted).toContain("#### 1.1.① 子节");

		// 新模板把 H4 改成 arabic，但 circled 仍被 H6 使用 → 并集仍含 circled，旧前缀可被剥离。
		const newTpl = withLevel(oldTpl, "h4", "arabic");
		const renum = renumberContent(formatted, newTpl, { mode: "live" });
		// 不应出现「1.1.1 1.1.① 子节」这种叠加；旧前缀被剥离，仅留新前缀。
		expect(renum).toContain("#### 1.1.1 子节");
		expect(renum).not.toContain("①");
	});

	it("清理已叠加多层的脏前缀（循环剥离）", () => {
		// 模拟用户文件里已经叠加了两层前缀：H4 现为 arabic，但模板里 H6 仍用 circled，
		// 故并集含 circled，arabic 层与 circled 层都能被逐层剥掉。
		const newTpl = withLevel(uniform("arabic"), "h6", "circled");
		const dirty = "1.1.1 1.1.① 少见多怪";
		expect(stripPrefix(dirty, 4, newTpl)).toBe("少见多怪");
	});

	it("并集仅含模板在用样式：纯阿拉伯模板不会误伤以英文词开头的标题", () => {
		const tpl = uniform("arabic");
		// 纯阿拉伯模板的并集只有 \d+，不含字母类，故「API 设计」安全。
		expect(stripPrefix("API 设计", 2, tpl)).toBe("API 设计");
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

describe("demoteStrayH1s", () => {
	it("首个 H1 不变；无错位 H1 时内容原样", () => {
		const content = ["# 文档", "## 章", "### 节"].join("\n");
		expect(demoteStrayH1s(content, "live")).toBe(content);
		expect(demoteStrayH1s(content, "format")).toBe(content);
	});

	it("实时模式：错位 H1 仅改本行，不触动子树", () => {
		const content = ["# 我的文档", "## 第一章", "# 附录", "## 小节"].join("\n");
		const expected = ["# 我的文档", "## 第一章", "## 附录", "## 小节"].join("\n");
		expect(demoteStrayH1s(content, "live")).toBe(expected);
	});

	it("格式化模式：错位 H1 级联降级，子树整体下移一级", () => {
		// 对应 README 3.4 示例。
		const content = [
			"# 我的文档",
			"## 第一章",
			"### 细节",
			"### 细节",
			"# 附录",
			"## 小节",
		].join("\n");
		const expected = [
			"# 我的文档",
			"## 第一章",
			"### 细节",
			"### 细节",
			"## 附录",
			"### 小节",
		].join("\n");
		expect(demoteStrayH1s(content, "format")).toBe(expected);
	});

	it("格式化模式：多个错位 H1，各自子树均下移一级", () => {
		const content = ["# 文档", "## A", "# 错位一", "## B", "# 错位二", "## C"].join("\n");
		const expected = ["# 文档", "## A", "## 错位一", "### B", "## 错位二", "### C"].join("\n");
		expect(demoteStrayH1s(content, "format")).toBe(expected);
	});

	it("格式化模式：降级封顶 H6（H6 子树不溢出为 7 个 #）", () => {
		const content = ["# 文档", "# 错位", "###### 深节"].join("\n");
		const expected = ["# 文档", "## 错位", "###### 深节"].join("\n");
		expect(demoteStrayH1s(content, "format")).toBe(expected);
	});

	it("不触动代码块内的 # 行", () => {
		const content = ["# 文档", "# 错位", "```", "# 注释", "```"].join("\n");
		const expected = ["# 文档", "## 错位", "```", "# 注释", "```"].join("\n");
		expect(demoteStrayH1s(content, "format")).toBe(expected);
	});
});

describe("renumberContent 的 H1 双模式", () => {
	it("实时模式：错位 H1 改为 H2 并参与编号，子树不级联", () => {
		const content = ["# 我的文档", "## 第一章", "# 附录", "## 小节"].join("\n");
		// 附录 → ## 编号为 2；其原子树 ## 小节仍是 H2，编号为 3（实时不级联）。
		const expected = ["# 我的文档", "## 1 第一章", "## 2 附录", "## 3 小节"].join("\n");
		expect(renumberContent(content, DEFAULT_TEMPLATE, { mode: "live" })).toBe(expected);
	});

	it("格式化模式：错位 H1 级联降级后再编号", () => {
		const content = ["# 我的文档", "## 第一章", "# 附录", "## 小节"].join("\n");
		// 附录 → ## 编号 2；小节级联为 ### 编号 2.1。
		const expected = ["# 我的文档", "## 1 第一章", "## 2 附录", "### 2.1 小节"].join("\n");
		expect(renumberContent(content, DEFAULT_TEMPLATE, { mode: "format" })).toBe(expected);
	});

	it("缺省模式为实时模式", () => {
		const content = ["# 文档", "# 错位", "## 子"].join("\n");
		const live = renumberContent(content, DEFAULT_TEMPLATE, { mode: "live" });
		expect(renumberContent(content)).toBe(live);
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
