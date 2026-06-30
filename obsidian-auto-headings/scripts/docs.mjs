/**
 * 文档维护脚本：每个开发周期收尾时跑一次，把「机械整理」从 Agent 手里接过来省 token。
 *
 * 用法：
 *   node scripts/docs.mjs            # 归档 log.md 旧块 + 打印 testplan 摘要 + 校验 status.jsonl
 *   node scripts/docs.mjs --keep 5   # 改变 log.md 保留的最新周期块数（默认 3）
 *   node scripts/docs.mjs --check    # 只检查不改动（CI 用）：摘要 + 校验，但不挪动 log 块
 *
 * 做三件事：
 * 1. **归档 log.md**：只在 log.md 保留最新 N 个「带日期的周期块」，更旧的整体移入
 *    doc/log-archive.md（倒序，新的在上）。区分两类 `## ` 块：
 *      - 「周期块」= 标题含日期 YYYY-MM-DD → 受归档管控；
 *      - 「常青块」= 强制规则 / 目录结构约定 / 安装说明等无日期块 → 永远留在 log.md。
 * 2. **testplan 摘要**：扫描 doc/testplan.md 的真值表，按状态计数，并列出所有**非 ✅** 行
 *    （场景 ID + 行号），让 Agent 读这份摘要而非整读 439 行。**只读不改**，零信息损失。
 * 3. **校验 status.jsonl**：首行须为合法 JSON 且 type=status，否则报错。
 *
 * 设计原则：纯机械、可重复跑（幂等）。Agent 先在 log.md 顶部写完本周期新块、改完 testplan，
 * 再跑本脚本把旧块挪走——所以「写」与「挪」解耦，互不干扰。
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docDir = join(root, "doc");
const LOG = join(docDir, "log.md");
const ARCHIVE = join(docDir, "log-archive.md");
const TESTPLAN = join(docDir, "testplan.md");
const STATUS = join(docDir, "status.jsonl");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const keepIdx = args.indexOf("--keep");
const KEEP = keepIdx >= 0 ? Number(args[keepIdx + 1]) : 3;
if (!Number.isInteger(KEEP) || KEEP < 1) {
	console.error(`--keep 须为 ≥1 的整数，收到：${args[keepIdx + 1]}`);
	process.exit(1);
}

const DATE_RE = /\d{4}-\d{2}-\d{2}/;
const MARKERS = ["✅", "❌", "⚠️", "🔲"];

/**
 * 把 markdown 按 `## ` 顶层标题切块。返回 { preamble, sections:[{heading, text}] }。
 * preamble = 第一个 `## ` 之前的全部内容（标题 + 导语）。
 * 每个 section.text 含其 `## ` 标题行及到下一个 `## ` 前的全部正文。
 */
