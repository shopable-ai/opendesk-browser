# 连播助手 · 云端作品映射、公共规则与 VIP 安全复用 R12

> 任务 OD-VIDEO-AUTO-SKIP-CLOUD-RULES-R12 · 2026-11-22 · DESIGN_ONLY / NOT_IMPLEMENTED。
>
> 此文档是 [REQUIREMENTS.zh-CN.md](REQUIREMENTS.zh-CN.md) F9 的云端专项技术合同。R10 的本地跨集兼容和 R11 的 End/时间输入保留原需求权威，不重新定义播放器规则。共用账号/同步/备份/会员的唯一权威文件是 [unified-account-cloud-sync-r1.zh-CN.md](../../docs/architecture/unified-account-cloud-sync-r1.zh-CN.md)（实际已含 R1–R3，仍未实现）。

## 1. 已核验现状与真正用户目标

本轮定向从 main 读取 README.zh-CN.md、REQUIREMENTS.zh-CN.md、src/rules.js、src/main.js、preview/index.html 和统一账号设计。源码已实现本地 rules.v1、series.defaults、episodes、按字段继承、fixed / tail 模式、当前可信 duration 换算、validateRules、CAS/读回、草稿/撤销与原本地播放器交互。README 区分已发布 0.2.9 与源码开发候选 0.2.10；旧记录包含本机和部分实站验证，不能迁移为 R12 的新验收证据。预览是离线模拟，R10 的拒绝/版本指纹/RuleRevision 属逻辑设计，并未作为完整线上持久化模型落地。统一账号文档仍是设计，云同步/新设备恢复/权益服务均未部署或通过双设备验收。工具存储单键 8 KiB、合计 32 KiB，聚合 rules.v1 是实际容量门槛。

**体验目标：** 已有规则的用户，在另一个受支持网站打开同一兼容视频版本时，无需重新设定时间；若属于别的剪辑版、特别篇或只是同名同片长，绝不盲目跳过。云断网时原本地能力完整可用。

主产品 K0（主视频/时长）→ K1（可安全 seek 的片头片尾）→ K2（真正下一集）仍优先；云端 K4 不得阻断或重构前三项。当前实际页面匹配包括本机 fixture 和 iyf.tv；还没有证据证明两个不同真实视频网站已接通。

## 2. 需求树 / 功能树 / 责任归属

| 用户目标 | 连播助手业务模块 | 共用平台/依赖 | 阶段 |
| --- | --- | --- | --- |
| U1 设置一次、本机不丢 | 保留 rules.v1、作用域投影、单集例外、恢复继承、数据导入导出兼容、容量保护 | 现有 SDK/本地存储；未来 Sync Adapter | M0/M3 |
| U2 跨站认出同一内容 | Work、Season、Episode、Edition、SiteAssetMapping、来源证据、别名召回 | 最小公共读 API | M1 |
| U3 不错跳剧情 | per-field 决策、四态兼容、硬性冲突 veto、会话固定快照 | 现有 resolveInterval/validateRules 与真实 seek | M0/M1 |
| U4 借用他人标记 | 已授权公共查询、规则来源、人工确认和拒绝 | 公共规则目录及缓存/撤销 | M1 |
| U5 贡献纠错 | 自愿公开投稿、去重、审核、举报、修订撤销、恶意防护 | 共用 Identity + 服务端审计 | M2 |
| U6 家/公司/新机 | 个人私有 scope 数据投影、冲突与历史恢复 | 共用 Identity、Consent、Sync Engine、Backup | M3 |
| U7 VIP 省操作 | 严格适用时自动采用、缓存便利、个人云同步、历史恢复 | 共用 Entitlement Service | M3 |
| U8 可运营/可扩展 | 匹配证据、错误率、延迟、成本、审核反馈 | 后端基础观测 | M1+ |

**四个数据域严格分开：**
A. 本地规则是播放真相与离线入口；原业务引擎继续负责实际 seek、保存/撤销，不允许公共网络响应直接 seek。
B. 私有云规则是共用同步平台的 account+product+recordId 投影，沿用 sync_records、record_history、outbox 和身份分区；**不新建 PersonalRule 第二套真相表**。
C. 公共库只接受具有公开授权和审核状态的 intro/outro 标记，绝不上传用户规则全集、next、个人禁用、浏览/播放历史。
D. 身份映射及匹配证据属于本产品专用域，但使用一个共享后端/数据库基础设施而非新账号/会员/支付服务。

## 3. 选型

| 候选 | 优点 | 不足 | 决策 |
| --- | --- | --- | --- |
| 静态小型规则目录/签名 JSON 夹具 | 低成本、完全可复现、测试时不泄漏观看信息 | 无投稿事务、撤销传播弱 | M0 夹具和 M1 备用只读缓存 |
| 单体 HTTPS API + 现有/选定 PostgreSQL | 映射/修订/审核/撤销可事务化；接共用用户账号与权益 | 需 API 权限、运维、隐私、安全测试 | **M1 正式技术默认**；先审计是否已有服务可复用 |
| 直接代理 SponsorBlock/AniSkip | 前期可借鉴已有数据 | 身份键不同，外部质量、可用性、数据许可证不确定 | 不作为 MVP 后端事实或商用数据来源 |
| 微服务+向量 DB+媒体 AI | 未来可能提高覆盖 | 成本高、隐私和错误难证明 | M4 之前不引入 |

