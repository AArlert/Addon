/**
 * **已修复 bug 的回归测试**。
 *
 * U1/U2/U3 原是「容差正则把正文当编号吃掉」的同源问题（0.6.3 部分缓解）。**方案A（0.6.6）从根上根治**：
 * `stripPrefix` 只认带 Word Joiner 的（插件自己写的）前缀，**无 WJ 的正文一律不剥**，故：
 * - U1：低于 topLevel 的 `1 2024 总结` 不再被逐次蚕食（无 WJ → 不剥，原样保留）。
 * - U2：标点 titleSeparator 下 `2024` 不再被吞（整段是正文）。
 * - U3：upper/lower-alpha 下 `API 设计` 的 `API` 不再被当字母序号吞（整段是正文）。
 *
 * 本文件断言「方案A 后三者均不丢正文且幂等」。
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

describe("bug 回归（方案A 0.6.6 根治 U1/U2/U3：无 WJ 正文一律不剥）", () => {
	it("U1 根治：低于 topLevel 含「数字+空格」的标题原样保留（不再被蚕食）", () => {
		const t = tpl({ topLevel: 3 });
		// H2 低于 topLevel=3 → 不编号；`1 2024 总结` 无 WJ → 不剥 → 原样保留、幂等。
		const one = renumberContent("## 1 2024 总结", t);
		expect(one).toBe("## 1 2024 总结");
		expect(renumberContent(one, t)).toBe(one);
	});

	it("U2 根治：标点 titleSeparator 下 2024 不被吞（整段是正文）", () => {
		const t = setAll(tpl(), { titleSeparator: "。" });
		// `1。2024 总结` 无 WJ → 整段正文 → 仅左侧加前缀 `1。⁠`，2024 完整保留、幂等。
		const one = renumberContent("## 1。2024 总结", t);
		expect(one).toBe(`## 1。${WORD_JOINER}1。2024 总结`);
		expect(one).toContain("2024");
		expect(renumberContent(one, t)).toBe(one);
	});

	it("U3 根治：upper/lower-alpha 下 API 不被当字母序号吞", () => {
		const t = setAll(tpl(), { numeral: "upper-alpha" });
		// `API 设计` 无 WJ → 不剥 → `A ⁠API 设计`（API 完整保留），幂等。
		const one = renumberContent("## API 设计", t);
		expect(one).toBe(`## A ${WORD_JOINER}API 设计`);
		expect(renumberContent(one, t)).toBe(one);
	});
});
