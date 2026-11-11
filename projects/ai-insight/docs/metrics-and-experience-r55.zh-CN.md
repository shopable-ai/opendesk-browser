# AI Insight R5.5 · 指标与三端交互详细设计

> 任务：OD-AI-INSIGHT-METRICS-AND-THREE-SURFACES-DESIGN-R5.5  
> 时间：2026-11-12；范围：产品设计 + 脱敏可点击预览，不是生产采集或真实 Chrome 验收。  
> 继承：[R4 唯一产品研究](product-research.zh-CN.md)、[R5 数据合同](data-contract-r5.zh-CN.md)。这两份文档仍是概念与 Schema 的权威来源，本文件**只记录 R5.5 的功能、指标和交互决策**。预览以 ../preview/index.html 为唯一入口。  
> 证据标记：DESIGN_DECIDED（设计收敛） / PREVIEW_DEMO（模拟行为） / SOURCE_INSPECTED（源码只读核对） / NOT_TESTED（需原生/实站证明）。不能将前三种冒充真实授权采集或已验收能力。

## 0. 原始问题与唯一工作闭环

某浏览器 Bug 先在 ChatGPT A 修 40 分钟，AI 声称成功但用户复测失败；转 Claude B 调查 25 分钟，再回 ChatGPT C 做真实验收。AI Insight 将其保存为**同一个 Problem**，记录独立 Attempt、已确认 Conversation、可观察 Execution、待验证 Outcome 与证据，并保留“下次继续做什么”。前两次任务重叠时，已知请求跨度和为 65 分钟、区间并集 40 分钟，均不是用户工作时长。

核心闭环：**明确目标/验收 → 审核关联 → 观察可核实过程 → 保存有效结论/待验证 → 真实证据确认 → 恢复下一步/复盘**。三个 Surface 共用 Problem ID、确认后的关系边、Outcome 和同一计算定义；界面不能单独创造“成功”或以候选覆盖用户决定。

**北极星候选**：每周经用户确认、具备可追溯真实证据的有效 Problem 进展数；有证据地排除假设、解除阻塞或决定停止，也可算“推进”。**目前不得显示为经验证的效率提升 KPI。** 推荐辅助指标是待验证积压、恢复摘要可用性、被拒绝错误关联数和观测缺口，而非 AI 消息总量。

## 1. 具有真实操作场景的功能树

表内“来源”沿用 R5：O=可观察站点事件，D=可重算派生，I=推断候选，C=用户主动确认，V=可追溯独立验证，U=未知。I 不能被当作“事实”，V 不因出现模拟按钮就成立。所有功能均需 Origin/账号/scope 的目的性授权；无授权时只能演示或手动输入。

| 功能及真实场景（为什么/何时） | 用户操作与可检查输出 | 所需数据、可见性及边界 | Surface / 阶段 / 复用判定 | 有效性验收 |
|---|---|---|---|---|
| F01 问题登记：要修一个 Bug，却散落多个聊天 | 手动建 Problem，填写目标、通过条件、下一步；最近问题可重新打开 | Problem ID、goal/criteria 修订 C；不能从相似标题直接生成事实 | 网页快捷建/Panel 继续/PC 全编辑；P0；R5 Core 可复用 | 新建/改名不改变 ID，缺验收条件明示“待定义” |
| F02 智能关联：Claude B 可能是同一 Bug | 展示支持/反对理由，人工确认或拒绝；错关联可撤销 | Conversation 候选 I、关系边 C、revision/audit D；不同账号强命名空间 | 网页/Panel 快审，PC 证据查看；P0；Core 关联模型可复用 | 从 2→3→2 对话，平台数与已知时长同步可逆 |
| F03 拆分和多归属：一个会话含两项工作 | 选定关系边，拆为新的 Problem；或保留一 Conversation 对多 Problem | ProblemRelation / ConversationLink C；不可把共享会话复制成多个真实请求 | Panel/PC；P0；Core split 可复用 | 拆分不丢来源，主问题统计回算且子问题身份稳定 |
| F04 执行观察：长回答半途刷新 | 看到提交/首输出/完成/中断与未知；要求复核后才能结束 | O 时间戳 + 观察代际 + 间隙；未知右删失；页面活跃≠用户注意力 | 网页仅状态，Panel 摘要，PC 时轴；P0；Core 规则可参考，站点 Adapter NOT_TESTED | 60min 不完整样本不能显示精确 60min 完成 |
| F05 尝试和方向修正：第 3 次仍失败 | 给尝试标“试过、失败原因、下一验证”；可复开 | Attempt/Outcome C、Execution O、文件链接 C；有些旧会话无稳定锚点 U | Panel 快标，PC 详情；P0 仅手动记录，自动归因为 P1 | 尝试次数不等于提问次数，变更可追溯 |
| F06 声称与验证分离：AI 说已修复 | 标待验证、用户确认、上传或引用真实回执；失败可重新开启 | AI 自述 O/I（取决于正文授权）；用户 C；测试 V；预览中的 V 永远是 DEMO | 网页待验证，Panel 操作，PC 证据链；P0；Core Outcome 可复用 | 用户确认不产生独立 V；失败恢复不消除旧证据 |
| F07 恢复工作：中断数天后找不到结论 | 一键看目标、已确认结果、阻塞与待办，打开来源 | 最近用户确认结论/步骤 C，来源引用、更新时间；来源失效 U | Panel 首屏，网页展开，PC 历史；P0；knowledge-inbox 仅参考来源/交接 | 无需重新读整段聊天即可定位下一项明确动作 |
| F08 授权与数据控制：暂不想记录该网站 | 隐藏提示、暂停 Origin 观察、撤回权限、删除独占数据 | Consent/revision C；禁收后续事件；共享引用不误删 | 网页入口/Panel 快关/PC 全量；P0；R5 Core 模拟可复用，可信授权 API 未证实 | 撤权旧事件不可重放，关闭 UI ≠ 撤权且两者可分别检查 |
| F09 问题中心与钻取：同时推进多个项目 | 最近/阻塞/待验收问题排序，Problem→Attempt→Conversation/Execution→Evidence | 稳定 ID、最新关系修订、证据状态 D/C/V；无数据展示空状态 | PC 为主、Panel “全部问题”；P0；不创建平行知识库 | 导航回来仍指向同一 Problem，不由标题重算归属 |
| F10 每周复盘：为何经常重复解释 | 审核有证据推进与返工候选，手动保留可复用实践 | Outcome/V + 明确窗口；拒绝未经验证的模型胜率/节约分钟 | PC；P1；analytics、knowledge 仅读边界，非直接调用保证 | 每一条改善建议能链接到具体问题/证据 |
| F11 上下文与文件交接：另一个 AI 需要接续 | 用户选择脱敏恢复摘要，复用已有文件/交接机制 | 明确选取的 C 内容，独立正文/文件授权；不自动发送 | Panel/PC；P1；WebFlow/knowledge-inbox 仅后续评估接口 | 预览不会读取正文、不会自动打开新 AI 发消息 |
| F12 多 AI 质量/成本：评估哪次真正有帮助 | 看有证据的候选对比、真实服务成本（若供应方提供） | I/D/C/V；官方费用与估算必须分开，样本偏差大 | PC 可选；P2；无可靠跨站成本 API 证明 | 缺分母/证据/官方来源则不展示模型“最优”结论 |