M1 先选择少量自己创建或已获合法授权的内容、人工确认的 A/B 站资源映射。先做两个不同 siteId 的本地合法夹具证实纯函数链路，再选择两个**真正不同视频网站**做 Chrome 验收；本地两夹具不能冒充“两站上线”。

## 4. 数据库逻辑合同（未执行 migration）

| 实体 | 主键、关系、唯一键/索引 | 安全要求 |
| --- | --- | --- |
| Work | work_id UUID；标题非唯一；索引规范标题 | 同名不等同同作品 |
| WorkAlias / WorkExternalId | (work_id,locale,normalized_alias,source)、(source,external_id) 各有来源 | 别名和外部 ID 只用于候选召回，第三方许可证另核对 |
| Season | season_id，work_id FK；unique(work_id,season_label) | 未知季不自动当作第1季 |
| Episode | episode_id，season_id FK；unique(season_id,episode_label,content_kind) | regular/special/merged/preview/bonus 分离 |
| Edition | edition_id，episode_id FK，timeline_key，duration_reference，edition_kind；index(episode_id,timeline_key) | **时间轴版本**；同片长不代表同版，另证合辑段映射 |
| SiteAssetMapping | mapping_id，site_id，opaque_asset_key，episode_id，edition_id，status，evidence_id；有效映射唯一 | 确认 edition 属于 episode；同键冲突隔离，保留前版本 |
| MatchEvidence | evidence_id，mapping_id，evidence_type，source_kind，review_state，observed_duration，revision | 不保存全 URL、登录令牌或完整视频内容 |
| PublicRule | public_rule_id，episode_id，edition_id，category，scope_type，status，active_revision_no；index(edition_id,status,category) | 同版/字段多候选互斥时不可自动运行 |
| RuleRevision | unique(public_rule_id,revision_no)，rule_json，source/license，created_at，actor_pseudonym | 不可变；修改/撤销成为新 revision，不回写历史 |
| RuleContribution | contribution_id，account_id（私有），public_rule_id，request_digest，review_state | 幂等键；明确投稿不等于公开发表；账号不公开 |
| Feedback / Moderation | feedback_id、moderation_id、target_id、reason_code、reviewer_role、decision、timestamp | 快速隔离、申诉、撤销可审计、限频防刷 |
| PersonalRule | **不建新表**，仅共用 sync_records(account,product,recordId) 的业务投影 | 个人记录绝不按 workId 在公共库中发布 |
| Entitlement | **不建新表**，只读共用 product_entitlements(account,product,feature) | 服务端最终校验，产品不能自报 VIP |

最小表设计规则：外部视频身份映射可以是多站对同一 edition，但不是“相同作品标题即同一 edition”。一条映射的 active revision/status 必须唯一；事实争议走待审候选，不能两条互斥结果同时 LIVE 供自动使用。作品级/季级规则必须显式列出已验证 compatible_episode_ids 或受控适用范围，不能向所有同名视频泛化。特别篇与普通集独立；合辑无已验证 segmentMap 不自动采用内部单集规则。无片头/无片尾属于审核过的 typed no_segment，而非规则 null。

**本地迁移：** 原 rules.v1 不变。新映射层以 scope record 查询后投影原有 intro/outro（kind=fixed/tail）供 existing validator 校验，next 仍私有。R10 的 v2 schema 是逻辑方案不是现有存储事实；迁移须具旧数据保护副本、未知 schema 拒绝、CAS 合并、8 KiB 容量预检，超限不写并保持 last good。未来本地分片必须单独先通过回归，再宣布大规模恢复可用。

## 5. 匹配与自动执行合同

输入：当前媒体 binding/sessionGeneration、受控站点 siteId + stable opaqueAssetKey、可信 currentDuration/currentTime/seekable、可读内容线索、个人规则/显式 null/disabled、个人拒绝记录、公共候选及 evidenceRefs/revision/revocationEpoch。

匹配按以下**八个独立闸门**：
1. 主视频：有且只有可靠主播放器、可信时长、seekable、稳定绑定；不成立则 UNKNOWN，绝不因为发现规则就盲跳。
2. Work：站点稳定资源键与人工审核映射/已确认来源优先，标题、别名和片长仅作候选召回。
3. Season/Episode：站内选集结构与外部可验证 ID 交叉证明；缺集数可做本媒体独立规则，不可冒充全集继承。
4. Edition：同一内容时间轴的可信映射；已知不同版、合辑无分段图、特别篇与普通集混淆 => NOT_APPLICABLE；未知版本 => UNKNOWN；同一资源历史时长异常 => NEEDS_CONFIRMATION。
5. 区间兼容：fixed(start,end) 只适用经验证的同一时间轴；tail(seconds) 在已确认兼容的尾段规律下用当前有限 D 实时换算 [D-seconds,D]；不复制旧绝对时间。R11 的 End UI 转为 tail，不把字符串 End 传服务器。
6. 来源质量：PERSONAL_VERIFIED / MODERATED_LIVE / UNREVIEWED / REVOKED 独立评估；两条互斥公共候选或撤销版本不能自动；投票高分不能绕过身份/剪辑矛盾。
7. 用户优先**逐字段**：当前单集显式值（包括 null / enabled:false 的阻止继承）> 本人确认过的 edition/range 规则 > 当前作品/季默认 > 私有云通过平台 R3 CAS 合并后形成的**本人本地记录** > 公共合法候选。云同步不能在播放时强行覆盖尚未合并的本地值；公共不能补上用户明确关闭的字段。next 永不来自公共库。
8. 执行资格：未被用户拒绝、已明确公共查询同意、该条规则所在 revision 有效、session 没换、区间有限不越界不覆盖整集、seekable 与播放器可用；VIP 自动采用还需共用权益服务验证。任何一项失败，不自动 seek。

