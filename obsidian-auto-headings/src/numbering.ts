/**
 * 标题编号引擎（Milestone 1）。
 *
 * 包含三部分：
 * 1. 模板数据模型与内置默认模板（硬编码，用于验证输出正确性）。
 * 2. 计数器状态机 {@link HeadingCounter}：随层级累加、随层级变化将更深层级归零；
 *    白名单标题既不累加也不归零（不占槽位、不跳号）。
 * 3. 前缀拼装、已有前缀剥离，以及把整篇文档重新编号的 {@link renumberContent}。
 *
 * 本里程碑仅实现 `arabic` 序号样式的渲染；`cjk` / `circled` / `lower-alpha` /
 * `upper-alpha` 的渲染留待 Milestone 3。默认模板全部使用 `arabic`，因此本里程碑
 * 的输出可被完整验证。
 */

import { Heading, parseHeadings } from "./parser";

/** 序号样式枚举（见 README 3.6）。 */
export type NumeralStyle =
	| "arabic"
	| "cjk"
	| "circled"
	| "lower-alpha"
	| "upper-alpha"
	| "lower-roman"
	| "upper-roman";

/** 起始编号层级的默认值：H2（即默认 H1 不编号、作为标题/分节）。 */
export const DEFAULT_TOP_LEVEL = 2;

/** 结束编号层级的默认值：H6（即默认无下界，最深的 H6 仍参与编号）。 */
export const DEFAULT_BOTTOM_LEVEL = 6;

/**
 * 「祖先序号渲染」策略：继承前级时，前缀里的**祖先段**（比当前级浅的各段）以何种样式呈现。
 *
 * - `self`（默认，向后兼容历史行为）：每个祖先段套用**它自己级别**的 `numeral` 样式。
 *   适合「提纲惯例」——H3=字母、H4=带圈时 H4 得 `1.a.①`（祖先保留各自字形）。
 * - `arabic`：所有祖先段一律渲染为**阿拉伯数字**，仅当前级（末段）套用其自身样式。
 *   适合「中文书惯例」——H2=中文、H3=阿拉伯时得 `一`（H2 标题行）/ `1.1`（H3，祖先转阿拉伯）。
 *
 * 注意：仅影响**祖先段**；当前级（末段）始终套用本级 `numeral`。两种惯例方向相反、无法靠单一
 * 固定模型兼得，故做成每模板可选（见 spec.md §3.6）。
 */
export type AncestorNumeral = "self" | "arabic";

/** 「祖先序号渲染」默认值：`self`（=历史行为，祖先各自套用自身样式）。 */
export const DEFAULT_ANCESTOR_NUMERAL: AncestorNumeral = "self";

/** 规范化「祖先序号渲染」：非法/缺失（含旧模板）回退默认 `self`。 */
export function normalizeAncestorNumeral(value: unknown): AncestorNumeral {
	return value === "arabic" ? "arabic" : "self";
}

/**
 * 规范化「起始编号层级」`topLevel`：夹到合法范围 [1, 6]，非数字回退默认 H2。
 * 含义：比 `topLevel` 浅的标题完全不编号、不改写；它及更深的标题正常编号，并以它为序号第一段。
 */
export function normalizeTopLevel(value: unknown): number {
	const n = Math.round(Number(value));
	if (!Number.isFinite(n)) {
		return DEFAULT_TOP_LEVEL;
	}
	return Math.min(6, Math.max(1, n));
}

/**
 * 规范化「结束编号层级」`bottomLevel`：夹到合法范围 [1, 6]，非数字回退默认 H6（无下界）。
 * 含义：比 `bottomLevel` 更深的标题不编号、不输出前缀（与浅于 `topLevel` 的标题对称处理，
 * 仍作为重置边界推进计数器并剥除残留旧前缀）。配合 `topLevel` 即可只编号 H2–H4 这样的区间。
 *
 * 注意：本函数不强制 `bottomLevel >= topLevel`——二者各自独立夹取，区间为空（bottom < top）时
 * 不会有任何层级被编号，属退化但无害情形（GUI 下拉会避免用户配出此状态）。
 */
export function normalizeBottomLevel(value: unknown): number {
	const n = Math.round(Number(value));
	if (!Number.isFinite(n)) {
		return DEFAULT_BOTTOM_LEVEL;
	}
	return Math.min(6, Math.max(1, n));
}

/**
 * 跳级（如 H3 → H5，中间缺 H4）时，缺失中间层级的占位策略（由用户在设置中选择）。
 * - `drop`：**不补位**——丢弃该段，序号段数等于实际存在的层级数（H5 跟在 H3 后呈现为三段、与 H4 同形）。
 * - `fill`：**补位**——以 `placeholder` 字面量填充缺失段，使段数等于标题深度；
 *   `placeholder` 由用户自填（如 `0` 得 `1.1.0.1`、`1` 得 `1.1.1.1`、任意字符如 `-` 得 `1.1.-.1`）。
 */
export type SkipFill = { mode: "drop" } | { mode: "fill"; placeholder: string };

/** 默认占位策略：补 `0`（与历史默认行为一致）。 */
export const DEFAULT_SKIP_FILL: SkipFill = { mode: "fill", placeholder: "0" };

/**
 * 收口占位字符：**仅允许数字**。
 *
 * 原因：{@link stripPrefix} 的剥离并集**恒含** arabic 的 `\d+`（见 {@link templateNumeralStyles}），
 * 故纯数字占位无论之后改成什么、或切到 `drop`，旧前缀都能被干净剥离、不会重复叠加；而 `-`、`*`
 * 等非数字占位在策略变更后会失配残留。这里把非数字字符滤除，空则回退 `0`。
 */
export function sanitizePlaceholder(raw: string): string {
	const digits = (raw ?? "").replace(/\D/g, "");
	return digits.length > 0 ? digits : "0";
}

/**
 * 规范化占位策略：`fill` 模式下占位文本收口为纯数字（见 {@link sanitizePlaceholder}），为空回退 `0`。
 * 用于从持久化数据 / 选项读入后做一次防御性收口。
 */
export function normalizeSkipFill(skipFill: SkipFill | undefined): SkipFill {
	if (!skipFill) {
		return DEFAULT_SKIP_FILL;
	}
	if (skipFill.mode === "drop") {
		return { mode: "drop" };
	}
	return { mode: "fill", placeholder: sanitizePlaceholder(skipFill.placeholder) };
}

