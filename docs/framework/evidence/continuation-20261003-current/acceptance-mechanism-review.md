机制结论：**REQUEST CHANGES**。本报告仅审查验收机制，**不是 F3 产品评审**，不评分。所有未测 native 场景均为 **pending**。

审查快照：

- 检查器 SHA256：`dbb32d94f0e6a535a23386649f4519fb3766a790d8856b2153f24db0c8449124`。
- 测试 SHA256：`fc5bc1fdb66ff80098fcc85d339d41daf4afb4b7c700e01f1d512100c3ff26c5`。
- 工作流 SHA256：`9e596821aa38829397b2d5c3d4cf3ab431352b586788a8edcc8243aac4b4f52d`。
- 以上是独立动态探针快照，探针前后 checker/test 未变。定稿追加静态核对最新 loadedInputs/source 修订；新旧 SHA 分开保存，不将旧探针冒充新版本实测。下文行号对齐定稿版本。已完整读取 code-reviewer 角色说明及两份机制文件，并核对工作流关键约束。


定稿补记（限定范围）：

- 当前检查器 SHA256：`d87563798162b9e86b0fa00951ea18f6b556ef50677c1d16ef51fffb95b3bcbe`；测试 SHA256：`fc5bc1fdb66ff80098fcc85d339d41daf4afb4b7c700e01f1d512100c3ff26c5`；工作流 SHA256：`901096147939aff4925a5cc4bf2332cfdd594f1acd1a01269169e21a0aece870`。
- **loadedInputs 保护已静态确认**：[首读记录](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:142) 与[结尾重读](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:244)覆盖台账、gates、history、candidate 等经 read() 加载的输入；变动/缺失产生 `ACCEPTANCE_INPUT_CHANGED_DURING_CHECK`。未改写这些文件做竞态探针。该重读检查不等于评审对输入快照的批准绑定，因此不关闭 AMR-04。
- **source.path/实际 SHA 保护保留**：已在前版 resolved 记录，本次确认仍存在。
- **范围外信息**：新浏览器启动应遵守 global launcher；本聊天未启动浏览器。B05 runner 的他代理修改和 leader 报告的无 extension smoke 2/2 未在本聊天复核，不纳入本机制证据，也不构成 F3。
- 本报告已定稿交付当前发现；修复由 leader 接续，必要时另行复核。不继续扩大查找面。原48个动态 mutation 属于上面的旧 SHA 快照，本次只补静态差异记录。

当前事实：批准原 **603** 个唯一必需 case，活动 **19** 个 SDK 增项，冻结 **191** 能力；只读 readiness 为 **accepted=false、accepted=0**，不是产品测试通过。用户提供最新机制测试 **17/17**，本聊天没有运行该入口。

独立验证：运行独占目录内的临时探针，执行 **48** 个内存 helper mutation、当前实际 reference/review-report 分支及 **5** 个内存 ZIP 闭包探针。没有写产品候选、启动浏览器、构建、执行现有测试或全库审计；未改源码、shared、scripts、台账、门禁或冻结证据。两个侧代理只做静态阅读，动态结果均由本聊天的探针取得。

每个 finding 的 `accepted=true` 都指合成 helper 或隔离分支，**不声称完整 checkAcceptance 最终候选被运行或放行**。自动结构缺陷与原始行为真实性按以下判定分开记录。

**[HIGH] AMR-01 — 一条合格观测掩盖同 campaign 内的明确违规观测**

位置：[tests/framework/verify-product-acceptance.mjs:103–119](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:103)、[tests/framework/acceptance-evidence.test.mjs:99–113](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/acceptance-evidence.test.mjs:99)。

复现：在每次全新合成 fixture 中保留原合格记录，再追加独立 id、同 kind、完整双环境且 pass=true 的记录；分别把其 measurements 改成 controllerRuns=1/httpWrites=2、unknown replay=true、terminatedMs=60000/borrowedPageClosed=true，或 download.state=interrupted。

结果：四个 mutation 都返回 accepted=true、issues=[]。

判定：inEveryEnvironment 使用 some，只证明每个环境至少有一条合格记录，未拒绝其余已纳入成功 campaign 的违规 measurements。该缺陷属于自动结构/数值谓词，不需要机器理解任意 JS 业务语义。