四态输出：APPLICABLE（身份+版本+规则+来源证据足够且无硬冲突）、NEEDS_CONFIRMATION（同内容可能兼容但时长变化/证据差异/候选冲突）、NOT_APPLICABLE（明确不兼容）、UNKNOWN（证据缺失）。返回每项的 reasonCode 和 per-field source，不用一个“置信度 95%”代替闸门。可另为候选排序显示 IdentityConfidence=EXACT_VERIFIED/CORROBORATED/TITLE_ONLY/UNKNOWN、EditionCompatibility=EXACT_TIMELINE/CONFIRMED_TAIL_PATTERN/DIFFERENT/UNKNOWN、RuleTrust=PERSONAL_VERIFIED/MODERATED_LIVE/UNREVIEWED/REVOKED；它们相互独立。

**会话固定**：真正准备应用时 pin(ruleId,revision,edition,binding,generation,durationBasis)，普通在线更新从下一次绑定开始生效；已经开始播放不能因为收到新建议突然补 seek。紧急撤销须使本次会话尚未触发的公共跳过停止，不能逆向恢复已经跳过的剧情。手动回看、取消、保存、暂停与原下一集导航仍沿现有本地逻辑。

**拒绝记录**以 local binding / episode / edition / publicRuleId / revision / category 和受控范围定位，用户拒绝同候选后不重复打扰；新版本不能自动抹去“该内容不要公共规则”的强拒绝。只有明确重新核对可解除。无工作/集身份时仍可使用当前可信资源自己的本地规则。

## 6. API v1 最小可实施契约（候选，均 NOT_IMPLEMENTED）

所有公开匹配请求必须有公共查询授权；账号登录本身不能代替授权。数据协议与统一账户的 /v1/bootstrap、/v1/sync/{productId}、/history、/restore 独立，**不得复制私有同步 API**。

| Endpoint | 身份/授权 | 语义 |
| --- | --- | --- |
| POST /v1/video-rules/match | guest/Free/VIP，先同意公共查询且满足配额 | 输入 siteId+opaqueAssetKey+durationSeconds；返回版本化候选、四态证据、cache ttl/撤销水位 |
| GET /v1/video-rules/catalog-delta?after=cursor | 已同意的客户端 | 增量映射修订/撤销 tombstone；游标过期明确 REBASE_REQUIRED |
| POST /v1/video-rules/contributions | 登录，单次明确授权投稿，贡献协议与幂等键 | 仅提交经选择的公开 intro/outro 和合法来源；返回 PENDING_REVIEW |
| POST /v1/video-rules/feedback | 明确同意的受限会话 | ruleId、revision、reasonCode、精简说明；不能附个人观看记录 |
| GET /v1/video-rules/rules/{id}/revisions | 按公开字段读 | 不可变修订与来源许可；不公开 accountId |
| POST /v1/video-rules/moderation/{id}/decisions | moderator RBAC + 审计 | expectedRevision + PUBLISH / QUARANTINE / REVOKE，CAS |
| POST /v1/video-rules/mappings/review | 受控人工纠错/审核 | siteId、assetKey、episode/edition、来源证据；用户不能任意自封已审核 |

示例是**自造合法双站夹具**，不是实际网站身份，且不发送完整 URL：

~~~json
{
  "protocolVersion": 1,
  "siteId": "fixture-a",
  "opaqueAssetKey": "sample-ep04-cutA",
  "durationSeconds": 2880,
  "contentHint": {"kind": "regular"},
  "consentScope": "public-match-v1"
}
~~~

满足确证映射后的服务端**候选**响应（仍须客户端二次验证并决定 seek）：

~~~json
{
  "protocolVersion": 1,
  "matchStatus": "APPLICABLE",
  "reasonCodes": ["VERIFIED_MAPPING", "CONFIRMED_TAIL_PATTERN"],
  "identityConfidence": "EXACT_VERIFIED",
  "editionCompatibility": "CONFIRMED_TAIL_PATTERN",
  "ruleTrust": "MODERATED_LIVE",
  "canonical": {
    "workId": "work-sample-1", "seasonId": "season-sample-1",
    "episodeId": "episode-sample-04", "editionId": "edition-sample-cutA"
  },
  "candidates": [{
    "publicRuleId": "rule-sample-04", "revision": 3,
    "category": "outro", "rule": {"kind": "tail", "seconds": 90},
    "source": "community-reviewed",
    "evidenceRefs": ["evidence-sample-9"],
    "licenseId": "own-contribution-v1", "status": "LIVE"
  }],
  "cacheMaxAgeSeconds": 300,
  "validUntil": "2026-11-22T15:00:00Z",
  "revocationEpoch": 7
}
~~~

投稿示例与响应，**本地保存不会自动触发此 POST**：

~~~json
{
  "protocolVersion": 1, "idempotencyKey": "uuid-generated-once",
  "episodeId": "episode-sample-04", "editionId": "edition-sample-cutA",
  "category": "intro", "rule": {"kind": "fixed", "start": 0, "end": 90},
  "durationBasisSeconds": 2880, "licenseGrantVersion": "contribution-v1",
  "evidenceRefs": ["evidence-sample-9"]
}
~~~

~~~json
{"status":"PENDING_REVIEW","contributionId":"contribution-sample-42","publicRuleId":null}
~~~

