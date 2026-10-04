# B05 真 SDK runner：准备交付，尚未原生执行

作者范围仅为 `tests/framework/b05-product-acceptance-20261003.mjs` 与本文件。旧聊天继续产品实现；本 lane 没有构建、启动 UI、启动 Chrome、运行真实测试、修改 k5 runner、产品、共享账本、门禁或冻结证据。作者不兼任最终评审者。

已完整加载 executor 提示、`prompts/goal-migration-v5.txt`、`continue-in-new-chat.md`、`goal-constraints.md`、`evidence/k4/router-contract.json`；读取当前 k5 native runner、SDK broker/authority methods、固定 SDK/relay、网络与共享存储实现，以及 B05 规格和新增 017–019。当前两文件交付不重新接管公共 writer 或恢复旧聊天。

## 已实现与验证边界

新增 runner 是独立入口，默认仅打印帮助；`--schema` 与 `--inspect-package` 都是只读操作。只有明确传入 `--run` 和已检查包 hash 才会启动 runner 自己拥有的原生 Chrome。它只加载 `dist/production` 的真实路径，整包前后 fingerprint，拒绝更换产物、manifest 或注入测试扩展。未来执行的证据与隔离 profile 位于新 OS 临时目录，不写历史证据或共享台账。

复用了 k5 的真实 CDP、可信鼠标点击、显式 tab/document/capability 选择、固定资源安装、原生 SW 停止、只读 IDB cursor 快照模式。k5 顶层直接运行、没有 helper exports，直接 import 会启动其测试并写既有证据目录，故没有 import/执行 k5；也没有对其做 patch。

真实链路保持：产品工作台权限动作 → 当前 host client/installSdk → 唯一 authority grant → 固定 ISOLATED relay → 固定 MAIN SDK 的真实 Hello → 原生 sender → 唯一 SDK broker/journal/IDB → 既有短 driver → 固定回程。runner 没有新增 SDK 接口、test capability、第二 driver、第二 authority、数据库、产品路由或 payload sender。

本次已经验证：新增文件 `node --check`、无运行副作用的 `--help`/`--schema`、已有 production 包的只读 hash/AST 定位。以下“可执行”指实现了待原生执行的路径，**原生结果全部尚未取得**，没有本 lane 的 native PASS。leader 已验证 checker 15/15 属于验收机制逻辑，不能计入本 runner 的真实 B05。

已按新版 `/Users/shopme/.codex/AGENTS.md` 完整读取 `/Users/shopme/.codex/browser-testing/launch.py`。runner 唯一浏览器启动点现在为 `/usr/bin/python3` → global launcher → 固定版本 CFT，使用 `--executable`、`--report` 和附加 Chrome flags。launcher 自己 mkdtemp 并传入明确 `--user-data-dir`，拒绝外部覆盖该参数；runner 不另建或复用 profile，不移除其默认 flags。CDP endpoint 从 launcher 所有 profile 内的 `chrome.log` 读取，不能从 Python stderr 猜测。

runner 区分 `session.launcher.pid`（Python）与 `session.pid`（report 的真实 Chrome main PID）。真实执行前会核验 `/bin/ps -ww` 的 main PID/父 PID/完整 argv、mock keychain/explicit profile/默认 flags、profile 创建时间及未复用事实；随后比对 CDP `SystemInfo` browser PID。退出通过 Browser.close 或向 launcher SIGTERM；必要时仅终止已核验的 owned Chrome main，让 Python 的 finally 清理 profile。不会 SIGKILL Python 或用 runner 的强删充当 launcher cleanup 成功；实查 main/launcher 退出及 profile ENOENT，缺一保留失败/未知。

leader 已执行 **无 extension、about:blank** 的 global launcher smoke：138.0.7204.183、154.0.8037.92 各 fresh 一次，真实 ps argv 包含两项必需 flags，CDP 完整版本匹配，main 退出且 profile 删除，2/2 通过。已读取并引用 [browser-launcher-smoke.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/browser-launcher-smoke.json)，对应脚本为 [browser-launcher-smoke.py](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/browser-launcher-smoke.py)，另有两个 `launcher-metadata-<version>.json`。本 lane 未重复启动；这是 launcher 验证，**不是 B05 native PASS，也没有执行新的 runner --run**。

