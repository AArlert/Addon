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
	whitelist: [
		{ text: "目录", match: "exact" },
		{ text: "附录", match: "exact" },
		{ text: "参考文献", match: "exact" },
	],
	skipFill: DEFAULT_SKIP_FILL,
	topLevel: DEFAULT_TOP_LEVEL,
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

	// 顺序：前缀 + 完整序号 + 后缀 + 标题间隔符（如「第」+「1」+「章」+「 」→「第1章 」）。
	return fmt.prefix + numberStr + fmt.suffix + fmt.titleSeparator;
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
 * 用途（见 doc/testplan.md B1/B4/B5）：用户改了模板的「序号间隔符」或「标题间隔符」后，文件里用
 * **旧分隔符**写出的历史前缀已无法用当前模板值精确匹配（旧值不在模板里了）。{@link stripPrefix}
 * 除精确匹配当前分隔符外，再容差匹配这一标点 / 空白集合的连续串，即可剥掉旧前缀、避免新前缀叠
 * 加（用户报告的「序号样式改中文 → 标题间隔符改『、』后得 `一、一 标题`」类 bug）。
 *
 * **安全边界**：本类**仅含标点与空白**，不含可能属于标题正文的字母 / 数字 / 一般汉字；且容差分支
 * 要求**至少一个**分隔字符（`+`）。前缀仍必须以序号 token 起头（空前缀时），故**不以序号起头的
 * 标题完全不受影响**，误伤面与历史一致（仅「以序号 + 分隔符起头」的标题会被当前缀覆盖，这与
 * spec.md §2.3「对编号前缀的手动编辑属预期行为」一致）。
 */
const TITLE_SEPARATOR_CLASS = "[ \\t.,;:、，。．·：；)）】」』>\\]-]";

/**
 * 「序号间隔符」（父子序号段之间，如 `1.1` 的 `.`）的容差字符类：在 {@link TITLE_SEPARATOR_CLASS}
 * 基础上**刻意排除空格 / Tab**。
 *
 * 为什么排除空格（见 doc/testplan.md「2024 折中」）：空格几乎总是「序号→标题」的**标题间隔符**，
 * 而非段间的序号间隔符。若容差地把空格也当段间分隔符，`1 2024 标题` 会被解析成「`1`、`2024` 两段
 * 父级序号」而把用户正文里的 `2024` 一并吃掉。把空格从段间容差里剔除后，`1 2024 标题` 只会被识别为
 * 「一层前缀 `1 ` + 正文 `2024 标题`」，从而**只剥一层、保住用户写在序号后面的数字**。
 * 真正以空格为序号间隔符的罕见配置仍由 {@link tolerantSeparator} 的「精确匹配当前值」分支兜住。
 */
const NUMBER_SEPARATOR_CLASS = "[.,;:、，。．·：；)）】」』>\\]-]";

/**
 * 构造「容差分隔符」匹配片段：优先精确匹配当前模板的分隔符 `exact`（含其为空的情形），
 * 否则容差匹配一段给定字符类 `charClass`（≥1 个）。用于剥离用旧分隔符写出的历史前缀。
 *
 * @param charClass 容差字符类——序号间隔符传 {@link NUMBER_SEPARATOR_CLASS}（无空格）、
 *   标题间隔符传 {@link TITLE_SEPARATOR_CLASS}（含空格）。
 */
function tolerantSeparator(exact: string, charClass: string): string {
	return `(?:${escapeRegExp(exact)}|${charClass}+)`;
}

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
 * **低误伤风险、可「无条件」参与剥离的样式**：阿拉伯 / 中文 / 带圈。
 *
 * 这些样式即便当前模板已不再使用，也极少与真实标题的开头冲突（汉字数字/带圈数字开头且
 * 紧跟间隔符的标题罕见，与长期存在的「`2024 总结` 会被 arabic 剥」一致）。因此始终纳入，
 * 以便清理**样式被改走后残留的旧前缀**——例如把某级中文改回阿拉伯后，文件里遗留的
 * 「1.二.1」必须仍能被剥离，否则会被当作正文、左侧再叠一层新前缀（用户报告的
 * 「1.2.1 1.二.1」叠加 bug）。字母样式（lower/upper-alpha）误伤面大（会吃掉「API 设计」这类
 * 以英文词开头的标题），故**不**无条件纳入，仅在模板实际使用时才参与（见 {@link lastSegmentToken}）。
 */