错误码与受控恢复：400 INVALID_REQUEST/UNSAFE_IDENTIFIER；401 AUTH_REQUIRED；403 PUBLIC_CONSENT_REQUIRED/ENTITLEMENT_REQUIRED/MODERATOR_ONLY；404 NO_MATCH（正常无候选）；409 REVISION_CONFLICT/MAPPING_CONFLICT/REBASE_REQUIRED；410 RULE_REVOKED；422 INVALID_RANGE/EDITION_INCONSISTENT/SCHEMA_UNSUPPORTED；429 RATE_LIMITED；503 SERVICE_UNAVAILABLE。错误体含 requestId、error.code、safeMessage、retryable；不透出内部 token、全 URL 或浏览资料。投稿 ACK 未知时以 idempotencyKey 查询实际回执，不能换新键盲重试；云读失败不影响本地操作。发布/撤销和 activeRevision、revocationEpoch 在同一事务内更新并生成可缓存的 invalidation。

## 7. 隐私、许可证、公共治理

**四个独立事实：** 用户账号登录、个人私有规则云同步同意、公共规则查询同意、针对特定数据的主动公开贡献。登录不自动允许查询或公开投稿；退出公共查询只停止云匹配与清理合规缓存，不删除用户本地规则。服务端用户身份由共用 IdP 验证得出，禁止调用方在请求体自报 accountId。令牌必须留在可信宿主/授权客户端，不进入网页脚本、公开规则、日志。

一旦云查询发送作品/资源键就可能泄露正在观看的内容。MVP 默认离线优先、受支持页面才请求、没有稳定且非个人化 siteAssetKey 时不发送；只发送 siteId、最小合法资源键（或有限摘要）与 duration，不发送完整 URL、Cookie、Token、网页正文、字幕、视频、个人历史、播放位置。任何标题搜索必须由用户主动操作并看到披露。服务端访问日志、异常上报脱敏、缩短保留、限制速率；关闭公共查询立即阻止新请求。哈希作品 ID 在词典小、可枚举时可能被反查，因此不宣称 SHA-256 等于匿名；k-anonymity 前缀检索只是未来候选，需要证明真实集合匿名程度。

公共贡献仅含经过用户确认选择的 intro/outro 标记与合法来源；服务端存来源 licenseId/授权文本版本，不把私人设置/next 一起上传。重复检测使用 episode+edition+category+range 容差和修订关系；互斥标记进入 NEEDS_CONFIRMATION/QUARANTINED，不按票数直接选择。投稿需账号/会话限流、防重复请求、审核队列、异常贡献降权；投票和信誉不能提升硬性不兼容为 APPLICABLE。允许纠错、撤销、投诉、版本历史及申诉；撤销发布 tombstone，使在线客户端尽快停止旧规则自动跳。离线超过有效期的公共缓存不得继续自动执行，可作为带“过期需核对”候选；已经由本人明确保存为个人规则的独立本地记录按本地规则处理。

**版权与商业边界核查（2026-11-22）：**
- SponsorBlock 的官方 API/数据库说明 CC BY-NC-SA 4.0，未另获许可时不可直接把它作为商业 VIP 数据商品；客户端代码许可证与数据权利也不是一回事。官方：https://github.com/ajayyy/SponsorBlock/wiki/Database-and-API-License ，隐私前缀借鉴：https://github.com/ajayyy/SponsorBlock/wiki/K-Anonymity 。
- AniSkip API 以 MAL ID + episodeNumber + episodeLength 查找并支持 vote，具体见 https://api.aniskip.com/docs ；即使其扩展开源，不代表时间数据库获得了商业再分发许可，需另外核验/取得授权。
- Anime Skip 的公开组织含 GPL-3.0 代码仓库：https://github.com/anime-skip 。这不自动回答网站数据的商用许可。
- IntroDB 的开放数据页声称 ODbL v1.0 且允许商业使用，但有署名、衍生数据库共享/提供副本等要求：https://api.introdb.app/open-data/ 。不能未经法务/条款审计直接混入封闭收费数据库。
- 因此 M1 默认只用**自行创建/有明确合法授权的数据和映射**；第三方库先做许可台账，不直接导入/打包/售卖。

## 8. 最小 UI、Free/VIP 与商业指标

320/360/400px 侧栏保留 R11 的简洁时间框、End、实线滑轨、独立跳过开关和唯一“保存设置”按钮。默认无“上传/赞/云匹配/匹配设置”常驻大按钮：正常仅在当前来源有意义时显示“沿用个人规则 / 公共已验证标记”；证据不足时就近出现“找到候选 · 需核对”，展开后简洁展示来源/时间/版本与“仅本集采用 / 不使用”；NOT_APPLICABLE 不给强行应用按钮。已拒绝的不重复打扰。公开贡献与完整修订记录放到未来 PC 已保存规则管理的二级动作，明确预览上传字段。私有云同步状态走共用账号入口，不能与公共来源混淆。

| 权益建议（未定价、未上线） | Free | VIP |
| --- | --- | --- |
| 本地保存、跳过、连播、已证实本地继承 | 一直可用 | 相同 |
| 合法公共候选读取 | 同意后展示/手动确认；有合理配额 | 同样安全证据，更多便利缓存 |
| 跨站自动复用 | 谨慎，必要时手动 | 在严格 APPLICABLE 时自动采用，省去重复设置 |
| 私有云恢复与历史 | 基础导出或体验额度待定 | 复用共用 VIP 权益/备份/双设备 |
| 到期、断网 | 不影响本地数据 | 到期降级，不删除规则、不放宽旧公共缓存安全 |
| 自愿纠错 | 允许 | 同样允许，无特殊审核豁免 |