安全 smoke 的选项为 `--executable <固定版本 CFT binary> --report <独立 JSON 路径> --headless=new --remote-debugging-port=0 about:blank`，不传 extension flags 或 `--user-data-dir`。profile 由 launcher 创建/退出删除。该轮由 leader 独占，已完成，不需重复；本 runner 的 Python-launcher 集成与生产 case 执行仍待后续原生核验。

## Case 分类

|Case|准备状态|真实执行时必须取得的证据|
|---|---|---|
|B05.SDK.no-controller|现包入口可执行|默认无选中目标，可信点击授权，精确 native document/grant，固定 Hello 的允许方法，decoy 未注入，IDB 无 controller run|
|B05.SDK.promise-values|现包入口可执行|固定原 Promise 返回 false 的字符串转换、0、own undefined、HTTP 成功中的业务 PageBrigeCode 保持为 data|
|B05.SDK.100-concurrent|现包入口可执行|真实 relay world 中 100 次原生 sendMessage；相同 ID/digest；100 个最终响应；唯一 request lock/run/op/result；真实本地 POST 次数 1|
|B05.SDK.conflict|现包入口可执行|pending 与 durable 两阶段改 method、args、deadline：E_REQUEST_CONFLICT，原 digest/ID 不变，无新增 HTTP 写|
|B05.SDK.delivery-failure|现包入口可执行|真实 HTTP 在途时 dispose 固定 SDK，原 Promise E_CANCELLED 且一次结算；原 driver 仍可 durable；手工同 ID 查原结果，不再次写；response_ready 不声称 delivered|
|B05.SDK.revocation-no-replay|现包入口可执行|真实 chrome.permissions.remove，旧 ID 拒绝；产品 UI 显式重授后旧 incarnation 不复活；HTTP 写仍为 1|
|B05.SDK.navigation-no-replay|现包入口可执行的观测切片|真实 Page.navigate、旧 grant 关闭、新 document/new Hello，旧 op 仍绑定原 document，服务器没有自动重放|
|B05.SDK.navigation-old-sender-replay|not-tested|销毁的旧 document 无法产生真实旧 sender；禁止用新 document 的 payload 构造旧身份|
|B05.SDK.navigation-original-promise|not-tested|旧 JS context 已销毁，无法观测其原 Promise 结算；不制造假的 rejection|
|B05.SDK.unknown-public-reference|not-tested，IR 下述|当前原生错误投影只含 code/message；原引用能从 IDB 观测，但不能冒称网页错误返回了原 invocation 引用|

100 同 ID 的测试特意不采用“100 个页面监听器等待一份响应”作为 100 次 broker 入站的证据：既有 relay 会合并正在进行的同 ID 页面事件。runner 仅定位已安装 relay 的真实 ISOLATED context，以其 Chrome runtime 连续提交 100 次同一合同消息。没有 `Page.createIsolatedWorld`、替代 runtime 或调用 authority。随后再经固定 MAIN 事件链核对原结果。native ingress stress 与完整 SDK 普通 Promise 路径分别标明，不互相冒充。

## 四个 crash-point

|Point|准备状态|准确窗口与恢复断言|
|---|---|---|
|before-admission-commit|not-tested，B05-IR-ADMISSION-ABORT|必须证明真实 admission readwrite 事务未 commit/已 abort；原 key/run/op 原子回滚、HTTP 0。当前不能仅凭轮询“没有行”或 pause 在事务开始之前充当此证据|
|after-admission-before-dispatch|原生 debugger 条件可执行|在原 SDK broker 调用 driver 前精确断点；独立 native IDB 看到 admitted、唯一原 run/op、无 receipt；HTTP 0；SW 真消失；原 ID 重挂保留 op/run/digest，再实际写一次|
|after-effect-before-receipt|原生 HTTP hold 可执行|服务器已接收完整 POST body，故真实效果计数为 1；扣住原生响应，不让 driver 获得 receipt；IDB dispatched/无 native receipt/无 result；杀原 SW 后原 op effect_unknown/run paused_unknown；重挂 E_EFFECT_UNKNOWN、无第二 POST|
|after-durable-before-delivery|原生 debugger 条件可执行|原 broker 回程 authorize 调用前精确断点；IDB durable/result 已存在且非 response_ready；HTTP 1；杀原 SW，原 run/op/result/digest 保留；查回原 durable value、原 receipt 不变，无第二写|

