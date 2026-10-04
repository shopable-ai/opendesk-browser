# 独立 F1 code/spec/security 复核：页面冻结候选

**结论：REQUEST CHANGES（provisional 页面 lane）。** 未给最终总体 F1 批准。当前页面候选有一个独立实跑确认的 HIGH 阻断：Allow User Scripts 关闭再恢复后，旧操作结果可被重新接受。原矩阵中的相关 PASS 依赖测试 runner 主动写入 fence，不能证明 adapter 自动遵守该安全合同。

阶段0批准对象为 `dd50a5098d247f594ab2234b9946c0004ce427ea8d6cb1abd130931c3bcecda1`，本复核不重新审批计划。页面原型对象为 `2edcc1b0ca37f22a21105255cf90a02f1fa1b4a6e72081fa23d816708ee3a036`。联合冻结候选未提供，control 尚在诊断；此报告不能用于 `allF1PASS`、F2 放行或 F3 验收。正式 603 个 product cases 未运行。

我是本报告及独立反例的作者，不是被评页面/control 候选作者；只承担 code/spec/security lane，不给架构 lane 的设计结论。模型/努力设置继承当前会话，无覆盖；服务端实际模型没有独立证据，记 unknown。不评分。

## 范围与证据身份

完整读取 code-reviewer 角色提示、goal-migration-v5 全文及 continue-in-new-chat 历史附件、execution-plan、12 条 stage0/f1-cases、指定 round-4 candidate manifest。随后完整读 571 行页面 runner、88 行 adapter、143 行 host 及其余四个 fixture 文件。无 `.git`，使用冻结源 hash 确定范围，未新建全库审计。控制补充仅涉及用户指定的 19:57 非最终报告、无 Inspector HTTP 诊断及停止观察源码片段；精确版本源码、后续 oracle 快照和合同修正建议另见 [control note](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/code-reviewer/control-native-stop-contract-note.md)。

| 实际版本 | 二进制 SHA256 | 作者 R4 原始 case 结果 | 原生调用分账 |
|---|---|---|---|
| 138.0.7204.183 | `f33ac0c54d6d277a5f0df5b266d8da3dc595981d78fdbec0577885f2c1b4540f` | 80 PASS / 5 FAIL | 99 execute；1 API 不可用；7 预校验；3 scripting |
| 154.0.8037.92（候选记录的 Stable CfT） | `ce0c09ea98a7592e7799e54c1867797ccf99d4d6e821a11067c332e454732349` | 80 PASS / 5 FAIL | 99 execute；1 API 不可用；7 预校验；3 scripting |

两版为 darwin 25.5.0 / arm64、headed、独立 profile，扩展 ID `ndjfjgagpdcenfgedcjomjcobgfppjnl`。逐一复算两版各 34 个 evidence-manifest 文件的字节数/hash、candidate/report/checkpoint hash、全部 7 个页面源码及 frozenInputs hash；未发现不匹配。两版报告及 manifest 与 checkpoint.finalRuns 绑定一致。旧四份 149 report hash 也一致。完整路径、每例 ID、源码 hash 与复核结果见相邻 JSON。

每版 raw 入口尝试 100 次，其中 99 次实际 execute，最终 trace 为 90 resolved / 9 rejected / 0 pending；resolved 包含原生错误 null 及撤权队列最终 null，不代表 90 次功能通过。SWITCH-ON 的显式 host.reload 清除了先前 API 不可用的一条 trace；每例输入快照仍保存该尝试。3 次 scripting 为 1 次 callback 成功、2 次旧 document 拒绝。7 个预校验 case 没有原生调用。独立反例另列，不累加进原始 85 cases，也不修改其 PASS/FAIL。

## HIGH / CR-F1-PAGE-001：runner recheck 掩盖开关撤销代次缺失

定位：[host.js:39](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/fixture/host.js:39)、[host.js:108](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/fixture/host.js:108)、[adapter.js:64](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/fixture/adapter.js:64)、[run-headed.mjs:405](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/run-headed.mjs:405)。

批准合同 [f1-cases.json:284](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/stage0/f1-cases.json:284) 要求真实撤权时新操作拒绝、旧结果被 fence，并只在实际撤销后证明恢复。批准计划 [execution-plan.md:79](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/execution-plan.md:79) 单列 UI 撤销/恢复与 pending barrier。F1 有界 adapter 可以证明机制，但不能由测试器代替机制维护撤权状态。