VIP 不是“更冒险地跳”；两个档次使用同一匹配安全门。商业价值用真实指标验证：每百次兼容播放省去多少次手动设定/确认、误跳投诉率、候选命中覆盖率、服务 95 分位响应、撤销传播时间、每千次查找成本、升级后保留率。M1 最小化请求，只允许有效缓存、限频、负缓存与聚合统计，禁止记录用户每部作品的观看历史。缓存 TTL=300 秒只是示例预算，须从真实撤销与负载实验确定。

## 9. 特殊内容决策清单

| 情况 | 唯一安全处理 |
| --- | --- |
| 两个不同作品同名/同片长 | 未核实 identity UNKNOWN；已知不同 NOT_APPLICABLE |
| 同作品不同剪辑/同片长不同时间轴 | EDITION_DIFFERENT → NOT_APPLICABLE，fixed 不跨版 |
| A 有插入广告/B 无广告 | 时轴不同须核对，不能按片长比例换算 |
| 同集多线路/站点换源 | 重新比对 asset、edition、binding，废弃旧待执行 seek |
| 两集合成一个视频 | 没有证实 segmentMap → NOT_APPLICABLE |
| 特别篇/合集/预告/花絮/跨年 | content_kind 单独建实体，不用普通集默认 |
| 前剧情后片头 | 支持 fixed 的非零 start，不默认从0跳 |
| 片尾后彩蛋/中途剧情 | fixed 保留尾部；复杂多段首版拒绝自动猜测 |
| 45/48分钟兼容两集尾部最后90秒 | 2700→2610；2880→2790，仅已确认规律适用 |
| 无限时长/直播/未知时长/seek失败 | UNKNOWN，不运行 |
| 公共两个互斥值 | NEEDS_CONFIRMATION / 审核隔离，不依“高票”盲选 |
| 个人关闭、拒绝、公共撤销 | 字段遮蔽、静默抑制、阻止之后公共 seek |
| 播放中收到新规则 | 固定本次 revision；普通更新只作用下一次绑定 |
| VIP 到期/账号切换/同步异常 | 私有隔离、保留历史、本地照用；外来结果 fencing |

## 10. 按证据分级的验收矩阵（当前 R12 全部 NOT_TESTED）

等级 U=纯函数单元/模拟，I=真实 API/事务，C=真实 Chrome/合法本地媒体站或真实网站，D=双 Profile/真实双机，S=隐私/权限/滥用专项。不能混为 PASS。

| Case | 预期 | 等级 |
| --- | --- | --- |
| R12-01 | A 站规则在 B 站经**同版**审核映射后正确复用；真实两站另验 | U/I/C |
| R12-02 | 相似名称、相同时长的不同作品不误跳 | U/I/C |
| R12-03 | 同作品不同编辑版 fixed 不跨版本直接平移 | U/I/C |
| R12-04 | 45/48分钟兼容集 tail=90 得 43:30/46:30 | U/C |
| R12-05 | 普通/特别篇/合辑严格隔离 | U/I/C |
| R12-06 | 单集例外、显式 null/disabled、本人规则压过公共，不影响别的字段 | U/C |
| R12-07 | 两条公共候选时间冲突，不自动选择 | U/I |
| R12-08 | 用户拒绝后不反复提示、自动执行 | U/C |
| R12-09 | 503/断网/超时不影响本地保存/跳过/连播 | U/I/C |
| R12-10 | VIP 到期不损坏本地与历史，服务端拒绝非授权写入 | I/C/S |
| R12-11 | A/B 两个账号数据不混读写；迟到同步响应 fencing | I/D/S |
| R12-12 | 私有同步记录与公开贡献分开，不经主动投稿绝不公开 | I/D/S |
| R12-13 | 已发布公共规则撤销后，旧客户端/缓存停止之后的自动跳 | I/C |
| R12-14 | 播放中普通修订不突然更改已固定端点，紧急撤销可阻止后续 | U/I/C |
| R12-15 | 未授权的公共查询/贡献请求为零；日志不记录私人 URL/Token | I/C/S |
| R12-16 | rules.v1 迁移、容量不足、异常后旧版本可恢复 | U/C/D |
| R12-17 | 模糊候选、未识别版、未知时长只出 UNKNOWN/NEEDS，评分不可绕硬阻断 | U/I |
| R12-18 | 恶意重复投稿、刷票、无有效来源许可被限速/隔离 | I/S |
| R12-19 | iframe、换源、页面切集、旧回执不会跨视频定位 | U/C |
| R12-20 | 私有恢复先 CAS 合并+旧业务 validator，公共库永不修改 next | U/I/C/D |

阶段门禁：M0 只得声明 U 完成；M1 需要 I + 本机合法 A/B 夹具 C，**“真实双站”还需两个不同实际网站 C**；M2 需要真实投稿/审核/撤销 I；M3 需要共用账号/R3 的隔离、同步、恢复及 D。真实安全测试/商业许可仍独立签收。

## 11. MVP 分阶段与新增潜在功能

