# GOAL：OpenDesk Cloud Control R1.4 Final
## 多端统一架构梳理、Browser 独立 Executor 收敛、安全协议补齐、数据一致性、真实 Chrome 验收与正式交付

日期：2026-10-12

默认中文。

### 一、目标仓库

实际开发仓库：

https://github.com/shopable-ai/opendesk-browser

本地目录：

`/Users/shopme/Documents/workspace/opendesk-browser`

开发分支：`main`

多端架构仓库（只读）：

https://github.com/shopable-ai/opendesk

分支：`master`

### 二、任务定位

你作为 Chrome MV3、WXT/Vite、JavaScript、IndexedDB、WebSocket、HTTPS、分布式一致性、安全协议、RunHost、ChromePage、Side Panel、Node.js、Playwright、Mac Chrome、数据架构与 UI/UX 联合负责人，直接在真实本地仓库连续执行：

1. 重新梳理 Cloud Control 的总体架构、功能模型、数据模型、生命周期与任务计划。
2. 检查已有 R1.1/R1.3/R1.4 实现和真实验收证据。
3. 建立功能完成度、实际缺口、优先级、依赖和验收矩阵。
4. 优先修复已证明的安全、恢复和持久一致性问题。
5. 完成必要的真实 Chrome 原生测试。
6. 收敛托管 UI、开发调试、合同、文档及工作流。
7. 安全地只提交本轮已验证的 Cloud Control 相关修改。

**不是从零开发第二套云控系统，不是单纯输出架构建议，也不是只编写下一份 GOAL。**

95 分为各质量维度的交付目标，必须根据真实证据评定，不得预设达标。

### 三、首先核查真实 Git 与开发资源

执行：

