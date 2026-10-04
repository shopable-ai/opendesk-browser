# K2 storage / broker 实作准备

本轮仅源码/旧日志只读核对；唯一新增文件为本文。未运行测试、启动浏览器或修改产品、原型、公共 gate。K1 最终源码/evidence 保持冻结；K2 产品写入仍待明确放行。依据已批准 M5-C1 round4 manifest `dd50a5098d247f594ab2234b9946c0004ce427ea8d6cb1abd130931c3bcecda1`，本次重新核 hash 相同；这是补丁准备，不是新方案审批或资格结论。

## 现有精确接口及接线缺口

以下路径均相对 `/Users/shopme/Documents/workspace/opendesk-browser`；行号为本轮读取位置。

| 位置 | 当前接口 / 行为 | 补丁接点 |
| --- | --- | --- |
| `src/platform/storage/index.js:10` | `createStorage({indexedDB,name='opendesk-browser',version=1,clock,admission,admitTemplate})`；同 factory/name 返回唯一 promise，配置不一致报 `E_VERSION`；返回冻结 service | 同库改为经过预备/备份的 v2 打开流程；保持连接唯一性，不在 SDK 再建库 |
| `index.js:31` | `transaction(stores,mode,work)`，mode 仅 readonly/readwrite；tx 只有 `get(store,key)`、`put(store,value,key)`、`delete(store,key)`、`all(store)`；承诺在原生 commit 后 resolve | 新 CAS、grant 重验、KV 效果及 receipt 复用此事务，不用内存 mutex 代替 |
| `index.js:28,41` | versionchange/close 清连接 registry；`rawBackup()` 返回 `{name,version,readOnly,stores:[{name,records:[{key,value}]}]}`，真实 cursor 保留 primaryKey | 已有全 store 一致快照，但没有快照 hash/恢复核验，也没有公开的“当前 schema 只读”打开参数 |
| `idb.js:4,28,76,92` | 10 个 store，均 explicit key；`installSchema` 只接受 version=1；`openConnection` 升级 abort 后保留原库只读；`transact` 用请求事件 queue/keepalive 支持 digest await | 分离 v1/v2 schema 和升级步骤；保留请求失败→整事务 abort、原始 cause 及 quota 映射 |
| `repository.js:64,227` | `createStorageMethods(service,{clock,admission,admitTemplate})`；`configureAdmission({admission,admitTemplate})` 改 hook；hook 入参 `{operation,request,tx,run,historical}` | hook 默认缺失也放行；现 hook 没有可信 sender/context，不能每次请求改全局 hook 注入身份 |
| `repository.js:234–312` | `saveTemplate(input,{admitTemplate})`；`listTemplates({cursor,limit})`、`getTemplateRevision({templateId,revision})`、`getTemplateByHash(hash)`、`renameTemplate({templateId,expectedNameRevision,name})` | save 在 templates+entitlements 同事务检查 parent/name CAS、原请求 digest、不可变 revision；复用这些原则，不能把 TemplateRevision 当通用 JS 源码模型 |
| `repository.js:313–429` | `beginPage({identity,requestId,readCommandId,pageSequence,expectedPageIdentity,expectedCheckpointSnapshotId})`；`stagePageBatch`；`sealPage` | 现 auth 事务内重读 run/host/target/revision/cancel；stage ACK 后整页仍不可见，seal 同事务固化 snapshot/run/immutableSealAck；保留原义务，不重写采集业务 |
| `repository.js:430–552` | `openReaderPin({runId,readerPinId?,sealWatermark?})`、`releaseReaderPin`、`readRecords`、`deleteRun({runId,explicitUserAction})`、`setRetention`、`cleanupRetention`、`preserveMigrationBackup({backupId,rawUtf8Backup})` | reader pin 是采集快照 pin，不是 script revision pin；delete 拒 slot/读 pin/未决 command/export/download。迁移字符串备份仅一条 journal row，不能代替 rawBackup |
| `src/platform/host/broker.js:10,102` | `createFoundationBroker({api,ports,clock})` 装配 storage/authority/target/pagePort/download/entitlement；`handle(message,sender)` 校验 protocol、实际 packaged tool sender、host，并另开 readonly tx 校验 payload.identity | 当前没有 SDK principal 分支；无 identity 的 reader/rename 等最终事务只靠未安装 hook。认证必须进入最终 CAS/效果事务，不能依赖先前 readonly 检查 |
| `broker.js:35,117,127` | dispatch 返回 `{accepted:true,state}`，后台执行；gesture 持久化；disconnect 用实际 getContexts 决定 documentGone | accepted 是 ACK；最终结果/送达分开持久化。真实权限、host/doc、grant 变化由主 writer 的 authority 接线提供，不采信 payload 身份 |
| `src/sw.js:1–32` | 仅 environment shell/health 的 onMessage/action/tabs listener；没有导入 broker 或 host port 接线 | 只由主 writer 接唯一 broker 启动 promise；storage 初始化/迁移失败不得发布可写服务、启动隐式执行 |

