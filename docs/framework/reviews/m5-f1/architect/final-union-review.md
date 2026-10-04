独立 Architect F1 结论：**APPROVE / CLEAR，12/12 必需机制合同 PASS，当前 blockers=0**。只绑定下列冻结 union 与已生效 round6 合同；本结论不是方案评分，也不代表其他审阅角色已经通过。

候选 SHA256：`a9ce67f85964f2512212430d56b488b5b0e2c11f6afdff2ea562428c3e77da66`。[冻结 union manifest](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/candidate-manifest.json)。
有效方案：`da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1`；control source `4666d1e0275ee69e82ab9e0c713260df201a717a359fd6efca4dbc55af91cfd5`；page source `f29dc4afa233a67457585e6a35cf327252760ead96d9edce6c16975f9a502c0a`。

independent=true，未兼任作者。requested gpt-6.1-sol/xhigh；actual model/effort 无可信运行元数据，记 unknown。未写产品、原型、candidate、gates 或账本；旧 BLOCK 报告保留。

130 个冻结 artifact、4 个合同/方案/回归/历史引用、17 份 live 与17份 frozen source，共168次 hash/bytes 核验全部匹配。双版页面嵌套证据清单与浏览器 binary hash 亦已核验。实际大 JSON 在 Python 内解析；核对 actual 字段、raw protocol/trace、HTTP hits、资源和原始 URL，作者 mapping 只用于定位。未重跑全矩阵、未做新全库审计。

| 必需合同 | 独立实际判定及源码位置 |
| --- | --- |
| F1-CTRL-USER-ASYNC | PASS / CLEAR。用户 async body 在真实 opaque sandbox Worker 内编译；goto/title/url 与 type/click/wait/text 真实顺序完成，读回 BaseAlice。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/worker-harness.js:4) |
| F1-CTRL-PRIVATE-CHANNEL | PASS / CLEAR。错误 peer、global forged completion、重绑、重放、wrong run 与全局/prototype patch 不产生伪终态或额外 page effect；当前合法请求可用。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/worker-harness.js:4) |
| F1-CTRL-CSP-NETWORK | PASS / CLEAR。native Log/CSP 记录 connect-src/script-src 拒绝；fetch/XHR/WebSocket/importScripts 的实际结果和服务器无禁用请求相互印证。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/manifest.json:1) |
| F1-CTRL-TRUE-TERMINATE | PASS / CLEAR。STOP/DEADLINE/HOST-CLOSE 六个实际 loop 都有进入标记、立即关闭 admission、exact targetDestroyed 与 target absent、后续合法 run。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/host.js:74) |
| F1-CTRL-RESOURCE | PASS / CLEAR。每版 success/throw/timeout/cancel 各5、20个不同 run；原始 Blob URL 在创建它的 opaque realm 先真实可加载，再撤销，随后同 URL load-error，不使用新建 URL 替代。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/sandbox.html:24) |
| F1-PAGE-SOURCE-DOC | PASS / CLEAR。双 world code/file 分别在 top/same-origin/cross-origin granted document 真执行；returned documentId 正确，逐步比较其余 document marker 保持前值，另一个 tab 无 mutation。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/adapter.js:57) |
| F1-PAGE-TYPED-RESULTS | PASS / CLEAR。Promise 真实等待并回 typed value；false/0/空串/null/undefined 各自保真；sync TypeError、async RangeError、closure ReferenceError 分类正确。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/adapter.js:1) |
| F1-PAGE-NATIVE-DIAGNOSTICS | PASS / CLEAR。双版两 world raw throw/reject 都是 resolved，result:null、hasResult:true、hasError:false；四个旧期待实际仍 FAIL。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/adapter.js:36) |
| F1-PAGE-AUTH-CSP | PASS / CLEAR。四个 required 子项每版 4/4/4/12 个 coverage cell；分别核 actual 并不依赖作者通过总数。OFF 新 native 调用拒绝、wrapper dispatchCount=0，ON 新操作真成功。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/host.js:18) |
| F1-PAGE-OLD-DOC-RACE | PASS / CLEAR。两 world pending/native-completed 操作在真实 navigation 后由 onCommitted/精确 document 检查拒绝，当前 doc 真实新调用成功。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/host.js:95) |
| F1-SW-AND-PAGE-LOOP | PASS / CLEAR。真实 stop exact ServiceWorker version 后 genuine runtime wake：extension identity 不变、SW epoch 改变，长期 controller 仍在 host。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/sw.js:1) |
| F1-VERSION-MATRIX | PASS / CLEAR。同 control 4666d1…、page f29dc… source manifest 在 138.0.7204.183 与 154.0.8037.92 真浏览器逐版实跑；二进制哈希及所有17 live/frozen source 一致。 [源码](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/run-native.mjs:1) |

逐项完整 caseIds、双版 report hash、actual 判据及合同 file:line 见 [JSON coverage12](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/final-union-review.json)；没有用作者计数替代功能判定。

真实计数须这样解释：control 各版56个唯一案例均记录 PASS。page 各版102条 positive 中4条仅 assessmentOnly，另9条 retained FAIL；共111唯一记录，其中107条执行 case。原生尝试148次，真正 userScripts.execute 147次，API不可用未进入1次，adapter预校验7条，固定 packaged scripting3次分开。四 required 子项每版4+4+4+12=24个 coverage cell，共享 case 不增原生执行数。

