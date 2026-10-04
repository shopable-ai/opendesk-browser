# 独立 F1 Architect 页面 provisional 复核

**页面 lane：BLOCK。最终联合 F1 未批准。** 我独立复核冻结页面候选 `2edcc1b0ca37f22a21105255cf90a02f1fa1b4a6e72081fa23d816708ee3a036`，并在未改 fixture 的新 profile 中重现真实撤权历史丢失。没有用分数替代功能资格；控制 lane 尚未提供最终冻结联合 hash。

完整结构化范围、全部案例 ID、真实版本/源码/报告 hash、逐案例行号及 12 合同 disposition 见 [JSON](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/page-provisional-review.json)；[校验记录](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/integrity-checks.json) 与 [独立证据清单](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/independent-evidence-manifest.json) 保留核查结果。独立 reviewer 未参与候选作者实现，没有 .git 操作、产品写入或账本/门禁修改。

## 已核查真实范围

完整读入 architect 角色、v5、历史续接、批准方案/F1 场景及 round-4 manifest。页面范围依 checkpoint sourceChanges/verification/finalRuns 限定为 run-headed.mjs、adapter.js、host.js、manifest.json、sw.js、host.html、file-source.js 共 7 个冻结文件；读取全部源码和最终两版的完整 case/raw trace/HTTP/console/manifest 数据，核验 68 个作者证据文件、历史 4 reports/2 checkpoints、浏览器二进制及冻结输入 hash，无 mismatch。三个 JS 文件独立 node --check 均成功。没有重复完整矩阵。

| 实际 Chrome | cases | PASS/FAIL | native 原始尝试 / 真 execute / API 不可用 | adapter 预校验 / 固定 MAIN |
|---|---:|---:|---:|---:|
| 138.0.7204.183 | 85 | 80 / 5 | 100 / 99 / 1 | 7 / 3 |
| 154.0.8037.92 | 85 | 80 / 5 | 100 / 99 / 1 | 7 / 3 |

每版 5 FAIL 为两 world 的 native raw throw/reject 四项及 required hostpermission remove 一项，均原样保留。各 case snapshot 的真 execute 为 84 resolved、9 rejected、6 pending；最终 trace 99 真 execute 为 90 resolved、9 rejected、0 pending，另一个 API 不可用尝试在 host reload 后不在最终内存 trace，因此两种统计分开。code/file、精确 top/same/cross document、两 world、CSP、typed/falsy/error/closure、old-document、真实 UI 撤权/恢复及 acceptance/pending fence 均逐案查过；它们不是 603 产品 cases 或 F2/F3 验收。

## 阻断 ARCH-PAGE-01：开关 OFF→ON 接受旧结果

合同 [F1-PAGE-AUTH-CSP](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/stage0/f1-cases.json:284) 要求真实撤权期间旧结果被 fence，恢复只在真实 revoke 后证明。

冻结 [host.js:10](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/fixture/host.js:10) 只用 permissions.onRemoved 写入 host-origin 撤权 fence；[adapter.js:64](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/fixture/adapter.js:64) 检查结算时当前 getScripts/host/document 状态，不能识别已发生的 userScripts OFF→ON 历史。[host.js:51](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/fixture/host.js:51) 在 acceptance barrier 后使用当前状态与 entry.fence；[host.js:108](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/fixture/host.js:108) 的 recheck 可以手工写入 fence。原 [run-headed.mjs:411](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/run-headed.mjs:411) 在开关 OFF 时调用这一修改操作，掩盖自动 fence 缺口。

独立流程：真实 native 完成 → 暂停 wrapper 接受 → 浏览器 UI Allow User Scripts OFF（原生 API 可用性 false）→ UI ON → releaseAcceptance；没有调用 fixture.recheck。**两版本 × 两 world 共 4 项均接受旧 typed true，fence 未设置。** host document/timeOrigin 保持，原生权限事件无对应 switch 撤权记录。相同流程改为真实 site permission OFF→ON，则 4 个正对照均自动拒绝 E_HOST_PERMISSION_REVOKED。

[独立报告](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/independent-evidence/2026-10-02T20-08-55-875Z/report.json) 的开关案例/结算行：138 USER_SCRIPT 49/294、MAIN 311/556；154 USER_SCRIPT 1492/1743、MAIN 1760/2011。真实 UI 前后截图随报告保存，完整测试脚本是 [page-transient-revoke-probe.mjs](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/page-transient-revoke-probe.mjs:53)。

