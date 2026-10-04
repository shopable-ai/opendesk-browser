# 独立 Critic / code-spec-security-function F1 复核

**APPROVE / CLEAR。** 同一冻结 union 下，`allF1ContractsPassed=true`，required 12 / passed 12 / blockers 0。仅批准已批准 round6 范围内的 F1 原型机制资格；未更新产品或公共 gates，未批准 F2/F3 或宣称603产品案例完成。没有凑总分。

完整结构化证据与逐合同判定见 [final-union-review.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/code-reviewer/final-union-review.json)。审阅者非作者；本次未运行新浏览器矩阵，独立核对冻结源码、原 raw actual、原生 trace/protocol 和已有独立反例的同源码回归。requested `gpt-6.1-sol/xhigh`；actual model/effort 未暴露，记 unknown。

| 绑定对象 | SHA-256 |
| --- | --- |
| final union | `a9ce67f85964f2512212430d56b488b5b0e2c11f6afdff2ea562428c3e77da66` |
| control source | `4666d1e0275ee69e82ab9e0c713260df201a717a359fd6efca4dbc55af91cfd5` |
| page source | `f29dc4afa233a67457585e6a35cf327252760ead96d9edce6c16975f9a502c0a` |
| 批准 round6 plan | `da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1` |
| 前序 Architect JSON | `c886a6d89b65832ff0019cb214750808a2ddf256296b82f29e38f0c48ca74ea6` |
| 前序 Architect MD | `9d880ae19cc651d901b5abea34d79d5dca10ed670dfe392a30962d45662f6003` |

Architect 已完成后才开始本次正式后续复核。其结论未被用作代替本审阅的实际证据。17份 live/frozen source、130个 artifact 全部匹配；落盘前含 Architect 的170项引用/源码复查无漂移。两版实际 executable SHA 也与冻结报告一致。12个 JavaScript/inline script 单元的 Node 语法检查通过；LSP/ast-grep 和本地 tsc/tsserver 不可用，未安装依赖，也未冒称 typecheck 通过。

| 必需合同 | 独立结论 | 实证依据 |
| --- | --- | --- |
| F1-CTRL-USER-ASYNC | PASS | 真实 goto/title/url 顺序、BaseAlice、throw/syntax/未授权拒绝 |
| F1-CTRL-PRIVATE-CHANNEL | PASS | 真私有端口；global/peer/replay/rebind/wrong-run/prototype 攻击未产生假结算 |
| F1-CTRL-CSP-NETWORK | PASS | opaque origin；原生 CSP 日志、HTTP/WS 前后正对照、blocked server 0 |
| F1-CTRL-TRUE-TERMINATE | PASS | 真实 run/Blob/Worker/PID/thread；实际 trigger 起 3s 内 CPU/Destroyed/absent |
| F1-CTRL-RESOURCE | PASS | 每版20原 Blob URL 同 creating realm 的 load→revoke→load-error；实际等待后取消 |
| F1-PAGE-SOURCE-DOC | PASS | 两 world × code/file × top/same/cross，精确 doc 与 mutation 负对照 |
| F1-PAGE-TYPED-RESULTS | PASS | await、false/0/空/null/undefined、错误/closure、typed 参数与业务对象 |
| F1-PAGE-NATIVE-DIAGNOSTICS | PASS | raw四FAIL保留；明确判断 native shape 对真实 wrapper 的影响 |
| F1-PAGE-AUTH-CSP | PASS | 24共享 coverage cell；operation-owned sticky OFF/site/grant/cancel/deadline/doc |
| F1-PAGE-OLD-DOC-RACE | PASS | 真实换 doc；旧结果/固定 MAIN callback 拒绝，fresh 调用成功 |
| F1-SW-AND-PAGE-LOOP | PASS | 真 SW wake/host epoch 重绑；MAIN entered/owned退休，borrowed仍活 |
| F1-VERSION-MATRIX | PASS | 同候选138.0.7204.183、154.0.8037.92真实全必需维度 |

旧 **CR-F1-CTRL-001** 仅在新 `4666…` 上关闭。[host.js:86](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/host.js:86) 的 `requireOwner` 核对原 owner/cancelled/hostEpoch/sandboxEpoch/tab/doc/targetEpoch；[host.js:111](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/host.js:111) 在原生权限 await 后再验，之后每次原生副作用及导航身份采用前后均重验。finish 同步关闭 admission。每版10个 stop/deadline/host-close/new-run/new-target × goto/click race 均无旧 dispatch/reply/原服务器副作用，合法新 run 有真实 GET/POST。原独立 probe 的核心 native delegate/stop 时序没有变化；[同源 native Promise 回归](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/evidence/m5-round6-final-native-promise-race-2026-10-02T21-52-20.311250Z/report.json) 两版均 request→stop→native promise resolved，0 tabs.update、server 0，随后 genuine run 成功。本次核对了原/新 probe 的实际 source diff；不把作者的回归称为本次独立新执行。