**反方删减准则**：如果一次记录比恢复工作省下的操作还多，默认不强制填写；用户每一段 AI 对话不必创建 Problem/Attempt；只对“跨对话需要连续追踪”和“有争议的完成声明”提示确认。历史正文不做默认批量扫描。

## 2. 指标设计门禁与可信等级

每个指标必须分别回答：**能观察？值得统计？适合哪一层显示？** 可观察字段可以内部留存并接受清理，但未证明有助决策、容易误导的值不能成为首屏卡片。

- O：来自经授权、带时间戳和观察范围的页面信号；不是服务器权威事件。D：使用固定公式从 O/C/V 派生。I：启发式或模型推断，必须展示候选而非准确率。C：用户主动决定。V：绑定实际执行的独立回执/证据、检查范围和有效版本。U：缺失、歧义、跨时钟无法校准。
- **覆盖**：报出源范围（origin/account）、观察时间窗、精确样本数 n、未知/右删失数、无权限站点缺口；完整率只可定义为“已发现 Execution 中可完整计算的比例”，不能叫全部历史完整度。
- **时长**：只在起止同代际且无间隙时计算；未知不补零。并行多于两路时，sum−union 是“重复计数总量”，不是简单两路重叠时长；按 Problem 已确认关联去重执行 ID。
- **时间窗**：P0 默认当前 Problem 的完整已知样本；周报按用户本地 ISO 周或明确时区固定窗口，不将已删、未授权数据重建。账号切换后另列范围。
- **口径维护**：R5 Schema v1 不变。下面 P1/P2 新字段只是候选；需要新增观测事件或 Attempt/Outcome 属性时先写迁移与兼容 fixture，不擅自塞入生产模型。
- **展示裁剪**：网页默认最多 3 个信号（问题、待验收、观测状态），Panel 最多 1 个执行简述与 1 个下一步；PC 有可钻取样本、区间并集和覆盖说明。以下字典的“后台”意为可选本机派生且受授权约束，**不是跨站偷偷采集**。

### 2.1 完整指标字典：P0 12 项

表中“来源/等级”指出**生成依据**而非声称各站点已支持。“覆盖”是指标自己的缺失/删失处理，“隐私”具体区分元数据 M、正文 B（额外许可）、人工确认 C、证据文件 E（独立同意）。

