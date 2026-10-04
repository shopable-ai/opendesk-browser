**REQUEST_CHANGES，仅针对旧控制候选。** 本次独立 code/spec/security 复核绑定 source manifest SHA-256 `711f26eb86374be69617a8c638ba3736cf27c96b3bff437def5c8f37681a28d1`，采用已批准 round5 合同 `a9c47c0e20d8bb5710fead199fc197ac98d3bc098dc3d96f2a719ed50b50651b` 的 3 秒物理窗口。两版原作者矩阵各 46 PASS 保留，独立发现不改写这些原始状态。

完整结构化报告、实际反证脚本、测量值、旧源码片段和逐文件哈希见 [control-review.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/code-reviewer/control-review.json)。JSON SHA-256：`2bd05ee46b89d9f2ccac16307955b917b4c77becf03028d2bff34d35e573b558`。反证源码 SHA-256：`c865fa1e83fe06e97b2dd8615e38424054a8a5315eef7540ba768ad565be55f2`；选取的实际测量证据规范化哈希：`db4555cbc787cd0cf28c0d10374f8f2b72953deb3dad9193c962f9efffdba41b`。JSON 内说明了哈希算法和选取字段的来源；未冒称保留完整原始工具输出。

**HIGH / CR-F1-CTRL-001：权限检查的 await 后缺少旧 owner/epoch/target 重验，stop 后首次发出导航。** 旧 [host.js:83](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/fixture/host.js:83) 等待实际 `chrome.permissions.contains()`，随后 [host.js:86](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/fixture/host.js:86) 才捕获全局 `active`，并无条件调用真实 `tabs.update()`。[host.js:52](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/fixture/host.js:52) 在消息入口捕获的 owner 没传入 operation；59 行仅阻止旧回复。100–123 行的其它方法还取全局 `active.runId`，新 run 已开始时存在错误归属的静态风险。本次动态反证只证明 goto/stop；没有宣称已动态复现所有分支。这里的文件行号指旧哈希 `f7ab3da16668ee918a64dffc100ddbf65b1f799c2e6fd320bab54a1eae31fc3e`，作者修改后的 live 文件不属于本次结论。

两版各一例真实浏览器反证使用新的临时 profile、原冻结 extension 和原生 Worker。测试在内存中给 permissions/tabs API 加薄代理：先调用实际 permission API，在返回的原生 promise 完成前，以 microtask 调用普通 `harness.stop()`，再原样返回该 promise。tabs 代理只记录调用顺序并委托原生 API。没有伪造权限结果或导航响应，也没有写 fixture。此调度表达合法的 stop 交错，不能推算其自然发生频率。Playwright 对有限 Worker 可能有 Inspector 观察；这些反证不用于证明死循环终止时间。

| 实际版本 | 旧 runId | stop / admission close（host mono ms） | 真权限完成 → 首次 tabs.update（active=null） | 实际服务端请求 / 导航完成 |
|---|---|---:|---:|---|
| 138.0.7204.183 | faa851e4-5cba-460f-91bd-abf12c76f5ce | 177.399999619 | 177.599999905 → 177.599999905 | /after-stop?version=138.0.7204.183，wall 1790976205385，tab URL 已提交 |
| 154.0.8037.92 | 7224a446-1538-433c-a659-579df15d2988 | 137.5 | 137.599999905 → 137.599999905 | /after-stop?version=154.0.8037.92，wall 1790976206035，tab URL 已提交 |

主机内有序观察数组证明 stop 返回在 API dispatch 前；即使低精度 mono 时间相同也不倒置顺序。原生权限结果均为 true。每个旧 run 只留下一个 stopped 结算、没有旧 reply；旧 operation 仍导航并更新 document identity，随后新 title run 成功。因此“无旧回复”和“下一 run 正常”不能代替“无晚发副作用”。

该反证记录了导航路径和到达时间，没有记录 HTTP method；真实 `tabs.update` 导航的 GET 是机制推断，不把它写成实测 POST。冻结原矩阵中的 MAIN 入环 beacon 则确实记录 POST，见 JSON 的 `versions[].main.mainEntered`；这是另一条证据。