旧 **CR-F1-CTRL-002** 的证据缺口在新同候选关闭。[sandbox.html:18](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/sandbox.html:18) 先对原 run 的同 URL 在同 opaque creating realm 实际成功 load，然后 real revoke 后对该 URL 实际 load-error，最后才通知 host 退休 realm。[run-native.mjs:379](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/run-native.mjs:379) 每版逐个验证20个不同原 URL 的 run/epoch/时序、真实 Worker Destroyed/absent，以及 pending/timer/原私有 ports/Blob 清理。timeout/cancel 各5次都先实际达到 `pageWaits=1,pending=1,timer=1`。运行间保留固定 host port/frame 基线各1，最终 dispose 全0；不能把运行间 host 基线说成全0。旧报告的0/20缺口及历史 verdict 保留，未声称旧版曾证明泄漏。

终止实证用 [run-native.mjs:156](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/run-native.mjs:156) 的 native trace 绑定原 Blob/Worker ID/creator frame/host/PID/thread，138空 Worker URL 不是 highest CPU 猜测。终止期间没有 Worker/creator inspector attachment。采用实际 trigger 的校准区间 lower bound 计算保守延迟；目标消失、原生销毁和持续 CPU 停止都必须成立。

| 实际版本 / trigger | CPU停止或进程退出观测 ms | TargetDestroyed ms | target absent ms | 旧2s |
| --- | ---: | ---: | ---: | --- |
| 138.0.7204.183 / STOP | 2432.986 | 2005.413 | 2059.189 | FAIL |
| 138.0.7204.183 / DEADLINE | 2436.277 | 2002.775 | 2063.145 | FAIL |
| 138.0.7204.183 / HOST-CLOSE | 530.237 | 6.233 | 160.244 | PASS |
| 154.0.8037.92 / STOP | 2327.145 | 2004.108 | 2019.564 | FAIL |
| 154.0.8037.92 / DEADLINE | 2324.083 | 2005.079 | 2019.095 | FAIL |
| 154.0.8037.92 / HOST-CLOSE | 515.501 | 9.048 | 166.274 | PASS |

STOP/DEADLINE 的 early150ms CPU 仍增长约0.148–0.151s，原2s FAIL保持。154之后三个样本 CPU 增量≤0.000172s；138同因果 PID 的消失另经 OS ps 确认退出。这里批准的是既定3s物理观测窗口，`terminate()` 返回或 host settledAt 均不是单独的终止证明。

旧 **CR-F1-PAGE-001** 仅按已独立批准的 round6 差异关闭。[host.js:18](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/host.js:18) 的 first fence 不被恢复清除；[host.js:48](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/host.js:48) 由 operation 自己探测真实 native getScripts OFF，[host.js:131](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/host.js:131) 在接受前实际检查当前权限/文档、排空已发监测再核 fence。真实 UI/site/可信 ownGrant/cancel/deadline/doc 在 pending 和 native-completed 两 phase 均拒绝旧结果一次，新调用成功。runner 只点击 UI、持有和释放屏障，未调用人工 recheck 或写 entry fence。

**未观测快速 OFF→ON 的历史能力没有修好。** 每版四个 original case 实际仍接受旧结果，保持原 FAIL；四个独立 `assessmentOnly` 记录仅确认已批准限制：机制未观察 OFF，且 host/doc/origin/ownGrant 无其他失效时，已发 effect/result 可能完成。不能把该限制确认当作旧 fencing 能力通过，不能宣称原子或全间隔授权历史安全。

每版页面 **111 records =107执行case +4 assessment**；**102 positive =98执行case positive +4 assessment**，另9 retained FAIL。逐输入重算为147实际 userScripts.execute API调用、1次 API不可用未进入、7次 adapter预校验、3次固定 MAIN scripting 调用；24 coverage cell 共享案例，不增加执行数。控制每版56执行case PASS，另同源 native Promise 回归每版1次；与旧审批分数或产品603计数无关。

四个 raw throw/reject 在两版均 `resolved / hasResult=true / result=null / hasError=false`，仍是 FAIL。[adapter.js:36](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/adapter.js:36) 在 page world 内 try/await/catch，实际 native envelope 携带 `protocol/ok=false/error`，[adapter.js:77](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/adapter.js:77) 才将其接受为 evaluation-error；actual wrapper throw/reject/closure 均成立，typed undefined 与 null 也分开。因此 native error-shape 缺口对当前 promised wrapper 非阻断，但没有被 wrapper PASS 替换。required `permissions.remove` 仍抛 `You cannot remove required permissions` 并保留 FAIL；旧 request 明记 `restorationProven=false`，真实 site撤权/恢复用浏览器 UI、permission event/API及页面负对照证明。

最终页面 operational resources 全0，浏览器与服务器已关闭。部分 site-denied raw native call 曾保持 pending-at-observation-deadline，直到旧文档消失清理；不能把这些称为 native rejection 或逐case资源全0。每版30个 UI host lifecycle观察均 `rebuilt=false`，自然 host 重建未实证通过。控制的 SW/host重连是真实另项证据。MAIN loop 只证明实际 entered 与 explicitly owned tab退休、borrowed存活，不给 borrowed MAIN 普遍强停承诺。

[旧 control-review.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/code-reviewer/control-review.json) 仍是旧 `711f…` 的 REQUEST_CHANGES，两个 HIGH 与旧46PASS不改标；[旧 provisional-page-review.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/code-reviewer/provisional-page-review.json) 和其反例亦未修改。候选 `backendPrototypePassed/fullImplementationReleased/frameworkFunctionalMigrationComplete` 均仍为 false；本报告不修改候选或公共账本。