| metric_id · 中文名称 | 用户决策价值 | 来源 / 等级 | 计算规则、分母、窗口 | 覆盖 / 缺失 | 隐私 | 展示 | 风险与禁止解释 | 验收案例 |
|---|---|---|---|---|---|---|---|---|
| `problem.active_count` · 在办问题数 | 先继续哪件事 | Problem 状态 C→D | 所选 scope 当前未关闭且非删除 Problem ID 数；n=有效 Problem；窗口当前快照 | 无授权/未建问题不推为 0 个真实任务 | C | PC/Panel 全部问题 | ≠用户总工作量 | 新建+1，关闭-1，复开+1 |
| `problem.pending_verification_count` · 待验收问题数 | 先验哪一项 | Outcome C/V→D | 状态 NEEDS_VERIFICATION 的不同 Problem ID 数；当前快照 | 无 Outcome 的 Problem 标 UNKNOWN，另列未知 n | C/E | Panel/PC；网页只当前问题 | AI 自述不能抵扣 | 标待验收+1；模拟测试变化须标 DEMO |
| `problem.linked_conversations` · 已确认关联对话数 | 不必重复找出处 | ConversationLink C→D | 对当前 Problem 的 CONFIRMED 去重 Conversation ID 数；当前快照 | 待审候选单列，账号 scope 缺失为 U | M/C | 网页展开/Panel/PC | ≠尝试数 | Claude B 关联 2→3，撤销 3→2 |
| `problem.linked_platforms` · 已确认平台数 | 查看跨 AI 范围 | 关联已确认 C + Provider O→D | 不同平台身份去重计数，当前 Problem；n=已关联会话 | provider 未识别不强行归属 | M/C | Panel/PC | ≠平台带来收益 | 关联 Claude B 从 1→2 |
| `problem.pending_links` · 待决定关联数 | 防错误合并遗漏 | Candidate I + 审核 C→D | 当前 Problem 的 PENDING 候选关系边数；快照 | 候选召回不足≠没有相关对话 | M；B 须另授权 | 网页展开/Panel/PC | 置信度非准确率 | 确认/拒绝均 -1；撤销可回 PENDING |
| `problem.attempt_count_confirmed` · 已记录尝试数 | 看试错路径 | Attempt C/D | 不同 Attempt ID 中经用户记录的数量；当前 Problem | 旧对话没有 Attempt 必标“未记录”，不把链接数代替 | C；B 另授权 | PC 详情 | ≠问答次数或失败率 | 一条 Conversation 可对应两次 Attempt |
| `problem.next_step_ready` · 可继续下一步 | 中断后立即恢复 | Problem.next C→D | 已存在明确非空下一步且未标过期的 Problem 数 / 已登记 Problem 数；当前快照 | 没有 next 计“待补”，不可自动生成确定事实 | C | 网页展开/Panel；PC 汇总 | ≠工作已完成 | 新建默认“定义验收”需标建议非真实完成 |
| `outcome.confirmed_progress` · 有证据推进数 | 周复盘有价值 | Review C + Evidence V→D | 固定周内发生用户确认且附可追溯证据的不同 Problem ID 数；n=该周已审问题 | 缺 V 不计；DEMO 单独计算且不混真实统计 | C/E | PC 周复盘 | ≠效率提升/解决数 | 仅 AI CLAIM 不计；模拟 TEST_PASS 显式 DEMO |
| `outcome.evidence_backlog` · 尚待验证成果数 | 发现完成幻觉 | Outcome C + Evidence C/V→D | NEEDS_VERIFICATION 的不同 Outcome ID 数；当前快照 | 没有 Outcome 时显示未知；有多 Outcome 不重算问题数 | C/E | 网页“待验收”、Panel/PC | ≠AI 错误率 | 用户确认无独立证据仍显示待证 |
| `execution.exact_sample_count` · 完整观察请求数 | 判断时间值可靠程度 | Execution O→D | 起止可核验且 FULL 的去重 Execution ID 数；所选问题/窗口 | 报 n / 全部已发现请求数；未发现历史不入分母 | M | PC，Panel 摘要 | “完整率”非历史覆盖率 | A/B 已知、C 断联 → n=2/3 |
| `execution.unknown_count` · 不完整或未知请求数 | 识别观察缺口 | Observation O→D/U | STATUS_UNKNOWN/缺端点/间隙/右删失的去重 Execution ID 数；问题/窗口 | 右删失与未知原因可分组；不以 0 填充 | M | 网页状态/Panel/PC | ≠失败请求数 | C 断联→未知+1；撤销关联重算 |
| `execution.known_sum_union_ms` · 已知请求跨度总和/并集 | 看观察到的执行并行 | 同 Problem 完整 Execution O→D | 精确请求区间长度求和（sum）与合并区间并集（union），ms；n=完整请求；范围当前问题 | 未知 n 明示，右删失区间不偷偷外推 | M | PC；Panel 仅摘要 | ≠工作时间、后台 CPU、等待浪费 | A 0–40,B 10–35 → 65/40；撤销 B→40/40 |

### 2.2 未来完整指标字典：P1 9 项（非 R5.5 必须实现）

| metric_id · 中文名称 | 用户决策价值 | 来源 / 等级 | 计算规则、分母、窗口 | 覆盖 / 缺失 | 隐私 | 展示 | 风险与禁止解释 | 验收案例 |
|---|---|---|---|---|---|---|---|---|
| `execution.first_visible_latency_ms` · 首输出观察耗时 | 排查长等待 | 首输出+提交 O→D | FIRST_OUTPUT−SUBMITTED；n=两端有效请求，当前问题/周 | 无首输出、断联为 null，保留右删失 n | M | PC 执行明细 | ≠服务端首 Token 延时 | 0→2min 值2；缺首输出不显示0 |
| `execution.output_observed_ms` · 输出可观察跨度 | 识别输出阶段异常 | 首输出+完成 O→D | COMPLETE−FIRST_OUTPUT，无缺口；n=完整样本 | 阻断为 null | M | PC | ≠推理耗时 | 2→40min 值38 |
| `interaction.prompt_edit_count` · 提问编辑次数 | 发现反复说明 | 授权页面编辑可观察 O→D | 同 Turn ID 上确认的编辑事件数；n=被观察 Turn；周 | 跨页、历史缺失单列 UNKNOWN | M/B 视内容而定 | PC 可选 | ≠糟糕提示词数 | 编辑1次 +1；DOM 重绘不重复 |
| `interaction.regeneration_count` · 重生成次数 | 区分再生成/新问题 | generation O→D | 同 Prompt 不同 generation 的有效再生成事件数；n=已观察 Turn；周 | generation 锚点缺失不推算 | M | PC 可选 | ≠失败率 | 原 Prompt 2 generations 计1次 |
| `interaction.error_stop_count` · 失败/停止请求数 | 排查可靠性 | ERROR/STOP O→D | 只计明确 ERROR/STOP，分别按 Execution ID 去重；周 | UNKNOWN 不当 ERROR | M | PC 执行 | ≠模型表现排名 | 刷新断联为 UNKNOWN，不计失败 |
| `problem.reopen_count` · 问题重新开启 | 查长期返工 | Problem 审核 C→D | CLOSE→OPEN/REOPENED 的审计转移次数；Problem/周 | 缺历史修订只显示已记录部分 | C | PC | 复开也可能是范围扩展 | 复开一次 +1，不删旧 Outcome |
| `workflow.cross_provider_transition` · 跨平台工作迁移 | 观察工作路径 | 用户确认序列 C + O→D | 相邻已确认 Attempt 的 Provider 不同的有序迁移数；n=有序 Attempt 对；周 | 顺序/会话缺失 U | M/C | PC 时线 | 切换不等于低效 | A(ChatGPT)→B(Claude)→C(ChatGPT) 为2 |
| `workflow.resume_gap_days` · 搁置后恢复间隔 | 提醒恢复摘要价值 | Problem 状态修订 C + O→D | 恢复确认时间−上次用户确认进展时间，按固定时区日历日；n=双端有证据 | 无最近确认时 U | C | PC 详情 | ≠人工耽误时间 | 休息3天恢复→3天，不评价好坏 |
| `artifact.reverified_count` · 复验过的成果数 | 降低成果失效 | Artifact 版本 + 实测 V→D | 每周有新版本绑定的独立 V 且用户确认的 Artifact ID 去重数 | 外链失效、版本不匹配不计 | E/C | PC 成果 | 旧测试不可证明新代码 | 代码版本变更后旧 V 失效，新回执使计数+1 |