debugger 只解析已构建的 `sw.js`，使用工程现有 acorn；不新增依赖、不改 minified 脚本、不开 source-map 替代包。`getScriptSource` hash 必须等于 fingerprint 的 sw.js；`getPossibleBreakpoints` 和实际 pause 必须精确匹配 AST call 起点，再以 IDB/HTTP 验证窗口。最近 offset、pause 请求返回或普通 target 心跳不能算 crash 命中。CDP 无法精确命中时保留 NOT_TESTED，不包装通过。暂停会影响生命周期/计时，原始 CDP、native SW version/targetDestroyed 与已花时间保留供独立评审；每轮解除 debugger。

本次静态检查已有包 hash：`4fc301a556ea4311e2a36c91c0aaf4bf260c280771a604c0cde34c10efb06152`；sw.js hash：`3a59a95e2ee3e4e85df9c62c6653838c57020ca9a8afbc448ecf5c2c5aa1a931`。查到 after-admission call offset 189167、after-durable authorize offset 189452、019 原生 fetch call offset 182226（零基列、当前 minified 单行）。这些是静态位置，不是原生命中证据；后续包变化重新解析，命令不硬编码这组 offset。没有证明该旧包包含 writer 刚补的恢复修复。

## 保留 017–019 增项与当前合同分母

runner 启动时只读当前 ledger 的全部 `additionalCaseResults` 中 `F2-K2-SDK-*`，保存实际 IDs/title/status/hash，并检查 017–019 存在。没有固定“16 条”或把 19 个增项写成原生通过；001–016 也没有被删除或从主代理的分母中排除。

|增项|本 runner 范围|未测/阻塞|
|---|---|---|
|017 explicit regrant restores epochs after SW restart without reviving old IDs|新增 B05.SDK.regrant-origin-restart：真实 origin 权限撤销、显式重授、同 browser session 的 SW 停止/恢复、真实 Hello、新 session GET 读 0、旧 ID 拒绝；保留 grant incarnation/permissionEpoch 与原 op|完整 017 仍 NOT_TESTED：原组件测试含 navigation/origin/notifications 三个组合；本 lane 不以 origin 一个切片关闭整条合同。旧 navigation sender 的真实负控及 notifications 组合仍缺|
|018 recovery storage durable result before broker receipt no replay|完整保留 NOT_TESTED；HTTP durable-before-delivery 不替代此专门的 storage cut|需要同时证明 frameworkKV/result 原子 durable、broker receipt 尚未发生、run 尚 preparing、SW 恢复 completed 原结果，并原生观测无额外 KV put/commit；IR-STORAGE-DURABLE-CUT|
|019 dispatched cut original unknown no replacement|原生 debugger 条件路径：授权 dispatch 事务已 commit，原 fetch 尚未调用；IDB dispatched/submissionCount=1、HTTP 0；SW 真消失，原 run paused_unknown/原 op effect_unknown；同 ID 再调用 E_EFFECT_UNKNOWN、HTTP 仍 0|未执行；精确 fetch 断点/CDP 窗口不可观测时 NOT_TESTED。不能以 CP3 的“已经写 1 次”代替 019 的 pre-fetch cut|

## Interface-request 给主代理 / 产品 writer

这些是观测请求，不是扩权或另造 SDK 测试协议的提案。本 lane 不修改产品。主代理与产品 writer 决定是否能通过当前原生 CDP/既有事务实现补齐；只有生产真实流程可观测才验收。

