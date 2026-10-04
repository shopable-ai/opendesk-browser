# 阶段01协议独立初审

结论：**REQUEST_CHANGES / BLOCK**。当前有 **6 项 P1、3 项 P2，共 8 项 blockingDesignGaps**。本范围初审已完成；协议尚不具备无歧义的实施交接条件。

证据快照时间：2026-10-01T19:27:30.935138+00:00。仅审实际五份合同与 `contracts/fixtures`，参考 v3、v4-01 和 common。02A/02B/03 命名不影响结论；同期 framework/task/test/registry 与最终综合交接不在本轮范围。只写两份 protocol-initial 报告，没有实现生产或改动合同。

执行方式：独立 critic 主审，加两个已完成的原生只读审查通道（协议符合性、架构）。两者均省略 model 覆盖以继承当前父模型，显式 xhigh；未使用旧模型 CLI。最新 payload/PagePort 修改由主审重新读文件核验，已移除原 PIC-08，未把较早通道的结论误当最新版本结论。

## 当前阻断设计项

| ID | 优先级 | 需闭合的合同 |
| --- | --- | --- |
| PIC-01 | P1 | 历史seal ACK没有可持久表达的结构，重ACK与当前身份围栏的检查顺序未闭合 |
| PIC-02 | P1 | 新增read协议仍预先要求snapshotId，零批空页入口及持久document/checkpoint绑定未闭合 |
| PIC-06 | P1 | 新三批页fixture用含snapshotId的完整Record计算pageSignature，和规范raw+values定义不一致并破坏重复页检测 |
| PIC-07 | P1 | 首次registerHost没有run时无法生成合法Projection，snapshotRun响应也与绑定结构不一致 |
| PIC-09 | P2 | E_QUOTA要求interrupted，但run状态机没有对应转移 |
| PIC-10 | P1 | 尚未绑定的tabs.create也有外部效果gap，never-created不能从target=null推得 |
| PIC-11 | P1 | 持久tabId不带浏览器session身份，恢复retireTarget可能关闭无关用户tab |
| PIC-12 | P2 | 退役释放缺少当前slot归属CAS，重复absence结果可清空新run的slot |

PIC-04 是非阻断 P2：迟到下载的明确语义和 fixture 已给出主方向，仍需统一接口的 freeze 表述。下述每项均有文件段、反例、最小修法和关闭条件；协议反例不等于已复现生产缺陷。

## 发现详情

### PIC-01 [P1] 历史seal ACK没有可持久表达的结构，重ACK与当前身份围栏的检查顺序未闭合

**阻断：是；置信度：high。** 基础阶段与领域阶段可各自实现看似合理却不兼容的重ACK；UI可能把历史页ACK当最新投影，或把成功seal误报失败。当前文件无法直接持久保存规范要求的完整历史返回值。

证据：

- [docs/contracts/semantics.md:15](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:15)，整页digest与原owner重复seal例外：同一已sealed的原始owner请求即使stop后来改变runRevision，只允许核完全相同digest并返回历史ACK
- [docs/contracts/semantics.md:19–21](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:19)，停止后拒新seal；runRevision控制CAS：
- [docs/contracts/schema.json:1469–1563](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1469)，`/$defs/PageSnapshot`：只有sealSeq/sealDigest/pageSignature和页内staged计数，没有原SealAck、原checkpoint或seal身份
- [docs/contracts/schema.json:2023–2067](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:2023)，`/$defs/SealAck`：ACK必需committedCount/committedPages/checkpoint/sealSeq
- [contracts/fixtures/scenarios.json:273–288](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/scenarios.json:273)，`/cases[id=seal-duplicate]`：只重复同一页，没有后续seal、控制revision变化、旧document/围栏组合

反例：

1. S1在revision=1、target=D1/v1时seal，ACK={count:6,pages:1,checkpoint:S1,sealSeq:1}丢失。
2. S2提交后run为count=12/pages=2/checkpoint=S2；stop令revision增加。
3. 原host重发S1的原始SealRequest。先用当前revision/target检查会拒绝规范要求的历史重ACK；用当前run投影重建则返回count12/checkpointS2；要求的原checkpoint/累计计数未落在PageSnapshot结构中。