/** 单个标题级别（H2–H6）的显示格式。 */
export interface LevelFormat {
	/** 序号前的自定义文本，可为空（如「第」）。 */
	prefix: string;
	/** 本级计数器的呈现形式。 */
	numeral: NumeralStyle;
	/**
	 * 完整序号之后、标题间隔符之前的自定义文本，可为空（如「章」「节」）。
	 * 与 {@link prefix} 配合可实现「第1章」式编号：`prefix`=第、`suffix`=章。
	 * 作用于本级**完整序号**（含继承的父级序号），即 `第1.1章` 而非 `第1章.1章`。
	 */
	suffix: string;
	/** 拼接各级父子序号的符号（如 `.` 得 `1.1`）。 */
	numberSeparator: string;
	/** 完整序号与标题文本之间的文本（如空格、`、`、`. `）。 */
	titleSeparator: string;
	/** 是否拼接父级序号，默认开启；关闭后仅呈现本级序号。 */
	inherit: boolean;
}

/**
 * 白名单条目：由**词语** `text` 与**匹配方式** `match` 组成。
 * - `exact`（全部匹配）：归一化后与条目完全相等，仅豁免该标题自身。
 * - `partial`（部分匹配）：归一化后包含条目子串，仅豁免该标题自身。
 * - `subtree`（子树匹配）：归一化后与条目完全相等的标题为根，连同其整棵子树一并豁免。
 *
 * 命中判定与子树范围计算见 {@link computeWhitelistExemptions}（Milestone 4）。
 */
export interface WhitelistEntry {
	text: string;
	match: "exact" | "partial" | "subtree";
}

/**
 * 默认模板预填充的白名单词表（Milestone 4，见 spec.md §3.7）：覆盖常见的结构性 / 非内容标题，
 * 中英各一组，默认均为「全部匹配」（最不具破坏性，只豁免恰好同名的那一行）。
 * 因匹配大小写不敏感，`References` ≡ `references`。用户可在编辑面板中增删、或改为部分 / 子树。
 *
 * 用函数返回**新数组**，避免被 {@link DEFAULT_TEMPLATE} 与其拷贝共享同一引用而被意外改动。
 */
export function DEFAULT_WHITELIST(): WhitelistEntry[] {
	const words = [
		// 目录          附录         附图       附表
		"目录",
		"Contents",
		"附录",
		"Appendix",
		"附图",
		"Figures",
		"附表",
		"Tables",
		// 参考文献      致谢                摘要        索引
		"参考文献",
		"References",
		"致谢",
		"Acknowledgements",
		"摘要",
		"Abstract",
		"索引",
		"Index",
	];
	return words.map((text) => ({ text, match: "exact" }));
}

/** 一个具名模板：为 H1–H6 各级定义显示格式，并附带白名单、跳级占位策略与起始编号层级。 */
export interface Template {
	name: string;
	levels: {
		h1: LevelFormat;
		h2: LevelFormat;
		h3: LevelFormat;
		h4: LevelFormat;
		h5: LevelFormat;
		h6: LevelFormat;
	};
	whitelist: WhitelistEntry[];
	/**
	 * 跳级（如 H3 → H5）时缺失中间层级的占位策略（见 {@link SkipFill}）。
	 * **由各模板自行决定**：补不补、补什么（`0`/`1`/任意字符）随模板配置；默认补 `0`。
	 */
	skipFill: SkipFill;
	/**
	 * 起始编号层级（1–6，默认 H2，见 {@link normalizeTopLevel}）。
	 * 比它浅的标题完全不编号、不被改写；它及更深的标题正常编号，并以它为序号第一段。
	 * **由各模板自行决定**（默认模板 = 全局默认）。
	 */
	topLevel: number;
	/**
	 * 结束编号层级（1–6，默认 H6，见 {@link normalizeBottomLevel}）。
	 * 比它更深的标题不编号、不输出前缀（与浅于 `topLevel` 的标题对称）。配合 `topLevel`
	 * 即可只编号「H2–H4」这样的区间。默认 H6 = 无下界（历史行为）。**由各模板自行决定**。
	 */
	bottomLevel: number;
	/**
	 * 「祖先序号渲染」策略（见 {@link AncestorNumeral}）：继承前级时祖先段的样式。
	 * 默认 `self`（祖先各自套用自身样式，=历史行为）；`arabic` 则祖先一律阿拉伯。
	 * **由各模板自行决定**。
	 */
	ancestorNumeral: AncestorNumeral;
}

/** 默认模板：纯阿拉伯多级点分（`1` / `1.1` / `1.1.1` …），见 README 默认 `default.json`。 */
export const DEFAULT_TEMPLATE: Template = {
	name: "默认",
	levels: {
		h1: {
			prefix: "",
			numeral: "arabic",
			suffix: "",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		},
		h2: {
			prefix: "",
			numeral: "arabic",
			suffix: "",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		},
		h3: {
			prefix: "",
			numeral: "arabic",
			suffix: "",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		},
		h4: {
			prefix: "",
			numeral: "arabic",
			suffix: "",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		},
		h5: {
			prefix: "",
			numeral: "arabic",
			suffix: "",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		},
		h6: {
			prefix: "",
			numeral: "arabic",
			suffix: "",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		},
	},
	whitelist: DEFAULT_WHITELIST(),
	skipFill: DEFAULT_SKIP_FILL,
	topLevel: DEFAULT_TOP_LEVEL,
	bottomLevel: DEFAULT_BOTTOM_LEVEL,
	ancestorNumeral: DEFAULT_ANCESTOR_NUMERAL,
};

/**
 * 计数器状态机。内部维护 `[c1, c2, c3, c4, c5, c6]`，分别对应 H1–H6。
 * 所有标题（无论是否在编号范围内）都推进计数器：比 `topLevel` 浅的标题虽不输出序号，
 * 但仍累加并归零更深级别，从而充当「重置边界」（多个 H1 各自子节重新从 1 起）。
 * 全程使用纯阿拉伯整数。
 */
export class HeadingCounter {
	/** counts[0] -> H1, …, counts[5] -> H6。 */
	private readonly counts = [0, 0, 0, 0, 0, 0];

	/**
	 * 推进给定级别的计数器：`c[level]` 加一，所有更深级别归零。
	 * @param level 标题级别，必须在 1–6。
	 */
	bump(level: number): void {
		assertCountedLevel(level);
		const idx = level - 1;
		this.counts[idx] += 1;
		for (let i = idx + 1; i < this.counts.length; i++) {
			this.counts[i] = 0;
		}
	}

