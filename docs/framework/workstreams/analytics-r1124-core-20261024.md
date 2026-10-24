# Analytics R1.12.4 — App Service 坏 Fire 独立隔离（2026-10-24）

- 写入范围：`src/analytics/authority-projection.js`、`tests/environment/analytics-r11-authority.test.mjs`、本记录；唯一写入 `main`，禁止其他分支/Worktree/PR。
- 开始前主线 HEAD：`b01fe99680423285faaec07794f211cb534c42cd`；R1.12.3 Analytics 源码修改与后续 Prompt Shortcuts 提交均保留。
- 真实问题：App Service `validScheduledRun` 直接 `canonical(binding)` / `canonical(fire.appBinding)`；损坏的嵌套字段可能抛出 `E_SCHEMA`，使整个 Authority `READ_FAILED`，遮蔽同一投影中的合法 Scheduler/Page 执行。
- 最小源码修复：在原 `validScheduledRun` 内对不合法绑定返回 false；将 canonical 的异常限制为当前 Fire 拒绝，外层原有 `projectionGap` 记录覆盖缺口；不增加采集事件、安装身份、SDK、Host 或 Consent 类别。
- 新反例：将 App Service Fire 的 `sourceIdentity.corrupt` 设为不可 JSON 序列化的 `undefined`，保留另一条独立有效 Scheduler Fire/Run/Result；要求坏 Service 不计成功、合法 Task 仍完成 1 次、投影标记覆盖缺口。
- 历史 CI `40068219852`：95 项、91 PASS、4 FAIL；R1.12.3 已提交相应四项修复，新候选 CI `40071712379` / `40070900430` 于本次核查仍为 QUEUED。本文不声明新增反例 PASS。
- Linux/Node 回归、真实 Chrome Native、Cloudflare D1 开发环境、PostHog 云端：以各自最新候选及原始日志为准；本记录不提升证据等级。生产接收 URL 继续关闭，Consent v8 不变。

## 2026-10-24 16:51（Asia/Shanghai）— 本机 PostHog 配置调查及续接准备

