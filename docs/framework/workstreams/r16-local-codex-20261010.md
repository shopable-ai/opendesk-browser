# R16 本机 Codex 工作流实施与验收记录

## 结论与候选身份

状态：**IMPLEMENTED / COMPONENT_AND_LINUX_CODEX_VERIFIED**。当前代码已接通官方 Codex App Server 与 Sidebar 工作流，独立审阅确认已发现的源码问题已修复。**整体产品验收 NOT_ACCEPTED，真实 macOS / Chrome / Native 闭环 NOT_TESTED；不宣布十项均达到 95+。**

- 工作流：`r16-local-codex-20261010`。
- Browser：始终在 `main`；原起点 `0a6a5b14c749552ace72f653a23f4bd23ae2aa76`。最终集成父提交 `992f11732657171d9691d99a6b114106c0b7782f`。本文件及 `final-evidence.json` 在提交前生成，以源码与包哈希绑定最终候选；交付 commit 是包含这些文件的实际 main 提交，不把旧本地中间提交当作远端交付。
- OpenDesk：始终在 `master`；实际交付提交 [`005a2f33a640c76565775a398b243f1d66a6caf1`](https://github.com/shopable-ai/opendesk/commit/005a2f33a640c76565775a398b243f1d66a6caf1)，Git tree `2912cf1527a3141e53350683153651301f06cf93`。
- Go 最后观察到的 master 为 `15af7bbd93aa836a9320ac27c053cababb6bdd2c`，仅在上述 R16 提交之后新增 R6 架构文档；已 fast-forward 保留，生产及测试输入未改变。该上游文档提交不冒称本轮实现提交。
- Go 最终生产源码集合 SHA-256：`1e96b15cfaaa304408c71edb52ea021e00334df77a75a180f43c638beb6bb22c`。
- 本轮专属 Linux checkout 起始无未提交修改。未建分支或 worktree；root 是正式仓库唯一写入者，子任务在各自 scratch 暂存或只读审阅。按当前用户与工程 GOAL 授权提交两个主分支；不做 release / ZIP 发布。
- Browser dist / WXT output guard 已正常释放。没有启动用户 macOS、CFT profile 或人工演示服务器；原全局 owner 登记未修改。

## 正式输入及并行主分支保留

已读取两仓 R16 正式设计、完整工程 GOAL、AGENTS、testing-guide 和对应既有工作流。保留原 R15 / SDK / Native / Task 功能与所有旧证据。

Browser 先集成 `a8f1c08353ab3a30a9695e36773626a12e05c8c3`，随后集成 `be0884e258a51fc65f3d973ffa358b61377de19b` 的 R3.1 安装授权代次与 SDK 修复。唯一重叠的 `src/ui/tool.html` 通过只暂存本轮该文件、fast-forward、恢复本轮差异的方式合并，原 Page 恢复入口和 R16 同意控件均保留。之后的 `7a5c88b51b3845c771f6ae346c9aafe90753bae7`、`4e397463a865d6b27562ba853dca19cb8ca2a475` 只增加其它 SDK 原生测试、CI 和工作流记录；该阶段的 329 例和两包输入逐项核对通过，原件现保存在 `builds-4e397463/`、`review-4e397463/`，不代替最新候选。

最后保留并合入 `92ddeeb43a129942226d2d5c5c2967d7c305a9e8` 的 Page 默认站点范围、安装授权恢复和 Schema backrefs。仅暂存本轮三个重叠文件后 fast-forward，再合并双方内容；没有覆盖其它任务修改。压缩器保留上游 default/adaptive 行为，background 的显式 fixed 路径按实际 Terser 产物大小选择；两套解码与拒绝边界均保留。完整回归增加 10 个受影响测试文件，重新构建 production/development、校验 184 项输入与全部产物，不复用旧包充当新包。

提交前又保留 main 至 `789fa3a35aaa1c7b287f6b47261d21c54a62dcc5` 的7项文档、CI及测试变动，无产品/构建输入改变。采用上游已修复的全站与窄授权测试、`file://` 拒绝及编辑器默认值；额外保留本轮“省略设置只生成 Candidate、没有原生副作用”的正例。新增编辑器受影响测试后单独运行33文件，并逐项重验两包184项输入；全部产物仍对应当前源码。

发布前再 fast-forward 到 `992f11732657171d9691d99a6b114106c0b7782f`：仅两份既有能力设计说明及原生测试 Worker 就绪等待变动，没有本轮23个修改文件重叠，也未改变184个构建输入或33个组件测试输入。原独立审阅冻结在789基线、内容保持不变；`publication-upstream-integration.json` 记录逐项哈希证明，最终候选继续使用同输入475例及两包证据。

R3.1 的 `expectedTaskGeneration` / `expectedTaskInstallationId` 只约束 `task:` 安装来源。R16 固定 draft 观察及原 Workflow Controller script 不冒用安装 Task 身份；原 Task v1 同站限制不变。R3.1 明确保留 Workflow Run / AI endpoint 的权限请求，本轮沿用其真实执行确认与精确站点请求。

新 Page 默认 `*://*/*` 仅描述 Candidate 的 HTTP(S) 调度范围；原 Available、安装点击、冻结权限证明与 Chrome 授权仍须分别通过。全局站点恢复入口不等于 R16 模型内容同意或观察审批。独立审阅另发现一个上游兼容边缘：旧冻结 Page 含 UserScript header、没有 `@match` / `@noframes`、却显式指定 `allFrames:true` 时，新默认 main-frame 语义会以 `E_PAGE_METADATA_RULES` 安全拒绝重验。保留这一校验，登记为 Page 迁移待处理项；不默许扩大旧权限。R16 不创建此类 Page manifest。

## 已实施能力

### 本机 Go Provider

`internal/browserai` 由可信 OpenDesk 管理长期存在的官方 `codex app-server --listen stdio://` 子进程，执行实际 CLI 发现、版本/协议检查、登录类型、受限 thread、turn、事件、工具请求、中断与关闭。`opendesk browser ai doctor` 提供真实就绪诊断。没有用 `codex exec` 代替连续会话。

复用原 Native Messaging：hello 协商 `workflowAiVersion:1`，七个 AI 方法使用 `opendesk.workflow-ai.v1`。原十个 Browser RPC 保留；旧 Node Host 缺少能力时不接收未知 AI 帧。身份绑定 owner / registration / generation / session / thread / turn；请求及会话数量、事件、UTF-8 帧、并发和回放账本有界，取消/关闭保留控制通道。

当前只自动允许已审计的 **Codex CLI 0.159.2**。同一活动 thread 内可以多轮对话；该版冷恢复不能满足空执行环境约束，因此 `resumeSupported:false`，关闭后开始新对话。CLI 的 `environments.toml` 存在或状态无法确认时，启动前返回 `E_CODEX_POLICY`；不会读取其内容或替用户改写配置来通过检查。

每次 thread / turn 均使用空执行环境、空 roots、只读沙箱与禁止模型命令审批。个人 MCP、插件、hooks 等副作用入口被阻断。受管子进程固定设置 `CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED=1`，避免继承持久远控偏好；不修改用户远控 enrollment。CLI 自己使用已有官方登录，浏览器不接触登录凭据。联网推理与 CLI 线程可能留存的说明明确显示；关闭会话不等于删除已发送内容或 CLI 历史。

### Sidebar、浏览器观察与原工作流链

四种来源独立呈现：本机 Codex、自定义 HTTPS、官方 AI 服务边界、手动创建。默认紧凑对话，连接与配置在齿轮内；手动与已保存 JS 运行始终可用。就绪、CLI 缺失、未登录、不兼容、模型不可用、额度、网络、审批、断连、未知结果分别处理；就绪探测不冒充模型已经成功推理。

每次发送冻结需求、现有步骤、模型来源、同意与精确目标。真实事件驱动文字和结构化步骤进度；只有通过 session/thread/turn/连续序号校验的成功终态及最终 JSON 才能生成提议。用户真实点击采用后才修改草稿，继续使用原 Schema、编译器和确定性 JavaScript。

Agent 只有 `browser.observe` 一项 Browser 工具。它要求本轮单独网页同意、`canApprove:true`、真实审批点击、Chrome 精确站点权限，以及观察前后/回传前的 window/tab/frame/document/url/origin 核验。固定源码为 `page.observe({maxNodes:24,maxChars:4000})`，通过原 Controller / RunHost / Authority 运行。只有匹配 runId/resultId 和结果自身 revision.sourceHash 的原持久结果才可回传；12 KiB 内的固定投影去掉完整 URL，不读取 input value、Cookie 或历史结果。网页可见文字仍可能敏感，用户说明没有承诺摘要天然安全。

原执行和保存链继续承担：采用 → 编译 JS → RunHost 运行 → 持久结果 → 保存 Revision → 重读冻结源码并重复运行。没有第二套执行器、Authority、Result Store 或 Task 系统。实际模型提议已经被原编译器接受；真实 Chrome 保存/复跑另列 NOT_TESTED。

## 独立审阅推动的修复

1. Stop 原先会因外部 abort 先释放 `active`，让后续 cancel 提前返回 IDLE。现由独立 cleanup Promise 持有取消/关闭；CANCELLING 仅算 ACK，需读取精确 turn 终态。12 秒内无法核对则关闭并忘记旧会话，返回 UNKNOWN；不重发原 turn。close 可抢先终止 drain，内部 timeout / cursor / protocol 错误也等待同一清理流程。已取消请求不会创建新 session，迟到 open 不会附着新会话。
2. 所有非 session 事件必须有非空字符串 turnId；终态 status 必须在 completed/failed/interrupted 内；事件批 hasMore/state 类型明确。无身份提议、工具或非法终态不能成为执行或完成依据。
3. 原 Native package 测试落后于已批准的 R15 15 个入口，改为明确核对完整 15 项目录，保留原 CSP、固定资源及动态执行拒绝测试。
4. 集成新主分支后生产 SW 实测 335,273 B，正确触发原 327,680 B 门禁。只优化现有固定 Schema 的数据编码为同步、有界 stored/fixed-Huffman 解压；JSON 字节、顺序及所有字段完全不变。没有删除权限检查、添加运行时网络加载或提高门禁。合入 main92 后的最终生产 SW **326,336 B**，余量 **1,344 B**；开发 SW 为 **326,502 B**。后续新增代码仍必须通过同一门禁。
5. main92 首轮 431 例中两处测试夹具仍使用旧默认值，得到 429 PASS / 2 FAIL。先修正全站正例和窄 proof 拒绝负例，后随 main789 保留上游等价修复；额外核对省略 pageRules 只生成 main-frame HTTP(S) Candidate、无 verification / 无 Native 权限副作用。生产授权校验未修改，原失败日志保留。其间433例命令虽返回exit0，原始文件只有381条结果、缺尾部，明确弃用为最终证据；最后单独捕获完整原始输出、fsync并原子落盘，得到完整475例。

## 最终验证证据

原始命令、退出码、完整日志、输入和文件哈希集中在 [`r16-local-codex-20261010`](../evidence/r16-local-codex-20261010/README.md)。最终索引为 [`final-evidence.json`](../evidence/r16-local-codex-20261010/final-evidence.json)。

| 验证 | 结果 | 限定 |
| --- | --- | --- |
| 最终 Browser 33 个受影响测试文件 | **475 PASS / 0 FAIL / 0 CANCELLED / 0 SKIP** | 完整 TAP `1..475`、475 条顶层结果与尾部汇总一致；合成组件，非 Chrome |
| 源码 / 构建合同检查 | **259 文件 PASS** | 包含固定入口、CSP、原 MIT 检查 |
| production / development 构建与 npm verify | **均 PASS** | 每包 184 项输入逐一重验，30 / 45 个产物文件 hash 一致 |
| Go browserai race | **47 PASS / 5 opt-in SKIP** | 包括子测试；真实 CLI opt-in 另独立运行 |
| Go browsercli race / Native 定向合同 | **2 PASS / 5 PASS** | 原 Native 路由与帧/身份合同 |
| Go vet | **PASS** | browserai / browserbridge / browsercli |
| 真实 Codex 0.159.2 | **5 顶层测试 PASS** | ChatGPT 已有登录；同 thread 17→21；每轮8事件；流式后中断终态；MCP canary；真实工作流51事件/232B JSON |
| 真实提议 → 原编译器 | **PASS（组件）** | 同一源码/hash生成两次；明确 mock Page API 运行两次，无 AI 依赖，非真实 RunHost |
| Darwin arm64 | **两包交叉编译 PASS** | 没有执行 macOS 二进制 |
| 原 Node Native socket 测试 | **2 PASS / 7 FAIL（EPERM）** | 当前环境 socket 能力限制，实际 Go/Node 原生互通 NOT_TESTED |
| Go test 架构登记审计 | **24 项既有 FAIL** | 基线已存在，本轮3个新测试已登记；不改写基线或称总审计通过 |
| macOS / Chrome / Native 产品闭环 | **NOT_TESTED** | 阻止正式原生及全项95+验收 |

本轮23个源码、测试及说明文件的 staged `git diff --check` 通过。包含原始证据的整体 diff 会报告工具输出和原始 patch 上下文的尾部空格（exit2）；这些日志按原字节保存，不为消除格式提示改写测试证据，也未修改仓库 whitespace 策略。

最终 packageHash：

- production：`c11a26da9ce32717a6f9d69a106d7914d4fb6a213f64d025789d596c523c0333`
- development：`dfba0b065b6d825d75a5270e2d3b1a0a9372c355983c681396712724a6a251e4`
- 真实模型提议经原编译器得到的冻结源码 SHA-256：`493e87feb66dce68eaec8f0533577103777a4d8f6000bc59880ba5ee2c96ed9a`。

Go 原始证据在交付提交的 `docs/integrations/browser/evidence/r16-20261010/remote-control-final/`。历史 manifest 中部分本地中间提交和文档哈希是采集时身份；本轮最终8项生产、3项测试哈希均匹配实际交付提交。没有把不归档的二进制/第三方源码摘录假装成仓库文件。

保留早期依赖 provenance 失败、旧入口数失败、不完整测试日志、SW 超限、Stop 红灯及早期真实取消/网络失败。`integrated-components.log` 只有235条可见通过且缺终结汇总，**不采用此前工具显示的298计数**；`final-main92-candidate-components.log` 只有381条结果，**不采用工具返回的433计数**。旧包、中间324/329例候选及 main92 首轮429/2仅作过程证据，不覆盖上述475例最终候选。最终TAP为112806字节，SHA-256 `6a46aa3ea14c3820adc366f4cc6761e7db6c3e688b9ec60b2b125a7353ad8bf5`。

## 独立百分制评价

独立反方 reviewer 未编写生产代码、未修改仓库；核对源码、官方固定版本协议、完整原始回执和最终哈希。下列分数是明确限定范围的审阅判断，不是原生认证，也不取平均数掩盖缺口。原件见 [`independent-review.json`](../evidence/r16-local-codex-20261010/independent-review.json)。

| 项目 | 有证据范围内评分 | 真实原生缺口 |
| --- | ---: | --- |
| 用户体验 | 92 | 尺寸、缩放、键盘和真实交互 NOT_TESTED |
| Codex 连续 Agent | 90 | 活动线程 Linux 有证据；真实 Browser 工具往返、最早取消时间窗正常终态待验；冷恢复明确不支持 |
| Provider 就绪 | 96 | macOS、真实额度/模型失败矩阵待验 |
| 安全 | 97 | 原生完整安全 campaign 待验 |
| 隐私 | 96 | macOS 凭据/网页链路、真实远控 enrollment 场景待验 |
| 工具授权 | 96 | 真实模型→Sidebar→Chrome→模型待验 |
| 浏览器执行 | 94 | R16 真正 Chrome 持久 run/result 回执待验 |
| 保存复用 | 94 | 实际保存、重载、禁用 AI 后两次执行待验 |
| Go/Node 兼容 | 93 | 实际安装和 Native 互通待验 |
| 原生 Chrome 测试 | **NOT_TESTED** | 无本轮同候选现场证据 |

## 修改文件

Browser 生产/构建：

- `src/native-agent/service-worker.js`
- `src/native-agent/workflow-ai-protocol.js`
- `src/native-agent/workflow-ai-client.js`
- `src/native-agent/workflow-ai-service.js`
- `src/platform/host/client.js`
- `src/ui/workflow/local-codex.js`
- `src/ui/workflow/observation.js`
- `src/ui/workflow/workflow-view.js`
- `src/ui/workflow/ai-plan.js`
- `src/ui/tool.html`
- `src/ui/tool-shell.css`
- `scripts/compact-schema.mjs`
- `wxt.config.mjs`

Browser 测试：`tests/environment/workflow-local-codex.test.mjs`、`workflow-ai-transport.test.mjs`、`workflow-ai-observation.test.mjs`、`workflow-ui-states.test.mjs`、`native-agent-package.test.mjs`、`compact-schema-fixed.test.mjs`、`native-page-program.test.mjs`。`page-program-package.test.mjs` 的等价修正已由上游 main789 提供，本轮保留其内容。文档：本记录、两仓设计状态中的 Browser R16 设计、[macOS 验收提示词](../prompts/goal-r16-local-macos-acceptance.zh-CN.md)及本轮专属原始证据目录。

OpenDesk：`internal/browserai/{protocol,process,process_unix,process_other,manager}.go`，`internal/browserai/{manager,process}_test.go`，`internal/browserbridge/host_ai_unix.go`、`host_ai_unix_test.go`、`host_unix.go`，`internal/browsercli/command.go`，R16 integration 设计/实施说明、两份测试登记文档及专属证据目录。完整变更以实际交付 commit 为准。

## 普通用户入口与后续验收

安装包含 Go 交付提交的 OpenDesk，使用本机官方 Codex CLI 完成 ChatGPT 登录；原 Native 配对仍需有效。打开目标网站和 Sidebar「工作流」，齿轮选择本机 Codex并连接/检查。勾选本次模型发送同意后输入需求；后续发送会继续活动 thread。要查看网页时另勾网页同意并逐次批准观察。检查结构化提议并采用，按原确认运行，保存冻结版本。之后可结束 AI、选择手动，并从原保存入口再次运行。

当前 Linux 环境没有可验证的 macOS App / 原生 Chrome 安装链。后续只需按 [R16 macOS / Chrome / Codex 独立验收提示词](../prompts/goal-r16-local-macos-acceptance.zh-CN.md)补同候选真实验收：先 Gate A 两包校验，再真实安装配对、demo-form 多轮与观察、RunHost/保存/禁用 AI 后两次复跑，以及撤权、导航、断连、Stop、窗口身份和旧 Node 场景。记录实际 runId/resultId/revision/sourceHash 与资源释放。源码无变动不重复无关历史大 campaign；有修复只补受影响验证，最后按同一最终候选收口。