`evaluate()` 准入、结算各调用一次 `verifyCurrent()`，恢复后的当前授权都可为真。host 只监听站点 permissions.onRemoved；开关关闭在此 fixture 不产生这类事件。永久 fence 对开关由 `fixture.recheck(id)` 写入，而 AFTER-NATIVE case 在 off 与 on 之间由 runner 显式调用它（411 行）。这个调用直接改变被验证状态，实际是测试器提供了 adapter 缺失的撤权记忆。

独立证据：[fresh report](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/code-reviewer/fresh-page-fence-2026-10-02T20-08-38-871Z/report.json)。在未改任何 fixture 的 fresh profiles 中，对两版、两 world 各做一次：真实 exact-doc execute 完成 → 保留 acceptance barrier → Chrome UI 关闭开关并实际调用 availability 确认不可用 → Chrome UI 恢复 → 释放原 barrier。**没有调用 recheck**。4/4 个旧结果均被接受为 `{kind:"value",value:{type:"boolean",value:true}}`；permissionEvents=[]，entry 无 fence。真实关闭时 `getScripts` 不可用，实际副作用及 native 结果保留，故不是 UI 点击无效。原操作仍在同一 host 内可查询，未丢失到另一 host。4 个 UI 截图及完整 native/document/input 位于同 fresh 目录。

影响：关闭期间已经送达或在途的旧结果能在重新启用后重新获得接受资格，破坏批准的旧请求 fence。此结论只指 frozen prototype 的证明缺口，不冒称已经发现 F2 产品漏洞。权限检查仍有效地阻挡关闭期间的新请求。

修复要求：在被验证机制内建立真实授权失效观察和不可回退的 operation/grant incarnation fence；恢复只能准入新操作，不能清除旧操作失效。对开关没有可用原生事件的边界，作者须证明其所用实际观测方式与保证范围；不能仅增加轮询后声称所有短暂 off/on 都被捕获。不可检测的边界需要按既有合同显式报告并由独立复核处理，不能静默缩窄。runner 只能操作 UI/观测，撤去主动调用 recheck 写入旧 fence 的依赖。保留旧证据，补两个 world、两版、native pending/已完成后两种竞争；旧结果一次拒绝，新授权的新请求成功。新源码冻结新 hash，再交独立复核。不要把本反例改成预期成功或 skip。

## 修复建议的可靠历史信号边界

真实观察到 OFF 与从未观察到的快速 OFF→ON 是两种证据条件。机制自身对真实浏览器 API 的探测若实际失败，应当在接受任何结果前单调失效旧 operation；恢复仅给新 operation 新代次。这可以修复“已观察 OFF 仍忘记撤权”的缺陷，但不证明探测间隙中的全部撤权历史。

可靠历史信号必须证明由真实浏览器撤权触发、覆盖此开关、在旧结果接受前交付或可查询，并能区分旧/新授权代次；还须处理同一 host 持续存活及重建边界。当前原生 permissions.onRemoved 没有在独立开关反例中发出事件，自然 host 重建也未观察。仅当前 getScripts 可用、在测试器引导下调用 availability、定时轮询或把 recheck 放进名为 observer 的函数，都不能自动满足历史完整性保证。

新证据应区分两个原合同场景：实际机制观察到 OFF 后的立即单调失效，以及真实 UI OFF→ON 完全落在机制探测间隙的旧结果竞争。后者不要让 runner 在 OFF 期间主动调用会改变被测 fence 的 API；用真实 UI 状态和独立长 OFF 负对照核验开关动作，再恢复并释放旧结果。若没有可靠历史信号且旧结果仍被接受，这个原合同场景仍不满足；应保存实际失败与精确边界，提交独立显式合同处置，不把部分修复或缩短轮询间隔称为全间隔安全。本建议不越过架构 lane 对可靠历史信号的限制。

## 原生错误 shape 与 promised wrapper API 的独立判定

批准 [F1-PAGE-NATIVE-DIAGNOSTICS:247](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/stage0/f1-cases.json:247) 要求保存实际 raw shape，独立判定对 promised API 的影响。

两版、两 world 的 raw throw/reject 均 resolved，单结果 `hasResult=true,result=null,hasError=false`；raw undefined 也为 null。这四条原始 FAIL 继续是 FAIL，不能解释为原生异常字段工作，也不能从 null 区分成功 null/undefined 与异常。[runner:264](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/run-headed.mjs:264) 的真实输入和每例 actual 与最终 trace 一致。

