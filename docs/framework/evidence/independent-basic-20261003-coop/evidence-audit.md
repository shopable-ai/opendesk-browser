# 独立验收机制与历史证据审查

快照时间：2026-10-03T10:18:08.017910+00:00。工程：`/Users/shopme/Documents/workspace/opendesk-browser`。

**结论：正式 ledger 仍是 0/603；新独立 production Chrome 138 证据是三个定向场景 PASS。两者分开计数，F3、original603Closed、frameworkFunctionalMigrationComplete 均未关闭。** 三轮复验重复同三个场景，不能累加为九个独立合同用例，也不能直接回填冻结 603。

本审查只读合同、工具与落盘证据，继承已批准合同，不重审、不启动浏览器、不构建、不跑全模块测试、不联系其它聊天。仅写本文件及读取收据；源码写权、runner 和共享 gates/ledger/handoff 仍归旧 thread。

**最新包绑定**

production `dist/production`：18 文件，package SHA256 `552d3b3fe7cfb8f196142954659702b8440a6acf517e15bde959c7c7beff9f89`；本审查重新读取全部现有包字节计算，和三轮 environment/report 一致。development：29 文件，`1527fb90d335e70690aba5035cb933c1ad24a5ec8d3ea5397f57402eeaa6bc60`。算法为 path 排序 `{path,bytes,sha256}` 数组的 JSON 紧凑序列化 SHA256。

稳定重建的生产 ZIP 历史绑定为 `4723dafa7e50b3ea87ec264f757628e214d1346120c292d93e47820c0ef47254`（134974 bytes），开发 ZIP 为 `7c2eec9d6714edb947a8b66c182db18cf929d41fc3ed296c5eee9c6a96c01d58`（565480 bytes）；来自 [stable-rebuild-receipt.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/f2-shared-integration/stable-rebuild-2026-10-03T08-50-41.030Z/stable-rebuild-receipt.json)，本轮未重新构建或重验 ZIP。它是 F2 候选包绑定，finalProductPackageSha256 仍为空。

三轮均 `sourceDrift=false`、`packageDrift=false`、`launcherDrift=false`；before/after 源清单 SHA 相等。独立 runner 修订改变的是工具版本，不能描述为产品源码漂移。Chrome 完整版本 `138.0.7204.183`，binary SHA256 `f33ac0c54d6d277a5f0df5b266d8da3dc595981d78fdbec0577885f2c1b4540f`。

**本轮逐项证据有效性**

以下以 10:05 首个新独立 run 为可复核基线；10:07、10:08 重复相同三项 PASS。新 run 的主链确实到达真实产品入口、IDB durable 终态及当前结果 UI。

| 主链项 | 判断 | 精确证据 |
|---|---|---|

|保存 → r1 → 源 SHA256 → 版本选择 → 参数|PASS。`return 7;` 源 SHA `722b2d2fc48bada3fc8711f5242b324368d50be00f5910f7dbf769a782d84902`；参数含 false、0，revision 与所选源一致。|[case-SAVE-R1-SELECT-PARAMS.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-basic-20261003-coop/native-2026-10-03T10-05-25.019Z-982bb2b6/production-138/case-SAVE-R1-SELECT-PARAMS.json)|

|最小 JS → admission/run → return 7 → durable → 结果 UI|PASS。runId `ee8f6421-16af-416f-84b9-932f118a9100`，`completed`、`workerRetired=true`、`retirementState=released`，result valueWire:number 7；UI results 的 runId 相同。|[case-MINIMAL-RETURN7.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-basic-20261003-coop/native-2026-10-03T10-05-25.019Z-982bb2b6/production-138/case-MINIMAL-RETURN7.json)|

|owned goto → title/url → durable → 当前 UI|PASS，范围限最小 goto/title/url。runId `e3597f5a-3d81-426a-aff3-d63f145081d5`；title 为 Controller goto，URL role=goto，真实 HTTP GET、durable object 与结果 UI 一致。文件 ID 含 TYPE/CLICK/WAIT，但 input source 实际只执行 goto/title/url，不能据名称宣称 type/click/wait 已验证。|[case-OWNED-GOTO-TYPE-CLICK-WAIT-READ-RETURN.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-basic-20261003-coop/native-2026-10-03T10-05-25.019Z-982bb2b6/production-138/case-OWNED-GOTO-TYPE-CLICK-WAIT-READ-RETURN.json)|