const ALWAYS_STRIPPABLE_STYLES: NumeralStyle[] = ["arabic", "cjk", "circled"];

/** 把一组序号样式（外加 fill 占位字面量）拼成「能匹配其中任一样式的单段 token」的正则片段。 */
function unionToken(styles: Set<NumeralStyle>, skipFill: SkipFill): string {
	const parts = ALL_NUMERAL_STYLES.filter((s) => styles.has(s)).map(numeralTokenPattern);
	if (skipFill.mode === "fill" && skipFill.placeholder.length) {
		parts.push(escapeRegExp(skipFill.placeholder));
	}
	return `(?:${parts.join("|")})`;
}

/**
 * **内层（父级）段**的剥离 token：纳入**全部**序号样式。
 *
 * 父级段在生成时各自套用其所在级别的样式（见 {@link buildPrefix}），而这些样式可能在之后被
 * 用户改动，残留的旧前缀必须仍可剥离。对父级段放宽到全样式是**安全**的——父级段恒被序号
 * 间隔符夹在中间，真实标题极少形如「词.词.…」；而**末段**由 {@link lastSegmentToken} 收口
 * （不含模板未使用的字母样式），故「API 设计」等以英文词开头的标题不会被误剥。
 */
function innerSegmentToken(skipFill: SkipFill): string {
	return unionToken(new Set<NumeralStyle>(ALL_NUMERAL_STYLES), skipFill);
}

/**
 * **末段（本级、最深段）**的剥离 token。
 *
 * 字母样式（lower/upper-alpha）**仅在模板实际使用时**纳入：否则会把「API 设计」「TODO 列表」
 * 这类以英文词开头的标题误当作字母序号剥掉。arabic/cjk/带圈误伤风险低，**始终**纳入（见
 * {@link ALWAYS_STRIPPABLE_STYLES}），以便清理「样式被改走后残留的旧前缀」恰好落在末段的情形。
 */
function lastSegmentToken(template: Template, skipFill: SkipFill): string {
	const styles = new Set<NumeralStyle>(ALWAYS_STRIPPABLE_STYLES);
	for (const lvl of [
		template.levels.h1,
		template.levels.h2,
		template.levels.h3,
		template.levels.h4,
		template.levels.h5,
		template.levels.h6,
	]) {
		if (lvl.numeral === "lower-alpha" || lvl.numeral === "upper-alpha") {
			styles.add(lvl.numeral);
		}
	}
	return unionToken(styles, skipFill);
}

