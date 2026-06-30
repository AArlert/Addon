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
 * ## 两种模式与两块记分板（0.6.2 升级）
 *
 * 由 {@link GenConfig} 切换：
 * - **默认模式**（{@link DEFAULT_GEN}，参考模型记分板 {@link World.check}）：在「已修好、参考不变量恒成立」
 *   的受约束空间里随机，确保 CI 常绿、专逮残留 / 叠加。本轮在此**放开 inherit×非空前后缀**（B8 实测无 bug）、
 *   **新增就地安全编辑** {@link OpKind editTitleInPlace}（模拟在已编号标题里继续打字）。
 * - **explore 模式**（{@link EXPLORE_GEN}，幂等性记分板 {@link World.checkIdempotent}）：**放开全部约束**
 *   （字母样式 / inherit×非空前后缀 / 脏标题 / 手动破坏前缀），用恒成立的幂等性（`renumber∘renumber===renumber`）
 *   找 bug。本轮在 20000×80 里撞出 testplan §3.2 的 **U1**（低于 topLevel 标题逐次侵蚀）、**U2**（标点
 *   titleSeparator 吞标题首段数字）、**U3**（字母样式吞英文起头标题）。
 *
 * ## 约束（= 默认模式下 strip 健壮性的精确刻画）
 *
 * - `prefix` / `suffix`：**已放开**——「空 ↔ 候选」随机切换（B2/B3 已修，方案 A）。数字起头标题**不再回避**
 *   （L2 已修）。
 * - `inherit`：**0.6.2 已放开**——可在非空前后缀下翻转（B8 实测无叠加、幂等，原约束过保守）。
 * - `topLevel`：**已放开**（0.6.0 C3 修复）。
 * - 默认模式随机样式仍只用 arabic/cjk/circled（字母样式 L1/U3 取舍，仅 explore 放开）；默认模式不喂脏标题、
 *   不破坏前缀区（E5/U1/U2 取舍/未修 bug，仅 explore 放开）。
 * - 其余（numeral、两个间隔符、skipFill、ancestorNumeral、文本编辑、就地编辑、层级、代码块、白名单）：自由变。
 *
 * > 默认约束**就是 bug 边界**：放开一条 = 扩大覆盖，放开后变红即没修彻底。explore 模式则故意越过这些边界
 * > 找新 bug（U1/U2/U3 即此而来）。详见 uvm/README.md「放开约束」。
 *
 * ## 0.6.5 升级：扩大验证空间与自由度
 *
 * 把「插件全部可设置 + 用户可操作」更完整地纳入激励空间：
 * - **真实白名单驱动**：删去旧版注入的 `isWhitelisted` 回调，改由 `template.whitelist`（随机 0–2 条，
 *   匹配方式含 **exact/partial/subtree**）驱动引擎的 {@link computeWhitelistExemptions}——旧版**完全没
 *   覆盖子树 / 部分匹配与「子标题随根豁免」**。新增 `setWhitelist` 配置激励（增 / 删 / 改条目，覆盖
 *   「改白名单后再触发」的状态转移）。DUT 与参考两侧均走真实 whitelist，故能逮「带历史前缀 vs 裸文档」
 *   的豁免分叉（8000×80 默认模式全绿 → 确认 exact/partial/subtree 引擎实现一致、无前缀敏感分叉）。
 * - **结束编号层级 bottomLevel**：新增 `setBottomLevel` 激励（在 [topLevel,6] 随机），覆盖「只编号区间」
 *   与「收窄区间后剥残留」。
 * - **覆盖率新 bin**：whitelist-exact/partial/subtree、subtree-带子标题、bottomLevel-narrowed（默认 500×60 闭合）。
 * - explore 模式（新维度叠加脏编辑）撞出 **U4**（标题正文以**空白起头**时连续触发非幂等：首次保留前导空格、
 *   再次被 parser `[ \t]+` 收拢，见 testplan §3.2）——登记未修。
 */

