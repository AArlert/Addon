/**
 * UVM 风格「约束随机序列」测试入口（见 tests/dev_tests/uvm/framework.ts 与 uvm/README.md）。
 *
 * 跑一批种子，每个种子推进一条随机的「编辑文本 / 改模板 / 触发编号」序列，由参考模型记分板
 * 自动判对错；最后断言**功能覆盖率闭合**（确认随机真撞到了关心的场景）。
 *
 * 可调（环境变量）：
 * - `AAH_FUZZ_RUNS`：序列条数（默认 500）。
 * - `AAH_FUZZ_OPS`：每条序列的操作步数（默认 60）。
 * - `AAH_FUZZ_SEED`：起始种子（默认 1）。复现失败时设为报错里的 seed、RUNS=1 即可单跑那一条。
 * - `AAH_FUZZ_MODE`：`default`（参考模型记分板，常绿）| `explore`（放开约束 + 脏编辑 + 幂等性记分板，
 *   **找 bug 用、可能变红**）。explore 模式不在常规 CI 跑——它会撞到本轮登记的已知 bug（见 doc/testplan.md
 *   §3.2 U1/U2/U3）。用法：`AAH_FUZZ_MODE=explore AAH_FUZZ_RUNS=20000 AAH_FUZZ_OPS=80 npx vitest run ...`。
 */
import { describe, expect, it } from "vitest";
import { Coverage, runSequence, DEFAULT_GEN, EXPLORE_GEN } from "./uvm/framework";

const RUNS = Number(process.env.AAH_FUZZ_RUNS ?? 500);
const OPS = Number(process.env.AAH_FUZZ_OPS ?? 60);
const BASE_SEED = Number(process.env.AAH_FUZZ_SEED ?? 1);
const MODE = process.env.AAH_FUZZ_MODE ?? "default";

describe("约束随机序列（UVM 风格状态转移压测）", () => {
	it(`${RUNS} 条序列 × ${OPS} 步：参考模型记分板全程一致`, () => {
		const cov = new Coverage();
		// 单跑模式（RUNS=1 + 指定 SEED）时只跑那一条，便于复现失败种子。
		for (let i = 0; i < RUNS; i++) {
			// 不抛即通过；抛出的 SequenceError 含种子 + 操作轨迹 + 三方文本。
			runSequence(BASE_SEED + i, OPS, cov, DEFAULT_GEN);
		}
		// 仅在跑了足够多序列时才要求覆盖率闭合（单跑复现模式不强求）。
		if (RUNS >= 100) {
			expect(cov.gaps(), `功能覆盖率未闭合（缺失 bin）`).toEqual([]);
			expect(cov.triggers).toBeGreaterThan(RUNS); // 平均每条序列 >1 次触发
		}
	}, 30000); // 放宽超时：默认 500×60 通常 <2s，但 CI 机器波动或经 AAH_FUZZ_* 调大时留足余量。

	/**
	 * explore（找 bug）模式：放开字母样式 / 脏标题 / 手动破坏前缀，改用**幂等性记分板**
	 * （`renumber∘renumber === renumber`，恒成立、容脏输入）。仅在 `AAH_FUZZ_MODE=explore` 时启用——
	 * 它会撞到本轮登记**未修**的 bug（U1 低于 topLevel 侵蚀 / U2 标点 titleSeparator 吞标题首段数字 /
	 * U3 字母样式吞英文起头标题，见 doc/testplan.md §3.2），故默认 `it.skip`、不进常规 CI。
	 * 修好对应 bug 后，把它转正（去掉 skip 门控）即成回归网。
	 */
	const exploreIt = MODE === "explore" ? it : it.skip;
	exploreIt(
		`[explore] ${RUNS}×${OPS}：幂等性记分板（找 bug，可能红）`,
		() => {
			const cov = new Coverage();
			for (let i = 0; i < RUNS; i++) {
				runSequence(BASE_SEED + i, OPS, cov, EXPLORE_GEN);
			}
		},
		120000,
	);
});