- 本轮范围：只读恢复配置、前置条件和已有 CI 身份；新增本机交接正文及 GitHub API 元数据，不修改产品源码、旧仓库、Consent、配置、dist 或浏览器。没有运行测试/构建、重新触发 CI、提交或推送。原历史段落中的 QUEUED 不代表最新状态。
- 找到实际旧项目配置：`/Users/shopme/Documents/workspace/opendesk/configs/product.json:33`，`analytics.provider=posthog`、`endpoint=https://us.i.posthog.com`、`environment=production`、Capture Token 非空，值未回显。该文件 SHA-256 `4b4cb2a45d45b47f1efa0b2740a354a30d2272469b4deeae1b8f9c40df0ca5e3`。`pkg/officialconfig/config.go:70` 明确为公共 `phc_` Capture Token，不能用作管理员查询凭据。旧仓库仅只读，其既有 master/dirty 不做改写。
- 旧 `docs/architecture/product-analytics.md:268` 记录 2026-09-18 旧 App 的 PostHog Activity 入库；本轮没有重验，该历史记录不证明 Browser 入库。旧 App 默认开启策略与 Browser 明确 opt-in 不同，禁止迁入。旧配置链为 `configs/product.json → apps/opendesk/assets/product.odcfg → internal/officialassets`，不复制旧 Go Provider/监听器为第二套 Browser 框架。
- Browser 配置现状：`src/analytics/config.js` 仍为空；`services/analytics/wrangler.example.toml` 是模板（EU Host、占位 D1 UUID、未配置实际 HTTPS route）。旧项目为 US，不能盲用区域不匹配的 Token/Host。仓库根、services/analytics、.local 顶层及当前进程环境未发现实际 Analytics 部署配置/相关变量；云端 Secret Store 未检查，不能认定云端不存在。
- 尚需核对的云端前置条件：项目/区域/管理员只读查询能力、已授权且独立的开发 Worker/D1/PostHog、DB binding/schema、HTTPS route、POSTHOG_PROJECT_TOKEN 与至少24字符 RATE_SALT、retention/日志脱敏/时区及关闭自动采集/录屏/人物档案。旧生产 Capture Token 不构成开发云端或生产采集授权。本轮 `NOT_DEPLOYED / NOT_CLOUD_VERIFIED`，不向旧生产项目发送样本。
- CI 复用：GitHub API 确认 run `40074948993` completed/success、head `2f57286d4a91affaeb98aa8772c13b188ce4950e`，job `120816197833` 与语法、HTTP/SQLite 步骤 success。元数据保存 `artifacts/analytics-local-codex-20261024/ci-run-40074948993.json` 和 `ci-jobs-40074948993.json`。97 PASS/0 FAIL/0 SKIP 引用用户已有结果；当前 Fetch 工具拒绝 job logs 端点，原始97条日志本轮未读，标 `EVIDENCE_INCOMPLETE` 待恢复，不重跑制造新结果。成功元数据及基线继续 `REUSE_RECORDED_PASS`，不提升为 Mac/云端证据。
- 本机上次观察：HEAD 与 fetch 后 origin/main `db831855fc2e40abcfe971ff1250b5ce783dd1a0`；共享 main 由其他 owner 更新。所查 Analytics 源码/服务/CI/tests/package 相关输入与成功基线无差异；Workflow UI/local-codex 等有后续变化，原生入口仍需相关影响分析。索引曾出现 `UU examples/sidebar-tools/prompt-shortcuts/preview/index.html`、`UU src/ui/sidebar-tools.js`，及大量 Prompt/Conversation/Cookie/测试/打包改动；归属未知，保护其他 owner，不解冲突、不操作索引，开始时重查。
- 开发现场仅为观察：dist/development 存在，development-update revision `59cf73436d6c390125413c1783d8426c85237fbdad9611c8592ff08d9c9c7deb`（不是整包Hash）；未见 dev/wxt watcher，实际 serve 连接/加载ID/当前包身份 `NOT_TESTED`。CFT PID17905 指向 conversation-r17 profile + dist/development；PID49554 指向 od-r352-installed profile + 独立 production-developer；均视为 `OWNED_ELSEWHERE` 不接管。PID68658 已服务 43111 demo-form，可只读核对后复用页面服务，不重复占端口。Native manifest 候选已定位，extensionId/doctor/allowed_origins 配对未验证。
- 唯一下一步业务动作：接收 owner 先核对可用受控 CFT、资源归属、实际包/ID/Native 配对，再从真实「开发」选择已安装 Page 程序点击手动运行；按同一正文继续 Workflow 三Run导航、TOC/AdBlock、Authority/Consent及恢复，只有新失败才最小修复。P1库存版本/完整授权/父绑定覆盖缺口与云端独立列出。
- 唯一最终续接正文：`docs/framework/prompts/analytics-local-codex-handoff-20261024.txt`（本机忽略文件，保留完整目标、六任务、配置前置条件、证据边界、并行保护与停止条件）。本会话工具清单没有 create_thread/read_thread/list_projects，故 `NOT_CREATED`，没有新线程ID、没有首条正文读回，不伪报交接完成。本会话 get_goal 实读 null；更早 Analytics goal 状态未知，不推断已停止/迁移/完成，也未修改其生命周期。若后续可调用原生工具，使用这份正文创建并读回，不另造摘要。

## 2026-10-24 — 当前对话继续 Page 手动核心验收（IN_PROGRESS）