	/** 返回某级当前的纯阿拉伯计数值。 */
	current(level: number): number {
		assertCountedLevel(level);
		return this.counts[level - 1];
	}

	/**
	 * 返回从 H1 到 `level` 的计数序列（纯阿拉伯整数）。
	 * 例如 level=4 时返回 `[c1, c2, c3, c4]`；拼接前缀时由 {@link buildPrefix} 按 `topLevel` 截取。
	 */
	sequence(level: number): number[] {
		assertCountedLevel(level);
		return this.counts.slice(0, level);
	}

	/** 将所有计数器归零（用于复用同一实例重新编号另一文件）。 */
	reset(): void {
		this.counts.fill(0);
	}
}

function assertCountedLevel(level: number): void {
	if (level < 1 || level > 6) {
		throw new RangeError(`参与计数的标题级别须在 1–6，收到 ${level}`);
	}
}

/** 取模板中对应级别的格式；级别不在 1–6 时返回 undefined。 */
function getLevelFormat(template: Template, level: number): LevelFormat | undefined {
	switch (level) {
		case 1:
			return template.levels.h1;
		case 2:
			return template.levels.h2;
		case 3:
			return template.levels.h3;
		case 4:
			return template.levels.h4;
		case 5:
			return template.levels.h5;
		case 6:
			return template.levels.h6;
		default:
			return undefined;
	}
}

/** CJK 数字基本字符（0–9）。 */
const CJK_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
/** 四位段内的位权单位（个、十、百、千）。 */
const CJK_SMALL_UNITS = ["", "十", "百", "千"];
/** 大节单位（个、万、亿、兆）；每节四位。 */
const CJK_BIG_UNITS = ["", "万", "亿", "兆"];

/** 将 1–9999 的整数转换为中文数字（不含大节单位）。 */
function cjkSection(n: number): string {
	let out = "";
	let pendingZero = false;
	let pos = 0;
	while (n > 0) {
		const d = n % 10;
		if (d === 0) {
			// 仅当已有更高位输出时，才记一个待补的「零」（多个连续零只补一次）。
			if (out !== "") {
				pendingZero = true;
			}
		} else {
			if (pendingZero) {
				out = CJK_DIGITS[0] + out;
				pendingZero = false;
			}
			out = CJK_DIGITS[d] + CJK_SMALL_UNITS[pos] + out;
		}
		n = Math.floor(n / 10);
		pos++;
	}
	return out;
}

/**
 * 将一个正整数渲染为中文数字（简体习惯）。
 * 处理大节单位（万/亿/兆）与节间补零；并将开头的「一十…」规范为「十…」（如 10→十、15→十五）。
 */
function toCJK(value: number): string {
	if (value <= 0) {
		return CJK_DIGITS[0];
	}
	// 拆为每四位一节，sections[0] 为最低节。
	const sections: number[] = [];
	let rest = value;
	while (rest > 0) {
		sections.push(rest % 10000);
		rest = Math.floor(rest / 10000);
	}
	let out = "";
	for (let i = sections.length - 1; i >= 0; i--) {
		const sec = sections[i];
		if (sec === 0) {
			// 空节：若后续仍有非零节，补一个「零」（去重）。
			if (out !== "" && !out.endsWith(CJK_DIGITS[0])) {
				out += CJK_DIGITS[0];
			}
			continue;
		}
		// 非最高节且本节不足千（首位为零）时，节间需补「零」。
		if (out !== "" && sec < 1000 && !out.endsWith(CJK_DIGITS[0])) {
			out += CJK_DIGITS[0];
		}
		out += cjkSection(sec) + CJK_BIG_UNITS[i];
	}
	// 去除因空的最低节而多补的尾随「零」（如 10000 → 一万，而非 一万零）。
	while (out.endsWith(CJK_DIGITS[0])) {
		out = out.slice(0, -1);
	}
	// 规范化：开头的「一十」习惯写作「十」（10→十、11→十一、19→十九）。
	if (out.startsWith("一十")) {
		out = out.slice(1);
	}
	return out;
}

/** 带圈数字的各区段起点（Unicode），用于 1–50 的渲染。 */
const CIRCLED_RANGES: { start: number; from: number; to: number }[] = [
	{ start: 0x2460, from: 1, to: 20 }, // ①–⑳
	{ start: 0x3251, from: 21, to: 35 }, // ㉑–㉟
	{ start: 0x32b1, from: 36, to: 50 }, // ㊱–㊿
];

/** 将 1–50 的整数渲染为带圈数字；超出范围回退为 `(n)`。 */
function toCircled(value: number): string {
	for (const r of CIRCLED_RANGES) {
		if (value >= r.from && value <= r.to) {
			return String.fromCodePoint(r.start + (value - r.from));
		}
	}
	return `(${value})`;
}

/**
 * 将正整数渲染为双射 26 进制字母序列（a, b, …, z, aa, ab, …）。
 * `base` 为字母表起点的码位（小写 'a' 或大写 'A'）。
 */
function toAlpha(value: number, base: number): string {
	if (value <= 0) {
		return String(value);
	}
	let n = value;
	let out = "";
	while (n > 0) {
		n -= 1; // 双射：无「零位」，故每位先减一。
		out = String.fromCharCode(base + (n % 26)) + out;
		n = Math.floor(n / 26);
	}
	return out;
}

/** 罗马数字值-字母对照表（减法规则，降序排列）。 */
const ROMAN_MAP: readonly [number, string][] = [
	[1000, "m"],
	[900, "cm"],
	[500, "d"],
	[400, "cd"],
	[100, "c"],
	[90, "xc"],
	[50, "l"],
	[40, "xl"],
	[10, "x"],
	[9, "ix"],
	[5, "v"],
	[4, "iv"],
	[1, "i"],
];

/** 将正整数渲染为罗马数字；`uppercase` 为 true 时输出大写。超出范围（<1）回退为阿拉伯。 */
function toRoman(value: number, uppercase: boolean): string {
	if (value < 1) {
		return String(value);
	}
	let n = value;
	let out = "";
	for (const [v, s] of ROMAN_MAP) {
		while (n >= v) {
			out += s;
			n -= v;
		}
	}
	return uppercase ? out.toUpperCase() : out;
}

/**
 * 将一个纯阿拉伯整数渲染为指定序号样式的字符串。
 * 支持 `arabic` / `cjk` / `circled` / `lower-alpha` / `upper-alpha` /
 * `lower-roman` / `upper-roman`（见 README 3.6）。
 */
