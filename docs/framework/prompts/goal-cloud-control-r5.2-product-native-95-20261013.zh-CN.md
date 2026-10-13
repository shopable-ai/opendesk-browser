# GOAL：OpenDesk Browser Cloud Control R5.2 — AI-First Real Cloud Control Product Closure

日期：2026-10-13。默认中文。仓库 https://github.com/shopable-ai/opendesk-browser，Mac 本地 `/Users/shopme/Documents/workspace/opendesk-browser`，**唯一可写分支 main**。

**执行模式：IMPLEMENTATION FIRST / CONTINUOUS EXECUTION / PRODUCT-FIRST / NATIVE EVIDENCE REQUIRED。** 直接修改原有 Cloud Control 源码，测试、构建、文档和原生验收；不得以新计划、UI mock、改名演示结果替代实际功能。开发初衷为 AI 协助创建 Task、用户审核/安装一次、外部受授权重复调用；绝非远端任意 JS/Shell/CDP 执行器。

## 一、用户使用场景（验收必须复述）

1. 用户在「我的」安装启用一个或多个已验证 Controller Task，如 `sample.form-fill@1.0.0`、`sample.modern-search@1.0.0`；「云控」显示可理解名称、用途、版本、固定网站范围及参数约束。
2. 用户选择允许哪些 Task 远端调用，按任务独立授权是否可回传结果**正文**。默认不回传正文；允许最小完成/失败状态回执，不得包含网页内容、URL、Cookie、valueWire 和原始错误。
3. 用户配对可信 Provider；外部服务针对指定**已配对的浏览器 Executor** 投递 Task。双方均须保留原固定 Task manifest/source、安装 identity/generation、Chrome Site grant 及原 Host/Authority。
4. 真实 Chrome Worker 在不同真实网页运行两份不同源代码，生成原 Run/Result/retirement、Provider receipt，用户在请求历史查看状态与未知副作用。
5. 用户能够 Stop、停用 Task、撤销权限、重新安装/升级、解除配对。断线、重启、结果回执丢失时不能重复不可判定的网页副作用。

### 场景 A：双 Task 真正执行
固定样本 Task A：`sample.form-fill@1.0.0`，接收姓名，真实填写并提交；Task B：`sample.modern-search@1.0.0`，关键词搜索并取内容。两个 TaskId/sourceHash/params/网页效果不同。两份独立包验证、安装、批准、投递、Worker、原 RunId/ResultId/Result.revision.sourceHash、retirement released、Provider receiptId 全链齐全才能 `NATIVE_VERIFIED`；Node 模拟 `runRef` 不算。

### 场景 B：最小状态回执与结果隐私
明确区分「执行完成/失败/停止/未知状态」与「网页数据、返回值、原始错误详情」。Result Allowed false 时仍可传三字段最小回执，保持原 durable Result 和 receipt 幂等，不可向 Provider 泄露敏感正文。必须含攻击性字段拒绝测试，断电/丢失响应重复上报不创建二次执行。

### 场景 C：双 Executor 同 Task 安全隔离（P0）
不同用户/浏览器安装相同 Task，Job 强制绑定 `providerId + targetExecutorId + pairingId + immutable Task + requestKey/digest`；非目标不能 claim/admit/receipt/reconcile，不能伪造另一用户 permit。新配对不继承旧授权，撤销后旧凭据禁止领取。旧缺 owner 排队 Job 保守隔离，旧 Run/Result/receipt/历史不能删除。不要新建第二套 Provider/Task Registry/Worker。

### 场景 D：实际可信远程调用
本机 `127.0.0.1:43112` HTTP/WS 仅演示；真实 Provider 要可经 HTTPS/WSS 由外部可信客户端按服务器端签发、限制目标 Executor 的 client token 投递，并由 Chrome 连接领取。Admin API 只本机，不对外开放；真实 TLS、凭据机密和目标浏览器绑定；Provider 可达绝不能免除 Task 安装及网站权限。不得私自购买域名、开通云账号或部署生产服务器。无批准公网环境时最多把协议栈升级 `SOURCE_IMPLEMENTED/COMPONENT_TESTED`，跨公网原生保留 `REMOTE_NATIVE_PENDING`。

## 二、读取仓库原合同与源码

按顺序核对 `AGENTS.md`、`docs/framework/testing-guide.md`、`docs/framework/parallel-development.md`、`docs/framework/workstreams/cloud-control-r5-01-generic-task.{md,json}`、`docs/architecture/browser-framework/cloud-control-r4.zh-CN.md`、`docs/architecture/ui-layout-conventions-r27.zh-CN.md`、`docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md`、`examples/cloud-control/README.zh-CN.md`。

源文件：`scripts/cloud-control/{provider,task-registry,cli}.mjs`、`src/cloud-control/service.js`、`src/platform/tasks/{service,contract}.js`、`src/ui/{cloud-hosting.js,tool.html,tool-shell.css}`、`tests/cloud-control/`。首先对比最新 main、受影响文件 SHA 和旧 CI 输入；可复用同 SHA 的成功用例，不无意义全量重测。