最小修补：覆盖率检查保留，但对每个声明为成功的目标 kind/环境 observation 都执行对应谓词，任何失败立即加 issue；确需保留失败历史时单列且不可计入当前成功 campaign。加入上述混合合格/违规记录回归。

探针：`sdk-bad-record-masked-by-one-good`、`unknown-replay-masked-by-one-good`、`termination-failure-masked-by-one-good`、`download-failure-masked-by-one-good`。

**[HIGH] AMR-02 — 不同结果 ID 可复用同一物理轮次并虚报 1000 次**

位置：[tests/framework/verify-product-acceptance.mjs:85–101](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:85)、[docs/framework/product-acceptance-workflow-20261003.md:102](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/product-acceptance-workflow-20261003.md:102)、[tests/framework/acceptance-evidence.test.mjs:90–97](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/acceptance-evidence.test.mjs:90)。

复现：克隆 mixed-0 的原始引用和 observations 为1000条；仅保留不同 id 与五种 kind 标签；所有 observation 都声明同一 roundId、相同开始/结束时间、相同原始证据。

结果：accepted=true、issues=[]。旧的跨 campaign/原 case 同 ID 复用已经被拒绝，此 mutation 使用不同 ID。

判定：当前唯一性约束覆盖结果 ID，未覆盖其对应的实际事件位置/轮次。该探针证明缺少 occurrence 绑定，不证明本次真的执行过1000个 native轮次；轮次真实性仍需独立语义审阅。

最小修补：要求每环境每轮具有可定位的 occurrence identity，例如 run/session/roundId 和 raw artifact hash+JSON pointer/event offset；校验其与记录 ID 的绑定及全 campaign 唯一性。允许同一聚合日志文件复用，但不能复用同一事件片段。

探针：`campaign-repeat-one-raw-round`。

**[HIGH] AMR-03 — 当前19个 SDK 增项没有不可变预期合同绑定**

位置：[tests/framework/verify-product-acceptance.mjs:63–72](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:63)、[tests/framework/verify-product-acceptance.mjs:159–161](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:159)、[docs/framework/product-acceptance-workflow-20261003.md:123](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/product-acceptance-workflow-20261003.md:123)、[tests/framework/acceptance-evidence.test.mjs:20–24](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/acceptance-evidence.test.mjs:20)。

复现：删除 EXPLICIT-ADD 的 contractSha256 并将 expected/actual 改成相互矛盾的任意对象。

结果：accepted=true、issues=[]。当前实际19个SDK增项均不在批准的603 case规格中，contract 查找失败会跳过 contractSha256 校验。

判定：001–019 ID存在性保护已补好；剩余问题是预期合同未冻结，不是当前必选19数量可被删除。无需自动比较任意 actual/expected，仍应保证评审所使用的 expected 来自不可变增项合同。

最小修补：为登记的19项建立独立、批准且哈希固定的 supplemental case catalog；原 case 与增项都必须找到合同，并校验完整合同 hash 与来源。结果账本只保存结果，不作为预期合同源。

探针：`additional-no-contract`。

**[HIGH] AMR-04 — 评审批准没有绑定被审证据快照或前序 architect 报告**

位置：[tests/framework/verify-product-acceptance.mjs:126–136](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:126)、[tests/framework/verify-product-acceptance.mjs:235–241](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:235)、[docs/framework/product-acceptance-workflow-20261003.md:103](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/product-acceptance-workflow-20261003.md:103)、[docs/framework/product-acceptance-workflow-20261003.md:118](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/product-acceptance-workflow-20261003.md:118)。

复现：保持两份 APPROVE 及 productPackageSha256 不变，声明其 reviewedEvidenceSha256/reviewedSpecSha256/reviewedSourceSha256 为另一个摘要；结构检查不读取这些值。也可在评审后替换同包的 resultReports/raw引用，重新声明真实文件SHA而保留旧批准。

结果：内存 mutation accepted=true；当前报告分支仅比较8个字段，均不含被审输入清单或 architect 前序报告摘要。

判定：时间正序已经可靠拒绝倒序，但无法证明 critic 看的是当前 architect 报告以及当前 case/raw/campaign/closure 证据。文件哈希证明当前文件的完整性，不能代替批准对这些文件的绑定。后半种全候选替换为静态控制流判断，未创建或运行实际候选。

