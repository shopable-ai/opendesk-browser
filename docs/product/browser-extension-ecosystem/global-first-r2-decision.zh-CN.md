# Global First R5 · 当前优先阅读（2026-10-13）

> **最重要结论**：可证明的全球/区域/具体任务第一和指定世界 Top 5 仍是 **0**；研究中的“TOP 20”是产品实验优先次序，不是市场排名。已登记公开研究对照从 30 扩为 **45**，原 **84 OPP、8 EXP、14 GF** 没有重新编号或造第二账本。相关工作源代码未因为 R5 文档自动完成 Chrome 原生全链验收。

**先看这份真正的执行性决策**：[Global First R5 TOP20 × 12 行业 × 84 原有机会详细方案](global-first-r5-portfolio.zh-CN.md)。

战略判断已经进一步收窄：Google 2026-04-14 [Chrome Skills](https://blog.google/products-and-platforms/products/chrome/skills-in-chrome/) 提供保存和复用 AI 提示词；Claude 2026-07-24 [Chrome 录制工作流](https://support.claude.com/en/articles/12138966-release-notes) 已能重复调用；UiPath 2026-08-25 [Delegate Routines 公开预览](https://docs.uipath.com/delegate/standalone/latest/release-notes/august-2026) 可以保存、调度和治理复用工作。这些直接否定“只有 OpenDesk 能 AI 创建后重复使用”的宽泛口号。**可争取但尚未证明的价值**是：固定源码/依赖审阅 + 明确网站授权 + 真 Chrome Task Verified/Installed + 关闭模型后同一版本独立 Run + 可追溯回执和撤权，且在实际任务上总成本/成功率有优势。

**先执行而不是继续无限分析**：在当前原 AI/Task/Authority/RunHost 上，只跑一个真实同包闭环 `examples/tasks/demo-form.html` → 真实 AI 与用户审阅 → 固定 Task → Verified → Available → Installed → 断开模型 → 两次独立运行；同一 runId/resultId、sourceHash、manifestHash、installationId/generation 必须经可信证据绑定。随后公平比较 Chrome Skills、Claude 录制、Axiom、UiPath、ScriptCat、Power Automate、Apify 与 AI coding + 用户脚本管理器。不能访问用户本机 Mac/CFT 的会话标记 **NOT_TESTED**，不能以本轮 Node/CI 代替。

**已经直接写入本仓库的增量**：45 个竞品渠道证据；原 OPP 账本内 20 个关联 GF/EXP/反例/退出条件的研究优先级；TOP20 完整人可读行动卡；真实 Task v1/WorkflowCompiler 合约测试和可信 GitHub Actions 结果；[新来源与公平对照空白契约](../../framework/workstreams/evidence/global-first-r5-20261013/benchmark-contract.json)。原 R4 以下全部保留历史来源，不再自动恢复旧 F01 手动 JSX 营销 P0。

---

# OpenDesk Browser Global First R4：AI 优先竞争决策与真实证据

> 2026-10-13。当前获批全球/区域/特定任务第一：**0 项**；可证明全球第二至第五名：0。战略 TOP 5 不是实测世界排名，独立专家质量评分 NOT_SCORED。仅基于 GitHub 远端代码及外部公开来源，当前用户 Mac git status、Chrome Profile、Native、正式发行包尚未现场验收。

## A：可以证明什么第一？

GF-013“首个 AI/MCP 用户脚本管理器”被 ScriptCat 2026-08-06 Beta、Violentmonkey 2026-10-10 Beta 反驳；GF-014“首个多文件 React/Vue 脚本工具”被 vite-plugin-monkey + 现有脚本管理器组合反驳。两项正式账本仍维持 DISPROVED，不能换词恢复。Axiom Claude Skill 可生成可导入 Chrome 的机器人；UiPath Delegate 于 2026-08-25 公开预览可复用、调度的 Routines，带批准治理。因而“AI + 审批 + 可重复”本身也不能称世界首创。

## B：TOP 5 战略优先级，而非市场排名

| 优先级 | 真实用户需求 | 最强替代方案 | 最小差距 |
| --- | --- | --- | --- |
| **1 GF-007** | AI 创造、审批、固定版安装、断开 AI 后多次运行 | Axiom Claude Skill；UiPath Delegate Public Preview；ScriptCat Agent | 真实 Mac Chrome 同源同包 AI→Verified→Available→Installed→断开模型 Run 两次；完整成本 |
| **2 GF-004** | 版本/依赖/网站授权可审阅，运行有原始回执 | ScriptCat 1.5 Beta 的权限审查；企业 RPA | 同哈希真机撤权、升级/回退、Stop/未知效果；独立比较 |
| **3 GF-003** | AI 制作 JS、Page UI、Controller 三类可重用工具 | AI 编程 + WXT/Tampermonkey；Automa | 三类独立原生安装及统一工具列表、停止/升级验证 |
| **4 GF-002/GF-011** | AI 多文件更新到可用工具与20次复用综合成本 | vite-plugin-monkey + ScriptCat/Tampermonkey；WXT/Plasmo | 同机 5次冷/10次热/3次恢复，计初始 Node/Native/模型费用 |
| **5 GF-009** | 卖家商品检查、合法结算核对的重复工作流 | 卖家 ERP；Shopify 原生报表；A2X/Excel | 真实客户、当地发行、许可、误报漏报及复用；EXP-005 仅 Listing QA |

**结论**：GF-007 对用户最有购买理由；GF-004 是其信任与安装验收基础。现有源码最接近可验收的是哈希、权限、Run/Result 技术切片；任何完整 AI→Installed→独立重复链尚未以同一当前 Chrome 包证明。GF-003 产品形态、GF-002/GF-011 真实成本、GF-009 行业成交应服从前两项闭环。技术开发快不等于已经第一。

TOP 10 战略候选顺序：GF-007 → GF-004 → GF-003 → GF-002 → GF-011 → GF-009 → GF-005 → GF-006 → GF-010 → GF-001。GF-001 手写 React/Vue 只保留工程专项；GF-012“全球最安全最可靠”淘汰为未证实的绝对宣传；单独 Cron/AI MCP/多文件世界首创方向淘汰。证伪的是宣传主张，不是删除有用的现有源码。

## C：至少20个真正能解释的双/三因素机会

这些是以合法实际用户任务为中心的 **26 个候选**，不等于已完成产品或真实客户订单。每个方向需要重复使用频率、人工时间、模型成本及合法站点样本去验证；最佳现有竞品可以组合使用。

| 机会 | 谁会使用 | 为哪件重复事情省返工 | 有价值的双/三因素 | 最大反例 |
| --- | --- | --- | --- | --- |
| O01 | 卖家 | 上架前字段核查 | AI 规则+Page QA+版本复用 | ERP/平台自检 |
| O02 | 卖家财务 | 官方 CSV 结算差异检查 | 本地规则+可追溯报告+跨期重复 | Shopify/A2X/Excel |
| O03 | SKU 运营 | 成本、运费和 SKU 可视核对 | AI UI+参数+固定计算 | ERP/表格 |
| O04 | 客服 | 重复合法工单填写 | AI 方案+动作审批+安装 Task | Zendesk/Axiom |
| O05 | 财务 | 发票必填项核对 | 字段规则+Chrome 页面+人工复核 | 财务 SaaS |
| O06 | 业务运营 | 每周后台指标审核 | 有权站点+定时+历史结果 | 平台报表/Bardeen |
| O07 | CRM | 跟进表单校验 | 参数模板+审批+无重复提交 | CRM 自动化 |
| O08 | 招聘 | 本人 ATS 页面字段校验 | 页面组件+隐私授权+长期复用 | ATS 内建规则 |
| O09 | 测试人员 | 网页表单回归 | AI 写计划+冻结 JS+回执 | Playwright/Midscene |
| O10 | 无障碍测试 | 自有站点标签缺项 | 规则脚本+可视标记+Stop | axe/Lighthouse |
| O11 | 内容编辑 | CMS 标题质量检查 | AI UI+本地规则+固定安装 | CMS 插件 |
| O12 | 采购 | 单位和币种字段校验 | 参数化 JS+用户审核+结果明细 | ERP/Excel |
| O13 | 区域卖家 | 中文解释有权限的后台字段 | 本地化+脚本+业务规则 | HARPA 多语/本地 ERP |
| O14 | 后台用户 | 让 AI 创造一次以后自己运行 | 模型提议+批准+固定 Task | Axiom/UiPath Delegate |
| O15 | 隐私用户 | 后续不再向模型发送网页上下文 | 一次 AI+本地执行+最小权限 | Automa/本地 RPA |
| O16 | 脚本安装者 | 安装前了解变更和风险 | 依赖哈希+权限差异+人工批准 | ScriptCat Beta |
| O17 | 长期工具用户 | 升级及撤销旧工具 | 不可变版本+升级门控+历史回执 | 传统管理器 |
| O18 | 计划任务用户 | 重复的授权网站检查 | Installed Task+FireId+异常恢复 | UiPath Routine/ScriptCat |
| O19 | 团队管理员 | 只允许特定已装任务云控 | 版本绑定+明确回传许可+运行证据 | Axiom Cloud |
| O20 | 网页使用者 | 为自己网站添加 UI 卡片 | AI 组件+USER_SCRIPT+受管 Stop | AI Coding+WXT |
| O21 | 多类工具用户 | 统一安装 JS/组件/Controller | AI 创作+多执行世界+统一目录 | ScriptCat+Automa |
| O22 | AI 编程者 | 修改多文件后无需重建扩展 | AI 改动+受控准备+显式 Run | Vite+脚本管理器 |
| O23 | 脚本开发者 | 多程序复用合法第三方库 | HTTPS 审核+SHA 缓存+单程序许可 | npm/@require |
| O24 | 维护人员 | 真实失败能追踪代码与网页 | ResultId+sourceHash+Stop 状态 | Playwright Trace |
| O25 | 旧脚本用户 | 将 GM 脚本受控迁移 | 兼容矩阵+授权+统一 SDK | Tampermonkey |
| O26 | 首次用户 | AI 结果到安装减少人工步骤 | 审核+Verified/Available/Install+复用 | Axiom Extension/ScriptCat |

## D：世界第一、区域第一、具体任务第一及真实第2-5怎样才成立

- 世界首个：查同等任务最早公开可用版本，包括 Stable、Beta、区域商店、脚本管理器 + AI Coding/构建工具组合。GitHub push 不当成 release；缺历史特征日期为 UNKNOWN，不能因为“未发现”就称首创。
- 国家/语言第1：必须确实在区域发行、有人在用，并检查当地平台和至少合理代表性竞争产品及组合。HARPA 已公开包含简体中文、繁体中文、日文等语言；不能靠语言标签做虚假小市场。
- 任务第1：预登记同一 Chrome/样本/合法账号/输入/验收标准，对手用它最自然的工作流；未实测的竞品记录 NOT_TESTED 而不是 FAIL。
- 效率第1：首次 AI 模型费、初次安装配置、权限审阅、第2至20次运行、失败修复、维护成本全部入账。真实成功率、冷/热时延及人工操作数分开列。
- 第2至第5：只有已经对 N 个真实方案用同一数据测完，才可写“在某日指定的 N 个参赛方案中第 X”；不得把局部样本外推全球 Top 5。今天所有名次 NOT_TESTED，产品价值/竞争证据/技术/营销合规/可读性各项 NOT_SCORED。

## E：源码复用与最近的可执行验证

已经核查到 src/ui/workflow/workflow-view.js 存在真实 AI 提议、人工审阅、编译固定 JS、保存 Revision、原 RunHost 与持久结果、导入 Task Candidate 的路径；src/ui/local-project-install.js 和现有 Task 目录有 verifyTaskCandidate、makeTaskAvailable、installTask。来源哈希/权限/依赖复用原 installed-programs、dependency-manager、Authority；不允许建立第二 Task DB、Host、SDK 或 Runner。

**唯一优先 Demo**：复用 examples/tasks/demo-form.html 和 agent-modern-search.v1.opendesk-task.json 的 CANDIDATE（文件声明 sourceHash=1618934805a4104191be8e2005a608d0537a51ca65c1e291c8a8fb042ed34b2d，manifestHash=a40fe6471506743a785ab32fd85a48f3991a641fb3c28741735c20e799d13812）。其身份不是当前 Chrome 运行回执。

1. 由真实模型在合法演示网页提出任务 → 审阅网站、参数、具体页面动作、源码、权限。
2. 保存同一源字节并明确 Run；实际 Chrome 用户操作记录 documentId、真实 runId/resultId、Result revision.sourceHash、网页效果、retirement released。
3. 同一源码版本经原 Candidate→Verified→Available→Installed，记录 installationId/generation/manifestHash。关闭模型/开发 Provider 后从“我的任务”**至少两次独立运行**并核实不发生模型调用；加 Stop、撤权、升级/浏览器重启。
4. 与 Axiom + Claude、UiPath Delegate、ScriptCat Beta、Automa、Vite+Tampermonkey 同任务对照，保存 5 冷/10 热/3 恢复和 20 次总费用及失败样本。发生未知副作用不得自动重试；Stop 不回滚已产生的网页业务动作。

当前代码/协议并不等于 Chrome 原生通过。**本轮未访问用户 Mac、Chrome/Native/受控端口，因此 AI→Installed→重复真机与竞争实测均 NOT_TESTED；LOCAL_NOT_INSPECTED。** 已有旧候选 Mac Chrome PASS 只对原候选有效；Node Mock 不等于真 Worker RunId/ResultId。共享 SDK、Native、Cloud、依赖、Task 等应交由原专职 Agent，避免并行冲突。

## F：为什么用户装，为什么 SEO/AI 才有理由推荐？

**中文 M0 产品方向**：让 AI 协助创造浏览器工具，用户审核源码、网站权限和固定版本，再于适用场景独立重复使用。  
**English M0 positioning**: Create browser tools with AI assistance; review source, site permissions and version before reusing supported workflows.

五条可理解的购买理由：一次 AI 制作、以后独立重复；安装前看清权限/来源；统一交付页面工具与任务；首次和第20次真实总成本；合法的卖家检查。绝不将“能手写 JSX/功能 API 多”当首页卖点。

有用的事实页必须包含：用户实际问题、真实安装/审批步骤、适用站点与模型/Native 条件、可下载固定版本、可复现视频、最强竞品、原始计时与失败、发布日期/范围、明确不适用情况。Google 官方指出 AI Overviews/AI Mode 使用常规 SEO、无需专属 AI 文件或 Schema；Bing Webmaster Tools 的 AI Performance 可观察部分引用。**本轮网站 canonical/sitemap/Search Console/Bing AI 引用/下载转化均 NOT_TESTED，GitHub MD 不等于官网已上线。**

建议首批 24 条预注册查询包含：AI 生成可安装浏览器工具、AI browser automation reusable without AI、ScriptCat alternatives、browser task without LLM on rerun、安全用户脚本安装、AI browser tool version permissions、seller Listing QA、Shopify payout exception audit、AI 编辑多文件脚本、local browser automation、scheduled installed browser task；分别中英文/区域/日期/真实模型及搜索引擎原始回答保存。对外 M0 可用方向表述；M1 需同版功能验证；M2 需公平名次样本；M3 需唯一 GF 账本 CLAIM_APPROVED。禁止“世界第一”“全球最快”“最安全”“Top 5”和保证 AI 推荐。

## G：核实的部分渠道与最强历史反例

| 对手 | 公开记录日期 | 证据级别 | 来源 |
| --- | --- | --- | --- |
| ScriptCat Beta.1 | 2026-08-06 | MCP 外部访问与分级人工确认 | [官方发布或商店](https://github.com/scriptscat/scriptcat/releases/tag/v1.5.0-beta.1) |
| ScriptCat Beta.4 | 2026-09-18 | 安装页面的 GM/权限差异提示 | [官方发布或商店](https://github.com/scriptscat/scriptcat/releases/tag/v1.5.0-beta.4) |
| Violentmonkey Beta 2.49.5 | 2026-10-10 | MCP AI Agent | [官方发布或商店](https://github.com/violentmonkey/violentmonkey/releases/tag/v2.49.5) |
| UiPath Delegate Public Preview | 2026-08-25 | 可复用/调度 Routines，权限审批 | [官方发布或商店](https://docs.uipath.com/delegate/standalone/latest/release-notes/august-2026) |
| Axiom Claude Skill | UNKNOWN | AI 建机器人、Chrome 扩展导入、重复运行 | [官方发布或商店](https://axiom.ai/build-with-no-code/claude/) |
| Nanobrowser 0.2.0 | 2026-10-02 | GitHub release | [官方发布或商店](https://github.com/nanobrowser/nanobrowser/releases/tag/v0.2.0) |
| Midscene 1.15.2 | 2026-10-12 | GitHub release | [官方发布或商店](https://github.com/web-infra-dev/midscene/releases/tag/v1.15.2) |
| Skyvern 1.0.55 | 2026-10-01 | GitHub release | [官方发布或商店](https://github.com/Skyvern-AI/skyvern/releases/tag/v1.0.55) |
| Bardeen Store 5.0.0 | 2026-06-19 | 商店更新，非功能首发 | [官方发布或商店](https://chromewebstore.google.com/detail/bardeen-automate-browser/ihhkmalpkhkoedlmcnilbbhhbhnicjga) |
| HARPA Store 14.4.0 | 2026-06-29 | 商店更新，含中文/日语 | [官方发布或商店](https://chromewebstore.google.com/detail/harpa-ai-web-automation-w/eanggfilgoajaocelnaflolkadkeghjp) |

以上仍不足以倒查全世界历史首次出现。保留既有唯一 [竞品时间线](competitor-timeline.json)、[GF 声明账本](first-claims-ledger.json)、[营销手册](marketing-playbook.zh-CN.md) 和 [工作流](../../framework/workstreams/global-first-r2-20261013.md)。实际可上架发行、首个功能的最早公开时间、独立质量 95 评审尚缺证据。

---

## 原 R4 研究草案（历史留档，旧营销优先级已被上文修正）


> 2026-10-13 · Global First R4。本文替代此前“F01 人工编写 React/Vue 最优先”的**营销方向**，保留原技术与历史原生测试。**现在通过证据批准的全球/区域/行业绝对第一称号：0。**

## 长期防偏移准则：先找第一小山头，再反推产品开发

**本任务是市场定位与竞争决策，不是“从现有技术功能里选一个来宣传第一”。** 新 Agent 开始前必须回答：

1. **用户是谁，为什么需要？** 具体任务、旧替代方式、重复成本是什么？某个 SDK/框架接口存在，不等于商业优势。
2. **怎样的“第一”有意义？** 分别检验全球首创、真实国家/语言区域/行业第一、任务表现/成本第一以及有数据支持的第 2—5 名；不能靠任意缩小地域或拼词制造“独家”。
3. **双/三因素组合值不值得买单？** 对手单产品和多个工具组合一并比较，不能仅找最弱的竞品。
4. **是否已有足够证据？** 区分历史 Chrome、当前版本、公开发行、竞品首发、用户使用数据和审批。缺失记 NOT_TESTED / NOT_SCORED；GF-013/014 既有反例不能重新包装。
5. **如果目前不是第一，怎样以最少投入争取？** 明确需要补的功能、可复现对照实验、退出条件及 SEO/GEO 用户搜索意图，优先真实证明而非持续写提示词。

**当前 GF-007→GF-004→GF-003→GF-002/GF-011→GF-009 是待验证的战略研究顺序，不是世界排名；GF-007 也不能未经反例研究就预设必胜。** 人工 React/Vue 侧栏编辑（F01）是工程专项，不恢复为本战略主卖点。

## 一句话：我们在解决什么需求？

**用户提出需求，由 AI 帮忙创造浏览器工具；用户审阅权限、固定版本并安装；以后无需每次再请 AI 操作，就可安全重复使用。**

例如：“在我有权限的卖家后台创建 SKU 毛利核算卡片。”用户想要的是**一个能长期用的网站工具**，而不是学习 JavaScript 或自己在侧栏手写 React。React/Vue、Controller、Browser SDK、Native、Cloud、定时任务只是已有技术支撑，不能自动当首页营销主角。

**完整目标旅程**：用户描述问题 → AI 生成/修改候选 → 实际页面运行与审核 → 用户同意网站/参数/源码版本 → Verified → Available → Installed → 断开 AI/开发环境 → 后续直接重复 Run → 可查看结果/停用/升级。这是需要实证的产品目标，**不是当前全链路已交付的声称**。

## 最优先争夺的五座小山头（战略排序，绝非实际排名）

| 优先级 / 既有 GF | 真实用户价值 | 可以尝试的“第一” | 尚缺最少证据 |
| --- | --- | --- | --- |
| **1 · GF-007** AI 创造后长期复用 | AI 一次开发、后续用固定工具运行，减少重复模型调用 | AI→审阅→安装→断开 AI 后重复运行的全球/区域首创**候选**；指定数据集重复成本第一 | 真实模型工具→安装审批→关闭 AI 后真实 Chrome 多次执行；公开版本、竞争历史 |
| **2 · GF-004** 可验证、可控 | 用户知道代码来源、版本、权限、结果和 Stop 范围 | 指定测试任务“运行可解释性/权限透明度”领先 | 同一冻结包 SHA 的真实授权/撤权/升级/运行回执及公平竞争测试；**不能直接说最安全** |
| **3 · GF-003** AI 生成三类网站工具 | 不用切换多套应用即可交付 JS、Page UI、Controller Task | AI 创作→多类工具的统一安装管理工作流领先 | 三种产物在一个实际 AI→验收→安装链中跑通，公平比较最佳竞品组合 |
| **4 · GF-002 + GF-011** AI 多文件效率 | AI 修改文件后立即准备并明确 Run，不重新构建整个扩展 | 指定任务冷/热开发时间、人工步骤或重复使用成本第一 | 对 AI+Vite/Tampermonkey/ScriptCat/WXT 同任务计时，包含 Native/Node 初次成本 |
| **5 · GF-009** 区域/行业小山头 | 中文、英文或其他真实服务地区的卖家 SKU/对账工作流更贴近实际需求 | **真实地区/语言/具体业务任务**的完成率或效率第一 | 原 EXP-005 买方/场景/权限证据、当地竞品与可公开取得的发行渠道；不能凭地域名称制造首创 |

上述五个只是**研究与争夺优先级**，不是按实测排名。若发现更高价值候选，R4 允许重新排序，并保留理由。原 F01 侧栏手动 JSX/SFC 仅为可选工程专项，不再自动优先于 AI 功能或市场证据。

## “第一到第五”的五种合规竞争说法

1. **全球首个**：必须查最早公开可用版本、Beta、区域发行及能完成同等任务的多个工具组合。开发源码与内测演示不算公开首发。
2. **全球或区域第 1**：明确市场范围、客观指标、样本覆盖、真实产品渠道、测试时间与数据。区域需真实发行/服务/需求，不随便限定一个城市。
3. **真实用户任务第 1**：例如在指定日期、固定测试数据中，“首次 AI 创建后第 2–20 次执行”的成功率/耗时/模型成本领先；也要公布首次配置与模型花费。
4. **有用户价值的双/三因素第一**：如 AI 生成 + 用户明示审批 + 固定版可复用。竞争者如 ScriptCat Agent/Skills、Axiom、Bardeen 已能以相同或组合工具达成，就不能再讲首创。
5. **指定测试范围第 2–5 / Top 3 / Top 5**：必须真测出排名，写“在某日期、某 N 个已测方案中第 X 名”，不能从有限样本外推“全球 Top 5”。

**GF-013“首个支持 AI/MCP 用户脚本工具”和 GF-014“首个多文件 React/Vue 用户脚本工具”已有反例，保持 DISPROVED，不换词复活。**

## 当前已有资产，如何看待其真实证明程度

- [本地 AI/Codex 执行闭环](../../framework/workstreams/local-ai-loop-r1-01a12158.md)：有旧候选真实 Mac Codex 修改/修复与 Chrome Run 证据，不能自动转为最新 AI→Installed→离线于 AI 复用产品。
- [WebCodex 对话编辑](../../framework/workstreams/webcodex-chat-edit-r2.md)：有结构化请求/Native 文件服务/组件证据，但真实 ChatGPT 模型工具与用户 Mac 网页对话完整自动链未正式验收。
- [Task 安装工作流](../../framework/workstreams/local-project-install-r251.md)：已存在 Candidate/Verify/Available/Install 代码及测试，长期安装更新/重启原生矩阵有缺口。
- [Cloud 通用投递](../../framework/workstreams/cloud-control-r5-01-generic-task.md)：已有固定身份多任务授权/投递组件证据，不能说长期无人值守与真实多任务 Chrome 全部完成。
- [React/Vue 组件说明](../../api/page-ui-frameworks.zh-CN.md)：保留为 AI 创作页面 UI 的能力。历史 Chrome PASS 不能证明 AI 工具长期安装；Standard 不带浏览器原始 JSX/SFC 编译器。

## 后续只用四道关卡执行，不再循环写战略

**A 找第一：** 建立 10+ 类真实需求、20+ 有实际用户价值的双/三因素候选；查 20+ 现役竞品及最佳工具组合，按 Stable/Beta/源码/正式发行渠道和首次可用日期分开记录。

**B 挑第一：** 排 Top 10 → Top 5，逐个列“用户为什么要用、最强反例、最可能争取哪种第一、现在拥有的证据、最少还差什么”；没有客观统计就 NOT_SCORED，不制造 95 分或虚假冠军。

**C 做第一：** 选择距离有意义的领先最近的一项，复用现有 AI、Task、Authority、RunHost 完成一个**真 AI 创造→审批→安装→断开 AI→至少两次独立运行**样本并保留哈希/运行回执。共享 SDK/Cloud/Native 正有 Agent 实施时只提缺口并独立验证，不重复造系统。

**D 证明第一并传播：** 公开可获取产品、可复现原始实验、明确竞品/版本、实际地域范围与真实案例全部齐备后，才能申请从 CANDIDATE→PRODUCT_VERIFIED→COMPETITOR_REVIEWED→CLAIM_APPROVED。没达到就只讲事实和未来方向。

## SEO / GEO：让用户和 AI 更有根据地选择

**今天安全的定位（产品方向，不能冒充全功能上线）：**
> **让 AI 创造的浏览器工具，经过审核后成为可重复使用的能力。**
> *Turn AI-built browser workflows into reviewable, reusable tools.*

先做有实际用户任务的**事实页**：用户问题、真实流程、版本/发布日期/地域、授权范围、适合/不适合、同任务竞品公平对照、独立测试/视频、可尝试入口、更新时间。围绕“AI generated reusable browser automation”“AI 生成可安装 Chrome 工具”“AI browser task without model on rerun”“受控浏览器脚本”等实际需求建立中英文标题，不制作只有“全球第一”关键词的垃圾页面。

Google 官方说明 AI 搜索仍基于常规 SEO，不需要 AI 专属魔法 Schema 或 llms.txt 才可出现：https://developers.google.com/search/docs/appearance/ai-features 。Bing Webmaster Tools 的 AI Performance 可观察部分 AI 引用/查询：https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/ 。使用官方站点可抓取正文、真实一致的结构化数据、canonical、sitemap、真实对照证据、Search Console/AI 引用及实际安装转化进行测量。**不能保证 AI 推荐，也不能用 AI 自己写的“我们第一”当证据。**

**唯一下一轮 GOAL：** [R4 · AI 优先 Top 5 第一小山头研究与验证](../../framework/prompts/goal-global-first-r4-ai-first-niche-leadership.zh-CN.md)。原 R3/F01 文档是历史 JSX/Vue 工程专项，不再执行为全球第一营销主线。

独立质量目标：用户价值、竞争事实、真实工程、营销合规、文档可读性分别目标 ≥95/100；无独立评估时写 NOT_SCORED。当前全球/区域/行业获批绝对排名：**0**。