R5.1 旧证据 SHA `93c78341271032cb3c641f2b818e9636fb6b88e9`，Actions [#38351008157](https://github.com/shopable-ai/opendesk-browser/actions/runs/38351008157)：226 PASS/0 FAIL 和双构建 PASS，**不是双真实 Chrome Task 验收**。

本轮 R5.2 的最新提交和真实证据从 `docs/framework/workstreams/cloud-control-r5-02-product-closure.{md,json}` 读取，禁止覆盖旧 workstream 和失败记录。

## 三、Side Panel 产品级体验（已有页面，不建 mock）

基于 R27/R28 的设计 tokens 和原 Side Panel：
- 第一层显示配对、连通、已启用和可执行状态，不重复“云控”标题。
- 第二层展示一个/多个已安装 Task，可读名称/用途/版本/网站范围/逐项结果许可，已选数量、未通过或安装代际变化要显示原因；默认任务摘要不堆积 SHA。
- 第三层 `details` 展示 TaskId、ManifestHash、SourceHash、InstallationId、Generation 和完整参数 Schema。
- 最后显示真实请求记录，区分等待、准备、运行、完成、失败、取消、回执待确认、结果未知。
- 首次未配对、无任务、连接失败、任务失效、离线、执行槽被占、升级需重新审批等都应清晰；用户日常操作不要求 npm/编码，减少授权跳转。
- 切 Tab 不创建第二 RunHost；刷新只读不主动 claim；Stop、取消和解除配对语义清楚。
- 严格验收 300/320/360/420/520 CSS px、Chrome 125%/200%、键盘/焦点顺序/aria、长任务名/Origin、无任务/多个/部分停用/结果未知、100+ 历史响应性能。
- 实际截图只能来自安装后真实 Chrome，模拟 HTML 或 DevTools viewport 不等于 Native PASS。

## 四、严格遵守原有唯一执行链路

复用已验证 Task Package、本地 Installer、Task Resolver、安装授权代际、Chrome Site Permissions、Cloud permit、Controller Authority、RunHost、Worker、原 Run/Result/retirement、Provider receipt、Cloud History Index。禁止第二 Provider、第二 Controller Worker、第二任务调度器、第二权限数据库、第二 Side Panel 云控产品；无真实阻断缺陷时不编辑共享 `controller-methods.js`、`broker.js`、`schedule-repository.js`。**R5.2 不新增 Side Panel 关闭后的长期 Runner**。

## 五、安全与可靠性 P0

Provider 重启、WebSocket 断线恢复、Service Worker/Chrome 重启、Task 禁用卸载升级、安装 generation 变化、Chrome 站点权限撤销、Stop/解除配对、requestKey 同内容重复/异内容冲突、admission 响应丢失、receipt 响应丢失、已产生网页副作用但 Result 未知、多 Executor 错领、未允许结果内容传输必须负面验证。不能因为结果缺失而重新执行旧副作用；保留 `OUTCOME_UNKNOWN` 与历史原始数据。原始 Host/Authority 的 revoke/fence 必须实际生效。

## 六、实施 Gate 与质量

Gate 1：目标 Executor 绑定、双 Executor 拒绝、状态与正文分离、安全负测；
Gate 2：两个真正已安装 Task，在真实 Chrome Worker 的独立源码/网页效果/原 Result/receipt；
Gate 3：Side Panel 用户体验、响应式/可访问性/真实截图；
Gate 4：可信 HTTPS/WSS Provider + Scoped Client + 已安装 Task 的链路，跨公网权限不足标 PENDING；
Gate 5：撤权、重启、断线、未知副作用和回执故障矩阵。

组件最小定向命令：`npm run test:cloud`、`node --test tests/framework/k3-controller-authority.test.mjs`、`node --test tests/environment/cloud-hosting-r3.test.mjs`、受影响 Side Panel 测试、双 Executor/隐私/TLS 专项。最终独立安全构建资源执行 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`。不能抬高固定包尺寸预算代替修复；必须记录精确 PASS/FAIL/SHA/PackageHash/Actions URL。

质量 15 维度各**独立 ≥95/100**：产品价值、用户流程、功能、远端能力、Executor 隔离、权限、结果隐私、视觉、文案、操作效率、响应式/可访问性、可靠性、架构复用、测试完整度、真实 Chrome 证据。必须分别标识 `DESIGN_SCORE` / `IMPLEMENTATION_SCORE` / `VERIFICATION_SCORE`，未验证绝不能伪填 95。任何 P0 未修不能 95。未达标则明确缺陷→文件→修复→重新验证→独立重新评分，不以平均分掩盖。

## 七、真实协作、工作流与交付

仅写 `main`；不建新分支/Worktree/PR、不强推/破坏性 reset/clean、不覆盖并行未提交内容、不抢共享 Mac Chrome/Profile/Provider 43111/43112/IndexedDB/dist/ZIP。提交前重新核对 latest HEAD、目标文件 SHA、工作区与 CI，检测真实冲突则安全停止有风险写入。没有 Mac 时明确本机工作树/Chrome `NATIVE_PENDING`，不要伪造输出。

保存进度和权限/身份/请求合同：`docs/framework/workstreams/cloud-control-r5-02-product-closure.{md,json}`。状态仅使用 `NOT_IMPLEMENTED` / `SOURCE_IMPLEMENTED` / `COMPONENT_TESTED` / `BUILD_VERIFIED` / `NATIVE_PENDING` / `NATIVE_VERIFIED` / `REMOTE_NATIVE_PENDING` / `REMOTE_NATIVE_VERIFIED` / `BLOCKED`，独立评分证据不足用 `NOT_VERIFIED`。

最终用户语言首先说明：云控现在能做什么、如何安装/授权/远端投递/Stop/Unpair、是真正跨网还是仅本机服务。随后逐项列出已实施与未实现功能、两份不同 Task 的原生证据、双 Executor 隔离、隐私、真实 UI、15 维独立评分、CI/构建/PackageHash/提交 SHA、资源阻断与最终 R5.2 是否关闭；任何空白不能宣称“全项目 95+”。 

**执行优先于再写 GOAL；本文件供其他会话续接，不能取代实际代码/构建/Chrome 验收。**