export function renderNumeral(style: NumeralStyle, value: number): string {
	switch (style) {
		case "arabic":
			return String(value);
		case "cjk":
			return toCJK(value);
		case "circled":
			return toCircled(value);
		case "lower-alpha":
			return toAlpha(value, 0x61); // 'a'
		case "upper-alpha":
			return toAlpha(value, 0x41); // 'A'
		case "lower-roman":
			return toRoman(value, false);
		case "upper-roman":
			return toRoman(value, true);
	}
}

/**
 * 依据模板与当前计数器状态，为某级标题拼装编号前缀。
 *
 * 序号段从模板的 `topLevel` 起算（而非固定 H2）：如 `topLevel=H1` 时 H2 前缀为 `1.1`、
 * `topLevel=H3` 时 H4 前缀为 `1.1`（只取 H3–H4 两段）。仅应对 `level >= topLevel` 调用。
 *
 * - 继承前级 = 开：`prefix + 各级序号（以 numberSeparator 拼接，每级各自套用其样式）+ suffix + titleSeparator + {@link WORD_JOINER}`。
 * - 继承前级 = 关：`prefix + 本级序号 + suffix + titleSeparator + {@link WORD_JOINER}`。
 *
 * 末尾追加 {@link WORD_JOINER}（U+2060）作为精确结束标记，导出 / 复制不可见，消除前缀与正文的歧义。
 */
export function buildPrefix(template: Template, level: number, counter: HeadingCounter): string {
	const fmt = getLevelFormat(template, level);
	if (!fmt) {
		throw new RangeError(`无法为级别 ${level} 拼装前缀（仅支持 H1–H6）`);
	}
	const top = normalizeTopLevel(template.topLevel);

	let numberStr: string;
	if (fmt.inherit) {
		// 仅取 topLevel..level 的计数段（counter.sequence 返回 c1..cLevel）。
		const seq = counter.sequence(level).slice(top - 1);
		const skipFill = normalizeSkipFill(template.skipFill);
		const ancestorNumeral = normalizeAncestorNumeral(template.ancestorNumeral);
		const lastIndex = seq.length - 1; // 末段下标 = 当前级；其余为祖先段。
		const parts: string[] = [];
		seq.forEach((value, i) => {
			// 标题层级跳跃（如 H3 → H5）时，缺失的中间级别计数器值为 0、从未实例化。
			// 此处按用户选择的占位策略处理（见 {@link SkipFill}）：
			// - drop：不补位，丢弃该段（段数 = 实际存在的层级数）。
			// - fill：以 placeholder 字面量补位（如 `0` → `1.1.0.1`），段数 = 标题深度。
			// 无论补不补，该级计数器本身仍保持 0，直到真正出现该级标题才从 1 累加——
			// 因此后续首个真实的该级标题不被借号（如 H3→H5 在前，随后首个真实 H4 仍为 `…1`）。
			if (value === 0) {
				if (skipFill.mode === "drop") {
					return;
				}
				parts.push(skipFill.placeholder);
				return;
			}
			// 正常段：seq[i] 对应级别 top + i。
			// - 末段（当前级）：始终套用本级 numeral 样式。
			// - 祖先段：按「祖先序号渲染」策略——`self` 用各祖先自身样式（历史行为），
			//   `arabic` 一律阿拉伯（中文书惯例：H2 标题 `一`、H3 子节 `1.1`）。
			const segLevel = top + i;
			const segFmt = getLevelFormat(template, segLevel) ?? fmt;
			const style = i < lastIndex && ancestorNumeral === "arabic" ? "arabic" : segFmt.numeral;
			parts.push(renderNumeral(style, value));
		});
		numberStr = parts.join(fmt.numberSeparator);
	} else {
		numberStr = renderNumeral(fmt.numeral, counter.current(level));
	}

	// 顺序：前缀 + 完整序号 + 后缀 + 标题间隔符 + WJ（如「第」+「1」+「章」+「 」+WJ→「第1章 ⁠」）。
	return fmt.prefix + numberStr + fmt.suffix + fmt.titleSeparator + WORD_JOINER;
}

/**
 * 为设置 GUI 生成某级的实时预览前缀序列（如 H3 → `["1.1.1 ", "1.1.2 ", "1.1.3 "]`）。
 *
 * 模拟一个所有父级均为 1 的计数器状态，并让本级依次取 1、2、3，套用模板格式拼装前缀。
 * 仅用于面板展示，不影响真实编号。
 *
 * **返回前缀的原样字符串、不 trim 任何空白**——这样预览能**如实**反映「标题间隔符」里用户敲入的
 * 内容（含尾随空格）：间隔符填 `" "` 预览得 `1 标题`、填 `". "` 得 `1. 标题`。此前会 `trim` 末尾
 * 空白，导致预览把 `" "`/`". "` 显示成 `1标题`/`1.标题`，让用户误以为「敲的空格没被识别 / `. ` 被吃成
 * `.`」（实际编号写入一直是正确的，仅预览失真）。
 */
export function previewLevel(template: Template, level: number, count = 3): string[] {
	const top = normalizeTopLevel(template.topLevel);
	const bottom = normalizeBottomLevel(template.bottomLevel);
	// 低于起始编号层级、高于结束编号层级或越界：不编号，无预览。
	if (level < top || level > bottom || level < 1 || level > 6) {
		return [];
	}
	const counter = new HeadingCounter();
	// 从起始层级到本级先全部置 1。
	for (let l = top; l <= level; l++) {
		counter.bump(l);
	}
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		if (i > 0) {
			counter.bump(level); // 本级递增，得到同级的下一个序号。
		}
		out.push(buildPrefix(template, level, counter));
	}
	return out;
}

/** 把字符串中的正则元字符转义，使其可作为字面量拼入正则。 */
function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 「标题间隔符」的容差字符类：常见分隔标点 **+ 空白**（空格、Tab、`.`、`、`、`-`、`)` 等）。
 *
 * **方案 A（0.6.6）后仅供 {@link stripPrefixBroad}（「清除编号」命令）使用**——它独立于 WJ、用全样式
 * 正则尽力清掉手写 / 历史前缀，故仍需一个容差的「序号→标题」分隔字符集合。常规剥离 {@link stripPrefix}
 * 已不再用正则（改为纯 WJ 边界），不再依赖本类。
 *
 * **安全边界**：本类**仅含标点与空白**，不含可能属于标题正文的字母 / 数字 / 一般汉字；且要求**至少一个**
 * 分隔字符（`+`）。「清除编号」是用户主动操作，其对「以序号 + 分隔符起头」标题的误伤已被接受（spec §3.10）。
 */
