# GOAL：OpenDesk Browser · WebFlow → OpenDesk 本地 MCP → 官方 Codex · 真机测试、最小桥接与验收

## 0. 原始需求及本轮边界（最高优先级）

仓库：`https://github.com/shopable-ai/opendesk-browser`
唯一开发分支：`main`
目标目录：`projects/webflow/`
本次 Demo：`projects/webflow/demos/codex-local-handoff/`
固定检索词：`OD-AI-WORKFLOW-BRIDGE`

**我要解决的问题：WebFlow 的已授权浏览器脚本，能够在网页任务结束后，经 OpenDesk 现有可信 Native/MCP 通道，唤起本地官方 Codex，创建新对话或执行一项实际任务，取得真实结果，再回填到原 WebFlow 任务。**

必须区分：
- `codex://new?prompt=...`：唤起 Codex 并预填**未发送草稿**；不是执行成功。
- `codex app-server`：创建线程、提交 turn、读取最终回答与真实状态；`turn.status=completed` 不等于业务验收通过。
- `trigger.mjs`：**本地模拟可信 WebFlow Host 的命令行入口**，不是已安装 WebFlow 脚本的真实 Native 权限。

**不再使用 ZIP 作为交付件。** 所有源码、针对性测试、执行卡、验收证据、提示词写回真实仓库；不创建平行 Demo、平行 Runner、第二套 MCP/Native/Authority、AI Proxy 集成、分支、worktree 或 PR。保护 `main` 上其他 Agent 的并行更改，`UNKNOWN` 绝不自动重放或通过换 requestId 规避。

## 1. 已完成的内容：必须复用，不要重写

在仓库检查实际 `main` 后，已有五个文件：`README.md`、`demo.mjs`、`trigger.mjs`、`mock-app-server.mjs`、`demo.test.mjs`。本轮已增量实现：
- 独立的本地 MCP 模拟服务与 CLI 触发，固定工具 `opendesk.codex.open_draft` / `opendesk.codex.start_turn`，默认 `PREVIEW_ONLY`。
- macOS 固定 `/usr/bin/open`、Codex App Server 的 `initialize` → `thread/start` → `turn/start` → `turn/completed`，默认 read-only，拒绝自动批准权限请求。
- 读取 `item/completed` 的最终 agent message（或 `turn/completed` snapshot），delta-only 明确标记非权威；不把 Codex 终态伪装为 `businessSuccess=true`。
- 超时、崩溃、权限请求及 RPC 错误尽量返回已得到的 `threadId`、`turnId` 与 `submissionState`，无法证明已派发或已完成时保持未知，不自动重试。
- 离线 Node 专项 **16/16 PASS（开发环境）**。这不等于本机 Mac/Chrome/Native 实测。

当前仍未完成：
1. 在真实 Mac 官方 Codex 桌面中确认 `codex://` 草稿打开、正文一致、未自动发送。
2. 在真实 Codex CLI/App Server 中确认只读任务完成、取得真实 `threadId` / `turnId` / `answerText`、官方桌面可检查同一会话。
3. 从**已安装 WebFlow 的真实用户入口**经过原 Browser Authority/Native/MCP 调度到 Codex，获得原身份关联的真实结果并在 WebFlow 看到回执；这不是本轮离线 Demo 已实现的功能。

## 2. 本轮本机 Codex 首先执行的五步

### T01：恢复现场、保护并行工作

读取本仓库根 `AGENTS.md`、`projects/webflow/AGENTS.md`、本 Demo `README.md`、相关 Native/MCP 的真实公开接口和 `projects/webflow/docs/execution-plan.zh-CN.md` 当前执行卡。确认当前主分支、已有改动、是否有人在修改同一文件。只读核查实际源码与上述状态是否一致；有出入以真实仓库为准，不重复开发或覆盖并行工作。

### T02：本机离线门禁

从仓库根目录运行：

```bash
node --test projects/webflow/demos/codex-local-handoff/demo.test.mjs
```

若失败，只修同一业务范围实际故障，并针对失败增加最小回归。特别核对同一 MCP 服务的并发保护、工具参数白名单、无默认执行、`completed` 与业务验收分离、权限请求拒绝、超时不重放和错误回执携带关联 ID。

### T03：真实 Mac 只验证深链草稿

确认本机已安装并登录官方 Codex。测试 URL handler 是否正确注册，然后执行：

```bash
OPEN_DESK_DEMO_ALLOW_LIVE=1 node projects/webflow/demos/codex-local-handoff/trigger.mjs draft --prompt 'WebFlow Codex 草稿测试：请不要自动发送。'
```