import {
	computeWhitelistExemptions,
	DEFAULT_TEMPLATE,
	renumberContent,
	type AncestorNumeral,
	type NumeralStyle,
	type SkipFill,
	type Template,
	type WhitelistEntry,
} from "../../../src/numbering";
import { parseHeadings } from "../../../src/parser";
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
/**
 * 白名单**候选词池**（0.6.5 升级：UVM 改用**真实** `template.whitelist` 驱动引擎的
 * {@link computeWhitelistExemptions}，覆盖 exact/partial/**subtree** 三种匹配，而非旧版注入
 * 的 `isWhitelisted` 回调——后者只测「单点命中」、**完全没覆盖子树 / 部分匹配**）。
 *
 * 这些词都出现在 {@link TITLES} 里（如「附录」「目录」「参考文献」「小结」「概述」），故随机把它们
 * 设进白名单后会真实命中标题，驱动子树 / 部分匹配的豁免与计数器跳过逻辑。
 */
const WHITELIST_WORDS = ["目录", "附录", "参考文献", "小结", "概述"];
/** 白名单匹配方式池（含 subtree，专为覆盖子树豁免与「子标题错挂」边界）。 */
const MATCH_MODES: WhitelistEntry["match"][] = ["exact", "partial", "subtree"];
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
 * **字母 / 罗马数字样式**（lower/upper-alpha, lower/upper-roman）：仅 explore 模式纳入随机样式池。
 * 默认仍按 L1 取舍排除（见框架顶部注释）；explore 放开以撞「改走字母/罗马后残留」「自食标题」等。
 */
const NUMERALS_WITH_ALPHA: NumeralStyle[] = [
	...NUMERALS,
	"lower-alpha",
	"upper-alpha",
	"lower-roman",
	"upper-roman",
];

/**
 * 「就地编辑」追加用的**安全碎片**：纯中文、不以数字 / 分隔符 / 字母 / 空白起头。
 * 默认模式下用它给已带前缀的标题追加文本，保证「裸↔渲染」对应干净、参考模型不变量恒成立。
 */
const SAFE_FRAGMENTS = ["补充", "说明", "细节", "续", "草稿"];

/**
 * explore 模式的**脏碎片**：以分隔符 / 数字 / 字母 / 空白起头，专门撞**容差剥离的误伤边界**
 * （标题首字符恰落入「标题间隔符容差类」或「序号 token」时是否被吃掉）。
 */
const MESSY_FRAGMENTS = ["-注", ".5", "、附", "2024 ", "a) ", "  ", ") ", "."];

/** explore 模式额外的**分隔符 / 符号起头标题**（裸态即以容差类字符起头）。 */
const MESSY_TITLES = ["- 列表式标题", ". 点起头", "、顿号起头", ") 右括起头", "1.2 像子号"];

/**
 * **生成器约束配置**：把「在哪些维度上随机」抽成可切换的配置。
 * - {@link DEFAULT_GEN}：当前「常绿」空间（约束 = strip 健壮性的精确刻画），新增「就地安全编辑」。
 * - {@link EXPLORE_GEN}：**放开已知约束**（字母样式 / inherit×非空前后缀 / 脏编辑）的**找 bug** 空间，
 *   改用**幂等性记分板**（恒成立、容脏输入），不在默认 CI 跑（见 random_sequence.test.ts 的 explore 门）。
 */
export interface GenConfig {
	/** 随机序号样式池（默认 arabic/cjk/circled；explore 加 lower/upper-alpha）。 */
	numerals: NumeralStyle[];
	/** 是否允许在「当前前后缀非空」时翻转 `inherit`（默认否=约束；explore 放开，验证 testplan B8）。 */
	allowInheritWithAffix: boolean;
	/** 是否启用「就地编辑已带前缀的标题」激励（保留旧前缀、改标题文本，模拟真实打字）。 */
	inPlaceEdit: boolean;
	/** 是否启用「手动破坏前缀区」激励（删字符 / 改数字 / 去空格，模拟手抖删错；仅 explore）。 */
	manualPrefixEdit: boolean;
	/** 是否把「脏碎片 / 分隔符起头标题」纳入取样（仅 explore）。 */
	messyTitles: boolean;
	/**
	 * 记分板：
	 * - `reference`：裸文档参考模型（强，能逮残留/叠加，但要求激励落在「干净」空间）。
	 * - `idempotent`：幂等性（`renumber∘renumber === renumber`，**恒成立**、容脏输入与放开的约束）。
	 */
	oracle: "reference" | "idempotent";
}

