# UVM 风格「约束随机序列」测试框架

把硬件验证里的 **UVM（Universal Verification Methodology）**思想搬来压测编号引擎：用**约束随机**的
「用户操作序列」大面积撞 bug，配一个**参考模型记分板**自动判对错，再用**功能覆盖率**确认真撞到了
关心的场景。专治 testplan 里那类「单测没事、特定操作序列才炸」的**状态转移** bug。

## 为什么需要它

`renumberContent` 每次触发 = **剥旧前缀 + 重新编号**。绝大多数诡异 bug 出在「剥」——旧前缀是用
**旧配置**写的，剥离器拿的是**新配置**。手写穷举「先用配置 A 编号 → 改某字段 → 再触发」的组合不现实，
随机序列能在几千条里把这些路径都走一遍。

## UVM 组件映射

| UVM 概念                      | 这里                                          | 文件/符号                   |
| ----------------------------- | --------------------------------------------- | --------------------------- |
| Sequence item（激励）         | 一个操作：编辑文本 / 改模板字段 / 触发编号    | `OpKind`                    |
| Sequencer（约束随机产生激励） | 依当前状态在约束内随机选一个操作              | `World.step`                |
| Driver（把激励打到 DUT）      | 把操作施加到「裸文档真值」与「编辑器文本」    | `World.edit/config/trigger` |
| DUT（被测对象）               | 编号引擎                                      | `renumberContent`           |
| Reference model + Scoreboard  | DUT 输出 **必须等于**「从裸文档真值直接编号」 | `World.check`               |
| Functional coverage           | 关键场景 bin 是否都撞到                       | `Coverage`                  |

## 记分板核心不变量（oracle）

维护两份状态：

-   `bare`：**规范裸文档**（无任何编号），是「用户真实意图」的真值。
-   `rendered`：**当前编辑器各行文本**，含上一次触发写入的前缀，与 `bare` 行一一锁步。

每次「触发」后断言：

```
join(rendered)  ===  renumberContent(serialize(bare), 当前模板)
└ DUT：对带历史前缀的文本剥离+重编      └ 参考：对裸文本直接编号（strip 对裸文本是 no-op）
```

两者相等 ⟺ `stripPrefix` 把历史前缀剥得干干净净。**任何前缀叠加 / 残留都会让两侧不等而被当场抓出**
（B1–B5、C3 都逮得到），且参考侧复用**可信的 build 路径**、不重复实现编号逻辑、不会和 DUT 一起错。

此外还断言：标题 `#` 层级不被改写、原样行（正文/代码块）不被动。

## 约束 = 当前 strip 健壮性的精确刻画

默认生成器只在「当前已修好、参考不变量恒成立」的空间里随机，确保 CI 常绿。每条约束都对应一个
**已知未修的 bug / 有意取舍**。0.3.18 已**放开** B2/B3、L2 两条：

| 约束                                            | 对应                                                            | 状态              |
| ----------------------------------------------- | --------------------------------------------------------------- | ----------------- |
| ~~`prefix`/`suffix` 固定~~ → 「空 ↔ 候选」切换 | **B2/B3**（改前后缀后剥不净）                                   | ✅ 放开（0.3.18） |
| ~~回避「数字/字母起头」标题~~ → 恒喂全部标题    | **L2**（数字起头标题的历史相关吃号）                            | ✅ 放开（0.3.18） |
| `inherit` 仅当**当前**前后缀都为空时才翻转      | 非空前后缀 × inherit 翻转另案                                   | 仍约束            |
| `topLevel` 只减不增                             | testplan **C3**（升 topLevel 留下移出范围的旧前缀，待清除命令） | 仍约束            |
| 随机样式只用 arabic/cjk/circled，不混字母       | 字母不在 `ALWAYS_STRIPPABLE_STYLES`（改走字母会残留，有意取舍） | 仍约束            |

放开 B2/B3 的做法：前后缀在「空 ↔ 本序列候选」间随机切换，并把「空 + 候选」并集经 `strippablePrefixes`
/ `strippableSuffixes` 传给 `renumberContent`（模拟 main.ts 传入的全模板并集，即**方案 A**）。
放开 L2 的做法：剥离恒纳入空前缀候选 → 裸态与带前缀态对称地都吃数字起头标题，参考模型一致；配合
引擎「只剥一层」，`1 2024` 这类用户补回的数字得以保留（E5b 静态覆盖）。

> **放开约束 = 扩大覆盖**：每修好一个对应 bug，就放开对应约束，框架立刻开始覆盖更大空间。若放开后
> 变红，说明修得不彻底——这正是回归网。0.3.18 放开两条后，15000×80 全绿、覆盖率闭合。

## 怎么跑

```bash
npm test                                   # 含默认 400 条 × 40 步（<1s），随 CI 一起跑
npm run test:fuzz                          # 重型：5000 条 × 80 步（找新 bug / 改完引擎后压一遍）
AAH_FUZZ_RUNS=20000 AAH_FUZZ_OPS=80 npx vitest run tests/dev_tests/random_sequence.test.ts --testTimeout=120000
```

## 复现失败

失败会抛 `SequenceError`，内含 **seed + 完整操作轨迹（含每次 trigger）+ DUT/期望/裸文档三方文本**。
照种子单跑那一条即可稳定复现：

```bash
AAH_FUZZ_SEED=9 AAH_FUZZ_RUNS=1 AAH_FUZZ_OPS=60 npx vitest run tests/dev_tests/random_sequence.test.ts
```

> RNG 是 mulberry32（`rng.ts`），同种子结果跨机一致，故失败 100% 可复现。

## 加新维度 / 新操作

1. 在 `OpKind` 加类型、在 `World.edit`/`config` 加生成与施加逻辑、在 `Coverage` 加对应 bin。
2. 若新维度可能触达**已知 bug**，先加相应**约束**（并在上表登记对应 testplan ID），保持 CI 绿。
3. 跑 `npm run test:fuzz` 几轮确认不误报，再提交。