|R1 pin → 保存 R2 → head tombstone|原始 FAIL 保留；在 borrowed select 前置失败，未达到 pin/R2/tombstone 产品断言。不能判该产品能力 FAIL。|[case-R1-PINNED-R2-SAVED-HEAD-DELETED.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-basic-20261003-coop/native-2026-10-03T10-05-25.019Z-982bb2b6/production-138/case-R1-PINNED-R2-SAVED-HEAD-DELETED.json)|


其余 21 项原始 NOT_TESTED：精确 borrowed/child 文档、false/0/undefined/own-undefined/true/business durable、真实下载、throw/rejection、多 host 竞争、stop fence、死循环 stop/deadline/host-close、同 profile 重开、无 scraping 记录和资源回基线。参数中 false/0 被保存不能替代它们作为运行返回值的 durable 测试；当前 UI 展示也不能替代浏览器重开后的持久化。

进程及 profile 清理证据有效：三轮 cleanup 都有 `pidAlive=false`、`launcherPidAlive=false`、`profileRemoved=true`、errors=[]，serverClosed=true。但这些不是每用例 timers/subscriptions/ports/workers/blobs 六类真实资源基线证据。

**三轮结果及失败归因（不改原始记录）**

| Run | 原始计数 | 审查归因与限制 |
|---|---|---|

|[native-2026-10-03T10-05-25.019Z-982bb2b6](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-basic-20261003-coop/native-2026-10-03T10-05-25.019Z-982bb2b6/summary.json)|3 PASS / 1 FAIL / 21 NOT_TESTED|`E_RUNNER_UI_SELECTION`：期望 borrowed，实际 owned，属于 runner select 前置失败；无产品 pin 结果。|

|[native-2026-10-03T10-07-28.674Z-1fec84be](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-basic-20261003-coop/native-2026-10-03T10-07-28.674Z-1fec84be/summary.json)|3 PASS / 1 FAIL / 21 NOT_TESTED|`E_RUNNER_UI_SELECTION`：期望 borrowed，实际 owned，属于 runner select 前置失败；无产品 pin 结果。|

|[native-2026-10-03T10-08-50.813Z-18783ed6](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-basic-20261003-coop/native-2026-10-03T10-08-50.813Z-18783ed6/summary.json)|3 PASS / 1 FAIL / 21 NOT_TESTED|`E_OBSERVATION_TIMEOUT: native CUA selection #script-target-mode`：CUA binding/select timeout，协调输入另报告 native permission wait；属于工具/权限前置阻塞，不是产品失败。raw attribution 写 product-or-native-contract 是宽泛默认值，不能据此归罪产品；保留 raw FAIL。|


10:08 轮此前三个 PASS 已独立落盘，后续 borrowed binding/权限前置失败并不抹除它们；新 profile 每次权限授权边界亦不能靠上一轮成功推断。本审查止于这些已完成落盘轮次，不等待或启动下一轮。

**历史原始 FAIL 与 F1/F2 证据边界**

首轮 [09:13 summary.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/f2-controller-product-native/native-2026-10-03T09-13-12.403Z-31778dfb/summary.json) 的原始计数为 0 PASS / 69 FAIL / 23 NOT_TESTED。[attribution-correction.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/f2-controller-product-native/native-2026-10-03T09-13-12.403Z-31778dfb/attribution-correction.json) 明确 rawRecordsChanged=false、productCasesReached=0：前三环境 native input 追加而非替换使 script ID 不匹配，属于 runner 输入及其级联前置；development154 SW bootstrap 尚未建立则 NOT_TESTED。不能把这批 raw FAIL 当成 69 个产品失败，也不能把原始 FAIL 改成 PASS。

同一历史父目录内随后 [09:28 run](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/f2-controller-product-native/native-2026-10-03T09-28-25.557Z-b00dcdb8) 两个 production 环境各 0 PASS / 1 BLOCKED / 22 NOT_TESTED：r1 已保存，但 actual permission/product admission 观察超时；不是产品执行失败。该目录无完整 summary 聚合，不能关闭产品验收。未额外扫描其它历史原生父目录。

