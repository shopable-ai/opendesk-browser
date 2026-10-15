# 对话式浏览器任务直接执行 R1

日期：2026-10-13。写入范围为 `shopable-ai/opendesk-browser` 的 `main`。

## 当前提交工作范围
- `src/ui/workflow/workflow-view.js`：发送 → 受控 AI 提议 → 现有 Compiler/RunHost → 持久回执 → 可选保存；不再需要二次点击“采用建议/运行”。
- `src/ui/workflow/direct-execution.js`：精确目标/用户字面量/副作用/回执的安全门禁。
- `src/framework/workflow/compiler.js`：仅直接执行使用的填写后 `inputValue()` 读回；旧工作流默认生成代码与 hash 不变。
- `src/ui/workflow/local-codex.js`、`src/ui/workflow/ai-plan.js`：限制 AI 提议动作在本次用户明确请求内。
- `tests/environment/workflow-direct-execution.test.mjs`：边界用例。

## 安全与后续验收
- Chrome 网站权限从真实 Send 手势申请；网页文字发往模型仍采用既有独立 `browser.observe` 审批，不绕过用户披露确认。
- 只通过原 RunHost 执行，不创建新的执行器、权限系统或代码生成执行世界。
- 高风险、副作用不明、填写值未明确给出及跨文档跳转不自动执行；终态未知不重试。
- 直接执行仅在 runId/resultId/sourceHash/精确文档/retirement 同时成立后报告成功。
- 未读取用户 Mac 本地 Chrome 或工作区：NATIVE_MAC_CHROME=NOT_TESTED；BUILD=NOT_TESTED；F3/ZIP=NOT_TESTED。
- 下一步验证：`node --test tests/environment/workflow-direct-execution.test.mjs tests/environment/workflow-local-codex.test.mjs tests/environment/workflow-r15.test.mjs`；`npm run check`；`npm run build:dev`。
- 在 `examples/tasks/demo-form.html` 真实 Side Panel 用一条「在输入框里填入 ai自动化第一选择」测试 Send→读回与持久回执，测试撤权、换文档、停止及保存 SHA；遵循 `docs/framework/testing-guide.md` 复用和资源独占约束。

## R1.1 GitHub `main` 定向修复与真实证据（2026-10-13）

**执行范围／资源：** 本轮通过授权的 GitHub 连接直接改写 `shopable-ai/opendesk-browser/main`，采用读取最新 main、核对目标文件 blob SHA、创建独立 Git 对象、非强制且带预期 HEAD 的原子推进；没有创建 branch、PR、worktree。访问不到用户 Mac 工作目录，未占用 Mac Chrome、测试端口、既有 `dist/development`、本地 profile 或 Native Host。GitHub Actions 是其自有 runner，不是用户日常 Chrome。源码／测试／workflow 文件已提交，远端 Git 写入事务完成并释放。

### 已提交源码及真实修复

