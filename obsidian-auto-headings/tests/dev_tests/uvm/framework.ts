/**
 * UVM 风格的「约束随机序列」测试框架（针对编号引擎 `renumberContent`）。
 *
 * ## 为什么要它
 *
 * 单测「一次编号」往往全绿，真正的 bug 几乎都藏在**操作序列**里——「已经有编号了、用户又改了某个
 * 配置 / 又编辑了文本，下一次触发才炸」（见 doc/testplan.md 的状态转移类）。手写穷举这些组合不现实，
 * 故借鉴硬件验证的 **UVM（Universal Verification Methodology）**：用**约束随机**的激励序列大面积撞，
 * 配一个**参考模型记分板**自动判对错，再用**功能覆盖率**确认真的撞到了关心的场景。
 *
 * ## UVM 组件映射（本文件各部分）
 *
 * | UVM 概念 | 这里的对应 |
 * |----------|------------|
 * | Sequence item / 激励 | {@link Op}（编辑文本 / 改模板 / 触发） |
 * | Sequencer（约束随机产生激励） | {@link World.step}（依当前状态、在约束内随机选一个 Op） |
 * | Driver（把激励打到 DUT） | {@link World.apply}（把 Op 施加到「裸文档真值」与「编辑器文本」） |
 * | DUT（被测对象） | `renumberContent`（剥旧前缀 + 重新编号） |
 * | Reference model + Scoreboard（判对错） | {@link World.check}：DUT 输出必须等于「从裸文档真值直接编号」 |
 * | Functional coverage（覆盖率闭合） | {@link Coverage} |
 *
 * ## 记分板核心不变量（oracle）
 *
 * 维护两份状态：`bare`（**规范裸文档**，无任何编号，是「用户真实意图」的真值）与 `rendered`
 * （**当前编辑器各行文本**，含上一次触发写入的前缀，与 `bare` 行一一锁步）。每次「触发」后断言：
 *
 * ```
 *   join(rendered)  ===  renumberContent(serialize(bare), 当前模板)
 *   └─ DUT：对带历史前缀的文本剥离+重编        └─ 参考：对裸文本直接编号（strip 对裸文本是 no-op）
 * ```
 *
 * 两者相等 ⟺ `stripPrefix` 把历史前缀剥得干干净净。**任何前缀叠加 / 残留都会让两侧不等而被当场抓出**
 * （B1–B5、C3 都能被这一条逮到），且参考侧复用**可信的 build 路径**、不重复实现编号逻辑。
 *
 * ## 约束（= 当前 strip 健壮性的精确刻画）
 *
 * 默认生成器只在「当前已修好、参考不变量恒成立」的空间里随机，确保 CI 常绿：
 * - `prefix` / `suffix`：**已放开**——在「空 ↔ 本序列候选」间随机切换（B2/B3 已修，方案 A）；剥离选项
 *   传入「空 + 候选」并集模拟 main.ts 行为。数字 / 字母起头标题也**不再回避**（L2 已修，恒纳入空前缀
 *   候选 → 对称吃掉，配合「只剥一层」使 `1 2024` 保留）。
 * - `inherit`：仍仅当当前 prefix 与 suffix **都为空**时才允许翻转（非空前后缀下 inherit 翻转另案，未放开）。
 * - `topLevel`：仍**只减不增**（升高会留下移出编号范围的旧前缀，testplan C3，待「清除编号」命令兜底）。
 * - 随机样式仍只用 arabic/cjk/circled（不混字母，L1 有意取舍）。
 * - 其余（numeral、两个间隔符、skipFill、ancestorNumeral、文本编辑、层级、代码块、白名单）：自由变。
 *
 * > 这些约束**就是 bug 边界**：B2/B3（改前后缀）、L2（数字起头标题）已修并放开；C3（升 topLevel）、
 * > inherit×非空前后缀、字母样式仍约束着，待后续修好再逐一放开（见 uvm/README.md「放开约束」）。
 */

import {
	DEFAULT_TEMPLATE,
	renumberContent,
	type AncestorNumeral,
	type NumeralStyle,
	type SkipFill,
	type Template,
} from "../../../src/numbering";
import type { Heading } from "../../../src/parser";
import { Rng } from "./rng";

/** 文档的一行：标题（级别 + 裸标题文本）或原样行（正文 / 代码块栅栏 / 块内行）。 */
type Line = { kind: "heading"; level: number; title: string } | { kind: "raw"; text: string };