最小修补：两份报告都绑定相同 canonical review-input manifest SHA，覆盖批准规格、增项合同、构建来源、包/ZIP、环境、结果和全部原始证据引用、historicalClosures；critic 另绑定实际 architect 报告SHA。输入变化即使包不变也使旧审阅失效。

探针：`reviews-unbound-evidence-union`。

**[HIGH] AMR-05 — 非字符串 reviewerId 绕过作者排除和两位审阅者身份分离**

位置：[tests/framework/verify-product-acceptance.mjs:124–136](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:124)。

复现：令两份 review.reviewerId 分别为新建数组 ['product-author']。

结果：accepted=true；authors.includes(array) 不匹配字符串，两个数组引用也不相等。

判定：这不是要求检查器证明真实身份；这是现有身份比较接受错误 JSON 类型导致的确定性绕过。真实身份及作者名单完整性仍须独立核验。

最小修补：productAuthors 与 reviewerId 都要求规范化非空字符串，拒绝对象/数组，按规范化值检查唯一性/作者排除。真实身份来源由既定独立过程核验，不用自填 independent:true 替代。

探针：`review-object-identity-bypass`。

**[HIGH] AMR-06 — 同角色追加阻断评审被第一条 APPROVE 遮蔽**

位置：[tests/framework/verify-product-acceptance.mjs:126–135](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:126)、[tests/framework/verify-product-acceptance.mjs:235–241](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:235)。

复现：保留首个 architect APPROVE，追加同角色 REQUEST CHANGES 且 blockers=['open-native-blocker']。

结果：accepted=true、issues=[]。

判定：find() 选第一条，额外 report 即使字段与文件一致也不参与最终批准判定。完整性检查不会补上角色唯一性。

最小修补：当前候选 architect/critic 各且仅一条有效 review；多轮历史应另列并显式绑定 supersedes 链，不以数组顺序选择有效批准。

探针：`duplicate-authoritative-review`。

**[HIGH] AMR-07 — 下载文件双 SHA 一致不等于与原 artifact 字节一致**

位置：[tests/framework/verify-product-acceptance.mjs:113–115](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:113)、[docs/framework/product-acceptance-workflow-20261003.md:59](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/product-acceptance-workflow-20261003.md:59)、[docs/framework/product-acceptance-workflow-20261003.md:127](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/product-acceptance-workflow-20261003.md:127)。

复现：保留 download.sha256===diskFile.sha256，同时声明 artifactSha256/源 artifact.sha256 为不同的合法64位SHA；独立文件探针以本探针文件的实际字节作为 diskFile，核验文件SHA后再执行 helper。

结果：纯内存检查 accepted=true；实际临时文件 SHA 校验成功且 helperAccepted=true，而 artifactHash 与 downloadHash 不同。未启动 native下载，未运行最终候选。

判定：目前只将磁盘文件绑定到 download 的自填SHA，没有把下载绑定到 originating artifactId/run/持久payload的SHA及字节长度。错误磁盘SHA本身会被拒绝，本缺陷不构成突破 SHA256。

最小修补：要求 source artifactId/runId 与持久 artifact record/payloadRef 的实际引用；验证 artifact payload实际SHA/长度、declared artifact SHA、download SHA、diskFile实际SHA/长度全部一致，并将 native downloadId/终态回执绑定该 artifact。

探针：`artifact-download-two-hash-mismatch`、`artifact-real-file-hash-contradiction`。

**[HIGH] AMR-08 — stable versionEvidence 只有SHA、没有文件路径仍通过**

位置：[tests/framework/verify-product-acceptance.mjs:31–41](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:31)、[tests/framework/verify-product-acceptance.mjs:190–195](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:190)、[docs/framework/product-acceptance-workflow-20261003.md:115](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/product-acceptance-workflow-20261003.md:115)。

复现：将 stable.versionEvidence 改成 {sha256:'a'.repeat(64)}，删除 path，保留其余环境字段。

结果：accepted=true、issues=[]。references() 只处理同时拥有 path/sha256 的对象，所以最终遍历也不会访问该声明。

判定：缺少按规范应交付的 actual discovery evidence 文件，不是要求自动推断执行时 stable渠道。实际版本、渠道、时间及binary相关性仍需独立语义审阅。

最小修补：对 stable.versionEvidence 使用严格完整 file-ref schema 并显式调用 reference；稳定版发现记录应包含观察时间/渠道/版本及原始来源，交由独立评审核对。

探针：`stable-version-evidence-hash-only`。

