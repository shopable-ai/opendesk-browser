# Protocol final — 独立增量复审

**结论：APPROVE，仅限本协议设计范围。9 项初审均关闭，PF-01 / PF-02 两项 delta 均关闭；当前剩余 P1 / P2 和 blockingDesignGaps 均为 0。**

本次只复核两项 delta，刷新完整 core / fixture / test-plan 输入 hash。其余 9 项关闭证据和上一轮字节/摘要/fixture 自校验结论保留；没有扩大探索、spawn、生产实现或产品测试。05 与 solution 整合 map 由主代理和另一 reviewer 处理，本报告不作综合放行。

“关闭”指设计合同及对应反例已相容且给出可实施规则。新增 PF02 testcase 仍是 planned / not-run，不能解释为 Chrome/IDB 产品通过。

## 本次两项关闭证据

### PF-01 — 原 P2，原阻断，设计层关闭

旧pagination-signature与其test-plan expected/reproduction已统一paused_unknown；补slot held、第二页0记录、0盲重试，与既有semantics/修复向量一致。raw+values签名包络与exact fixture未改。

原反例的当前结果：同URL同全页内容且无自然末页依据时，所有本轮对应输入只要求paused_unknown；不seal第二页、不completed、slot保持、0盲重试。前5行相同第6行变化仍应识别真正变化。

- [docs/contracts/semantics.md:79](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:79)：identity-independent raw+values签名及unchanged→paused_unknown保持。
- [docs/contracts/semantics.md:106](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:106)：明确统一旧场景，slot保持，不seal、不盲click，禁止另以failed期待同一输入。
- [contracts/fixtures/scenarios.json:557](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/scenarios.json:557)（至 573 行），JSON Pointer `/cases/30`：secondRepeatedPage改paused_unknown；repeatPage要求无末页依据/slot held/no seal/no retry。
- [docs/contracts/test-plan.json:2376](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/test-plan.json:2376)（至 2429 行），JSON Pointer `/scenarioCases/30`：复现、expected与新增assertion一致：slot held、second-page0 new records、0 blind retries。
- [contracts/fixtures/protocol-repair-vectors.json:305](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/protocol-repair-vectors.json:305)（至 317 行）：既有PIC06向量仍paused_unknown、secondPageVisible0、newClicks0。
- [docs/contracts/test-plan.json:4355](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/test-plan.json:4355)（至 4384 行），JSON Pointer `/supplementalCases/42`：既有修复映射仍对应同一paused_unknown预期。

已满足关闭条件：

- 旧/新相同输入只有一个相容状态预期。
- 未知时slot保持、0新增记录、0盲重试；签名算法及其fixture未改变。
### PF-02 — 原 P2，原非阻断，设计层关闭

单卷attempt abandoned加入delivery_failed聚合，优先于unknown/delivering；whole-job显式abandon原子标未决attempt abandoned且job保持abandoned。聚合限定已prepare非空attempt集，0attempt准备中保留preparing/ready。

原反例的当前结果：complete+abandoned以及abandoned+deadline_unknown（均无whole-job abandon）现在均delivery_failed；abandoned卷晚到complete仅审计，不复活原job/新job。0attempt不满足全complete聚合入口。

- [docs/contracts/semantics.md:89](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:89)：任意单卷abandoned/interrupted/conflict→delivery_failed；显式job放弃→abandoned并原子标未决attempt；late/tombstone隔离保持。
- [docs/contracts/semantics.md:106](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:106)：限定prepare非空集；0attempt准备态保持；两种混合组合failed，晚到audit-only。
- [docs/contracts/test-plan.json:5854](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/test-plan.json:5854)（至 5881 行），JSON Pointer `/supplementalCases/90`：PF02-complete-abandoned：两卷complete/abandoned，无整job abandon；late abandoned证据audit-only/newjob不变。
- [docs/contracts/test-plan.json:5883](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/test-plan.json:5883)（至 5910 行），JSON Pointer `/supplementalCases/91`：PF02-abandoned-unknown：两卷abandoned/deadline_unknown，无整job abandon；断言failed与late隔离。
- [docs/contracts/state-machines.json:289](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json:289)（至 294 行）：attempt放弃后固定abandoned，晚到只审计的既有规则未改变。

已满足关闭条件：

- 无活动下载且至少一卷abandoned不会回落delivering。
- abandoned+unknown优先failed；whole-job放弃仍abandoned。
- abandoned晚到complete只审计，新旧job隔离保持；0attempt准备态不错误complete。

**blockingDesignGaps：空。** 上一轮 REQUEST_CHANGES 记录保留在 JSON 的 reviewHistory；PF-01 不再阻断本协议及相关分页验收合同。PF-02 不再是未关闭观察项。