实际文件中没有 `tests/foundation/broker*.test.mjs`，该目录也没有直接 import broker 的测试。授权/控制 seam 在 `tests/foundation/runtime.test.mjs`（serial oracle），repository seam 在 `storage.test.mjs`（serial Map 模型），均不能证明真实 Chrome/IDB。`storage/regression.js:84` 有原生 IDB runner，但 host/target/read rows 仍为 seed fixture，且不是产品 startup 入口。

## 历史失败：直接证据与尚未证明的部分

旧日志 `docs/framework/stage0/baseline-foundation.log` SHA256 为 `a4b2d25ae2b76af1d648d5e04137325e88f1f8d2427cceb8a3cfdee0f5b9d9af`，与冻结 baseline 一致：115 case，98 pass，17 fail；本轮未重跑、未关闭任何 failure。

| 相关 case | 已确认的实际原因 / 最小处置 |
| --- | --- |
| `REGRESSION-HIST07`–`REGRESSION-HIST17`（11 个 storage case） | 日志均先报 `protocol.js:59` 的 undefined `$ref` TypeError，storageError 包成 `E_SCHEMA`（含 cause）。不是原生 IDB/quota 证据，也未走到应验证的整页隔离、duplicate、stop/seal、reader、空页、预算、删除断言。先接主 writer 的 R1 resolver 修复，再按原断言重跑，剩余失败才定位 storage 补丁 |
| `REGRESSION-HIST01/02/03/04/06` | 同样直接记录 R1 TypeError；HIST03 期待 `E_TARGET` 却先遇 TypeError。dispatch/revoke/unknown 不能因此判成功或判机制不可能；复用 writer 的协议修复后验证 storage/journal 边界 |
| `REGRESSION-HIST05` | 日志仅证明 short ACK 的 `accepted` 为 undefined。源码 `page-agent.js:159` 在 respond accepted 前 validate Command，`178` 捕获错误回 `{error}`；因此 R1 导致前置拒绝是源码支持的推断，旧日志未保存 ACK error 本体。该 agent case 不扩入本准备范围，保留给对应执行者复验 |
| `REGRESSION-R1-pointer` | resolver 用 `$ref.split('/').at(-1)` 只查 `$defs`；真实 nested ref `#/$defs/TemplateRevision/properties/list` 被错误解释成 `$defs.list`。完整 root JSON Pointer/转义/循环保护是主 writer 协议前置补丁，K2 不另建 validator |
| `REGRESSION-R2-unknown-properties` / `REGRESSION-R7-invalid-date-time` | properties 用继承属性查询，`toString` 可误当已声明；canonical 已拒 constructor/prototype/__proto__，不能声称这些键全部绕过。date-time 仅前缀+Date.parse，可归一化不可能日期/接受无时区。主 writer 修 own-property 与严格日历/时区验证；storage 只消费 typed 校验结果 |
| `REGRESSION-R3-host-gone` | `authority.js:214` 将 host inactive/run interrupted，slot 未退休；fence 要实际 active 原 host 且 registrationId 相同，新 host 无恢复入口。最小 storage 接点是 writer 授权的 replacement/reconcile 在同事务写 fence/retirement/slot；不让新 payload 自封旧 owner、不自行设计 target 接管协议 |
| `REGRESSION-R4-control-states` | loseHost 可覆盖 stopping/paused 状态；stop 可把 retiring 改 stopping；跨 session recover 遍历非 terminal，包含 retiring。writer 冻结转移表后，在这些事务入口守卫并保持 finalState/retirement receipt；同事务 CAS 防迟到控制消息覆盖 |
| `REGRESSION-R5-terminal-fence-gap` | finishRun 先提交 terminal，再独立 read/fence；recover 不补 terminal 的 retirement，崩溃留下 held slot。最小提取 `fenceInTransaction(tx,...)`，terminal/fence/retirement 同 commit，或 writer 指定的 durable intent+幂等恢复；不能靠 startup 直接释放 slot |
| `REGRESSION-R6-false-completion` | finishRun 信任 caller naturalEnd=true，只检查未决 journal/open page；未要求实际绑定或 authenticated result。writer 完成来源判定后，K2 在同事务提交原 result 引用与 terminal/fence；合法 generic undefined/0 无采集 row/seal 也可完成，不能补“必须采集一页”的旧条件 |
| `REGRESSION-R8-journal-key-collision` | authority prepare/dispatch/markUnknown、repository begin/readEvidence、regression fixture 直接以 commandId 操作 journal；与 `host:<id>` 等 metadata key 冲突。`commandJournal.commandId` 还是全库 unique index，仅加 key 前缀不足以允许两个 run 同名命令。所有新写/查统一消费 writer 的 canonical namespace key；v2 将该 index 改成 run+commandId 唯一组合，metadata sparse 不参与 |