[冻结 F1-CTRL-TRUE-TERMINATE 合同:103](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-5/candidate/stage0/f1-cases.json:103) 要求 admission 立即关闭并无 late action。已发副作用无法撤销的边界不适用本例：原生导航 API 在 stop 后才首次发出。最小修复应把 admission 时的不可变 owner/run、host/sandbox epoch 和 target identity 传到 operation，在权限及后续每个 await 后、每次原生 dispatch 和导航 document adoption 前重验。使用旧 owner 的 runId，不能从新 `active` 借身份。需要原生 stop、deadline、host-close、跨新 run 的实际晚发副作用回归；记录真实权限完成、终止、API dispatch、页面/服务器效果的顺序。无需改合同、权限或 backend。

可重现的关键代码如下，完整实际 stdin 脚本在 JSON 的 `independentProbe.executedSource`。重现旧问题须先恢复并核对旧 10 文件 manifest；当前正在修复的 live source 不能标成 711f。

```js
const contains = chrome.permissions.contains.bind(chrome.permissions);
const update = chrome.tabs.update.bind(chrome.tabs);
chrome.permissions.contains = function (...args) {
  const p = contains(...args);                 // 实际 native permission
  queueMicrotask(() => harness.stop());       // 在授权 await 间隔到达的 stop
  return p;                                  // 不替换实际结果
};
chrome.tabs.update = function (...args) {
  observe(harness.evidence().active, args);   // 原测量为 null
  return update(...args);                     // 实际 native navigation
};
await harness.run('await page.goto(params.url); return "unexpected";',
                  {url: destination}, 5000);
```

**HIGH / CR-F1-CTRL-002：资源资格证据缺口，不是已证实泄漏。** [冻结 F1-CTRL-RESOURCE:134](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-5/candidate/stage0/f1-cases.json:134) 要求 success/throw/timeout/cancel 各 5 轮，对 pending/timer/port/Worker/Blob 的独立前后观察及 revoked URL load failure，所有 per-run 资源回到基线。

两版都有真实 20 轮、逐轮 host pending/page wait/timer 基线及最终空浏览器 Worker target 集合；这些证据支持对应观察。问题在 [旧 run-native.mjs:291](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/run-native.mjs:291) 至 306 的总资源 oracle：最后一次 resourceProbe 各只有两个负 URL，和这 20 个资源 run 的 revokedURL 集合交集均为 **0/20**。它们属于 AFTER-CLEANUP-VALID 和 probe 自己的正对照 Blob。旧 [sandbox.html:44](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/fixture/sandbox.html:44) 的 probe 只看当前 realm 的 retiredURLs；[旧 host.js:23](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/fixture/host.js:23) 在 stop/timeout 后销毁并重建 opaque realm，前 realm 的本地列表随之丢失。38 个 retired 记录中的 revokedURL 字符串和最后 realm 的 Set/pointer 零值不能充当所有 20 轮的独立原生失效证据。

补证应按真实 runId/epoch/Blob/Worker 绑定这 20 轮。明确声称显式 revoke 时，在创建该 Blob 的同 opaque realm 中保留原生可加载正对照及 revoke 后负探测，先观测再拆 realm，清理探测 Worker。若采用 realm 退休释放，则区分 realm 销毁与显式 revoke，并提供浏览器层的销毁和 target 消失观察。跨新 opaque origin 加载旧 URL 失败本身不能归因于 revoke。补一个有目的的资源专用证据集即可，无需为计数重跑整个矩阵或把旧 aggregate PASS 改标。