### 2.3 探索候选完整指标字典：P2 5 项（默认不启用/不显示）

| metric_id · 中文名称 | 用户决策价值 | 来源 / 等级 | 计算规则、分母、窗口 | 覆盖 / 缺失 | 隐私 | 展示 | 风险与禁止解释 | 验收案例 |
|---|---|---|---|---|---|---|---|---|
| `cost.official_amount` · 官方已确认费用 | 管理预算 | 明确提供方账单/回执 V→D | 按官方币种/账单窗求和，保留来源和税费口径；n=有官方回执请求 | 无回执 UNKNOWN，不填0 | 账单独立授权 | PC 可选 | ≠估算 Token 花费 | 无账单时只显示“未知” |
| `cost.estimated_tokens` · 非官方 Token 估计 | 粗看规模 | 文本分词 I | 有正文许可且标注 tokenizer/模型版本的估算；n=授权样本 | 无正文、模型未知不能估 | B | PC 专家模式 | 不得与官方计量混表 | 无许可不执行，样本少标明 |
| `quality.prompt_clarity_candidate` · 目标清晰度候选 | 提醒补验收条件 | 手动结构/模型 I | 给定 Goal/Criteria 的可审核规则或评分版本；n=用户明示目标 | 正文禁用时 UNKNOWN | B/C | PC 编辑时 | ≠用户能力评价 | 缺验收条件显示“补充建议”，不打差评 |
| `quality.model_win_rate` · 模型胜率候选 | 比较模型是否有用 | Outcome V + 归因 I | 仅严格同类任务、同口径样本的证据成功数/可比样本数，定义方法后再测 | 任务复杂度、选择偏差极大；目前禁止展示数值 | C/E/B 依归因 | 后续研究 | 没有随机比较，不能宣称某模型更好 | 非可比样本必须拒绝排名 |
| `productivity.time_saved_estimate` · 节省时间估计 | 测评真实收益 | 用户对照研究 C/V + I | 同类任务经明确实验对照差值及置信区间，固定研究窗 | 无对照为 UNKNOWN，不由浏览器前台时长推测 | C+研究许可 | 不默认展示 | ≠用户劳动时间或 ROI | 只有浏览器活动记录不得生成值 |

**后台保留但不出卡片**：Event 幂等键、授权版本、scope、时间戳精度、失败原因、观察间隙、源版本、Revision、关系审计；这些支撑指标可解释性、撤销和删除，但对普通用户只提供“数据为何未知/如何修正”。**坚决不做**：无权限时的历史消息总数、假装服务端推理时间、把重叠时长当省时、用未经校准样本给 AI 正确率排名、基于网页焦点推断用户专注度。

## 3. 三端体验：Single App · Multiple Surfaces

### 3.1 AI 网站内：采用 A 状态标签 + B 点击迷你卡；C 上下文操作延后到 P1

| 形态 | 价值 | 干扰 / 难度 / 隐私 | 决策 |
|---|---|---|---|
| A 单条轻量状态标签 | 用户不离开 AI 网页即可知道所属问题/是否待验收 | 低干扰；需每站安全定位，文案短 | **P0 默认**，最多问题短名 / 当前成果待验收 / 观察状态三信号 |
| B 点击展开迷你卡 | 审核待关联、恢复下一步、看来源和观察缺口 | 中等干扰；只能用户点击展开；不得自动弹出 | **P0 手动展开**，展示会话身份、关联数、未知数、下一步、快审及暂停/隐藏 |
| C 贴近具体回答的上下文按钮 | 可建立精确 Evidence/Outcome | 虚拟列表、工具栏遮挡、选择跨节点、权限敏感 | **P1**，用户明确选择回答后才显示，先验证至少两个 Provider |