- Owner：当前 Codex 对话 `01a16d15-fcc7-7670-8660-8d4733299da5`。新对话仍 `NOT_CREATED`：原生创建工具未提供，CUA 对 Codex 应用的访问被安全策略拒绝，未绕过。用户再次要求继续完成后，本对话推进原已授权的核心验收，不重复配置调查或97项测试。
- 下一条操作：独立受控 CFT 中，通过真实开发入口安装/选择 Page 程序，验证显式手动运行及原 Receipt；正式安装沿原 Program Authority，不向本机 storage 填假状态。
- 入口环境准备：原有 CFT Profile 与共享 dist/development 继续保护；已出现 `node scripts/dev.mjs` PID60614，不再启动第二 watcher。当前共享 main 有其他 owner 的 Workflow/Prompt/Cookie 修改，不操作索引/HEAD、不覆盖这些源码。
- 本轮独占资源：`artifacts/analytics-local-codex-20261024/native-page/`。从已fetch的最新远端main `a51331dce3ac34f5a16ab3697467ecb44d086a4c` 使用 `git archive` 导出普通静态源目录 `native-page/source`（无分支/无worktree），用原打包器独立构建 production Developer，守卫端口63949；只读复用现有node_modules。源码绑定见 `native-page/source-binding.json`。所查Page/Analytics/依赖输入与已通过CI基线无变更，原Node结果复用。
- 构建必要性：本轮尚无同候选可独占的已安装包，不能用其他 owner 的旧Profile冒充当前源码；一次独立构建仅为解除真实Page入口验收的包身份缺口，生产上报URL仍为空，不触发其他正式测试矩阵。

## 2026-10-24 — 两个真实框架故障修复及当前阶段收尾

- 最新纠偏：用户指出 `analytics-first-document-fixed` 看起来像另一个需安装授权的 Analytics 工具。Analytics 必须继续是 `src/sw.js → src/analytics/host.js → collector` 内置框架，只有全局自愿 Consent；Page 安装/网站授权只属于 Page 执行，不是统计依赖或额外统计授权。本轮临时 Page 名称造成混淆，已通过原 UI 将两个测试程序卸载；未向正式源码、官方目录或默认安装列表加入这些程序。原 T1–T6 保留，不继续扩展 AdBlock/恢复矩阵；当前先关闭新发现的框架故障和设置页核心阻塞。
- 源码主线核对：上次观察 HEAD `969127736484ba692a49a6d28574549dfd4bc400`、分支 main；本轮 Page/Analytics/依赖相关原文件与隔离导出基线 `a51331dce3ac34f5a16ab3697467ecb44d086a4c` 相同。只有下述显式 overlay。共享 watcher PID60614、其他 CFT/Profile、43111 服务及他人已暂存/未提交修改均未接管。
- 原始证据唯一目录：`artifacts/analytics-local-codex-20261024/native-page/`；原生命令为 `PAGE_LIFECYCLE_EVIDENCE_DIR=artifacts/analytics-local-codex-20261024/native-page node tests/framework/page-installed-native-session.mjs observe <label>`。CDP 仅被动读取原 Authority/Receipt/Document 和截图；用户动作均为 cua_repl 原生 Chrome 输入，未改写 storage、Receipt、授权或生成假事件。证据含本机原始身份，只留本地，不进入 Analytics 上传。

### 新故障一：安装后不刷新页面，首次手动运行被误拒绝