最小修法：

- 在现有pageSnapshots store的PageSnapshot中增加sealIdentity（完整host/run/template/epoch/target tuple）和immutableSealAck，seal与计数/checkpoint同事务保存；不新建store。
- 明确重复分支：先验证真实请求来源与原snapshot.runId/tombstone策略，再比较排除runRevision的完整原sealDigest；只返回原ACK并置duplicate=true。所有非重复stage/seal仍按当前完整Identity/cancel/epoch拒绝。
- 明确stop仅改revision、target重绑、正常退役改epoch、旧host重载、已删run分别允许历史读ACK还是E_OWNER/E_TOMBSTONE；任何例外不得新写或更新run投影。

关闭条件：

- S1→S2→stop后重ACK S1仍是count6/pages1/checkpointS1/sealSeq1，run投影保持count12/pages2/checkpointS2；eventSeq/commitSeq和row集合不变。
- 原请求只改变runRevision可按约定返回历史ACK；改变hostDocumentId/target.documentId/targetVersion/ownerEpoch/templateHash或内容不能命中重ACK；旧epoch不得新seal。

### PIC-02 [P1] 新增read协议仍预先要求snapshotId，零批空页入口及持久document/checkpoint绑定未闭合

**阻断：是；置信度：high。** 新增sender检查有效，但不能替代每个snapshot固定读命令/文档的持久绑定；合法零批空页仍无明确状态入口，序号/checkpoint核验也依赖下游自行补合同。

证据：

- [docs/contracts/semantics.md:15](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:15)：snapshotId由底座分配绑定run+pageSequence
- [docs/contracts/contract.json:184–196](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:184)，stagePageBatch/sealPage接口：两个请求都预先要求snapshotId；接口清单无分配snapshot的操作
- [docs/contracts/state-machines.json:148–155](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json:148)，`/page[0]`：absent -- first-stage --> open
- [docs/contracts/semantics.md:34–36](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:34)：空页必须0批、0行、0字节；分页checkpoint合法且同origin
- [docs/contracts/schema.json:1469–1563](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1469)，`/$defs/PageSnapshot`：保存runId/ownerEpoch/pageSequence/pageIdentity，未保存host、target.documentId/targetVersion或read命令绑定
- [docs/contracts/schema.json:1564–1588](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1564)，`/$defs/Checkpoint`：pageNumber/url/lastSnapshotId；未定义它们与该页sequence/当前或下一URL的精确关系
- [docs/contracts/schema.json:2296–2324](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:2296)，`/$defs/ReadPagePayload`：新read-page仍必须先带snapshotId/pageSequence；接口未定义底座何时分配并open该snapshot。
- [docs/contracts/semantics.md:64–68](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:64)，新增raw PagePort：真实sender/document和原command认证已经明确；StageRequest/SealRequest及持久PageSnapshot仍未提供readCommandId与原文档的一致性验证路径。

反例：

1. 合法empty marker匹配，0条记录：不能发first-stage（规范要求0批），也没有接口让底座先分配open snapshotId；直接seal不存在的ID的状态转换未定义。
2. D1/v1的raw帧已按原readCommand认证，但仍在RunHost等待转换/持久化；导航后绑定D2/v2。若host把旧raw转成stage时附当前Identity，StageRequest没有readCommandId、PageSnapshot没有原文档身份，底座无法从公开结构核出它源于D1。文本已禁止stale写入，但持久绑定和检查路径仍缺失。
3. 两个snapshot同pageSequence或逆序seal均可满足局部连续批、同origin和count/hash；没有唯一[runId,pageSequence]、单open页/expected checkpoint的强制规则，checkpoint可以退回或重复计入。

最小修法：