网页未授权时默认**不渲染工作数据**；如已安装，可展示无数据/说明入口，但不得自动访问历史正文。已授权但站点无法观察时显示“观察未知”，不猜完成；断开后不得根据静默时间延伸计时。关闭浮层仅是 UI 偏好，与暂停站点采集是两个独立动作，后者需要撤权/禁接事件回执。完成提醒默认 OFF，用户可关闭，且只能基于可信观察边界告知“观察到页面完成”，绝不叫“服务端已结束”。

**避让规则（正式实现门槛，不代表 R5.5 已执行）**：Overlay 优先不覆盖输入/发送/停止/附件/左侧导航，使用由站点 Adapter 返回的受控可用锚点+碰撞检测；候选位置冲突则退化为扩展入口，不覆盖原生控件。对 SPA 路由、DOM 重绘、虚拟列表、缩放、窄窗与主题变化重新布局；多标签按 tab/document/generation 隔离。Shadow DOM 与 CSS 命名空间防污染，事件监听按卸载/撤权清理。不得在公共 Browser Framework 写死 ChatGPT DOM。**预览中的模拟网站和避让只是布局原型，不能证明这些规则已在真实站点成立。**

### 3.2 Side Panel：当前问题助手，不是压缩报表

对比：① 单屏所有统计卡（易拥挤、拒绝）；② 当前问题 + 折叠详情 + 底部唯一主行动（**采用**）；③ 按平台分组的会话列表（弱化 Problem，不采用为默认）。推荐首屏顺序：**问题名及状态 → 最近有效结论 → 下一步（固定主行动） → 当前观察与未知提醒 → 待验证件数**。二级折叠区：关联建议、已关联对话、执行样本、成果处理、授权。顶部“当前问题 / 全部问题”切换，所有问题只用于快速跳转，不在窄栏堆多图。确认关联、拆分、删除与撤权在必要时明确反馈；可撤销操作留回退入口。

### 3.3 PC 完整工作台

导航沿用已有六区，不新增一排高级导航：**问题中心 / 执行与并行 / 成果与证据 / 工作恢复 / 周复盘 / 隐私与数据**。问题详情采用内部链路：
`Problem（目标、验收、下一步） → Attempt（阶段/修订） → Conversation/Execution（来源、区间、覆盖） → Evidence/Outcome（独立验收与撤销）`。
问题中心是总览→问题选择，执行页以当前 Problem 钻取请求，成果页只对当前 Problem 记录证据，恢复页提供人工确认过的上下文摘要；全站汇总需明示被授权范围。初级用户默认查看摘要，高频用户在关联/恢复层工作，开发者在 Attempt/Execution/Evidence 深挖，统计专家才打开复盘与覆盖字段。

### 3.4 身份、权限和错误一致性合同

三端只能引用同一 Problem / ConversationLink revision / Outcome / Consent scope。候选未经 C 不计入 Problem 指标；从任何端确认后，3 端重新计算；撤销可恢复到以前值；切换站点只换当前 Conversation Context，不改变用户选择的问题身份。UI 隐藏不会擦除原生授权，暂停当前 Origin 不会改其他 Origin 的权限。UNKNOWN 在任何端都不变成成功或失败。模拟测试通过带 DEMO，不可进入真实“已验证”统计。

## 4. 十四个端到端验收故事（R5.5 只验证模拟交互的对应部分）

每行依次为：触发→当前页→动作→系统状态→成功反馈→失败恢复→授权边界。`P`=PC，`S`=Side Panel，`W`=目标 AI 网页模拟。未标 DEMO 的正式站点事件均为 NOT_TESTED。

1. 初用：安装后进入 ChatGPT→W 未授权占位→主动选择允许元数据/或手建问题→建立 scope/授权 revision→显示“已授权、正文未授权”→拒绝授权仍可手建→不得读取旧对话。
2. 发现候选：Claude B 对应相同 Bug→W 展开卡/Panel→点击“确认关联”→关系边由 I 变 C，主问题 2→3→三端展示 3 对话/2 平台→拒绝或撤销恢复→候选依据不含未经授权正文。
3. A→B→C：从 ChatGPT A 切 Claude B 再 C→W 切模拟会话→同一 Problem 保持已确认链接，展示当前来源→切错会话可返回→跨平台账号须分 scope，不因名称相同合并。
4. 一个对话两问题：在 P 问题详情看到共享 Conversation→人工决定第二关联→两 Problem 引用同一对话，各自归属可审核→撤销一个边不删除另一个共享源→不能双计全局 Execution。
5. 标题相似但不同：Gemini X 候选→W/Panel→拒绝候选→候选 REJECTED、统计不变→可由用户后续明确创建独立 Problem→相似度非证据。
6. 错误关联撤销：先关联 Claude B→W/Panel/P→撤销→3→2，已知 65/40→40/40→显示“已撤销”→异常操作不写新边→保留审计，不误删共享来源。
7. 拆分：一个会话承载不同复测工作→Panel→选择拆分→新 Problem ID，旧链接撤销→当前问题关联数下降→用户可打开新问题复核→不得仅改标题假装拆分。
8. 两 AI 并行：A[0,40]、B[10,35]→P 执行页→查看区间/样本→已知 sum=65、union=40、重复计数=25→未知 C 单列→缺样本不显示假精确总时长→元数据授权范围必须一致。
9. 长任务刷新：一次 60min 工作在 30min 失联→W 观察状态“未知”→P 细节看右删失→不给完成时间→重新观察仅能新建可信代际/修复缺口→不能凭页面最终文案补记缺失区间。
10. AI 自称完成但测试失败：W/Panel→标待验收或复开→Outcome 不被当作 V；P 追加实际失败证据后状态保留修订→用户可再验→预览按钮只生成 DEMO 证据。
11. 数天后恢复：重新打开 P/Panel→“继续工作摘要”→展示目标、最后确认结论、下一步和待验证→打开相关来源→缺来源则标链接失效→正文内容另需许可。
12. 隐藏/暂停/删除：W 隐藏提示、另点“暂停站点观察”→UI 与 Consent 分别变化→撤权后禁止新事件，P 删除要二次确认→撤销后旧数据按保留/删除策略处理，不能静默重授权。
13. 空/部分/错误：P/Panel/W 场景切换→显示无数据/覆盖缺口/未知→不得展示“0失败/0分钟”作完整事实→可回到正常演示→未授权绝不读取历史正文。
14. 多标签/账号/主题：同一 PC/Panel 切模拟来源和深浅主题、360px→身份与统计一致；正式多标签独立 document/generation 检验未开展→缩放/碰撞失败应回退到无遮挡入口→同一 Origin 不代表同一账号。

