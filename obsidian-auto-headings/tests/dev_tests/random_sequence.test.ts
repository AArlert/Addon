/**
 * UVM 风格「约束随机序列」测试入口（见 tests/dev_tests/uvm/framework.ts 与 uvm/README.md）。
 *
 * 跑一批种子，每个种子推进一条随机的「编辑文本 / 改模板 / 触发编号」序列，由参考模型记分板
 * 自动判对错；最后断言**功能覆盖率闭合**（确认随机真撞到了关心的场景）。
 *
 * 可调（环境变量）：
 * - `AAH_FUZZ_RUNS`：序列条数（默认 300）。
 * - `AAH_FUZZ_OPS`：每条序列的操作步数（默认 40）。
 * - `AAH_FUZZ_SEED`：起始种子（默认 1）。复现失败时设为报错里的 seed、RUNS=1 即可单跑那一条。
 */
import { describe, expect, it } from "vitest";
import { Coverage, runSequence } from "./uvm/framework";

const RUNS = Number(process.env.AAH_FUZZ_RUNS ?? 400);
const OPS = Number(process.env.AAH_FUZZ_OPS ?? 40);
const BASE_SEED = Number(process.env.AAH_FUZZ_SEED ?? 1);

describe("约束随机序列（UVM 风格状态转移压测）", () => {
	it(`${RUNS} 条序列 × ${OPS} 步：参考模型记分板全程一致`, () => {
		const cov = new Coverage();
		// 单跑模式（RUNS=1 + 指定 SEED）时只跑那一条，便于复现失败种子。
		for (let i = 0; i < RUNS; i++) {
			// 不抛即通过；抛出的 SequenceError 含种子 + 操作轨迹 + 三方文本。
			runSequence(BASE_SEED + i, OPS, cov);
		}
		// 仅在跑了足够多序列时才要求覆盖率闭合（单跑复现模式不强求）。
		if (RUNS >= 100) {
			expect(cov.gaps(), `功能覆盖率未闭合（缺失 bin）`).toEqual([]);
			expect(cov.triggers).toBeGreaterThan(RUNS); // 平均每条序列 >1 次触发
		}
	}, 30000); // 放宽超时：默认 400×40 通常 <1s，但 CI 机器波动或经 AAH_FUZZ_* 调大时留足余量。
});
