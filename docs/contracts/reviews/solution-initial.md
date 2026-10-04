# OpenDesk Browser 独立初审

**REQUEST CHANGES｜架构状态 BLOCK｜1 项 P1、1 项 P2。** 审查快照：2026-10-01T19:35:43.636377+00:00。

**快照后更新。** 2026-10-01T19:52:23.689688+00:00 写后检查确认最新test-plan含54个supplemental case，coverageSummary也为54，hash为 `a60cd338879498939333215cbdae6f425468d53f339163525c17beecb696eb03`。合同/schema/语义/状态机/精确fixture/oracle及registry亦已变化。**本报告P1/P2是19:35初审快照发现，不判断它们仍存在于后续版本，也不自动宣布闭合**；交主代理protocol增量结论与⑤合并后的聚焦final处理。未新增探索或执行产品测试。

本轮聚焦框架方案、任务DAG/owner、迁移可审查性和测试证据边界。未实现生产代码，未执行产品测试、普通Chrome验收或框架跑分。下面两项是跨文档接口/精确oracle发现，交主代理与独立protocol增量复审归并，**不重复计数或宣布既有8项protocol阻断闭合**。⑤仍未供审，初审不等待它或产品完成。

已核 [权威registry](/Users/shopme/Documents/Codex/2026-10-01/browser-automation-platform/outputs/goals/v4-thread-dispatch.json) 内容版本 **v5**：**01→02A→02B→03→04**；02A `01a0f8b7-c03d-7460-b3dc-c7f2df804b60`，02B `01a0f8dd-77cc-7ec2-97a6-71daf39029d4`。⑤必须在01 ready前被审阅合并。初始调度状态不能代替真实handoff或实时完成。

## 需归并闭合的P1/P2

### SOL-P1-01：原页面选区/取消/未保存draft预览的公共接口仍缺调用合同

**证据。** [contract.json:379](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:379) 的 `sourceSelection` 只说明权限/目标绑定/固定异步入口；[schema.json:1836](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1836) 的 `SourceSelectionContext` 是授权上下文。正式 [PagePort methods](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:426) 仅有 `readPage/nextLink/nextButton`；preview只有语义说明，没有source选区开始、取消、结果/事件、释放或draft预览的具体输入输出。

[semantics.md:64](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:64) 区分正式stored-template准入和source preview，第68行将桥归02B、SelectorUI归03；[framework-decision.md:53](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/framework-decision.md:53) 同样要求领域使用获批适配。**owner已定，跨owner输入输出未闭合**。不是要求新增独立bridge对象，扩展现有PagePort即可。

**影响与最小修法。** 高置信推断：02B、03仍需另行商定公共协议，或03自行补特权桥/借正式Identity，均使固定模块槽交接不可独立实现。阻断01设计ready及02B→03合同交接，影响M02/M03/M09。01补source context真实绑定、开始/取消/释放/draft预览签名及schema，规定requestId/selectionId与真实host/tab/frame/document认证、取消迟到、导航失效、幂等清理及仅清自有overlay/listener。draft经同compiler/只读raw reader预览，不能借正式run准入、翻页或stage/seal。无需第二owner/DB/bridge。

**闭合断言。** 沿用 `M02-classic-selection`、`M02-two-windows-race`、`M03-css-missing-empty`，补“取消迟到不覆盖新选择”“source导航后上下文失效”“有效未保存draft可只读预览、非法draft拒绝”的精确正反例；同步合同/hash/fixture/handoff。规范闭合与随后实现/Chrome通过分别记。

### SOL-P2-01：重复页签名把snapshot身份混成内容变化

**证据。** [semantics.md:15](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:15) 定义recordKey为snapshotId:rowIndex，同时要求完整raw/values内容签名检测同URL按钮分页。精确 [fixture](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/page-transaction.json:43) 的records含P1:* recordKey；[test-plan.md:192](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/test-plan.md:192) 和 [verify-contracts.py:134](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/verify-contracts.py:134) 直接hash完整records，没有稳定内容投影。

主审只读复算六行fixture：URL、raw、values和行序不变，只将recordKey P1:*改为P2:*：

| 输入 | SHA-256 |
| --- | --- |
| 原fixture，等于seal.pageSignature | `87a410292821abdb761ecce2187c0e7a43ac8840078c4f03774f43addad202f1` |
| 只换snapshot派生recordKey | `3565eb822ca156c363e5d47678a92074f7a06e4c74442d3dbf35735de6c658a7` |

**影响与最小修法。** 若按oracle实现，相同URL/内容在新snapshot被判成新页，可能重复采集至预算限制，违背pagination-signature。阻断01合同/fixture一致性，影响M05/M06。明确稳定内容投影，例如按行序 `{rowIndex,raw,values}`，排除recordKey/snapshotId/运行身份；stage digest仍绑定snapshot和完整记录，seal请求digest仍绑定请求身份。同步规范、精确向量/hash、test-plan、静态oracle与影响ledger。