/**
 * 剥离标题文本中由本模板生成的编号前缀。
 *
 * 前缀按「父级段 + 本级段」两类分别匹配，而非死扣某一级的当前样式：
 * - **父级（内层）段**用 {@link innerSegmentToken}（全部样式）匹配——父级在生成时各自套用其级别
 *   样式（见 {@link buildPrefix}），且样式可能在之后被改动而残留旧前缀；父级段恒被间隔符夹住，
 *   放宽到全样式不会误伤正文。
 * - **本级（末）段**用 {@link lastSegmentToken}（arabic/cjk/带圈始终纳入，字母样式仅在模板在用时纳入）
 *   收口，避免把「API 设计」这类以英文词开头的标题误当作字母序号剥掉。
 *
 * 这样既能干净移除本模板当前样式写出的前缀（含 `1.a.①` 这类父级套各自样式的形态），也能移除
 * **样式变更前残留的旧前缀**——例如把某级从「中文」改回「阿拉伯」后、模板里已无任何 cjk 级时，
 * 旧的 `1.二.1` 仍能被识别剥离，不会被当成正文而在其左侧再叠一层新前缀（即用户报告的
 * 「1.2.1 1.二.1」叠加 bug 的根因）。
 *
 * **只剥一层**（不再循环重剥）：本函数只移除**最左侧的一个完整前缀单元**，其后的内容一律视为正文
 * 保留。这实现了用户约定的「2024 折中」——`1 2024 标题`（用户在插件写的 `1 ` 后面又补回自己的
 * `2024`）只会被剥成 `2024 标题` 再编号回 `1 2024 标题`，而**不会**把 `2024` 也当成第二段序号吃掉。
 * 配合 {@link NUMBER_SEPARATOR_CLASS} 把空格排除出「段间分隔符」，`1 2024` 不再被误解析为两段序号。
 * 多段前缀（如 `1.1.1 `，段间是 `.`）仍会作为**一个单元**被一次剥净。
 *
 * 已知歧义（与 spec §2.3 一致，属预期取舍）：当标题本身恰以「序号样式字符 + 标题间隔符」开头
 * （如 `2024 总结`、`三 概述`）时，**首次**编号会把它当作前缀剥掉（得 `1 总结`）。用户若想保留，
 * 在序号后重新写上即可——`1 2024 总结` 会被稳定保留（见上「只剥一层」）。
 */
export function stripPrefix(
	text: string,
	level: number,
	template: Template,
	options: Pick<NumberOptions, "strippablePrefixes" | "strippableSuffixes"> = {},
): string {
	const fmt = getLevelFormat(template, level);
	if (!fmt) {
		return text;
	}

	const skipFill = normalizeSkipFill(template.skipFill);
	const inner = innerSegmentToken(skipFill);
	const last = lastSegmentToken(template, skipFill);
	// 序号间隔符与标题间隔符均用「容差」匹配：除当前模板值外，也认得用旧分隔符写出的历史前缀，
	// 从而在用户改了间隔符后仍能剥净旧前缀、不叠加（见 {@link tolerantSeparator}、testplan B1/B4/B5）。
	// 注意两者用**不同**字符类：段间序号间隔符排除空格（避免把 `1 2024` 当两段序号），标题间隔符含空格。
	const sep = tolerantSeparator(fmt.numberSeparator, NUMBER_SEPARATOR_CLASS);
	const titleSep = tolerantSeparator(fmt.titleSeparator, TITLE_SEPARATOR_CLASS);
	// 与 buildPrefix 的结构对应：继承前级时前缀形如 `父段{sep}…{sep}父段{sep}本段`。
	// **父级段恒用可选 `(?:…)*` 匹配，不看当前 `inherit`**：历史前缀可能是在 `inherit=true` 时写的
	// （带父级段），即便现在改成了 `inherit=false`，那些父级段也必须能被一并剥净，否则会残留叠加
	// （`inherit` 翻转的状态转移）。`*` 取零段即覆盖「本就没有父级段」的 inherit=false 情形。
	const numberPattern = `(?:${inner}${sep})*${last}`;

	// 与 buildPrefix 对应：前缀 + 完整序号 + 后缀 + 标题间隔符。后缀（如「章」）须一并剥离。
	// 方案 A：前缀 / 后缀用「当前值 + 空串 + 注入并集」的候选集合匹配（见 {@link affixAlternation}），
	// 而非死扣当前值——这样「无前缀时编的号」与「旧前缀值」都能被识别剥净（testplan B2/B3）。
	const prefixAlt = affixAlternation([fmt.prefix, "", ...(options.strippablePrefixes ?? [])]);
	const suffixAlt = affixAlternation([fmt.suffix, "", ...(options.strippableSuffixes ?? [])]);
	const pattern = new RegExp(`^${prefixAlt}${numberPattern}${suffixAlt}${titleSep}`);

	// 只剥一层：移除最左侧的一个完整前缀单元即返回，其后内容一律视为正文保留（见上「2024 折中」）。
	return text.replace(pattern, "");
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
	const isWhitelisted = options.isWhitelisted ?? (() => false);
	const top = normalizeTopLevel(template.topLevel);

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
