/**
 * Layer 2 集成测试：`main.ts` 的**触发层**（防抖 / 单一事务写回 / frontmatter 与全局开关门控 /
 * 立即重新编号 / 设置面板改模板后即时重排）。
 *
 * 此前所有测试只覆盖纯引擎 `renumberContent`，真实触发路径零覆盖。这里经 `vitest.config.ts` 的
 * `obsidian` 别名（→ `obsidian-mock.ts`）加载真正的 `AutoHeadingsPlugin`，用一个**假编辑器**
 * （记录事务次数 + 应用整行替换）和 **vitest 假定时器**驱动其私有触发方法，断言可观察行为。
 *
 * 对应 doc/testplan.md **J 类**（J1 防抖合并 / J2 卸载取消 / J3 多文件独立 / J4 单一事务 / J5 改模板
 * 即时重排）与**可测的 I 类**（I2 frontmatter OFF / I4 全局开关关）。`window.setTimeout` 由
 * `globalThis.window = globalThis` + 假定时器提供（源码用 `window.setTimeout` 调度防抖）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AutoHeadingsPlugin from "../../src/main";
import { DEFAULT_TEMPLATE, type Template } from "../../src/numbering";
import { Notice } from "./obsidian-mock";

/** 假编辑器：持有按行切分的文本，记录 `transaction` 调用次数（用于「单一事务」断言）。 */
class FakeEditor {
	private lines: string[];
	/** `transaction` 被调用的次数。一次完整重排应只产生 **1** 次事务。 */
	txnCount = 0;

	constructor(text: string) {
		this.lines = text.split("\n");
	}

	getValue(): string {
		return this.lines.join("\n");
	}

	/** main.ts 的整文重排永不增删行，每个 change 都是「整行替换」（from.ch=0 → 旧行长度）。 */
	transaction(tx: {
		changes: Array<{ from: { line: number; ch: number }; to: unknown; text: string }>;
	}): void {
		this.txnCount++;
		for (const c of tx.changes) {
			this.lines[c.from.line] = c.text;
		}
	}
}

/** 被测插件的内部/私有面（运行时存在，TS 私有不阻止访问）。 */
interface PluginInternals {
	settings: { enabled: boolean; debounceDelay: number };
	templateStore: { getDefault(): Template; all(): Template[] };
	applyRenumber(editor: unknown): boolean;
	scheduleRenumber(editor: unknown, info: unknown): void;
	runImmediateRenumber(editor: unknown, ctx: unknown): void;
	strippableAffixes(): { prefixes: string[]; suffixes: string[] };
	renumberActiveFile(): void;
	onunload(): void;
}

/** 以 H2 中文样式覆盖默认模板（用于「改模板后即时重排」）。 */
function cjkTemplate(): Template {
	return {
		...DEFAULT_TEMPLATE,
		levels: {
			...DEFAULT_TEMPLATE.levels,
			h2: { ...DEFAULT_TEMPLATE.levels.h2, numeral: "cjk" },
		},
	};
}

/** 以 H2 前缀「第」覆盖默认模板（用于「全模板前后缀并集」接线）。 */
function prefixTemplate(): Template {
	return {
		...DEFAULT_TEMPLATE,
		name: "带前缀",
		levels: {
			...DEFAULT_TEMPLATE.levels,
			h2: { ...DEFAULT_TEMPLATE.levels.h2, prefix: "第" },
		},
	};
}

function makePlugin(opts: { enabled?: boolean; delay?: number; allTemplates?: Template[] } = {}) {
	const tplBox = { current: DEFAULT_TEMPLATE };
	let activeView: { editor: FakeEditor } | null = null;
	const app = {
		workspace: {
			getActiveViewOfType: (_cls: unknown): { editor: FakeEditor } | null => activeView,
		},
	};
	const PluginCtor = AutoHeadingsPlugin as unknown as new (
		app: unknown,
		manifest: unknown,
	) => AutoHeadingsPlugin;
	const plugin = new PluginCtor(app, { id: "auto-headings", dir: "plugins/auto-headings" });
	const p = plugin as unknown as PluginInternals;
	p.settings = { enabled: opts.enabled ?? true, debounceDelay: opts.delay ?? 300 };
	p.templateStore = {
		getDefault: () => tplBox.current,
		all: () => opts.allTemplates ?? [tplBox.current],
	};
	return {
		p,
		setTemplate: (t: Template) => {
			tplBox.current = t;
		},
		setActiveView: (v: { editor: FakeEditor } | null) => {
			activeView = v;
		},
	};
}