## 9 项当前状态

| 初审项 | 当前结论 | 依据 |
| --- | --- | --- |
| PIC-01 (P1) | 设计层关闭 | PageSnapshot持久保存sealIdentity/immutableSealAck；seal同事务写入历史累计计数与checkpoint；stop只改revision时原host可读历史ACK，target/epoch变更、host重载或tombstone拒绝，历史ACK不改当前Projection。 |
| PIC-02 (P1) | 设计层关闭 | beginPage先分配snapshot并预留readCommandId，prepare随后绑定不可变payload；sourceIdentity/readCommandId/readEnd固定，顺序与checkpoint CAS明确；0批空页有open入口及认证end依据。 |
| PIC-04 (P2) | 设计层关闭 | 旧A/B晚到回执隔离与whole-job abandon不复活保持；本次单卷abandoned→delivery_failed、优先于unknown/delivering，0attempt准备态排除全complete聚合，PF-02关闭。 |
| PIC-06 (P1) | 设计层关闭 | identity-independent raw+values签名及精确字节向量已修复；本次旧/新重复页输入与test-plan状态统一paused_unknown，slot保持且0新增/0盲重试，PF-01关闭。 |
| PIC-07 (P1) | 设计层关闭 | Projection.run允许null且idle pending为空；registerHost和snapshotRun绑定具体响应；slotAvailable取真实slot，idle不建立伪run。 |
| PIC-09 (P2) | 设计层关闭 | 新增quota/profile-quota专门interrupted转移；一般known-failure排除quota；stop先提交时保留stopping，未提交batch不ACK，已seal数据可导出。 |
| PIC-10 (P1) | 设计层关闭 | createTarget有持久TargetCreationIntent、creationId、session与exact bootstrap URL；取消/dispatch排序、最多一次tabs.create、bootstrap认证后才导航、0/多候选冻结、迟到callback归原retirement，以及never-created证据均明确。 最终新增initial navigation同日志准入和真实新文档握手进一步封住bootstrap→业务target间的效果边界。 |
| PIC-11 (P1) | 关闭，接受首版恢复限制 | Target/RetirementEvidence携带session/creation；同session有归属才numeric remove，跨session旧ID不授权关闭或认领absence。仅唯一包内bootstrap经真实sender可退役重绑；无唯一凭据的已导航target冻结、禁止自动恢复，已seal数据仍可导出。 |
| PIC-12 (P2) | 设计层关闭 | release与claim有对称slot-owner CAS；同runs+journal事务检查currentRunId/fencedEpoch/retirementId/releaseCount0，保存不可变结果、count1并清匹配slot；迟到重复只读历史。 |

以下既有关闭证据沿用上一轮；本次只更新 PF-01/PF-02 对应段，不重新作大范围审查。

### PIC-01

原S1 ACK丢失后S2+stop，规范返回保存的count6/pages1/S1/seq1，当前count12/pages2/S2不变。不同当前target/epoch时明确拒绝，未承诺跨导航或退役仍重ACK。

- [docs/contracts/schema.json:1586](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1586)（至 1628 行）：完整历史身份和SealAck均在PageSnapshot中有必需字段，open时可null。
- [docs/contracts/contract.json:193](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:193)（至 197 行）：seal事务保存历史ACK。
- [docs/contracts/semantics.md:77](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:77)：重复分支认证、允许与拒绝边界及S1/S2/stop计数已明确。

关闭输入：`PIC01-history-after-next-and-stop`、`PIC01-history-mutated-identity`、`PIC01-history-after-retirement`。
### PIC-02

D2身份不能向D1 sourceIdentity页写入；新sequence必须为committedPages+1，checkpoint预期不符拒绝；空页先open、dispatch read、固定agent证实end后0批seal。

- [docs/contracts/contract.json:298](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:298)（至 302 行）：先分配/预留再prepare。
- [docs/contracts/contract.json:65](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:65)（至 69 行）：[runId,pageSequence]唯一及read命令索引。
- [docs/contracts/schema.json:1561](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1561)（至 1628 行）：固定来源、readCommandId、checkpoint预期与readEnd。
- [docs/contracts/schema.json:2873](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:2873)（至 2919 行）：BeginPageRequest/Response具体结构。
- [docs/contracts/semantics.md:75](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:75)：分配、prepare、dispatch、新写身份准入、空页与已seal页checkpoint定义。
- [docs/contracts/state-machines.json:154](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json:154)（至 160 行）：absent→open由begin-page-CAS触发。
- [contracts/fixtures/protocol-repair-vectors.json:4](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/protocol-repair-vectors.json:4)（至 171 行）：0批完整Template/DOM/begin/openSnapshot/end和摘要。