**M0 合同/本地纯函数**：保留现有 rules.v1，不改正式扩展安装包；新增当前媒体证据→四态→字段候选的可测试纯函数与合法 A/B 双站 fixture，验证负例、容量闸门。
**M1 小规模只读**：人工核验有限作品/两个站点、最小 HTTPS 公共查询、来源及修订号、同意、缓存和撤销；不开放公共写入。实际站点选择须用真实可用性、合法授权与精度证据，不能拿本地夹具当真实站点。
**M2 投稿与审核**：共用 Identity 最小可用后，主动贡献→去重→待审→审核→公开→纠错→撤销→历史；M2 不需要先实现 VIP 或双设备完整同步，但绝不可自行复制账号服务。
**M3 私有云+VIP**：依赖统一账号 R3 的 S00–S07、身份分区、容量迁移、可靠 outbox、历史与权益，通过实际两设备；免费到期保留本地。
**M4 规模化**：更多站点、合法元数据、AI 只辅助候选、多段复杂内容、管理后台和更广商业化。AI/大影视数据库/正式支付不是 M0–M2 前置。

| 可发现能力 | 用户价值 | 依赖 | 难度/维护 | 优先级 |
| --- | --- | --- | --- | --- |
| 站点资源/剪辑版的人工纠错 | 少误认同片 | 映射来源 | 中/中 | M1 P0 |
| 公共规则版本/撤销与错误反馈 | 避免旧规则反复误跳 | 修订索引 | 中/中 | M1/M2 P0 |
| 社区无片头/无片尾确认 | 少误提示 | 分类和审核 | 低/中 | M2 P1 |
| 社区声誉、举报与反刷票 | 公共质量可控 | 账号、审核 | 中/中 | M2 P1 |
| 前情提要/下集预告跳过 | 节约重复片段 | 新 category | 中/中 | M4 P2 |
| 彩蛋及中途重要片段保护 | 不漏剧情 | 多段/保留段模型 | 高/高 | M4 P2 |
| 多段片头与插播片段 | 复杂节目复用 | 安全区间与新 UI | 高/高 | M4 P3 |
| AI 声纹/视觉辅助分段 | 省标记成本 | 有权媒体、人工复核 | 很高/高 | M4 研究 |
| 合法外部电影/动漫元数据 | 多语种、多站召回 | 元数据授权 | 中/高 | M4 P2 |
| 站点适配器审核与共享 | 扩大兼容范围 | 可信安装/权限合同 | 高/高 | M4 P2 |
| 播放源健康提示及多站切换 | 播放连续性 | 站点许可、K0/K2 | 高/高 | M4 P3 |
| 观影历史与画像推送 | 潜在推荐 | 高隐私风险/非核心 | 高/很高 | 首版不做 |

## 12. 模拟专家评审、风险与下一步

反方优先攻击：同名同片长误匹配；A/B 站同剧不同剪辑；社区投票刷量；禁用 null 被当成缺失；VIP 销售非商业许可数据；哈希观看 ID 被词典反查；离线长期使用被撤销规则；账户 A→B 串写；rules.v1 8 KiB 容量损坏；本地两 fixture 冒充真实跨站验收。设计修订采用硬阻断、按字段遮蔽、证据与许可来源、授权分离、有限缓存与立即撤销、R3 账号隔离、旧数据保护以及分层签收。仍需真实验证：第二实际网站、映射维护成本、商业授权、数据留存条款、IdP 和 SQL 部署选择、效益数据及跨设备真实回执。

| 模拟角色（满分100） | 设计自评 | 尚未获得的证据 |
| --- | ---: | --- |
| 产品体验/用户收益 | 96 | 真实节省次数与交互测试 |
| 跨站身份/版本兼容 | 95 | 两真实站点误识别率 |
| 扩展离线与 seek | 96 | Chrome 硬件/网站回归 |
| 数据库/API 一致性 | 96 | 事务、并发、撤销实测 |
| 云成本/VIP | 95 | 成本与付费意愿 |
| 隐私/安全/合规 | 95 | 安全审计和许可证核实 |
| QA/错误风险 | 96 | 真机、双机、API 专项 |
| **算术平均** | **95.57 / 100** | **全部 R12 真实集成验收 NOT_TESTED** |

以上是**同一模型模拟七种角色的设计覆盖度评分**，没有外部独立专家背书，也不是商用准备度/真实验收评分。任何正式发布必须再次验证，不能用 95.57 替代测试成绩。

**给本地 Codex 的唯一下一阶段任务：R12-M0。** 只读核验本设计、REQUIREMENTS F9、rules.js、main.js、src/page/main.js、tests 与 dev 夹具；设计/实现无联网的最小 matchEvidence→matchDecision 纯函数模块，明确四态、reasonCode、身份/版本/来源分离、个人显式关闭优先、tail/fixed 复用原 validator。采用 A/B 不同 siteId 同 edition 的合法本机夹具，再加同片长异作品、异剪辑、合辑/特别篇、用户拒绝、冲突、未知时长/断网等负例。执行原 npm --prefix projects/video-auto-skip test 与新增定向测试，保留正式包、播放器与既有读写路径不改；输出真实修改文件/回执与所有 NOT_TESTED 范围。未具备真实 API 及两个不同实际站点证据不得宣称 R12-M1 完成。

## 13. R12.1 · Payload CMS 最小模拟后端、按需请求与 VIP 配额前置（2026-11-22）

> 状态：DESIGN_ONLY / NOT_IMPLEMENTED / NOT_TESTED。此节补齐此前遗漏的云查询触发/费用防护闭环；对于旧 M0「只实现纯函数，后做后端」的安排，以本节的 R12.1-S0/C0/E0 联调顺序为准。不能按旧 Codex R12-M0 提示词直接启动正式开发；不重复 R10/R11 或统一账号 R1–R3。

### 13.1 问题、基线与决策

