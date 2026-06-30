/**
 * 代码符号地图生成器：扫 src/ 下全部 TypeScript，产出 doc/codemap.md。
 *
 * 目的：支撑「grep 优先、禁整读大文件」纪律——Agent 先在 codemap 里搜函数/方法名，
 * 拿到 `文件:行号` 与一句话意图，再去 grep / 读那一处，不必整读 1000+ 行的大文件。
 *
 * 用 TypeScript compiler API 走 AST（而非正则）——因为最大的 `SettingsTab.ts` 几乎全是
 * **类方法**，正则抓类方法很脆；AST 能准确拿到 function / 类方法 / class / interface / type。
 * `typescript` 已是 devDependency，零新依赖。
 *
 * 产物两段：
 * 1. **全局索引**（覆盖全部文件）：`符号 → 文件:行号`，按名排序——解决「这函数在哪个文件」。
 * 2. **大文件大纲**（仅超过 BIG_FILE_LINES 行的文件）：逐符号一行，带签名 + JSDoc 首行意图。
 *
 * 生成确定性（同样源码 → 同样字节），以便 pre-commit 守卫用 --check 做新鲜度比对。
 *
 * 用法：
 *   node scripts/codemap.mjs      # 直接生成 doc/codemap.md
 *   （通常由 `npm run docs` 调用 generateCodemap()，并由 docs --check 守卫新鲜度）
 */
import ts from "typescript";
import { readdirSync, statSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, relative, sep } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
export const CODEMAP_PATH = join(ROOT, "doc", "codemap.md");

/** 超过这么多行的源文件才生成「逐符号大纲」（小文件直接 grep 已够便宜）。 */
const BIG_FILE_LINES = 300;
/** 签名 / 意图行的截断长度，控体量。 */
const MAX_SIG = 100;
const MAX_DOC = 70;

/** 相对仓库根、统一用 `/` 的 posix 路径（保证跨平台输出一致）。 */
const relPosix = (file) => relative(ROOT, file).split(sep).join("/");

/** 递归列出 src 下全部 .ts（排除 .d.ts），路径排序确保确定性。 */
function listTsFiles(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...listTsFiles(full));
		else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(full);
	}
	return out.sort();
}

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** 取紧贴节点上方那条 JSDoc 的首行（§2 强制中文 JSDoc，白送一句意图）。 */
function firstJsDocLine(node) {
	const docs = node.jsDoc;
	if (!docs || !docs.length) return "";
	let c = docs[docs.length - 1].comment;
	if (!c) return "";
	if (typeof c !== "string") c = c.map((p) => p.text || "").join("");
	return truncate(c.split(/\r?\n/)[0].trim(), MAX_DOC);
}

