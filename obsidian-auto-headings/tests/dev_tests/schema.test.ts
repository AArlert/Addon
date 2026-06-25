import { describe, expect, it } from "vitest";
import {
	createDefaultTemplate,
	DEFAULT_TEMPLATE_FILENAME,
	DEFAULT_TEMPLATE_NAME,
	normalizeTemplate,
	serializeTemplate,
	templateFileName,
} from "../../src/templates/schema";

describe("normalizeTemplate", () => {
	it("空对象回退为合法的默认结构", () => {
		const t = normalizeTemplate({}, "兜底名");
		expect(t.name).toBe("兜底名");
		expect(Object.keys(t.levels)).toEqual(["h2", "h3", "h4", "h5", "h6"]);
		expect(t.levels.h2).toEqual({
			prefix: "",
			numeral: "arabic",
			suffix: "",
			numberSeparator: ".",
			titleSeparator: " ",
			inherit: true,
		});
		expect(t.whitelist).toEqual([]);
	});

	it("非法 numeral 回退为 arabic，inherit 缺省为 true", () => {
		const t = normalizeTemplate({ name: "x", levels: { h2: { numeral: "roman" } } }, "fb");
		expect(t.levels.h2.numeral).toBe("arabic");
		expect(t.levels.h2.inherit).toBe(true);
	});

	it("inherit 仅在显式 false 时关闭", () => {
		const t = normalizeTemplate({ levels: { h5: { inherit: false } } }, "fb");
		expect(t.levels.h5.inherit).toBe(false);
		expect(t.levels.h4.inherit).toBe(true);
	});

	it("保留合法字段并过滤损坏的白名单条目", () => {
		const t = normalizeTemplate(
			{
				name: "学术",
				levels: { h2: { prefix: "第", numeral: "cjk", titleSeparator: "章 " } },
				whitelist: [
					{ text: "附录", match: "subtree" },
					{ text: "目录" }, // match 缺省 → exact
					{ match: "exact" }, // 无 text → 丢弃
					"坏数据", // 非对象 → 丢弃
				],
			},
			"fb",
		);
		expect(t.name).toBe("学术");
		expect(t.levels.h2.prefix).toBe("第");
		expect(t.levels.h2.numeral).toBe("cjk");
		expect(t.whitelist).toEqual([
			{ text: "附录", match: "subtree" },
			{ text: "目录", match: "exact" },
		]);
	});

	it("非对象输入整体回退", () => {
		expect(normalizeTemplate(null, "fb").name).toBe("fb");
		expect(normalizeTemplate("oops", "fb").levels.h3.numeral).toBe("arabic");
	});

	it("缺失 skipFill（旧模板）回退为默认补 0", () => {
		const t = normalizeTemplate({ name: "旧模板" }, "fb");
		expect(t.skipFill).toEqual({ mode: "fill", placeholder: "0" });
	});

	it("保留合法的 skipFill：drop / fill 数字占位", () => {
		expect(normalizeTemplate({ skipFill: { mode: "drop" } }, "fb").skipFill).toEqual({
			mode: "drop",
		});
		expect(
			normalizeTemplate({ skipFill: { mode: "fill", placeholder: "9" } }, "fb").skipFill,
		).toEqual({ mode: "fill", placeholder: "9" });
	});

	it("非法/空 skipFill 回退：未知 mode→默认，fill 空占位→补 0", () => {
		expect(normalizeTemplate({ skipFill: { mode: "wat" } }, "fb").skipFill).toEqual({
			mode: "fill",
			placeholder: "0",
		});
		expect(
			normalizeTemplate({ skipFill: { mode: "fill", placeholder: "" } }, "fb").skipFill,
		).toEqual({ mode: "fill", placeholder: "0" });
	});

	it("占位字符仅保留数字（非数字滤除、全非数字回退 0）", () => {
		expect(
			normalizeTemplate({ skipFill: { mode: "fill", placeholder: "a1-2b" } }, "fb").skipFill,
		).toEqual({ mode: "fill", placeholder: "12" });
		expect(
			normalizeTemplate({ skipFill: { mode: "fill", placeholder: "*-#" } }, "fb").skipFill,
		).toEqual({ mode: "fill", placeholder: "0" });
	});

	it("保留各级 suffix（后缀字段）", () => {
		const t = normalizeTemplate({ levels: { h2: { prefix: "第", suffix: "章" } } }, "fb");
		expect(t.levels.h2.prefix).toBe("第");
		expect(t.levels.h2.suffix).toBe("章");
		expect(t.levels.h3.suffix).toBe(""); // 缺省为空
	});
});

describe("serializeTemplate", () => {
	it("产出带缩进、可往返解析的 JSON", () => {
		const t = createDefaultTemplate();
		const json = serializeTemplate(t);
		expect(json.endsWith("\n")).toBe(true);
		expect(JSON.parse(json)).toEqual(t);
	});
});

describe("templateFileName", () => {
	it("默认模板固定映射为 default.json", () => {
		expect(templateFileName(DEFAULT_TEMPLATE_NAME)).toBe(DEFAULT_TEMPLATE_FILENAME);
	});

	it("非法字符替换为连字符，空格保留", () => {
		expect(templateFileName("技术/文档:v2")).toBe("技术-文档-v2.json");
		expect(templateFileName("学术 风格")).toBe("学术 风格.json");
	});

	it("折叠多余连字符并去除首尾标点", () => {
		expect(templateFileName("--a//b--")).toBe("a-b.json");
	});

	it("全部为非法字符时回退为 template.json", () => {
		expect(templateFileName("///")).toBe("template.json");
	});
});

describe("createDefaultTemplate", () => {
	it("名称为「默认」且各级均为 arabic", () => {
		const t = createDefaultTemplate();
		expect(t.name).toBe(DEFAULT_TEMPLATE_NAME);
		expect(t.levels.h2.numeral).toBe("arabic");
		expect(t.levels.h6.numeral).toBe("arabic");
	});
});