## 5. 平台可观察性与现有资产复用（只读源码/文档调查）

### 5.1 Provider 能力矩阵

记号：`UNKNOWN`=现有证据不足；`NOT_TESTED`=本轮未对真实页面执行；`REFERENCE_ONLY`=仓库有相似站点代码但不等于可复用授权能力。本轮**没有**真人账号授权、真实网站 DOM 或扩展安装回执，故不得用猜测填 PASS。

| Provider | Conversation 身份 | 提交/首输出/流式/完成 | 编辑/重生成 | SPA/异常/缺口 | 本轮证据边界 |
|---|---|---|---|---|---|
| ChatGPT | UNKNOWN | UNKNOWN / UNKNOWN / UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN | knowledge-inbox、ai-send-queue 等存在 ChatGPT 适配经验，**REFERENCE_ONLY、NOT_TESTED** |
| Claude | UNKNOWN | UNKNOWN / UNKNOWN / UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN | 产品意图覆盖，**NOT_TESTED** |
| Gemini | UNKNOWN | UNKNOWN / UNKNOWN / UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN | 产品意图覆盖，**NOT_TESTED** |
| Grok | UNKNOWN | UNKNOWN / UNKNOWN / UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN | 产品意图覆盖，**NOT_TESTED** |
| DeepSeek | UNKNOWN | UNKNOWN / UNKNOWN / UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN | 产品意图覆盖，**NOT_TESTED** |

### 5.2 复用决定（不臆造公共 API）

| 仓库入口 | 可能借鉴的已知行为 | 本轮决策 | 先决缺口 |
|---|---|---|---|
| `projects/time-review/` | 有 Origin/空闲授权与可观察时间，但只算前台非空闲网站时间 | **REFERENCE_ONLY**：不能复用为 AI 请求时长或用户注意力 | 独立 AI Insight 目的授权与 Execution 状态来源 |
| `projects/knowledge-inbox/` | ChatGPT 回答保存、来源及已有用户显式选择流 | **REFERENCE_ONLY**：可研究来源引用与用户选择，不读原收件箱正文 | 公开受控来源引用契约/正文二次授权 |
| `projects/ai-scroll-navigation/` | 长回答导航与页面 DOM 经验 | **REFERENCE_ONLY** | 虚拟列表锚点和 UI 避让的独立可复核接口 |
| `projects/prompt-shortcuts/` | 手动选择/提示词入口模式 | **REFERENCE_ONLY** | 非侵入上下文操作与权限复审 |
| `projects/webflow/` | 用户批准的 Task/Run/Result 与恢复/回执思想 | **REFERENCE_ONLY**，不创建第二个任务执行器，也不自动发送 | 通用可审计只读回执协议是否对 Insight 可公开 |
| `projects/ai-send-queue/` | ChatGPT 输入/发送/完成状态的实站处理经验 | **REFERENCE_ONLY**，绝不复用其自动发送行为 | 正式 Adapter 边界、来源状态可观察性 |
| `src/analytics/` | 已有采集/授权/归因职责 | **READ_ONLY_BOUNDARY**，不得合并个人问题观察与产品遥测 | 第一方隔离/权限/删除证明 |
| `src/knowledge/` | 来源及知识服务 | **REFERENCE_ONLY**，不建第二套知识库 | 稳定可授权来源指针合同 |
| `src/ui/design-tokens.css` | 官方语义 token（仅可信 UI） | **VISUAL_REFERENCE**：原型借语义颜色/圆角，不直接注入外站 | 正式网页 Shadow CSS 隔离，Token 不能跨来源裸注入 |

**执行世界门禁**：网页 Content/受控 Adapter、可信授权 Host、Side Panel Sandbox、PC `app.html` 不是同一权限世界。R5.5 预览只是独立 HTML，不能证明未来 Sidebar 工具拥有跨网站读取权；如无公开 SDK 则记录 `SDK_GAP_NOT_PROVEN` 而非自建 Host。隐私目的授权必须按 Origin+账号+代际独立审阅，不能挪用 Time Review 的已授权范围。

## 6. 推荐 / 备选 / 放弃与最小开发范围