物理终止本身在本轮获得支持。6 个 native trace 的 `TracingSessionIdForWorker` 都唯一匹配原矩阵的 targetId、Blob URL、creator frame、host parent frame、PID/thread，且报告引用的 trace/protocol 事件与原文件逐对象吻合。138 target URL 为空也有此精确链，未采用 highestCPU 猜测。两个版本的原生字段语义可核对 [Chromium 138 源码](https://raw.githubusercontent.com/chromium/chromium/138.0.7204.183/third_party/blink/renderer/core/inspector/inspector_trace_events.cc) 与 [Chromium 154 源码](https://raw.githubusercontent.com/chromium/chromium/154.0.8037.92/third_party/blink/renderer/core/inspector/inspector_trace_events.cc)。

下表时间取 actual trigger 的保守下界，包含 host/Node clock 校准误差，均未从 Worker.terminate 返回时间重置窗口。clock 区间宽度小于 0.74 ms。

| 版本 / 分支 | 精确映射 PID | 入环 CPU 增长（s） | TargetDestroyed（ms） | target absent（ms） | CPU 实停证据最迟观测（ms） |
|---|---:|---:|---:|---:|---:|
| 138 STOP | 86290 | 0.374311 | 2006.622 | 2054.934 | 2428.519，精确 PID 已退出 |
| 138 DEADLINE | 86313 | 0.375144 | 2005.428 | 2055.257 | 2426.956，精确 PID 已退出 |
| 138 HOST-CLOSE | 86349 | 0.373022 | 6.188 | 161.569 | 559.611，精确 PID 已退出 |
| 154 STOP | 86288 | 0.375215 | 2003.098 | 2024.090 | 2328.993，持续近零增长 |
| 154 DEADLINE | 86305 | 0.350109 | 2004.465 | 2014.720 | 2320.674，持续零增长 |
| 154 HOST-CLOSE | 86341 | 0.371454 | 9.082 | 165.455 | 517.320，精确 PID 已退出 |

154 STOP 后三个累计 CPU 值为 2.335890、2.336024、2.336091，后两增量为 0.000134/0.000067 s；DEADLINE 三值均 2.804644。138 缺失 CPU 样本没有当作零，而由精确映射 PID 的真实 ps 无进程结果补证。STOP/DEADLINE 的早期 150 ms CPU 仍增长约 0.145–0.151 s，明确显示并非立即物理终止；旧 2 秒 FAIL 保留。全部仍满足获批的 actual-trigger +3s 独立 CPU 实停、TargetDestroyed 和 target absent。host-close 使用真实关闭请求边界和新 host 响应；不凭已销毁 host 推造终端记录。

旧 native runner 在死循环阶段不 attach Worker 或 creator iframe，6 条 protocol 链也没有对应 attachment。有限 CSP Worker 的 Runtime/Log 观察安排在这些循环之后；它不能倒过来污染已完成循环的终止。protocol 保存事件而非完整请求命令日志，结论限定为审过的 runner 和记录链；未宣称排除了所有可能外部 Inspector。

本次核查覆盖两个完整实际矩阵的 92 条 author case、10 个 manifest 源文件哈希、24 个 evidence artifact 和 2 个批准报告。实际 runner 与 host/sandbox/Worker/CSP/攻击 fixture 做源码复核；legacy run.mjs 仅核对哈希，不把它用于 native 终止证明。119 个 round4 artifact 重新核对字节哈希均未变；在作者开始新修复前，按冻结 cleanup audit 的 25 个精确 profile 和已记录 PID/process group 做只读检查，未发现存活匹配。独立反证的两个临时 profile 已删除，浏览器和 HTTP server 已关闭，dispose 后 pending/timer/port/frame/pageWaits/resourceReplies 均为零。没有运行新全矩阵，没有新增依赖，没有修改产品、fixture、公共 gates 或旧证据。

其余已观察边界的独立 disposition：

- 异步页面方法真实执行，type/click/wait/read 得到 BaseAlice；实际 throw/syntax/adapter/clone error 和 false/0/null/undefined 有记录。完整资格仍受 CR-F1-CTRL-001 阻断。
- private RPC 的实际 global forgery、prototype patch、fake sibling peer、rebind/replay/wrong run/epoch 不产生伪完成；捕获安全 primitives、实际私有 binding 和单序列检查支持这些已跑边界。
- CSP 有同 finite Worker session 的浏览器 connect-src/script-src 原生拒绝；HTTP/WS 正对照前后均可达，服务端真实记录 6 个 HTTP 和 2 个 WS upgrade 正对照，没有 worker=blocked 请求。不是以 CORS 错误当 CSP 证明。
- SW 精确 version stop/wake 后 epoch 改变，controller Worker 真正完成；旧私有 host dispose、新 host epoch 和实际新 run 有证据。此为 fixture 的有限生命周期验证，不是 F2 产品恢复验收。
- MAIN 有 token 和实际 documentURL 绑定的入环 beacon POST、CPU 增长、精确 owned target 销毁；borrowed retire 明确拒绝，adapter dispose 后 borrowed 仍存活。MAIN 的 CPU 是 renderer 总量诊断，没有伪称精确 MAIN PID/thread 映射或 Worker.terminate。

页面旧 **CR-F1-PAGE-001 保持 BLOCK**；round6 页面条件差异未接受。JSON 保持 `allF1=false`、`unionCandidateSha256=null`、backend/F2/F3 未通过。603 product cases 未由本次复核运行。旧候选 review 到此收束；新源码、证据和两 lane union 需要新冻结 hash 后独立复核，不把正在修改的 live source 混入 711f。

