# AI Job Auto Apply · AI 自动求职（R3 工程基线 / R4 技术选型）

项目 owner：projects/job-auto-apply/；产品 ID：job-auto-apply；当前目标站点：BOSS 直聘（www.zhipin.com）。
工作分支：main。当前源码版本 0.1.1、Page revision 2。状态：R3_SOURCE_UPDATED / V8_SMOKE_PASS / APP_CI_BUILD_PASS / NODE_PASS。GitHub App CI run [45045931312](https://github.com/shopable-ai/opendesk-browser/actions/runs/45045931312) 已在业务源码提交 `959e6b13f9c07e90d0be191ad1c7a977c08ff535` 生成 0.1.1 同源候选包（SHA-256：`37a1873ad220ca5ca1ceb79859475a2595a0c2896cdcd678c5556cf43a21862a`，52,321 字节），**60/60 项 Node 测试通过**。其后的 R4 修改仅为本项目文档；尚未晋升正式包、未安装、未在真实 Chrome/BOSS 页面验收，更未执行对外求职操作。

## 解决什么问题

把“打开职位 → 阅读要求 → 过滤不合适的岗位 → 判断自己是否匹配 → 准备有针对性的沟通”从重复手工整理改成可解释、可审核的流程。初版不做全自动海投或绕过网站限制。

首个真实链路：用户已登录 BOSS 并打开职位列表 → 明确授权安装组合应用 → 在侧栏点击“扫描当前页面” → 已安装 Page 模块仅读取当前 DOM 已加载卡片 → 侧栏用本地规则排序、显示理由 → 手动加入待审核清单 → 打开沟通草稿，人工核对后复制。**没有任何自动点击“立即沟通”、发送消息、投简历或切换职位页的代码。**

如果未安装/未授权/页面已切换/页面改版，必须保守失败，不显示伪造岗位/成功投递。

## 命名与搜索词（R2 决定）

- **英文正式名称**：AI Job Auto Apply。**中文展示/检索概念**：AI 自动求职。
- **唯一稳定技术 ID 与项目 owner**：`job-auto-apply` / `projects/job-auto-apply/`，对应 Page 模块 `app.job-auto-apply`。不要同时维护 `job-assistant` 副本。
- **最重要的核心短语**：`Job Auto Apply`、`Auto Apply`、`AI Job`。BOSS 地区需求词为“BOSS直聘求职”“BOSS直聘自动投递”“岗位匹配”。`AutoJob` 可以做用户搜索别名，但不是本项目的规范 ID。
- **当前产品实际能力**：BOSS 当前 DOM 只读扫描、确定性匹配排序、待审清单和沟通草稿复制；未接入 AI 语义推理、未发送/投递/上传。含“AI”“Auto Apply”的名称是长期产品定位，正式页面描述必须标明当前能力，不能宣称自动投递已经上线。
- **SEO 边界**：OpenDesk 内部扩展检索是否索引 description/别名，要以实际内置检索实现为证据；目录名/应用 ID 本身不会让 Google 自动收录。外部搜索需要有可索引的产品落地页，配合真实功能介绍和合理标题，不靠无关堆砌。当前只改应用自身配置与源码，不改框架或新增未经验证的别名字段。
- **改名时机**：上一轮虽已创建 R1 源码，但没有正式安装包与真实用户数据，所以现在统一 ID 不需要设计数据迁移；若日后出现已安装身份，改 ID 则必须走专门迁移，不能当作普通改标题。

## R3 已落实的差量能力与限制

- BOSS 职位 ID 移除 URL 的 .html 后缀及查询串影响；历史队列 ID 在内存中兼容。缺少稳定 ID 的卡片仅可阅读，不能加入待审。
- 用户主动扫描时仅短暂等待异步 DOM（最长 1.4 秒）；页面或权限变化时拒绝旧请求，不自动翻页或发信。
- 读取卡片中的经验、学历、招聘者和可见活跃信息；显式已沟通/猎头标记支持过滤。未识别字段与完整 JD 均标为待核实。
- 规则匹配不是 AI；新用户默认不填写技能，默认草稿不虚构项目经验。
- 待审队列保留 CAS 校验；写入未知时锁定本会话后续写入，满额不会静默删除历史岗位。
- AI 简历匹配、真实发送、执行队列、暂停恢复、真实投递记录、图片简历与多平台仍未实现。

可追溯的功能差距与源码依据统一维护在 REQUIREMENTS.zh-CN.md 的 R3 章节，不另建竞争性需求文件。

## R4 开源项目补全与技术选型

2026-11-23 已根据 boss-agent-cli 扩展系统检索，补充 Boss-Claw、即投、Ghost Job、boss_react、BossFlow、mcp-bosszp、boss_batch_push、boss-jobseeker、AIHawk、JobPilot 等项目；按求职者侧能力、源码证据、许可证及执行安全分级。详细对照和行动方案见 [唯一需求文档 R4](REQUIREMENTS.zh-CN.md#r4--系统开源检索与-browserdesktopcli-架构决策2026-11-23)。

**现阶段决定：Browser 现有 Page/Controller 为默认业务主链；OpenDesk Desktop 为可选本机原生增强；MIT 的 boss-agent-cli 仅为候选可插拔 CLI/MCP/JSON 读取适配器，不是默认后端。** CLI 的 apply 目前以即时沟通端点实现，不能将执行成功等同于完整简历投递。此决策不增加任何新默认权限、不创建第二套运行器、不预装 Python、不调用平台内部接口。

本轮 R4 为仓库源码核验和设计文件变更；没有执行真实 BOSS 页面、原生 Desktop、CLI 集成或发布。原 R3 的 0.1.1、Node 60/60、候选同源证明不变；真实安装及对外沟通仍无通过证据。

### R4 决策与下一轮执行入口

- **保留什么**：`job-auto-apply` 身份、现有 HTML/CSS/JS 侧栏、同包 USER_SCRIPT、`page.request`、CAS 待审队列与原 Browser SDK/Controller/Stop/Result；不重创独立宿主或安装器。
- **优先做什么**：在用户已授权的真实 BOSS 搜索页面验证当前 DOM 识别与完整 JD、职位/招聘者身份、重复/历史沟通、异步加载、导航和撤权。当前 Node 测试只是 fixture，不能当作网站 PASS。
- **可选研究什么**：从 Desktop 可信边界只读探测已安装的 `boss-agent-cli` 的版本、`boss schema` 与结构化返回；不能自动安装、登录、提取凭据或发送。CLI 不可用时原 Browser 工作台仍应可用。
- **先不做什么**：未经单岗位真实验收，不进入批量发信、自动回复、定时投递、上传附件、跨平台调用、云端同步；不得把 `apply` 命令成功或点击按钮等同“已投简历”。
- **怎样验收**：Browser 单岗位提交必须单独验证审批身份、原 Run、网页实际消息及回执；任何 UNKNOWN 不自动重试，不切换 Browser/Desktop/CLI 补发。

需求、开源项目对照、业务状态契约、许可证和下一轮验收门禁统一保存在同目录 [REQUIREMENTS.zh-CN.md](REQUIREMENTS.zh-CN.md) 的 R3/R4 章节；不创建第二套总需求或竞品文件。

## R5 交互预览与收费竞品

**本轮新增唯一可交互预览**：[preview/index.html](preview/index.html)。在一个离线 HTML 内同时呈现 BOSS 风格模拟职位列表、职位旁的 OpenDesk 规则标记、当前详情里的轻量辅助卡片、现有三 Tab Sidebar；可操作扫描、切换岗位、加入待审、编辑/复制草稿、修改筛选规则，并切换已沟通、身份缺失、硬过滤、无权限、空结果、异步加载等状态。该文件只用虚构数据和内存状态，不加载外部脚本、不访问招聘网站、不发送任何消息；它不是可直接安装的 Page Module，网页注入正式源码仍未接线。设计意图是**网页只辅助当前岗位，侧栏负责跨岗位管理**，不在 BOSS 页面重建一个完整工作台。

**付费竞品的唯一权威文档**：[docs/market-competitors-pricing.zh-CN.md](docs/market-competitors-pricing.zh-CN.md)。2026-11-23 新一轮核对并扩充到 **30 款第三方公开定价产品（国内 6、海外自动申请/填写 14、相邻简历/CRM/面试服务 10）**，另列 BOSS 官方求职 VIP 参照；包含具体价格、套餐用量、来源网址、商业证据分级、跨地区/周期差异及后续调查清单。REQUIREMENTS R5 仅保留该链接及业务启示，避免多份价格真相。**官网有报价不等于实际销量、付费留存或求职效果已验证。**

**最新预览验证**：GitHub App CI run [45101236297](https://github.com/shopable-ai/opendesk-browser/actions/runs/45101236297) 在业务源码版本 0.1.1 未变的情况下，新增 4 项预览静态/脚本/安全回归，累计 **64/64 Node PASS**；候选构建和源码同源 PASS；真实 Chromium 测试在该项目的 CI profile 下被跳过，不能宣称页面视觉验收或 BOSS 实站通过。

**下一阶段最小任务**：先查看并确认上述双区域交互，再对真实 BOSS 页的职位/详情 DOM 进行只读取证，随后在同一个 Page owner 内最小接入受管 UI 和经批准的侧栏通信。最后进行定向 Chrome 验收；未完成前保持正式网页注入 NOT_IMPLEMENTED。真实发送、批量执行、会员支付和 Desktop/CLI 接线不是本次原型的一部分。

## R6 双表面网页交互预览（离线 Mock）

[唯一交互预览 HTML](preview/index.html) 已沿 R5 原文件增量改进：网页进入即模拟识别、列表轻量状态、当前职位证据、侧栏关闭时仍可加入待审及内联编辑/复制草稿；侧栏重新打开、导航、规则重评与模拟撤权不会丢失未显式重置的内存队列。顶栏提供 13 类场景，预览外部控制不属于正式侧栏 UI。测试入口为 `node --test projects/job-auto-apply/tests/preview*.test.mjs`，含 R5 静态门禁与新增 R6 交互 Mock；准确的 Node/CI 证据以对应提交的实际检查为准。

**R6 当前定向回执**：GitHub [App CI 45110104863](https://github.com/shopable-ai/opendesk-browser/actions/runs/45110104863) 对提交 `bd76cc9aa6bdd99368d2c63174c8534e65bcdef4` 执行 78/78 项 Node PASS 和候选源码同源检查；Chromium UI、本机 Chrome、BOSS 实站均 `NOT_TESTED`。同提交的独立全仓 Page userscript 依赖工作流未通过，不把它描述为全部 CI 绿灯。

**此阶段没有修改正式应用源码**：Page host 仍隐藏，`jobs.scan` 仍是只读 RPC；网页标记、详情辅助卡、共享 CAS 入队与规则更新推送都尚未正式接入，BOSS DOM、安装、视觉与真实执行仍待测。代码所有权映射、13 场景、CAS/权限边界及下一轮 J01–J04 步骤统一见 [需求 R6](REQUIREMENTS.zh-CN.md#r6--网页当前职位与-side-panel-的双表面协同2026-11-23)。付费市场仍只见原独立文档。

## 从哪些开源项目汲取设计思路

- Get Jobs / 工作无忧：https://github.com/loks666/get_jobs （已核实当前源码中的 Boss.java、BossChatNavigator.java、Locators.java、AiService.java、BossJobService.java、front/app/boss/page.tsx；现行 LICENSE 为 PolyForm Noncommercial 1.0.0，不复制其源码到商业产品）
- Python GetJobs：https://github.com/vvvsrx/get_jobs （架构参考，不作为运行依赖）
- AutoCast-Boss海投助手：https://github.com/gstranded/autocast-boss-assistant （职位筛选、去重、回执/暂停；MIT；仅作为对照）
- BossAutoApply：https://github.com/FanzhiZeng/BossAutoApply （轻量 Manifest V3 的 content/background 分工；MIT）
- boss-zhipin-helper：https://github.com/ConsoleSun/boss-zhipin-helper （DOM 监听、简历信息、AI 草稿；MIT）
- smart-job：https://github.com/DINQ-labs/smart-job （多平台 adapter 和 Agent 规划；MIT）
- joohw/boss-cli 等 HR 端自动招聘项目不是求职者端实现，不直接复用。

本项目新写原始代码，不复制第三方源文件。任何未来导入第三方代码需记录 LICENSE、来源版本与修改范围。

## 目录与权限边界

- tool.config.json：v2 Sidebar Tool；storage.local、page.module、user.export；同一项目打包。
- package.json：app.job-auto-apply 的 page-userscript 源，授权范围仅 www.zhipin.com；顶层 USER_SCRIPT。
- src/page/main.js：通过 OpenDeskAppPage 接收 jobs.scan；**只读已加载 DOM**，不给侧栏暴露任意脚本执行接口。
- src/main.js：侧栏偏好、规则匹配、待审清单、人工编辑草稿与复制；通过原 OpenDeskTool.request 调用，不使用 chrome.* 或任意网络请求。
- src/index.html + style.css：Side Panel 紧凑界面；复用主宿主 od-* 样式。
- REQUIREMENTS.zh-CN.md：需求树、验收与后续安全门禁。

OpenDesk 公开试点：docs/api/sidebar-tool-page-module.zh-CN.md。暂不改 Browser Framework 的 src/、manifest、Catalog、全局 SDK。Page API 和用户授权的真实可用性须本机验收，不能据源码推断正式可用。

## 开发与验证

在仓库根目录按既有命令构建到忽略的候选路径，不直接生成正式包：

    node scripts/build-sidebar-tool.mjs projects/job-auto-apply --out artifacts/sidebar-tools/job-auto-apply/candidate.opendesk-tool.json

先执行 JavaScript 语法/定向构建与页面 fixture 测试，再在已授权的真实 Chrome 上安装候选、刷新 BOSS 搜索列表，核对 Page module 的扫描结果。确认稳定才按既有打包 Skill 晋升唯一 job-auto-apply.opendesk-tool.json；不要因本说明直接认定安装已完成。

**已知未完成**：真实 BOSS DOM 选择器覆盖验证、登录及授权实测、动态页面长时间稳定性、AI 简历语义匹配、正式任务执行/Stop/回执、跨网站适配、跨页历史聊天核验、运行队列与简历上传。这些不得标为 PASS。自动发送和账号限制处理属于下一阶段独立审查。