用官方 Codex 桌面真实窗口检查新对话、文本、是否仍为未发送草稿；`OPEN_REQUESTED` 只证明发起唤起请求，不能独自判定 PASS。记录实际观察、时间、目标 App、窗口或截图证据（脱敏），不要以模拟内容代替。

### T04：真实 App Server 只读任务

确认 `codex` 可执行、`codex app-server` 可初始化，实际当前登录、模型/权限满足。使用本仓库作为只读工作区，执行：

```bash
OPEN_DESK_DEMO_ALLOW_LIVE=1 node projects/webflow/demos/codex-local-handoff/trigger.mjs run --cwd "$PWD" --prompt '只读分析这个仓库 README：用两句话解释项目定位，并指出对应依据。禁止修改文件、安装依赖和提交代码。'
```

验收要求：`threadId`、`turnId`、`turn.status`、原始 `answerText`、工作区身份、结果来源可核对；人工验证回答确实与 README 一致。尝试从官方 Codex 桌面打开同一 `codex://threads/<threadId>`，分别报告“App Server 能执行”与“桌面中能看到同一会话”。中断、权限要求或断线时返回原身份及 `OUTCOME_UNKNOWN`，先查询原线程，不补跑、不另建相同任务。若某个 URI 不受当前版本支持，以现场错误和官方文档为证据做最小兼容修复，不猜测“可用”。

### T05：经证实必要时，再完成真实 WebFlow → Native/MCP → Codex 入口

**不得直接从用户网页 JS、沙箱 iframe 或未审阅动态 Task 调本机命令。** 先只读发现已存在的 Browser Authority / Controller / Native Agent / MCP 调度能力、`handoff-contract.js` 和真实消费者。仅在证明缺少的**固定能力、可复现阻塞、通用 SDK 缺口、最小 owner 修改面**之后，增加经审阅的可信固定桥接：

- 精确授权的已安装 Task/可信按钮触发；目标本地机器、固定能力、来源会话/任务、真实工作区路径由可信宿主核对，不信网页/模型自报权限。
- 复用现有授权/撤权、持久执行身份、资源释放及已存在的副作用/UNKNOWN 账本；相同操作最多派发一次，回执丢失先只读对账；禁止泛化 shell/HTTP localhost 代理或自动获取所有本地文件。
- 首次打通仅用一个用户确认的、**只读** Codex 任务。返回 `threadId`、`turnId`、终态、实际回答/失败原因到原 WebFlow UI；发出成功通知之前需验证真实回执，别把发送请求的 ACK 当成功。
- 浏览器、Native、Codex 都要用同一候选版本和真实安装身份验证；如果本机环境或该接口不可用，保留 `BLOCKED`/`NOT_TESTED`，继续完成无依赖的代码、文档与定向测试，不扩大权限绕过。

此阶段若证实确需修改独立 `shopable-ai/opendesk` 仓库，先只读确认其 `master` 分支的现行 MCP/Runtime 接口与缺口，再明确记录跨仓库变更需要的 owner 和授权；不能擅自把另一个仓库塞进当前项目，也不能因为 Codex 本机能运行就虚称 WebFlow 已接通。

## 3. 必须输出的证据与交付

- 更新本目录 `README.md` 和原 `projects/webflow/docs/execution-plan.zh-CN.md` 的精简执行卡；定向测试与实际终端记录存入项目已有证据位置，不记录凭据、Token、用户敏感正文。
- 按 `SOURCE / NODE / MAC_DRAFT / MAC_TURN / DESKTOP_THREAD / BROWSER_NATIVE / WEBFLOW_E2E` 分别写 `PASS / FAIL / NOT_TESTED / BLOCKED`，引用实际运行命令、准确源码身份与观察证据；不同阶段不继承成功结论。
- 若涉及正式打包/安装，遵循原打包器和安装审阅，验收前不擅自晋升正式包；保留所有旧 UNKNOWN、旧用户数据、并行改动。
- 按 **产品目标、架构复用、安全授权、幂等恢复、测试证据** 五个角色分别 `/100` 给出**有扣分依据的方案自评或可核实的独立评审**，综合分是五项算术平均，禁止累加；目标 ≥95，但没有真实 Chrome/Mac 证据不得把产品验收分写成 95+。任何越权执行、错误成功宣称、重复副作用均为一票否决项。
- 最终中文结论先回答：**真实 WebFlow → 官方 Codex 任务是否已经跑通？哪里真实通过、哪里仍阻塞、下一条最小用户操作是什么？** 再给受影响文件、测试、截图/日志证据、提交信息及评分。

**执行原则：** 不重新规划一整套平台；从现有代码与真实单次任务开始，修最小阻塞，反例审计后再向下一步推进。不要让我重新下载 ZIP、复制源码或重复回答已知问题。