**[MEDIUM] AMR-09 — original/additional ID相交会重复计数并遮蔽增项失败**

位置：[tests/framework/verify-product-acceptance.mjs:20–24](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:20)、[tests/framework/verify-product-acceptance.mjs:63–75](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:63)。

复现：在 fixture.additionalCaseResults 加入 CASE-A:{status:'not-tested',pass:false}。

结果：accepted=true；counts.original=2、additional=2、accepted=4，同一 CASE-A 记录计入两次且增项失败行未被读到。

判定：原603与191冻结未被单独突破，但最终成功分母/计数可被重复ID污染。生产入口对001–019存在性的检查不拒绝额外的相交ID。

最小修补：校验整个 required ID集合唯一性，拒绝 originals/additional 交集；按所属集合读取对应账本行，避免 original优先fallback。

探针：`additional-overlaps-original`。

**[MEDIUM] AMR-10 — null 引用或容器造成 TypeError，无法返回结构化拒绝报告**

位置：[tests/framework/verify-product-acceptance.mjs:31–41](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:31)、[tests/framework/verify-product-acceptance.mjs:49–58](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:49)、[tests/framework/verify-product-acceptance.mjs:126–135](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:126)、[tests/framework/acceptance-evidence.test.mjs:76–84](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/acceptance-evidence.test.mjs:76)。

复现：分别替换 observation.evidence=[null]、observations[0]=null、environments[0]=null、reviews[0]=null、download.diskFile=null。

结果：五项均抛 TypeError，未返回 accepted:false/issues结构；独立文件 reference(null) 本身会正常生成 INVALID_REFERENCE。

判定：CLI 外层 catch 会失败关闭/exit1，未发现null导致错误放行。问题是纯helper/API的错误报告合同与可诊断性；空对象 workerIdentity 也会通过现有truthiness检查。

最小修补：先验证容器数组及每个元素为非null plain object；引用要求 path/sha256 都是非空规范字符串；统一返回 INVALID_* issue。workerIdentity 应使用明确的可关联标识schema，不能仅检查truthiness。

探针：`null-evidence-reference`、`null-observation`、`null-environment`、`null-review`、`null-download-disk-reference`。

**[MEDIUM] AMR-11 — review报告内的原始证据引用不进入完整性校验**

位置：[tests/framework/verify-product-acceptance.mjs:190–195](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:190)、[tests/framework/verify-product-acceptance.mjs:235–241](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:235)。

复现：用当前 review-report 分支及内存 reference()，两份合法review JSON各增加 evidence:[{path:'missing-review-input.json',sha256:合法SHA}]，更新报告自身的真实SHA；不提供该嵌套文件。

结果：分支issues=[]，只读两份review外壳，missingNestedReferenceVisited=false。

判定：报告外壳哈希正确，不保证报告声明的证据存在。为精确隔离该分支，未运行全候选/产品验收。

最小修补：对review报告明确 reviewedInputs/evidence schema并校验这些引用；解析后遍历规定的引用域，结合 AMR-04 验证输入覆盖和review快照一致性。

探针：`review-nested-reference-not-read`。

已补好或本次未复现绕过的检查：

- **原603/必需标记与191能力分母**：当前checkAcceptance校验批准manifest/spec/frozen ledger实际SHA，确认603全required与191唯一ID；传入冻结分母，拒绝活动分母漂移。
- **SDK017–019必需存在性**：explicitSdk 已为001–019。仅helper的 additional-removable-after-first16 mutation不能作为生产入口可删017–019的证据。
- **campaign完整矩阵与相同ID跨campaign/原case复用**：缺stable与ID复用返回矩阵/复用issue；尚未覆盖同事件不同ID，见AMR-02。
- **逐环境measurements与review时间正序**：不再读取顶层成功数抵扣环境；单独坏环境/unknown replay/3001ms/borrowed close/倒序时间均拒绝；多个记录的some遮蔽另见AMR-01。
- **capability非hash引用及实际caprefs**：当前item.evidence使用validRefs，并对191能力引用调用reference；字符串与{length:1}都拒绝。冻结case到能力的实际语义仍由独立评审判断。
- **实际文件SHA与production ZIP/目录双hash闭包**：reference对实际临时探针文件的错误SHA、数组SHA、缺path/对象path均拒绝；当前ZIP descriptor算法内存探针拒绝改字节/多文件/少文件/重复项，exact通过；pack receipt另比较archive实际SHA和length、production packageHash。未检查真实production候选。
- **校验结束重读**：checked refs逐个重读SHA，production包重核hash。没有人为改写产品/证据，也没有执行并发竞态；普通终态漂移保护已存在，不将旧静态缺口继续列为未修。