/**
 * 默认（常绿）生成配置：参考模型记分板。本轮在原约束上**放开两处、新增一处**（均经 20000×80 验证绿）：
 * - 放开 `inherit × 非空前后缀`（testplan B8 实测无叠加、幂等，原约束过保守）；
 * - 新增「就地安全编辑」（保留旧前缀改标题文本，模拟真实打字主线）。
 *
 * 仍约束：字母样式（L1 取舍）、脏标题 / 手动破坏前缀（参考模型对其会因 E5/L1 取舍误报，改由
 * explore 模式 + 幂等性记分板覆盖，见 {@link EXPLORE_GEN}）。
 */
export const DEFAULT_GEN: GenConfig = {
	numerals: NUMERALS,
	allowInheritWithAffix: true,
	inPlaceEdit: true,
	manualPrefixEdit: false,
	messyTitles: false,
	oracle: "reference",
};

/** explore（找 bug）生成配置：放开字母 / inherit×非空前后缀 / 脏编辑，改用幂等性记分板。 */
export const EXPLORE_GEN: GenConfig = {
	numerals: NUMERALS_WITH_ALPHA,
	allowInheritWithAffix: true,
	inPlaceEdit: true,
	manualPrefixEdit: true,
	messyTitles: true,
	oracle: "idempotent",
};

