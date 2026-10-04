# OpenDesk 通用框架：实现接续与产品验收操作

这份操作文件落实已批准的开发顺序、基础功能检查和 F3 证据交付，不修改接口合同或重新开启阶段 0/F1 审批。产品代码仍由聊天“续接 OpenDesk Browser 迁移 Goal”负责；本聊天只维护独立检查器、测试入口及本轮证据。任何产品修补交回唯一 writer，修补后冻结新包，受影响证据重跑。

工程根目录：`/Users/shopme/Documents/workspace/opendesk-browser`。旧工程及 `/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs` 只读。禁止重新引入 compat/src-bex、旧 assets/core 目录、第二权限层、第二存储层或替换 MV3/webpack 构建。

## 1. 当前事实与统计含义

| 项目 | 本轮读取结论 | 可证明范围 |
| --- | --- | --- |
| K0/K1 | 2/7，28.6% | 关键里程碑数量；非工时或功能完成率 |
| 130 core 的预定路径 | 历史 122/130，93.8%；本轮限定路径快照 123/130，94.6%，见 source-behavior-map.md | 路径存在；非行为通过；writer 持续修改期间不作为冻结输入 |
| ChromePage 原公开成员 | 48/48 | 符号覆盖；逐成员行为仍需产品证明 |
| progress-20261003/current-verification.json | foundation/framework 243/243、environment 20/20、源码 69 项；验证期间无输入漂移 | 该历史输入快照有效；源码后续变化使其不能充当当前包通过 |
| 原始产品用例 | 0/603 正式同包独立验收闭环 | 不由模块数、构建通过或评审分数折算 |
| 明确 SDK 增项 | 当前 19 项；001–016 为续接历史，017–019 为当前 writer 增补 | 检查器读取全部当前增项，不写死历史数量 |
| frameworkFunctionalMigrationComplete/F3 | false / 未通过 | 本文件及检查器不会写成 true |

阶段 0 round6 同一候选批准 manifest 为 `da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1`。F1 同一最终联合候选 manifest 为 `a9ce67f85964f2512212430d56b488b5b0e2c11f6afdff2ea562428c3e77da66`，12/12 资格已批准。保留控制 Worker 真实物理终止 ≤3s、MAIN 不承诺通用终止、borrowed 页不关闭和原生 FAIL/授权反例。

完整读取回执、旧文件逐行为对应、机制测试和 SDK 入口说明统一存放于 `docs/framework/evidence/continuation-20261003-current/`。进度数字先读现有证据；不为更新数字重新跑整套测试。

## 2. 沿用 T01–T13 的实施顺序

| 阶段及原任务 | 具体完成物 | 最小验证与退出条件 |
| --- | --- | --- |
| K2：T02 → T04 | 唯一 protocol/authority/broker/client；原子 admission；immutable revision/hash/params、CAS、pin/tombstone、结果 | 变更对应模块测试；真实 IDB abort/blocked/versionchange、重启恢复及 CAS 冲突；失败无效果、unknown 不重放。组件 PASS 只关闭组件工作 |
| K2：T03 → T05 | 精确 document/target、PagePort 和导航 handoff；通用 artifact、下载终态及 Blob 生命周期 | 同 tab 不同 frame、旧 doc/epoch、导航回程；下载 complete/cancel/interrupted＋实际磁盘 hash；borrowed/owned 分开清理 |
| K2：T06/T12 | SW 唯一装配、失效事件、恢复；原构建资源闭包 | SW 死亡重连保持原 admission/run/op；重建 production/development，包扫描与变异断言保持强度 |
| K3：T07 → T10 产品接线 → T01 | 48 成员及 Worker facade → 批准 sandbox → 普通 RunHost 控制生命周期 | committed r1 → 唯一 admission → 精确目标 → run context → Worker → return/error/stop → durable 结果；原生 Worker ≤3s，不把 Promise 取消当终止 |
| K4：T08 → T09 → T12 | 独立 SDK、工具常量及共享服务；固定 ISOLATED/MAIN、真实 Hello/回程 | 无 controller 的 B05；固定 18 method、argsWire/valueWire、唯一 codec；真实 native sender 与 IDB/HTTP/通知回执 |
| K5：T11/T13 | 当前工作台保存/选版本/运行/停止/持久结果/下载；普通脚本与采集、收费、row/seal 边界解耦 | 真实工作台操作及刷新/重连；无采集注册、无模板仍能跑普通 JS；不进入完整采集实现 |
| K6/F3 | 同一最新 production 包全矩阵及独立顺序审查 | 原 603＋全部明确增项、历史 17/R1–R8、压力/重连/禁用/清理/下载/B05 全部闭环；独立 architect 后 critic |