- **原 case 源文件精确路径/实际 SHA**：当前对contract.source.path使用精确key/hash匹配，并对所有record.sourceHashes逐项调用实际reference；独立冻结路径换名探针返回SOURCE_BINDING_MISSING。旧fixture只带source.sha、无path的路径交换结果不能作为真实来源路径绑定绕过；540个冻结case含source.path，其他来源形态未扩展审计。

自动检查与独立 semantic review 的边界：

- **module替代native — pending**：自填native-product/pass标签、任意actual/expected仍可能通过结构检查，这是工作流132行明确的自动检查边界。不得把helper accepted当native发生；独立semantic review须审阅原CDP/UI/HTTP/IDB记录，并通过AMR-04绑定精确输入。诚实module layer标签仍被拒绝。
- **包/源码hash与每次native运行来源 — pending**：当前已校验build.sourceInputs当前实际字节闭包、全部record.sourceHashes实际文件字节、原case精确冻结source.path/hash以及production包fingerprint。540个冻结case有source.path；独立路径调换控制探针被拒绝。旧source-hash-path-swapped使用无source.path的简化fixture，不能宣称当前生产source路径未绑定。实际native加载的extension/package与这些报告的运行关联仍需独立原始证据核对。
- **controller-free SDK/100并发/4 crash barriers/unknown不重放 — pending**：已自动验证逐环境数值字段；本聊天没有native sender/IDB/真实HTTP入站和写数、原身份/真实SW死亡边界观察。17/17机制测试不能关闭这些场景。
- **≤3s物理终止与借用页/资源清理 — pending**：空对象workerIdentity与任意等值before/after可通过helper，不能证明target/run/CPU关联、单调stop起点、持续不增长或borrowed-page身份。等值999不自行证明漏泄，baseline语义需要原始前置与生命周期记录。真实CPU/TargetDestroyed/存活host/borrowed与owned处理均未测。
- **R1–R8/历史17正确关闭映射 — pending**：映射任意存在必需case即可通过自动结构；工作流117行明确其语义由独立评审核查。批准603含25项必需回归，此probe单独不能绕过它们。评审须按冻结mapping核REGRESSION-R1-pointer/REGRESSION-HIST01等实际对应，不把映射存在当问题实关。
- **实际stable版本/渠道、作者与审阅者真实身份 — pending**：相同binary/version与不完整自声明author表属于真实性核验边界；机器不能凭标签解决。可自动封堵的缺引用/错误类型另列AMR-05/08。
- **真实download/artifact闭环 — pending**：本次没有产生、读取或验收native下载。AMR-07只是独立机制的hash链缺口；所有complete/cancel/interrupted及Blob/URL资源清理实测仍pending。

文件引用与双哈希判定：

- 错误实际文件 SHA、数组型 SHA、对象 path、缺 path 在真实 reference 分支均未获文件字节。纯 helper 接受数组 SHA 的结果不能作为最终完整性绕过；null 类问题失败关闭，见 AMR-10。
- `../` 别名解析到同一实际文件且 SHA 正确，不自行构成欺骗；browser binary 可以合理位于工程外。缺少文件路径的 stable discovery 引用则是 AMR-08 的明确缺口。
- ZIP 的 archive SHA/length 和 production 目录 packageHash 分别核验。内存 exact archive 通过，改字节/多文件/少文件/重复项都不匹配；本次未复现这条双哈希链绕过。未读取或运行真实产品 ZIP 候选。
- 下载 `download.sha256 == diskFile.sha256` 未绑定源 artifact，是 AMR-07，不能与 ZIP 已有保护混淆。

复现入口：

```sh
node /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/_acceptance-mechanism-probe.mjs
```

完整 mutation 代码保留在[临时探针](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/_acceptance-mechanism-probe.mjs)；当前快照、输出、隔离分支读记录和 ZIP 结果均保存于[JSON 报告](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/acceptance-mechanism-review.json)。运行只读准备度与探针不会设置 F3、修改总规划或更新台账。修补与 native 验收由原授权 owner 接续。