1. **B05-IR-ADMISSION-ABORT**：提供当前生产 admission 事务“已发生真实写请求但尚未 commit”的可验证位置/transaction identity、原生 abort/terminated 事实。观察者能关联真实 doc/grant/requestId 与 committed 前后快照、HTTP 0。不得提供从网页创建 authority/owner/sender 的控制口。不能把空的附加数据库、组件事务 oracle 或 IDB 测试写入当产品 admission。
2. **B05-IR-STORAGE-DURABLE-CUT**：指出原 persistent SDK transaction 完成后、broker recordEffect 之前的生产可断点位置；给出 native frameworkKV put/commit 计数的可靠只读观测方式。KV 值前后相同不证明没有再次写，HTTP receipt cut 不证明 storage cut。没有这些事实时 018 保留 NOT_TESTED。
3. **B05-IR-UNKNOWN-REFERENCE**：确认冻结合同要求的原 invocation 引用应如何通过真实 typed error/result 投影返回。当前只有 IDB 原 op/run 引用与 E_EFFECT_UNKNOWN code/message；若没有批准的公共投影，不能在 runner 补造 `opId/runId` 错误字段。
4. **B05-IR-RESOURCE-OBSERVATION**：strictcandidate 的 timers/subscriptions/ports/Worker/Blob before/after baseline 需要各环境真实观测。当前 runner 只观测所拥有 Chrome pid/profile/server 清理和保存 raw SDK/relay 数据；不把不可见的全产品计数填 0。此项由主代理的完整资源验收整合，不扩大本 runner 权限。

## 可复核原生证据 schema

`--schema` 输出本 runner 的明确 schema。未来 `--run` 每次创建新的临时 evidence 根，包含：

合同绑定已改为 **批准的 frozen round6 manifest → manifest 中的 frozen test-spec**，先验证批准状态/round、manifest hash、spec 路径及 hash，再只从这个固定快照计算原 case 的 `contractSha256 = SHA256(JSON.stringify(case))`。不读取可变当前 test-spec 作为替代。原 case 若具有 `case.source.path/sha256`，先读该真实路径并核实文件 hash；所有导出 record 的 `sourceHashes` 均为真实绝对路径 → 实际文件 hash，包含已核验的冻结 B05 来源、runner、生产源码、launcher 与合同输入。文件不存在或冻结 hash 不符在启动前阻断；结束时复查漂移。

冻结 603 中本 runner 同名的原 case 使用 `contractBinding.kind=frozen-original`。017–019 使用动态当前 ledger 的实际 row hash/ledger 文件引用；新增细分 ID 不冒充 frozen 原 case，标为 bounded-slice。记录 source 引用不代表已经覆盖其父 case 或原603。

- `report.json`：输入合同和 runner/source hash、动态 SDK 增项清单、完整包逐文件前后 hash、source/package drift、真实 browser binary hash/CDP 完整版本、OS、extension ID、原生 argv/pid、隔离 profile、每 case 状态及时间、未测与 interface-request。
- `raw-cdp.jsonl`：全量发出/收到 CDP message，sequence、endpoint、wall time、mono time；包含可信 UI 输入、真实 execution context、断点/暂停 call frame、实际 MessageSender 的只读局部值（可观察的 crash-point 才有）、SW version/targetDestroyed/恢复 target。
- `raw-server.jsonl` / `raw-server.json`：实际 request method/url/headers/body/body hash、sequence、接收/finish/close；HTTP 写次数由完整 POST 的实际 records 算出。
- 每 case/snapshot 文件：唯一 `opKey/requestDigest/runId/opId/resultId/grantIncarnation`，真实数据库 schema/version、显式 primary key/完整行、state/submissionCount/nativeReceipt/durable/result/delivery 的分账；绝不把 response_ready 写成页面已收到。
- `results.json`：按 ID 汇聚各实际 environment 的独立 `observations`，各自 input/expected/actual、原始证据路径与 hash、实际 measurements。minimum/stable 缺任一环境就保留缺项，不复制另一个环境的 observation。每次实际执行测量 elapsedMs、raw CDP sequence/HTTP record 前后窗口；100并发和 crash 的 controllerRuns/admissions/operations/serviceRuns/httpWrites/未知结果/identity preservation 等从该环境实测派生，不从顶层声明继承。未运行的 case 没有伪造时间或计数。
- `launcher-report.json` / `launch-process.json` / `session-cleanup.json`：每环境的 launcher 原报告、实际 ps 原文/时间、fresh profile 事实、main/launcher PID 与退出/profile 存在性检查，均通过路径与 hash 附入 observation。它们不能替代每 case 的产品资源 baseline。
- 每条 observation 的 `cleanup.status=NOT_TESTED`，`before/after=null`；pending/timers/subscriptions/ports/workers/blobs 全部列为未观测。仅单列实际 session teardown 值，不编造六项 0 或声称每 case 的资源已回基线。该完整 baseline 由旧 writer/主代理继续补齐。
- `barrier-plan.json` / `schema.json`：绑定同包的静态位置及 schema，用于复核，不是 PASS certificate。

