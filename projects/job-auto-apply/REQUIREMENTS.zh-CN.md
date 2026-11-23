# AI Job Auto Apply · 需求与验收（R1–R4 统一权威文档）

原始实现任务：OD-JOB-ASSISTANT-OPEN-SOURCE-MVP-R1；改名：OD-JOB-AUTO-APPLY-NAMING-R2；源码增强：OD-JOB-AUTO-APPLY-GETJOBS-R3；开源生态与 Browser/Desktop/CLI 选型：R4。身份固定为 OpenDesk Browser main / projects/job-auto-apply/。后续仅对本文件做差量需求维护，不复制总设计。

## R2 名称、搜索意图与交付真实性

产品英文名 `AI Job Auto Apply`；中文名“AI 自动求职”；唯一工具 ID `job-auto-apply`；页面模块 ID `app.job-auto-apply`；项目目录 `projects/job-auto-apply/`。原 R1 名称 `job-assistant` 作为 Git 历史，不保留第二个实体或安装包。

选择依据：`Job Auto Apply` 对应用途和搜索意图更直接；`AI` 表示计划中的智能匹配能力；`AutoJob` 更短但语义稍泛。名称选择是产品判断，不是实测 SEO 排名或用户行为研究。内部搜索的别名仅在真实检索机制支持后接入；此阶段不为 SEO 直接改宿主。

