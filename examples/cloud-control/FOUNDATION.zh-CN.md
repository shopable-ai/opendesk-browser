# 云控基础接入与当前验证

目标是让业务平台创建任务、交给指定设备、在浏览器既有授权内执行，并查询结果或取消。
当前属于基础开发阶段。[2026-11-14 阶段记录](STAGE-20261114.zh-CN.md)保存最新 LAN、绑定复核与未完成项：当前为 PARTIAL，尚无本轮新请求。2026-11-08 曾完整通过业务网页下发、原 Chrome 执行、页面准确结果、本地保存与后台回执，见 [11 月 8 日复测与使用说明](RETEST-20261108-UI.zh-CN.md)；[11 月 7 日复测](RETEST-20261107-UI.zh-CN.md)保留历史。未进行 production、完整云控产品、CWS 或全量故障验收。

## 推荐及取舍

服务器保存 Job 和固定 Task 引用；浏览器执行已经审阅安装、单独批准云控的 Controller。
复用现有 Provider 的 claim/lease/permit/receipt、Authority、Offscreen RunHost 和受控 Worker。
Push 负责唤醒，Pull 作为认证回退，二者进入同一领取链。

远程源码可作为安装前的作者入口：服务端字符串调用
`src/platform/tasks/contract.js` 的 `createTaskPackage`，或通过
`scripts/cloud-control/cli.mjs program:deliver --js <文件>` 交付。
它最终仍成为同一套固定 Task，不增加第二种执行器。
不采用任意源码即时特权执行，也不因来源不同复制运行、取消和授权逻辑。

已有 mac24dev 示例仍归 [mac24dev-demo](mac24dev-demo/README.zh-CN.md)；
这份说明不创建新的生产程序，不改变业务后台、配对或支付等无关服务。

## 业务调用

以下接口已经存在于 `scripts/cloud-control/provider.mjs`。真实业务由 BFF 持有受限 client
bearer，不能把凭据写入网页或交付日志。设备由已审阅的 client/executor/pairing 绑定决定。

| 操作 | POST 接口 | 请求与含义 |
| --- | --- | --- |
| 创建 | `/v1/submit` | `requestKey`、`taskId/version/manifestHash/sourceHash`、`params`、`target:{mode:"owned",url}`；返回 `jobId`。固定 pin 与参数 schema 必须匹配已批准任务 |
| 查询 | `/v1/job-status` | `jobId` 或 `requestKey` 二选一；只读原任务。响应丢失先按原键查询，不能换键掩盖重试。`state` 与 `receiptConfirmed` 分开判断 |
| 取消 | `/v1/job-cancel` | 原 `jobId`；返回取消登记。已有 Run 时继续查询原停止、释放和回执；不能把登记意图当成执行已停止 |

取消要区分：证实没有 admission 的任务可确认“执行前取消”，不要求虚构 Run/Result/执行回执；
已有 Run 则核对其状态、资源释放和回执；曾绑定 Run 但原事实缺失时保留 UNKNOWN。
结果正文只有浏览器与 client 双方均批准时才能披露；`allowResult=false` 只返回受限状态。

## 源码交付与本地程序共用运行链

普通 `async function main()` 源码或现有固定包
→ immutable manifest/sourceHash
→ `program:deliver`
→ 配对浏览器 Inbox
→ 查看准确源码
→ 用户显式试运行／接收候选
→ 原 Controller RunHost
→ 持久 Run/Result 及 native 页面操作回执
→ Verify → Available → 审阅安装
→ 单独批准 Cloud。

`received:true` 仅表示候选接收，不表示执行、验证或安装成功。
云控页可先试运行再接收并继续验证；先接收会清除该页已查看源码，后续从「我的」候选进入。
打包只检查包合同、固定 hash 和有限入口形状，不是完整语法编译；此入口没有自动 npm/ESM 构建。
仅返回 `{ok:true}` 不足以安装，仍需同源码的持久成功运行、释放和精确 native 操作回执。

## 本轮修复：保存真实启动首错

过去 resolver 或创建 Run 前失败仅在 runner 控制台留下警告，任务可能停在“已分配、无 Run”，
事后无法查清首错。本轮在原服务增加内部诊断包装：解析阶段与 Controller admission 阶段
失败时，只保存 `startupFailure={code,stage,at}`；错误码唯一白名单在
`src/cloud-control/service.js` 的 `STARTUP_CODES`，未知码统一为 `E_CLOUD_STARTUP`。