function splitSections(md) {
	const lines = md.split("\n");
	const starts = [];
	for (let i = 0; i < lines.length; i++) {
		if (/^## /.test(lines[i])) starts.push(i);
	}
	if (starts.length === 0) return { preamble: md, sections: [] };
	const preamble = lines.slice(0, starts[0]).join("\n");
	const sections = starts.map((s, idx) => {
		const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
		return { heading: lines[s], text: lines.slice(s, end).join("\n") };
	});
	return { preamble, sections };
}

/** 去掉块首尾的空行与孤立 `---` 分隔线，便于用统一分隔符重新拼接。 */
function trimBlock(text) {
	return text
		.trim()
		.replace(/\n*\s*---\s*$/, "")
		.trim();
}

function archiveLog() {
	if (!existsSync(LOG)) {
		console.error(`找不到 ${LOG}`);
		process.exit(1);
	}
	const { preamble, sections } = splitSections(readFileSync(LOG, "utf8"));

	const dated = sections.filter((sec) => DATE_RE.test(sec.heading));
	const keep = dated.slice(0, KEEP);
	const toArchive = dated.slice(KEEP);

	if (toArchive.length === 0) {
		console.log(`[log] 周期块共 ${dated.length} 个，≤ 保留数 ${KEEP}，无需归档。`);
		return;
	}
	if (checkOnly) {
		console.log(
			`[log] --check：有 ${toArchive.length} 个旧周期块可归档（保留 ${KEEP}）。未改动。`,
		);
		return;
	}

	// 拆分常青块：在第一个周期块「之前」的（强制规则）留顶部，其余（目录结构/安装）沉到底部参考区。
	const topPinned = [];
	const bottomPinned = [];
	let seenDated = false;
	for (const sec of sections) {
		if (DATE_RE.test(sec.heading)) {
			seenDated = true;
			continue;
		}
		if (seenDated) bottomPinned.push(sec);
		else topPinned.push(sec);
	}

	const SEP = "\n\n---\n\n";
	const newLog =
		preamble
			.trim()
			.replace(/\n*\s*---\s*$/, "")
			.trim() +
		SEP +
		[
			...topPinned.map((s) => trimBlock(s.text)),
			...keep.map((s) => trimBlock(s.text)),
			...bottomPinned.map((s) => trimBlock(s.text)),
		].join(SEP) +
		"\n";
	writeFileSync(LOG, newLog);

	// 归档文件：新归档块倒序在上，叠在既有归档之前。
	const archiveHeader =
		"# obsidian-auto-headings 开发日志归档（log-archive）\n\n" +
		"> 本文件是 `log.md` 滚动出去的**历史周期块**（倒序，新的在上）。平时不必读；\n" +
		"> 需要某次改动的来龙去脉时再来翻。当前活跃日志见 [`log.md`](./log.md)。\n";
	const archivedBlocks = toArchive.map((s) => trimBlock(s.text)).join(SEP);
	let existing = "";
	if (existsSync(ARCHIVE)) {
		const raw = readFileSync(ARCHIVE, "utf8");
		// 剥掉旧归档文件的 preamble（到第一个 `## ` 为止），只取历史块拼回。
		const sp = splitSections(raw);
		existing = sp.sections.map((s) => trimBlock(s.text)).join(SEP);
	}
	const newArchive =
		archiveHeader + "\n---\n\n" + archivedBlocks + (existing ? SEP + existing : "") + "\n";
	writeFileSync(ARCHIVE, newArchive);

	console.log(
		`[log] 归档 ${toArchive.length} 个旧周期块 → log-archive.md；log.md 保留最新 ${keep.length} 块` +
			`（+ ${topPinned.length + bottomPinned.length} 个常青块）。`,
	);
}

function reportTestplan() {
	if (!existsSync(TESTPLAN)) {
		console.log(`[testplan] 无 ${TESTPLAN}，跳过。`);
		return;
	}
	const lines = readFileSync(TESTPLAN, "utf8").split("\n");
	const counts = Object.fromEntries(MARKERS.map((m) => [m, 0]));
	const outstanding = [];
	lines.forEach((line, i) => {
		if (!line.startsWith("|")) return;
		const cells = line.split("|").map((c) => c.trim());
		const last =
			cells[cells.length - 1] === "" ? cells[cells.length - 2] : cells[cells.length - 1];
		if (!last) return;
		const marker = MARKERS.find((m) => last.startsWith(m));
		if (!marker) return; // 排除图例行（marker 在首格、末格是文字描述）
		counts[marker]++;
		if (marker !== "✅") {
			const id = cells[1] || "?";
			outstanding.push(`  L${i + 1} ${marker} ${id}`);
		}
	});
	const total = Object.values(counts).reduce((a, b) => a + b, 0);
	console.log(
		`[testplan] 场景 ${total} 条：` + MARKERS.map((m) => `${m}${counts[m]}`).join(" / "),
	);
	if (outstanding.length) {
		console.log(
			`[testplan] 待办（非 ✅，共 ${outstanding.length}）——读这里即可，不必整读 testplan：`,
		);
		console.log(outstanding.join("\n"));
	}
}

function checkStatus() {
	if (!existsSync(STATUS)) {
		console.log(`[status] 无 ${STATUS}，跳过。`);
		return;
	}
	const first = readFileSync(STATUS, "utf8")
		.split("\n")
		.find((l) => l.trim());
	try {
		const obj = JSON.parse(first);
		if (obj.type !== "status") throw new Error('首行 type !== "status"');
		console.log(`[status] 首行合法：version=${obj.version}`);
	} catch (e) {
		console.error(`[status] 首行不是合法的状态 JSON：${e.message}`);
		process.exitCode = 1;
	}
}

archiveLog();
reportTestplan();
checkStatus();