依赖保持 K0 → K1 → K2 → K3/K4 → K5 → K6。K3/K4 可各自验证；需要共享产品文件时交回唯一 writer。RunHost 已有 `scriptId → startController` 普通分支；只有 legacy `startScraping` 分支要求 template。采集 import 存在本身不是普通 JS 依赖模板的证据。

## 3. 基础功能怎样测

在 fresh 测试 profile、固定本地 HTTP fixture、已构建原样 production 扩展上，通过真实工作台授权目标并操作。macOS 启动固定版本 Chrome for Testing 必须使用 `/usr/bin/python3 /Users/shopme/.codex/browser-testing/launch.py --executable <CFTbinary> ...`，由 launcher 创建隔离 profile，核对实际 main 进程同时带 `--use-mock-keychain`/`--user-data-dir`，结束核实进程退出和 profile 删除；禁止裸启动/个人 profile。目标 URL/title 可由 fixture 精确预测，服务端请求计数和原生 CDP/IDB 原始记录同时保留。禁用或不注册采集能力，脚本不提供 template。

保存普通脚本 r1，参数 `url` 指向本地 fixture：

```js
await page.goto(params.url);
return {title: await page.title(), url: await page.url()};
```

| 基础检查 | 操作及反例 | 必须观察的结果 |
| --- | --- | --- |
| 保存/加载 | 保存 r1；刷新工作台；按 scriptId/revision 加载 | 从唯一 repository 读到相同 committed source/hash/params；界面选择版本与运行 admission 绑定一致 |
| 普通 JS | 运行已保存 r1；保留未注册采集、无模板条件 | admission 唯一，精确 target/document 绑定，实际页面导航与标题/URL 正确；return 已 durable 才显示完成 |
| 参数 | 同 r1 使用两个 fixture URL；传入 false/0/own undefined | argsWire 的类型/own presence 保留；params 来自 committed 运行快照，不被当前编辑器替换 |
| 在途版本 | 用服务端可控 hold 保持 r1 在途；保存不同源码/参数为 r2；释放 r1 | r1 的 source/hash/params 和返回值保持 r1；下一次明确选择 r2 才运行 r2；仅 sleep 不能证明两个操作重叠 |
| pin/删除 | r1 在途时 tombstone 脚本/版本，再触发允许的 GC；任务结束后复查 | 被 pin 的版本仍可读、任务不中断；新运行不能绕过 tombstone；资源与 pin 在终态正确释放 |
| typed error | 脚本 throw；页面断开、超时、旧 doc 再调用 | durable typed error，业务 data 不被转换为控制失败；失败无错误页面效果，不吞错误或空白结果 |
| 停止 | 在控制 Worker 中运行持续 CPU 脚本；点击真实停止；记录单调时钟和 Worker target | ≤3s target 真正销毁、CPU 后续不增长、存活 host 响应；结果终态与原因一致，不关闭 borrowed 页 |
| 关闭/重连 | 运行中关闭 host、杀 SW、重连；用原请求身份查询/提交 | 原 run/op/receipt/deadline 保留；未知效果不自动重放；不会生成替代成功任务 |
| 持久结果 | 成功、错误、取消各生成结果；刷新 host/重启 SW/重开工作台 | 原 run 结果可读且不会被后运行覆盖；undefined/false/0 按现唯一 codec 的持久类型规则投影 |
| 下载 | 工作台选择已完成结果，点击下载；查询原生终态，读取下载文件 | 区分 accepted 与 complete；完整磁盘字节 hash 匹配 artifact；Blob/URL/下载订阅回 baseline；cancel/interrupted 也清理 |
| 精确页面 | 同 tab 的 top/frame、同 URL 但不同 doc、导航后旧页回程 | 旧 doc/epoch/nonce 被拒绝；无需也不得读取全局 active page；导航 handoff 有新真实 Hello |
| 存储寿命 | persistent/session 各写值；同 namespace 重连、页面换 doc、浏览器会话结束 | persistent 持久；browser-session 在该会话内保留、会话结束清空；namespace 稳定而 doc grant 失效 |
| 共享服务 | 授权通知后真实创建；HTTP 各允许方法/错误/超时/撤权；network.info 默认关闭 | 通知原生回执；HTTP 投影、pre/post 规范化 URL 授权、硬 15s 或更早 deadline；业务 PageBrigeCode 永远在 data |