- 明确一个底座page准入事务：增加beginPage/openPage请求与ACK，或让read命令准入原子分配并open snapshot，再返回ID。输入完整Identity、readCommandId、expectedCheckpoint/pageSequence、幂等requestId；0批empty页同样先open。解决当前read请求预先要求未分配snapshotId的循环。
- PageSnapshot固定原host、targetSession/tab/frame/document/targetVersion、templateHash与read命令身份；stage/seal必须和该绑定一致，旧document仅对账原命令而不得借当前Identity写页。
- 在原stores内声明唯一[runId,pageSequence]和每run至多一个可提交open页；seal核checkpoint CAS及pageSequence=committedPages+1，精确定义checkpoint是已seal页还是下一页，并说明末页/第50页。

关闭条件：

- 有合法empty依据的0批页通过；缺container/不存在snapshot/伪造empty依据均拒绝且计数不动。
- D1/v1与D2/v2的批次不得混页；逆序/重复sequence seal拒绝，不回退checkpoint；同页同内容请求幂等。

### PIC-04 [P2] retryExport把旧job描述为冻结审计，与旧attempt迟到complete更新旧job互相冲突

**阻断：否；置信度：high。** 迟到完成是否可见和何时释放旧job pins/清理资格没有单一规范，用户可能看不到实际上已完成的旧下载。

证据：

- [docs/contracts/contract.json:246–251](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:246)，retryExport：old job frozen audit. Old receipt cannot complete new job
- [docs/contracts/semantics.md:48–50](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:48)：旧attempt迟到complete仅更新旧job
- [contracts/fixtures/scenarios.json:441–460](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/scenarios.json:441)，`/cases[id=download-reexport-isolation]`：jobA: delivery_complete-with-late-history；jobB: delivering

反例：

1. A到deadline_unknown，用户retryExport创建B；此后A的唯一downloadId显示complete，B仍in_progress。
2. 照contract的old job frozen audit，A投影永远unknown；照semantics和fixture，A须变为delivery_complete。两者都不污染B，但旧job最终显示和生命周期不一致。

最小修法：

- 将freeze精确限定为A的artifact/activeAttemptIds和提交权限不可再变；原A delivery聚合仍可按原attempt证据更新。只有explicit abandon/tombstone才冻结projection。
- 给ExportJob一个确定的按本job attempts聚合规则，明确0/部分complete、unknown、interrupted、abandoned组合；更新attempt+receipt+其job的原stores事务。

关闭条件：

- A late complete只使A完成并保留timeout/resourceReleased历史，B不变；A已explicit abandon则仅新增审计，A/B投影均不复活。

### PIC-06 [P1] 新三批页fixture用含snapshotId的完整Record计算pageSignature，和规范raw+values定义不一致并破坏重复页检测

**阻断：是；置信度：high。** 按规范实现的signature无法通过向量；按向量实现会把snapshotId变化当页面变化，破坏用户明确要求的完整重复页保护。

证据：

- [docs/contracts/semantics.md:15](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:15)：pageSignature=SHA256(canonical({pageIdentity,records:整页完整raw+values按rowIndex排列}))；button同URL时仍由完整signature检测换页
- [docs/contracts/contract.json:373–376](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:373)，`/recordDigests/page`：sha256 canonical({pageIdentity,records:all rows raw+values in rowIndex order})
- [contracts/fixtures/page-transaction.json:165–203](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/page-transaction.json:165)，`/sealRequest/pageSignature`：87a410292821abdb761ecce2187c0e7a43ac8840078c4f03774f43addad202f1仅与完整Record（包含recordKey/rowIndex）envelope匹配
- [contracts/fixtures/scenarios.json:557–572](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/scenarios.json:557)，`/cases[id=pagination-signature]`：repeat full page all rows identical→failed E_SEMANTIC

反例：

1. 只读Node复算新page-transaction向量：所有3个stage digest/utf8Bytes和templateHash均匹配；pageSignature按{raw,values}投影应为68d21e66fd66dc6db1f20f368fdd008b15953ec839e19e794487bad6c6a56625，文件却为87a410...，后者包含rowIndex和recordKey。
2. next-button同URL实际6行完全没变化，但为第二次观测分配新snapshotId S2而recordKey从S1:i变S2:i；按fixture算法完整Record的hash改变，误认换页成功并重复采集。
3. semantics的pageIdentity=origin+规范URL也未定义为精确字符串/envelope；fixture使用单一规范URL，直接origin拼接会得到第三个不兼容hash。