R3–R8 原复现来源为 historical mapping/scope checkpoint，以上函数缺口仍可在当前源码定位；本轮无 fresh 动态复现。旧 checkpoint 引用的 `work/review-authority/repro.mjs` 当前不存在，不能宣称读到或再次执行过它。17/R1–R8 保留原记录和 caseID，不能删、skip 或把主因修复当全项 closure。

## 放行后的最小补丁先序

1. **消费主 writer 的协议/授权边界，先不动数据。** 使用其 codec、canonical key 和可信 sender/grant context；R1/R2/R7 由该底座提供。K2 只补 repository 的 per-call trusted context 参数及 tx-aware admission 接点；未安装 production admission 时 fail closed。不要用可变全局 hook 或 payload.namespace/identity 传权限。内部维护/测试 fixture 的 trusted 入口显式隔离，不暴露为网页 route。

2. **v1 预备→完整备份→关闭→同库升级。** 先打开已有 `opendesk-browser` v1，禁止业务写入；用 rawBackup 的单 readonly cursor 快照导出全部 store 的 explicit key/value，按主 writer 的可逆编码核对快照/逐 store hash，保存可校验恢复材料后关闭 v1 connection。非字符串 key（number/Date/array/binary）保持类型与字节，不用 String(key)、getAll 值数组或旧 JSON 导入替代。`preserveMigrationBackup` 的 rawHash 是 `digest(string)`（canonical JSON 字符串 hash），不是原 UTF8 文件 hash，也不是全库快照 hash。

3. **`idb.js` 明确 v1→v2。** 新库直接建立当前 v2；已有 v1 在 versionchange transaction 中保留原 10 store、现有 explicit key/value，新增 `scriptHeads/scriptRevisions/results/frameworkKV`（null keyPath、autoIncrement=false），复用 artifacts；grant/admission/op/host 仍在 commandJournal 的独立 tag/key 空间。变更 commandId 唯一索引为 `[identity.runId,commandId]` 并验证 schema；新记录按 namespace 写，旧 raw key 记录保留只读，不凭裸 ID fallback 授权或 replay。不能迁到第二库、重命名旧 key、清库或自动修坏行；冲突/升级异常 abort 保留 v1。

   `onblocked` 当前 reject 后 open request 仍活着：旧 connection 后续关闭时可能继续 onupgradeneeded。在已结束/取消的 request 的升级回调先 abort，onsuccess 仅 close；保留 blocked 状态与旧数据。升级失败自动 recovery 只读；升级成功后的诊断入口用支持 v2 的实现显式 readonly（包括 rawBackup），禁止旧 schema JS 回写。versionchange 继续 close/清 registry；失败后的 registry 可重试，不发布半初始化 broker。