const fileInfo = (path: string) => ({ file: { path } });

beforeEach(() => {
	(globalThis as unknown as { window: unknown }).window = globalThis;
	vi.useFakeTimers();
	Notice.messages.length = 0;
});

afterEach(() => {
	vi.useRealTimers();
});

describe("applyRenumber：写回、单一事务、幂等与 frontmatter 门控", () => {
	it("对未编号内容写回正确编号，且只发起一次事务（J4）", () => {
		const { p } = makePlugin();
		const ed = new FakeEditor(["# 文档", "## 章", "### 节", "## 章二"].join("\n"));
		expect(p.applyRenumber(ed)).toBe(true);
		expect(ed.getValue()).toBe(["# 文档", "## 1 章", "### 1.1 节", "## 2 章二"].join("\n"));
		// 多行改动合并为一次事务（一次撤销即可回退整次重排）。
		expect(ed.txnCount).toBe(1);
	});

	it("内容已是正确编号时不改动、不发起事务（幂等）", () => {
		const { p } = makePlugin();
		const ed = new FakeEditor("## 1 章");
		expect(p.applyRenumber(ed)).toBe(false);
		expect(ed.txnCount).toBe(0);
	});

	it("frontmatter 显式 OFF：跳过、不改动（I2）", () => {
		const { p } = makePlugin();
		const ed = new FakeEditor(
			["---", "obsidian-auto-headings: OFF", "---", "## 章"].join("\n"),
		);
		expect(p.applyRenumber(ed)).toBe(false);
		expect(ed.getValue()).toContain("## 章");
		expect(ed.getValue()).not.toContain("## 1 章");
		expect(ed.txnCount).toBe(0);
	});

	it("frontmatter 非 OFF（缺省）：照常编号（I1）", () => {
		const { p } = makePlugin();
		const ed = new FakeEditor(["---", "title: 笔记", "---", "## 章"].join("\n"));
		expect(p.applyRenumber(ed)).toBe(true);
		expect(ed.getValue()).toContain("## 1 章");
	});
});

describe("scheduleRenumber：防抖合并 / 多文件独立 / 卸载取消 / 全局开关", () => {
	it("延迟内多次触发只在停顿后编号一次（J1）", () => {
		const { p } = makePlugin({ delay: 300 });
		const ed = new FakeEditor("## 章");
		const info = fileInfo("a.md");
		p.scheduleRenumber(ed, info);
		p.scheduleRenumber(ed, info);
		p.scheduleRenumber(ed, info);
		// 到期前不应有任何写回。
		expect(ed.getValue()).toBe("## 章");
		expect(ed.txnCount).toBe(0);
		vi.advanceTimersByTime(300);
		// 三次调度合并为一次编号。
		expect(ed.getValue()).toBe("## 1 章");
		expect(ed.txnCount).toBe(1);
	});

	it("防抖以文件路径为单位，互不取消（J3）", () => {
		const { p } = makePlugin({ delay: 300 });
		const edA = new FakeEditor("## 甲");
		const edB = new FakeEditor("## 乙");
		p.scheduleRenumber(edA, fileInfo("a.md"));
		p.scheduleRenumber(edB, fileInfo("b.md"));
		vi.advanceTimersByTime(300);
		expect(edA.getValue()).toBe("## 1 甲");
		expect(edB.getValue()).toBe("## 1 乙");
	});

	it("卸载插件取消所有待处理更新，不再写回（J2）", () => {
		const { p } = makePlugin({ delay: 300 });
		const ed = new FakeEditor("## 章");
		p.scheduleRenumber(ed, fileInfo("a.md"));
		p.onunload(); // 模拟关闭/卸载：清掉待处理计时器
		vi.advanceTimersByTime(300);
		expect(ed.getValue()).toBe("## 章");
		expect(ed.txnCount).toBe(0);
	});

	it("全局开关关：不安排任何更新（I4）", () => {
		const { p } = makePlugin({ enabled: false });
		const ed = new FakeEditor("## 章");
		p.scheduleRenumber(ed, fileInfo("a.md"));
		vi.advanceTimersByTime(300);
		expect(ed.txnCount).toBe(0);
	});

	it("调度后、到期前关闭全局开关：到期回调再校验后跳过", () => {
		const { p } = makePlugin({ delay: 300 });
		const ed = new FakeEditor("## 章");
		p.scheduleRenumber(ed, fileInfo("a.md"));
		p.settings.enabled = false; // 其间用户关掉了开关
		vi.advanceTimersByTime(300);
		expect(ed.getValue()).toBe("## 章");
		expect(ed.txnCount).toBe(0);
	});
});