关闭输入：`PIC02-empty-page`、`PIC02-empty-missing-container`、`PIC02-snapshot-not-created`、`PIC02-mixed-document`、`PIC02-sequence-checkpoint-CAS`。

第一轮增量曾发现beginPage要求已prepare命令而Command要求未分配snapshotId；已现场改为reserve→prepare，当前不保留该P1。
### PIC-04

A late complete只改变原A并保留timeout历史，B仍delivering；已整体放弃A不复活。 complete+abandoned以及abandoned+deadline_unknown（均无whole-job abandon）现在均delivery_failed；abandoned卷晚到complete仅审计，不复活原job/新job。0attempt不满足全complete聚合入口。

- [docs/contracts/contract.json:249](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:249)（至 253 行）：旧job聚合可变化、新job隔离。
- [docs/contracts/schema.json:1161](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1161)（至 1172 行）：ExportJob允许abandoned。
- [docs/contracts/semantics.md:89](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:89)：attempt+receipt+原job同事务聚合及冻结边界。
- [contracts/fixtures/protocol-repair-vectors.json:281](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/protocol-repair-vectors.json:281)（至 303 行）：旧A迟到complete/B不变与已放弃A仅审计。
- [docs/contracts/semantics.md:106](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:106)：限定prepare非空集；0attempt准备态保持；两种混合组合failed，晚到audit-only。
- [docs/contracts/test-plan.json:5854](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/test-plan.json:5854)（至 5881 行）：PF02-complete-abandoned：两卷complete/abandoned，无整job abandon；late abandoned证据audit-only/newjob不变。
- [docs/contracts/test-plan.json:5883](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/test-plan.json:5883)（至 5910 行）：PF02-abandoned-unknown：两卷abandoned/deadline_unknown，无整job abandon；断言failed与late隔离。
- [docs/contracts/state-machines.json:289](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json:289)（至 294 行）：attempt放弃后固定abandoned，晚到只审计的既有规则未改变。

关闭输入：`PIC04-old-late-new-job`、`PIC04-abandon-late`、`PF02-complete-abandoned`、`PF02-abandoned-unknown`。

PF02新增两案例实际位于test-plan supplementalCases/90、/91；不是protocol-repair-vectors的新文件案例。
### PIC-06

同URL同全页内容且无自然末页依据时，所有本轮对应输入只要求paused_unknown；不seal第二页、不completed、slot保持、0盲重试。前5行相同第6行变化仍应识别真正变化。

- [docs/contracts/contract.json:431](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:431)（至 434 行）：页摘要只取normalized pageIdentity和有序raw+values。
- [docs/contracts/semantics.md:79](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:79)：URL不含fragment、全页签名及unchanged的paused_unknown规则。
- [contracts/fixtures/page-signature.json:4](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/page-signature.json:4)（至 85 行）：基准canonical UTF-8、SHA-256与换snapshot/第六行变化向量。
- [contracts/fixtures/page-signature.json:87](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/page-signature.json:87)（至 152 行）：变化包络与精确hash。
- [contracts/fixtures/page-transaction.json:192](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/page-transaction.json:192)（至 208 行）：seal使用修正后的raw+values签名。
- [docs/contracts/semantics.md:106](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:106)：明确统一旧场景，slot保持，不seal、不盲click，禁止另以failed期待同一输入。
- [contracts/fixtures/scenarios.json:557](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/scenarios.json:557)（至 573 行）：secondRepeatedPage改paused_unknown；repeatPage要求无末页依据/slot held/no seal/no retry。
- [docs/contracts/test-plan.json:2376](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/test-plan.json:2376)（至 2429 行）：复现、expected与新增assertion一致：slot held、second-page0 new records、0 blind retries。
- [docs/contracts/test-plan.json:4355](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/test-plan.json:4355)（至 4384 行）：既有修复映射仍对应同一paused_unknown预期。

关闭输入：`PIC06-same-content-different-snapshot`、`PIC06-sixth-row-changed`。
### PIC-07

空DB登记可以返回run:null/pending:[]/slotAvailable:true而不建业务run；run:null并不自动推导可抢占slot。

- [docs/contracts/schema.json:2090](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:2090)（至 2156 行）：nullable Run及idle pending约束。
- [docs/contracts/schema.json:2844](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:2844)（至 2872 行）：RegisterHostResponse与SnapshotRunResponse精确绑定。
- [docs/contracts/contract.json:123](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:123)（至 127 行）：登记返回具体response且不claim。
- [docs/contracts/contract.json:221](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:221)（至 225 行）：snapshotRun严格嵌套Projection。
- [docs/contracts/semantics.md:81](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:81)：idle和可见旧jobs来源约束。