写入前后重新核对真实 Host、namespace、Grant、pairing、原请求/assignment/attempt 和固定参数；
取消、换代、过期、已有 Run 或首错已存在时不写。诊断失败仍抛原异常，不创建 Run/Result，
不改变原执行、重试或授权。只读历史显示“首次启动记录”；已有 Run 后使用原 Run/Result，
公开 observer 不增加诊断细节。message、stack、源码、参数和凭据均不进入诊断。

## 上一轮接口真实结果（2026-11-07，保留历史）

基础业务闭环已通过一次新的独立请求：业务 BFF 创建 Job，指定配对设备领取，
原 Controller 填写 `CloudBusiness-1107-01b1dd`，原页面准确显示
`已提交：CloudBusiness-1107-01b1dd`，持久结果、资源释放和 Provider 回执均已确认。
没有重投旧请求，也没有扩大结果正文披露范围。

| 关联项 | 本次真实记录 |
| --- | --- |
| 业务入口 | `http://127.0.0.1:38001/public/opendesk-cloud-demo/index.html`；本次由受信服务端调用同一 BFF，完整登录 UI 流程未验收 |
| 固定 Task | `sample.form-fill@1.0.2`，原 manifestHash/sourceHash 不变 |
| requestKey / Job | `cec22dd0-919a-4d5b-884c-7a29bdd7625a` / `41e21ceb-a58d-466a-a7f9-440dc2546269` |
| assignment / attempt | `affd0198-0bee-4ff4-aac2-a5adf644a165` / `1` |
| Run / Result | `8d5c14ca-290b-436a-8996-f7903681be34` / `9ffe34ef-d8eb-448c-995c-5d35d1ad6de3` |
| 原生 document / 页面观察实例 | `B8CB8E3FF783D6BEC0EE1C544165DE9B` / `fe6af20d-2da9-4921-a336-9a3f280ea86d` |
| 页面效果 | 同一文档 ready → submit → done 连续记录；一次提交；5 条精确 native 操作回执，包括准确完成文字回读 |
| 安装身份 | installationId `401a0a75-fae3-4811-877e-00cb198585f2` 保持；generation `5 → 6` |
| 释放 | completed、workerRetired=true、released、releaseCount=1；owned Tab 不存在、执行槽 available |
| 回传 | receipt `8cb8e4f3-b0b0-420e-b00d-a2bf6e3521f8`，本机 delivery=confirmed，BFF receiptConfirmed=true；allowResult=false，只回传状态 |

原文档关联观察在提交前登记：Chrome `webNavigation.onDOMContentLoaded` 提供真实
tabId/documentId，再按该 documentId 只读提取被动观察标记；未操作、替换或补开目标文档。
演示后已移除该临时观察器。原生摘要通过 Chrome 导出，证据关联检查为 PASS。
这是一条真实基础开发证据，不代表 production、完整业务 UI、取消分支、故障矩阵或评分通过。

在 Chrome「云控 → 请求记录 → 最新详情」可查看“已完成、结果已保存、资源已释放、回执已确认”，
再点“在「开发」查看原始 Run / Result”读取本机原始结果；该入口不重新执行。
业务端以同一 requestKey 调用 BFF `/app/operate/cloudcontrol/status`，当前返回
`state:completed`、`retirementState:released`、`receiptConfirmed:true`，不含结果正文。

## 同一个固定包恢复当前运行时

运行时身份变化时保留旧验证和安装历史。以相同源码在当前运行时显式试运行，
取得新的持久 Run/Result、成功 native 页面回执及释放证明，再通过原有
Verify → Available → 确认更新运行时安装。安装事务保持包字节、权限及 installationId，
使用原 CAS 更新运行时绑定并增加 generation；旧云控批准不能沿用，须核对相同范围后重新批准。
本次新验证 Run 为 `2272fd83-7f30-482f-b290-352a1bc34aaf`，旧验证
`d2b0de5d-757f-419c-ab32-c0cd753e1f2c` 及旧 bundle 仍在历史中。
本地项目保存与云端程序试运行安装均复用同一生命周期，不新建版本或执行器。
本地项目审阅固定原 installationId/generation；同哈希恢复若丢失安装回执，只读核对
原身份、精确下一代、当前运行时及固定包／源码后才确认，不自动重复安装。

## 历史诊断（2026-11-06，已由上述新证据续接）