/** 把一行序列化为 Markdown 文本（空标题 → `### `，带尾随空格，复现空行转标题场景）。 */
function serializeLine(line: Line): string {
	return line.kind === "heading" ? `${"#".repeat(line.level)} ${line.title}` : line.text;
}

function serialize(lines: Line[]): string {
	return lines.map(serializeLine).join("\n");
}

/** 标题文本池：覆盖普通、含 latin、"自食前缀"（2024 总结 / 实现 1.2）、白名单词、空标题。 */
const TITLES = [
	"概述",
	"细节",
	"背景与动机",
	"2024 总结",
	"API 设计",
	"100% 覆盖",
	"三",
	"目录",
	"附录",
	"参考文献",
	"",
	"实现 1.2",
	"小结",
];
/** 白名单词（归一化后命中即豁免编号）。 */
const WHITELIST = new Set(["目录", "附录", "参考文献"]);
/**
 * "自食前缀"型标题：本身以**数字**开头（如 `2024 总结`），会被 arabic 剥离器按预期吃掉
 * （spec §2.3 既定取舍）。
 *
 * **不再按前缀是否为空回避**（旧版有 `TOKEN_STARTING` 过滤，对应 testplan L2 约束）：方案 A 让剥离
 * 时**恒把「空前缀」纳入候选**，故无论模板前缀是否非空，裸标题「2024 总结」都会被对称地吃掉
 * （`第1 总结` / `1 总结`），参考模型恒一致。配合「只剥一层」，`1 2024 总结`（用户在序号后补回数字）
 * 又能稳定保留——这正是 L2 被修复、约束得以放开的体现（E5 静态测试覆盖 `1 2024` 保留）。
 */
const SELF_EATING = new Set(["2024 总结", "100% 覆盖"]);

/**
 * 随机变换用的序号样式池：**仅 always-strippable 三种**（arabic / cjk / circled）。
 *
 * 刻意**排除字母样式**（lower/upper-alpha）：它们不在 numbering.ts 的 `ALWAYS_STRIPPABLE_STYLES`
 * 里（为避免把「API」这类英文起头标题误当字母序号吃掉）。后果是——当某级**从字母样式改走**、
 * 且此后无任何级别再用字母时，残留的旧字母前缀（如 `A）`）剥不掉、会叠加。这是**有意的取舍**（不是
 * 状态转移 bug），字母样式的渲染与同样式往返已由静态测试（"非 arabic 序号样式" 块）覆盖，故随机
 * 序列里不混入字母样式的相互切换，以保持参考模型一致、CI 常绿。
 */
const NUMERALS: NumeralStyle[] = ["arabic", "cjk", "circled"];
const NUMBER_SEPS = [".", "-", "·", ")", "．"];
const TITLE_SEPS = [" ", "、", ". ", "。", "： "];
/** 非空前缀 / 后缀候选（每条序列各定一个，序列内在「空 ↔ 该候选」间随机切换，验证 B2/B3）。 */
const PREFIX_CANDIDATES = ["第", "（"];
const SUFFIX_CANDIDATES = ["章", "）"];
/** 标题级别取样（偏向 H2–H4，但也覆盖 H1/H5/H6）。 */
const LEVEL_POOL = [1, 2, 2, 3, 3, 3, 4, 4, 5, 6];

/**
 * 把标题文本归一化后判断是否命中白名单：剥掉**前导的序号样字 + 间隔符**再比较，使
 * 「附录」「1 附录」「1.1 附录」都归一为「附录」。DUT 与参考两侧用同一 matcher，结果一致。
 */
function whitelistKey(text: string): string {
	return text
		.replace(/^[\s0-9〇零一二三四五六七八九十百千万亿兆①-⓿㉑-㊿a-zA-Z.\-、。．·)\]）】]+/, "")
		.trim();
}
function isWhitelisted(h: Heading): boolean {
	return WHITELIST.has(whitelistKey(h.text));
}

/** 各类激励（仅用于覆盖率与失败时的轨迹打印）。 */
export type OpKind =
	| "insertHeading"
	| "insertRaw"
	| "insertFence"
	| "deleteLine"
	| "retitle"
	| "changeLevel"
	| "setNumeral"
	| "setNumberSep"
	| "setTitleSep"
	| "setInherit"
	| "setPrefix"
	| "setSuffix"
	| "setTopLevelLower"
	| "setSkipFill"
	| "setAncestor"
	| "trigger";