当前业务源码为 **0.1.1 / Page revision 2**。在源码提交 959e6b13 上，GitHub [App CI run 45045931312](https://github.com/shopable-ai/opendesk-browser/actions/runs/45045931312) 证实候选与源码一致，**Node 60/60 PASS**；之后 R4 仅修改文档。**NOT_INSTALLED / NOT_CHROME_TESTED / BOSS_LIVE_NOT_TESTED / REAL_SEND_NOT_IMPLEMENTED**。现有只读扫描和人工草稿不能冒充真实 BOSS 网站成功，更不能将确定性规则分说成 AI 或伪造投递回执。

## 原始目标与边界

用户希望参考开源 BOSS 直聘自动求职浏览器扩展，在当前 OpenDesk 项目开发类似应用。目标不是提高无差别群发数量，而是减少找岗位、筛岗位、准备沟通的重复劳动，提高匹配质量并确保可审核。不得把点击过按钮等同于投递成功。

## 功能树与真实状态

| 优先级 | 节点 | 用户动作 | 可验证结果 | R1 |
| --- | --- | --- | --- | --- |
| P0 | F1 网站发现 | 在 BOSS 搜索列表点“扫描当前页面” | 网页模块返回真实 DOM 卡片与诊断；无数据不伪造 | SOURCE_WIRED |
| P0 | F2 匹配和解释 | 设置意向岗位、城市、排除词、薪资与技能 | 显示确定性评分、排除理由；缺失字段标明人工核对 | SOURCE_WIRED |
| P0 | F3 待审核队列 | 明确点击“加入待审核” | 本地持久化、稳定 jobId 去重、读写 CAS | SOURCE_WIRED |
| P0 | F4 沟通草稿 | 点击岗位“准备沟通草稿” | 按模板生成、允许编辑、用户点击复制；不发送 | SOURCE_WIRED |
| P0 | F5 失败和撤权 | 非 BOSS/未授权/变更页面/回执异常 | 状态明确，扫描清空旧快照，不自动重放副作用 | SOURCE_WIRED |
| P1 | F6 真正沟通 | 用户审核过目标、消息和范围后明确执行 | DOM/网站真实回执、未知不重放、Stop | NOT_IMPLEMENTED |
| P1 | F7 工作流 | 多岗位分页、任务暂停/恢复、同公司/HR 限制 | 确认 jobId+company+HR 身份、上限及快照恢复 | NOT_IMPLEMENTED |
| P1 | F8 AI | 本地简历解析和语义评分、事实约束话术 | 输出匹配依据，不能虚构经历或学历 | NOT_IMPLEMENTED |
| P2 | F9 多平台 | 智联、前程无忧、LinkedIn、Indeed | 各站独立 adapter/权限，不能把 BOSS DOM 当通用选择器 | NOT_IMPLEMENTED |
| P2 | F10 求职 CRM | 沟通状态、面试安排、提醒、漏斗统计 | 以真实回复或用户标记为来源，不自动编造状态 | NOT_IMPLEMENTED |

## 技术与安全决策

- Type：Combined Application。Sidebar Tool (opaque origin) + 应用内 page.module (USER_SCRIPT)；两者仅用批准的 page.request 跨界，不新建第二套 Host/Worker。
- 当前安装匹配路径：https://www.zhipin.com/web/geek/job*；网页内额外要求 /web/geek/job 前缀；不访问简历、聊天和账号设置。
- 页面模块只读当前 DOM；不使用 fetch/XHR 劫持、隐藏接口、验证码绕过、Cookie 或密码采集；不模拟发送或随机隐藏自动化行为。
- 规则匹配当前是确定性启发式；薪资解析仅支持 K 的显式区间，不作单位混合推断。未知薪资/缺少稳定 ID 不应当被视为已验证。
- 本地只存偏好与最多 24 条待审职位摘要，不存账户凭证、聊天记录或完整简历。单键 8 KiB、总 32 KiB；CAS 冲突/未知写入必须停下核对。
- 职位 URL/页面文字是第三方不可信输入，展示使用 textContent，严禁作为 HTML 或自动访问目标。任何后续 AI 输出不得直接获得发送权限。
- 后续真发送必须有用户确认目标岗位/公司/实际消息；验证发送者和会话身份、幂等 jobId+message、平台真实回执；不明确则 STOP/UNKNOWN，不能盲重试。应遵守平台条款与当地法律。

## R1 的最小验收矩阵

1. 网页：授权的 BOSS 职位搜索页有三张卡片时读到三条；非匹配页返回明确错误；0 条返回诊断而非假数据。
2. 身份：具有稳定 jobId 的岗位可加入待审；没有稳定 ID 只能看不能加入；重复 jobId 不产生重复队列。
3. 规则：白名单岗位符合、外包等排除词拒绝、岗位/城市不匹配拒绝、薪资上限低于期望拒绝、无薪资时提示人工核对。
4. 隐私：权限仅 BOSS；UI 不接触网页 DOM、Page 不接触存储凭据；不触发消息发送、简历操作或跨站网络。
5. 生命周期：页面变化旧快照失效；存储冲突/回执未知不重发写入；未安装/未授权/撤销权限提示失败。
6. 交互：窄侧栏的职位发现→待审→规则→草稿→复制完整走通；刷新重新读回待审队列；可读性和键盘焦点无阻塞。

证据规则：SOURCE_WIRED 指源码存在；R3 GitHub CI 候选构建与 Node 60/60 为 PASS；正式包晋升、Chrome 安装与 BOSS 实站仍为 NOT_TESTED；发送为 NOT_IMPLEMENTED。R1 初始状态不覆盖较新的 R3 测试证据。下一步优先真实 DOM 取证与合法安装审阅，不提前上线。


## R3 · Get Jobs 源码对标与功能差距矩阵

本节是 OD-JOB-AUTO-APPLY-GETJOBS-R3 对同一需求文件的差量更新。参考 Get Jobs 为 loks666/get_jobs 的 2026-11-23 所读取 main 源码。**SOURCE_VERIFIED 仅表示代码路径及实现分支存在，不等于 Get Jobs 在现时 BOSS 页面实际成功执行。**

| 用户问题 / 能力 | Get Jobs 源码证据（仅供对标） | 本项目 R3 真实状态与决策 | 优先级、主要文件与验收 |
| --- | --- | --- | --- |
| BOSS 职位列表识别 | Locators.java 的职位卡、岗位名与公司定位；Boss.java 的岗位解析 | 扩展了已加载卡片的字段，但真实 DOM 改版适配仍待实站核验 | P0；src/page/main.js；scan.test.mjs；实站 NOT_TESTED |
| 稳定职位 ID、重复及历史队列 | Boss.java 的 encryptId/encryptUserId 与数据库存在性判断 | 已规范化 URL ID 的 .html 后缀，去掉查询串；旧队列内存兼容，身份不明的卡片不能加入；未完成跨账号历史去重 | P0；Page + Sidebar；scan/match/queue tests |
| DOM 异步加载、SPA 变化 | Boss.java 的职位列表加载、重试、等待逻辑 | 用户点击后最多等待 1.4 秒；导航/销毁拒绝旧结果；不持续轮询、不自动翻页 | P0；Page；动态/销毁 fixture |
| 城市、工资、岗位与排除词 | Boss.java 的工资范围识别与过滤 | 规则评分及硬过滤沿用，缺失薪资/城市是未知，不判定为达标 | P0；Sidebar；match.test.mjs |
| 学历、工作经验和完整 JD | Locators.java 的详情描述定位；Boss.java 的详情提取 | 仅从卡片摘要尝试识别学历/经验；完整 JD 与真实个人经历尚未比对，不推断满足 | P0 初步识别 / P1 完整匹配；Page |
| 不活跃 HR、猎头、曾沟通 | Boss.java 的活跃字段、黑名单；BossChatNavigator.java 的继续沟通判别 | 只在页面有明确标签时过滤猎头与已沟通；活跃度不可观察时为未知；未查历史聊天页 | P1；Page + Sidebar；match.test.mjs |
| AI 简历匹配与个性化文案 | AiService.java 模型请求；Boss.java 对 AI 文案的使用 | 未接入真实 AI；需要本人确认的简历事实、用户同意、公开 AI SDK、失败降级；不能虚构经历 | P1；领域 adapter；NOT_IMPLEMENTED |
| 人工待审及沟通草稿 | front/app/boss/page.tsx 配置招呼语与执行入口 | 已有待审 CAS、编辑、复制；默认话术不再宣称项目经验，复制不等于发送 | P0；Sidebar UI；match/queue tests |
| 单岗位真实沟通与回执 | BossChatNavigator.java 的聊天入口；Boss.java 的发送与数据库状态更新 | **未实现**：须绑定岗位/公司/招聘者/实际文本/原批准，调用已授权的现有 Task/Controller，读回网站真实证据 | P1；单岗位受控执行；NOT_IMPLEMENTED |
| Stop、暂停恢复、未知结果防重发 | BossJobService.java 的停止回调、状态查询；Boss.java 的停止点 | 目前仅只读扫描可取消，未知本地写入冻结。真实执行停止、恢复和未知发信核验未接入 | P1；Task + 持久回执；NOT_IMPLEMENTED |
| 图片简历、批量、多平台 | BossResumeImageService、其他招聘平台 Worker、front/app/boss/page.tsx | 单岗位实站验收前暂缓；必须另审权限、账户安全和平台限制 | P2；NOT_IMPLEMENTED |
| Side Panel 与 PC 管理/任务记录 | front/app/boss/page.tsx 有设置及任务入口 | R3 保留原有紧凑三 Tab 并增加风险可见性；不展示虚构的投递记录；PC 全管理延后 | P0/P1；index.html/style.css；真实 UI NOT_TESTED |

上表的 Get Jobs 证据来自已实际读取的这些文件：
- src/main/java/com/getjobs/worker/boss/Boss.java（岗位解析、历史映射、薪资、AI 调用、发送状态）
- src/main/java/com/getjobs/worker/boss/BossChatNavigator.java（聊天导航与重复沟通）
- src/main/java/com/getjobs/worker/boss/Locators.java（BOSS DOM 定位）
- src/main/java/com/getjobs/application/service/AiService.java（AI 请求）
- src/main/java/com/getjobs/worker/service/BossJobService.java（执行/停止与任务状态）
- front/app/boss/page.tsx（前台配置、启动停止、图片简历设置）

**许可证**：loks666/get_jobs 当前 LICENSE 明确为 PolyForm Noncommercial 1.0.0。未经另行取得可追溯的商业授权，不得直接复制、二次商业发行其源码。其他 GitHub 对照项目和 Python 分支仅为研究线索，原 README 中的许可证标签未经本轮逐仓确认，不代表可直接导入或运行稳定。所有产品算法均由 OpenDesk 独立实现。

### R3 · 待开发的单岗位操作契约（设计，不是实际发送能力）

用户完整旅程：当前已授权网页读取职位 → 硬性过滤 → 软性解释及未知提示 → 待审 → 核对真实个人简历事实 → 编辑草稿 → 用户审核当前公司、职位、招聘者、发送文本和权限 → 固定任务执行 → 在原招聘会话读取实际回执 → 持久结果。

建议状态枚举：DISCOVERED / PENDING_REVIEW / APPROVED / IN_FLIGHT / CONFIRMED_SENT / FAILED / UNKNOWN / CANCELLED。**只有确认消息进入正确收件人会话且可核实后，才可记为 CONFIRMED_SENT。** 页面点击、任务 ACK、草稿复制、页面跳转或“可能发出”均不是完成。

- 幂等身份要绑定站点、当前账号范围、职位 ID、招聘者 ID、消息 SHA、用户批准版本及任务 Run ID。关键身份缺失时拒绝发送；账号/标签页/网站权限变化时旧批准失效。
- Stop 只能阻止之后的步骤，无法撤回网站已接受的消息。效果未知时保持 UNKNOWN，只允许查询原会话/Run 的只读回执，不自动发送第二次。
- 真实个人简历、API 密钥、聊天记录和上传附件属于额外隐私与权限范围，不继承现有只读扫描授权。AI 的任何推断、JD 技能词匹配都不是用户曾拥有某项资历的证据。
- 复用原 OpenDeskTool.request、storage.local CAS、OpenDeskAppPage.onRequest、受管 Page UI 和 Task/Controller + 持久结果体系。不新增后台执行内核、不在普通 USER_SCRIPT 中擅自提权；当前未证明通用 SDK 缺口，标注 SDK_GAP_NOT_PROVEN。
- 网页站点条款、反自动化限制、验证码和异常登陆必须尊重，不能通过隐藏自动化/反检测规避。当前未做发送，也不应以本需求文档自动获取真实对外沟通授权。

### R3 · 当前交付证据与最小后续动作

- 已提交源码：src/page/main.js、src/main.js、src/index.html、src/style.css、tool.config.json、package.json；版本 0.1.1、Page revision 2。
- 已提交定向测试：tests/scan.test.mjs（7 项）、tests/match.test.mjs（6 项）、tests/queue.test.mjs（4 项）。独立 V8 动态检查通过；GitHub App CI run 45045711718（源提交 f539b1e3）完成候选构建、同源比对与 60/60 项 Node PASS，其中包括上述 17 项项目测试；该候选 SHA-256 为 37a1873ad220ca5ca1ceb79859475a2595a0c2896cdcd678c5556cf43a21862a，52,321 字节。CI 不是本地或已安装 Chrome，后续 HEAD 如有变更须重新核对同源。
- 已获 CI Node 和候选同源回执；仍需本机运行 node --test projects/job-auto-apply/tests/*.test.mjs 并在用户授权的真实 Chrome 完成正式候选安装、网页扫描、导航/撤权验收。CI 仅证明构建与 Node，不能证明 BOSS 实站兼容或任务发送。
- 本轮可用的 CodexPro 本地工作区连接失败；浏览器标签页无登录态 BOSS 搜索页面，因此 Node 正式运行、标准包构建、真实安装、真实网站均 NOT_TESTED。
- 真实 AI、单岗位发送、执行任务、暂停恢复、历史聊天、简历上传、多平台均 NOT_IMPLEMENTED。不得将任何上述项目作为已完成或模拟 PASS。
- 下一步顺序：先取得 Node/CI 与原候选打包回执；随后用用户已授权 BOSS 职位列表核实实际 DOM 并修正选择器；只有明确的单岗位身份、审批、Stop、幂等与真实回执全部满足，才继续实现发送，暂不启动自动海投。


## R4 · 系统开源检索与 Browser/Desktop/CLI 架构决策（2026-11-23）

**任务延续与原始目标**：仍为 AI Job Auto Apply（AI 自动求职），唯一 owner 是 projects/job-auto-apply/；本轮不重建项目、不改已有安装身份、不改原 R3 实现，不虚称 AI 或真实投递已上线。用户补充 boss-agent-cli，并明确 OpenDesk 自有 Browser 与独立 Desktop Runtime 可供组合，第三方后端应是选项而非必需品。本节专门回答哪些竞品遗漏、何时复用开源实现、后端如何组合、下一阶段应做什么。上述 R3 测试及 CI 回执保持有效；**R4 为代码与架构研究，不是安装或实站测试。**

### 研究方法与可信度

- 使用 GitHub 仓库搜索覆盖 BOSS 直聘/自动求职/AI Agent/浏览器扩展/油猴/CLI/MCP/桌面/Playwright/HR 回复/国际申请等 18 组关键词，多组结果去重。按「求职者侧 vs HR 招聘者侧」「源码可读 vs 仅 README」「许可证」「平台覆盖」「是否真的存在接口/业务分支」「长期运行/停止/回执」筛选；不是对所有 GitHub 项目的穷举。
- 交叉核验关键项目的 LICENSE、源码路径、CLI schema、扩展 manifest 和现有 OpenDesk 公共 API。GitHub Stars 只是社区热度，不能替代代码质量、平台条款许可、运行稳定性、能力可用性或商业使用许可。
- 证据标签：SOURCE_VERIFIED = 当前仓库具体文件/方法存在；DOC_CLAIM = 上游 README 声称；LICENSE_READ = 本轮读到实际 LICENSE；LIVE_NOT_TESTED = 本轮未登录/运行目标站；DEPENDENCY_UNAPPROVED = 尚未批准复制/安装/执行第三方程序。

| 参考项目 | 已确认依据 | 最值得参考的模块/经验 | 许可及可复用性决策 |
| --- | --- | --- | --- |
| https://github.com/can4hou6joeng4/boss-agent-cli | LICENSE MIT；src/boss_agent_cli/commands/apply.py、greet.py、mcp_server.py、api/client.py；docs/architecture.md、capability-matrix.md | 7 键 JSON 信封、boss schema/availability、MCP 到子进程 CLI、停止/预算/checkpoint、错误/unknown 分级；目前只有 zhipin 平台已注册 | LICENSE_READ；可选的**本机只读后端候选**，不直接装为默认后端；需要能力/来源/账号/副作用审阅 |
| https://github.com/YanQuan-dozzy/Boss-Claw | LICENSE Apache-2.0；desktop-app/electron/preload/platform-adapters.cjs、control-bridge.cjs | BOSS、猎聘、智联、51job 适配表；本地 Bridge、任务状态、身份与发送回执分离 | LICENSE_READ；优先参考多平台设计；README 说明部分发行版能力尚未全量开源，实际可复制范围需逐文件核对 |
| https://github.com/impengpong/jitou | LICENSE MIT；zitou-extension/manifest.json、src/content/selectors.js、job-sender.js | Chrome MV3 Side Panel、候选筛选、详情/JD、消息验证、上传进度，纯扩展无作者云后端 | LICENSE_READ；最接近 OpenDesk Browser 前端形态；宿主权限与实际行为不同，不复制另一套安装/消息总线 |
| https://github.com/InfernalAzazel/ghost-job | LICENSE PolyForm Noncommercial；README 明确源码不公开/个人非商业；公开目录主要为介绍与素材 | 求职 CRM、HR 沟通、企业风险、求职漏斗、结果可观测性、多账号隔离 | LICENSE_READ；**仅产品研究，不商用复制源码** |
| https://github.com/FengLeo666/boss_react | src/、main.py、README 中 LangChain/nodriver/SQLite checkpoint | Agent 工具调用、错误恢复、交互状态 | 本轮未确认根许可证；不得默认商用复制；其反检测方案不是 OpenDesk 目标 |
| https://github.com/chenyu152/BossFlow | backend/app.py、mcp_server.py、README 的 FastAPI/MCP/本地简历 | 本地持久化、岗位资料与简历、Agent API | README 声称 MIT，但本轮未读到实际 LICENSE 文件；源代码许可需再次确认 |
| https://github.com/mucsbr/mcp-bosszp | LICENSE MIT、boss_zhipin_fastmcp_v2.py、README | MCP 接口拆分与用户登录状态 | 部分实现涉及直接平台 API / 自动安全验证；不可直接采用绕过流程 |
| https://github.com/yangfeng20/boss_batch_push | LICENSE Apache-2.0，油猴脚本 | 轻量网页筛选及直接页面工作流 | 仅辅助参考；不以批量海投作为 P0 目标 |
| https://github.com/aliu-ronin/boss-jobseeker | LICENSE GPL-3.0，manifest/content/background | 求职者专用 Chrome 辅助功能 | GPL 有分发义务；未经单独许可审查不混入商业产品 |
| https://github.com/feder-cr/Jobs_Applier_AI_Agent | LICENSE MIT，Python 工作流 | 国际网站 job-apply Agent 与简历定制 | 海外产品参考；不直接等同 BOSS 合法可用 |
| https://github.com/suxrobGM/jobpilot | LICENSE MIT，TypeScript 本地 JobPilot | 多招聘站点填表、真人接管与简历适配 | 跨境平台扩展候选；具体站点许可、登录与发送待审 |
| https://github.com/loks666/get_jobs | R3 已核源码及 LICENSE PolyForm Noncommercial | 职位、HR、AI、沟通、图片简历业务流程 | 沿用 R3 决定：只研究、不复制到商业项目 |

**关键行为校正**：
1. boss-agent-cli 的 apply.py 最终调用 platform.apply；其 api/client.py 目前把 apply 映射到即时聊天/招呼端点，而不是具有独立「附件简历已提交」证据的统一申请动作。OpenDesk 必须区分 JOB_CONTACT_CONFIRMED、APPLICATION_SUBMITTED、RESUME_UPLOADED 三种事实；CLI return ok 或 HTTP 成功都不自动等同“投递成功”。
2. boss-agent-cli 提供 CLI、stdio/MCP、Python API 与 JSON 输出，**并非天然提供适配 OpenDesk localTasks 的 HTTP 服务**。其 MCP server 内部通过子进程调用 CLI；新增集成必须先在可信本机端建立明确受控适配，不能让 Sidebar 沙箱执行任意命令、访问任意 localhost、获取原始 Cookie。
3. Boss-Claw 声称四平台端到端链路，但本轮只核验到了公开适配表与相关源路径；当前网页实站及发行二进制并未运行验证。Ghost Job 的功能更丰富不意味着源码可商用。

### OpenDesk 现有真实能力边界

- Browser 项目已有 Side Panel v2 + 同包 Page USER_SCRIPT、OpenDeskTool.request(page.request)、安装/网站 Authority、受控 Controller page/Locator、runId/resultId/Stop、Native installed-task 调用与持久结果，不创建第二套浏览器执行器。
- Desktop 独立仓库 shopable-ai/opendesk（默认分支 master）提供 Runtime、Desktop App、BrowserDOM、Command.run、MCP/AI CLI 等。但 Command.run 是**可信、本地且按 execution 授权**的进程执行能力；默认本地脚本/ai run 可用，HTTP/MCP/Scheduler 默认不开放。BrowserDOM 有受权真实标签与语义定位能力，但不是完整 Playwright，不支持任意 CSS selector / evaluate。不能让浏览器沙箱直接调用这些原生能力。
- Browser 仓库 docs/api/local-task-bridge.zh-CN.md 描述已审阅 localTasks 服务的有限 HTTP 契约（/v1/runs、查询、stop、导出），**不是**对任意 Python/CLI 的透明代理。需要集成 CLI 时，由专用可信适配器转化/校验，必须独立证实已安装 Host 的真实能力、版本与授权。
- 本轮没有证明 SDK 公共能力缺口：SDK_GAP_NOT_PROVEN。自有 Desktop 的存在不代表它天然已与当前 Sidebar 组成已授权后端。

### 架构决策（逐层而不是二选一）

**选择：Browser-first + optional Desktop enhancements + optional pinned CLI adapter。默认不安装 Python、MCP 或第二个浏览器。**

| 模式 | 好处 | 代价/风险 | 结论 |
| --- | --- | --- | --- |
| A. Browser + Page/Controller 自研 | 安装边界清晰、复用现有任务和当前登录页面、依赖少 | DOM 改版/长任务/海量历史持久化需要迭代 | **P0 默认执行链路** |
| B. 直接接 boss-agent-cli 作为唯一后端 | BOSS CLI、search/detail/AI/可恢复采集现成 | Python 环境和隐式 API、双账号/双 Cookie、服务协议变化、模型/任务重复、apply 语义不完整 | **不采用为唯一核心** |
| C. 所有 BOSS 操作交 Desktop RPA | 利用已有 BrowserDOM、Command 和原生文件能力 | BrowserDOM 非完整 Playwright、另一个执行控制面可能竞争同一网站会话 | **仅明确需要原生能力时使用** |
| D. 浏览器主链 + Desktop 可选服务 + CLI read-only provider | 默认简单、独立安装、可逐步增加大规模数据和更多平台、可比对 provider 质量 | 必须定义清晰单写者、数据所有权和授权边界 | **目标演进方案** |

**分层业务契约（不创建新的公共 SDK）**：

1. JobObservation（事实层）：platform、accountScope、jobId、URL、来源/DOM documentId、采集时间、JD 字段和字段级证据；缺值为 unknown。按 platform+accountScope+jobId 去重，不能用职位名称替代精确身份。
2. MatchDecision（决策层）：hardFilters、softScore、aiAssessment、evidence、unknownFields、reasonCodes。规则分和 AI 分分开展示，AI 失败不补造事实。基于用户已确认真实简历；对外 AI 服务须有独立数据授权。
3. ReviewApproval（人工批准）：岗位、公司、招聘者、当前账号、文本 SHA、候选修订、网站授权代次及有效期；其中任一变化让批准失效。批量审批不是隐式授权所有后续沟通。
4. ExecutionAttempt（唯一副作用负责人）：单一 provider 固定 Browser Controller / approved Desktop adapter / future CLI adapter 之一，一次只允许一个已授权执行器拥有同账户/同岗位写 lease；执行失败不会换 provider 自动续发。
5. EvidenceReceipt（回执层）：operationId、providerRunId、requestId、actualObservedAt、siteEvidence、businessState、uncertainty 和 stopCause。区分 DRAFT_READY、CONTACT_SENT_CONFIRMED、APPLICATION_SUBMITTED_CONFIRMED、RESUME_UPLOADED_CONFIRMED、UNKNOWN、FAILED、CANCELLED；发送 ACK、UI click 不是完成回执。
6. JobRepository（存储层）：P0 沿用已通过测试的 CAS 本地清单；P1 需要更多历史与多终端协同才选择可信 Desktop SQLite。迁移时单一权威源、显式快照/校验/切换，不双写两个存储；boss-agent-cli 自带 data-dir 也只是外部 provider 状态，不直接当 OpenDesk 真相数据库。

### 后端接入的最小验收（先只读，再单岗位）

阶段 S0：**保留现有 P0 代码**，先在 BOSS 真网页完成 DOM/详情/JD/招聘者 ID/历史沟通的只读验收。这是 R3 尚未完成的依赖，不重做 60/60 Node PASS、项目命名和工具安装内核设计。

阶段 S1：制作一个可选的“后端能力探测”**最小适配原型**：Desktop 可信执行 Command.getCapabilities → 对已安装、版本已锁定的本机 boss-agent-cli 使用允许列表运行 boss schema 和一条只读查询 → 对七键信封校验 schema_version/ok/error/recovery_action → 用只读 JobObservation 导入本地展示；**不得登录/导出 Cookie/打招呼/运行 batch-greet**。若用户没有 CLI，原 Browser 功能仍正常使用。

阶段 S2：优先用 OpenDesk 已安装 Controller 完成**一个**用户确认岗位的草稿预填、身份检查与真实发送后观察。发现验证码、账号风险、身份漂移、授权撤销、超时或回执未知立即停止；未知只查询原会话/Run，禁止换 CLI/桌面重发。单岗位未通过前不部署自动投递。

阶段 S3：真实单岗位可靠后，按需增加人工批准队列、止损、CRM、简历管理与桌面原生本地数据库。验证两执行器不会争夺同一账户/页面；先单机后跨设备，再扩猎聘/智联/51job，每个平台独立 adapter 和测试。

阶段 S4：只在真实发送、暂停/恢复和回执都有证据后考虑批量、定时、后台、VIP 云同步或更大规模商业功能；尊重平台条款、验证码和明确授权，不采用反检测、账号池与不受控刷请求。

### 拒绝的捷径、验收口径和下一动作

- 不把“CLI/MCP 有命令”当成与 OpenDesk 已集成，不把第三方 README 功能表当作运行 PASS；不复制 Ghost Job / Get Jobs 的 PolyForm Noncommercial 源码，不默认导入 GPL 代码。
- 不在 Sidebar iframe 中新建 fetch 任意 localhost 或直接 spawn Python；不将 AI 输出直接赋予发信权限，不让无权的 Page USER_SCRIPT 通过 DOM 事件伪造 Controller 审批。
- 不同时启动 OpenDesk Controller 和外部 CLI 向同一账号同一岗位发送，不共享/导出网站 Cookie，不通过切换通道绕过平台限制。
- 此阶段证据为 GitHub SOURCE_VERIFIED / LICENSE_READ / DESIGNED，**没有新的 Node/Chrome/Native/BOSS 实战验收**，R3 真实网站和正式安装仍 NOT_TESTED。
- **下一最小工程任务**应是 BOSS 已授权页面的只读 JD/身份/活跃度实站 DOM 核验 + 单独的可选 Desktop/CLI 只读可行性 Spike。只有两个都满足证据后，才起 P1 单岗位可审核执行；不要跳过依赖直接新增批量任务。


### R4 · 可交接的最小实施任务与验收矩阵

**目标**：下一轮从尚未验证的关键步骤继续，而不是重做 R1/R2/R3 或重新开展无边界 GitHub 搜索。本表是 R4 研究的执行摘要，上方开源矩阵、权限边界及六层数据契约保持权威。

| ID / 业务问题 | 最小动作（主要 owner 为当前项目） | 验证 / 完成条件 |
| --- | --- | --- |
| J01 / BOSS 页面字段是否真的准确 | 在用户已授权的真实职位搜索页只读核验 jobId、URL、职位名称、公司、城市、薪资、JD、招聘者、活跃度与已沟通标记；必要时仅更新 src/page/main.js | 实测动态加载、重复卡、SPA、页面变化、撤权及空状态；fixture 不等于 BOSS LIVE PASS |
| J02 / 卡片摘要不是完整 JD | J01 真实页面已证实后，按授权范围读取**单个经过审阅的岗位**完整 JD，记录每字段来源、采集时间、未知字段 | 字段与原网页可复核；不全站自动滚动抓取、不擅用隐藏接口 |
| J03 / 匹配结果是否可解释 | 项目内完善 JobObservation → MatchDecision → ReviewApproval 的数据契约；先硬性过滤，再基于本人确认的履历做 AI 提议 | 规则分与 AI 分分开；AI 不造履历；未经独立数据授权不上传简历；覆盖未知与反例 |
| J04 / 是否需要 CLI 后端 | **独立只读 Spike**：仅在已获权限的可信 Desktop 本地进程检查 Command.getCapabilities、已有 CLI 的版本、boss schema 及 JSON 信封，映射到 JobObservation | 不自动安装 Python，不扫码登录、抓取 Cookie、调用 greet/apply；CLI 不可用时 Browser 正常运行 |
| J05 / 如何证明真实沟通 | J01–J03 确认后，由已授权 Controller 先做**一个**用户审核过岗位/招聘者/文本的受控操作 | 比对当前账号、岗位、招聘者与消息 SHA，原 Run/Result/Stop 完整，网页实际发送回执存在才记录 CONTACT_SENT_CONFIRMED |
| J06 / 防重复与未知回执 | 统一执行账本：同一账号/同一岗位一次仅允许一个 provider 写入；分开 CONTACT_SENT、APPLICATION_SUBMITTED、RESUME_UPLOADED | UNKNOWN 只读核对原 Run 和会话，不跨 Browser/Desktop/CLI 重发；覆盖双启动、撤权、身份漂移与 Stop |
| J07 / 长期历史存储 | 先判断当前 24 条 CAS 队列是否真的不足；若不足才计划转移至 Desktop 本机数据库，采用快照验证、原子切换 | 仅一个权威事实来源，不把 CLI data-dir 和 Browser 本地队列同时当真相；迁移无丢失 |
| J08 / 多平台与正式交付 | 先让 BOSS 真实单岗位读取/匹配/审核/回执通过，再逐站增加猎聘、智联、51job adapter 和 PC 展示 | 每个平台独立权限、字段、状态及回归；不复制非商业许可证代码；发布需经过正式安装审阅 |

**冻结技术选择**：Browser-first（默认）→ Desktop optional（可信原生增强）→ CLI optional（可插拔、初始只读）。任何命令可用性声明都不自动授予对外发送权限。

**下轮最短路线**：复用已有候选和 Node 测试证据 → 合法安装审阅 → BOSS 真网页只读扫描 → 核实字段与未知状态 → 定向修复项目代码并回归 → 待身份、授权和真实回执可证明后才做单岗位审批发送。没有实站/本机环境则继续 J03/J04 可逆的离线或只读工作，并明确 J01/J02 NOT_TESTED。

**不做**：不重创新的 job-assistant 项目、不生成第二套 Host/Runner/Installer、不默认安装 Python 或启动隐式接口服务、不将按钮点击/CLI apply 成功解释成已经投递简历；没有证据的 Browser Framework 通用缺口标记 SDK_GAP_NOT_PROVEN，避免越权扩改。


## R5 · 付费竞品与网页内嵌交互预览（2026-11-23）

**原始产品目标**：AI Job Auto Apply 最终让用户在 BOSS 及后续招聘平台中快速发现真实职位、根据真实简历解释匹配、过滤不合适岗位、逐条审核沟通、保留可验证的结果。已有 Sidebar Tool v2 + USER_SCRIPT + Controller 架构不重建。用户新发现缺口：除了侧栏管理，还需要在目标招聘网页上提供轻量的“当前职位辅助区”；与此同时，应通过已有付费求职产品观察真实商业化方向，而不是只参考开源项目。

**交付边界**：本轮新增独立、纯内存、可点选的离线交互原型：[preview/index.html](preview/index.html)。它由“BOSS 风格模拟招聘页面 + 每个职位的 OpenDesk 小型匹配提示 + 当前 JD 旁的内嵌分析卡 + 原有三 Tab 侧栏”构成。预览不访问 BOSS、不登录、也不发送、上传、保存真实数据。正式 Page 目前仍将 createPageUI 的 host 隐藏，并且只有 jobs.scan 只读 operation；**正式网页注入和侧栏互通尚未开发，不得把预览视为源码接线 PASS**。

### R5-A · 已核实公开收费的竞品样本

本轮按官方定价/FAQ 页面整理 **5 款国内直接相关产品与 11 款国际或跨境产品，共 16 个有公开付费方案的不同产品**。这不是市场全部供应商，也不是 16 家已经证明盈利：只验证“公开页面存在该标价的收费商品”。截至 2026-11-23；货币、扣费周期、套餐上限不能直接横向相加，网页价格可能随活动与地区变动。产品网站公开的“无限”“成功率”等营销语言没有实测。

| 地区/产品 | 官网公开价格样本 | 主要付费权益 / 用户为何可能付款 | 证据 URL |
| --- | --- | --- | --- |
| 国内 BOSS直投 | ¥19/7日、¥69/约30日、¥199 长期 | 自动处理职位、匹配评分、按使用周期付费 | https://zhitou.worktruth.cc/ |
| 国内 AI投递官 | ¥4.2/3日、¥19.9/月卡、¥49.9/季卡、¥180/年卡 | 岗位分析额度、多平台权益、规则筛选；卖额度而非仅卖安装包 | https://resume.skystudio.work/ |
| 国内 简历快投 | ¥39.9/月、¥79.9/月 | BOSS 单平台及多平台、智能过滤、沟通草稿和图片简历 | https://www.jobdajob.com.cn/pricing |
| 国内 智能求职助手 JobGenius | ¥59/月、¥89/月 | 采集、AI 分析、企业信息、定时和批量沟通 | https://jobgenius.cn/ |
| 国内 面灵求职网申助手 | ¥99/30天、¥159/30天 | BOSS HR 沟通、网申、面试与笔试辅助；更高档是一体化套件 | https://www.mianlingai.com/boss-zhipin/ |
| 海外 Simplify | Simplify+ $39.99/月 | 免费自动填写 + 付费 AI 简历、工作申请与 Autopilot | https://help.simplify.jobs/en/articles/5623502-whats-included-in-simplify-features-and-pricing |
| 海外 Teal | Teal+ $29/30天 | 简历关键词、匹配、求职追踪、AI 面试练习；不代交申请 | https://help.tealhq.com/en/articles/9530153-teal-vs-teal |
| 海外 Huntr | Pro $40/月 | AI 定制简历、匹配评分、求职追踪与洞察 | https://help.huntr.co/en/articles/10714568-plan-types-and-pricing |
| 海外 Jobscan | $49.95/月 | ATS 优化/职位匹配，含少量 Auto Apply credits；提交逐条审核 | https://app.jobscan.co/plan |
| 海外 Careerflow | Premium $23.99/月 | AI 简历优化、申请跟踪、LinkedIn 优化和自动填写辅助 | https://www.careerflow.ai/premium |
| 海外 Rezi | Pro $29/月、终身 $149 | AI 简历、ATS 关键词、报告与面试练习 | https://www.rezi.ai/pricing |
| 海外 Wobo | Unlimited $34.99/月、Autopilot $44.99/月 | 自选/自动选择岗位两种工作流，付费匹配、简历和自动申请 | https://www.wobo.ai/pricing/ |
| 海外 LoopCV | Standard €8.99/月、Premium €29.99/月（官网卡片样本） | 多职位搜索循环、CV 匹配、申请/邮件额度与跟进 | https://www.loopcv.pro/pricing |
| 海外 FastApply | $14、$29、$49、$89/月 | 申请数量档位，自动投递任务数量；AI 简历定制为附加付费 | https://fastapply.co/ |
| 海外 JobCopilot | Premium 起 $0.93/日、Elite 起 $1.05/日 | 自动申请、岗位匹配、申请审核与履历调整；页面为折算起价 | https://jobcopilot.com/pricing/ |
| 海外 JobWizard | Pro $39.99/30天 | Chrome 网申自动填表、开放题、求职信及内推线索，不等于自动发信 | https://jobwizard.ai/zh-cn |

**特别注意**：LoopCV 官网卡片标 €8.99/月而其页面 FAQ 另写从 €9.99/月起，属于同一官网内部口径差异；本矩阵记录具体卡片样本，付款价格须以最终 checkout 为准。JobCopilot 展示的是“起 $/day”，不是单日结算承诺。各产品真实销量、收入、留存、退款、对 BOSS 的实际成功率均未获得可信财务证据，统一 UNKNOWN。不得由“公开定价越高”推断“需求越广或转化越高”。

### R5-B · 商业证据分级与功能机会

**证据强度顺序**：
A1 商家宣称功能（最弱） → A2 官网存在可核对的付费 SKU / 条款（已获得，说明有商业化尝试） → A3 独立用户付费购买/退款/应用商店长期评论（尚未系统核验） → A4 可核财报/收入、付费转化、用户留存、招聘结果改进（未核实）。

因此本轮唯一可以确认的供给结论是：“至少存在 16 个可核对价格的付费 AI 求职相关产品”；不能确认市场总数、支付人数或实际需求规模。下一轮有价值的商业研究应只新增 A3/A4 证据（例如有效装机数、付费评价、实际求职节省时间、续费/退款、一次有效回复成本），而不是重复搜报价表。

从付费权益出现频次与对本产品的依赖关系推导以下产品机会：
- **P0 免费可用/获客**：真实职位识别、基础过滤、当前职位匹配解释、页内一键加入待审、少量本地历史、人工草稿；这是产品获得信任的必备能力，不应全部锁到会员后。
- **P1 付费候选（验证后）**：基于本人真实简历的证据约束 AI JD 评分、定制简历/沟通文案、更大可审记录、跨设备备份、细粒度公司/HR 分析、真实回复与漏斗。AI 计费可区分个人自带模型与托管额度，公开成本，不以“AI”标签替代真实推理。
- **P2 付费候选（须先证实原生能力）**：多平台适配、原生 Desktop 历史库、用户批准的单岗位发送和后续安全队列、真实面试记录、团队/高校服务。不能因为竞品收费就默认支持无确认海投、绕过平台或无限自动发送。
- **不应优先变现**：网页内嵌区显示评分的行为、基础撤权/停止、未知副作用保护；这些是基础安全与可靠性，不是 VIP 专属功能。

### R5-C · 网页内嵌组件（不是再复制一个侧栏）

**核心交互：少占网站空间、按职位显现、不同表面职责不重复。**

1. 职位列表卡片：识别并完成当前扫描后，在卡片现有信息旁显示一枚小型“OpenDesk · 规则 85 分 / 排除 / 待核实”状态；不在每卡插入完整面板。状态随岗位/筛选修订变化，离开网页或撤销权限时清理。不借 DOM 内容伪造平台身份。
2. 当前选中职位详情：在不盖住原职位 JD、聊天/发送按钮的位置，以受管 Shadow DOM 挂载轻量分析区，最多展示“规则评分或排除、主要理由、缺失证据、加入待审、准备草稿、侧栏查看”。未扫描或无法确认当前职位只展示受控诊断，不给出虚假匹配。
3. Side Panel：保留现有“职位发现 / 待审核 / 匹配规则”三个 Tab，用于跨职位管理、规则设置、草稿编辑及持久数据。网页卡片只处理“这个岗位”，侧栏负责“所有岗位/我的偏好”，不在网页重建完整配置表和 AI Chat。
4. 状态（预览可切换）：标准岗位、显式已沟通、身份缺失、硬条件不符、权限撤销、空列表、异步加载；所有真实对外发送与上传操作在原型里禁用。
5. 设计 P1 执行态：未来若接入真正的 Controller，不在页面内嵌区提供绕过审批的发送按钮；只跳转原受控审批与任务入口。按钮点击、草稿、复制、启动、发送和申请提交必须是不同状态。

**正式源码接入边界**：现有 src/page/main.js 的 createPageUI.host 被隐藏，这是为了只读扫描。若 R5 预览经人工确认且真实 BOSS DOM 取证完成，正式开发可以在同一个 Page owner 内使用 createPageUI 的受管 Shadow DOM，采用新增经过 Schema 验证的有限业务操作或只读共享存储；网页 UI 不直接成为具有 Host 权限的 Side Panel。用户同意安装、站点权限、页面/文档变更、onDispose、旧请求/旧审批失效均复用原 SDK，不复制另一套通信总线。当前只设计，SOURCE_PREVIEW_ONLY。

### R5-D · 预览交付与可验证操作

**唯一预览文件**：projects/job-auto-apply/preview/index.html（单文件 HTML/CSS/JS，可离线打开、双区域、无外部网络脚本，纯内存状态）。不创建 preview-r5-final.html 等重复版本。正式 src/index.html/style.css/main.js 和 page/main.js 此时**未修改**；现有 R3 60/60 测试不能代替此新增预览的浏览器交互验收。

操作矩阵：
- 默认选一个 Android 职位 → 点击侧栏“扫描页面” → 列表状态出现 → 详情页出现 OpenDesk 当前岗位分析区 → 可以加入待审核。
- 打开侧栏“待审核” → 可编辑并复制草稿 → 明确提示不发送；刷新离线预览会清除模拟数据。
- 更改侧栏匹配规则 → 规则分、排除理由与网页状态同步重新计算。
- 模拟“已沟通”“无 ID”“硬过滤” → 相应岗位不得加入/重复加入；只有证据不足时显示“待核实”。
- 模拟“权限撤销” → 网页内嵌分析区隐藏、扫描不可执行；模拟“空结果” → 不生成虚假职位；异步状态 → 恢复后才展示已扫描结果。
- 不在模拟中复用真实 Cookie、简历、AI 令牌或向第三方页面点击/发送；不以离线预览 PASS 声称 Chrome 已安装/页面注入成功。

**预览回归证据**：GitHub [App CI run 45101236297](https://github.com/shopable-ai/opendesk-browser/actions/runs/45101236297) 已包含新增 tests/preview.test.mjs 的 4 项测试，项目合计 64/64 Node PASS、候选构建/同源 PASS。此 CI profile 的真实 Chromium UI 作业为 SKIPPED，不能当作已在浏览器里点击/验收的证据。

**完成/未完成**：本轮已补国内外收费产品供应侧证据和互动设计稿；市场 A3/A4 付费结果证据仍未获得，正式注入、跨表面真实消息、BOSS 实站 DOM、真实发送、正式安装仍 NOT_TESTED/NOT_IMPLEMENTED。下一轮先审核这个预览的视觉与交互，再沿原 J01/J02 在真网页采证和最小接线；不重做 R1–R4、竞品全量搜索或直接进入自动海投。