**闭合断言。** `pagination-signature`、`M06-seal-validation-watermark`、`FX-PAGE-allSealed`：同内容跨snapshot签名相同，仅第六行raw/typed值变化签名不同。独立复算向量，不把合成反例或静态修复称产品分页测试。

## 框架推荐与实际迁入面

**原生MV3 + JS ESM + 现有锁定webpack/Terser** 在单Chrome产品、保留有效HTML/JS、限制新增依赖的约束下合理且可撤换。旧high稿重写或xhigh标签不构成结论依据。文档已说明WXT不强制TS/UI框架；未见伪造跑分，但也没有WXT实际构建或性能优劣数据。[框架决策](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/framework-decision.md:3)

[WXT官方ESM说明](https://wxt.dev/guide/essentials/es-modules.html) 说明content/unlisted的IIFE能力；[webpack output.iife](https://webpack.js.org/configuration/output/#outputiife) 说明包装配置。文档能力不代替最终包、无chunk依赖或浏览器行为验证。

主审确认ListSelector来源hash匹配探针；两份实际产物bytes/hash匹配并经Acorn Script AST解析，无模块声明/动态import，各一个顶层statement。未压缩124873字节、压缩45146字节只是**产物尺寸**。VM loading初始化与evaluation-result=undefined是作者记录，主审未重跑VM。真实选区、取消/清理、严格CSP、Chrome scripting、压缩前后完整行为等价均未验证；未安装/构建WXT。[classic-probe.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/classic-probe.json)、[框架边界](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/framework-decision.md:28)

02A需交可复建配置/命令/入口hash/工具lock与最终产物检查；临时probe文件和元数据不够证明独立重建。该补证属于实施测试，不额外抬为设计阻断。

保留布局/CSS/有效交互不等于原JS整份搬入。来源账本33项：保留8、改造20、不支持5，runtimeVerified全部false。旧activeTab/sender/事件桥、取消、模板revision/同compiler、字段/导出列一致、stage/seal、stop/unknown与回执仍需适配。可追溯修补点包括SEL-03取消、FLD-03共享URL/无表头、PRE-01改JSON未重提取、PRE-02显示列与导出不同、CFG-03旧selector覆盖容器、CFG-04结果反推配置。[source-audit.md](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-audit.md:101)

没有工时/性能/迁移成功率证据，不能靠行数或probe大小估算成本。⑤真实关系与02B migration-ledger须逐项keep/adapt/drop、source hash、公共/领域owner及测试闭合；不整bundle覆盖、不复制历史Vue/Quasar页作为默认方案。

## 九类任务、DAG和作者边界

最新任务有**9类、11包、29依赖边，无环**，owner/input/output/test/blocker字段完整；ENV三项在恢复后的test-plan有定义。没有另一个有充分证据的工作包结构阻断；P1/P2是跨包合同问题。[task-breakdown.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/task-breakdown.json)

| 类别 / 包 | Owner、依赖 | 输入 → 输出 | 测试与阻断 |
| --- | --- | --- | --- |
| 来源 / WP01 | 01 | 三来源、dirty/hash → 快照/ledger/行为许可表 | M01；来源代、⑤合并 |
| 工程 / WP02 | 02A；WP01 | 01合同/hash/⑤认可映射 → 单包/窗口/静态槽/environment handoff | ENV-build-package/window-singleton/health-static-slot，M02/M09；01 ready、无动态fallback、根移交 |
| 模板/编译/预览 / WP03 | 03；WP04/05/07A/08A | 02A+02B真handoff、三迁移向量、来源UI → 选区/模板/同compiler/备份补全 | M02/M03、三迁移类/falsy-long-notitle；P1、真实底座/source diff |
| Run/权限/stop / WP04 | 02B；WP02/05 | owner/command/target规范 → slot/真实sender-document/短ACK/unknown退役 | M07/M09、stop/gap/epoch/retire；target未证实消失不释放 |
| IDB/seal/配额 / WP05 | 02B；WP02 | schema/三批向量 → DB1/模板/reader pin/事务迁移 | M03/M06/M10、stage/seal竞态；真实IDB、无领域DB、P2 |
| 分页/数据 / WP06 | 03；WP03/04/05 | RulePlan/PagePort/控制DOM → 同源分页/签名/预算背压/run隔离 | M04–M07/pagination-signature/budget-plus-one；P2、unknown不重放 |
| Artifact/导出 / WP07A+B | 02B公共、03格式/UI | 导出合同/测试formatter/sealed游标 → pin/attempt/receipt/分卷反馈 | M08/mapping/late/reexport/volume；真实Blob/gap、只唯一候选绑定 |
| 授权/保留 / WP08A+B | 02B公共、03反馈 | 授权删除协议/底座投影 → 签名/预算/快照/tombstone/结果取回 | M10/entitlement-exports/storage-delete-retention；私钥不入包、商业另门禁 |
| 集成 / WP09 | 04；全实现包 | 02A+02B+03真handoff/最终单包 → Chrome矩阵/控制站点/授权列表/report | M01–M11；前序partial或缺Chrome不得passed |

JSON附每个工作包完整inputs、outputs、tests、blockers及writeScope。

02A创建root build/manifest、工具壳/静态槽后结束共享写；02B接管root/公共合同、RunHost/SW/platform/固定agent；03只scraping领域/UI并按handoff接管固定入口；04归因后串行修复。02A环境通过不能跳过02B或放行03。[implementation-plan.md](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/implementation-plan.md:3)

运行依赖：UI→公开RunHost/模块；独立RunHost loop→领域runner→PagePort/storage/runCommands；PagePort→SW→固定agent；唯一storage拥有持久事实。领域不新建owner/broker/ChromePage/DB，UI不拥有loop。source能力由02B公共桥提供，缺口见P1。

## 非阻断待实现测试与证据边界

- **02A**：真实lock/build/pack/资源/CSP、单窗口/健康静态槽/MODULE_NOT_INSTALLED；classic可复建配方与最终产物。只证明工程环境。
- **02B/03**：普通Chrome双版本选区、another-table、取消/清理/导航/两窗口target隔离；同fixture压缩等价。P1闭合后source draft/迟到/失效向量。
- **03**：三类迁移备份原字节、缺URL/row/分页拒绝、不执行代码；改selector重读DOM而不反推模板；共享href/src及无表头不丢值。建议测试名 `PROPOSED-REG-PRE-CFG-edit-rerun`、`PROPOSED-REG-FLD-shared-url-headerless` 不是已实现case。
- **02B**：stop/dispatch gap、sender/document/epoch、host关闭/冻结/自然SW失联；真实IDB stage/seal、配额/readers/重开/迁移失败；真实Blob下载mapping/deadline/late/reexport；签名72h/回拨/到期/撤销及既有结果。
- **02B+03**：M05/M06内容签名、末页/empty依据、预算+1、两个run、10页×100行；M08列序/类型/中文/公式安全/8MiB整行分卷/hash与逐卷回执。
- **04**：最终生产单包M01–M11，普通120和执行当日Stable分别完整版本/频道/binary/profile留证；控制站点race及明确授权真实列表全旅程。不能制造的native quota/disk/SW等精确pending。

本轮只读核442快照文件bytes/hash，证明固定18:29代完整性，不证明后来三个来源没有变化。未运行会改写artifact-validation.json的verify-contracts.py。静态fixture/参考hash/自校验、mock、CFT和本机plist元数据不能代替普通Chrome产品验收。下载前Artifact hash与Chrome complete也不证明此后磁盘存在或扩展读取磁盘hash。

## 外部与发布门禁、AI和桌面

**⑤外部设计前置：pending，独立阻断01 ready/02A release。** registry、task externalDesignDependency和plan phase01ReadyDependency一致要求01审真实source hash、关系图/复用、browser-flow、回归impact-test ledger。尚未供审，不能把工具安装、图存在或候选测试列表冒充交付。主代理逐finding映射02A/02B/03、fixture/test并解决冲突后再做聚焦final。

**source许可：独立发布阻断，不单独阻断设计审查。** todo有许可正文；core仅有ISC元数据且scope未含全文，不能推断原仓无许可；扩展本体/权属、手改编译链与实际分发vendor/素材/字体授权未证明。未知不等于已判侵权。逐实际带入项source hash、权利人、完整许可/授权、修改链、NOTICE和发布核准补证；未核准项替换或不分发。[source-audit.md:399](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/source-audit.md:399)

**AI/桌面边界当前可审查。** 首版AI不在执行路径、不上传页面/token、不生成执行脚本、不代替校验或许可；未来建议只作确认的数据草稿。桌面仅未来独立PagePort/Artifact适配，须另审权限/生命周期/部署；首版无nativeMessaging、本机host、Android/HID、后台续跑或第二owner/DB。[solution-overview.md](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/solution-overview.md:68)、[framework-decision.md](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/framework-decision.md:63)

**M12商业：独立pending。** 技术授权、source分发许可、真实需求/付费试点及签发撤销运营是不同证据。M01–M11通过也不能宣布收费ready；没有真实收费接入或产品测试通过。

## 快照与后续聚焦复审

作者审查中修订registry/task/tree/实施计划及测试计划；已重读v5与恢复后的完整JSON。曾观察test-plan.json暂时0字节，按并发写披露，未列缺陷。当前审查计划hash：`02bd9244871eab626d923ab0daac08c7f5fbb27c1b74019bce75a1e33099e4d1`。输入hash/bytes、工作包与待测试项见 [JSON报告](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/reviews/solution-initial.json)；本报告只签核这些快照的初审结论，后来修改不自动获认可。

后续只核P1的跨ownersource协议/向量、P2的稳定内容oracle/hash，归并protocol独立增量结论；主代理合并⑤和02A最终registry后核真实来源代、复用owner/test映射、ENV/root移交/DAG边界。source许可与M12继续分别保持发布/商业门禁，未执行产品/Chrome测试仍not-run或pending。