const TITLE_SEPARATOR_CLASS = "[ \\t.,;:、，。．·：；)）】」』>\\]-]";

/**
 * 「序号间隔符」（父子序号段之间，如 `1.1` 的 `.`）的容差字符类：在 {@link TITLE_SEPARATOR_CLASS}
 * 基础上**刻意排除空格 / Tab**（空格几乎总是「序号→标题」的标题间隔符，而非段间分隔符）。
 *
 * **方案 A（0.6.6）后仅供 {@link stripPrefixBroad} 使用**（同 {@link TITLE_SEPARATOR_CLASS}）。
 */
const NUMBER_SEPARATOR_CLASS = "[.,;:、，。．·：；)）】」』>\\]-]";

/**
 * Word Joiner（U+2060）：零宽不换行字符，在导出 / 复制时不可见。
 *
 * {@link buildPrefix} 在每个前缀末尾追加该字符作为**精确结束标记**，无歧义地区分「前缀」与「正文」：
 * `1 ⁠标题` 中 WJ 不可见。**方案 A（0.6.6）起，WJ 是 {@link stripPrefix} 唯一的剥离依据**——含 WJ 才剥、
 * 剥到标记之后；不含 WJ 一律视为正文。彻底消除「2024 年度总结」首次被吃等历史歧义（见 spec §2.4）。
 * 「清除编号」命令的 {@link stripPrefixBroad} 仍用全样式正则（独立于 WJ）处理手写 / 历史前缀。
 */
export const WORD_JOINER = "⁠";

/**
 * 把一组前缀 / 后缀字面量拼成「能匹配其中任一者」的正则片段（按长度降序，使较长字面量优先匹配）。
 *
 * 方案 A（见 doc/testplan.md B2/B3）：剥离前后缀时不死扣当前模板值，而是接受一个**候选集合**——
 * 至少含「当前级别值」与「空串」，并可由 {@link NumberOptions.strippablePrefixes} /
 * {@link NumberOptions.strippableSuffixes} 注入「全模板在用的前后缀并集」。于是：
 * - **空串恒在候选里** → 之前在「无前缀」时编的号（如 `1 标题`），即便现在模板已配了前缀（`第`），
 *   也能被识别剥掉，再叠正确的新前缀，不会得到 `第1 1 标题`（B2/B3 的「空→非空」方向）。
 * - **并集含旧值** → 把某模板前缀从 `第` 改成别的、而别处仍在用 `第` 时，旧 `第…` 前缀也能剥净
 *   （「非空→另一值」方向，靠 main.ts 传入并集覆盖）。
 *
 * 误伤面被限定在「用户实际配过的字面量集合」内，可控且可测（不像任意容差那样吞掉真实标题）。
 */
function affixAlternation(values: readonly string[]): string {
	const uniq = Array.from(new Set(values)).sort((a, b) => b.length - a.length);
	return `(?:${uniq.map(escapeRegExp).join("|")})`;
}

/** 某序号样式可能出现的字符类片段，用于剥离已有前缀。 */
function numeralTokenPattern(style: NumeralStyle): string {
	switch (style) {
		case "arabic":
			return "\\d+";
		case "cjk":
			return "[〇零一二三四五六七八九十百千万亿兆]+";
		case "circled":
			return "[\\u2460-\\u2473\\u3251-\\u325F\\u32B1-\\u32BF]";
		case "lower-alpha":
			return "[a-z]+";
		case "upper-alpha":
			return "[A-Z]+";
		case "lower-roman":
			return "[ivxlcdm]+";
		case "upper-roman":
			return "[IVXLCDM]+";
	}
}

/** 序号样式的固定枚举顺序，供构造 union token 时稳定遍历。 */
const ALL_NUMERAL_STYLES: NumeralStyle[] = [
	"arabic",
	"cjk",
	"circled",
	"lower-alpha",
	"upper-alpha",
	"lower-roman",
	"upper-roman",
];

/**
 * 剥离标题文本中由本插件写入的编号前缀（**方案 A，0.6.6：纯 Word Joiner 边界**）。
 *
 * 核心契约：{@link buildPrefix} 写出的每个前缀**末尾恒带 Word Joiner**（U+2060，0.6.4 起）。WJ 是
 * **唯一可信的「这是插件写的前缀」边界标记**：
 * - **含 WJ** → 精确剥到**第一个 WJ 之后**（O(n)、无正则、与样式/分隔符/前后缀全无关），其后内容一律
 *   视为正文保留。多段前缀（`1.1.1 ⁠`）整体在 WJ 前，一次剥净。
 * - **不含 WJ** → 整段视为**纯用户文本、原样返回**，不再用正则去「猜」哪段像编号。
 *
 * 这样从根上消除了历史歧义：用户写的 `## 2024 年度总结`（无 WJ）**首次**触发也**不会**把 `2024` 当
 * 前缀吃掉——它没有 WJ，就是正文（结果 `## 1 ⁠2024 年度总结`，幂等保留）。代价（属预期，见 spec §2.3/§2.4）：
 * - 0.6.4 之前写入的、**无 WJ** 的历史前缀不再被本函数识别（现已无线上用户，不适配历史）。
 * - 用户**手写**的伪编号（如 `## 1. 标题`）不再被「吸收」，而是叠加在其上——若要清掉，用「清除编号」
 *   命令（{@link stripPrefixBroad}，全样式正则、独立于 WJ，专门处理手写 / 历史前缀）。
 *
 * `level` / `template` / `options` 三参仅为调用点签名兼容保留（WJ 剥离与模板无关），故标 `_` 前缀。
 */
export function stripPrefix(
	text: string,
	_level?: number,
	_template?: Template,
	_options: Pick<NumberOptions, "strippablePrefixes" | "strippableSuffixes"> = {},
): string {
	// 方案 A：含 WJ → 精确剥到标记之后；不含 WJ → 视为纯用户文本，原样返回。
	const wjIdx = text.indexOf(WORD_JOINER);
	if (wjIdx >= 0) {
		return text.slice(wjIdx + 1);
	}
	return text;
}