/** 功能覆盖率收集器（UVM functional coverage）：确认随机真的撞到了关心的场景。 */
export class Coverage {
	readonly ops = new Map<OpKind, number>();
	readonly numerals = new Set<NumeralStyle>();
	inheritFalse = false;
	skipDrop = false;
	skipFill = false;
	ancestorArabic = false;
	ancestorSelf = false;
	topLevelLowered = false;
	/** 前缀 / 后缀曾被切换（验证 B2/B3 的状态转移）。 */
	affixToggled = false;
	/** 曾在「前缀或后缀非空」的状态下触发编号。 */
	affixNonEmptyTrigger = false;
	fencePresent = false;
	whitelistHit = false;
	emptyTitle = false;
	levelGE5 = false;
	levelJump = false;
	selfEatingTitle = false;
	triggers = 0;

	bumpOp(kind: OpKind): void {
		this.ops.set(kind, (this.ops.get(kind) ?? 0) + 1);
	}

	/** 返回未被覆盖到的关键 bin 列表（空数组表示覆盖闭合）。 */
	gaps(): string[] {
		const missing: string[] = [];
		const allOps: OpKind[] = [
			"insertHeading",
			"insertRaw",
			"insertFence",
			"deleteLine",
			"retitle",
			"changeLevel",
			"setNumeral",
			"setNumberSep",
			"setTitleSep",
			"setInherit",
			"setPrefix",
			"setSuffix",
			"setTopLevelLower",
			"setSkipFill",
			"setAncestor",
			"trigger",
		];
		for (const op of allOps) {
			if ((this.ops.get(op) ?? 0) === 0) missing.push(`op:${op}`);
		}
		for (const n of NUMERALS) if (!this.numerals.has(n)) missing.push(`numeral:${n}`);
		if (!this.inheritFalse) missing.push("inherit=false");
		if (!this.skipDrop) missing.push("skipFill=drop");
		if (!this.skipFill) missing.push("skipFill=fill");
		if (!this.ancestorArabic) missing.push("ancestor=arabic");
		if (!this.ancestorSelf) missing.push("ancestor=self");
		if (!this.topLevelLowered) missing.push("topLevel-lowered");
		if (!this.affixToggled) missing.push("affix-toggled");
		if (!this.affixNonEmptyTrigger) missing.push("affix-nonempty-trigger");
		if (!this.fencePresent) missing.push("fence");
		if (!this.whitelistHit) missing.push("whitelist-hit");
		if (!this.emptyTitle) missing.push("empty-title");
		if (!this.levelGE5) missing.push("level>=5");
		if (!this.levelJump) missing.push("level-jump");
		if (!this.selfEatingTitle) missing.push("self-eating-title");
		return missing;
	}
}

/** 失败时抛出，携带种子 + 操作轨迹 + 三方文本，便于直接复现定位。 */
export class SequenceError extends Error {
	constructor(seed: number, trace: string[], detail: string) {
		super(`UVM 序列失败（seed=${seed}）：${detail}\n操作轨迹：\n  ${trace.join("\n  ")}`);
		this.name = "SequenceError";
	}
}

/**
 * 一条序列的「世界」：持有裸文档真值、当前编辑器文本（锁步）、当前模板，并提供
 * step（约束随机产生并施加一个 Op）与 check（参考模型记分板）。
 */
export class World {
	private bare: Line[];
	/** 与 bare 行一一对应；含上一次触发写入的前缀（刚插入/改写的行暂为裸文本）。 */
	private rendered: string[];
	private template: Template;
	/** 本序列的非空前缀 / 后缀候选；前后缀在「空 ↔ 候选」间切换（验证 B2/B3）。 */
	private readonly prefixCandidate: string;
	private readonly suffixCandidate: string;
	/**
	 * 传给 `renumberContent` 的剥离选项：`strippablePrefixes` / `strippableSuffixes` 取「空 + 候选」，
	 * 模拟 main.ts 传入的「全模板前后缀并集」（方案 A），使前后缀切换后旧前缀仍能被剥净。
	 */
	private readonly opts: { isWhitelisted: typeof isWhitelisted } & {
		strippablePrefixes: string[];
		strippableSuffixes: string[];
	};
	/** 本序列的标题取样池；方案 A 后不再回避「数字/字母起头」标题（恒含空前缀候选 → 对称处理）。 */
	private readonly titlePool: string[] = TITLES;
	private readonly trace: string[] = [];