最终用户收益是「一次设置，经验证的兼容视频复用，不误跳剧情」；后端的价值只在当前媒体没有足够本地规则时，提供受限的、可验证的公共候选。客户端**本地规则已足够 → 不发请求**；没有可信媒体身份、未经公共查询同意、会员权益不允许或缓存命中 → 同样不发请求。前一版方案有缓存、限流、VIP Entitlement 原则和候选 API，但尚未冻结每次请求的 eligibility 判定、计数预算、模拟服务端、完整端到端测试。现有 main 的 services/ 定向目录核验仅见 analytics 与 cookie-share-relay，未发现可直接复用的 Payload CMS 项目；共用云账号 R1–R3 明确 NOT_IMPLEMENTED。

**推荐技术路线**：Payload CMS 负责 Admin 目录管理、作品与剪辑版映射、人工审核、修订状态以及服务器内部数据库读写；一个受控的自定义 HTTP API 负责身份、许可、VIP 权益、限流、索引匹配和最小字段返回。服务端身份/Entitlement 后期复用统一账号设计，**不为视频扩展另建真实用户账号、支付、同步引擎**。后端建议与其他工具共享单一部署，目录候选 services/cloud-api/（实际创建前确认项目 owner）；产品规则算法仍属于 video-auto-skip。M0 模拟环境可采用 Payload + SQLite，正式 Postgres 需独立验证迁移及事务；SQLite 默认不启用事务，不能以 SQLite 演示冒充正式并发修订/撤销事务验收。Payload 官方支持 SQLite 和 PostgreSQL；本阶段不做部署承诺。

### 13.2 最小 Payload 集合与只读接口

开发级五个集合：video-works、video-episodes、video-editions、video-site-assets、video-public-rules。保留作品、集、内容种类、剪辑版时间轴、siteId+脱敏稳定 assetKey、审核来源、时长依据、intro/outro（fixed / tail）、publicRuleRevision、status（LIVE/REVOKED/QUARANTINED）、licenseId。season/alias/细粒度 MatchEvidence/RuleRevision 作为已有 R12 概念模型，M0 不强制拆多张表；正式 M1/M2 需加约束/审计/修订历史。管理员录入两个虚构 siteId 的同一兼容 edition，另外存不同作品同名同片长、异剪辑、特别篇、合辑、冲突、撤销负例。

仅暴露一个业务读接口：POST /api/video-rules/match。请求最小字段 protocolVersion、siteId、opaqueAssetKey、durationSeconds、neededFields（intro/outro）；可由可信请求上下文取得账号与权益，**禁止客户端上传 vip=true、accountId 并作为判权依据**。返回 MATCHED/NO_MATCH、经审核候选的规则/映射修订、evidenceRefs、内容/版本、revocationEpoch、cacheTtlSeconds 和安全错误码，客户端最后使用原规则验证器决定是否 seek。NO_MATCH 可返回 200 的业务状态供负缓存。CMS 自动生成的 Collection REST/GraphQL 不直接对普通扩展用户公开；非管理员 Collection CRUD 由访问控制拒绝，员工 Admin 登录仅为运营工作使用，不是第二套消费者账号。

注意官方 Payload Local API 默认可能绕过 Collection Access Control。自定义 API 必须先做服务器身份、Entitlement、consent、quota、参数检查，再执行受控内部查询；若需要业务用户权限调用则显式 overrideAccess:false + 可信 user，若特权查询也必须仅限通过全部闸门后的内部代码。参考 https://payloadcms.com/docs/local-api/access-control 与 https://payloadcms.com/docs/rest-api/overview 。

### 13.3 客户端何时发送？严格短路判定

**仅在可靠的新媒体绑定完成后评估**；不可因 timeupdate、progress、pause、滑块、输入、侧栏开关、React 重渲染、相同 SPA 导航重复触发。可信宿主/cloud adapter 负责 HTTP；页面脚本不得持有用户 Token。

顺序（任一失败，0 HTTP match 请求）：

1. 已安装批准的受支持网站，已发现可信主视频，不是广告/预告/直播/受限 iframe；当前主媒体绑定稳定，duration 有限可信且可 seek。
2. 站点适配器合法产生白名单 siteId + 非个人化稳定 opaqueAssetKey；仅网页标题或相同片长不能触发自动云查询。换源/换集先取消旧代际 pending，再稳定后判断。
3. 读取当前本集显式覆盖和作品/季合法默认规则（含可用私人云规则已按共用 CAS 合并入本地）。按 intro/outro 逐字段求缺口：已有有效覆盖或用户显式 null/disabled/拒绝不算缺口；两个字段均解决 → 0 请求；仅 outro 缺失 → 只请求 outro。next 只走本地，不公开查询。
4. 当前账号与产品已明确同意公共查询；只登录或者开启私有同步不等于允许公开查询。
5. 客户端共用权益摘要明确拥有 video-rules.auto-match，且尚未过期；M0 推荐 VIP 才允许自动云查询，Free/Guest=0 自动请求。以后如允许 Free 手动查询，需单独用户点击 + 权益码 + 配额，不能悄悄扩大自动请求。
6. 检查本机合法公共缓存、NO_MATCH 负缓存、同 key in-flight single-flight 去重、网络状态、403/429/503 的退避窗口、客户端节流。键包括 account/profile、site/asset、媒体版/时长基准、需要字段、consent/entitlement epoch；切换账号需严格分区，不复用旧账号候选/响应。
7. 只有上述条件全部满足，发送**一次**限字段查询。返回后重新核对 mediaGeneration、当前视频、来源修订、缓存租约与本地优先级，再由原播放器实现负责真实 seek。用户手动回看/撤销与当前会话 pin 行为不改变。