关闭输入：`PIC07-idle-projection`。
### PIC-09

第3批失败保持P0 count2/pages1/checkpointP0，P1 aborted、无b2 ACK；取消已先提交不被quota改为另一终态。

- [docs/contracts/state-machines.json:43](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json:43)（至 54 行）：失败分类与E_QUOTA专门转移。
- [docs/contracts/semantics.md:81](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:81)：quota/stop优先级明确。
- [contracts/fixtures/protocol-repair-vectors.json:346](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/protocol-repair-vectors.json:346)（至 374 行）：第3批quota与stop-first两个输入。

关闭输入：`PIC09-quota-third-batch`、`PIC09-quota-after-stop`。
### PIC-10

获准创建而ID未知继续占slot；迟到旧bootstrap只登记原退役目标，不绑定后继run；只有取消早于dispatch且无dispatch历史才可never-created。

- [docs/contracts/schema.json:2920](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:2920)（至 3051 行）：TargetCreationIntent提供state、submissionCount、dispatchAt、known tab/document、candidates、retirementId。
- [docs/contracts/contract.json:305](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:305)（至 316 行）：创建与只读对账公开接口。
- [docs/contracts/semantics.md:83](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:83)（至 85 行）：创建gap不重放，target:null不足以证明未创建。
- [docs/contracts/state-machines.json:318](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json:318)（至 348 行）：prepared/cancel/dispatched/unknown/known转移。
- [docs/contracts/semantics.md:104](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:104)：bootstrap→startUrl初次导航在同target-create日志独立admit，cancel/epoch/session/grant核后最多一次location.assign；gap不重放，真实新文档agent握手后才bind/read。

关闭输入：`PIC10-cancel-before-create`、`PIC10-create-gap`、`PIC10-late-create-after-fence`、`PIC10-creation-zero-or-many`。
### PIC-11

S2用户tab42不能被S1 retirement关闭，其onRemoved不释放S1 slot；唯一重识别的bootstrap只退役不恢复采集。

- [docs/contracts/schema.json:400](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:400)（至 423 行）：Target强制browserSessionIncarnation/creationId。
- [docs/contracts/schema.json:1891](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1891)（至 1937 行）：RetirementEvidence含session、creation、identityStatus。
- [docs/contracts/contract.json:557](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:557)（至 565 行）：明确unsupported automatic recovery、no numeric remove/release、exportable结果。
- [docs/contracts/semantics.md:85](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:85)：旧数字ID被无关tab复用/移除不能释放旧slot。
- [docs/contracts/semantics.md:91](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:91)：storage.session是保守扩展加载会话身份；所有入口await同初始化promise。
- [docs/contracts/state-machines.json:349](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json:349)（至 354 行）：session change时unknown、slot保持。

关闭输入：`PIC11-old-ID-reused-new-session`、`PIC11-restored-bootstrap-unique`。

扩展disable/reload/update或browser restart都会使session token重新生成；无唯一归属的已导航执行页可能使后续任务长期不可claim。首版明确不自动reset、删除或接管；结果导出仍允许。
### PIC-12

B的旧release即使有原absence证据，也不能写R2 slot；R1 releaseCount始终1，R3claim拒绝。

- [docs/contracts/semantics.md:87](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:87)：完整CAS和原子释放条件。
- [docs/contracts/schema.json:1903](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1903)（至 1937 行）：releaseId/releaseCount结构。
- [docs/contracts/state-machines.json:91](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json:91)（至 107 行）：未知与正常终态均使用CAS，duplicate不清新slot。
- [docs/contracts/contract.json:214](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:214)（至 218 行）：retireTarget公开幂等边界。
- [contracts/fixtures/protocol-repair-vectors.json:455](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/protocol-repair-vectors.json:455)（至 468 行）：A释放R1、R2claim、B晚到的反例。

关闭输入：`PIC12-release-late-duplicate`。

## 保留的设计边界与验证限制

跨 incarnation 没有唯一归属证据的已导航 target 首版明确冻结 slot、不自动恢复；已 seal 结果仍可导出。新 incarnation 或同数字 tabId / 无关用户 tab 的 onRemoved 不能证明旧目标 absence，也不赋予关闭权限；仅唯一包内 bootstrap 加真实 sender 能重绑为退役目标。此限制已接受，不重新作为设计阻断。storage.session 在 disable/reload/update/browser restart 清空的范围见 [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)；tabId session 唯一性见上一轮已核的 [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)。