逐成员测试从已批准 603 case specification 和 source-behavior-map.md 取 ID/预期，按原用例交付，不把这张操作表变成替代分母。工具常量存在不代表 device handler 完成；wrapAsync 必须控制执行并给 typed error，formatJSON 不得 eval；getAppId 必须原子委托共享存储；指纹/vendor 依赖遵守已批准限制。

## 4. 页面 SDK 的独立 B05

原样扩展中先通过工作台授权页面 SDK，再固定注入 ISOLATED relay 与 MAIN entry，真实 SDK_HELLO 建立精确 document 通道。期间 controller run 数为 0。以 SDK 原公开入口调用 storage/HTTP，经原生 sender → 唯一 broker/authority/IDB → 静态短 driver → durable receipt → relay 回程。页 payload 不得携带可接受的 run/namespace/target authority；不得通过 registerHost/claimRun 获得权限。

保留唯一 `sdk/registry.js` 的 18 method allowlist、`SDK_HELLO`、`argsWire/valueWire`、共享 `page-port/codec.js`。测试只能固定测试数据和受控 HTTP 响应，不能替换原生 sender、伪造 Hello/grant、注入第二 broker 或添加测试专用 SDK 接口。

| B05 原生检查 | 可接受证据 |
| --- | --- |
| 100 同 ID/同 digest 并发 | 真实入站 100 个；IDB 只有 1 admission/1 sdk-service run/1 op；HTTP 写计数 1；100 个回程引用同身份 |
| 同 ID 改 method/params/version/deadline | E_REQUEST_CONFLICT，原记录不覆盖，无新 run/op 或额外 HTTP 写 |
| admission abort 时杀 SW | IDB 未 commit；HTTP 写 0；重连不宣称已有成功效果 |
| commit 未 dispatch 时杀 SW | 恢复原 run/op，最多一次原操作；原 deadline 不延长，HTTP 写 1 |
| dispatch 写成功、receipt 前杀 SW | 原引用为 E_EFFECT_UNKNOWN，重交原 ID 不新增 HTTP 写，不以 TTL/换 epoch 自动重放 |
| durable receipt 后、delivery 前杀 SW | 恢复原 durable 结果，仅重新交付；操作写计数仍 1 |
| 撤权/导航/换 incarnation | 旧 doc/grant/ID 拒绝；重新授权可恢复新通道，但不承接旧 pending/unknown；017–019 也保留 |
| 效果成功但回程失败 | durable service 结果与 MAIN 交付失败分别记录；unknown 保留，Promise settle 本身不足以证明效果 |

四个崩溃点必须观察到真实事件边界，再终止真实 SW。普通 CDP 轮询未命中边界只能记 not-tested；冻结包中没有可观察边界时，把必要观察能力交回 writer，不能用内存模拟/假 SW termination 补 PASS。独立 runner 的运行范围、命令和未闭环项以 `sdk-runner-notes.md` 为准。

## 5. 测试分层与执行责任

| 层 | 入口/命令（工程根目录执行） | 能关闭什么 |
| --- | --- | --- |
| 本聊天机制逻辑 | `node --test tests/framework/acceptance-evidence.test.mjs` | 检查器拒绝/接受规则；合成数据明确不可作为产品证据 |
| 只读准备度 | `node tests/framework/verify-product-acceptance.mjs` | 现有证据缺口；exit 0 表示成功读取，accepted:false 仍未验收 |
| writer 的定向模块检查 | 例如 `node --test tests/framework/k3-controller-authority.test.mjs tests/framework/k3-native-driver.test.mjs`；存储/SDK 改动只选相应用例 | 对应模块行为；新错误按真实输出修，不重新全库审计 |
| 原生组件资格/接线 | 已有 k3-control-native/k3-controller-native、native-idb-migration runner | 前两者生成测试扩展/改入口或 manifest，不能作为原样最终 production 的 F3；真实 IDB 也仍需同包产品链闭环 |
| 原样包 SDK | 新 `b05-product-acceptance-20261003.mjs` 命令见 sdk-runner-notes.md；旧 `k5-sdk-native.mjs` 的 `--mode=production --chrome=all` 入口由 writer 先迁移/核实 global launcher 后执行 | 原 native SDK 检查；当前 chrome all 是已配置的 138/154，154 是否当时 stable 需另附实际发现证据，不能凭标签猜测 |
| 最终证据检查 | `node tests/framework/verify-product-acceptance.mjs --candidate=<实际manifest.json> --full` | 检查完整性、实际文件 hash、包/ZIP/源码一致性、分母/矩阵/独立审查；缺项 exit 1，不修改台账或门禁 |