最小修法：

- 定义唯一PageSignatureEnvelope，records仅为按rowIndex排序的{raw,values}（排除recordKey/snapshotId/owner/epoch及其他观测身份）；它不能依赖为每次观测新生成的ID。
- 明确pageIdentity采用规范URL本身或结构{origin,url}，给出固定canonical字节，替换所有不匹配hash和相关引用。
- 补同URL相同raw/values但snapshotId不同→signature相同；前5行同、第6行改变→signature不同的独立向量。

关闭条件：

- 该三批页按所选envelope静态hash与fixture一致；next-button没有真实内容变化时不得seal第二页、不得盲click重试；真正第6行变化可识别。

只读 SHA-256 复算：声明及完整 Record 为 `87a410292821abdb761ecce2187c0e7a43ac8840078c4f03774f43addad202f1`；仅 raw+values 为 `68d21e66fd66dc6db1f20f368fdd008b15953ec839e19e794487bad6c6a56625`；内容不变、recordKey 换为 P2 后完整 Record 为 `3565eb822ca156c363e5d47678a92074f7a06e4c74442d3dbf35735de6c658a7`。三批各 252 字节、总 756 字节均匹配；缺陷集中在页签名 envelope。

### PIC-07 [P1] 首次registerHost没有run时无法生成合法Projection，snapshotRun响应也与绑定结构不一致

**阻断：是；置信度：high。** 正常启动和UI重同步的公共接口没有同一可验证返回，迫使下游伪造run或私加兼容分支。

证据：

- [docs/contracts/contract.json:121–125](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:121)，`/interfaces/0`：registration alone does not claim run；返回projection
- [docs/contracts/schema.json:1947–1988](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1947)，`/$defs/Projection/properties/run`：run只$ref Run；required包含run，不能为null
- [docs/contracts/contract.json:219–223](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:219)，`/interfaces/14/output`：snapshotRun输出扁平state/counts/checkpoint/pendingCommands/downloadProjection/runRevision
- [docs/contracts/contract.json:385–390](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:385)，`/schemaBindings/RunHostProjection`：RunHostProjection绑定Projection嵌套结构

反例：

1. 干净profile首次工具窗口registerHost，不应claim run；自然空闲投影为{run:null,pendingCommandIds:[],exportJobIds:[],eventSeq:0,slotAvailable:true}，但Projection.run必须object。
2. snapshotRun按文字返回扁平对象则不能通过Projection schema，按schema返回嵌套对象则不符接口output。

最小修法：

- Projection.run改为Run|null，并约束null时pending为空和slotAvailable真实；不创建伪造Run。
- 定义并绑定RegisterHostResponse与SnapshotRunResponse，明确idle/active/terminal/tombstone状态；把接口output统一到确切schema。

关闭条件：

- 干净profile登记返回合法idle projection且runs中不新建业务run；snapshotRun和registerHost响应均可按声明schema验证。

### PIC-09 [P2] E_QUOTA要求interrupted，但run状态机没有对应转移

**阻断：是；置信度：high。** 规范状态表和既定验收预期不同，UI恢复/导出标签及自动退役处理可能不同。

证据：

- [docs/contracts/semantics.md:38](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:38)：磁盘quota与profile配额不足为interrupted并标E_QUOTA
- [docs/contracts/state-machines.json:43–53](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json:43)，`/run/5`：running|preparing -- known-failure --> failed；interrupted路径只列host-loss
- [contracts/fixtures/scenarios.json:138–163](/Users/shopme/Documents/workspace/opendesk-browser/contracts/fixtures/scenarios.json:138)，`/cases[id=three-batch-last-fails]/expected/run`：run: interrupted with E_QUOTA

反例：

