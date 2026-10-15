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
