/**
 * **已知 bug 的「特征化」测试**（characterization tests）。
 *
 * 本轮（0.6.2）升级 UVM 框架后新发现、**尚未修复**的 bug（见 doc/testplan.md §3.2 U1/U2/U3）。
 * 这里把它们当前的**有 bug 行为**钉成**通过**的断言，目的有三：
 * 1. 给未来修 bug 的 Agent 一个**精确的当前输出快照**与最小复现，省去重新摸索；
 * 2. 让 `npm test` 保持常绿（与本仓库「已知 bug 用约束 + testplan 登记、不放失败断言进 CI」的纪律一致）；
 * 3. 修复后这些断言会**变红**——这正是信号：届时把断言改成「幂等 / 不丢内容」的期望，并翻 testplan。
 *
 * ⚠️ 这些断言描述的是**错误**行为，**不是**规格目标。修 bug 时请连同 testplan §3.2 一起更新。
 */
import { describe, expect, it } from "vitest";
import {
	DEFAULT_TEMPLATE,
	renumberContent,
	type NumeralStyle,
	type Template,
} from "../../src/numbering";

function tpl(over: Partial<Template> = {}): Template {
	const t = structuredClone(DEFAULT_TEMPLATE);
	Object.assign(t, over);
	return t;
}
function setAll(
	t: Template,
	p: Partial<{ titleSeparator: string; prefix: string; suffix: string; numeral: NumeralStyle }>,
): Template {
	for (const k of ["h1", "h2", "h3", "h4", "h5", "h6"] as const) Object.assign(t.levels[k], p);
	return t;
}

describe("已知 bug 特征化（0.6.2 UVM 升级发现，未修；见 testplan §3.2）", () => {
	it("U1：低于 topLevel 的标题，标题文本含多层「数字+空格」→ 每次触发侵蚀一层（非幂等）", () => {
		const t = tpl({ topLevel: 3 });
		// 现状（bug）：H2 低于 topLevel=3，C3 剥离分支「只剥一层、且不重新写前缀」，故每触发一次就吃掉一段。
		const one = renumberContent("## 1 2024 总结", t);
		expect(one).toBe("## 2024 总结"); // ← 期望（修复后）：应稳定保留 "## 1 2024 总结" 或一次性到达定点
		const two = renumberContent(one, t);
		expect(two).toBe("## 总结"); // ← 再触发又吃一层：非幂等，用户标题被逐字蚕食
		const three = renumberContent(two, t);
		expect(three).toBe("## 总结"); // 吃到无数字前缀可剥才停
	});

	it("U2：titleSeparator 为「数字间隔符类」标点(。、. - 等)时，E5b『保留 2024』承诺失效→吞掉标题首段数字", () => {
		// 现状（bug）：E5b 承诺 "1 2024 总结" 稳定保留，但其前提是 titleSeparator=空格（空格被排除出
		// NUMBER_SEPARATOR_CLASS）。若用户把 titleSeparator 设成 "。"，"。" 本身属数字间隔符类，剥离正则
		// 把标题里的 "2024" 当成又一段序号吃掉。一次性（幂等），但丢内容、且与文档承诺矛盾。
		const t = setAll(tpl(), { titleSeparator: "。" });
		expect(renumberContent("## 1。2024 总结", t)).toBe("## 1。总结"); // "2024" 被吞
		// 对照：titleSeparator=空格 时 E5b 承诺成立，"2024" 保留
		const tSpace = setAll(tpl(), { titleSeparator: " " });
		expect(renumberContent("## 1 2024 总结", tSpace)).toBe("## 1 2024 总结");
	});

	it("U3：启用 upper/lower-alpha 时，字母/英文起头的标题被当字母序号吞掉（E5 的字母版）", () => {
		// 现状（取舍/bug 边界）：末段剥离 token 在「模板实际使用字母样式」时纳入 [A-Z]+/[a-z]+，
		// 于是 "API 设计" 的 "API" 被当 upper-alpha 序号剥掉。一次性（幂等）。
		const t = setAll(tpl(), { numeral: "upper-alpha" });
		expect(renumberContent("## API 设计", t)).toBe("## A 设计"); // "API" 被吞，再编号成 "A"
	});
});