构建、浏览器、原生 runner 由唯一 writer 选择稳定候选后串行安排；本聊天不与其同时重构建/覆盖包/运行完整 UI 场景。当前 writer 完成产品修补后：

1. 运行受影响模块检查、源码检查和要求的 environment/package 变异检查，保存实际命令/输出/hash。
2. 通过原 `npm run build`、`npm run build:dev`、`npm run pack`、`npm run pack:dev` 重建；新构建回执位于 `docs/framework/evidence/f2-package-continuation/build-production.json`，不能误用旧 environment 构建快照。
3. 固定 production 目录、build/pack 回执与 archive；先在 fresh profile 验收上述基础链/B05，失败返回 writer 修补并重建。
4. 同一最终 production 候选跑原 603＋当前全部增项；保留历史 17/R1–R8、原生 FAIL/授权反例及清理证据。
5. 每个版本矩阵完成 1000 个不同混合轮次（success/error/timeout/cancel/navigation）、10 轮 host/SW 重连、2 轮插件禁用；6 个资源计数 before/after 均记录且回 baseline。记录持续增长检查，不只取末尾一个 0。
6. 未参与当前候选编写者先 architect 后 critic 审查同一包及原始证据。任何产品修改使原审查失效，冻结新候选后重测/重审。
7. writer 根据真实独立验收更新正式台账；本检查器只读检查。只有最终闭环才设置 F3/frameworkFunctionalMigrationComplete。

## 6. 可交付证据格式

以下是验收文件约束，不是新增运行协议。禁止把下面描述或单元 fixture 导出成原生 PASS。

**candidate manifest** 必须提供：

- `mode:production`、`packageDirectory:dist/production`、`packageHash`；目录 hash 沿用 `scripts/verify-package.mjs` 的 path-sorted `[{path,bytes,sha256}]` 的 UTF-8 JSON.stringify SHA256。
- `buildReport:{path,sha256}` 引用当前构建完整 sourceInputs、零 sourceDriftDuringBuild、对应 packageHash。检查器核对全部 src＋manifest/webpack/build/verify/package/lock/license 的实际字节。
- `packReport:{path,sha256}` 引用原 `docs/environment/pack-production.json`；`packageArchive:{path,sha256}` 引用原 production ZIP。检查器核 ZIP 的 hash/bytes、实际全部 entries 和目录包一致，不能仅凭 receipt 字段判定。
- `environments` 至少 minimum 138 与当时 stable：唯一 `id`、`role`、完整 `chromeVersion`、OS、fresh profile 路径、原生 extensionId、真实 browser `binary:{path,sha256}`/`binarySha256`；stable 的 `versionEvidence` 引用实际发现记录。这里的版本证据需独立评审确认时间和渠道。
- `supplementalCatalog:{path,sha256}` 绑定本轮固定 `supplemental-sdk-cases.json`（19 个继承合同预期，hash 固定在 checker）；与原 603 规格共同进入同一最终独立审查。本 catalog 本身未批准产品通过，不能临时改预期来适应输出。
- `resultReports` 为 hashed `{results:[...]}` JSON 文件引用；`campaigns` 各类为不同结果 ID 数组；原 case 不能冒充轮次，不同 campaign 不重复计数。每条成功记录都必须满足对应谓词，不能用一条成功记录掩盖已纳入的失败。
- `historicalClosures` 将全部 17＋R1–R8 逐条映射到实际必选 case IDs；其语义对应由独立评审核查。
- `productAuthors` 列所有参与当前候选编写者，身份必须为非空字符串，按 trim/NFKC/大小写规范化比较；`reviews` 当前候选仅且各有一位 architect/critic，均独立、同 package hash、APPROVE、无 blocker、startedAt/completedAt 和 hashed JSON 报告。critic 开始不早于 architect 完成，两位与作者均不同；历史评审另存，不能追加阻断报告却选第一条批准。
- 两份 review 与实际 report 都声明同一 `reviewInputsSha256` 和完整 `reviewedInputs`。由导出的 `reviewInputSnapshot` 或 strict `--full` 报告生成该输入清单，包含原/增项合同 hash、分母、当前 build/pack/ZIP、环境、作者、原始结果报告及结果内容 hash、capability evidence、campaigns 和历史映射。critic 再绑定 `architectReportSha256`。包不变但证据或预期变化也使旧审查失效；报告内引用也读取实际字节/hash。真实身份、作者来源、原始观察语义仍须独立核验。

