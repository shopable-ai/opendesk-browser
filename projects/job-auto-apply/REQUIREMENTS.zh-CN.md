# AI Job Auto Apply · 需求与验收（R1 / 命名 R2）

原始实现任务：OD-JOB-ASSISTANT-OPEN-SOURCE-MVP-R1；本次改名任务：OD-JOB-AUTO-APPLY-NAMING-R2。身份：OpenDesk Browser main / projects/job-auto-apply/。

## R2 名称、搜索意图与交付真实性

产品英文名 `AI Job Auto Apply`；中文名“AI 自动求职”；唯一工具 ID `job-auto-apply`；页面模块 ID `app.job-auto-apply`；项目目录 `projects/job-auto-apply/`。原 R1 名称 `job-assistant` 作为 Git 历史，不保留第二个实体或安装包。

选择依据：`Job Auto Apply` 对应用途和搜索意图更直接；`AI` 表示计划中的智能匹配能力；`AutoJob` 更短但语义稍泛。名称选择是产品判断，不是实测 SEO 排名或用户行为研究。内部搜索的别名仅在真实检索机制支持后接入；此阶段不为 SEO 直接改宿主。

当前版本仍为 **SOURCE_WIRED、NOT_INSTALLED、NOT_CHROME_TESTED**。所有功能介绍必须区分现在可做的只读扫描和人工草稿，与后续规划的真实自动投递/AI/多平台。不要制造虚假投递回执、把规则评分说成 AI 或宣称已完成自动发送。

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

证据规则：静态源码存在记 SOURCE_WIRED；候选构建、Node、真实 Chrome/网站、正式包安装分开记。当前真实页面与本地构建：NOT_TESTED。下一步优先真实 DOM 取证和标准候选构建，不提前上生产。


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