/**
 * 剥离一个已解析标题的编号前缀，并去除结果的行尾空白。
 *
 * 关键点：对 {@link Heading.rawText}（**保留行尾空白**）而非已 trim 的 {@link Heading.text}
 * 调用 {@link stripPrefix}。这样在用户于**空行**上直接转标题、行变为 `### 1.1 `（末尾即标题
 * 间隔符的空格）的情形下，`1.1 ` 仍带着间隔符空格、能被前缀正则干净命中并剥成空；而 `# 三`
 * 这类「本身是序号字样、末尾无空格」的真实标题则因缺少间隔符不被误剥。剥离后再 trim 掉
 * 可能残留的行尾空白，与解析器对 {@link Heading.text} 的处理保持一致。
 */
function stripHeadingPrefix(
	heading: Heading,
	level: number,
	template: Template,
	options: Pick<NumberOptions, "strippablePrefixes" | "strippableSuffixes"> = {},
): string {
	return stripPrefix(heading.rawText, level, template, options).replace(/\s+$/, "");
}

// ============================================================================
// 白名单匹配（Milestone 4）
//
// 命中白名单的标题不写编号前缀、不占计数器槽位（既不累加也不归零、不跳号）。比较前对标题文本与条目
// 词语应用同一套**归一化**（见 {@link normalizeForWhitelist}），归一化**仅用于判定，绝不改写文件**。
// 三种匹配方式（exact/partial/subtree）的命中与「取豁免范围最大者」的并集解析见
// {@link computeWhitelistExemptions}。
// ============================================================================

/**
 * 去除行内 Markdown 标记，仅用于白名单归一化（见 {@link normalizeForWhitelist}）。
 * - 链接 / 图片 `[文字](url)` / `![alt](url)` → 还原为「文字」/「alt」。
 * - 强调 / 代码标记 `*`、`_`、`` ` `` 直接删除（`**目录**`、`_目录_`、`` `目录` `` 均归一为「目录」）。
 */
function stripInlineMarkdown(s: string): string {
	return s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "");
}

/**
 * 白名单命中判定前对文本的**归一化**（见 spec.md §3.7）。**仅用于命中判定，绝不改写写入文件的内容。**
 *
 * 步骤（标题文本须先由调用方剥离编号前缀，见 {@link computeWhitelistExemptions}）：
 * 1. 去除行内 Markdown 标记（`**` / `*` / `_` / `` ` `` 与链接）。
 * 2. Unicode **NFKC** 归一（折叠全角 / 半角等价字符，如全角空格 U+3000 → 普通空格）。
 * 3. 双侧 `trim()` 并将内部连续空白折叠为单个空格。
 * 4. 拉丁字母统一转小写（使「Appendix」≡「appendix」）。
 *
 * 如此 `## **目录**`、含全角空格的标题、`## APPENDIX` 都能稳定命中条目「目录」/「Appendix」。
 */
export function normalizeForWhitelist(text: string): string {
	let s = stripInlineMarkdown(text);
	s = s.normalize("NFKC");
	s = s.trim().replace(/\s+/g, " ");
	return s.toLowerCase();
}

/**
 * 计算一篇文档里应被白名单**豁免**（不写前缀、不占计数器槽位）的标题集合。
 *
 * 对每个标题：先用 {@link stripPrefix} 剥离本模板写入的旧编号前缀（豁免即去号，见 testplan D7），
 * 再 {@link normalizeForWhitelist} 归一，与各条目（同样归一）逐一比对：
 * - `exact`：归一后**完全相等** → 豁免该标题自身。
 * - `partial`：归一后**包含**条目子串 → 豁免该标题自身。
 * - `subtree`：归一后**完全相等** → 以该标题为根，连同其后所有**层级更深**的标题（遇与根**同级或
 *   更高级**的标题即终止）整体豁免。
 *
 * **多条目命中取并集**（`子树 > 全部 = 部分`）：被任一条目命中即豁免；命中它的条目中只要有一条是
 * `subtree`（以它为根精确命中），就连同整棵子树一并豁免。空条目（归一后为空）忽略。
 *
 * @returns 应被豁免的 {@link Heading} 引用集合（供 {@link numberHeadings} 的 `isWhitelisted` 判定）。
 */
export function computeWhitelistExemptions(
	headings: Heading[],
	template: Template,
	options: Pick<NumberOptions, "strippablePrefixes" | "strippableSuffixes"> = {},
): Set<Heading> {
	const exempt = new Set<Heading>();
	const entries = template.whitelist
		.map((e) => ({ norm: normalizeForWhitelist(e.text), match: e.match }))
		.filter((e) => e.norm.length > 0);
	if (entries.length === 0) {
		return exempt;
	}

	// 预归一化每个标题（先剥前缀，使身上带旧编号的标题也能命中）。
	const normed = headings.map((h) =>
		normalizeForWhitelist(stripPrefix(h.rawText, h.level, template, options)),
	);

	for (let i = 0; i < headings.length; i++) {
		const nh = normed[i];
		let selfMatch = false;
		let subtreeMatch = false;
		for (const e of entries) {
			const hit = e.match === "partial" ? nh.includes(e.norm) : nh === e.norm;
			if (!hit) {
				continue;
			}
			if (e.match === "subtree") {
				subtreeMatch = true;
			} else {
				selfMatch = true;
			}
		}
		if (subtreeMatch) {
			// 子树：根 + 其下所有更深层级标题，遇同级 / 更高级终止。
			exempt.add(headings[i]);
			const rootLevel = headings[i].level;
			for (let j = i + 1; j < headings.length; j++) {
				if (headings[j].level <= rootLevel) {
					break;
				}
				exempt.add(headings[j]);
			}
		} else if (selfMatch) {
			exempt.add(headings[i]);
		}
	}
	return exempt;
}

/** {@link analyzeWhitelist} 中单个白名单条目的命中信息（供设置面板角标与 ⚠ 告警）。 */
export interface WhitelistEntryHit {
	/** 该条目独立命中（作为根 / 自身）的标题数。 */
	count: number;
	/**
	 * 该条目为 `exact` / `partial`、且其命中的某个标题**下面还有子标题**——此时仅豁免标题自身、
	 * 子标题会错挂到上一已编号祖先（见 spec.md §3.7 / testplan D5），应改用「子树」。触发面板 ⚠ 提示。
	 */
	warnHasChildren: boolean;
}

/** {@link analyzeWhitelist} 的结果：用于设置面板的实时命中预览与逐条角标 / 告警。 */
export interface WhitelistPreview {
	/** 全部被豁免的标题（并集，按文档出现顺序），用于「当前文件将豁免 N 个标题：…」。 */
	exempted: Heading[];
	/** 与 `template.whitelist` **下标对齐**的逐条命中信息。 */
	perEntry: WhitelistEntryHit[];
}

