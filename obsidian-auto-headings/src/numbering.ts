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
export type NumeralStyle = "arabic" | "cjk" | "circled" | "lower-alpha" | "upper-alpha";

/** 起始编号层级的默认值：H2（即默认 H1 不编号、作为标题/分节）。 */
export const DEFAULT_TOP_LEVEL = 2;

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

/** 白名单条目（匹配逻辑在 Milestone 4 实现，这里仅承载数据）。 */
export interface WhitelistEntry {
	text: string;
	match: "exact" | "partial" | "subtree";
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
	whitelist: [
		{ text: "目录", match: "exact" },
		{ text: "附录", match: "exact" },
		{ text: "参考文献", match: "exact" },
	],
	skipFill: DEFAULT_SKIP_FILL,
	topLevel: DEFAULT_TOP_LEVEL,
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

/**
 * 将一个纯阿拉伯整数渲染为指定序号样式的字符串。
 * 支持 `arabic` / `cjk` / `circled` / `lower-alpha` / `upper-alpha`（见 README 3.6）。
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
	}
}

/**
 * 依据模板与当前计数器状态，为某级标题拼装编号前缀。
 *
 * 序号段从模板的 `topLevel` 起算（而非固定 H2）：如 `topLevel=H1` 时 H2 前缀为 `1.1`、
 * `topLevel=H3` 时 H4 前缀为 `1.1`（只取 H3–H4 两段）。仅应对 `level >= topLevel` 调用。
 *
 * - 继承前级 = 开：`prefix + 各级序号（以 numberSeparator 拼接，每级各自套用其样式）+ suffix + titleSeparator`。
 * - 继承前级 = 关：`prefix + 本级序号 + suffix + titleSeparator`。
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
			// 正常段：每段套用其所在级别的 numeral 样式（seq[i] 对应级别 top + i）。
			const segLevel = top + i;
			const segFmt = getLevelFormat(template, segLevel) ?? fmt;
			parts.push(renderNumeral(segFmt.numeral, value));
		});
		numberStr = parts.join(fmt.numberSeparator);
	} else {
		numberStr = renderNumeral(fmt.numeral, counter.current(level));
	}

	// 顺序：前缀 + 完整序号 + 后缀 + 标题间隔符（如「第」+「1」+「章」+「 」→「第1章 」）。
	return fmt.prefix + numberStr + fmt.suffix + fmt.titleSeparator;
}

/**
 * 为设置 GUI 生成某级的实时预览前缀序列（如 H3 → `["1.1.1", "1.1.2", "1.1.3"]`）。
 *
 * 模拟一个所有父级均为 1 的计数器状态，并让本级依次取 1、2、3，套用模板格式拼装前缀。
 * 仅用于面板展示，不影响真实编号。返回值已 trim 末尾空白以便紧凑展示。
 */
export function previewLevel(template: Template, level: number, count = 3): string[] {
	const top = normalizeTopLevel(template.topLevel);
	// 低于起始编号层级或越界：不编号，无预览。
	if (level < top || level < 1 || level > 6) {
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
		out.push(buildPrefix(template, level, counter).replace(/\s+$/, ""));
	}
	return out;
}

/** 把字符串中的正则元字符转义，使其可作为字面量拼入正则。 */
function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
	}
}

/** 序号样式的固定枚举顺序，供构造 union token 时稳定遍历。 */
const ALL_NUMERAL_STYLES: NumeralStyle[] = [
	"arabic",
	"cjk",
	"circled",
	"lower-alpha",
	"upper-alpha",
];

/**
 * 收集模板中实际使用到的全部序号样式。
 *
 * 始终额外纳入 `arabic`：一来历史版本的父级一律以阿拉伯数字呈现（迁移旧前缀需要），
 * 二来默认模板即纯阿拉伯。这样剥离前缀时既能识别本模板各级的样式，也能识别样式变更前
 * 残留的旧前缀（只要那个样式仍被模板某一级使用，或本就是 arabic）。
 */
function templateNumeralStyles(template: Template): Set<NumeralStyle> {
	const set = new Set<NumeralStyle>(["arabic"]);
	for (const lvl of [
		template.levels.h1,
		template.levels.h2,
		template.levels.h3,
		template.levels.h4,
		template.levels.h5,
		template.levels.h6,
	]) {
		set.add(lvl.numeral);
	}
	return set;
}