1. running下P0已seal2行，P1前两批ACK，第3批发生quota不足。照run表归为known-failure得到failed，照semantics/fixture必须interrupted/E_QUOTA。

最小修法：

- 添加quota/profile-quota专属转移至interrupted，和一般known-failure区分；明确与stop先提交的终态优先级。

关闭条件：

- 第3批E_QUOTA时P1 aborted，无该批ACK；保留P0 count2/pages1/checkpointP0，run返回interrupted/E_QUOTA；若stop先提交按既定stopping规则结算。

### PIC-10 [P1] 尚未绑定的tabs.create也有外部效果gap，never-created不能从target=null推得

**阻断：是；置信度：high。** 现有围栏阻止旧命令，不能撤回已经开始的tab创建；安全释放和可恢复退役缺少创建阶段。

证据：

- [docs/contracts/contract.json:142–153](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:142)，`/interfaces/3`：claim为preparing，bindTarget接收createdTabId；没有持久创建准入/未知创建协议
- [docs/contracts/schema.json:1787–1815](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1787)，`/$defs/RetirementEvidence`：oldTarget允许null；targetAbsenceEvidence允许never-created
- [docs/contracts/semantics.md:27–30](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:27)：只在围栏+旧执行tab不存在一起持久提交后释放slot

反例：

1. R1 claim→tabs.create已调用但callback/ID登记未到→stop/host失联进入退役。
2. 若把target=null当never-created并释放slot，R2可创建执行tab；随后R1创建结果迟到，epoch只能拒绝bind，却没有旧tab持久归属供关闭；profile同时存在两个执行tab。
3. 若永不使用never-created且无唯一恢复证据，则旧slot永久卡住；两种实现均无法兑现完整恢复。

最小修法：

- 在现有commandJournal持久化target-create意图、不可复用creationId、browserSession身份和prepared/dispatched/known/unknown状态；创建最多获准一次，DB/Chrome gap不重放。
- never-created只允许从未获准创建的持久证据。未知创建保持slot；迟到callback必须归属旧retirement，登记精确tab并关闭/验证absence，不得绑定新run。
- 选定可恢复的唯一创建证据，例如包内bootstrap URL+creationId再握手；0/多候选保持unknown，不以activeTab/最近tab猜测。

关闭条件：

- 分别在创建前、调用后未存ID、callback迟到的位置stop或终止SW；未知创建期间claim拒绝；精确旧tab退役并持久absence后仅释放一次。

### PIC-11 [P1] 持久tabId不带浏览器session身份，恢复retireTarget可能关闭无关用户tab

**阻断：是；置信度：high。** 设计可能关闭用户已有tab，属于真实可实施安全边界；这是协议反例推断，未声称已在Chrome复现ID重用。

证据：