- 真实操作：开发 → Page DOM → 固定候选 → 原生验证 → 安装 → 同一已打开网页手动运行。第一次因缺少 Chrome 自身 UserScripts 开关明确失败；通过真实扩展设置开启并重新检测后没有自动重放。安装成功后仍出现 `E_PERMISSION 缺少匹配文档的真实安装引导标记`，没有执行效果或 Receipt；刷新为新 Document 后自动和手动都完成。失败原始文件 `manual-missing-bootstrap.json`。
- 根因与最小修复：Chrome 注册不会向已打开 Document 追溯注入自动 bootstrap；`src/scripting/user-scripts/installed-programs.js` 却要求经过认证的 Host 手动执行同样具备自动 marker。现在仅自动入口继续要求真实 marker；手动仍经原 Host、安装、ManifestHash、SourceHash、Generation、网站范围/排除、精确 Document 和原生 descriptor 检查，再走同一执行器，不伪造 marker、不降低自动入口要求、不新建 Runner。
- 先失败后通过：`first-document-before-fix.tap` 精确复现；`first-document-after-fix-final.tap` 为 19 PASS / 0 FAIL / 0 SKIP，只覆盖本次首次手动执行、自动 marker、原有 bootstrap/排除/UNKNOWN 清理和受影响授权边界。未重新运行97项 CI。
- 原生候选：CFT `154.0.8037.92`；实际路径 `native-page/source/dist/production-developer`，静态 production Developer 五 Tab；扩展 `cpnoicombmgfpbikdfancoajghhgmacp`；隔离 Profile `codex-cft-1a_vq78r`。基线包 `31639f6f60aca56ef98a8e10e2bc49ef4a20446d37311995d20a9238fc97ceac`；Page 修复包 `c7fa05d1dbed34339af8c5ac5fd6920c7af90796a935f44d83a60ceaee5e63b0`，overlay `fixed-source-binding.json`，成功构建 `fixed-build-evidence/build-production-developer.json`。首次构建的外部 node_modules 符号链接被原 provenance gate 拒绝，改用独占 APFS clone 后原构建成功，未放宽门禁。
- 已验证本机绑定：安装 `cee168a7-d00f-40bb-b6dd-277188cbdcf7`、Generation 1、ManifestHash `2658649992148412374db21d9329cb3df8683931ca98595bf56d7b47938a827b`、SourceHash `be839fd3d1afab7f27c61221bd50b72ede04d72e5132ad0da7fe9684d0719dea`。原 Document `DD497C88922D554ABB7FAE8AF14ABE3D` 首次手动 Receipt `711ea778-5fed-4212-b1f5-40759ff9aeb3` completed；刷新后 Document `5C17648A6903261C2A88807E9FF77511` 自动 Receipt `a60ea0fa-4a17-4fc2-a0fe-117db5234363`、手动 Receipt `16965eb7-b3b3-434b-8be6-b7282ea234da` 分离且 completed；停用后手动拒绝、再刷新原生 scripts=0、三条 Receipt 不增，未重放。见 `fixed-first-document-manual.json`、`fixed-auto-new-document.json`、`fixed-manual-after-auto.json`、`fixed-disabled-no-replay.json` 和 `acceptance-result.json`。
- 临时测试程序不是产品组成：`analytics-native-page` / `analytics-first-document-fixed` 均只在本轮可丢弃隔离 Profile 安装，现经原 Page Authority 确认卸载，列表恢复3个原工具、原生 scripts=0；见 `temporary-page-programs-uninstalled.json`。没有把测试程序提交为正式工具。旧候选的上述原生 PASS 不提升为后续整包 PASS。

### 新故障二：合法 Chrome Options Tab 被 Analytics Host 误拒绝

- 真实失败：原扩展选项页显示「无法连接可信统计服务，统计不可启用」。被动记录原生 `consent.status` 的 Sender：真实扩展 ID、精确 `native-agent/settings.html`、frameId 0、活动 Document、同 URL 的 sender.tab；`src/analytics/host.js` 原 `!sender.tab` 将其误判为不可信。原始文件 `consent-sender-before-fix.json` / `consent-unavailable.json`。这是本机设置页授权判定失败，不能误称 PostHog 云端不可达。
- 最小修复：仅修原 `fromOptions`。合法 Tab 必须精确扩展 ID/Options URL、顶层 Frame、有效 Document、同一 Tab URL且无 pendingUrl；拒绝隐身、错误 origin、非活动 Document 和其他网页/嵌入页，保留原无 Tab 的合法 Options Context。未改变 Consent 文本/披露版本、采集范围或 endpoint，不需要安装 Analytics 工具。
- 定向验证：新增两个真实 Sender 形态回归先为 0 PASS / 2 FAIL（`consent-sender-before-fix.tap`）；修复后只执行新回归及受影响的原 Consent→撤回→HTTP/D1-shaped 流程：`node --test --test-name-pattern='real top-level Options tab|real Options tab reports|verified Side Panel opens' tests/environment/analytics-r11-product.test.mjs`，3 PASS / 0 FAIL / 0 SKIP（`consent-sender-after-fix.tap`）。包含错误来源/子 Frame/旧 Document/隐身/导航中 Tab 的拒绝及撤回清队列；HTTP sink 不等于真实云端。
- 因本次实际源码变化，独占快照追加 `consent-source-binding.json` overlay 并用原打包器构建一次；成功包 `f53d743eb961bce8a2902a81232ccd6c791d7fab44402352c96f6d1d6d4cd939`，构建 `consent-build-evidence/build-production-developer.json`，attempt `72b2c197-f17f-481f-b7a5-b8f3d0a3b011`。通过 Chrome 原生「重新加载」和原「扩展程序选项」入口读回，并再次原生刷新，现稳定显示「尚未配置云端统计接收服务，统计保持关闭。」开关未勾选且 disabled，披露仍 v8，本机没有产生 Analytics 身份/队列；见 `consent-sender-after-fix.json/.png`、`consent-fixed-unconfigured.json`。原生 PASS 仅限当前未配置状态读取。