/**
 * 把一组序号样式拼成「能匹配其中任一样式的单段 token」的正则片段。
 *
 * 当占位策略为 `fill` 时，额外把占位字面量纳入并集——否则用户自定义的占位字符
 * （如 `-`、`*`）写出的缺失段无法被识别，导致剥离失败、重复编号时叠加前缀。
 * （`0`/`1` 等数字占位本就被 arabic token `\d+` 覆盖，此处加入无害。）
 */
function numeralUnionToken(styles: Set<NumeralStyle>, skipFill: SkipFill): string {
	const parts = ALL_NUMERAL_STYLES.filter((s) => styles.has(s)).map(numeralTokenPattern);
	if (skipFill.mode === "fill" && skipFill.placeholder.length) {
		parts.push(escapeRegExp(skipFill.placeholder));
	}
	return `(?:${parts.join("|")})`;
}

/**
 * 剥离标题文本中由本模板生成的编号前缀。
 *
 * 每一段序号都用「模板当前在用的全部样式」的并集 token 去匹配（见 {@link templateNumeralStyles}），
 * 而非死扣某一级的当前样式。这样能干净地移除：
 * - 本模板各级当前样式写出的前缀（含 {@link buildPrefix} 让父级套各自样式后的形态，如 `1.a.①`）；
 * - **样式变更前残留的旧前缀**——例如把某级从「带圈」改成「阿拉伯」后，旧的 `1.1.①` 仍能被识别剥离，
 *   不会被当成标题正文而在其左侧再叠加一层新前缀（即「改默认模板后出现重复编号」的根因）。
 *
 * 为应对历史上已叠加多层的脏数据，这里**循环剥离**直至不再变化（每轮至少吃掉一段，不会死循环）。
 *
 * 已知歧义：当标题本身恰以「序号样式字符 + 标题间隔符」开头（如默认模板下的「2024 年度总结」，
 * 或模板用到字母样式时以英文单词 + 空格开头的标题）时，会被误判为前缀而剥离——这与 README
 * 「对前缀的手动编辑属预期行为、会被覆盖」的设计一致；并集只纳入模板实际用到的样式，可把误伤面
 * 收敛到用户确实启用了的样式。
 */
export function stripPrefix(text: string, level: number, template: Template): string {
	const fmt = getLevelFormat(template, level);
	if (!fmt) {
		return text;
	}

	const token = numeralUnionToken(
		templateNumeralStyles(template),
		normalizeSkipFill(template.skipFill),
	);
	const sep = escapeRegExp(fmt.numberSeparator);
	// 与 buildPrefix 的结构对应：继承前级时前缀形如 `段{sep}段{sep}…{sep}段`，父级段数随层级与
	// 跳级而变；每段都可能是任一在用样式（父级套各自级别样式、或样式变更前的旧样式），故用并集 token。
	const numberPattern = fmt.inherit ? `(?:${token}${sep})*${token}` : token;

	// 与 buildPrefix 对应：前缀 + 完整序号 + 后缀 + 标题间隔符。后缀（如「章」）须一并剥离。
	const pattern = new RegExp(
		`^${escapeRegExp(fmt.prefix)}${numberPattern}${escapeRegExp(fmt.suffix)}${escapeRegExp(
			fmt.titleSeparator,
		)}`,
	);

	// 循环剥离，清掉历史上叠加的多层前缀；每轮命中至少移除一个字符，故必然收敛。
	let out = text;
	for (;;) {
		const next = out.replace(pattern, "");
		if (next === out) {
			return out;
		}
		out = next;
	}
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
	 * 完整的白名单匹配（exact/partial/subtree 与优先级）在 Milestone 4 实现；本里程碑
	 * 通过该回调注入，以便单元测试验证「不占槽位」的计数行为。默认无白名单。
	 */
	isWhitelisted?: (heading: Heading) => boolean;
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
	const isWhitelisted = options.isWhitelisted ?? (() => false);
	const top = normalizeTopLevel(template.topLevel);

	return headings.map((heading) => {
		const level = heading.level;
		const hashes = "#".repeat(level);

		// 白名单命中：完全透明（不计数、不归零），但剥离其已有编号。
		if (isWhitelisted(heading)) {
			const text = stripPrefix(heading.text, level, template);
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

		// 低于起始编号层级：不编号、不剥离、原样保留。
		if (level < top) {
			return {
				level,
				text: heading.text,
				prefix: null,
				lineIndex: heading.lineIndex,
				numberedLine: `${hashes} ${heading.text}`,
			};
		}

		const text = stripPrefix(heading.text, level, template);
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