旧阻断的关闭依靠以下实际变化：

- **CR-F1-CTRL-001**：[requireOwner](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/host.js:86) 把旧 owner/host/sandbox/target/tab/doc 保留至每个 await 之后及 native effect 之前。两版10个权限延续竞态无旧 dispatch/delivery/HTTP effect；额外真实 native permissions Promise stop 微任务回归也无 native tabs.update、server hit，后续合法 run 成功。[真实 Promise 回归](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/evidence/m5-round6-final-native-promise-race-2026-10-02T21-52-20.311250Z/report.json)。
- **CR-F1-CTRL-002**：同一个实际原始 Blob URL 在创建 realm 中正向加载后撤销，再次加载真实 error；每版 success/throw/timeout/cancel 各5，有20个独立 run 和 exact Worker targetDestroyed/absent。timeout/cancel 在每次真实 pageWaits=1 后才触发，最终 native target 与资源均清0。[原始 URL probe](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/sandbox.html:42)；[page wait cancel](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/fixture/host.js:79)。
- **ARCH-PAGE-01 / CR-F1-PAGE-001**：[操作自有 native monitor](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/page/fixture/host.js:48) 真观察 OFF 后 first fence 跨 ON 保留，旧结果只拒绝一次；runner主动fence已移除。未观察到的 rapid OFF→ON 原反例仍 FAIL，仅由独立已批准 round6 的明确条件边界关闭原保证，不称实现了不可观察历史。真实 origin/可信 ownGrant/doc/cancel/deadline 不享例外。

原生诊断的限制仍存在：两版两 world raw throw/reject 都 resolved 到 result:null、hasResult:true、hasError:false，四 raw FAIL 不改标。page 内真实 await/catch typed envelope 可兑现 promised wrapper 的错误和值合同，故独立判定不阻断 wrapper；它不提供 native error 字段的成功证明。required permissions.remove 的失败也保留，legacy restore 不证明撤权；真正 UI site revoke 另有原生 onRemoved、wrapper拒绝与新合法恢复证据。

浏览器开关边界最强反例也仍保留：host任务期间真实 OFF→ON、monitor未关闭、same host/doc/current authority 未变且未观察OFF时，旧结果会被接受。最终检查只证明当前 native 可用，不能证明连续授权历史；若其他 authority/doc失效，必须仍 fence。native-completed OFF-new 场景的页面可保留前一轮 ON positive marker，但本轮不同 token 未写入，实际新 native调用拒绝/dispatchCount=0。真实 site-access OFF 的 raw execute 曾保持 pending，后随文档销毁返回 null；此处没有把 pending 称作 native拒绝或取消。

死循环停止以原生 trace 的 Blob/target/creator frame/host/PID/workerThreadId 因果链定位，不再以最高 CPU renderer 推断归属；比较该 PID 的独立初始增长与多次 post quiescence/OS进程退出，并同时要求 exact targetDestroyed+absent。计时由实际 trigger 区间下界开始，loop Worker 无 attached Inspector。[因果绑定及独立观察](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/sources/control/run-native.mjs:197)。

| 真浏览器 | STOP 停止观察 ms | DEADLINE ms | HOST-CLOSE ms | 旧2s状态 |
| --- | ---: | ---: | ---: | --- |
| 138.0.7204.183 | 2432.986 | 2436.277 | 530.237 | STOP/DEADLINE FAIL 保留；HOST-CLOSE PASS |
| 154.0.8037.92 | 2327.145 | 2324.083 | 515.501 | STOP/DEADLINE FAIL 保留；HOST-CLOSE PASS |

这六次保守停止观察及 target destroy/absence 均满足获批3s窗口；不是 <2s、瞬时停止，也不把 settledAt 或 terminate() 调用当完成。六次后续合法 run 均成功。

双版 code/file、两 world、精确 top/same/cross doc 的实际变更和其他文档前值保留均核对；六 CSP 场景具有真实网络1/0 hit与 inline control。old document/native-completed结果及旧固定 MAIN callback 不接管新请求。控制 SW 真停止/唤醒保持 extension ID、改变 epoch；旧 host channel dispose 后 fresh host 真重连。owned MAIN loop 用实际服务器 beacon/目标销毁证明受控 retirement，borrowed tab不关闭；不提供 MAIN 通用 terminate。页面自然 host 重建未观察，不冒称自然恢复已测。

最终 page 的 pending/monitor/probe/timer/barrier/rawPending 全0，owned browser context/server 关闭；control dispose资源全0、Worker targets空、browser退出0、server关闭、CDP waiters0。单例中诚实记录的 raw pending 不被最终清理数据抹去。

当前无修复 blocker；须保持报告中全部边界。最强未来风险是产品实现把旧 permission continuation 绑定到新 owner，或把开关 polling 当完整历史。此次只证明同冻结原型机制，未证明未来产品全部路径。

candidate 中 backendPrototypePassed=false、fullImplementationReleased=false、frameworkFunctionalMigrationComplete=false、productPackageSha256=null 原样保留。本报告不改门禁；下一步由独立 Critic/code reviewer 审同 union。正式603 product cases、SDK独立和F3同包验收未执行/未通过，不宣称迁移完成。