	constructor(
		private readonly rng: Rng,
		private readonly seed: number,
		private readonly cov: Coverage,
	) {
		this.prefixCandidate = rng.pick(PREFIX_CANDIDATES);
		this.suffixCandidate = rng.pick(SUFFIX_CANDIDATES);
		this.opts = {
			isWhitelisted,
			strippablePrefixes: ["", this.prefixCandidate],
			strippableSuffixes: ["", this.suffixCandidate],
		};
		// 起始前后缀随机为「空」或「候选」（后续 setPrefix/setSuffix 还会切换）。
		const startPrefix = rng.chance(0.5) ? "" : this.prefixCandidate;
		const startSuffix = rng.chance(0.5) ? "" : this.suffixCandidate;
		const topLevel = rng.intRange(1, 3);
		const tpl = structuredClone(DEFAULT_TEMPLATE);
		for (const k of ["h1", "h2", "h3", "h4", "h5", "h6"] as const) {
			tpl.levels[k].prefix = startPrefix;
			tpl.levels[k].suffix = startSuffix;
		}
		tpl.topLevel = topLevel;
		this.template = tpl;
		// 起始：一个最小裸文档（一个标题），后续靠编辑 Op 长大。
		this.bare = [
			{ kind: "heading", level: Math.max(topLevel, 2), title: rng.pick(this.titlePool) },
		];
		this.rendered = this.bare.map(serializeLine);
	}

	/** 当前 bare 文档里的标题行下标。 */
	private headingIndices(): number[] {
		const out: number[] = [];
		this.bare.forEach((l, i) => {
			if (l.kind === "heading") out.push(i);
		});
		return out;
	}

	/** 在两份状态的同一下标处插入同一行（裸形式）。 */
	private insertAt(i: number, line: Line): void {
		this.bare.splice(i, 0, line);
		this.rendered.splice(i, 0, serializeLine(line));
	}

	/** 约束随机地产生并施加一个 Op；触发类 Op 之后会调用 {@link check}。 */
	step(): void {
		const r = this.rng.next();
		if (r < 0.35) {
			this.trigger();
		} else if (r < 0.65) {
			this.edit();
		} else {
			this.config();
		}
	}

	/** 收尾：强制触发一次并校验，确保每条序列至少结算一次。 */
	finish(): void {
		this.trigger();
	}