/**
 * 针对**当前活动文件**分析白名单命中情况，供设置面板实时预览（命中数 + 标题清单）与逐条角标 / ⚠ 告警。
 *
 * - `exempted`：实际被豁免的标题并集（与 {@link computeWhitelistExemptions} 一致），按出现顺序。
 * - `perEntry[i]`：第 i 条白名单条目独立命中的标题数，以及「自身被全部 / 部分豁免却含子标题」的告警。
 */
export function analyzeWhitelist(
	headings: Heading[],
	template: Template,
	options: Pick<NumberOptions, "strippablePrefixes" | "strippableSuffixes"> = {},
): WhitelistPreview {
	const normedHeadings = headings.map((h) =>
		normalizeForWhitelist(stripPrefix(h.rawText, h.level, template, options)),
	);
	const hasChildren = (i: number): boolean =>
		i + 1 < headings.length && headings[i + 1].level > headings[i].level;

	const perEntry: WhitelistEntryHit[] = template.whitelist.map((entry) => {
		const norm = normalizeForWhitelist(entry.text);
		let count = 0;
		let warnHasChildren = false;
		if (norm.length === 0) {
			return { count, warnHasChildren };
		}
		for (let i = 0; i < headings.length; i++) {
			const hit =
				entry.match === "partial"
					? normedHeadings[i].includes(norm)
					: normedHeadings[i] === norm;
			if (!hit) {
				continue;
			}
			count++;
			if (entry.match !== "subtree" && hasChildren(i)) {
				warnHasChildren = true;
			}
		}
		return { count, warnHasChildren };
	});

	const exemptSet = computeWhitelistExemptions(headings, template, options);
	const exempted = headings.filter((h) => exemptSet.has(h));
	return { exempted, perEntry };
}

/** 重新编号后的单个标题。 */
export interface NumberedHeading {
	/** 标题级别 1–6。 */
	level: number;
	/** 已剥离编号前缀的纯标题文本。 */
	text: string;
	/** 计算出的编号前缀；为 `null` 表示不写前缀（低于起始编号层级、或命中白名单）。 */
	prefix: string | null;
	/** 标题所在行下标（0 起）。 */
	lineIndex: number;
	/** 重新编号后的完整行内容，如 `## 1.1 标题`。 */
	numberedLine: string;
}

/** {@link numberHeadings} / {@link renumberContent} 的可选项。 */
export interface NumberOptions {
	/**
	 * 判断某标题是否命中白名单。命中者不写前缀、不占计数器槽位（不累加、不归零、不跳号）。
	 *
	 * **缺省**（不传该回调）时，{@link numberHeadings} 会依据 `template.whitelist` **自动**计算豁免集合
	 * （含 exact/partial/subtree 三种匹配与「取豁免范围最大者」的并集，见 {@link computeWhitelistExemptions}）。
	 * 显式传入该回调则**覆盖**模板白名单（用于单元测试注入或自定义判定）。
	 */
	isWhitelisted?: (heading: Heading) => boolean;
	/**
	 * 剥离时**额外**纳入的「前缀」候选字面量集合（方案 A，见 {@link affixAlternation}）。
	 * 典型用法：main.ts 传入「所有模板各级在用的 prefix 并集」，使某模板把前缀从 `第` 改走、
	 * 或在多模板间切换后，旧前缀仍能被剥净。`stripPrefix` 总会自动并入「当前级别值」与「空串」，
	 * 故此项只需给跨模板 / 历史的额外值；缺省为空。
	 */
	strippablePrefixes?: readonly string[];
	/** 剥离时额外纳入的「后缀」候选字面量集合（语义同 {@link strippablePrefixes}）。 */
	strippableSuffixes?: readonly string[];
}

/**
 * 对一组标题应用模板与计数器，计算每个标题的编号前缀。
 *
 * 规则：
 * - **插件永不改写标题层级**（不再有错位 H1 降级）。
 * - 每个非白名单标题都推进计数器（`bump` 本级、归零更深级），即便它低于 `topLevel`——
 *   故超出编号范围的标题（如默认下的 H1）仍是「重置边界」：其后更深标题重新从 1 起。
 * - 仅对 `level >= topLevel` 的标题输出序号前缀并剥离旧前缀；更浅的标题原样保留、不剥离
 *   （避免把「2024 年度总结」这类标题误当前缀剥掉）。
 * - 白名单命中者完全透明：不计数、不归零、不写前缀，但仍剥离其已有编号（豁免即去号）。
 */
export function numberHeadings(
	headings: Heading[],
	template: Template,
	options: NumberOptions = {},
): NumberedHeading[] {
	const counter = new HeadingCounter();
	// 白名单判定：显式回调优先（用于单测注入 / 自定义）；否则由模板白名单自动计算豁免集合
	// （含三种匹配方式与子树范围，见 {@link computeWhitelistExemptions}）。无白名单时恒不豁免。
	let isWhitelisted: (heading: Heading) => boolean;
	if (options.isWhitelisted) {
		isWhitelisted = options.isWhitelisted;
	} else if (template.whitelist.length > 0) {
		const exempt = computeWhitelistExemptions(headings, template, options);
		isWhitelisted = (heading) => exempt.has(heading);
	} else {
		isWhitelisted = () => false;
	}
	const top = normalizeTopLevel(template.topLevel);
	const bottom = normalizeBottomLevel(template.bottomLevel);

	return headings.map((heading) => {
		const level = heading.level;
		const hashes = "#".repeat(level);

		// 白名单命中：完全透明（不计数、不归零），但剥离其已有编号。
		if (isWhitelisted(heading)) {
			const text = stripHeadingPrefix(heading, level, template, options);
			return {
				level,
				text,
				prefix: null,
				lineIndex: heading.lineIndex,
				numberedLine: `${hashes} ${text}`,
			};
		}

		// 推进计数器（即便低于 topLevel，也作为重置边界）。
		counter.bump(level);

		// 低于起始编号层级 **或** 高于结束编号层级：不编号，但剥除可能残留的旧编号前缀
		// （C3 修复 + bottomLevel 对称处理，见 testplan §C3）。例如把结束层级从 H6 收窄到 H4 后，
		// 文件里遗留的 H5/H6 旧前缀须被剥净，否则会被当成正文、左侧再叠新前缀。
		// 采用**循环剥离到定点**（而非单次剥离）修复 U1/C6 bug：标题文本含多层「数字+空格」时，
		// 单次剥离只去一层，每次触发侵蚀一层（非幂等）；循环直到不再变化，保证单次触发即到定点，
		// 此后重复触发稳定。WJ 快速路径由 stripPrefix 内部处理（见 WORD_JOINER 注释）。
		if (level < top || level > bottom) {
			let current = heading.rawText;
			let prev: string;
			do {
				prev = current;
				current = stripPrefix(current, level, template, options);
			} while (current !== prev);
			const text = current.replace(/\s+$/, "");
			return {
				level,
				text,
				prefix: null,
				lineIndex: heading.lineIndex,
				numberedLine: `${hashes} ${text}`,
			};
		}

		const text = stripHeadingPrefix(heading, level, template, options);
		const prefix = buildPrefix(template, level, counter);
		return {
			level,
			text,
			prefix,
			lineIndex: heading.lineIndex,
			numberedLine: `${hashes} ${prefix}${text}`,
		};
	});
}