**每个原 case、明确增项及 campaign result** 必须包含：

- 唯一 `id`、`layer:native-product`、`pass:true`、当前 `productPackageSha256`，`packageDrift:false`/`sourceDrift:false`，非空 `sourceHashes`（真实文件路径 → SHA256）。每个 case 都必须有 `contractSha256`：原项来自冻结 test-spec，增项来自固定 supplemental catalog 的完整 case JSON.stringify hash；source 按合同路径/hash 绑定。检查器读取这些实际源文件，不接受只填一个无关 hash；原项与增项 ID 不得相交。
- 所有环境的 `observations`：唯一 environmentId、preconditions、实际 input/expected/actual、pass、非空原始 `evidence:[{path,sha256}]`。false/0 是值；own undefined 以原 codec wire 保存。expected 必须来自冻结 case，而非测试后改成 actual。
- 每个 observation 的 `cleanup.before/after` 明确列出非负整数 `pending/timers/subscriptions/ports/workers/blobs`，各自回到原 baseline；raw evidence 要能解释计数来源与持续增长情况。
- 每个 campaign observation 有 `occurrence:{resultId,roundId,sessionId,startMs,endMs,evidence:{path,sha256},pointer}`。resultId 绑定当前记录；环境＋session/round 及环境＋原始文件 hash/JSON pointer 均不能复用。pointer 指向真实该轮定位 JSON 中相同 identity/时间字段；允许同一聚合日志中的不同片段，不允许同一轮换 ID 计数。原始 CDP/HTTP 流仍必须随 evidence 提供并由独立审查核实其原生关联。
- sdkConcurrency observation 的 `measurements`：requests=100、controllerRuns=0、admissions=1、serviceRuns=1、operations=1、httpWrites=1。
- sdkCrashes 的 kind 固定为 admission-abort/commit-before-dispatch/write-before-receipt/durable-before-delivery；各 observation 记录 controllerRuns=0、swTerminated=true、originalIdentityPreserved=true、原生 HTTP 写数（abort=0，其余=1）；write-before-receipt 要 outcome=E_EFFECT_UNKNOWN、replayed=false。
- downloads observation 的 `download`：state=complete、artifactId/runId/bytes/sha256、原生终态 evidence、实际磁盘 diskFile，以及 `artifact:{artifactId,runId,bytes,sha256,record:{path,sha256},payloadFile:{path,sha256}}`。record 是原生持久 artifact 描述（可用原 row.artifact 包装），payloadFile 是实际原 artifact 字节；源描述、payload、download、磁盘的身份/字节数/hash 全部一致。accepted 不是 complete，仅两个自填 hash 相同也不够。
- workerTermination observation 的 measurements：terminatedMs≤3000、workerIdentity、targetDestroyed、cpuGrowingBefore/cpuStaticAfter、survivingHostResponsive、borrowedPageClosed=false，全部有原生原始记录支撑。

原 603 与已批准 191 能力分母从冻结 round6 manifest 取；运行台账删除/替换分母被拒绝。全部当前增项也逐条检查。原 case/增项台账需 independently-accepted、pass 与同包 hash；191 能力需独立状态、runtimePass、同包 hash 和证据引用。限制项用已批准限制的反例验证关闭，不能当正向设备/MAIN 功能通过。

检查器验证文件存在、hash 和结构闭环，无法从自填 JSON 证明浏览器发生过效果或评审者身份真实。独立评审必须核原始 CDP、HTTP、IDB、磁盘和 UI 操作记录，按原合同判定行为。检查器、模块测试、F1、构建或工作台示范均不能替代这一步。