| 层级 | 结果 |
| --- | --- |
| 独立方案评审 | 固定权重首审 93/100，补齐合同后复审 97/100；保留无 Run 取消、同版本恢复入口、白名单三项扣分。该分数只评价方案 |
| 程序来源组件 | 26/26 PASS：真实临时 HTTP Provider/CLI，加上原 inbox/trial/Task service 组件；后者使用受控 mock/内存存储 |
| 新首错诊断 | 定向测试及状态展示验证见本轮证据索引；不代表已在真实 Chrome 触发该新增分支 |
| 当前真实安装 | 原扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载 `dist/development`，观察时持续开发连接成功；未重装或替换加载目录 |
| `sample.form-fill@1.0.2` | 当时安装绑定的 builtin bundle 与浏览器实际加载 bundle 不一致；严格身份检查拒绝运行。现已通过同版本合法重新验证恢复 |
| 当时 Chrome 业务闭环 | 当时 BLOCKED / 未完成；上述 2026-11-07 新请求独立证明本次恢复后的真实闭环 |

原 requestKey `30ad0cf2-7a87-4d2f-89be-7ef0ee96b36a`、Job
`ca6d4b67-aa07-4c99-8230-ccf80b4ee985` 仅查询，未重投、未换键重试。
本地原请求已取消且无 Run；Provider 当时记录为 assigned，无 runRef/permit/receipt。
2026-11-07 对原键只读查询，业务 BFF 返回 `expired_before_admission`、receiptConfirmed=false。
原时刻没有持久首错，所以当前 runtime 不匹配**不能证明历史根因**。

ABI/catalog 相同不等于 bundle 相同。旧五项资源原始字节未找到，不能认定差异只是构建噪声。
当时 API 没有同版本跨 runtime 重新验证入口；本次已按上述 Task 生命周期实现并真实走通。
未改写数据库/identity、放宽 SHA 或制造 `1.0.3` 规避。

新原生 demo 必须提交前准备观察 session、固定包及原生 document 关联办法；
成功须同时关联同一 Job/assignment/Run/Result/receipt、准确安装身份、参数、原文档一次效果、
completed、released 和 Provider 确认。缺失原生关联时标 INCONCLUSIVE，不补开页面或重跑。

## 最小验证与证据

程序交付检查（不连接现有 Provider，不动真实请求）：

```sh
node --test --test-reporter=tap \
  tests/cloud-control/remote-program-delivery.test.mjs \
  tests/environment/cloud-program-inbox-react.test.mjs \
  tests/environment/cloud-program-trial-controller.test.mjs \
  tests/environment/task-package-flow.test.mjs
```

首错诊断与状态投影：

```sh
node --test tests/cloud-control/browser-provider-integration.test.mjs
node --test --test-name-pattern='startup history' tests/environment/cloud-control-sidebar-r28.test.mjs
```

本机可复核证据位于 `.runtime/cloud-foundation-20261106-01a1afdb/`：
`solution-plan.md`、`solution-review-v1.md`、`solution-plan-v2.md`、`solution-review-v2.md`、
`native-diagnosis.json`、各定向 TAP 日志及 `evidence-index.json`。
这些临时证据不包含原始凭据，不作为正式发行文件提交。

所有修改保留在当前 main，未 commit/push；共享 watcher、原配对、后台及其他并行修改保持原 owner。

本次证据位于 `.runtime/cloud-foundation-20261107-recovery/`：
`demo-request.json`、`demo-submit.jsonl`（恰好一次 submit_attempt）、`demo-status.json`、
`provider-after-demo.json`、`native-demo.json`、`proof-session/`、`check-evidence.mjs` 和
`evidence-check.json`。Task 生命周期 15/15、本地项目最终文件 26/26 通过；
最后追加断言后对应定向 3/3 通过。完整相关文件测试中的两条
Task workbench dock 断言在 Git HEAD 基线同样失败，未为本次恢复修改无关 UI。

演示时使用原 `dist/development` 已加载包；先前开发 watcher 因 Node 默认堆不足退出。
随后用 8GB Node 堆恢复唯一 `npm run dev`，43119/43120 与 RUNNING 已确认，
最终消费者修复输出已生成。恢复后的磁盘 builtin bundle 与演示原生证明一致；
当时尚未再次核对 Chrome 原生重新连接，磁盘或服务就绪不替代该证据。
后续独立复测已在真实调试 UI 确认 serve 连接及 `45c47dee67c7` 指纹，并从业务网页产生了新的成功请求；详情和本轮独立证据见 [复测记录](RETEST-20261107-UI.zh-CN.md)。历史原始记录不改标为本轮证据。