| 决策 | 推荐方案 | 备选 | 放弃及原因 |
|---|---|---|---|
| 核心体验 | 以 Problem→证据→下一步驱动 | 用户完全手动建立关系 | 按 AI 消息数排名——会奖励噪声 |
| 网页提示 | 单行 3 信号 + 用户点击迷你卡 | 可配置只显示小点 | 全屏/永久浮窗——遮挡原生控件 |
| 站点适配 | 单 Provider 先实现最小只读事实并证明覆盖 | 先只有用户手动关联 | 一次支持五家——高不可证伪风险 |
| Side Panel | 当前问题 + 下一步 + 折叠详情 | 当前/全部问题切换 | 一屏 12 张指标卡——窄栏无法理解 |
| PC | 复用六导航，页内钻取 | 未来高级筛选 | 16 个研究领域变 16 个导航——不可维护 |
| “AI 已完成” | 默认待验证，只有用户/独立回执提高等级 | 允许用户手动“无需测试”并给原因 | AI 声称即真实通过——错误激励 |
| 时间 | 完整样本 sum/union + UNKNOWN 覆盖 | 仅显示时间线不聚合 | 把并行时间求和当工时——明显失真 |
| 存储与授权 | 最小本机元数据、按 Origin/账号审阅、用户主动关联 | 完全手动不读网页 | 默认扫描全部历史——隐私风险过高 |

**下一轮 R6 最小正式垂直切片**（不是本轮工作）：先在 ChatGPT 单一 Origin/一个测试账号、用户显式授权且无需正文的条件下，证明 Conversation 身份、请求提交/完成/未知的可观察性；在此之前先对已有 R5.5 预览运行 Node、1280/360 浏览器可点击回归。随后只连接用户手动 Problem、Conversation 关系与待验收、恢复摘要，统一同一授权版本和问题身份；完成撤销、数据删除/未知处理与 2 个明确可回放 fixture。Claude/Gemini/Grok/DeepSeek、自动语义推断、Token 成本与模型优劣延后。**不把 R5.5 的模拟页面当正式业务功能。**

## 7. R5.5 原型验收矩阵与遗留证据

- 应验证（新增差量）：网页显示/隐藏与展开关闭、模拟 Conversation 切换、Claude 候选确认、Gemini 相似拒绝、撤销关联、分拆、待验收/模拟测试通过、同 Problem 三端统计同步、站点暂停后状态和权限差别。
- 应验证（继承且不重复开发）：完整区间 40+25 与并集 40、未知样本保留、删除共享数据的 Core 行为。R5 合同仍是计算真相。
- 页面层：Site 轻提示不能遮挡演示输入区，Tab/Escape 可用，暗色与 360px 无横向滚动；正式站点避让、真实 SPA 多标签、账号权限、Chrome 内容脚本和生产存储全部 NOT_TESTED。
- CI 与本机：源码写入/静态读回只能标 SOURCE_READY/STATIC_CHECK；必须取得本机 `node --test projects/ai-insight/tests/insight-contract.test.mjs` 的实际退出码才可标 NODE_PASS；真实 Chromium DOM 点击与截图同理。对已经证明存在但没有被实测的功能不要伪称 PASS。

## 8. 剩余产品假设与反方清单

1. 用户是否愿意每个跨 AI 问题主动确认 Problem 关联？需观察实际负担（目标：不强制每段聊天录入）。
2. “下一步/待验证”是否比执行耗时卡片更有复访价值？需使用任务恢复成功率、完成用户明确行动的比例做可证伪试验。
3. 长时间请求的首次/结束 DOM 信号跨 Provider 是否可靠？必须实站适配矩阵，不能为指标美观猜测。
4. 实际 V 证据的存储、权限、引用失效、重验与删除必须有真实回执与版本；DEMO 不等于 V。
5. 网页 Overlay 可访问性、避让 AI 输入控件、站点 SPA 和虚拟列表在真实 Chrome 未通过；必要时退化为网页无浮层+Side Panel。
6. 本机并行 Agent 的未提交工作区状态不可由远端 GitHub HEAD 推断；正式源码工作前须在 Mac 复核。
7. 现有 Core 未覆盖完整 Attempt 编辑史、跨多账号时钟归一或真实 Insight 目的授权——设计记录不是实现。


## 9. R5.5 实际差量与验证证据（2026-11-12）

**本轮已落地的源码设计**：沿原有 `preview/index.html`、`preview/preview.js` 增量加入网页轻状态标签与迷你信息卡、模拟当前 AI 会话切换、人工确认/拒绝/撤销跨会话关系、当前站点“模拟撤权”与 UI 隐藏分离、侧栏“当前/全部问题”+折叠区+固定下一步、PC Problem 链式详情；执行时间线取消把未知终点画成虚构的 14 分钟。保持 R5 Core / Schema 与原 24 项合同测试源码不变，新增 6 项 VM DOM-shim 定向测试源码。原演示 Problem 的 `result` 引用了尚未确认关联的 Claude 结论，所以 UI 只能显示为“已记录线索（来源待核对）”，不能当 V 证据。

**已执行的静态核对**：连接 GitHub 从现行 main 读回文件，检查 8 条静态约束：JS 中静态 `#id` 引用全部存在；HTML 和动态按钮的 `data-act` 均有处理分支；指标字典确为 26 项；26 个身份不重复；新增测试源有 6 个 `test()`；预览控制器无 `fetch` / `XMLHttpRequest` / `localStorage` / Chrome 采集调用；存在暗色样式；存在 390px 窄屏样式。**8/8 STATIC_OK，不是 Node 测试通过、浏览器点击通过或实站数据正确。** HTML 标签开闭数量初步静态一致（section/div/details/dialog），但不能替代真实 HTML/ARIA 浏览器检查。

