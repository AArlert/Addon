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

/** 单个标题级别（H2–H6）的显示格式。 */
export interface LevelFormat {
	/** 序号前的自定义文本，可为空。 */
	prefix: string;
	/** 本级计数器的呈现形式。 */
	numeral: NumeralStyle;
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

/** 一个具名模板：为 H2–H6 各级定义显示格式，并附带白名单。 */
export interface Template {
	name: string;
	levels: {
		h2: LevelFormat;
		h3: LevelFormat;
		h4: LevelFormat;
		h5: LevelFormat;
		h6: LevelFormat;
	};
	whitelist: WhitelistEntry[];
}

/** 默认模板：纯阿拉伯多级点分（`1` / `1.1` / `1.1.1` …），见 README 默认 `default.json`。 */
export const DEFAULT_TEMPLATE: Template = {
	name: "默认",
	levels: {
		h2: {
			prefix: "",
			numeral: "arabic",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		},
		h3: {
			prefix: "",
			numeral: "arabic",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		},
		h4: {
			prefix: "",
			numeral: "arabic",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		},
		h5: {
			prefix: "",
			numeral: "arabic",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		},
		h6: {
			prefix: "",
			numeral: "arabic",
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
};

/**
 * 计数器状态机。内部维护 `[c2, c3, c4, c5, c6]`，分别对应 H2–H6
 * （H1 为文档标题，不参与计数）。全程使用纯阿拉伯整数。
 */
export class HeadingCounter {
	/** counts[0] -> H2, …, counts[4] -> H6。 */
	private readonly counts = [0, 0, 0, 0, 0];

	/**
	 * 推进给定级别的计数器：`c[level]` 加一，所有更深级别归零。
	 * @param level 标题级别，必须在 2–6。
	 */
	bump(level: number): void {
		assertCountedLevel(level);
		const idx = level - 2;
		this.counts[idx] += 1;
		for (let i = idx + 1; i < this.counts.length; i++) {
			this.counts[i] = 0;
		}
	}

	/** 返回某级当前的纯阿拉伯计数值。 */
	current(level: number): number {
		assertCountedLevel(level);
		return this.counts[level - 2];
	}

	/**
	 * 返回从 H2 到 `level` 的计数序列（纯阿拉伯整数），用于「继承前级」拼接。
	 * 例如 level=4 时返回 `[c2, c3, c4]`。
	 */
	sequence(level: number): number[] {
		assertCountedLevel(level);
		return this.counts.slice(0, level - 1);
	}

	/** 将所有计数器归零（用于复用同一实例重新编号另一文件）。 */
	reset(): void {
		this.counts.fill(0);
	}
}

function assertCountedLevel(level: number): void {
	if (level < 2 || level > 6) {
		throw new RangeError(`参与计数的标题级别须在 2–6，收到 ${level}`);
	}
}

/** 取模板中对应级别的格式；级别不在 2–6 时返回 undefined。 */
function getLevelFormat(template: Template, level: number): LevelFormat | undefined {
	switch (level) {
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

/**
 * 将一个纯阿拉伯整数渲染为指定序号样式的字符串。
 * Milestone 1 仅实现 `arabic`；其余样式的渲染在 Milestone 3 实现。
 */
export function renderNumeral(style: NumeralStyle, value: number): string {
	switch (style) {
		case "arabic":
			return String(value);
		default:
			throw new Error(`序号样式「${style}」的渲染将在 Milestone 3 实现`);
	}
}

/**
 * 依据模板与当前计数器状态，为某级标题拼装编号前缀。
 *
 * - 继承前级 = 开：`prefix + 父级序号（以 numberSeparator 拼接）+ numberSeparator + 本级序号 + titleSeparator`
 *   （父级一律以阿拉伯数字呈现，仅本级套用 numeral 样式）。
 * - 继承前级 = 关：`prefix + 本级序号 + titleSeparator`。
 */
export function buildPrefix(template: Template, level: number, counter: HeadingCounter): string {
	const fmt = getLevelFormat(template, level);
	if (!fmt) {
		throw new RangeError(`无法为级别 ${level} 拼装前缀（仅支持 H2–H6）`);
	}

	let numberStr: string;
	if (fmt.inherit) {
		const seq = counter.sequence(level);
		const ownIndex = seq.length - 1;
		const parts: string[] = [];
		seq.forEach((value, i) => {
			// 标题层级跳跃（如 H2 → H4）时，缺失的中间级别计数器值为 0、从未实例化，
			// 不参与拼接，避免产生 `1.0.1` 这类幻影 0。本级（ownIndex）始终保留。
			if (value === 0 && i !== ownIndex) {
				return;
			}
			// 父级一律阿拉伯数字，仅本级套用 numeral 样式。
			parts.push(i === ownIndex ? renderNumeral(fmt.numeral, value) : String(value));
		});
		numberStr = parts.join(fmt.numberSeparator);
	} else {
		numberStr = renderNumeral(fmt.numeral, counter.current(level));
	}

	return fmt.prefix + numberStr + fmt.titleSeparator;
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
			return "[〇零一二三四五六七八九十百千万亿]+";
		case "circled":
			return "[\\u2460-\\u2473\\u3251-\\u325F\\u32B1-\\u32BF]";
		case "lower-alpha":
			return "[a-z]+";
		case "upper-alpha":
			return "[A-Z]+";
	}
}

/**
 * 剥离标题文本中由本模板生成的编号前缀。
 *
 * 前缀模式直接由模板的该级格式推导，因此与 {@link buildPrefix} 的输出严格对应：
 * 重复运行编号时能把上一轮写入的前缀干净地移除。若文本不以可识别的前缀开头，
 * 原样返回。
 *
 * 已知歧义：当标题本身恰以「数字 + 标题间隔符」开头（如「2024 年度总结」配合
 * 默认模板）时，会被误判为前缀而剥离——这与 README「对前缀的手动编辑属预期行为、
 * 会被覆盖」的设计一致。
 */
export function stripPrefix(text: string, level: number, template: Template): string {
	const fmt = getLevelFormat(template, level);
	if (!fmt) {
		return text;
	}

	const token = numeralTokenPattern(fmt.numeral);
	const sep = escapeRegExp(fmt.numberSeparator);
	const numberPattern = fmt.inherit ? `${token}(?:${sep}${token})*` : token;

	const pattern = new RegExp(
		`^${escapeRegExp(fmt.prefix)}${numberPattern}${escapeRegExp(fmt.titleSeparator)}`,
	);
	return text.replace(pattern, "");
}

/** 重新编号后的单个标题。 */
export interface NumberedHeading {
	/** 标题级别 1–6。 */
	level: number;
	/** 已剥离编号前缀的纯标题文本。 */
	text: string;
	/** 计算出的编号前缀；为 `null` 表示不写前缀（H1、白名单命中，或非 H2–H6）。 */
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
 * H1 规则（本里程碑）：所有 H1 均不编号、不计数（首个 H1 为文档标题；后续错位 H1 的
 * 降级处理留待 Milestone 2）。H2–H6 按计数器状态机编号；白名单标题跳过且不占槽位。
 */
export function numberHeadings(
	headings: Heading[],
	template: Template,
	options: NumberOptions = {},
): NumberedHeading[] {
	const counter = new HeadingCounter();
	const isWhitelisted = options.isWhitelisted ?? (() => false);

	return headings.map((heading) => {
		const text = stripPrefix(heading.text, heading.level, template);
		const hashes = "#".repeat(heading.level);

		// H1 及非计数级别：不编号、不计数。
		if (heading.level < 2 || heading.level > 6) {
			return {
				level: heading.level,
				text,
				prefix: null,
				lineIndex: heading.lineIndex,
				numberedLine: `${hashes} ${text}`,
			};
		}

		// 白名单命中：不写前缀，且不占计数器槽位。
		if (isWhitelisted(heading)) {
			return {
				level: heading.level,
				text,
				prefix: null,
				lineIndex: heading.lineIndex,
				numberedLine: `${hashes} ${text}`,
			};
		}

		counter.bump(heading.level);
		const prefix = buildPrefix(template, heading.level, counter);
		return {
			level: heading.level,
			text,
			prefix,
			lineIndex: heading.lineIndex,
			numberedLine: `${hashes} ${prefix}${text}`,
		};
	});
}

/**
 * 解析整篇文档、重新编号所有 H2–H6 标题，并返回重写后的完整内容。
 *
 * 仅替换被识别为标题的行，其余行（含代码块、正文）原样保留；行尾换行风格沿用原文。
 * 这是 Milestone 1「应用单一硬编码模板验证输出正确性」的入口；真正写回编辑器的
 * 事务化操作在 Milestone 2 实现。
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