	// ── 编辑类激励 ───────────────────────────────────────────────────────────
	private edit(): void {
		const choices = [
			"insertHeading",
			"insertRaw",
			"insertFence",
			"deleteLine",
			"retitle",
			"changeLevel",
		] as const;
		const kind = this.rng.pick(choices);
		const len = this.bare.length;
		switch (kind) {
			case "insertHeading": {
				const level = this.rng.pick(LEVEL_POOL);
				const title = this.rng.pick(this.titlePool);
				this.insertAt(this.rng.int(len + 1), { kind: "heading", level, title });
				if (level >= 5) this.cov.levelGE5 = true;
				if (title === "") this.cov.emptyTitle = true;
				if (SELF_EATING.has(title)) this.cov.selfEatingTitle = true;
				if (WHITELIST.has(title)) this.cov.whitelistHit = true;
				this.trace.push(`insertHeading H${level} ${JSON.stringify(title)}`);
				break;
			}
			case "insertRaw": {
				const text = this.rng.pick([
					"正文一行",
					"- 列表项",
					"> 引用",
					"普通段落 # 不是标题",
				]);
				this.insertAt(this.rng.int(len + 1), { kind: "raw", text });
				this.trace.push(`insertRaw ${JSON.stringify(text)}`);
				break;
			}
			case "insertFence": {
				const i = this.rng.int(len + 1);
				const fence = this.rng.pick(["```", "~~~"]);
				// 代码块三行：栅栏 + 一行伪标题 + 同种栅栏闭合（块内 # 不应被编号）。
				for (const t of [fence, "# 代码块内的伪标题", fence].reverse()) {
					this.insertAt(i, { kind: "raw", text: t });
				}
				this.cov.fencePresent = true;
				this.trace.push(`insertFence ${fence}`);
				break;
			}
			case "deleteLine": {
				// 不删**栅栏定界行**：删掉它会让代码块失衡，把"已编号的标题"事后埋进未闭合代码块里——
				// 那段冻结的前缀插件再也够不着（视作代码、不剥），但参考模型仍按裸文档重算，二者必然不一致。
				// 这是真实但属边角的行为，非编号 bug；为聚焦状态转移压测，这里始终保持栅栏配平。
				const deletable: number[] = [];
				this.bare.forEach((l, idx) => {
					if (!(l.kind === "raw" && /^ {0,3}(`{3,}|~{3,})/.test(l.text)))
						deletable.push(idx);
				});
				if (this.bare.length > 1 && deletable.length) {
					const i = this.rng.pick(deletable);
					this.bare.splice(i, 1);
					this.rendered.splice(i, 1);
					this.trace.push(`deleteLine #${i}`);
				}
				break;
			}
			case "retitle": {
				const hs = this.headingIndices();
				if (hs.length) {
					const i = this.rng.pick(hs);
					const title = this.rng.pick(this.titlePool);
					const level = (this.bare[i] as { level: number }).level;
					// 用户清空并重打：两份状态同步成裸标题行。
					this.bare[i] = { kind: "heading", level, title };
					this.rendered[i] = serializeLine(this.bare[i]);
					if (title === "") this.cov.emptyTitle = true;
					if (SELF_EATING.has(title)) this.cov.selfEatingTitle = true;
					if (WHITELIST.has(title)) this.cov.whitelistHit = true;
					this.trace.push(`retitle #${i} -> ${JSON.stringify(title)}`);
				}
				break;
			}
			case "changeLevel": {
				const hs = this.headingIndices();
				if (hs.length) {
					const i = this.rng.pick(hs);
					const level = this.rng.pick(LEVEL_POOL);
					const title = (this.bare[i] as { title: string }).title;
					this.bare[i] = { kind: "heading", level, title };
					this.rendered[i] = serializeLine(this.bare[i]);
					if (level >= 5) this.cov.levelGE5 = true;
					this.trace.push(`changeLevel #${i} -> H${level}`);
				}
				break;
			}
		}
		this.cov.bumpOp(kind);
	}

	// ── 配置类激励（在约束内）─────────────────────────────────────────────────
	private config(): void {
		// inherit 翻转仍按**当前**前后缀是否都为空门控（约束未放开；非空前后缀下 inherit 翻转另案）。
		const affixEmptyNow =
			this.template.levels.h2.prefix === "" && this.template.levels.h2.suffix === "";
		const choices: OpKind[] = [
			"setNumeral",
			"setNumberSep",
			"setTitleSep",
			"setPrefix",
			"setSuffix",
			"setTopLevelLower",
			"setSkipFill",
			"setAncestor",
		];
		if (affixEmptyNow) choices.push("setInherit");
		const kind = this.rng.pick(choices);
		const lvls = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
		switch (kind) {
			case "setNumeral": {
				const n = this.rng.pick(NUMERALS);
				const lvl = this.rng.pick(lvls);
				this.template.levels[lvl].numeral = n;
				this.cov.numerals.add(n);
				this.trace.push(`setNumeral ${lvl}=${n}`);
				break;
			}
			case "setNumberSep": {
				const s = this.rng.pick(NUMBER_SEPS);
				for (const lvl of lvls) this.template.levels[lvl].numberSeparator = s;
				this.trace.push(`setNumberSep ${JSON.stringify(s)}`);
				break;
			}
			case "setTitleSep": {
				const s = this.rng.pick(TITLE_SEPS);
				for (const lvl of lvls) this.template.levels[lvl].titleSeparator = s;
				this.trace.push(`setTitleSep ${JSON.stringify(s)}`);
				break;
			}
			case "setInherit": {
				const v = this.rng.chance(0.5);
				const lvl = this.rng.pick(lvls);
				this.template.levels[lvl].inherit = v;
				if (!v) this.cov.inheritFalse = true;
				this.trace.push(`setInherit ${lvl}=${v}`);
				break;
			}
			case "setPrefix": {
				// 在「空 ↔ 候选」间切换（所有级别同步），验证 B2/B3「改前缀后再触发不叠加」。
				const v = this.rng.chance(0.5) ? "" : this.prefixCandidate;
				for (const lvl of lvls) this.template.levels[lvl].prefix = v;
				this.cov.affixToggled = true;
				this.trace.push(`setPrefix ${JSON.stringify(v)}`);
				break;
			}
			case "setSuffix": {
				const v = this.rng.chance(0.5) ? "" : this.suffixCandidate;
				for (const lvl of lvls) this.template.levels[lvl].suffix = v;
				this.cov.affixToggled = true;
				this.trace.push(`setSuffix ${JSON.stringify(v)}`);
				break;
			}
			case "setTopLevelLower": {
				const cur = this.template.topLevel;
				const next = this.rng.intRange(1, cur);
				if (next < cur) this.cov.topLevelLowered = true;
				this.template.topLevel = next;
				this.trace.push(`setTopLevelLower ${cur}->${next}`);
				break;
			}
			case "setSkipFill": {
				const sf: SkipFill = this.rng.chance(0.5)
					? { mode: "fill", placeholder: this.rng.pick(["0", "1"]) }
					: { mode: "drop" };
				this.template.skipFill = sf;
				if (sf.mode === "drop") this.cov.skipDrop = true;
				else this.cov.skipFill = true;
				this.trace.push(`setSkipFill ${sf.mode}`);
				break;
			}
			case "setAncestor": {
				const a: AncestorNumeral = this.rng.chance(0.5) ? "arabic" : "self";
				this.template.ancestorNumeral = a;
				if (a === "arabic") this.cov.ancestorArabic = true;
				else this.cov.ancestorSelf = true;
				this.trace.push(`setAncestor ${a}`);
				break;
			}
			default:
				break;
		}
		this.cov.bumpOp(kind);
	}

	// ── 触发（DUT）+ 记分板（参考模型）────────────────────────────────────────
	private trigger(): void {
		if (this.template.levels.h2.prefix !== "" || this.template.levels.h2.suffix !== "") {
			this.cov.affixNonEmptyTrigger = true;
		}
		const before = this.rendered.join("\n");
		const after = renumberContent(before, this.template, this.opts);
		this.rendered = after.split("\n");
		this.cov.bumpOp("trigger");
		this.cov.triggers++;
		this.trace.push("— trigger —");
		this.detectLevelJump();
		this.check();
	}

	private detectLevelJump(): void {
		const hs = this.bare.filter(
			(l): l is Extract<Line, { kind: "heading" }> => l.kind === "heading",
		);
		for (let i = 1; i < hs.length; i++) {
			if (hs[i].level - hs[i - 1].level >= 2) {
				this.cov.levelJump = true;
				return;
			}
		}
	}

	/** 记分板：DUT 输出必须等于「裸文档真值直接编号」，且层级 / 原样行不被改写。 */
	private check(): void {
		const dut = this.rendered.join("\n");
		const reference = renumberContent(serialize(this.bare), this.template, this.opts);
		if (dut !== reference) {
			throw new SequenceError(
				this.seed,
				this.trace,
				`参考模型不一致（旧前缀未被剥净 / 叠加）\n  DUT  : ${JSON.stringify(dut)}\n  期望 : ${JSON.stringify(
					reference,
				)}\n  裸文档 : ${JSON.stringify(serialize(this.bare))}`,
			);
		}
		// 结构不变量：标题级别数量与顺序不被改写（插件只增删前缀、绝不动 #）。
		const dutLevels = headingLevels(dut);
		const bareLevels = this.bare
			.filter((l): l is Extract<Line, { kind: "heading" }> => l.kind === "heading")
			.map((l) => l.level);
		// 注：被栅栏夹住的标题不计入——参考与 DUT 同口径，这里仅核对二者一致即可。
		const refLevels = headingLevels(reference);
		if (dutLevels.join(",") !== refLevels.join(",")) {
			throw new SequenceError(
				this.seed,
				this.trace,
				`标题层级被改写：DUT=${dutLevels} 参考=${refLevels} 裸=${bareLevels}`,
			);
		}
	}
}

/** 提取一段文本里（代码块外）各标题的级别序列。复用解析器口径以与 DUT 一致。 */
function headingLevels(text: string): number[] {
	// 轻量解析：仅供结构断言，规则与 parser 一致（栅栏外、行首 1–6 个 #）。
	const lines = text.split("\n");
	const out: number[] = [];
	let inFence = false;
	let fenceChar = "";
	for (const line of lines) {
		const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
		if (f) {
			const c = f[1][0];
			if (!inFence) {
				inFence = true;
				fenceChar = c;
			} else if (c === fenceChar) {
				inFence = false;
				fenceChar = "";
			}
			continue;
		}
		if (inFence) continue;
		const m = line.match(/^(#{1,6})[ \t]+/);
		if (m) out.push(m[1].length);
	}
	return out;
}

/** 跑一条序列：给定种子与操作步数，全程在记分板监督下随机推进。失败抛 {@link SequenceError}。 */
export function runSequence(seed: number, ops: number, cov: Coverage): void {
	const rng = new Rng(seed);
	const world = new World(rng, seed, cov);
	for (let i = 0; i < ops; i++) {
		world.step();
	}
	world.finish();
}