| 验证层级 | 状态 | 证据与不可外推的范围 |
|---|---|---|
| 远端业务文件及设计文档 | SOURCE_READBACK_OK | 通过 GitHub 连接器核对；本机未提交状态与其他 Agent workspace 不可获知 |
| R5.5 8 项静态检查 | STATIC_OK 8/8 | 脚本字符串、控件引用及指标定义；未执行 JS 控制器 |
| R5.5 六项 Node DOM-shim 用例 | SOURCE_READY / NOT_RUN | 文件 `tests/insight-preview-r55.test.mjs` 已写，但没有真实 Node exit code |
| R5 原 24 项合同 Node 测试 | HISTORICAL_ONLY | 保持原源码不变；不能沿用上轮隔离环境结果作为本轮 Node PASS |
| 模拟站点真实点击 / 360px / 键盘焦点 | BROWSER_NOT_TESTED | HTML/CSS/事件源码已写，尚无真实 Chromium DOM/screenshot |
| ChatGPT 等真实 Origin、账号授权、采集/存储 | NOT_IMPLEMENTED / NOT_TESTED | 本轮禁止私密历史读取与真实 AI 提交 |

**R6 前必须确认的具体实现差距**：① R5 演示尚无独立 Attempt 记录，PC 在链路中明确显示“尚无”，不能把 Conversation 数量充当 Attempt；② 当前网页“暂停”是通过 `REVOKE_ORIGIN` 模拟阻断，**不是**正式可恢复的临时 Pause 状态；③ R5 样例的历史结果尚无来源 Review/证据强校验；④ DOM Adapter 多平台身份与完成信号仍 UNKNOWN；⑤ 真实网页避让/SPA、可信授权 Host/SDK、持久化、销毁、真实回执均未落地。

## 10. 八位独立模拟专家评审（仅评产品设计及原型方案）

评分规则：每个模拟视角先按其本职准则独立给出 0–100 分，然后算术平均；**不能表示外部专家参与或真实功能验收通过**。评分对象是 R5.5 产品设计的完整度与取舍，不包含未经执行的 Node、真实用户研究或 Chrome 通过率。

| 视角 / 独立分数 | 最重要的优点 | 功能缺口 | 指标易误解处 | 三端评估 | 阻塞性证据 | 下一步改进 |
|---|---|---|---|---|---|---|
| ① 用户研究 **95** | 中断后恢复与验收闭环直击真实 Job | 未验证用户是否愿意审核每次关联 | “使用更多 AI”不等于推进更多 | 网页轻量、侧栏行动、PC 钻取的分工合理 | 未进行可观察的任务恢复用户试验 | 至少以典型跨 AI Bug 复现实测恢复步骤及点击负担 |
| ② SaaS 产品战略 **96** | P0 九项能力聚焦 Problem、证据与下一步 | 价值验证、长期留存实验尚缺 | 不能用问答数当北极星 | 三端有差异化主/辅任务 | 无真实付费意愿/留存验证 | 先做单 Provider 闭环，观察“恢复并完成下一步” |
| ③ AI Workflow **96** | 候选确认/撤销/拆分避免自动误合并 | Attempt 尚未成为原型可编辑独立实体 | Conversation 数不等于 Attempt 数 | 快审在网页、审计在 PC 合理 | 实际跨会话/跨模型身份稳定性未知 | R6 先做手动 Attempt 与来源引用及复开验收 |
| ④ 指标与数据分析 **97** | 26 项完整字典，准确分开 sum/union/未知 | 样本时钟漂移、真实覆盖基线待校准 | 完整率仅对“已发现请求”，不是全部历史覆盖 | 页面只少量展示，PC 解释样本 | 真正来源与时间端点需独立可靠信号 | 使用有缺口/右删失/多并发 fixture 验证 |
| ⑤ Chrome 扩展架构 **93** | 独立业务 Owner、不把 Provider 逻辑侵入 Framework | 未有正式 Adapter、安全锚点与可信安装型态 | 前台可见性不是服务端时间 | 网站卡片定位合理但只是模拟 | 本机 Codex 和真实五站 DOM 全未测 | 单一 ChatGPT 源先证明 API/生命周期/避让，再扩展 |
| ⑥ 隐私与安全 **96** | Origin/账号级目的性授权、正文分级、撤权与删除边界 | 正式暂停不能混同撤权；删除副本仍待事务验证 | 未授权时不允许凭历史补数 | 网页撤权后遮蔽来源细节、PC 管理审计合适 | 可信 Host 授权回执缺失 | 明确 Pause 与 Revoke 两状态及阻止旧代际事件 |
| ⑦ UX / 交互设计 **95** | 轻标签+手动展开、紧凑侧栏与 PC 钻取 | 真实键盘、360px、虚拟列表避让尚无视觉验收 | 太多数字会遮蔽下一步 | 分层清楚、可达性源码有所考虑 | Chrome 实际焦点/碰撞/主题未测 | 逐按钮与 Tab/Escape/滚动读回并修复 |
| ⑧ 商业化与增长 **94** | “验证过的推进与恢复”比通用聊天统计更具定位 | 未证明连续使用及复盘习惯带来复访 | 模型胜率和节约分钟不应当作销售承诺 | 网页触发、侧栏留存、PC 复盘路径完整 | 无用户价值实证或可归因增长指标 | 小规模用户内测，用任务恢复结果而非访问时长衡量 |

**综合模拟设计评分 = (95 + 96 + 96 + 97 + 93 + 96 + 95 + 94) ÷ 8 = 95.25 / 100。**  
达到“设计方案完整度”目标，但**不表示生产就绪**。架构 93 与增长 94 是主要扣分处；独立已知的实站适配、授权阻断、节点/键盘测试仍是下轮明确缺口，绝不因总体平均达标而标已通过。正式开发必须先按第 7、9 节取得真实回执再评生产质量。