### 其他业务证据、复用与边界

- T3 官方 Reading TOC：本轮 Page 修复包实际预装版本1.0.9、原 Installer canonical SHA `56890b9feeb6908c5967eb16aed19a1e811f8d376dd270c01e78c0c93b052071`、原市场来源、启用/网站授权及 installationEpoch `b9d3deea-5341-40fb-876e-4ac35cacd744` 合法。真实点击「真实 HTTP · SDK axiosx / Fetch 对照」后目标标题从 top1512.9375（视区高度799）到 top87.9375 / bottom111.1875，文字中心命中，Document `B43C0238C9941F6A081A28B55C8E343D` 不变。见 `toc-before-click.json/.png`、`toc-after-click.json/.png`、`consent-toc-acceptance-result.json`。固定 Page Adapter 测量视区，Host 独立复核包/授权/Document；不混称 Host 独立测量视区。Consent 关闭，没有本地 B 级采集或云端上传 PASS。
- T2 `OWNED_ELSEWHERE`：并行 owner 已提交 `ab6ecbd4ea8975e6326ec7c7db5ea28c1fc23d5d` 修复真实 Workflow 导航和保存重放，记录仍为 `docs/framework/workstreams/workflow-r2342-native-20261024.md`。不重复改其文件或操作其 watcher/Profile；其真实页面/Bundle Run 证据不能自动证明 Analytics 三 Run B 级事件最终上报。
- 原97/97基线继续复用：用户已有总数与 GitHub成功元数据保留；本轮原始97日志仍 `EVIDENCE_INCOMPLETE`，不重新触发 CI。两项新缺陷对应 `AFFECTED_INPUTS`，只做所述定向验证。其他无关 main 更新不触发重建或全仓回归。
- 未验证项如实保留：真实 Consent 开启/撤回后的 Chrome 采集链、Page 实际失败 Receipt/撤权/UNKNOWN/SW重启恢复、六类 Authority 全部原生闭环、TOC 停用/撤权/旧代次原生反例、AdBlock DNR 启停和受控请求均 `NOT_TESTED`；普通生产 AdBlock 可靠命中指标仍 `NOT_OBSERVABLE`。上述两项新故障已闭合；原始六任务没有足够证据宣布全部 P0 清零。
- PostHog A/B/C/D 仍 `SOURCE_DEFINED / NOT_DEPLOYED / NOT_CLOUD_VERIFIED`，未执行真实 HogQL 编译或云端查询。生产 `ANALYTICS_INGEST_URL=''`、Consent `analytics-disclosure-2026-10-24-v8` 不变；D组每工具版本/完整授权/父级绑定 P1缺口未扩采。六维产品验收评分 `NOT_SCORED`，不把单模型或定向 Node 结果写成独立95分。
- 本轮正式修改仅 `src/scripting/user-scripts/installed-programs.js`、`src/analytics/host.js`、对应两个定向测试和本唯一工作记录；同提交保存修复，确切 SHA 见 git log 和本机 acceptance-result 的 fixCommit。其他 owner 索引和工作区保留。
- 当前唯一下一步：补齐已授权且独立的开发 Collector/Worker/D1/PostHog 接收与查询环境，才验证原生 Consent→真实操作→匿名 Collector→D1 ACK→PostHog可查；沿原链路，不另装 Analytics、不另建框架，不把旧生产 Capture Token 当开发授权。没有新失败不继续改源码；不自动恢复已延期的完整矩阵/评分。新对话仍 `NOT_CREATED`（工具不可用、Codex UI访问被安全拒绝），本轮没有冒称移交或更改 goal 生命周期。
