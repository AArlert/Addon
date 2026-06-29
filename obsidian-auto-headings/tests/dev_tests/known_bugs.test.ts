/**
 * **已修复 bug 的回归测试**（原「特征化」测试，0.6.3 修复后转正）。
 *
 * - U1（C6）：低于 topLevel 的标题，含多层「数字+空格」→ 循环剥离到定点，单次触发幂等（0.6.3 修复）。
 * - U2（B10）：titleSeparator 为数字间隔符类标点时 E5b 承诺失效 → tolerantInnerSeparator 修复（0.6.3）。
 * - U3：启用 upper/lower-alpha 时字母开头标题被吞——设计取舍，保留特征化（不修）。
 *
 * ⚠️ U3 断言仍描述错误行为，修复后会变红——届时一并更新 testplan。
 */
import { describe, expect, it } from "vitest";
import {
	DEFAULT_TEMPLATE,
	WORD_JOINER,
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

describe("bug 回归（0.6.3 修复 U1/U2；U3 仍为特征化）", () => {
	it("U1 修复：低于 topLevel 的标题，标题文本含多层「数字+空格」→ 单次触发即到定点（幂等）", () => {
		const t = tpl({ topLevel: 3 });
		// 0.6.3 修复：循环剥离到定点，首次触发一次性剥净所有可识别前缀层，此后稳定。
		// H2 低于 topLevel=3，`1 2024 总结` 中 `1 ` 是可识别的 arabic 前缀，被剥为 `2024 总结`；
		// `2024` 再次被识别为 arabic 前缀（`2024 总结` → 剥 `2024 ` → `总结`）；
		// `总结` 无数字起头，循环停止 → 首次触发输出 `## 总结`，之后触发稳定。
		const one = renumberContent("## 1 2024 总结", t);
		expect(one).toBe("## 总结"); // 单次触发到定点（修复 U1）
		const two = renumberContent(one, t);
		expect(two).toBe("## 总结"); // 之后稳定（幂等）
	});

	it("U2 修复：titleSeparator 为「数字间隔符类」标点(。)时，E5b『保留 2024』承诺成立", () => {
		// 0.6.3 修复：tolerantInnerSeparator 阻止 `。` 被当作段间分隔符消费，
		// `1。2024 总结` 正确识别为「序号=1，titleSep=。，正文=2024 总结」，2024 不被吞。
		// 0.6.4：buildPrefix 追加 WJ，输出形如 `1。⁠2024 总结`。
		const t = setAll(tpl(), { titleSeparator: "。" });
		expect(renumberContent("## 1。2024 总结", t)).toBe(`## 1。${WORD_JOINER}2024 总结`);
		// 对照：titleSeparator=空格时 E5b 承诺同样成立（WJ 精确定界）
		const tSpace = setAll(tpl(), { titleSeparator: " " });
		expect(renumberContent("## 1 2024 总结", tSpace)).toBe(`## 1 ${WORD_JOINER}2024 总结`);
	});

	it("U3：启用 upper/lower-alpha 时，字母/英文起头的标题被当字母序号吞掉（特征化，未修）", () => {
		// 现状（取舍/bug 边界）：末段剥离 token 在「模板实际使用字母样式」时纳入 [A-Z]+/[a-z]+，
		// 于是 "API 设计" 的 "API" 被当 upper-alpha 序号剥掉，再编号成 "A ⁠设计"（含 WJ）。
		const t = setAll(tpl(), { numeral: "upper-alpha" });
		expect(renumberContent("## API 设计", t)).toBe(`## A ${WORD_JOINER}设计`);
	});
});