对**批准的 typed function wrapper**，此原生限制本身不是额外阻断：wrapper 在指定 page world 的 async try/catch 内 await 函数，再编码 result/error；host accept 要求 exact document/frame 及 protocol/ok，raw null 会报 E_RESULT_CODEC，不会静默作为成功。[adapter.js:43](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/fixture/adapter.js:43)、[adapter.js:77](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/fixture/adapter.js:77) 与两版实际 TypeError/RangeError/ReferenceError、false/0/空串/null/undefined、Promise、业务 PageBrigeCode、Unicode/引号/`__proto__` 参数证据一致。native/bound/非有限数/BigInt/cycle/functionArg/missing-target 是单独的预校验实证。

这是独立完成“原生限制对 promised wrapper 的影响”判定，**不是把 wrapper PASS 替换 raw FAIL**，也不是页面 lane 资格批准。没有证据支持直接 raw 调用也提供同等错误合同。MAIN 与 host page 共享环境，不从 MAIN 结果推出可信 caller 身份或通用安全隔离。官方资料仅用于核对 API 字段、开关失效行为及 world 边界；版本实测结果优先于文档预期。[Chrome userScripts 官方文档](https://developer.chrome.com/docs/extensions/reference/api/userScripts)

## 授权、CSP、旧 document 与清理的实际范围

真实站点 UI 撤销/恢复有效：UI 状态、permissions.contains、wrapper 的零 dispatch 拒绝与 mutation 负对照相符。required permissions.remove 抛出 `You cannot remove required permissions.`，第 5 个原始 FAIL 保留；旧 request case 明写 restorationProven=false，不用它证明恢复。新 UI case 的实际恢复证据可成立，独立于 required-remove 失败。

native 在站点权限 withheld 后直接调用仍 pending at 1s，离开旧 document 后 resolved null；不是 cancellation 或 native rejection 保证。既发副作用不承诺撤销。站点 pending/after-native case 中 recheck 会覆盖 onRemoved 自动 fence 的来源，因此它们的最终 fence 字段不能单独证明事件处理已足够；开关漏洞由上述反例直接确认。两版各 22 次 UI transition 均未自然重建 host，不将 reconnect fallback 分支计为通过。

code/file 对 top/同源/跨源 frame 均有返回 document/frame 与 parent/sibling/other-tab mutation 对照；非法 source/target 是真实 API 调用后的原生 binding 拒绝，不能计成 adapter 预校验。旧 document 竞争两 world 均为 E_DOCUMENT_STALE、stale execute/callback 拒绝、新 document wrapper 成功。离开旧 doc 导致 hold 已关闭时 released=false 的原始事实保留；没有声称导航后旧页面仍完成 fetch。

CSP 6 格/版均有执行 effect、固定 file、HTTP 正负对照及实际 console violation；restrictive MAIN 的网络拒绝与 USER_SCRIPT 自有 CSP 分开。无特权 eval/new Function、额外后端或 permission 绕过。资源统计 pending/barrier/timer/rawPending 从0回0，浏览器 context/server关闭且 holds=0；这些计数说明 fixture 观测资源，不说明 F2 effect-once 或 F3 压力泄漏验收。独立反例同样回0、context/server均关闭，复核 `ps` 未见自己 profile 的浏览器 PID。

## 12 条 F1 合同的 provisional 处置

| 合同 | 此报告处置 |
|---|---|
| F1-CTRL-USER-ASYNC | 不给 final 资格；control 非冻结，未在本轮全面复核 |
| F1-CTRL-PRIVATE-CHANNEL | 待 control 最终联合候选实证复核 |
| F1-CTRL-CSP-NETWORK | 待 control 最终联合候选实证复核 |
| F1-CTRL-TRUE-TERMINATE | 当前 FAIL 保留；CPU oracle 证据要求见下文；无批准 |
| F1-CTRL-RESOURCE | 待 control 最终联合候选实证复核 |
| F1-PAGE-SOURCE-DOC | 页面 R4 实证支持限定机制，不能代替产品支持 |
| F1-PAGE-TYPED-RESULTS | 页面 R4 typed 值/错误实证支持；不覆盖撤权代次缺口 |
| F1-PAGE-NATIVE-DIAGNOSTICS | actual shape 已核实、wrapper 影响已独立判定；四 raw FAIL 不变 |
| F1-PAGE-AUTH-CSP | **REQUEST CHANGES：CR-F1-PAGE-001**；站点 UI/CSP 子项有证据 |
| F1-PAGE-OLD-DOC-RACE | exact-doc 原生拒绝与 wrapper stale fence 有实证；不是产品 broker 验收 |
| F1-SW-AND-PAGE-LOOP | 本页面 runner 没有 SW terminate/wake、port重连资格实证；最新 owned/borrowed FAIL 用户报告保留，待最终 control 核查 |
| F1-VERSION-MATRIX | 页面两实际版本已核查；control 及联合最终候选未ready，整体未通过 |

## 控制 2 秒合同的有界补充意见（非审批）

批准 [f1-cases.json:103](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/stage0/f1-cases.json:103) 原文是 `browser independently observes Worker gone/CPU execution stopped within test 2s`，并要求 loop entered、admission closed、host responsive、无 late action、计数非唯一证明、无 debugger 干扰。冻结 [test-spec.md:29](/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/test-spec.md:29) 明确 CPU 终止证明，2s 是测试阈值而非普遍浏览器规范保证。现合同仍不能由作者自行放宽；新诊断后的明确修正建议是待独立正式审批的候选意见，见上述 control note，未应用到本合同。

如果 target descriptor 只是滞后，**独立、精确绑定该 run Worker 的 CPU/线程执行停止实证可以证明合同中的 execution-stopped 路径**；但 target 的最终真实退出仍应记录作退出/清理佐证。这个条件性解释不是接受现有 oracle，也不允许把后来退出反推为2秒内已经停了。

本报告早期读取的作者 oracle 用所有 renderer 中最大 CPU 增量选 busyRenderer，并用单个150ms窗口 `earlyCPU<0.03` 作 gate；这不构成 target/run/Blob/sandbox→PID/线程的因果绑定，缺失 PID 自动记0也不构成退出证明。19:57报告包含多个 renderer，没有采样窗口时间和精确 PID 绑定。作者文件随后变化：末次快照 `224945843c0e145172c7c45be099d4f6c627bea05f70511f14c9beda8a82b163` 的 [run-native.mjs:172](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/run-native.mjs:172) 改回 targetDestroyed≤2s gate，155 行最大CPU仍是活跃诊断，169 行缺失PID记0目前不影响该 PASS gate。不得把已替换的早期 gate 当当前源码缺陷；各快照判定和新证据限制详见 control note。

合法 CPU 证据至少须具备：

1. 真实 loop-entered、run/epoch/Blob/host parent/浏览器 context 及独立 PID/线程绑定；受控前后差分也必须有无loop负对照、独占活动来源与并发排除证据。不能只选最大数值。
2. t0 是实际 stop/timeout/host-close **触发/关闭准入时刻**，不是 promise 送达时刻，更不是 terminate 完成。host settledAt 只有与实际触发位置及跨进程时钟误差核验后才能作 t0；禁止 `settledAt || started` 无解释回退把已耗时间抹掉。
3. 每次 CPU 采样的请求/返回时间、累计CPU及同一 PID/线程生命周期；证明停止的观测上界≤t0+2000ms，误差也计入。不能用 deadline 后采样推断之前已停。
4. loop 正对照表明当前观察器能在此环境检测未停止执行；连续/重复观测区分永久停止和临时未调度，缺失PID须有独立退出事实而非自动当0。阈值需按单位、窗口与噪声说明，不能由作者自定门禁。
5. 无 loop Worker Inspector/暂停污染；host/未关闭目标响应、无后续准入/late action、已发 effect 与 settlement 分开；target最终退出、Blob/port/timer/pending 清理独立记录。

我读到的 19:57 对象 `1df88d2e332c96457a7191d184e3c3b7851660bbf0da856eea12e3d0611f62cd` 为42 cases/40 PASS/2 FAIL：STOP removalMilliseconds=2011，DEADLINE=null；later afterCPU0 或 targetDestroyed 不足以关闭2s。用户随后提供20:06新事实：150ms窗口 CPU仍增约0.140/0.145s，STOP/DEADLINE仍FAIL，host-close约13ms停止PASS，新增 owned/borrowed FAIL。后者在此按用户最新证据记录，未伪称已完整核查那个未指定最终hash的新报告。不能把当前失败叫作仅 metadata delay，也不能改原期望消除它。后续同 backend 无 Inspector 诊断与复核由 control 作者继续，此报告不批准其最终结果。

## 验证与停止条件

三份改动页面源码 `node --check` / module syntax check 本轮均 exit0；限定静态检索检查了 eval、权限扩大、异常路径，没有另发现特权回退。当前工具没有 lsp_diagnostics/ast-grep，语法检查不冒称 LSP/typecheck；无 git diff 可用。此限制不妨碍已用浏览器实证确认的 REQUEST CHANGES，也不能据语法检查给 APPROVE。

本报告只写本 review 目录；fixture、产品、gates、账本、旧报告均未修改。页面冻结对象仍保持原hash。停止于具体页面阻断及可重现修复要求，不等待主线程消息空转。最终总体 F1 只能在用户提供两lane同一冻结联合hash后、关闭本阻断且12合同均有该同候选有效原生实证时再独立判决。