可复现命令（已有依赖、两版浏览器，无安装）：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
node docs/framework/reviews/m5-f1/architect/page-transient-revoke-probe.mjs
```

修复验收必须由运行操作自身维护真实浏览器授权/host incarnation 的失效历史，使 native 已完成但 wrapper 尚未结算的旧操作在恢复后仍拒绝。不能由 test runner/reviewer 探测函数写 fence，也不能把定期轮询当作任意短暂 OFF→ON 的完整证明。新候选需在两版、两 world 重跑这一有界反例，并保留 site permission 正对照；若无可兑现的原生生命周期机制，须明确报告能力限制并正式复核合同，当前 lane 继续 BLOCK。

## 原生 diagnostics 与合同取舍

四项 raw throw/reject 在两 world、两版实际为 promise resolved、result:null、hasError:false；raw undefined 也为 null。按 [F1-PAGE-NATIVE-DIAGNOSTICS](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/stage0/f1-cases.json:247)，记录与影响判断为 CLEAR，**历史预期 FAIL 不变**。函数 wrapper 在 page 内调用/await/try-catch 并显式编码 typed envelope，真实 throw/reject/falsy 有独立 native 实跑；raw null 无协议 envelope 被 E_RESULT_CODEC 拒绝。因此这些原生 error-shape 失败不自动禁止该 wrapper API，也不能以 wrapper 成功证明 native error 字段可用。

required permissions.remove 实际抛不能移除 required permission，仍 FAIL。另一真实浏览器 site UI revoke/restore 有原生权限事件、API 状态和 mutation 证据；旧 restore case 的 restorationProven:false 不被改标。直接 native 在 withheld 权限下 1s 仍 pending，旧 document 销毁后 resolve null；这不是原生取消或错误 rejection。wrapper predispatch 授权拒绝单独统计。

| F1 合同 | 本次 architecture disposition |
|---|---|
| CTRL-USER-ASYNC / PRIVATE-CHANNEL / CSP-NETWORK / RESOURCE | 尚未审最终冻结 control |
| CTRL-TRUE-TERMINATE | 最终 control 待审；身份/CPU 因果证据要求保留 |
| PAGE-SOURCE-DOC | CLEAR（该冻结范围） |
| PAGE-TYPED-RESULTS | CLEAR（wrapper 合同） |
| PAGE-NATIVE-DIAGNOSTICS | CLEAR（诚实记录/影响判断，raw FAIL 保留） |
| PAGE-AUTH-CSP | BLOCK：ARCH-PAGE-01 |
| PAGE-OLD-DOC-RACE | CLEAR（该冻结范围） |
| SW-AND-PAGE-LOOP | 最终 control 待审 |
| VERSION-MATRIX | 两版 page 数据已核；完整 union 待审且 page AUTH 阻断 |

MAIN wrapper 共享页面 intrinsics，返回的是页面数据，不能当可信授权回执或 broker 执行证明；没有据此发现特权逃逸。每版 22 次真实 UI 状态转换未观察自然 host document/timeOrigin 重建，故自然重建路径未被宣称 PASS。

## 控制终止补充与独立方案审批

独立复读历史 19:57/20:06 STOP/DEADLINE FAIL、20:06 MAIN/borrowed FAIL，以及无 CDP 连接的 OS 诊断。两个精确 Chrome tag 均证实原生 2s delayed force；OS renderer CPU 在 terminate 返回后继续增长并约 2.08s 平台。这个诊断是解释性负证据，缺少精确 Worker/PID 绑定与采样请求时钟，不能直接作为 control qualification。settledAt 只能是关闭准入/发起停止的触发代理，不能是 native term-done。

round-5 方案 hash `a9c47c0e20d8bb5710fead199fc197ac98d3bc098dc3d96f2a719ed50b50651b` 已独立 **96/100 APPROVE，0 blockers**，报告在 [round-5 architect.md](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-5/architect.md)。该显式修订将新原型窗口设为实际触发后 3s，并要求精确 Worker CPU 实停及 target 真销毁均在限时内；独立 Critic 同 hash 批准前仍未生效。历史 EX03 2s 引文确实存在，现修订是正式覆盖时间界，不能把旧 FAIL 重写 PASS。

最高 renderer CPU delta>0.1 只是相关，孤立 profile 仍有多个 renderer；缺失样本置零、单次 150ms 静止、最终 target 消失均不能单独证明精确旧 loop 在限时内停止。须独立绑定进程/线程或证明独占执行域，以校准单调触发及采样上下界记录持续 CPU 活动→静止/真实退出，并保留销毁/不存在、host 可响应、无 late effect、下一有效 run 与资源基线。CPU 和 descriptor 延迟分别记账；新 3s 界没有允许 CPU-only 加 eventual target。

## 清理与结论范围

最终 pending/acceptance barriers/observation timers/raw pending 均为 0，HTTP holds 为 0，两作者 contexts/服务器关闭。独立 8 项 probe 的 contexts/服务器关闭、所有 7 个冻结源 hash 未变，无残留自有浏览器进程。host 的 settled operation Map 与 trace 为取证保留到 context 销毁，并未证明长期产品 1000 次资源回收。

页面冻结资格复核完成并保留具体 BLOCK；这不是 Goal 完成。联合候选 hash 未提供，最终所有 12 F1、backend、F2/F3 均未批准。603 正式产品 cases 尚未运行，不能宣称迁移或产品资格通过。