describe("runImmediateRenumber：绕过防抖、取消待处理、遵守开关", () => {
	it("立即编号并取消同文件待处理的防抖（不二次触发）", () => {
		const { p } = makePlugin({ delay: 300 });
		const ed = new FakeEditor("## 章");
		const ctx = fileInfo("a.md");
		p.scheduleRenumber(ed, ctx); // 先排一个待处理更新
		p.runImmediateRenumber(ed, ctx);
		expect(ed.getValue()).toBe("## 1 章");
		expect(ed.txnCount).toBe(1);
		expect(Notice.messages).toContain("已重新编号");
		// 待处理的防抖应被取消：推进时间不再产生第二次事务。
		vi.advanceTimersByTime(300);
		expect(ed.txnCount).toBe(1);
	});

	it("内容无需改动时提示「无需改动」、不发起事务", () => {
		const { p } = makePlugin();
		const ed = new FakeEditor("## 1 章");
		p.runImmediateRenumber(ed, fileInfo("a.md"));
		expect(ed.txnCount).toBe(0);
		expect(Notice.messages).toContain("无需改动");
	});

	it("全局开关关：提示已禁用、不改动", () => {
		const { p } = makePlugin({ enabled: false });
		const ed = new FakeEditor("## 章");
		p.runImmediateRenumber(ed, fileInfo("a.md"));
		expect(ed.getValue()).toBe("## 章");
		expect(ed.txnCount).toBe(0);
		expect(Notice.messages).toContain("自动编号已全局禁用，未执行");
	});
});

describe("renumberActiveFile：设置面板改模板后即时重排（J5）", () => {
	it("改模板后对当前活动文件即时重排（默认 → 中文）", () => {
		const { p, setTemplate, setActiveView } = makePlugin();
		const ed = new FakeEditor("## 章");
		setActiveView({ editor: ed });
		p.renumberActiveFile();
		expect(ed.getValue()).toBe("## 1 章");
		// 模板改成中文样式后再调用：旧 `1 ` 被剥、写入 `一 `（不叠加）。
		setTemplate(cjkTemplate());
		p.renumberActiveFile();
		expect(ed.getValue()).toBe("## 一 章");
	});

	it("全局开关关：renumberActiveFile 静默跳过", () => {
		const { p, setActiveView } = makePlugin({ enabled: false });
		const ed = new FakeEditor("## 章");
		setActiveView({ editor: ed });
		p.renumberActiveFile();
		expect(ed.getValue()).toBe("## 章");
	});

	it("无活动 Markdown 视图：不抛错、不动作", () => {
		const { p, setActiveView } = makePlugin();
		setActiveView(null);
		expect(() => p.renumberActiveFile()).not.toThrow();
	});
});

describe("strippableAffixes：把全模板前后缀并集接进 applyRenumber（方案 A）", () => {
	it("收集全部模板各级在用的前后缀并集，并恒含空串", () => {
		const { p } = makePlugin({ allTemplates: [DEFAULT_TEMPLATE, prefixTemplate()] });
		const { prefixes, suffixes } = p.strippableAffixes();
		expect(prefixes).toContain("");
		expect(prefixes).toContain("第");
		expect(suffixes).toContain("");
	});

	it("当前模板无前缀，但别的模板用「第」→ 旧「第1 」前缀仍被剥净（不叠加）", () => {
		// 活动模板 = 默认（空前缀）；并集里含「第」（来自另一模板）→ 经 applyRenumber 接线后可剥。
		const { p } = makePlugin({ allTemplates: [DEFAULT_TEMPLATE, prefixTemplate()] });
		const ed = new FakeEditor("## 第1 标题");
		expect(p.applyRenumber(ed)).toBe(true);
		expect(ed.getValue()).toBe("## 1 标题");
	});
});