const lineOf = (node, sf) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/** 从 start..end 截原文当签名，折叠空白、去尾随 `{`。 */
function sigText(sf, start, end) {
	return truncate(
		sf.text
			.slice(start, end)
			.replace(/\s+/g, " ")
			.replace(/\s*\{?\s*$/, "")
			.trim(),
		MAX_SIG,
	);
}

/** 可调用声明（function/method/ctor/accessor）的签名：截到函数体 `{` 之前。 */
function callableSig(node, sf) {
	const end = node.body ? node.body.getStart(sf) : node.getEnd();
	return sigText(sf, node.getStart(sf), end);
}

/** 收集单个源文件的符号。返回 [{name, kind, line, sig, doc}]（按出现顺序）。 */
function collect(sf) {
	const out = [];
	const push = (node, name, kind, sig) =>
		out.push({ name, kind, line: lineOf(node, sf), sig, doc: firstJsDocLine(node) });

	for (const st of sf.statements) {
		if (ts.isFunctionDeclaration(st) && st.name) {
			push(st, st.name.text, "function", callableSig(st, sf));
		} else if (ts.isClassDeclaration(st) && st.name) {
			const cls = st.name.text;
			push(st, cls, "class", `class ${cls}`);
			for (const m of st.members) {
				if (ts.isConstructorDeclaration(m))
					push(m, `${cls}.constructor`, "ctor", callableSig(m, sf));
				else if (ts.isMethodDeclaration(m) && m.name)
					push(m, `${cls}.${m.name.getText(sf)}`, "method", callableSig(m, sf));
				else if (ts.isGetAccessorDeclaration(m) && m.name)
					push(m, `${cls}.${m.name.getText(sf)}`, "get", callableSig(m, sf));
				else if (ts.isSetAccessorDeclaration(m) && m.name)
					push(m, `${cls}.${m.name.getText(sf)}`, "set", callableSig(m, sf));
			}
		} else if (ts.isInterfaceDeclaration(st) && st.name) {
			push(st, st.name.text, "interface", `interface ${st.name.text}`);
		} else if (ts.isTypeAliasDeclaration(st) && st.name) {
			push(st, st.name.text, "type", `type ${st.name.text}`);
		} else if (ts.isEnumDeclaration(st) && st.name) {
			push(st, st.name.text, "enum", `enum ${st.name.text}`);
		} else if (ts.isVariableStatement(st)) {
			for (const d of st.declarationList.declarations) {
				if (
					d.name &&
					ts.isIdentifier(d.name) &&
					d.initializer &&
					(ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
				) {
					const end = d.initializer.body ? d.initializer.body.getStart(sf) : d.getEnd();
					out.push({
						name: d.name.text,
						kind: "function",
						line: lineOf(d, sf),
						sig: sigText(sf, d.getStart(sf), end),
						doc: firstJsDocLine(st),
					});
				}
			}
		}
	}
	return out;
}

/** 生成 codemap.md 全文（确定性字符串）。 */
export function generateCodemap() {
	const files = listTsFiles(SRC);
	const perFile = files.map((file) => {
		const text = readFileSync(file, "utf8");
		const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
		return { rel: relPosix(file), lines: text.split("\n").length, symbols: collect(sf) };
	});

	// 全局索引：所有符号，按名 → 文件 → 行 排序。
	const index = [];
	for (const f of perFile) for (const s of f.symbols) index.push({ ...s, rel: f.rel });
	index.sort(
		(a, b) => a.name.localeCompare(b.name) || a.rel.localeCompare(b.rel) || a.line - b.line,
	);

	const lines = [];
	lines.push(
		"<!-- 自动生成 by scripts/codemap.mjs — 请勿手改。改源码后 `npm run docs` 重新生成；pre-commit 守卫会拦下过期的 codemap。 -->",
	);
	lines.push("# 代码符号地图（codemap）");
	lines.push("");
	lines.push(
		"> 给「grep 优先、禁整读大文件」纪律用：先在本表搜函数/方法名 → 拿 `文件:行号` 与一句话意图 →",
	);
	lines.push(
		"> 再去 grep / 读那一处。覆盖：**全局索引**（全部文件）；**大纲**仅列超过 " +
			BIG_FILE_LINES +
			" 行的大文件。",
	);
	lines.push("");
	lines.push(`## 索引（${index.length} 个符号 → 位置，按名排序）`);
	lines.push("");
	lines.push("| 符号 | 位置 |");
	lines.push("|------|------|");
	for (const s of index) lines.push(`| \`${s.name}\` | \`${s.rel}:${s.line}\` |`);
	lines.push("");

	const bigFiles = perFile.filter((f) => f.lines > BIG_FILE_LINES && f.symbols.length);
	lines.push(`## 大文件大纲（> ${BIG_FILE_LINES} 行）`);
	lines.push("");
	for (const f of bigFiles) {
		lines.push(`### ${f.rel} （${f.lines} 行）`);
		lines.push("");
		for (const s of f.symbols) {
			const doc = s.doc ? ` — ${s.doc}` : "";
			lines.push(`- L${s.line} \`${s.sig}\`${doc}`);
		}
		lines.push("");
	}
	return lines.join("\n").replace(/\n+$/, "\n");
}

// 直接运行时写文件（通常改由 npm run docs 调用 generateCodemap）。
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	writeFileSync(CODEMAP_PATH, generateCodemap());
	console.log(`[codemap] 已生成 ${relPosix(CODEMAP_PATH)}`);
}
