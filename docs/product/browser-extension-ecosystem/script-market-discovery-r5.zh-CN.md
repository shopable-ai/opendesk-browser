# OpenDesk Browser Script Market Discovery R5

> 2026-10-15；状态：**发现/评分协议草案，NOT_SCORED / NOT_EXECUTED / NOT_MARKET_VALIDATED**。输入文件：[24 领域 × 48 页面任务种子](domain-relevance-universe-r5.seed.json)；权威机会与商业实验依旧只有 [84 OPP](opportunity-register.json) 和 [8 EXP](commercial-experiments.json)。**此处的外部候选快照不是第二个机会账本**。

## 1. 多来源公开发现：字段与约束

| 来源 | 应核实的数据 | 不可推断/禁止动作 |
| --- | --- | --- |
| [Greasy Fork 搜索](https://greasyfork.org/en/search)、[站点脚本列表](https://greasyfork.org/en/scripts/by-site/bilibili.com) | 具体脚本永久 ID、作者、版本、`@match/@grant/@require`、`@license`、脚本详情、每日/累计安装快照 | 累计安装≠真实活跃、留存、收入；不要未经许可批量下载、执行或重新打包脚本 |
| [ScriptCat 官方文档与脚本市场入口](https://docs.scriptcat.org/) | 脚本永久 URL、适配站点、后台/`@crontab` 能力与脚本作者权限 | ScriptCat 宣传装机数≠脚本留存；其 GM/后台功能≠ OpenDesk 已验收 |
| [Chrome Web Store](https://chromewebstore.google.com/) | 商店唯一 ID、版本、显示用户、近期更新、评论、权限、隐私说明 | 商店展示用户数≠ DAU；页面展示增长≠实测安装增长或付费 |
| [Edge Add-ons](https://microsoftedge.microsoft.com/addons)、[Firefox AMO](https://addons.mozilla.org/) | 相同任务的不同浏览器产品、权限和对应发布 | 同名不等于同开发者、相同源码；地区可用性分开查 |
| [GitHub](https://github.com/) 与作者项目 | 仓库、许可证、依赖、tag/release、Changelog | GitHub Star≠用户活跃、用户收入；开源仓库≠所有资源可商用 |
| 网站/API 文档与直接用户证据 | 站点实际页面操作、角色权限、官方导出/API、真实买方/频率/成本 | 未经许可不进入私有后台、不使用用户 Cookie、不得绕过反自动化或访问控制 |

采集之前先核对服务条款、robots/使用频率/API 范围；若公开页面不可访问或不能批量查询，记录 `ACCESS_RESTRICTED` 并改为人工核实。不得把“研究程序长时间运行”当作无限制抓取理由。公开仓库只保留来源链接、审慎的文本摘录与脱敏证据，不存个人资料或私有网页全文。

**发现路径**：`domainId → region → locale → siteHost/pageType → task action → userscript keywords → sourceId+externalScriptId → competitor storeId → evidence → existing OPP links → runtime feasibility`。先找具体任务，再找可以完成此任务的脚本和竞品；同一脚本支持多个网站时建立多条关系边，不复制为多个脚本。

## 2. 可由下一轮程序读取的结构及证据合同

输入 [`domain-relevance-universe-r5.seed.json`](domain-relevance-universe-r5.seed.json) 提供 `schemaVersion=opendesk.domain-relevance-universe-seed.v1`、`domains[].domainId`、`regionalResearch`、`siteTasks[]`、`scriptQueries[]`、`competitorSeeds[]`、`runtimeCandidates[]`、`existingOpportunityIds[]`。所有 24 域各有全球/中国/日本线索和 2 个独立网页任务，都是 HYPOTHESIS，不是已访问的网站事实。

后续发现运行的输出建议是 **JSONL、只放工作区研究快照**（不是新正式机会表）。下列字段协议中的 `null` 全是未知值，**绝不能理解为已经发现或没有用户**：

~~~json
{
  "recordType": "SCRIPT_CANDIDATE",
  "sourceId": "greasyfork",
  "externalScriptId": null,
  "canonicalUrl": null,
  "authorId": null,
  "displayName": null,
  "domainIds": ["D03"],
  "sitePageKeys": ["D03-S1"],
  "taskKeys": ["D03-T1"],
  "region": "global",
  "locale": "en",
  "script": {
    "sourceRevision": null,
    "sha256": null,
    "license": null,
    "licenseUrl": null,
    "meta": {"match": [], "grant": [], "connect": [], "require": []}
  },
  "extensionCompetitor": {"storeId": null, "extensionId": null, "version": null},
  "metricSnapshot": {
    "observedAt": null,
    "dailyInstalls": null,
    "totalInstalls": null,
    "cwsDisplayedUsers": null,
    "rating": null,
    "ratingCount": null,
    "realActiveUsers": null,
    "retention": null,
    "revenue": null
  },
  "businessEvidence": {
    "buyerRole": null,
    "weeklyRepeatCountObserved": null,
    "minutesSavedObserved": null,
    "actualAlternativeSpend": null,
    "paymentEvidenceIds": []
  },
  "existingOpportunityIds": ["OPP-027"],
  "evidenceIds": [],
  "status": "DISCOVERY_ONLY",
  "hardGates": {
    "license": "UNKNOWN",
    "privacy": "UNKNOWN",
    "platformPolicy": "UNKNOWN",
    "security": "NOT_AUDITED",
    "nativeChrome": "NOT_TESTED"
  },
  "conversionRoute": "UNDECIDED"
}
~~~

每条 `EVIDENCE` 记录至少包含：

| 字段 | 要求 |
| --- | --- |
| `evidenceId`、`candidateExternalKey` | 唯一稳定 ID；外部脚本按 source+permanentId、扩展按 store+extensionId 建键 |
| `sourceURL`、`publisher`、`sourceType` | 可核查的原始详情/政策/作者/评论页面，不用搜索结果摘要冒充源 |
| `claim`、`counterEvidence` | 只针对特定功能/指标主张，记录原生替代反证 |
| `observedAt`、`fetchedAt`、`version`、`locale` | ISO 8601 含时区；区分版本发布日期、抓取时间、页面显示的指标时间 |
| `method`、`snapshotRef`、`confidence`、`reviewer` | 操作方法/合规截图或摘要/可信程度与谁复核；不存受版权保护的全文或个人资料 |
| `sampleWindow`、`uncertainty`、`evidenceGrade` | 实际测量窗口、偏差、不完整性；来源时间过久需复核 |

去重规则：一个外部脚本用 `sourceId + externalScriptId`，不能用名称；跨站、不同语言与不同 DOMAIN 通过多对多关系记录。相同脚本跨来源的镜像以 `sameAsProof` 明确证明才能合并。外部候选与既有 OPP 链接只有在问题/角色/输出一致时挂接，**不得**因此再创建 OPP。保持 `UNKNOWN`、`NOT_MEASURED`、`NOT_TESTED` 为真实缺失数据；只有明确实测 0 才用数字 0。

## 3. 双榜评分——不同评价函数、独立证据、不通过不能上榜

**榜 A：`CONSUMER_UTILITY` 大众热门实用工具**。目的：发现普通人在网页中可立即获得的功能，**热门线索不是商业收入**。

| 维度（独立 0–5 / null） | 如何验证 |
| --- | --- |
| C1 页面任务相关性 | 目标用户、对应页面、真实操作路径与任务结果 |
| C2 新增采用迹象 | 同一平台相同指标至少两次可比快照、注明周期与噪声 |
| C3 首次使用成功 | 真实浏览器走通的步数、耗时、失败率 |
| C4 产品体验 | 可关闭/键盘/本地化/原网页干扰/用户反馈反证 |
| C5 维护可靠性 | 站点 DOM、版本、脚本失效、修复时长 |
| C6 信任与权限成本 | 源码公开性、权限范围、隐私与用户明确授权 |

**榜 B：`PRO_WORKFLOW` 专业商业工作流**。目的：寻找真实购买者愿为重复业务价值持续付费的工作流，**不按插件安装人数简单排**。

| 维度（独立 0–5 / null） | 如何验证 |
| --- | --- |
| B1 同岗位重复频率 | 真实使用日志或匿名访谈，记录观察窗口 |
| B2 节约工时/错误成本 | 原生方法、Excel、头部竞品三路同任务对照 |
| B3 买方/预算/续费可能性 | 审批角色、真实支出/已付订单或规范报价 |
| B4 合法数据和授权可得性 | 网站条款、官方导出/OAuth、账号角色与公司授权 |
| B5 独立差异化 | 免费原生功能无法覆盖的具体操作证据 |
| B6 交付及维护经济性 | 站点变更率、售后、回归工时、部署难度 |

维度格式：`{value:0..5|null, evidenceIds:[], explanation, uncertainty, evaluatedAt}`。**先记录每个分项，再按版本化排序算法排序**；若无所需实测不能公开为市场排名，临时“待调查优先序”必须标为 `RESEARCH_ORDER`。分数只能在相同同类任务、相同区域、相近时间的样本中比较。可以在证据足够时制定不同榜单的权重，但权重版本/敏感性分析必须同时保留；不得把缺失值补 3 分或用平均分抹平任何硬门。候选没有可比数据即 `NOT_SCORED` 而不是 0/100。用户明确要求的 95+ 仅可代表有凭据的方案审阅质量，不能假冒真实市场认可。

**独立否决门（与两榜并列）**：`LICENSE_BLOCKED`、`DATA_PRIVACY_BLOCKED`、`PLATFORM_POLICY_BLOCKED`、`SECURITY_BLOCKED`、`TECH_UNSUPPORTED`。任何一项阻断 => `EXCLUDED_BY_GATE`，再高的安装迹象、潜在营收或工程分数也不能强行启动/分发。

特别禁止：把 Greasy Fork 累计安装当活跃用户，把 CWS 展示用户当留存，把 GitHub Star 当付费客户，把脚本评价当真实需求，或凭网页关键词量预测收入。

## 4. AI 辅助转换/分发四条合法路径

| 路线 | 判定门槛 | 交付形态 | 严格禁止 |
| --- | --- | --- | --- |
| A 合法原脚本直接兼容 | 原作者许可和使用权可确认、代码/依赖来源可审、匹配网站/世界/权限/GM 方法均实测 | 受控 Page 用户脚本，原始署名/Revision/hash 与逐站授权 | 把“原脚本可运行”误写为“可修改再发行/售卖” |
| B 获授权源码适配 | `LICENSE` 或作者明确许可允许本目的；依赖闭包、商用条款、修改和再分发均核对 | OpenDesk Page USER_SCRIPT 明确适配层和回归用例 | 拿热门闭源代码直接改名或复制 |
| C 按公开需求独立实现 | 只有可描述的用户任务/行为目标，采用独立实现与独立测试，无非法复制 | 新工具/网页脚本，保留任务证据与竞品比较 | 脱离网站政策、重做破解或通过代码变体规避权利 |
| D 拒绝 | 无许可、受限平台、需高危 GM/Cookie/MAIN 或未经授权页面、涉嫌版权/DRM、技术做不到 | 保留拒绝理由和备选需求 | 高安装量推翻否决门 |

**架构承接**：优先复用已有 installed-programs、metadata/依赖锁、源码 hash、Page UI、精确 origin/document 授权、Controller/Workflow、Marketplace Intent。Chrome `userScripts` 的例外只适用于官方许可的 User Scripts API 场景，不能允许远程代码进入有 Chrome 特权的 SW/Host。`G0/G1/G2/G3` 仅是 GM 兼容研究分级，必须按 [真实方法矩阵](../../architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md) 的逐项 SOURCE/NODE/BUILD/NATIVE 证据核验。敏感网站不得默认登录自动化或凭证提取。参考 [Greasy Fork 原站版权规则](https://greasyfork.org/en/help/code-rules)、[外部脚本规则](https://greasyfork.org/en/help/external-scripts)、[CWS MV3 要求](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)、[Chrome 用户数据政策](https://developer.chrome.com/docs/webstore/program-policies/policies)。

## 5. 下一轮研究程序的执行树与验收

~~~text
DISCOVERY-0 读取 main / AGENTS / 24 域种子 / 84 OPP / 8 EXP / GM & SDK 当前证据
DISCOVERY-1 W1→W4，域 × 全球/中国/日本 × 关键词+页面：公开来源检索
DISCOVERY-2 保存具体脚本/扩展永久ID、来源、时间、版本、作者与许可
DISCOVERY-3 多站任务映射、外部ID去重、原生替代反证；无结果保留 NO_RESULT
DISCOVERY-4 每个候选逐项 C1–C6 或 B1–B6 + hardGates，缺证据为 null
DISCOVERY-5 采用 A/B/C/D 转换决策；只允许审过权利/隐私/真实权限的工具试点
DISCOVERY-6 在原 OPP/EXP 中挂引用，不增建另一套 Browser SDK/能力账本
~~~

研究入口先行 7 域：D03 AI 网站、D01 网页体验、D04 视频、D07 阅读翻译、D13 开发者、D14 办公、D22 研究。优先对真实存在的 My Prompt、HTML5 Video Playing Tools、GitHub Internationalization 类脚本展开**永久 ID + 版本 + 许可**核查，而不是直接转换源码或开始开发 24 款工具。随后按 [领域分批顺序](domain-relevance-universe-r5.zh-CN.md) 推进。

**验收断言**：输入 JSON 可解析、恰 24 domainId、48 个网页任务、三地区线索皆非空；OPP 引用均存在，84 OPP/8 EXP 不变；每条外部指标有来源和 ISO 时间；缺失用 null 而非假 0；不得写入私有数据或不可用脚本源码；两份榜单不会无证据“第一”；失败的抓取必须显式 `FETCH_FAILED`；候选必须能被许可/安全门拒绝。所有“真实网站运行成功、用户活跃、支付转化”的指标在当前 R5 均保持 **NOT_TESTED/NOT_MEASURED**。