- [docs/contracts/schema.json:369–409](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:369)，`/$defs/Target`：targetSessionId为应用会话；无browserSessionIncarnation
- [docs/contracts/schema.json:1767–1835](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json:1767)，`/$defs/RetirementEvidence`：持久oldTarget仅引用Target
- [docs/contracts/contract.json:212–216](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:212)，`/interfaces/13`：Chrome remove exact old tab；按tabId remove/get/onRemoved取absence
- [Tab.id; remove(); onRemoved](https://developer.chrome.com/docs/extensions/reference/api/tabs)：Tab ID仅保证browser session内唯一；remove只收数字tabIds，onRemoved提供tabId/windowId。这是官方 API 边界；数字 ID 复用及误关 trace 是推断。

反例：

1. R1保存tabId42并完成围栏，但absence未提交；Chrome退出/重启。
2. 新browser session用户无关tab获得数字42；新host读取旧retirement执行remove(42)，关闭无关tab并误把onRemoved/get-not-found当旧目标消失。
3. 应用targetSessionId/旧documentId仍在IDB，不能让tabs.remove原子检查新session的数字42是否真是原tab。

最小修法：

- Target、create intent与RetirementEvidence绑定browserSessionIncarnation，并明确生成/保留机制（SW重启不变，浏览器session重建变化）。
- 跨session禁止仅凭旧数字ID remove/get认领absence；选择固定agent/唯一创建凭据的重新识别或人工退役路径。会话结束本身不证明恢复tab不存在。
- 只有当前session和目标真实归属证据齐全才删除；身份不明保持slot并解释，不能删除同数字无关tab。

关闭条件：

- 持久retirement跨session恢复，用无关tab占同数字ID：无关tab不得关闭，其移除事件不得释放旧slot；唯一确认的旧目标可退役。

### PIC-12 [P2] 退役释放缺少当前slot归属CAS，重复absence结果可清空新run的slot

**阻断：是；置信度：high。** claim有CAS但release无对称合同，两个实际run可能同时获准；不能靠回调只到一次保证单任务。

证据：

- [docs/contracts/contract.json:54–58](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:54)，`/db/indexes/runs`：slotKey singleton for profile
- [docs/contracts/contract.json:94](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json:94)，`/db/note`：runs singleton slot row stores slot owner + retired target evidence
- [docs/contracts/state-machines.json:85–101](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json:85)，`/run/12`：IDB retirement evidence commits then global slot release；正常终态retire-resources仍保持同终态
- [docs/contracts/semantics.md:29–30](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md:29)：围栏和absence持久后释放；未明确release必须匹配当前slot owner且与写released同事务

反例：

1. 同一R1 retirement的tabs.get与onRemoved各引发一份完成结果A/B。A先提交release；R2随后claim。
2. B迟到时旧R1围栏/absence证据仍成立，正常终态也仍满足retire-resources的before=terminal；若按当前文字再次清singleton slot，R3可claim，而R2仍在跑。

最小修法：

- 同一runs/journal IDB事务核slot.currentRunId/ownerEpoch/retirementId和old retirement未released，再写absence/retirementState=released与清slot。
- 已释放或owner不匹配的重复回调仅返回原历史退役结果，不改slot；为retireTarget定义持久幂等结果。

关闭条件：

- A释放R1→R2claim→B重复提交：slot仍属于R2，R3claim被拒绝，R1release只发生一次。

## 已闭合和本轮认可的边界

- PIC-03：**targetVersion原为optional**：schema.json /$defs/Target/required 已包含targetVersion；完整page来源绑定仍见PIC-02。
- PIC-05：**v3每Record64KiB遗漏**：semantics.md:60已明确raw+values canonical UTF-8 64KiB；生产边界验证仍pending。
- **DownloadAttempt timedOutAt/candidates/mappedAt/deadline结构**：DownloadAttempt已新增timedOutAt/candidateDownloadIds/mappedAt/submissionCount，prepared阶段deadline可null。
- **v3授权语义**：free1模板/单页100行，Pro50模板，72h离线，已批run按授权快照至本轮结束；签名编码与tier分支已明确。
- **迁移数值/URL/CSV语义**：number exponent/安全整数结果，resolve-url按documentBaseURI，CSV null/empty均零长度单元（不是空格字符）；3类主向量和补充向量完整性通过。
- **3批stage/download基础wire向量**：page-transaction.json/transaction-template.json/download-attempts.json已加入；不再报不存在wire向量。其pageSignature冲突见PIC-06。
- PIC-08：**Command payload/timeout和固定raw读协议**：Command新增kind匹配ReadPagePayload/NextLinkPayload/NextButtonPayload，NextButtonPayload要求timeoutMs；PageReadData/End、rawOnlyAgent、RunHost同compiler转换、plan绑定、128KiB frame、2待stageACK和精确documentId导航已定义。remaining snapshot admission/provenance gap见PIC-02。

- cancel/dispatched IDB提交顺序已定义；dispatch→Chrome gap效果未知且不盲重放，停止后可能出现已获准外部效果。
- paused_unknown不自动接管；旧epoch围栏+真实tab absence持久后才可释放slot；剩余创建/session/release CAS见阻断项。
- stage ACK只暂存；3批第3批失败整页不可见，不推进计数/checkpoint；seal-before-stop保留完整页。
- downloadId仅启动；完整URL/扩展/时间唯一映射且downloadId去重；0/多候选不自动重下。
- deadline_unknown/mapping_unknown迟到唯一complete可解析原attempt并保留timeout/release历史，新job/attempt/Blob URL独立；explicit abandon仅审计不复活。
- diskHashVerified=false，不把Artifact提交前hash或浏览器complete解释为读取磁盘文件。

stop/dispatch gap 的文本已经承认停止后既定命令可能生效、崩溃后不可盲重放。本轮没有把该不可原子撤回的事实重复报成缺陷；剩余阻断集中在目标创建 gap、身份与退役释放，以及整页持久绑定。

## 校验与证据边界

已重新执行 `PYTHONDONTWRITEBYTECODE=1 python3 -B contracts/fixtures/migration/verify.py`：3 个迁移向量、29 个转换向量、19 个 URL 向量、45 个 CSV 安全向量、9 个模板拒绝向量通过静态完整性校验。Node 独立参考 canonical hash 为 `3475cba7ddc43506711b82a1865ae0228c056f074b45b364706322c057d681fa`。新 read-command 的 planHash 与 command digest 匹配。页签名复算发现 PIC-06。

- 系统Python无jsonschema，未安装依赖，也未声称执行完整Draft2020-12校验。
- 所有race counterexample是协议推演；未执行生产Chrome竞态、浏览器重启或tabId复用实验。
- 未运行生产代码、lint/typecheck/build/pack/M01–M11；本范围没有生产实现可验收。
- M12商业和签发运营证据仍独立pending，不作为本轮协议审查阻断理由。

这些结果的 `productResult=not-run`、`productConverterExecuted=false`、`chromeAcceptanceExecuted=false` 保持原意。没有把 fixture 完整性、消息结构读取或规范推演写成产品验收通过。

## 文件快照

| 文件 | SHA-256 |
| --- | --- |
| [docs/contracts/contract.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/contract.json) | `0f346bf239be5ae747cba2e16b0e0b92297eab1d12363d595a280c653abe684d` |
| [docs/contracts/schema.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/schema.json) | `a70eef15898f3cf3a6a36b821fa858def2e9e74d6c214b2a6da683b8759d2f5a` |
| [docs/contracts/semantics.md](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/semantics.md) | `911e187551d1ba971c1d4c8e886555223118f4236996c232ba2479b647e79274` |
| [docs/contracts/state-machines.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/state-machines.json) | `3308fe8f0842dbfe39ef0fa100d91aafa3ea08416687cf0129ec05009b1a51e5` |
| [docs/contracts/solution-overview.md](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/solution-overview.md) | `d6d8144c591250cd9c507ac987322f730c29b662401f2953c1cd416dcf5162fc` |

fixture 树共 170 个文件，聚合 SHA-256：`00c8a52c1f8b670ca9735b16c194a4333e19f11e5a72f8270a3b0eb6217f76c3`。定义为按相对路径排序的“路径→文件 SHA-256”映射，Python `json.dumps(sort_keys=True,separators=(',',':'))` 的 UTF-8 SHA-256。关键 fixture 与参考文件单独 hash 见同目录 JSON。落盘校验中发现 solution-overview 并发更新，已重新完整读取并刷新 hash；其 raw→typed 与退役顺序修订不改变本轮阻断项。

参考：

- [product-extension-architecture-v3.md](/Users/shopme/Documents/Codex/2026-10-01/browser-automation-platform/outputs/product-extension-architecture-v3.md)
- [v4-01-contracts.txt](/Users/shopme/Documents/Codex/2026-10-01/browser-automation-platform/outputs/goals/v4-01-contracts.txt)
- [v4-common.txt](/Users/shopme/Documents/Codex/2026-10-01/browser-automation-platform/outputs/goals/v4-common.txt)

本协议初审范围已完成；8项blockingDesignGaps须补明确结构/事务/状态规则及反例验收，再参加用户预告的最终增量综合review。未评同期framework/task/test/registry，不将02A/02B命名变化当作修复，不实施生产。