/** 各类激励（仅用于覆盖率与失败时的轨迹打印）。 */
export type OpKind =
	| "insertHeading"
	| "insertRaw"
	| "insertFence"
	| "deleteLine"
	| "retitle"
	| "editTitleInPlace"
	| "mutatePrefix"
	| "changeLevel"
	| "setNumeral"
	| "setNumberSep"
	| "setTitleSep"
	| "setInherit"
	| "setPrefix"
	| "setSuffix"
	| "setTopLevel"
	| "setBottomLevel"
	| "setSkipFill"
	| "setAncestor"
	| "setWhitelist"
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
	/** topLevel 被**升高**（C3 修复后放开，见框架顶部注释）。 */
	topLevelRaised = false;
	/** 前缀 / 后缀曾被切换（验证 B2/B3 的状态转移）。 */
	affixToggled = false;
	/** 曾在「前缀或后缀非空」的状态下触发编号。 */
	affixNonEmptyTrigger = false;
	fencePresent = false;
	whitelistHit = false;
	/** 白名单三种匹配方式各自曾被设入模板（真实 whitelist 驱动，0.6.5）。 */
	whitelistExact = false;
	whitelistPartial = false;
	whitelistSubtree = false;
	/** 曾出现「子树根命中且其下确有更深子标题被一并豁免」的情形。 */
	whitelistSubtreeWithChildren = false;
	/** 结束编号层级 bottomLevel 曾被收窄到 < 6（编号区间下界，0.6.5）。 */
	bottomLevelNarrowed = false;
	emptyTitle = false;
	levelGE5 = false;
	levelJump = false;
	selfEatingTitle = false;
	/** 曾就地编辑过「已带前缀」的标题（保留旧前缀改文本）。 */
	inPlaceEdited = false;
	/** 曾手动破坏过前缀区（explore）。 */
	prefixMutated = false;
	/** 曾在「前后缀非空」状态下翻转 inherit（explore，验证 B8）。 */
	inheritWithAffix = false;
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
			"editTitleInPlace",
			"changeLevel",
			"setNumeral",
			"setNumberSep",
			"setTitleSep",
			"setInherit",
			"setPrefix",
			"setSuffix",
			"setTopLevel",
			"setBottomLevel",
			"setSkipFill",
			"setAncestor",
			"setWhitelist",
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
		if (!this.topLevelRaised) missing.push("topLevel-raised");
		if (!this.affixToggled) missing.push("affix-toggled");
		if (!this.affixNonEmptyTrigger) missing.push("affix-nonempty-trigger");
		if (!this.fencePresent) missing.push("fence");
		if (!this.whitelistHit) missing.push("whitelist-hit");
		if (!this.whitelistExact) missing.push("whitelist-exact");
		if (!this.whitelistPartial) missing.push("whitelist-partial");
		if (!this.whitelistSubtree) missing.push("whitelist-subtree");
		if (!this.whitelistSubtreeWithChildren) missing.push("whitelist-subtree-children");
		if (!this.bottomLevelNarrowed) missing.push("bottomLevel-narrowed");
		if (!this.emptyTitle) missing.push("empty-title");
		if (!this.levelGE5) missing.push("level>=5");
		if (!this.levelJump) missing.push("level-jump");
		if (!this.selfEatingTitle) missing.push("self-eating-title");
		if (!this.inPlaceEdited) missing.push("in-place-edit");
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
	 *
	 * 0.6.5 起**不再注入 `isWhitelisted` 回调**——改由引擎按 `template.whitelist` 自动计算豁免
	 * （{@link computeWhitelistExemptions}），从而真正覆盖 exact/partial/subtree 三种匹配。
	 */
	private readonly opts: {
		strippablePrefixes: string[];
		strippableSuffixes: string[];
	};
	/** 本序列的标题取样池；方案 A 后不再回避「数字/字母起头」标题（恒含空前缀候选 → 对称处理）。 */
	private readonly titlePool: string[];
	private readonly trace: string[] = [];

	constructor(
		private readonly rng: Rng,
		private readonly seed: number,
		private readonly cov: Coverage,
		private readonly cfg: GenConfig = DEFAULT_GEN,
	) {
		this.titlePool = cfg.messyTitles ? [...TITLES, ...MESSY_TITLES] : TITLES;
		this.prefixCandidate = rng.pick(PREFIX_CANDIDATES);
		this.suffixCandidate = rng.pick(SUFFIX_CANDIDATES);
		this.opts = {
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
		// 随机初始白名单：0–2 条，词取自标题池里真实出现的词，匹配方式随机（含 subtree）。
		tpl.whitelist = this.randomWhitelist();
		this.template = tpl;
		// 起始：一个最小裸文档（一个标题），后续靠编辑 Op 长大。
		this.bare = [
			{ kind: "heading", level: Math.max(topLevel, 2), title: rng.pick(this.titlePool) },
		];
		this.rendered = this.bare.map(serializeLine);
	}

	/** 随机生成一组白名单条目（0–2 条，词去重，匹配方式随机）。 */
	private randomWhitelist(): WhitelistEntry[] {
		const count = this.rng.int(3); // 0/1/2
		const out: WhitelistEntry[] = [];
		const used = new Set<string>();
		for (let i = 0; i < count; i++) {
			const text = this.rng.pick(WHITELIST_WORDS);
			if (used.has(text)) continue;
			used.add(text);
			out.push({ text, match: this.rng.pick(MATCH_MODES) });
		}
		return out;
	}

	/**
	 * 计算**裸文档**里被白名单豁免的标题所在行下标（供就地编辑守卫与覆盖率）。
	 * 直接复用引擎的 {@link computeWhitelistExemptions}，与 DUT 同口径。
	 */
	private exemptBareIndices(): Set<number> {
		const headings = parseHeadings(serialize(this.bare));
		const exemptSet = computeWhitelistExemptions(headings, this.template, this.opts);
		const out = new Set<number>();
		for (const h of headings) {
			if (exemptSet.has(h)) out.add(h.lineIndex);
		}
		return out;
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
		const choices: OpKind[] = [
			"insertHeading",
			"insertRaw",
			"insertFence",
			"deleteLine",
			"retitle",
			"changeLevel",
		];
		if (this.cfg.inPlaceEdit) choices.push("editTitleInPlace");
		if (this.cfg.manualPrefixEdit) choices.push("mutatePrefix");
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
					this.trace.push(`retitle #${i} -> ${JSON.stringify(title)}`);
				}
				break;
			}
			case "editTitleInPlace": {
				// 「就地编辑」：用户在**已经带编号前缀**的标题行里继续打字 / 改文本，**旧前缀仍留在行上**。
				// 这是真实使用的主线（不像 retitle 把整行清空重打），也是 strip 最易出错处——剥离面对的是
				// 「（可能用旧配置写的）旧前缀 + 新标题文本」。默认模式只追加**安全碎片**（保参考模型干净）；
				// explore 模式允许追加 / 前插**脏碎片**（分隔符 / 数字 / 字母 / 空白起头），撞容差剥离误伤边界。
				const hs = this.headingIndices();
				if (hs.length) {
					const i = this.rng.pick(hs);
					const h = this.bare[i] as Extract<Line, { kind: "heading" }>;
					const oldTitle = h.title;
					// 从当前渲染行提取「旧前缀」= marker 之后、裸标题之前的那段（可能含上次触发写入的编号）。
					const marker = "#".repeat(h.level) + " ";
					const body = this.rendered[i].startsWith(marker)
						? this.rendered[i].slice(marker.length)
						: this.rendered[i];
					const oldPrefix = body.endsWith(oldTitle)
						? body.slice(0, body.length - oldTitle.length)
						: "";
					let newTitle: string | null = null;
					if (this.cfg.messyTitles && this.rng.chance(0.5)) {
						const frag = this.rng.pick(MESSY_FRAGMENTS);
						newTitle = this.rng.chance(0.5) ? frag + oldTitle : oldTitle + frag;
					} else if (
						// 默认模式：避开自食 / 当前被白名单豁免 / 空标题，保证「裸↔渲染」strip 干净、参考模型恒一致。
						// 白名单判定改用引擎真实豁免集合（含 subtree），与 0.6.5 的真实 whitelist 驱动一致。
						this.cfg.messyTitles ||
						(!SELF_EATING.has(oldTitle) &&
							!this.exemptBareIndices().has(i) &&
							oldTitle !== "")
					) {
						newTitle = oldTitle + this.rng.pick(SAFE_FRAGMENTS);
					}
					if (newTitle !== null) {
						this.bare[i] = { kind: "heading", level: h.level, title: newTitle };
						this.rendered[i] = marker + oldPrefix + newTitle;
						this.cov.inPlaceEdited = true;
						if (SELF_EATING.has(newTitle)) this.cov.selfEatingTitle = true;
						this.trace.push(
							`editTitleInPlace #${i} keepPrefix=${JSON.stringify(oldPrefix)} -> ${JSON.stringify(newTitle)}`,
						);
					}
				}
				break;
			}
			case "mutatePrefix": {
				// 手动破坏前缀区（explore 专用）：用户手抖删/改了编号里的字符（删一位、去空格、改数字），
				// 但**裸标题意图不变**。故**不更新 bare**——只能用幂等性记分板校验（参考模型在此无效）。
				const hs = this.headingIndices();
				if (hs.length) {
					const i = this.rng.pick(hs);
					const h = this.bare[i] as Extract<Line, { kind: "heading" }>;
					const marker = "#".repeat(h.level) + " ";
					if (this.rendered[i].startsWith(marker)) {
						const body = this.rendered[i].slice(marker.length);
						// 仅当 body 比裸标题长（带前缀）时才破坏。
						if (body.length > h.title.length) {
							const prefixLen = body.length - h.title.length;
							let pre = body.slice(0, prefixLen);
							const which = this.rng.int(3);
							if (which === 0 && pre.length) {
								const k = this.rng.int(pre.length);
								pre = pre.slice(0, k) + pre.slice(k + 1); // 删一个字符
							} else if (which === 1) {
								pre = pre.replace(" ", ""); // 去一个空格
							} else {
								pre = pre.replace(/\d/, (d) => String((Number(d) + 1) % 10)); // 改一个数字
							}
							this.rendered[i] = marker + pre + h.title;
							this.cov.prefixMutated = true;
							this.trace.push(
								`mutatePrefix #${i} -> ${JSON.stringify(this.rendered[i])}`,
							);
						}
					}
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
			"setTopLevel",
			"setBottomLevel",
			"setSkipFill",
			"setAncestor",
			"setWhitelist",
		];
		if (affixEmptyNow || this.cfg.allowInheritWithAffix) choices.push("setInherit");
		const kind = this.rng.pick(choices);
		const lvls = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
		switch (kind) {
			case "setNumeral": {
				const n = this.rng.pick(this.cfg.numerals);
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
				if (
					this.template.levels[lvl].prefix !== "" ||
					this.template.levels[lvl].suffix !== ""
				) {
					this.cov.inheritWithAffix = true;
				}
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
			case "setTopLevel": {
				const cur = this.template.topLevel;
				const next = this.rng.intRange(1, 4);
				if (next < cur) this.cov.topLevelLowered = true;
				if (next > cur) this.cov.topLevelRaised = true;
				this.template.topLevel = next;
				// 保持 bottomLevel ≥ topLevel（与 GUI 一致），避免退化空区间淹没覆盖。
				if (this.template.bottomLevel < next) this.template.bottomLevel = next;
				this.trace.push(`setTopLevel ${cur}->${next}`);
				break;
			}
			case "setBottomLevel": {
				// 结束编号层级（0.6.5）：在 [topLevel, 6] 内随机，覆盖「只编号区间」与收窄后剥残留。
				const cur = this.template.bottomLevel;
				const next = this.rng.intRange(this.template.topLevel, 6);
				this.template.bottomLevel = next;
				if (next < 6) this.cov.bottomLevelNarrowed = true;
				this.trace.push(`setBottomLevel ${cur}->${next}`);
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
			case "setWhitelist": {
				// 真实白名单驱动（0.6.5）：随机增 / 删 / 改一条条目（含 subtree），驱动引擎的
				// computeWhitelistExemptions，覆盖「改白名单后再触发」的状态转移与子树豁免。
				const wl = this.template.whitelist;
				const action = wl.length === 0 ? 0 : this.rng.int(3);
				if (action === 0) {
					const text = this.rng.pick(WHITELIST_WORDS);
					const match = this.rng.pick(MATCH_MODES);
					if (!wl.some((e) => e.text === text && e.match === match)) {
						wl.push({ text, match });
					}
				} else if (action === 1) {
					wl.splice(this.rng.int(wl.length), 1);
				} else {
					wl[this.rng.int(wl.length)].match = this.rng.pick(MATCH_MODES);
				}
				this.trace.push(`setWhitelist ${JSON.stringify(wl)}`);
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
		this.detectWhitelistCoverage();
		if (this.cfg.oracle === "reference") {
			this.check();
		} else {
			this.checkIdempotent();
		}
	}

	/** 收集白名单相关覆盖率（匹配方式 / 命中 / 子树带子标题），与真实豁免集合一致。 */
	private detectWhitelistCoverage(): void {
		for (const e of this.template.whitelist) {
			if (e.match === "exact") this.cov.whitelistExact = true;
			else if (e.match === "partial") this.cov.whitelistPartial = true;
			else if (e.match === "subtree") this.cov.whitelistSubtree = true;
		}
		const exempt = this.exemptBareIndices();
		if (exempt.size > 0) this.cov.whitelistHit = true;
		// 子树带子标题：存在 subtree 条目，且相邻两个被豁免标题中后者更深（= 子标题被一并豁免）。
		if (this.template.whitelist.some((e) => e.match === "subtree") && exempt.size >= 2) {
			const headings = parseHeadings(serialize(this.bare));
			for (let i = 0; i < headings.length - 1; i++) {
				if (
					exempt.has(headings[i].lineIndex) &&
					exempt.has(headings[i + 1].lineIndex) &&
					headings[i + 1].level > headings[i].level
				) {
					this.cov.whitelistSubtreeWithChildren = true;
					break;
				}
			}
		}
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

	/**
	 * **幂等性记分板**（explore 模式）：对刚触发得到的文本**再触发一次**，必须不变
	 * （`renumber(renumber(x)) === renumber(x)`，见 testplan §1「幂等性总断言」）。
	 *
	 * 它**恒成立、与配置无关**，故能容纳放开的约束（字母样式 / inherit×非空前后缀）与脏激励
	 * （就地脏编辑 / 手动破坏前缀）——这些会让「裸文档参考模型」因既定取舍（E5/L1）误报，而幂等性不会。
	 * 它逮的是「再触发就变样」的**非定点叠加**（旧前缀没剥净、下一次又叠一层且与上次不同）。
	 *
	 * > 局限：若叠加后的形态本身已是**定点**（再触发不变，如 L1 残留 `1 a) 标题`），幂等性逮不到——
	 * > 那类「定点但错」的残留由默认模式的参考模型在受约束空间里把守。两记分板**互补**。
	 */
	private checkIdempotent(): void {
		const once = this.rendered.join("\n"); // = 本次触发输出（已写回 rendered）。
		const twice = renumberContent(once, this.template, this.opts);
		if (twice !== once) {
			throw new SequenceError(
				this.seed,
				this.trace,
				`幂等性失败（连续触发两次不一致 → 旧前缀未剥净 / 非定点叠加）\n  1× : ${JSON.stringify(
					once,
				)}\n  2× : ${JSON.stringify(twice)}`,
			);
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
export function runSequence(
	seed: number,
	ops: number,
	cov: Coverage,
	cfg: GenConfig = DEFAULT_GEN,
): void {
	const rng = new Rng(seed);
	const world = new World(rng, seed, cov, cfg);
	for (let i = 0; i < ops; i++) {
		world.step();
	}
	world.finish();
}