原完整身份 seal ACK、beginPage reserve→prepare→dispatch、page sourceIdentity 固定、idle Projection、quota/stop 分类、target-create/initial-navigation gap 不重放、session fence、release CAS 等关闭结论继续有效。本次 contract/schema/state 以及 exact page signature/raw frame/repair fixture hash 未改变；semantics 中的聚合/统一规则、旧 scenario 和 test-plan 输入已更新。同期 solution-overview 更新只刷新完整 core hash，不作05/solution整合复审；相关四个 delta testcase 再次核对未改变关闭条件。

上一轮独立复算：3 个 stage 摘要及各 252 字节、合计 756 字节；3 个实际 raw data 帧各完整 canonical 670 字节；frame/end 身份、digest、rowStart/count/rawSignature 与 stage raw 相符；0批完整 Template/DOM/begin/openSnapshot/end 及空页摘要相符。canonical page signature、Template/Plan/Command hash 均一致，当前相应 fixture hash 未变。

上一轮 53 个本地 schema Pointer 可解析、16 个定向 keyword 探针无报错；不是完整 Draft2020-12/format 验证。22 个 repair case 有 test-plan 映射；migration 自校验通过（3 migration、29 strict-conversion、19 URL、45 CSV、9 rejection），明确 productConverterExecuted=false / chromeAcceptanceExecuted=false。本次未重跑这些验证，也未跑新增两 testcase 的产品行为。

本次的独立检查为实际文件交叉核对和原反例规则推演。未跑 Chrome、真实 IDB、下载/退役并发、故障屏障、lint/typecheck/build，未审核05/solution整体handoff。

## 完整输入 hash

快照时间：2026-10-01T20:23:21.482566+00:00。完整 core 包含以下 5 文件；fixture 树含 174 文件。

| 文件 | SHA-256 |
| --- | --- |
| docs/contracts/contract.json | `f0e6d74475dcae4148333f9397dd835889a79612027e65cf0004827917efd4bd` |
| docs/contracts/schema.json | `eb95f9e9a7e54048377d551acce8c996dcc15f5fa87ed7ada19cb21b24c6d9b9` |
| docs/contracts/semantics.md | `d3bd09974bc31e7dd88f41e226846f9e2871e95ad50bfdfd36f80739739134eb` |
| docs/contracts/state-machines.json | `0e10025550df39b1fa2b942dd6725a9d18c9388a916817598e103d112a322165` |
| docs/contracts/solution-overview.md | `d4da2d597547ff2890ab8529389344921626b178a48124ceeb9cbee638acc65c` |

core manifest SHA-256：`eb797c56d4e376ba917936de3d93fa16eb7101f38146cdaf9e3572e933f118ac`。
fixture tree SHA-256：`71c3c8bdbf669d13fab4d6ef7965250d131dc0f13236d8f644f2c5cb0db253fd`。

两个聚合摘要分别对排序后的 coreSha256 / fixtureManifest 对象用 UTF-8 Python `json.dumps(..., sort_keys=True, separators=(',',':'))` 后 SHA-256；完整 174 文件 manifest 保存在 JSON 报告。

| 直接相关输入 | SHA-256 |
| --- | --- |
| contracts/fixtures/scenarios.json | `d9e4a3569a6b2e806366b102787730d58414f7e42125c6600568612e8e490b7c` |
| contracts/fixtures/protocol-repair-vectors.json | `3dd64b804eb779401d80dc97938c93ad8d289b03ecc0df2da1f69b734acc63a2` |
| contracts/fixtures/page-signature.json | `6c8e3fa85b846cfd4e86b1a849d7765cc37826fd11a9639314ad5da14a49f118` |
| contracts/fixtures/page-read-frames.json | `be97624789f37e1bd36dc58ac5f4df5a0b4f7deec0a5248fe471ade9af6fff4b` |
| contracts/fixtures/page-transaction.json | `76933e856b419fec9ac5dc6ea83354365d2a4f005fc4e9996f9d9658e5c4f969` |
| docs/contracts/test-plan.json | `9f3829efb536aedaf6062f236a1b184fa5da567f8b001dea152c5d855598c9de` |
| docs/contracts/reviews/protocol-initial.json | `b9c8e25fb8e0cfa903915fd74c6fed3ba6e3435fcc03b59744b8670a9a621242` |
| docs/contracts/reviews/protocol-initial.md | `60814efd22f25016626bc72c3996bbe05f05cc94bf51b9e2815fb59b5714de38` |

仅刷新指定 protocol-final.json/.md；protocol-initial 两份报告保留原 hash。