`results.json` 是 bounded 原生采样数据，**不是完整 strictcandidate**：未测 case、完整资源 baseline、独立 review、完整603、全19新增合同、download 等仍缺。不会修改 ledger/status 或 gates；`b05Closed/f3Accepted/finalProductPassed/original603Closed` 始终 false。未知/失败/权限等待分别标 NOT_TESTED/FAIL/BLOCKED，不能无声 skip。

本 lane 不执行 mixed1000、reconnect10、pluginDisabled2，campaign ID 数组保持空；不会输出“已测1000”的 count。主代理的 campaign 必须每物理 round 独立 ID、原始证据与每环境时间/measurement，禁止复用同一 round、case record 或 observation 填数。

## 命令（后续 writer 交接并已 build 后执行）

先做只读准备；以下命令本次已可运行，不启动浏览器：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
node --check tests/framework/b05-product-acceptance-20261003.mjs
node tests/framework/b05-product-acceptance-20261003.mjs --inspect-package
node tests/framework/b05-product-acceptance-20261003.mjs --schema
```

真实执行由主代理在产品 writer 交接后安排；使用那次同一个已 build production 包的新检查 hash，不能照抄上面的旧 hash：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
node tests/framework/b05-product-acceptance-20261003.mjs \
  --run --chrome=all --headed --permission-timeout=120000 \
  --expected-package-hash=<上一步该已build包的64位SHA256>
```

沿用缓存的 Chrome 138/154 默认路径；以实际 CDP 完整版本、binary hash 证明环境，标签不证明当前 stable 资格。单环境调试可指定 `--chrome=138` 或 `--chrome=154`，不足双环境 matrix。`--binary=/absolute/chrome` 必须配单 label，不下载、不安装依赖。运行需要既有带 global WebSocket 的 Node（22+）。headless 权限等待保留 BLOCKED，不能预 seed permissions/grant。退出 1 为失败/漂移/环境阻断；3 为仍有 NOT_TESTED；该版本不会通过必需未测项产生完整 B05 通过。

## 本次准备交付的验证记录

- `node --check`：通过。
- 默认入口、`--help`、`--schema`、`--inspect-package`：在禁止全部子进程创建的验证进程中完成；启动尝试 0，不构建、不启动浏览器、不生成 native case 证据。
- 冻结 round6 manifest/spec 完整性、11 条 B05 冻结 row hash 与实际 source 绑定、19 个真实绝对路径 → hash：只读核验通过。frozen spec SHA256 为 `9ccdc5995b89005661dabf62f39b63563c2cbce6e34c37c7e0879b2831febb4d`。当前读取到 19 个 SDK 增项；这是观测值，不是 runner 写死的分母。
- 18 个 bounded case ID 唯一；准备状态为 9 个原生入口可执行、3 个 debugger 条件可执行、6 个显式 NOT_TESTED。实际 native B05 运行数 0；“可执行”不等于 native PASS。
- 当前生产包 AST 的 CP2/CP4/019 call 定位与原文 slice 相符；缺失/重复 anchor 的保守拒绝通过。launcher 参数所有权检查通过，拒绝 runner 覆盖 profile/password-store/remote address。上述均为机制验证，不计入真实 crash 观测。
- leader smoke JSON 只读核验 hash 为 `daaa23ff8c589dcb27e046b362d28067cd4613d4c32a2ccebec3b5f3ab354cf3`；两种版本的记录皆为无 extension/no 产品测试，profile 路径实查已不存在。

准备部分交付后，真实四 crash、原生未知引用投影、storage durable cut/KV 写计数、完整资源 baseline 和 017 的未测组合交回旧 writer/主代理。此 runner 的 global-launcher 集成没有执行 `--run`；后续每次原生执行仍必须重新核验真实 main argv/fresh profile/cleanup，不能用本次 leader 的 about:blank smoke 代替。
