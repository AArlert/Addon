import { describe, expect, it } from "vitest";
import { parseHeadings, type Heading } from "../../src/parser";
import {
	DEFAULT_SKIP_FILL,
	DEFAULT_TEMPLATE,
	DEFAULT_TOP_LEVEL,
	HeadingCounter,
	buildPrefix,
	numberHeadings,
	renderNumeral,
	renumberContent,
	stripPrefix,
	type SkipFill,
	type Template,
} from "../../src/numbering";

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
		expect(c.sequence(3)).toEqual([0, 1, 2]); // [c1, c2, c3]
		c.bump(2); // c2=2, c3 归零
		expect(c.current(3)).toBe(0);
		expect(c.sequence(2)).toEqual([0, 2]); // [c1, c2]
	});

	it("sequence 返回 H1 到指定级别的计数序列", () => {
		const c = new HeadingCounter();
		c.bump(2);
		c.bump(3);
		c.bump(4);
		expect(c.sequence(4)).toEqual([0, 1, 1, 1]); // [c1, c2, c3, c4]
	});

	it("H1 也参与计数：bump(1) 累加并归零更深级别", () => {
		const c = new HeadingCounter();
		c.bump(1); // c1=1
		c.bump(2); // c2=1
		expect(c.sequence(2)).toEqual([1, 1]);
		c.bump(1); // c1=2，c2 归零
		expect(c.current(2)).toBe(0);
		expect(c.sequence(1)).toEqual([2]);
	});

	it("reset 清空全部计数器", () => {
		const c = new HeadingCounter();
		c.bump(2);
		c.bump(3);
		c.reset();
		expect(c.sequence(6)).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it("拒绝越界级别（仅 1–6 合法）", () => {
		const c = new HeadingCounter();
		expect(() => c.bump(0)).toThrow();
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
					suffix: "",
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
					suffix: "",
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

	it("后缀字段：前缀 + 序号 + 后缀 + 标题间隔符（「第1章」式）", () => {
		const template: Template = {
			...DEFAULT_TEMPLATE,
			levels: {
				...DEFAULT_TEMPLATE.levels,
				h2: {
					prefix: "第",
					numeral: "arabic",
					suffix: "章",
					numberSeparator: ".",
					titleSeparator: " ",
					inherit: true,
				},
			},
		};
		const c = new HeadingCounter();
		c.bump(2);
		expect(buildPrefix(template, 2, c)).toBe("第1章 ");
		// 后缀作用于完整序号：继承父级时为「第1.1章」而非把后缀塞进每段。
		c.bump(3);
		expect(buildPrefix(template, 3, c)).toBe("1.1 "); // H3 沿用默认（无前后缀）
		const prefixed = buildPrefix(template, 2, c) + "标题";
		expect(prefixed).toBe("第1章 标题");
		// 带前后缀的前缀也能被干净剥离（幂等）。
		expect(stripPrefix(prefixed, 2, template)).toBe("标题");
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
			suffix: "",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		};
		return {
			name: "t",
			levels: {
				h1: { ...lvl },
				h2: { ...lvl },
				h3: { ...lvl },
				h4: { ...lvl },
				h5: { ...lvl },
				h6: { ...lvl },
			},
			whitelist: [],
			skipFill: DEFAULT_SKIP_FILL,
			topLevel: DEFAULT_TOP_LEVEL,
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
		const once = renumberContent(content, tpl);
		const twice = renumberContent(once, tpl);
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
			suffix: "",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		});
		return {
			name: "mixed",
			levels: {
				h1: mk("arabic"),
				h2: mk("arabic"),
				h3: mk("lower-alpha"),
				h4: mk("circled"),
				h5: mk("upper-alpha"),
				h6: mk("arabic"),
			},
			whitelist: [],
			skipFill: DEFAULT_SKIP_FILL,
			topLevel: DEFAULT_TOP_LEVEL,
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
		const once = renumberContent(content, tpl);
		const twice = renumberContent(once, tpl);
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
			suffix: "",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		};
		return {
			name: "t",
			levels: { h1: lvl, h2: lvl, h3: lvl, h4: lvl, h5: lvl, h6: lvl },
			whitelist: [],
			skipFill: DEFAULT_SKIP_FILL,
			topLevel: DEFAULT_TOP_LEVEL,
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
		const formatted = renumberContent(content, oldTpl);
		expect(formatted).toContain("#### 1.1.① 子节");

		// 新模板把 H4 改成 arabic，但 circled 仍被 H6 使用 → 并集仍含 circled，旧前缀可被剥离。
		const newTpl = withLevel(oldTpl, "h4", "arabic");
		const renum = renumberContent(formatted, newTpl);
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

	it("末段 token 仅含模板在用的字母样式：纯阿拉伯模板不误伤以英文词开头的标题", () => {
		const tpl = uniform("arabic");
		// 纯阿拉伯模板的末段 token 不含字母类，故「API 设计」「TODO 列表」安全。
		expect(stripPrefix("API 设计", 2, tpl)).toBe("API 设计");
		expect(stripPrefix("TODO 列表", 3, tpl)).toBe("TODO 列表");
	});

	it("某级中文改回阿拉伯后（模板再无 cjk）旧 cjk 前缀仍被剥离，不叠加（用户报告：1.2.1 1.二.1）", () => {
		// 旧模板：H3 = 中文，其余阿拉伯；格式化后 H4 前缀形如「1.二.1」（父级 H3 以中文呈现）。
		const oldTpl = withLevel(uniform("arabic"), "h3", "cjk");
		const content = ["# 文档", "## 章", "### 前节", "### 后节", "#### 子节"].join("\n");
		const formatted = renumberContent(content, oldTpl);
		expect(formatted).toContain("#### 1.二.1 子节");

		// 新模板：H3 改回阿拉伯 → 模板里已无任何 cjk 级；旧「二」必须仍能被剥离、不被叠加。
		const newTpl = uniform("arabic");
		const renum = renumberContent(formatted, newTpl);
		expect(renum).toContain("#### 1.2.1 子节");
		expect(renum).not.toContain("1.二"); // 不应残留旧中文序号段
		expect(renum).not.toContain("1.2.1 1."); // 不应出现「新前缀 + 旧前缀」叠加
		// 再跑一次保持幂等。
		expect(renumberContent(renum, newTpl)).toBe(renum);
	});

	it("直接清理用户文件里已叠加的「1.2.1 1.二.1」脏前缀（模板已无 cjk 仍能剥）", () => {
		const newTpl = uniform("arabic"); // 模板里没有任何 cjk 级
		expect(stripPrefix("1.2.1 1.二.1 小节", 4, newTpl)).toBe("小节");
	});

	it("内层放宽到全样式不误伤多段英文：纯阿拉伯模板下「a.b.c 记法」不被剥", () => {
		const tpl = uniform("arabic");
		// 父段虽放宽到全样式，但末段「c」非 arabic/cjk/带圈、字母样式也未启用 → 整体不命中。
		expect(stripPrefix("a.b.c 记法", 4, tpl)).toBe("a.b.c 记法");
	});
});

describe("numberHeadings", () => {
	function headingsOf(content: string): Heading[] {
		return parseHeadings(content);
	}

	it("默认起始层级 H2：H1 不写前缀（低于起始层级）", () => {
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

describe("多个 H1 与起始编号层级 topLevel", () => {
	/** 在默认模板基础上替换 topLevel。 */
	function withTopLevel(topLevel: number): Template {
		return { ...DEFAULT_TEMPLATE, topLevel };
	}

	it("默认 topLevel=H2：插件不改写 # 层级，多个 H1 原样保留、均不编号", () => {
		const content = ["# 第一篇", "## A", "# 第二篇", "## B"].join("\n");
		const result = renumberContent(content);
		// H1 行完全不动；H2 各自编号（见下条会验证 B 重置为 1）。
		expect(result.split("\n")[0]).toBe("# 第一篇");
		expect(result.split("\n")[2]).toBe("# 第二篇");
	});

	it("超出编号范围的 H1 是重置边界：第二篇的 H2 重新从 1 起", () => {
		const content = ["# 第一篇", "## A", "## B", "# 第二篇", "## C"].join("\n");
		const expected = ["# 第一篇", "## 1 A", "## 2 B", "# 第二篇", "## 1 C"].join("\n");
		expect(renumberContent(content)).toBe(expected);
	});

	it("topLevel=H1：所有 H1 都编号，其下 H2 各自重置", () => {
		const content = ["# 甲", "## A", "## B", "# 乙", "## C"].join("\n");
		const expected = ["# 1 甲", "## 1.1 A", "## 1.2 B", "# 2 乙", "## 2.1 C"].join("\n");
		expect(renumberContent(content, withTopLevel(1))).toBe(expected);
	});

	it("topLevel=H1：H1 不写前缀的标题（无 H2）也逐个编号", () => {
		const content = ["# 一", "# 二", "# 三"].join("\n");
		const expected = ["# 1 一", "# 2 二", "# 3 三"].join("\n");
		expect(renumberContent(content, withTopLevel(1))).toBe(expected);
	});

	it("topLevel=H3：H1/H2 不编号且原样保留，H3 起以 H3 为第一段", () => {
		const content = ["# 文档", "## 章", "### 甲", "### 乙", "## 章二", "### 丙"].join("\n");
		const expected = ["# 文档", "## 章", "### 1 甲", "### 2 乙", "## 章二", "### 1 丙"].join(
			"\n",
		);
		expect(renumberContent(content, withTopLevel(3))).toBe(expected);
	});

	it("低于起始层级的标题不被剥离（不误伤「2024 总结」这类标题）", () => {
		const content = ["# 2024 总结", "## 正文"].join("\n");
		const result = renumberContent(content);
		expect(result.split("\n")[0]).toBe("# 2024 总结"); // H1 原样，未被当前缀剥掉
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
		// H4 直接出现：缺失的 H3（c3=0）如实以「0」呈现，使 H4 保有三段、与其深度一致，
		// 故为 1.0.1 而非把 H4 当 H3 的 1.1（缺失祖先以 0 显式占位）。
		expect(result).toBe(["## 1 章", "#### 1.0.1 跳级"].join("\n"));
	});

	it("H3 后直接跟 H5：H5 保有四段而非被当作 H4（缺失 H4 以 0 占位）", () => {
		const content = ["## 章", "### 节", "##### 细目甲", "##### 细目乙"].join("\n");
		const result = renumberContent(content);
		expect(result).toBe(
			["## 1 章", "### 1.1 节", "##### 1.1.0.1 细目甲", "##### 1.1.0.2 细目乙"].join("\n"),
		);
	});

	it("跳级 H5 在前、随后真实 H4 仍从 1 开始（0 占位不借号）", () => {
		const content = ["## 章", "### 节", "##### 细目", "#### 子节"].join("\n");
		const result = renumberContent(content);
		// 跳级的 H5 把缺失 H4 以 0 占位呈现，但 c4 仍为 0；首个真实 H4 才把 c4 累加到 1，
		// 故为 1.1.1（而非被借号成 1.1.2）。
		expect(result).toBe(
			["## 1 章", "### 1.1 节", "##### 1.1.0.1 细目", "#### 1.1.1 子节"].join("\n"),
		);
	});

	it("默认即使用内置默认模板", () => {
		expect(renumberContent("## 章")).toBe("## 1 章");
	});
});

describe("跳级占位策略 skipFill（每个模板各自决定）", () => {
	/** 在默认模板基础上替换 skipFill 策略。 */
	function withSkipFill(skipFill: SkipFill): Template {
		return { ...DEFAULT_TEMPLATE, skipFill };
	}

	const content = ["## 章", "### 节", "##### 细目甲", "##### 细目乙", "#### 子节"].join("\n");

	it("fill「0」：缺失中间层级补 0（默认）", () => {
		const result = renumberContent(content, withSkipFill({ mode: "fill", placeholder: "0" }));
		expect(result).toBe(
			[
				"## 1 章",
				"### 1.1 节",
				"##### 1.1.0.1 细目甲",
				"##### 1.1.0.2 细目乙",
				"#### 1.1.1 子节",
			].join("\n"),
		);
	});

	it("fill「1」：缺失中间层级补 1", () => {
		const result = renumberContent(content, withSkipFill({ mode: "fill", placeholder: "1" }));
		expect(result).toBe(
			[
				"## 1 章",
				"### 1.1 节",
				"##### 1.1.1.1 细目甲",
				"##### 1.1.1.2 细目乙",
				"#### 1.1.1 子节",
			].join("\n"),
		);
	});

	it("fill 数字占位「9」：缺失中间层级补该数字，且能幂等剥离", () => {
		const tpl = withSkipFill({ mode: "fill", placeholder: "9" });
		const once = renumberContent(content, tpl);
		expect(once).toContain("##### 1.1.9.1 细目甲");
		expect(once).toContain("##### 1.1.9.2 细目乙");
		// 再次编号应幂等（数字占位被 arabic token 识别剥离，不重复叠加）。
		expect(renumberContent(once, tpl)).toBe(once);
	});

	it("fill 非数字占位被收口为 0（仅允许数字，保证可干净剥离）", () => {
		// 直接传非数字占位，引擎规范化时滤除非数字、回退 0。
		const tpl = withSkipFill({ mode: "fill", placeholder: "-" });
		const once = renumberContent(content, tpl);
		expect(once).toContain("##### 1.1.0.1 细目甲");
		expect(once).not.toContain("1.1.-.1");
	});

	it("drop：不补位，缺失中间层级整段省略（H5 呈现为三段）", () => {
		const result = renumberContent(content, withSkipFill({ mode: "drop" }));
		expect(result).toBe(
			[
				"## 1 章",
				"### 1.1 节",
				"##### 1.1.1 细目甲",
				"##### 1.1.2 细目乙",
				"#### 1.1.1 子节",
			].join("\n"),
		);
	});

	it("fill 占位为空时按 0 处理（规范化兜底，避免空段）", () => {
		const result = renumberContent(content, withSkipFill({ mode: "fill", placeholder: "" }));
		expect(result).toContain("##### 1.1.0.1 细目甲");
	});
});