- `pwd`
- `git status --short --branch`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git fetch origin main`
- `git rev-parse origin/main`

2026-10-12 远端曾核查到 HEAD：

`fb58c53241b246f85e58999d52ee6c4539b9346d`

该 SHA 只是历史比较基线，不能假定执行时仍是最新版本。

开始前阅读：

- `AGENTS.md`
- `docs/framework/testing-guide.md`
- `docs/framework/parallel-development.md`
- `docs/framework/workstreams/cloud-control-r1.md`
- `docs/framework/workstreams/cloud-control-r1.json`
- `docs/framework/workstreams/evidence/cloud-control-r1/handoff-20261011.json`
- `docs/framework/prompts/cloud-control-r1-continuation-20261011.md`
- `docs/architecture/browser-framework/cloud-control-r1.zh-CN.md`
- `docs/architecture/browser-framework/cloud-control-debug-r14.zh-CN.md`
- `docs/contracts/execution-control/v0.2/README.zh-CN.md`
- `examples/cloud-control/README.zh-CN.md`

只读参考 OpenDesk 上位架构：

`docs/architecture/execution-control-r02.zh-CN.md`

不得覆盖任何 Agent 的未提交文件，不得破坏现有测试环境、证据、数据或源码。

只在安全可用的本地 `main` 工作，不创建分支、Worktree 或 PR，不执行强制 reset/clean，不推送远端。

如果当前有其他 Agent 正在写入同一工作目录，先检查并行占用，只推进无冲突部分。

### 四、必须冻结的总体架构

Cloud Control 采用：

**Task Provider + 三类独立 Executor + 各端原生 Authority/Runtime。**

三端分别为：

**Browser Executor**

- 独立 Executor 身份。
- 独立 Provider 配对。
- Browser Task v1 安装与用户授权。
- Chrome MV3 Service Worker 云连接管理。
- 原 Authority、Controller、RunHost、Worker、ChromePage。
- 原 IndexedDB Run/Result/commandJournal。
- 原 `runs/@slot` 单执行槽。
- 原生取消、退休、结果、Receipt 和对账。
- Side Panel 托管与开发调试界面。

Browser 本地运行不依赖 Desktop App、Native Agent 或 Node Provider。

**Desktop Executor**

- 与 Browser 平级。
- 使用自己的 Recipe/Flow、Scheduler、Runtime 和数据事实。
- 本轮只整理边界和后续接入要求。
- 不实施第二套 Desktop 执行器。

**Mobile Executor**

- 与 Browser、Desktop 平级。
- 使用各移动平台许可的原生权限与运行能力。
- 本轮只保留总体架构和未来适配约束。
- 不实施移动端执行器。

统一的是外层的身份、领取、许可、取消、回执、对账语义，而不是三端共用 Browser Task v1、RunHost 或数据库。

已有 R0.2 总体架构作为正式上位基线，不建立竞争性的第二套协议规范源。

### 五、P0：重新整理框架功能树

先检查真实源码，再建立完整功能矩阵。

必须涵盖以下功能域：

**终端与身份**

- Executor 身份生成和持久化。
- Provider 配对、认证及解除配对。
- Pairing generation 与凭据撤销。
- 终端能力、连接代次和 Host 就绪。
- 生产 HTTPS/WSS 与固定开发回环例外。

**任务与授权**

- Job、Request、Claim、Assignment。
- 固定 Task v1 与任务安装身份。
- 用户授权、网站范围、输出授权。
- 参数规范化、请求摘要和幂等。
- Attempt epoch、租约及重复请求栅栏。

**原生执行**

- 原 IDB 事务准入。
- 原 Run、Revision pin、`runs/@slot`。
- Provider admission 和持久 StartPermit。
- Authority 再次核验。
- RunHost、Controller、Worker、ChromePage。
- 本地运行和云端运行共享原生资源。

**结果和生命周期**

- Result 持久化。
- Worker 与 Target 资源退休。
- 原槽释放。
- Result 输出许可复核。
- Provider Receipt。
- 断线补传、取消、过期和重启对账。
- OUTCOME_UNKNOWN 禁止非法重跑。

**产品界面**

- 「我的」中的任务安装与运行。
- Provider 配对与托管设置。
- 已批准任务和网站范围。
- 连接、Host、目标、槽及等待原因。
- 正在执行、停止中、结果保存、等待回执。
- 开发版本第六个「调试」Tab。
- 生产版本隐藏开发调试入口。

对每一项输出：

功能名称、负责模块、源码文件、数据来源、用户入口、已有测试、原生证据、真实状态、缺口、下一步和优先级。

不得仅以文件存在判断功能完成。

### 六、P0：重新整理数据模型和唯一事实来源

建立 Provider 与 Browser 的数据所有权矩阵。

至少涵盖：

- providerId、executorId、pairingId。
- jobId、requestId、claimId、assignmentId。
- attemptEpoch、requestDigest、lease。
- TaskRef、installationId、generation。
- manifestHash、sourceHash、builtin identity。
- Grant、Grant generation、output permission。
- runId、resultId、revision。
- 原 commandJournal、`runs/@slot`。
- StartPermit、retirement、Receipt。
- connectionGeneration 与 Host registration。

必须明确：

1. 每个字段由谁生成。
2. 在哪里持久保存。
3. 谁可以读取和修改。
4. 哪些字段是稳定身份，哪些是连接临时身份。
5. 哪些操作必须使用同一 IDB 事务。
6. 哪些操作必须使用 Provider 持久事务。
7. 哪些网络操作必须在数据库事务外执行。
8. 哪些状态允许重试，哪些只能查询原事实。
9. 如何避免 Provider 与 Browser 双方对同一请求产生冲突认知。
10. 数据迁移和向后兼容怎样保持已有安装与历史结果。

**不建立第二套 Run、Result 或 Scheduler。**

保持现有 `frameworkKV` 云关联与原 `runs`、`results`、`commandJournal` 的职责划分。

必须建立请求、许可、执行、结果、退休和 Receipt 的状态转换矩阵，列出非法转换与拒绝行为。

### 七、P0：优先完成现有未知副作用恢复现场

历史工作流记录了真实原生中断：

- Job：`584bcbd1-eefa-4f78-8c52-8761a004dd4e`
- Request：`cloud:ed794251-e8b3-4345-8dfc-6e98e15181ab`
- Run：`afd37543-f456-45f6-9e12-ea3548e65d4d`

原 Worker 已有真实网页副作用回执，此后扩展被停用。

必须：

1. 先核对原 Chrome Profile、Provider 进程和本地资源是否仍存在、归谁所有。
2. 读取旧工作流及原始证据。
3. 不删除 Chrome Profile、Provider state 或已有 IDB。
4. 不重新 seed 该 Job。
5. 不重发或伪造同一个 Run。
6. 在确认证据与权限后，通过合法原生 Chrome UI 恢复，观察原 Authority 和 Provider 对账。
7. 检查是否保持单个 Run、单个 Result、无非法二次网页动作。
8. 对未知副作用保留保守语义。
9. 如果现场不可恢复，记录实际阻塞原因，不伪造 PASS。

此项是当前最高优先级。

### 八、P0：安全协议和持久许可收敛

重点审计：

- `src/cloud-control/service.js`
- `src/cloud-control/connection.js`
- `scripts/cloud-control/provider.mjs`
- `src/platform/host/authority.js`
- `src/platform/host/controller-methods.js`
- `src/platform/host/broker.js`
- `src/platform/host/client.js`
- `src/run-host.js`
- `src/platform/tasks/service.js`
- `src/platform/tasks/contract.js`
- `src/platform/storage/`
- `src/sw.js`

执行规则：

**请求身份**

核对 Provider、Pairing、Executor、Request、Assignment、Attempt、Task 和授权代次的完整绑定。

优先复用既有字段、幂等机制和合同。

当前 `service.js` 已经使用 `validateTaskParams()` 规范化参数参与请求摘要，不要重复应用过期的参数规范化补丁。

补充完整的旧 epoch 栅栏、同键异内容冲突测试和跨配对重放拒绝。

**配对撤销**

重点核查当前 Browser 本地解除配对与 Provider 端凭据撤销是否一致。

未经服务端持久确认，不得声称旧凭据已在 Provider 失效。

离线撤销必须立即阻止本机新执行，服务端撤销状态应明确记录并在可连接时安全对账。

**持久 StartPermit**

必须证明：

- Provider 先登记原 runRef。
- Permit 身份完整且有效。
- Permit 先持久化，再产生执行副作用。
- Authority 在执行关键节点重新校验。
- 取消、安装代次变化、撤权、Host 变化、过期和旧 epoch 不能绕过许可。
- 没有许可时 `createOwned()`、`chrome.tabs.create()`、Worker 创建与派发调用次数全部为零。

**结果与回执**

确保：

- Result 不因为网络失败重新执行。
- 资源退休和回执是独立状态。
- 上传前、网络发送前及重连补传时复核当前输出授权。
- Receipt 丢失只能重发同一原始结果。
- 授权失效不能上传新的敏感结果。
- OUTCOME_UNKNOWN 禁止自动重跑。

所有修改必须补齐对应负向测试，保留历史数据兼容。

### 九、P0：补齐原生故障验收

优先补齐工作流尚未正式完成的四类真实 Chrome 测试：

1. 已产生网页副作用后的实际中断与恢复。
2. 用户在任务仍然运行时，通过 UI 停止托管及取消。
3. 原生 IDB 准入回滚或容量不足，不产生目标和 Worker 副作用。
4. 运行中网站授权、Task 安装授权或结果输出授权撤销。

同时复核：

- Provider 断线与恢复。
- SW 终止与恢复。
- Host 关闭与重建。
- 重复 Claim、重复 Request。
- 许可和 Receipt 响应丢失。
- 旧 WebSocket 回调。
- 许可过期和旧 Attempt。
- 手动运行与云任务共用原生槽。
- 用户停用托管后的原资源退休状态。

优先复用历史真实 PASS。新源码、包 Hash 或测试环境变化才补做相应范围的验收。

不要因换对话而重复运行已完成 Job。

### 十、P1：完善 Cloud Control UI 与调试入口

基于已有实现增量优化：

- `src/ui/cloud-hosting.js`
- `src/ui/cloud-status-presentation.js`
- `src/ui/task-workbench.js`
- `src/ui/tool-shell.js`
- `src/ui/tool.html`
- `src/ui/debug-workbench.js`

普通用户页面继续使用「我的」中的云端托管区域。

不新增独立云控工作台，不要求安装所谓云控工具。

普通页面必须清楚显示：

- 是否已配对。
- 当前是否启用托管。
- Provider 是否在线。
- Host 是否合法可用。
- 目标网站是否已授权。
- 原执行槽是否被占用。
- 等待、运行、停止和未知结果原因。
- Result 是否保存。
- 资源是否释放。
- Receipt 是否确认。
- 停止后是否仍有待处理的资源。

历史已确认一个显示缺口：完成且已经退休、Receipt 已确认的请求，在租约随后过期时可能出现 `E_CLOUD_CANCELLED`。

修复时保护原生事实，不把已经完成的 Run 伪装成失败，也不覆盖真实取消历史。

开发调试页面：

- Development 第六个 Tab。
- Production 默认不显示且无法进入。
- 只读、脱敏。
- 不触发领取、许可或执行。
- 不展示 credential、pairingCode 或敏感结果。
- 完成窄宽度、键盘、焦点和无障碍验收。

### 十一、P1：构建和模块边界

当前构建预算已调整为：

- 生产 SW 1 MiB。
- 生产 SW 提醒线 512 KiB。
- 开发 SW 1.5 MiB。
- 普通固定入口 512 KiB。

本轮不要为了云控而继续增大预算。

检查真实构建后再决定是否需要减小 UI 入口体积。

重点观察 `ui/tool-shell.js`，历史构建约 403 kB，已经触发软体积提醒，但低于硬上限。

保持：

- 云控代码的固定 classic 入口。
- WXT/Vite 构建合同。
- 现有 CSP 与 Chrome permissions。
- React/Vue 独立运行时资源。
- 第三方依赖按需提供。
- Node `ws` 只用于开发 Provider。

不能为了减小文件体积引入不受控远程可执行代码，也不得无证据扩大权限。

### 十二、P1：正式测试命令

先检查已有证据和资源所有权。

必要时执行：

`node --test tests/framework/k3-controller-authority.test.mjs tests/framework/run-host-recovery.test.mjs tests/environment/task-package-flow.test.mjs`

`npm run test:cloud`

`npm run check`

`npm run build`

`npm run build:dev`

`npm run verify`

实际 Provider 示例命令：

- `npm run cloud:provider`
- `npm run cloud:pairing`
- `npm run cloud:seed:form -- --name Alice --key <唯一新请求键>`
- `npm run cloud:inspect`
- `npm run cloud:cancel -- --job <jobId>`
- `npm run cloud:fault -- --path /v1/admission --count 1`

启动任何服务前必须检查端口、进程与持久状态目录的实际归属。

原 43111、43112、root dist 和 Chrome Profile 可能被其他工作流占用；不得直接抢占或清理。

使用现有仓库认可的隔离候选构建方法，不能覆盖其他 Agent 的测试产物。

### 十三、五大正式 Gate

**Gate 1 — CONNECTION_VERIFIED**

Provider 配对、认证、WS 连接、领取、重连与 Browser Executor 身份一致。

**Gate 2 — ADMISSION_VERIFIED**

原 IDB 准入、单槽、持久 Permit、安装/授权身份和零副作用通过。

**Gate 3 — EXECUTION_VERIFIED**

真实 Chrome 固定 Task → 原 Worker → Result → Retirement → Receipt 闭环通过。

**Gate 4 — RECOVERY_VERIFIED**

断线、重启、撤权、取消、租约过期、旧 epoch、IDB 回滚、未知副作用均不产生非法二次执行。

**Gate 5 — PRODUCT_VERIFIED**

Browser 不依赖 Desktop、本地模式正常、云托管 UI 可用、开发诊断隔离、最新构建安全、文档合同和原生证据均通过。

对每个 Gate 独立记录：

- 历史可复用证据。
- 当前候选身份。
- 已验证子场景。
- 未验证子场景。
- 真实阻塞项。
- 最终状态。

状态限定为：

`SOURCE_CONFIRMED`、`COMPONENT_TESTED`、`BUILD_VERIFIED`、`NATIVE_VERIFIED`、`BLOCKED`、`NOT_TESTED`。

不得把历史候选 PASS 自动升级成当前候选 NATIVE_VERIFIED。

### 十四、P2：整理多端后续建设计划

这一阶段只做架构整理，不实施 Desktop、Mobile 或正式 Cool 后端。

形成清楚的后续工作计划：

**Browser**

当前 R1.4 安全收敛与正式验收完成后，成为第一个可复用的独立 Executor 参考实现。

**Provider**

未来正式服务器需要认证、持久队列、事务唯一约束、outbox/inbox、租约、撤销、审计和结果对账。

开发 Node Provider 不能直接被宣称为正式生产服务。

**Desktop**

通过独立 Adapter 接入同一外层合同，复用原 Runtime、Scheduler、Flow 和本机结果。

**Mobile**

针对 Android/iOS 的运行权限和生命周期单独设计、单独验收。

不强制三端采用 Browser Task v1。

### 十五、文档和任务计划交付

更新现有正式文档：

- `docs/architecture/browser-framework/cloud-control-r1.zh-CN.md`
- `docs/contracts/execution-control/v0.2/`
- `docs/framework/workstreams/cloud-control-r1.md`
- `docs/framework/workstreams/cloud-control-r1.json`
- `examples/cloud-control/README.zh-CN.md`
- 必要的测试指南和导航文件

在已有架构文档中增加：

1. 功能树和完成度矩阵。
2. Provider/Browser 数据字典与唯一事实来源。
3. Request、Permit、Run、Result、Retirement、Receipt 状态机。
4. 授权与可信边界。
5. 故障恢复矩阵。
6. Browser、Desktop、Mobile 的职责分工。
7. 按 P0/P1/P2 组织的剩余任务。
8. 每项任务的源码、测试、证据和关闭标准。
9. 未来正式 Provider 的实施边界。

将本 GOAL 保存到：

`docs/framework/prompts/goal-cloud-control-r14-final.zh-CN.md`

如果该文件已存在，先比较内容，不覆盖更近版本。

不要创建第二套公共协议或重复的数据规范。

### 十六、Git 安全和最终交付

仅提交确认属于本任务且已经验证的修改。

保留其他 Agent 的未提交变更及暂存区。

禁止：

- 强制 reset/clean。
- 覆盖其他 Agent 文件。
- 清理未知 Chrome Profile。
- 删除 Provider state。
- 伪造 IDB 或原生结果。
- 为得到 PASS 而重跑可能已有副作用的 Request。
- 未经授权推送远端 main。
- 创建不需要的分支、Worktree 或 PR。

最终报告必须提供：

1. 当前本地 HEAD、origin/main 与差异。
2. 最新整体架构功能树。
3. 已实现、部分实现、未实施和未来规划的模块。
4. 数据模型与唯一事实来源。
5. 本轮实际修改文件。
6. 修复的安全和持久一致性缺口。
7. 原生运行与恢复的 Job/Request/Run/Result/Receipt 身份。
8. 原始测试结果及包 SHA-256。
9. 五大 Gate 各自状态。
10. 真实 BLOCKED/NOT_TESTED 和下一步。
11. 本地 Git 提交 SHA，确认未推送。
12. 架构、安全、持久可靠性、UI/UX、可维护性、测试证据六项独立专家评分。
13. 未达到 95 分的具体原因、相关文件和修复任务。

**执行顺序：先保护并恢复历史未知副作用现场，再修复安全协议和原生缺口，然后完善数据与产品界面，最后完成当前候选五大 Gate 和文档交付。**

已有正确实现必须保留。

遇到实际环境阻塞时，安全完成其余不冲突工作并保留明确证据，不假报成功。

最终目标：让 OpenDesk Browser 成为真正独立、可授权、可恢复、可信赖的云端任务 Executor，同时为未来 Desktop、Mobile 和正式 Provider 提供清晰且可复用的跨端合同边界。