4. **`repository.js` 新增小接口，保留旧 repository。** 方法名属建议接点，字段/codec 使用已批准合同与 writer 的实际定义：

   | 建议接点 | 单事务要做的事 |
   | --- | --- |
   | `commitScriptRevision(context,input)` | 真实 trusted namespace；源码 UTF8≤128KiB，hash 对原 bytes；immutable revision+head expected revision CAS 同 commit。CAS loser 不改 head、不遗留孤 revision；不以 `digest(sourceString)` 冒充原 bytes hash |
   | `pinScriptRevision(context,input)` / `releaseScriptRevisionPin` / tombstone & GC | run/op 准入和 exact committed revision/hash pin 同 commit；r2 仅改 head；删除 tombstone 保留在途 r1 字节。GC 同事务检查在途 pin/awaiting delivery/unknown，不能凭 TTL 清 unknown |
   | `commitResult(context,input)` / `getResult` | 用 writer outcome codec 固化 success/error、data presence，保留 false/0/null/undefined/业务对象。结果引用、op 状态与效果事实一致提交；ACK、delivery failure 不覆盖已成功 effect/result |
   | namespace KV `get/set/remove/clear` | frameworkKV explicit tuple key 含可信 namespace。AppStorage 写 String(value)，missing→null，set/remove/clear success→undefined；service.storage 保留 typed JSON，missing→undefined，get(null)仅该 namespace 值数组。clear 只枚举并删该 namespace 用户键，不碰 metadata/其他 namespace/全库 |
   | admission / storage effect tx 接点 | writer 定义的 `(principal,tab,frame,document,grantIncarnation,requestId)`+typed canonical digest；同 journal/readwrite tx 重验 grant，再分配唯一 run/op/admission。同 digest 关联原 pending/durable/unknown；异 digest 在分配/写之前 `E_REQUEST_CONFLICT`。KV 效果、receipt/result 在同事务提交；不把普通未派发 SDK op 按旧 dispatched command 一律 markUnknown |

   现 `auth`/immutableSealAck/reader watermark/配额失败后小事务持久 abort 原样保留。补 storage identity/context admission 时不能让错 host/epoch 的请求 abort 正主 open page；历史 duplicate seal 要验证原归属并返回原 ACK，不能改成当前累计 ACK。

5. **broker 只接唯一底座。** 最终 route 的可信 context 进入上述事务，重读 grant incarnation/host active/run revision/cancel/tombstone；外层 authenticate 不能替代。SDK 使用 writer 的静态 sdk-service 准入，不伪造 registerHost，不依赖 template/entitlement/采集 seal 或占 `@slot`。K4 facade/relay 不由本准备实现。主 writer 接 SW/真实权限变更及 host 生命周期，K2 补持久 CAS/fence 事务；HTTP/native 外部效果的 dispatch-gap 状态由共同合同决定，不盲目 replay。

## 只验证相关合同，不扩大任务

放行后依次执行，当前全部尚未执行：

- 先 targeted unit：`storage.test.mjs`、实际 `runtime.test.mjs`；保留 `REGRESSION-HIST07`–`17` 原断言，增加 tx 内撤权/CAS/journal namespace 故障点。协议 writer 交付后验证 `REGRESSION-R1/R2/R7`；其余 R3–R6/R8 只验证与持久状态有关的接点。HIST02–04 的实际 Chrome 调用由对应执行者共同验证，HIST05/06 agent/preview 不复制实现。
- 真 IDB：`SVC01-IDB-TRANSACTIONS`、`SVC01-IDB-RECOVERY`；abort、blocked 后旧连接再关闭、versionchange、真实并发 CAS、quota、SW stop/restart、unusual key 快照恢复/前后 hash。旧 `regression.js:129–138` 的“10 store/v2 必须失败”是旧 v1 harness 条件；新增受批准 v2 的成功与注入升级 abort 验证，旧 evidence 不改写，也不以简单改预期冲销失败。
- revision：`USC02-REVISION-PIN`，实际 r1 运行期间 CAS r2/删除/释放；保存原 bytes/hash/pin/最终 result。当前采集 readerPin 不计为此 case 通过。
- storage/SDK 接点：`CMP07.F004.AppStorage.{setItem,getItem,removeItem,clear}`、`CMP07.BG.APPSTORAGE_{SETITEM,GETITEM,REMOVEITEM,CLEAR}`、`CMP07.BG.service.storage.{get.key,get.all,set,remove}`。与 K4 真实入口接线后才证明 Promise facade，K2 单独证明 tx/namespace/effect/receipt。
- admission/recovery：`B05-SDK-NO-CONTROLLER`、`B05-SDK-FOUR-CRASHES`、`B05-SDK-GRANT-GC`；对应细项 `B05.SDK.no-controller`、`B05.SDK.100-concurrent`、`B05.SDK.crash.{before-admission-commit,after-admission-before-dispatch,after-effect-before-receipt,after-durable-before-delivery}`、`B01.SDK.outcome-shapes`。分别记录原 run/op、实际效果数、receipt、delivery；100 并发和四个真实 SW crash 不用 serial Map 结果代替。

交接仅需主 writer 提供已落地的 context/codec/journal key 与状态定义以及实际 K2 写范围；本准备不重规划协议/target、不修改公共 approval/backend/F2 状态。上述 tests、源码补丁与 Chrome/IDB 执行均留到明确 K2 放行。