K0/K1 已完成、K2–K5 in-progress、K6 queued；round6 候选 manifest SHA `da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1`。F1 审查/168→176 绑定及零漂移证明机制材料稳定，不等于 F3。[current-verification.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/progress-20261003/current-verification.json) 全文件解析遍历，其 243 个 basic、20 environment、syntax/package 历史 PASS 仅为静态/模块证据，本审查未重跑，也不能覆盖原生缺口。checkpoint 引用 SDK-native 60 PASS/4 NOT_TESTED 只作为继承状态；该 SDK 原生目录未在本轮独立重读，不能据此关闭 B05。

**验收工具检查及独立执行参数**

完整读取 [verify-product-acceptance.mjs](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs)、[b05-product-acceptance-20261003.mjs](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/b05-product-acceptance-20261003.mjs)、workflow、mechanism-verification、acceptance-mechanism-followup 和 sdk-runner-notes。fresh `node --test tests/framework/acceptance-evidence.test.mjs` 为 24/24 PASS，exit 0；只证明验收机制测试。followup 的 65 探针为历史机制修复证据，本轮未重复执行这些探针，不是产品 Review。

独立只读 `checkAcceptance()` readiness 完整结果已保存到读取收据：`mode=readiness`、`accepted=false`，original=603、additional=19、validCaseRecords=0、accepted=0，2724 条缺失/未闭合项。这些是正式验收结构缺口，不是 2724 个产品错误。新独立三 PASS 尚未形成冻结 case ID/合同 SHA/源绑定/正式 ledger 独立接受记录，所以不改变正式 0/603。

可立即独立执行的最小命令（不启动浏览器，不构建）：

```sh
node /Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs --full
```

无 candidate 的 readiness 即使 exit 0 也不能判通过，必须看 accepted/mode/counts。完整 readiness 报告已在收据中，避免只看终端摘要。

最终 candidate 已准备好时才执行：

```sh
node /Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs --candidate=/absolute/path/to/final-acceptance-candidate.json --full
```

`--candidate=` 必须用等号；传验收候选 JSON，不能传 extension manifest.json、native summary.json 或单个 case/report。该 candidate 要含 production packageDirectory/hash、buildReport、packReport、packageArchive、supplementalCatalog、environment/result reports、campaigns、历史闭合、作者与两份独立 review。candidate 模式 accepted=false 退出 1。候选缺失，本审查没有伪造一个只为跑 CLI。

checker 检查证据 bytes/SHA、合同/源绑定、完整原生环境、包及 ZIP 闭合、实际独立轮次、下载落盘与 worker 物理终止、review 全输入 snapshot，并末尾再读防并发改写。当前 checker SHA `e8aeaa949f982e8a72289b3f5bb990db6447417f2335e7ea8d0835b656760efc`；当前 B05 runner SHA `f8df5de0d74af39b9b07a0723b632cd063556515e175a2f6c4900647e736b263`，与旧 mechanism-verification 的 runner 版本不同。机制测试未覆盖完整真实 final candidate、所有 native campaign 指针和真实 ZIP/review 闭合分支，不能把修复 APPROVE 当成最终产品 APPROVE。

B05 runner 18 个 bounded slices 中 9 native-runnable、3 debugger-conditional、6 明确 NOT_TESTED；不能完整覆盖冻结 B05：CP1 admission active txn abort 缺实际切点；CP2/CP4 源 AST 切点存在只是静态定位；CP3 真 HTTP write gap 与 SDK019 prefetch/dispatched cut 不可混同；SDK017 全 epoch/regrant、SDK018 KV/result atomic、unknown 原 invocation ref、真实 old-context 回包和 per-case cleanup 仍有缺口。没有执行该 native runner，没有重复主线程 k5 runner 阅读。

历史 launcher SHA `1b92b98e7442fdeae88dae0277604aedccfe487cfb8b80d9adf479c725398a36`；当前 257-byte compatibility entry SHA `e9dfee561b6280eef106bd514f0835d0d5f9251919881c1d3cd15394430d8b74` 转交 `/Users/shopme/.codex/skills/chrome-testing-keychain/scripts/launch.py`。两文件均全字节读取并入收据；新三轮对当前 entry 有绑定。entry 自身 SHA 不覆盖委托 target 内容，历史 smoke 不可自动认证当前完整 launcher 链；此为工具证据范围限制，不是产品 FAIL。

**剩余 F3 门禁**