/**
 * 全样式宽松前缀剥离——用于 M6「清除编号」命令（见 `cleanup.ts`）。
 *
 * 与 {@link stripPrefix} 相比更激进：**末段也纳入字母样式**（lower-alpha / upper-alpha），
 * 不依赖任何模板参数（不查 `template.levels[*].numeral` 是否在用字母）。仅剥一层
 * （「2024 折中」，同 {@link stripPrefix}）。
 *
 * **已知风险（spec §3.10 / §2.3 预期取舍）：** 以序号样字（含字母）开头紧跟分隔符的标题
 * 可能被误剥——如 `a) 概述` → `概述` ✓，但 `API 设计` → `设计` ⚠️。
 * 「清除编号」是用户主动操作，此风险已被接受。与调高 topLevel 时的 C3 修复不同——后者
 * 走模板感知的 {@link stripHeadingPrefix}，仅当模板实际使用字母时才剥字母前缀，误伤面更小。
 *
 * @param rawText 标题的原始文本（含行尾空白，见 {@link Heading.rawText}）
 * @param knownPrefixes 已知前缀候选（含空串；由 main.ts 传入全模板前缀并集）
 * @param knownSuffixes 已知后缀候选（同上）
 */
export function stripPrefixBroad(
	rawText: string,
	knownPrefixes: readonly string[] = [],
	knownSuffixes: readonly string[] = [],
): string {
	// WJ 快速路径：buildPrefix 在 0.6.4 起写入 WJ，此路径生效；旧格式由下方正则路径兼容。
	const wjIdx = rawText.indexOf(WORD_JOINER);
	if (wjIdx >= 0) {
		return rawText.slice(wjIdx + 1).replace(/\s+$/, "");
	}
	const allToken = `(?:${ALL_NUMERAL_STYLES.map(numeralTokenPattern).join("|")})`;
	const sep = `${NUMBER_SEPARATOR_CLASS}+`;
	const numberPattern = `(?:${allToken}${sep})*${allToken}`;
	const prefixAlt = affixAlternation([...knownPrefixes, ""]);
	const suffixAlt = affixAlternation([...knownSuffixes, ""]);
	const titleSep = `${TITLE_SEPARATOR_CLASS}+`;
	const pattern = new RegExp(`^${prefixAlt}${numberPattern}${suffixAlt}${titleSep}`);
	return rawText.replace(pattern, "").replace(/\s+$/, "");
}

/**
 * 剥离一段标题文本里**外来 / 手写**的编号前缀——用于 0.6.6「清理非本插件的标题编号」命令
 * （见 `cleanup.ts` 与 spec §3.10）。**调用方须保证传入的是不含 WJ 的标题**（含 WJ = 本插件写的，
 * 由命令层跳过、不动）。
 *
 * 比 {@link stripPrefixBroad} 覆盖**更多手写惯例**，独立于任何模板：
 * - 全部序号样式（arabic / cjk / circled / 字母 / 罗马）+ 多段（`1.2.3`）；
 * - 可选 `第`、可选成对括号（`(1)` / `（一）` / `[1]` / `【1】` / `〔1〕` / `《1》`）；
 * - 可选中文量词单位（`第3章` / `一节` / `2条`…）；
 * - 之后须跟分隔标点 / 空白（{@link TITLE_SEPARATOR_CLASS}），故「纯数字无分隔」的真实标题（`100`）不被误剥。
 *
 * **已知风险（与「清除编号」同源、属预期，spec §3.10）：** 以序号样字（含字母）开头紧跟分隔符的真实
 * 标题可能被误剥（`API 设计` → `设计`、`2024 总结` → `总结`）。本命令是**用户主动**的一次性清理，已接受。
 */
export function stripForeignNumbering(rawText: string): string {
	const allToken = `(?:${ALL_NUMERAL_STYLES.map(numeralTokenPattern).join("|")})`;
	const sep = `${NUMBER_SEPARATOR_CLASS}+`;
	const numberPattern = `(?:${allToken}${sep})*${allToken}`;
	const cjkPrefix = "(?:第)?";
	const open = "[(（\\[【〔《〈]?";
	const cjkUnit = "(?:[章节條条讲講篇部回卷课課])?";
	// 序号之后**必须**跟「成对右括号 或 分隔标点 / 空白」中的至少一个（故纯数字无分隔的真实标题
	// 如 `100`、`三` 不被误剥）。右括号兼作分隔（`（一）背景` 中 `）` 即边界，无需空格）。
	const trail = `(?:[)）\\]】〕》〉]|${TITLE_SEPARATOR_CLASS})+`;
	const pattern = new RegExp(`^${cjkPrefix}${open}${numberPattern}${cjkUnit}${trail}`);
	return rawText.replace(pattern, "").replace(/\s+$/, "");
}

/**
 * 解析整篇文档、重新编号编号范围内（`>= topLevel`）的标题，并返回重写后的完整内容。
 *
 * 处理流程：
 * 1. 解析标题（围栏代码块内的 `#` 行由解析器忽略）。
 * 2. 按 {@link numberHeadings} 计算各标题的前缀（**不改写任何标题层级**）。
 * 3. 仅替换被识别为标题的行，其余行（含代码块、正文）原样保留。
 *
 * 真正写回编辑器的事务化操作在 main.ts。
 */
export function renumberContent(
	content: string,
	template: Template = DEFAULT_TEMPLATE,
	options: NumberOptions = {},
): string {
	const headings = parseHeadings(content);
	const numbered = numberHeadings(headings, template, options);

	const lines = content.split("\n");
	for (const h of numbered) {
		lines[h.lineIndex] = h.numberedLine;
	}
	return lines.join("\n");
}