- [`8875e748896c575910ed7c0f28bb6924d51ad960`](https://github.com/shopable-ai/opendesk-browser/commit/8875e748896c575910ed7c0f28bb6924d51ad960)：一次 Send 后沿既有 Workflow Compiler → RunHost，不新增执行环境；修复 `workflow-view.js` 运行回执引用未定义 `result`；直接执行校验 Run ID／Result ID／Controller 结果状态／源码 SHA／CurrentPageTarget（URL、window/tab/frame/document/origin）／Worker released；编译 `verifyFill` 模式返回实际 Locator `inputValue()` 的读回值；UI 发送文案与失败反馈；修复 CI 陈旧权限调用和 44px 设计断言，并在工作流 CI 加入 7 类定向测试、`npm ci`、`npm run check`、`npm run build:dev`。
- [`3fb26006fa0bd5a3954a870c4ac0b1975cef2a36`](https://github.com/shopable-ai/opendesk-browser/commit/3fb26006fa0bd5a3954a870c4ac0b1975cef2a36)：额外点击必须首先满足用户明确意图，再做敏感目标拦截；剔除填写数据中的“选择”“删除”等词汇造成的虚假执行授权／误阻断；“搜索框”不等于点击搜索；扩大覆盖。
- 本轮实际改动文件：`src/ui/workflow/direct-execution.js`、`src/framework/workflow/compiler.js`、`src/ui/workflow/workflow-view.js`、`src/ui/tool.html`、`tests/environment/workflow-direct-execution.test.mjs`、`tests/environment/workflow-ai-data-sharing.test.mjs`、`tests/environment/workflow-ui-states.test.mjs`、`.github/workflows/workflow-ai-data-r16.yml`、本工作流记录。

### 真实 CI，严格绑定提交

- 历史 R1 CI [`38415718234`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38415718234)：原 57 项 54 PASS／3 FAIL（填写值词汇被误判为点击授权、网站／Provider 同一 Send 权限请求与旧断言不符、36px 测试与现行 44px 样式不符），保留历史失败，不覆盖。
- R1.1 第一源码候选 `8875e748...`：GitHub Actions [`38428906036`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38428906036) 的真实 7 文件 Node 测试 **97 total、96 PASS、1 FAIL**。唯一失败是返回 `E_AI_REVIEW_REQUIRED` 与要求先报告 `E_AI_UNREQUESTED_ACTION` 的断言不符（`#submit` 的敏感目标检查早于用户意图检查）；对应源与测试在第二提交已修复。本次失败使首轮 `npm run check`／`build:dev` 被 CI 跳过，**不得称它们 PASS**。
- 最终源码候选 `3fb26006...`：GitHub Actions [`38429394001`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38429394001) / job `115407270333` **completed/success**。原始日志：定向 Node 测试 **98/98 PASS、0 FAIL**；`npm run check` **PASS**（实际检查 658 个源／测试／构建文件、CSP 和固定运行入口）；`npm run build:dev` **PASS**（真实 WXT/Vite development 构建，133 assets，`packageHash=f6d29d187338dd83c27759e1385afda2d729e2312bdfaa08bfee81ba2e0e1c72`）。该 runner 为 Ubuntu / Node 22，不是用户 Mac Chrome。构建同时报告 `ui/tool-shell.js` 大小 521455/524288，距预算仅余 2833 bytes，属后续构建预算风险而非此次失败。
- 目标命令：`node --test tests/environment/workflow-direct-execution.test.mjs tests/environment/workflow-local-codex.test.mjs tests/environment/workflow-r15.test.mjs tests/environment/workflow-ai-observation.test.mjs tests/environment/workflow-ai-data-sharing.test.mjs tests/environment/workflow-ai-transport.test.mjs tests/environment/workflow-ui-states.test.mjs`；`npm run check`；`npm run build:dev`。CI 日志和源码身份必须对应同一 `head_sha`。
- Mac 本地 `dist/development` 真正安装版本和页面状态不可从 GitHub HEAD 推定；其产品验收 **NOT_TESTED**。历史 R13.1 Chrome／Locator 验收可作架构参考，但 R1.1 changed compiler／direct-execution／UI 新候选不可继承历史 NATIVE_PASS。

### R1.1 六 Gate 当前含义

| Gate | 当前级别 | 证据与仍需验证 |
| --- | --- | --- |
| G0 最新主干与现有执行契约 | PASS（远端源码核查） | GitHub main、AGENTS、RunHost／Controller 状态投影及两项历史提交已核对；Mac 本地工作树不可见 |
| G1 用户 Send → 实际 RunHost | NOT_TESTED（原生链路） | 代码已接线，Node 源码测试不是实际 Send／RunHost |
| G2 Chrome 填写／点击／读回 | NOT_TESTED | 需同一构建真实 Side Panel、用户可信 Send、真实页面 `inputValue`／持久 Result |
| G3 授权／文档／Stop／未知结果 | NOT_TESTED（原生） | 现有 RunHost 安全栅栏复用，负路径已有组件覆盖；真实撤权／刷新／Stop／Native 中断仍待测 |
| G4 Side Panel 和可选保存 | NOT_TESTED（原生） | 代码已改，缺真实窄视口／焦点／保存后无模型重复 Run 的证据 |
| G5 Node／Build／CI／集成 | PASS | `3fb26006...` GitHub workflow `38429394001`：98/98 Node、npm check、build:dev 均 PASS；工作流记录及两个源码提交均已写入 `main` |

**R1.2 尚不能宣布可进入产品验收：** 至少先补齐 R1.1 十场景同一候选真实 Chrome 正例、权限和 Stop／unknown、持久身份与独立保存后重复执行证据。后续多轮观察／跨文档只扩展既有 Controller／RunHost，不另造 Agent Runtime。没有完成的 Gate、原始日志或独立评审，均不得自评专家 95+。

### 本地 Chrome 的剩余验收操作（没有声称执行）

保留用户既有 `dist/development` 与扩展 ID；复用 `http://127.0.0.1:43111/demo-form.html`，在真实 Chrome Side Panel 仅发送一次「在输入框里填入 ai自动化第一选择」，记录真实 tab/document、页面读回字符串、RunHost `runId/resultId/sourceHash` 与 `workerRetired/retirementState`；扩展为安全按钮点击、填写→搜索、无定位、刷新、Stop、撤权、未知结果、可选 Save 与不调用模型的独立复跑。失败不得重放有副作用的动作；所有原生缺口维持 NOT_TESTED。

## R1.1-P0：真实观察范围与 Codex 目标绑定（2026-10-14）

**工作所有者：** 本轮 GitHub 连接会话；仅操作远端 `shopable-ai/opendesk-browser/main`，通过带预期 HEAD 的非强制原子 ref 更新；不占用用户 Mac 工作目录、Chrome Profile、43111 端口、`dist/development` 或 Native Agent。起始远端 HEAD：`89c3b298dc3cf8927b227b041b101770780ce58a`；执行前仍须重新取最新主干。

**最小写入范围：** `src/ui/workflow/observation.js`、`src/ui/workflow/workflow-view.js`、`src/ui/workflow/local-codex.js`、`tests/environment/workflow-ai-observation.test.mjs`、`tests/environment/workflow-local-codex.test.mjs`、本记录。保持原 RunHost / Workflow Compiler / Native Agent RPC / Chrome 权限路径。

**P0 修改意图：**
- 同一固定、不可由模型提供代码的 Controller 观察源码首先采样有限 body 节点，然后仅按当前用户请求在最多 12 个有 ID 的通用 `section/form` 范围检查语义目标；允许加入至多 24 个可见、有唯一 Locator 的节点；不硬编码 `#lab-search`。不能通过无限增大预算绕过上限。
- 单次原 RunHost 观察的参数仅来自用户当前请求；成功回执增加原始 DocumentId，保留 Run ID、Result ID、Source Hash 和 Origin；Site Permission、Document 重验及单独网页数据发送审批仍有效。
- Codex 若未发起真实获批 `browser.observe`，或填写／点击的 Locator 不存在于该次观察摘要，不允许返回可直接执行的方案；不执行模型 JS，不增加第二次任务运行确认。
- 定向 Node 测试覆盖限额局部观察、回执绑定、模型跳过观察、凭空猜测 Locator、错误 DocumentId、拒绝审批等情况。

**验证等级（本记录随本次远端源码提交，最终以同一候选 CI 实际日志为准）：**
- G0 GitHub `main` 源码与原 RunHost 使用路径：PASS（远端只读与差异核对）。
- G1 真实 Codex Session/Turn 和实际页面内容被模型接收：NOT_TESTED（无用户 Mac Native 会话）。
- G2/G3 三个真实 Chrome 场景与网页副作用读回：NOT_TESTED（无 Mac Chrome）；Node 行为覆盖不能提升状态。
- G4 原生权限撤销、Document/Stop、Native 断连：NOT_TESTED（原生）。
- G5 定向 Node、`npm run check`、`npm run build:dev`、同候选 CI：待新提交 GitHub Actions 执行后逐项更新，禁止预写 PASS。
- 日常 Chrome 扩展路径／ID、真实观察和执行的 Run ID／Result ID／Source Hash、实际页面值、Worker 退出、保存后独立复跑：均为 NOT_TESTED；无伪造日志。

## 2026-10-15：Responses 官方协议适配源码候选写入 main；后续功能优先

- **阶段：SOURCE_CANDIDATE_COMMITTED / UI_NOT_WIRED / LOCAL_HTTP_NOT_IMPLEMENTED / OVERALL_NOT_ACCEPTED。** 本段只记录候选及下一步，不覆盖之前任何失败、未测、原生回执或历史候选。
- 本次通过 GitHub main 原子增量操作写入；提交前远端 main 为 `5214280476538d66eaac4635d62e08456afb1fa3`，原 `ai-plan.js` blob 为 `755775ebc16ae364bd1ac09c699cf5bcbaccd174`；原工作流文档 blob 为 `5a706ea6486ce3b0060f0b0f63746c5246ff072c`。未访问或修改用户 Mac、本机 Chrome、Native、Go、watcher、dist 或端口；未创建新 branch/PR/worktree。
- 源码仅涉及 `src/ui/workflow/ai-plan.js`、新增 `src/ui/workflow/responses.js`、新增 `tests/environment/workflow-responses.test.mjs` 与本账本。**没有修改当前并行工作中的 `workflow-view.js`、`direct-execution.js`、观察授权、Compiler、RunHost 或 OpenDesk Go**。
- `responses.js` 是可选择的非流式 HTTPS /v1/responses HTTP 适配器候选，解析官方类型化 output、拒绝 failed/incomplete/refusal/未知内容、限额/中止并返回真实响应元数据；不实现 SSE、tool calling、远端 cancel、同会话续接或网关。未实现能力明确不支持；不能称为官方完整 Responses 兼容。
- `ai-plan.js` 仅在显式 Responses 端点调用候选；要求可信当前观察回执和精确 target，沿用既有 `normalizeAiProposal`、数据脱敏恢复与可见 Locator 校验。由于当前 UI 仍需接线，现有 Chat Completions 消费者保留，**不能宣称当前 UI 的云端 Responses 可正常执行**。
- 上一轮在独立容器 Linux/Node v22.16.0 对候选的模拟 HTTP/观察单元测试记录为 **84/84**；那不是本仓库当前 CI、真实模型、Mac Chrome 或生产包测试。**本次 GitHub 写入未额外运行完整仓库测试或构建**。以前 98/98、102/102 等只对应历史候选，不累加。
- 当前 `workflow-view.js` 已由并行工作增加观察授权与 `planningObservation` 传递；当前 `direct-execution.js` 已有受观察约束的安全搜索例外。后续必须增量复用这两者，不用早期 UI 补丁覆盖，更不能删除敏感点击边界。
- **下一步按功能先行：** F0 当前真实 UI 与 Provider 配置打通云端 Responses 的受控观察及受限工作流生成，复用原 RunHost；F1 统一云端与本地 Codex 的最小业务规划合同；F2 核对 OpenDesk Go 实际服务和安装版 Codex App Server schema，再在同一 Go 本机服务按需实现 loopback、配对鉴权、能力声明的最小 HTTP /v1/responses 兼容子集（先 stream:false）。此阶段先针对新增单元运行最短 smoke，不开启大规模 CI/全套原生验收。
- 完成功能后另起阶段：仓库定向回归→单条真实 Chrome A→A2/B/C→保存后无 AI Run×2→负路径→production 同候选正式验收。未取得上述证据之前，原生各 Gate、体积预算、Go 网关及总评分均保持 **NOT_TESTED / NOT_ACCEPTED**。


## R2.1：当前源码/正式架构合同同步（2026-10-15）

**工作所有者/修改范围：**本次普通 ChatGPT GitHub 连接会话；仅在 Browser `main` 增量写入 `docs/architecture/browser-framework/workflow-ai-provider-routing-r2.zh-CN.md`、`docs/architecture/browser-framework/README.md`、历史 R16 的单行版本入口及本既有工作流账本；核心代码独立文件见后续记录。未触及用户 Mac、`dist/development`、Chrome profile、Native 端口与其他 Agent 的工作区。**Go 网关源码是并行 Go 开发提交，本轮只读核验，不宣称由本记录作者实现。**

**重要版本纠偏（不改历史段）：**上文记录的 `UI_NOT_WIRED / LOCAL_HTTP_NOT_IMPLEMENTED` 是先前候选的真实状态，已经不适用于本次源代码快照。核对 Browser `main@a7246887f5d09015b6244a1b2c5da5e232a2d015`、Go `master@310a24a726a6d218ae585df2dbe449b86f13ea62`，Browser `src/ui/workflow/provider.js` + `workflow-view.js` 现为 `SOURCE_WIRED` 的统一 Facade；Cloud Responses 已从 UI Send 通过批准的网页观察接入实际 `responses.js`、`ai-plan.js`、原 Compiler/RunHost；原生外部模型及 Chrome `NOT_VERIFIED`。Go 新 `internal/browserai/http_gateway.go` 在同一 Native Host 的 `host_ai_unix.go/host_unix.go` 中复用 `h.ai` Manager，需显式 `OPENDESK_CODEX_HTTP_ADDR/TOKEN`，默认禁 listener，已有 `POST /v1/responses` + `GET /opendesk/v1/capabilities` 严格子集源码；**仅 SOURCE_WIRED，未运行验证，Browser HTTP Provider 未接线**。

**架构决策：**在 [唯一 R2 正式设计合同](../../architecture/browser-framework/workflow-ai-provider-routing-r2.zh-CN.md) 固化单一 Facade、原 RunHost/Authority/Task/Revision、Native 优先+HTTP 可选、同一个 Go Codex Manager、云端直接 HTTPS、HTTP unsupported fail closed、三类不同任务成功级别；新增文档不替代代码。本轮未新建第二 Codex 进程管理器或 Browser Executor。

**核心阶段：**F0 `SOURCE_RECONCILED`；F1 `SOURCE_WIRED/NATIVE_NOT_VERIFIED`；F2 `SOURCE_WIRED/PARTIAL`；F3 Go HTTP `SOURCE_WIRED/NOT_VERIFIED`；F4 Native/Cloud 已接线，但 Browser HTTP `NOT_IMPLEMENTED`；F5 `IN_PROGRESS`。下一最小动作是由 Go 网关/Browser Provider 两个 owner 约定安全 pairing、token 获取与撤权、`Origin` 禁止策略和只接收 `input:string` + strict schema 的协议映射，随后把 Browser HTTP adapter 接入统一 Facade；不得绕过当前拒绝条件开启宽松 CORS。

**验证状态/资源：**本轮不运行 full Node、build、Mac Chrome、Go 原生或生产验收；此前 CI 98/98 和历史 Linux Codex 验证不转换为 R2 新候选 PASS；真实 HTTP Gateway/Extension Origin/真实网页登录和业务读回、Save 关闭模型后的 Run×2 均 `NOT_TESTED`。本次文档提交和随后源码提交使用 GitHub Blob SHA 乐观写入，未占用本地 git index 或开发 watcher；每次写入前重新获取目标文件 SHA，并保留无关新增提交。

## R2.2：CORE_IMPLEMENTED_CANDIDATE，GitHub 直接写入及定向 CI（2026-10-15）

**定位：** 本节记录远端源码候选，不改变前述历史候选/成功或失败。执行于普通 ChatGPT 网页会话，通过授权 GitHub API 使用现有 Browser `main`、Go `master`；没有 Mac 终端、Profile、真实 Native 进程或端口控制。并行 Agent 的 AdBlock、SDK、其他 UI/文档工作保持原样，本工作流不领取其源码。其他 Agent 新增的 R2.1 架构合同保留。

**本次核心源码提交：**

- Browser `e4691420`（`src/ui/tool.html`）：正式模型下拉框暴露 `cloud_responses`，保持 Native 与旧版 HTTPS。
- Browser `c6ce54d2`（新增 `src/ui/workflow/provider.js`）：统一模型规划入口；业务 Workflow schema/Compiler/RunHost 仅保留原实现；能力声明明确 cloud stateless 与 Native continuation，不导出外部登录凭据。
- Browser `d2b86294`（`ai-plan.js`）：本轮明确批准的观察与 `store:false` Responses 适配器；只带最多 4 个已执行且可信的业务回合概要，绝不假定 `previous_response_id`。
- Browser `b2c052d5`、`35bd0643`（`workflow-view.js`）：复用原有 Chrome 网站权限、单次网页数据批准、RunHost observer 与精确 document；正式 Cloud / Native 均经 Facade→原直接执行安全门禁→Compiler→RunHost→持久 Result。新会话/Provider/历史版本切换清理 Cloud 有界上下文；未被实际确认的点击不标为已验证历史。
- Browser `a7246887`、`5f6948c2`、`4080a343`（定向测试）：新增 Facade 能力/拒绝绕过观察测试，并随新模块更新已有组件桩和权限断言；不更改生产工作流引擎。
- Go `4d3a48c3`、`db2387fe`（`internal/browserai/http_gateway.go`）：默认关闭、两路径的受限 Responses HTTP 兼容，支持 `store:false`、`stream:false`、非流式 `json_object` 或已审查的严格 JSON schema，允许单条 string 或官方 typed user/input_text 消息；不支持工具调用往返、背景任务、跨请求会话、伪造 usage、remote cancel；非法字段 fail closed。
- Go `686ae0f6`、`310a24a7`（`browserbridge/host_unix.go`、`host_ai_unix.go`）：只在已配置 `OPENDESK_CODEX_HTTP_ADDR`（回环 IP:port）及 `OPENDESK_CODEX_HTTP_TOKEN` 的 **同一 Native Host 进程** 内启动 HTTP；共享已有 `h.ai` Manager，Host 生命周期关闭端口；Chrome welcome 后才放行；绝不在普通 `-http` / App Mode 默认开放。
- Go `b478c81d`、`2c003149`：gateway 认证、Origin/Host/loopback、安全拒绝、typed text、unsupported 输入的定向测试。HTTP bearer 单独配置，无法获取/复用 ChatGPT/Codex auth.json；没有第二个网页执行器或 Codex 管理器。

**兼容声明：** Cloud Responses 是正式 HTTPS `/v1/responses`；Go 本地 `POST /v1/responses` 仅兼容上述受限输入及输出字段，`GET /opendesk/v1/capabilities` 为 OpenDesk 专用，不能称为官方 API 全量实现。Browser 仍以 Native 为本地默认可信传输，**Browser 使用 HTTP Token 直接调用环回网关的第三 Provider 选项未实现**（HTTP 拒绝页面 Origin/CORS，不能借放开 CORS 绕过）；HTTP 仅供显式配对的可信本机调用方，需真实安装验证。业务会话与 Provider 原生 ID 不互换，存档工作流可脱离 AI 执行。

**源码/定向 CI 证据及阻塞：**

- Browser `a7246887` CI [38712911385](https://github.com/shopable-ai/opendesk-browser/actions/runs/38712911385) 初次失败因测试组件未登记新增 Facade + 旧断言只识别 custom HTTPS；后续 `4080a343` CI [38713533186](https://github.com/shopable-ai/opendesk-browser/actions/runs/38713533186) **109/109 既有 Workflow Node 定向测试 PASS，`npm run check` PASS（731 个源/测试/构建文件）**。同次 `build:dev` FAIL 是并行 AdBlock 源 `examples/sidebar-tools/adblock/trusted/host-controls.js` 改动与固定 bundle provenance 哈希不符；本任务不能擅自重固定别人的可信源，属于 **独立 build 阻塞，NOT_ACCEPTED**。新 Facade 独立测试文件的 CI 运行级别另查，不据此报 PASS。
- Go `b478c81d` CI [38712956259](https://github.com/shopable-ai/opendesk/actions/runs/38712956259) 的 Linux job：`internal/browserbridge` PASS、`internal/browserai` 新 HTTP gateway 的三个测试 PASS；整体失败为原 `internal/browsercli/admission_unix_test.go:32` 在 Linux 读取不存在的 `/private/tmp`；按 scope 记为 **非网关范围阻塞**，不将整体 Go CI 标为 PASS。后续 Go 候选 `2c003149` 的 CI 仍需以它自己的日志判断；真实 Codex CLI 推理未执行。
- Browser 新增对上下文与 UI 的变更后，必须在下一轮按最新候选确认构建预算；无当前有效 `packageHash` 可用于 Chrome 正式验收。

**后续分阶段独立验收入口：** T1：`node --test tests/environment/workflow-provider-facade.test.mjs tests/environment/workflow-responses.test.mjs`，`go test ./internal/browserai ./internal/browserbridge`（须以执行候选为准）和受影响的 build；T2：真实 Chrome A 填入与原生读回；T3：同对话 A2/B 安全点击/C 搜索；T4：保存后停止 AI 冻结工作流复跑两次；T5：Stop/撤权/Document 变更/断连/未知效果；T6：同一 production 候选及构建预算、F3/ZIP、95+ 独立评审。**T2–T6 全部 NOT_TESTED；本轮状态 CORE_IMPLEMENTED_CANDIDATE，绝非 PRODUCTION_ACCEPTED。**

**R2.2 同候选证据补记（2026-10-15）：** Browser `fa4c50d0` 已将 `provider.js` / `responses.js` 语法和新的 Facade 小测试纳入既有 Workflow CI；其 [38714217645](https://github.com/shopable-ai/opendesk-browser/actions/runs/38714217645) 原始日志明确 **112/112 Node PASS、`npm run check` PASS（732 files）**；`build:dev` 因并行 AdBlock Trusted source SHA pin 不一致而 FAIL，**不能称完整 CI PASS**。随后 Browser `72ccc959` / `5cc3d8af` 增加已完成 Native `turnId` 的元数据映射与对应测试；这两个较新 SHA 仍须各自 CI 独立核对，不借前述 112 PASS。
Go `master@2c003149` [38713903230](https://github.com/shopable-ai/opendesk/actions/runs/38713903230)：**macOS transport PASS、真实 Go 可执行文件配模拟 Chrome 的 build/smoke PASS**；Linux transport FAIL 是 `internal/browsercli/admission_unix_test.go` 对不存在的 `/private/tmp` 的依赖；`internal/browserai` 新 gateway 认证、typed user text、unsupported 字段与现有 Manager 定向测试均 PASS。macOS runner 不是用户真实 Mac，也没有用户登录态 Codex 推理。

## R2.3：核心源码缺口收敛及 HTTP 安全禁用（2026-10-15）

**本轮写入范围与 Owner**：普通 ChatGPT 网页、已连接 GitHub；Browser 仅 `main`；Go 按当前根 AGENTS 使用现有 `master`。只改本条所列文件；未触及 Mac、Chrome 进程、profile、dist、watcher、真实 HTTP 端口或生产凭据；没有创建 branch/PR/worktree、强推或新 Executor。其他 Agent 的 SDK、AdBlock、UI 预览工作保持独立。此前曾初步怀疑 Native `target` 缺失，逐行查证 **`provider.js` 已正确传 `target`**，该怀疑不成立、未修改原调用。

**Browser 本轮提交（已由 GitHub 接受）**：
- `0e9bb6c3`：`src/ui/workflow/provider.js` 要求 `custom_https` 发网络请求前拥有本轮观察回执和目标身份，保持 Native/Cloud 同 Facade。
- `eb4372d9`：`src/ui/workflow/ai-plan.js` 的 Chat Completions 生产适配使用有界 `authorizedObservation`，规范化模型提议后逐 Locator 验证；不影响独立不执行的旧调用者。
- `d43fb996`：`src/ui/workflow/workflow-view.js` 为两个 HTTPS 入口共享一次性可见授权和 RunHost 观察，保留上一次已提交的 Revision 作为同一工作流 Save 乐观锁基线；修改后的 Workflow 不冒称 saved。
- `9997dbb2`：`src/ui/workflow/direct-execution.js` 不再把 click 后的任意 assert 视为独立业务效果证明。
- `9c500003`、`f0f50e69`、`11ea3e70`：对应 Facade、版本 Save 源码合同与点击效果边界的最小定向测试源文件。

**Go 本轮提交（已由 GitHub 接受）**：`d892a5b6` 在 `internal/browserbridge/unsupported.go` 补全不支持平台的 `Host.Close()` 编译接口；`7225ac72` 在 `internal/browsercli/admission_unix_test.go` 修复 Linux 上不存在的 `/private/tmp` 测试根路径。Go `http_gateway.go` / `host_ai_unix.go` 没有被重新设计或重复实现。

**HTTP 安全边界**：Go HTTP 显式启用、loopback/Host/Origin 限制及共享 `h.ai` Manager 保持原样，`local-http.js` 保持 `pairingReady:false` 且未正式导入 UI；本轮没有实现 token 配对、撤权/轮换或 Browser CORS 白名单，也没有启用网页直接访问登录态 Codex。F4 仍 `SAFE_DISABLED / PAIRING_OPEN`。

**证据与诚实状态**：以上为 `SOURCE_IMPLEMENTED` / `SOURCE_WIRED` 和 `TEST_SOURCE_ADDED`，不是新的 `COMPONENT_VERIFIED`。本会话未在用户 Mac 跑 Node、Go、Chrome、Codex 或 production build；GitHub Actions 自动触发的 Browser/Go 新 SHA CI 在文档写入时尚未独立取得最终通过日志，标 `CI_PENDING`。T2–T6 和真实当前网页业务读回、Save 后关闭 AI Run×2 均 `NOT_TESTED`，无假造截图/日志。

**下一最小动作**：核对新 SHA 定向 CI；随后优先给 `direct-execution.js`/RunHost 的 click 添加可审计业务 Oracle，而不是把执行回执当网页效果；真实安装验收单独排期。HTTP 必须先完成可信 Native token 配对/撤权/Origin 合同，未完成前不准把 Adapter 强接入 Browser Facade。状态权威设计详见唯一正式 R2 文档第 12 节。

## R2.3-P0：可信观察回执与并行 Go Windows stub 增量（2026-10-15）

- **本会话本轮提交（Browser `main`）**：[`f3f776fbcb96f1d39149b84a5836b0d154322722`](https://github.com/shopable-ai/opendesk-browser/commit/f3f776fbcb96f1d39149b84a5836b0d154322722)，只修改 `src/ui/workflow/observation.js`、`tests/environment/workflow-ai-observation.test.mjs`。原 RunHost 的完整 `claim/completion/snapshot/result/retirement` 身份必须由共用 `verifyDirectExecutionReceipt` 验证后，才可形成对外网页观察摘要；新增五项错误回执拒绝覆盖。没有改动 Provider Facade、RunHost、Compiler、Chrome 网站权限或第二套 AI 通道。
- **本会话本轮提交（Go `master`）**：[`5dca85d8ea056f449cbd290438c70c97b8216ef5`](https://github.com/shopable-ai/opendesk/commit/5dca85d8ea056f449cbd290438c70c97b8216ef5)，仅新增 `internal/browserbridge/setup_context_unsupported.go`，在不支持的平台提供 `SetupAutomaticContext(context.Context,string,string,string,string)` 的同签名 `E_PLATFORM` 拒绝分支；不启动 Host、安装、配对或 HTTP Listener。先前 `Host.Close` 和 Linux `/tmp` 两项 Go 改动归并行 Agent 的 `d892a5b6` 与 `7225ac72`，**不是本会话提交**。
- **真实 GitHub CI**：Browser `f3f776fb` [Workflow AI #38720844213](https://github.com/shopable-ai/opendesk-browser/actions/runs/38720844213) Node 定向 **121/121 PASS**，`npm run check` **PASS（738 files）**；同一 workflow development build 因 AdBlock Trusted source hash pin 不一致而 **FAIL**，总体 CI **FAIL**，本任务未改 AdBlock Owner 文件。Go 旧 `7225ac72` [Windows Core #38720342941](https://github.com/shopable-ai/opendesk/actions/runs/38720342941) 仍 FAIL，日志指向缺少 `SetupAutomaticContext`；`5dca85d8` 新候选结果需另行查证，不能将源码修复写成 Windows 编译 PASS。
- **证据级别**：Browser 观察回执 `SOURCE_IMPLEMENTED / COMPONENT_VERIFIED`（仅上述 Node/check）；Native Cloud 发送执行及保存路径 `SOURCE_WIRED`，真实 Chrome Send→DOM 读回、点击业务效果、AI 关闭后固定 Revision Run×2 均 `NOT_TESTED`；Go 新 stub `SOURCE_IMPLEMENTED / CI_PENDING`；HTTP Browser Provider `SAFE_DISABLED / PAIRING_OPEN`。无 Mac profile、Codex 登录服务、dist/watcher 或生产凭据操作。
- **安全与下个动作**：Cloud/Native 继续使用统一 Provider→可信观察→原 Compiler/RunHost→Durable Result；未独立读取效果的 Click 不升级为业务成功。Go HTTP 仍复用原 Native Host 的 `h.ai`，Origin/CORS 默认保守拒绝；在 Native 配对、token 撤权/轮换及 Browser 来源合同完成前不得开启浏览器 HTTP Provider。先核对新 Go CI 与本切片 Browser Node/真实身份，再分阶段补真实 Mac Chrome 与无 AI Run×2 证据。

## R2.3：执行证据分级与最新 CI/跨 Agent 去重补记（2026-10-15）

**本轮 Browser 正式源码增量**：`cff1036f833bb33af1780168324e4f16038a020d` (`src/ui/workflow/direct-execution.js`) 将 `PROPOSAL_VALID`、`EXECUTION_RECEIPT_VERIFIED`、有限网页输入读回的 `BUSINESS_EFFECT_VERIFIED` 分开，未证明的 click 永远不能单凭后置 assert 升级；`4541b99ea589596cc0202f9f6e99a8a4c7810d0e` (`src/ui/workflow/workflow-view.js`) 将该等级真正接入 UI/会话历史逻辑，禁止仅执行回执的任务进入“已验证业务历史”；`3f160f8e95e9d76f16a9345203bb5a684d7caea1` (`tests/environment/workflow-direct-execution.test.mjs`) 添加对应纯函数测试。以上是本会话提交，未改其他 Agent 的 `src/ui/workflow/observation.js`。

**精确同 SHA CI**：Browser `3f160f8e` [Workflow AI #38721045226](https://github.com/shopable-ai/opendesk-browser/actions/runs/38721045226) Node **122/122 PASS**、JS parse PASS、source verification PASS；development build 因并行 AdBlock Trusted SHA pin 不一致 FAIL，**整条 Workflow CI FAIL**（不可写 PASS）。同一 SHA [Sidebar R1 checks #38721045425](https://github.com/shopable-ai/opendesk-browser/actions/runs/38721045425) SUCCESS，但这并非正式 Chrome 验收。

**Go Windows 真实阻塞与并行去重**：`7225ac72` [Windows Core #38720342941](https://github.com/shopable-ai/opendesk/actions/runs/38720342941) 失败不再是 `Host.Close`，变为 `SetupAutomaticContext` 缺失，加上历史 `test-architecture` ledger 未登记 59 项测试；其他 Agent 已于 `5dca85d8ea056f449cbd290438c70c97b8216ef5` 新增 `internal/browserbridge/setup_context_unsupported.go`。本会话在重复名审查后使用 **`27765894058885ce497f60d52d32582a4e53f82a`** 从自己改过的 `internal/browserbridge/unsupported.go` 去除重复 `SetupAutomaticContext`，仅留独立 `SetupContext` 拒绝，**未覆盖其他 Agent 的新文件**。新候选 [Windows Core #38721532772](https://github.com/shopable-ai/opendesk/actions/runs/38721532772) 尚待完成；不能称跨平台验收通过。此前 `7225ac72` [Go Native Bridge #38720342867](https://github.com/shopable-ai/opendesk/actions/runs/38720342867) Ubuntu transport 这个**单 job SUCCESS**；未把整体 CI 记成通过。

**Owner 与未完成**：唯一设计文档第 12.6 节记录最新合同。HTTP Gateway 原 `h.ai` 与 Token/Origin 安全策略未动；Browser HTTP 仍 `SAFE_DISABLED / PAIRING_OPEN`。P0 源码可走一次 Send→原观察→RunHost/填入读回→Save Revision，`SOURCE_WIRED / COMPONENT_VERIFIED (Node only)`；用户实际 Mac/Chrome、真模型/业务成功、Save 后关闭 AI Run×2 均 `NOT_TESTED`。若未来点击业务效果存在可证明 Oracle，再增量实现；无证据不升级等级、未知结果不自动重发。

## R2.3：Native 所有 Locator 受信与 Go 跨平台证据增量（2026-10-15）

- **Browser 本轮两个新增提交**：`3219e7deda2a6a72e3cb24b3367bc83d5390e16e` 修复 `src/ui/workflow/local-codex.js` 仅验证 `fill/click` 观察定位的遗漏，复用 `responses.js` 已有 `assertResponseLocators` 约束本轮 `wait/extract/assert` 也必须存在于受信的 `observedNodes`；`274d963ba9a1012b27ef8b87e01678a91d5e8069` 在现有 `workflow-local-codex.test.mjs` 加入三种读/等待场景各正反用例。旧 `E_AI_LOCATOR_UNOBSERVED` 错误语义保持不变，未增加网页执行能力。
- **证据状态**：Browser [Workflow AI #38722002409](https://github.com/shopable-ai/opendesk-browser/actions/runs/38722002409) 初始为 `CI_PENDING`；前一候选 `3f160f8e` 的 Node 122/122 PASS 不自动继承到本提交。真实网页操作/业务效果/关闭 AI 保存工作流独立 Run×2 为 `NOT_TESTED`。
- **Go 同候选进展**：Go `7225ac72` [Native Messaging bridge #38720342867](https://github.com/shopable-ai/opendesk/actions/runs/38720342867) 的 Ubuntu/macOS transport 和模拟 Chrome 可执行文件三个 job 各 **SUCCESS**；新的 Windows Context stub 去重候选 `27765894058885ce497f60d52d32582a4e53f82a` 尚需新 CI，历史 Windows `test-architecture` 分类账本 FAIL 不属于 HTTP Gateway 本身。
- **安全边界**：`Browser→Native→同进程 h.ai` 继续默认路径；Browser `local_http` 保持不可选择，HTTP 配对/令牌撤权/Origin 合同未闭合，`SAFE_DISABLED / PAIRING_OPEN`。本切片仅补“模型提议目标可信”一处，未扩大 P0 业务操作或 P1 信任边界。

## R2.3 产品主目标 / 加权规划进度 / 执行任务树入库（2026-10-15）

**范围与所有者**：本轮由用户明确要求把已讨论的解决方案转为仓库权威文档，通过已连接 GitHub 对 Browser `main` 进行仅文档增量修改；Go `master` 只读核对。更改候选仅限 `docs/architecture/browser-framework/workflow-ai-provider-routing-r2.zh-CN.md`、本账本、该架构 README 入口和单个可复用后续 GOAL（`docs/framework/prompts/goal-workflow-r23-product-first-next-20261015.zh-CN.md`）。不新建第二套总设计或工作引擎，不触碰 Mac、Chrome Profile、watcher、Native 进程、生产凭据、Go 源码或其他 Agent 的提交。

**唯一权威决策**：正式 R2 设计文件 **第 13 节**新增以用户“自然语言→可信观察→原 RunHost 执行→实际业务效果→Save→停用 AI 后 Run×2”为中心的 P0 功能任务树、各功能源码/实际验证状态、P1 HTTP 的可选定位、P2 构建阻塞、T1–T6 后置闸门，以及 M0–M5/H 的下一步文件/完成条件。**覆盖旧第 9 节和第 10.3 节把 F4 HTTP 视为下一首要步骤的计划优先级；不改写它们当时的源码历史和测试事实。** 本账本只保存当前恢复点与证据，具体产品合同不复制维护。

**进度口径**：上次讨论的 **约 52%（51.5/100）只是一次明确标注权重/领域估值、置信度有限的风险加权管理估算**，非统计测量、测试覆盖率、GitHub 成功率或独立产品评分。对应领域与权重仅见正式合同第 13.3 节，不能把“52%”变成产品已验收完成度，也不得靠重复写文档增分；没有真实 Chrome/固定 Revision Run×2/production 同候选收尾不得声称 95+。

**读取快照及真实证据（2026-10-15）**：开始本次写入时 Browser `main@9b34956516f6b3dfaaf0d359a4f43ff8d9259a05`、Go `master@27765894058885ce497f60d52d32582a4e53f82a`，文件/HEAD 若更新须以提交时最新状态为准。Browser [Workflow CI #38731748525](https://github.com/shopable-ai/opendesk-browser/actions/runs/38731748525) Node **123/123 PASS**、源码检查 **PASS（742 files）**、`build:dev` 因 AdBlock Trusted pin 漂移 **FAIL**，故总 CI FAIL。Go [Native #38721532953](https://github.com/shopable-ai/opendesk/actions/runs/38721532953) 整体 SUCCESS；[Windows Core #38721532772](https://github.com/shopable-ai/opendesk/actions/runs/38721532772) 因独立 test-architecture 分类账本 FAIL、整体 FAIL（不能把编译成功等同总 PASS）。这些 CI 都是指定旧候选，**不是当前 Browser HEAD 的构建或用户 Mac 原生验收**。

**未完成与安全合同**：用户真实 Chrome Send→填写读回/安全搜索点击业务效果、固定 Revision 在 AI 关闭后 Run×2、Stop/撤权/未知/晚到事件的原生证据和 production F3/ZIP 均 `NOT_TESTED`。Go HTTP 源码存在，Browser `local-http.js` 仍 `SAFE_DISABLED / PAIRING_OPEN`；token 颁发/撤权及 Browser Origin/CORS 合同未闭合，不能为接线开放全局 CORS，也不得让 HTTP 阻塞 Native/Cloud 核心旅程。

**下一最小开发动作**：新对话执行 GOAL 文件，读取本文和第 13 节/当前源/AGENTS，先核对并行 Agent 已修复部分，再优先处理 `src/ui/workflow/direct-execution.js` 与 `workflow-view.js` 的有限安全操作业务 Oracle、Save/Revision 及 AI-free Run×2 的可运行路径；只改真实未完成切片。用匹配源 SHA 的最短 Node/Go 定向测试；真实 Mac 不可达就继续其他源码并将 T2–T6 标 `NOT_TESTED`。每个切片记录新的 source commit SHA、CI/证据级别及待解决的下一个文件，不以 GOAL 或描述代替实现。

**本次文档修改验证范围**：只核对 Markdown 结构、关键内容/链接及 GitHub 保存的文件身份；无代码修改，不运行完整 Node、Go、build、Chrome、Codex 或正式验收。提交 SHA 在本轮交付回答中以 GitHub 实际提交结果列明。


## R2.4：实际搜索效果、连续已验证事实、固定 Revision 与真实证据分级（2026-10-15）

**执行边界**：经用户本轮直接授权，只用已连接的 GitHub 在 Browser `main` 进行增量源码/测试/文档更改；Go `master@27765894058885ce497f60d52d32582a4e53f82a` 只读复查，**本轮没有 Go 源码提交**。没有访问用户的 Mac、Chrome、原生服务、Watcher、生产凭据或安装目录；未建 branch/worktree/PR、未强推、未新建 Executor/Engine/Compiler/Store/Provider Manager；不修改 AdBlock Trusted source。唯一设计合同第 13.6 节已更新：`b59e5cdea1bdce2d9053382e8055fc8795073acb`。

**本轮 Browser 源码提交（均正常进入 main）**：

- 业务 Oracle 与原执行路径：`d1be7315d4d5c6f5f158ceb0329006b93a3a0205`（`direct-execution.js`：终结性受控点击、搜索独立效果判据、读回值验证）→ `9447aeffc1798c26f7772843645415dcedcc7c70`（`workflow-view.js`：RunHost 回执后新鲜只读观察，搜索跳转不再错误核对旧 Document，业务状态真实分级）；测试 `28f9080f4e544ca305d220117060e81cbad6a979`。
- AI-Off 版本与中断 Save：`a124af5371bc1610293a1bc5edd3f201f23dd4ab`（四处保存 Revision 身份核验）→ `c1d595b10750cf27df29730c318c1f775e1afc54`（先核对 Controller latest head，完全同源码复用断点 Revision，差异按乐观 CAS 拒绝冲突；手动 saved Run 验证 run/result/claim/completion 身份）；测试 `67a63961ecde19b97ce2a1dd5c8aa2fdb2d23c0d`。
- 连续任务 Provider 事实：`62c2fecb757aea1335eea54ce73cf371337b6af4`（`data-sharing.js` 4 项 allowlist 栅栏）、`93f579d56aa4ba1fccdafcb9e8cf44c18f0d8e1e`（`ai-plan.js` 同语义）、`0eab40c0818addfbe87c014101e153197f916a04`（`local-codex.js` 有界历史）、`49752f4f0957fb08ad190dd12baf946f4146645e`（`provider.js` 适配）、`2b6b6f6be17795cedcaf73ca1f4e5d4db5567d6f`（`workflow-view.js` 只累积已确认搜索/填值事实并绑定 Tab/Origin）、`a253af8521091d3b7266a74f6abac8ba59f265e8`（HTTPS 规划明确终结点击与不重放），测试 `683f7c18f7e431051c31bc768e36fee87901d27a`。
- 文档：`b59e5cdea1bdce2d9053382e8055fc8795073acb` 在原正式设计 `docs/architecture/browser-framework/workflow-ai-provider-routing-r2.zh-CN.md` 第 13.6 节追加语义化功能树、节点 Owner/源码/依赖/缺口/通过条件/SHA/证据，**没有第二份 R2.4 设计文件**。

**真实 CI / 同候选绑定**：Browser 代码测试候选 `683f7c18f7e431051c31bc768e36fee87901d27a` 的 [Workflow AI #38737575960](https://github.com/shopable-ai/opendesk-browser/actions/runs/38737575960) **Node 129/129 PASS**，JS parse/Real source verification PASS；相同候选 `build:dev` 因并行 `examples/sidebar-tools/adblock/trusted/host-controls.js` Trusted pin 漂移 **FAIL**，**整条 CI 仍 FAIL**。原 `9447aeff` [#38736377385](https://github.com/shopable-ai/opendesk-browser/actions/runs/38736377385) 127/127 Node PASS、同样 build FAIL。**文档及本账本后续新 SHA 不是 683f 候选；不把该 Node PASS 记成随后 HEAD 的全量构建或正式安装 PASS。** Go `27765894` [Native bridge #38721532953](https://github.com/shopable-ai/opendesk/actions/runs/38721532953) SUCCESS；[Windows Core #38721532772](https://github.com/shopable-ai/opendesk/actions/runs/38721532772) 整体 FAIL（历史 `test-architecture` 账本，不归因于 HTTP Gateway）。本轮未主动复跑用户本地 Node/Go/Chrome；证据来自 GitHub Workflow 日志。

**范围及实际未完成**：

- `SOURCE_WIRED/COMPONENT_VERIFIED`：独立搜索 Oracle 是**受信观察 + 保守判据的源码能力**。它只证实“查询关联的可见搜索结果状态或空结果标记”，不证明结果相关性、服务器提交、任意点击的业务效果。普通点击没有特定 Oracle 始终保留 `EXECUTION_RECEIPT_VERIFIED`；不重放未确认副作用。
- `NOT_TESTED`：真正的 T2 Chrome Send→填写值读回，T3 Chrome 搜索/同会话继续，T4 关闭 AI 并在真实 Chrome/有效网站授权下用同一冻结 Revision 独立 Run×2，T5 原生 Stop/撤权/unknown/断连/晚到场景及 T6 production build、F3/ZIP、安装 ID 和产品逐维 95+。
- `SAFE_DISABLED/PAIRING_OPEN`：HTTP Provider 未被导入 UI，`local-http.js` 保守禁用；没有实施配对/Token 颁发及撤权/Origin/CORS 白名单。Go `master` 无新提交，Native 仍是默认本地路径。
- **任务风险加权估算**：原正式合同 `51.5/100≈52%`；本轮增加实际 P0 生产功能但仍缺真机验证，暂管理估计 **约 54%（低置信）**。这不是业务成功率或独立专家评分，真实 Chrome、AI-Off Run×2 和正式安装不得以未测冒充 95+。

**R2.4 只读连续请求误判修复**：Browser `899a06edfd10028458345133b0a841948218a436` 更新 `direct-execution.js` 的点击意图识别，将“查看搜索结果/搜索记录”等只读名词与“搜索 OpenDesk”点击动作分离；`b14bf76576b90b70e9ea47758047422ee6e2d1a2` 增加“查看搜索结果只能观察、不得重复点击搜索”的测试。正式合同追记 `3400215eb0fd922a5427fc6aadb381922d865ae6`。这些新 SHA 的 CI 需要单独核查，**不能用旧 129/129 代替本次边界补丁通过**。

**下一最小 P0**：先在用户真实 Chrome 的固定 `dist/development` 身份、保持旧 Watcher 原样的情况下执行 T2→T3，并记录 runId/resultId/sourceHash/Document/真正 DOM 值与搜索状态；然后关闭 AI 用同一个冻结 Controller Revision 直接 Run×2 并按两次真实回执核验。仅当原生环境可达时执行这些场景，当前不能接触 Mac 就记 `NOT_TESTED`；若需在纯 GitHub 环境继续实现，优先增加保存中断/冲突和只读 Oracle 的定向故障注入覆盖，不新增第二套运行机制。P1 HTTP 不阻断 P0，P2 AdBlock 由相应 Owner 修 pin。

## R2.3 NEXT：保存版本逐次源码校验与 AI-Free 填写复跑（2026-10-15）

- **继承并行源码，不重复开发**：Browser 已由其他 Agent 在 P0-C 接入同源搜索结果独立 Oracle，在 P0-D 接入 Controller CAS 中断保存恢复及 saved Revision 四处身份核对；第 13.6 节是唯一正式功能树。本增量严格复用原 Compiler/RunHost/Controller。
- **本轮 Browser 提交**：4202985f8c3042bb6faa7f2c4fe4a28694f8bca5 修改 src/ui/workflow/workflow-view.js：每次 saved RunHost.start 前从原 Controller 重新核对持久源码字节、sourceHash；AI 不可用时，符合条件的独立 fill-readback 才可获得 BUSINESS_EFFECT_VERIFIED（仅网页输入值）。403e6014ad041dc63ed2c4162c772d9a0507e53b 扩展 tests/environment/workflow-focus.test.mjs 组件冻结版本 Run×2/篡改拒绝。58851434318709bc6703c95300a2be577256f93d、7ed633d4fabc5de3dbcfc38878904d5d4278ac6e、1e126028f49d69f82cad09536ca7a3f75e45810b 是组件夹具的小步修正，不是新的运行时架构。
- **证据分级及绑定 CI**：[Workflow AI #38738021493](https://github.com/shopable-ai/opendesk-browser/actions/runs/38738021493) 在 58851434 候选定向 Node FAILED（跨 VM 参数模拟未归一）；不能引用旧 127/127 PASS。最新 1e126028 候选 [Workflow AI #38739012994](https://github.com/shopable-ai/opendesk-browser/actions/runs/38739012994) 实际日志为定向 Node **130/130 PASS**、源码检查 **750 文件 PASS**，build:dev 因并行 AdBlock Trusted host-controls.js SHA pin 漂移 **FAIL**，**整条 Workflow CI FAIL**。仅相应组件为 COMPONENT_VERIFIED，真实 Mac/Chrome 仍 NOT_TESTED。
- **Go / 安全 / 下一完成条件**：Go master@27765894058885ce497f60d52d32582a4e53f82a 本轮只读未改。Browser local-http.js 保持 SAFE_DISABLED / PAIRING_OPEN。真实 Mac Chrome T2 填入、T3 搜索独立结果、T4 关闭 AI 同 Revision Run×2（两次不同 runId/resultId、相同源码/hash），T5 Stop/撤权/未知和 T6 production 同候选安装均 NATIVE_NOT_TESTED；未授权其它业务副作用不会自动重复执行。


## R2.3 NEXT：页内安全搜索实际业务效果读回与证据（2026-10-15）

- **增量源码/Owner**：继承此前 P0-C 的有界搜索 `search-results-v1`、P0-D 逐次固定 Revision 字节核对及无 AI 复跑组件证据。本会话新增 Browser `main` [`265961af424c741e83285954fedf5099f74fee80`](https://github.com/shopable-ai/opendesk-browser/commit/265961af424c741e83285954fedf5099f74fee80)：`src/ui/workflow/direct-execution.js` 在原 RunHost 的前后可信观察结果上允许精确、同文档的 `search-inline` 结果状态证明；`src/ui/workflow/workflow-view.js` 显示相应受限事实，`src/ui/workflow/data-sharing.js` 的历史仅记录离散效果种类、不虚构链接数或共享 DOM。测试仍在原 `workflow-direct-execution.test.mjs` / `workflow-ai-data-sharing.test.mjs`，未改 Compiler/RunHost/Go Gateway 或接入 HTTP。
- **严格边界**：两份独立原 RunHost 观察的 `runId/resultId/sourceHash`、精确 Target 与原点击回执、结果容器点击前已观察、点击后新且匹配用户关键词的页内结果及另一个“搜索完成”状态共同成立时，只证明页面结果已呈现。没有前状态、文档换代、同值旧结果、状态不符、隐藏元素、缺少回执或其他未验证点击均不升级业务成功，未知副作用不重试。
- **与实际源 SHA 绑定的 CI**：[Workflow AI #38742444832](https://github.com/shopable-ai/opendesk-browser/actions/runs/38742444832)（`265961af`）**131/131 Node PASS、`npm run check` 751 files PASS**；同候选 `build:dev` 因 AdBlock Trusted `examples/sidebar-tools/adblock/trusted/host-controls.js` pin 不符 **FAIL**，因此整条 CI **FAIL**，未擅自修改其他 Agent 的 SHA 固定。前一 [#38739012994](https://github.com/shopable-ai/opendesk-browser/actions/runs/38739012994) 是 `1e126028` 的 Node 130/130 PASS，不混用候选结果。
- **实际未测**：虽然组件已 `COMPONENT_VERIFIED`，真模型与真实 Mac Chrome T2/T3、关闭 AI 后固定 Revision 的用户 Chrome Run×2、Stop/权限撤销/未知结果、正式安装 ID/production/F3/ZIP 均 `NATIVE_NOT_TESTED`，不声称 95+ 或按文件量提升规划估算。Go `master@27765894058885ce497f60d52d32582a4e53f82a` 本切片只读，Browser `local-http.js` 继续 `SAFE_DISABLED/PAIRING_OPEN`。
- **正式合同与下个最低闭环**：现有 `docs/architecture/browser-framework/workflow-ai-provider-routing-r2.zh-CN.md` 第 13.6.2 节；用户真实 `dist/development` Watcher/Chrome ID 与 Go Native 对应时，`demo-form.html` 一次 Send→填值与页内搜索独立结果→保存→关闭 AI→同 SHA/Revision 两次独立 RunHost 回执，保存 runId/resultId/Document/页面实际值。无 Mac 权限不伪报现场结果。


## R2.4 NEXT：搜索效果观察器与官方 Demo 前置可见性（2026-10-15）

- **本增量 Owner/文件**：Browser Workflow，仅改 `src/ui/workflow/observation.js`、`tests/environment/workflow-ai-observation.test.mjs`、`examples/tasks/demo-form.html`；复用并行 Agent 已提交的 `search-inline` 业务 Oracle，不修改它的执行、历史、Compiler、RunHost、Go、HTTP Provider 或其他工具 Trusted 源。
- **可执行功能与源码**：`efded4c1e82c70dd366c14c77be0c85a15db5476` 修复只用查询词进行点击后只读观察时，区域匹配无法发现“结果：OpenDesk”的问题；正反向有界匹配只接受可见语义节点，仍受原 24 节点/观察回执/Document/Origin/撤权/数据分享门禁。组件测试证明不再遗漏搜索区域，但不构成真实网页效果证明。
- **官方测试页准备**：`4cbc4c6955b676cfea988bf7e8ce5ba94f62cfb9` 将 `demo-form.html` 的空 `#results` 容器设为最小高度，使原语义观察器（要求非零 DOM 矩形）可在点击前真实观察到结果容器；新增源代码合同测试。原页面搜索事件处理/定时结果仍保持真实 DOM 行为，未伪造观察、回执或链接。
- **精确绑定的 CI**：[Workflow AI #38743152102](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743152102) 在 `efded4c1` **Node 132/132 PASS、源码检查 753 文件 PASS**，同候选 `build:dev` 因并行 Sidebar Tool `E_TOOL_BUILD: locales resource or main.js marker invalid` **FAIL**，整条 CI **FAIL**；新候选 [Workflow AI #38743574920](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743574920) 针对 `4cbc4c69` 在记录时 **IN_PROGRESS**，不得继承旧候选的通过结论。
- **功能｜状态｜Owner｜依赖｜缺口｜通过条件｜SHA/证据**：搜索后短关键词定向语义观察｜SOURCE_IMPLEMENTED/COMPONENT_VERIFIED（旧精确候选）｜Workflow｜原可信 RunHost/Document｜真实 Chrome 仍缺｜T3 真机只读观察确实读到网页状态且不重放搜索｜`efded4c1` / 132 PASS；官方 Demo 空容器前状态｜SOURCE_IMPLEMENTED/CI_PENDING｜Workflow fixture｜原语义 DOM 可见性及并行 `search-inline`｜需最新 CI+真实 Chrome 前后观测｜T3 同 Tab/Origin 有可信前后 DOM/RunHost 收据且查询精确匹配｜`4cbc4c69` / CI #38743574920。
- **未完成及进度**：T2 真 Chrome 输入值精确读回、T3 真搜索/连续只读、T4 AI-Off 同冻结 Revision 与 sourceHash 独立 Run×2、T5 停止撤权晚到未知、T6 production/安装均 `NOT_TESTED`，不可宣称业务验收或 95+；原风险加权管理估算暂维持约 **54%（低置信度）**。Go `master@27765894058885ce497f60d52d32582a4e53f82a` 本轮只读无写入；HTTP Provider 继续 SAFE_DISABLED。