1. 同一最终 production 包覆盖原冻结 603 + 当前新增 19，191 capability bindings、完整 48 API/72 sources，各合同精确 ID/SHA/原生证据并正式独立接受；清除 NOT_TESTED/BLOCKED 缺口。
2. Chrome ≥138 最低版本与 stable 完整原生矩阵；重开同 profile 的持久化、真实磁盘下载 payload/bytes/hash/runId、逐用例六类资源回基线。
3. SDK 同 ID 100 并发只一 effect/result，四个实际 crash barriers 的身份保留、真实 HTTP 次数与 unknown 不重放；完整 B05/KV/storage/grant 恢复。
4. 1000 mixed success/error/timeout/cancel/navigation 独立实际轮次、10 host/SW reconnect、2 plugin disable，worker ≤3s 真实物理终止/CPU停止/存活 host 响应。
5. 原 17 失败点 + R1–R8 历史闭合、source/build/pack/ZIP 全包闭合；独立 architect 后 critic 两人（异于产品作者）对同包/全输入 snapshot APPROVE、零 blocker、critic 绑定前审；最终 checker accepted=true。

本报告不回填 ledger/gates，不生成 completion certificate，不以模块构建替代 F3；源码和共享状态写权仍旧 thread。

**完整读取收据与合同继承**

[full-read-receipt-evidence.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-basic-20261003-coop/full-read-receipt-evidence.json) 记录每文件大小、SHA256、完整 UTF-8 解码/逐行哈希；JSON 全文件 parse + 每对象/数组/标量递归访问的 node/scalar/type 计数及 pointer/value 摘要哈希；后续原生 JSONL 每非空行完整 parse/遍历。首批 64 文件及补充 176 文件读取快照均保留。图片记录全字节哈希，未做像素级验收。显示工具可能压缩长输出，机器读取与遍历未裁剪；本收据不是“每句文本语义重新裁决”的声明。

补充必读八份原合同如下，全部正文读取并生成逐行收据，继承约束，不重开设计审批。明确引用 `../evidence/upstream-v3` 解析到冻结工程根下 evidence，而非 outputs/evidence。原 progress/plan 的历史审批状态不覆盖当前已批准 K0/K1；轮次批准的修订按 round6 当前合同继承。

| 原合同精确路径 | bytes | SHA256 |
|---|---:|---|

|[/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/goal-constraints.md](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/goal-constraints.md)|7870|`d1cc79d6fbbc757004b07e256a3a544cfbd9e15e82a2be8a083c1667a86e51e3`|

|[/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/progress.md](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/progress.md)|6559|`50a194e5d4e5dd2ee7b58e3a57c9942da8a22365a1debc3f3e8d08832846df92`|

|[/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/execution-plan.md](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/execution-plan.md)|19540|`10b348b6811c13bf29bb0a5f0f289672ae70e20fa200fac810a1fdebce52fc35`|

|[/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/compatibility-delta.md](/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/compatibility-delta.md)|4221|`777fb115b7852b0c9b9102683e0fdc6a81271e48b367457d6e67005198c00b34`|

|[/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/protocol-contract.md](/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/protocol-contract.md)|8502|`33afffa92748ac1308d32a2ba1a883a196729704b9933cba7b5c3d0f59ceb7bc`|

|[/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/test-spec.md](/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/test-spec.md)|13767|`707d421df497f30e16edf47dbf7fe7f7f5daa77b91fa4fdcfdaf998f388056a4`|

|[/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/evidence/upstream-v3/test-spec.md](/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/evidence/upstream-v3/test-spec.md)|19377|`276bd53c687f737c888fa212887d19231132ae15b2ad30b3cd8e0c5e72b7ae1b`|

|[/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/evidence/upstream-v3/type-click-compatibility.md](/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/evidence/upstream-v3/type-click-compatibility.md)|1841|`602f9b63b685673bd6e18a54344bfdba2bed2bd4b8eb2613ae904d9b94708fb3`|


关键继承：普通 JS false/0/undefined/任意对象是结果；无 scraping/template/fee 依赖；save 的提交字节、CAS 与不可变 revision；明确 tab/frame/document，旧文档等待撤销；type 默认追加、空串不清空、click 历史 synthetic 语义；SDK 原子 admission/durable/identity、unknown 不重放、原 15s deadline；F4 scraping 与后续 OPT 不冒充 F3。

并发限制：报告只引用已完成三轮落盘证据，不覆盖其他参与者文件、不修改原始 FAIL。不做无证据产品失败判断；本次非最终独立 architect/critic 产品 review。