VIP 权益 bootstrap 仅在登录、账户/套餐改变、缓存到期或显式刷新时受控读取；不要每打开一集都请求一次权限服务。客户端权限判断只为省请求，不能替代**服务端每次匹配请求的最终授权**。

### 13.4 服务端拒绝顺序与滥用防护

先做请求大小/IP 粗限速 → 受信 Token/会话认证 → 服务端当前 account/product/query consent/Entitlement → 账号级原子配额与突发限流 → 校验 siteId/assetKey/duration/neededFields → **精确索引**查询 (siteId,opaqueAssetKey) 的 ACTIVE 映射 → 查相应 edition 的已审核 LIVE 合法规则 → 返回最少字段。已拒绝会员/配额的请求在昂贵作品查询之前终止；服务端不信任客户端自报的 VIP 值或局部覆盖判断。不可由不可信 X-Forwarded-For 伪装 IP。当前测试可用进程内限流器与仅 localhost 可用的 dev token（VIP/Free/Expired/Revoked），**仅适合单进程演示**；正式多实例需要共享原子计数（例如 Redis/数据库）和真正统一身份。未经真正授权时关闭公网监听、生产禁用模拟特权。

错误与客户端处理：401 AUTH_REQUIRED，403 ENTITLEMENT_REQUIRED/PUBLIC_CONSENT_REQUIRED，429 RATE_LIMITED + Retry-After，400 INVALID_REQUEST，409 MAPPING_CONFLICT，410 RULE_REVOKED，503 SERVICE_UNAVAILABLE。403 失效本地权益摘要并避免同状态反复查询；429 尊重 Retry-After；503 指数退避；请求失败不影响本地跳过，不重放副作用。

### 13.5 缓存与请求预算（均为待测实验初值）

- 同一稳定媒体 + 所需字段 + 账号授权代际：有效期内最多一次 match HTTP，相同并发请求合并；相同 video 的播放进度/暂停/编辑/打开侧栏为零额外请求。
- 正向自动采用租约可先用 10 分钟；租约到期/离线无法核验撤销，不得继续无条件自动采用旧公共规则。NO_MATCH 负缓存可先用 60 分钟；冲突候选仅供核对，短缓存如 5 分钟；真实 TTL/撤销 SLA 要由后续测试确定。
- 示例服务端配额可先测试每账号 5 次/分钟、60 次/日（**不是正式会员权益承诺**），同时设置全局和网络来源保护；有实际请求成本和用户活跃度数据后再调。
- 区分统计 mediaBindings、eligibleMedia、localCovered、clientDenied、cacheHit、negativeCacheHit、singleFlightSaved、httpMatchCalls、dbLookups、serverAuthDenied、serverQuotaDenied、falseSkipReports；只存脱敏聚合指标，不建立用户观影明细日志。
- 撤销规则需修订号/失效水位及有限自动使用租约；不能凭很长 TTL 假称能及时撤销，紧急撤销停止尚未触发的公共自动 seek，不能逆转已经发生的 seek。

### 13.6 真实最小联调验收与修订后的推进顺序

每个用例需报告 **实际客户端 HTTP 次数 / 服务端 DB lookup 次数 / HTTP 状态 / 客户端四态或本地 fallback**，模拟与真实结果分开：

| 输入场景 | 期望的 match HTTP |
| --- | --- |
| Guest、Free 默认自动匹配；VIP 未同意公共查询 | 0，伪造直调在服务端拒绝 |
| 有效 VIP + 完整个人片头片尾/明确禁用 | 0 |
| VIP + 可信媒体 + 仅一个字段缺口、未缓存 | 1，服务器只查该字段 |
| 标题相似但无合法稳定资源 ID、未知时长、受限网站 | 0 |
| 当前媒体频繁 timeupdate、反复开关侧栏、相同 SPA 路由 | 0 额外请求 |
| 同 key 并发多个消费者、合法正缓存、NO_MATCH 负缓存 | 0 额外网络调用或合并为 1 |
| 新 episode/edition 且合法授权 | 重新评估；必要时 1 |
| VIP 到期、切换账号、撤销授权 | 预检 0 或服务端 403；不串号 |
| 过多请求 | 429；不做昂贵作品 DB 查询 |
| 后端断网/503 | 本地仍可跳过，退避不反复请求 |
| 虚构 Site A 与 Site B 同版 | 能查到相同兼容性证据，旧规则通过客户端安全验证 |
| 异剪辑、特别篇、合辑、冲突或公共撤销 | 无危险自动 seek |

**调整实施顺序：** R12.1-D（当前仅形成设计）→ R12.1-S0（Payload 本地模拟服务端、Admin 种子和服务端权限/限流）→ R12.1-C0（客户端纯函数 + cloud eligibility + 缓存 + 可信传输适配）→ R12.1-E0（真实 localhost 两站 fixture 的 0/1 请求及 403/429/断网/兼容性联调）→ M1（两个不同的真实网站和正式授权后端）。S0/C0 可各自实现和单测，但在 E0 联调通过前不得宣称云匹配已实现。M2 社区投稿与 M3 统一账号/VIP 双机恢复后置。

**已完成的只是本 R12.1 设计**，没有执行新代码、搭起 Payload 后端、购买套餐、正式部署、会员真实鉴权或完成本地/Chrome 联调。下一轮 Codex 应以本节取代之前纯本地版的旧 M0 提示词，避免跨对话重做。
