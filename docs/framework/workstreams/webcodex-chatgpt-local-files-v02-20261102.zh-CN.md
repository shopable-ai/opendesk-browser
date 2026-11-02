# OpenDesk ChatGPT 网页本地文件 Bridge V0.2｜实际断点与唯一 Owner 接线交接

> 日期：2026-11-02。状态：SOURCE_AUDITED / INTEGRATION_NOT_IMPLEMENTED / MAC_CHROME_NOT_TESTED。
> 本文件是接线审计与实施合同，不是已通过的代码或真实写盘回执。正式测试未执行，不得把历史 R2 组件 PASS 迁移成 V0.2 PASS。

## 1. 原始用户目标

在官方 ChatGPT 的既有对话请求读取一个已存在、明确授权的 .txt 文件。由 OpenDesk Browser 扩展识别请求、进入可信审阅 UI，使用原 Native Messaging 与既有 Go Workspace 文件服务真实读取，将实际正文回填**原对话输入框**（仍由用户发送）；用户要求改动后审阅原文/新文并明确点击保存，Native 检查读取时的 SHA-256，保存后独立读回与实际磁盘核对。最后撤销工作区授权，确认新请求被拒绝。**不得声称网页模型直接获得官方 MCP 工具。**

第一阶段严格排除：MCP Tunnel、任意 Shell、文件删除、任意目录遍历、创建新文件、程序运行、多文件编辑、未经确认的发送。

## 2. 读到的真实源代码与工作边界

Browser：shopable-ai/opendesk-browser（默认 main）。
Native：shopable-ai/opendesk（默认 master）。
2026-11-02 只读核查时 Native master：9d79d3be48536adfac9304f15c4c31651ee3921a；Browser main 在核查期间有其他提交移动，不能将开始时的 HEAD 当最终写入基线。

已实现的受控构件：

1. Browser src/native-agent/file-workspace-service.js：opendesk.local-files.v1、既有 Native Port、会话/权限/超时/写入结果未知保护；不暴露给不可信网页。
2. Browser src/native-agent/service-worker.js：只允许严格验证的 native-agent/workspace.html 与受信任侧栏/选项调用受限能力；普通 content script 无文件 RPC。
3. Browser src/native-agent/workspace-chat-request.js：opendesk.workspace.request.v1 的 requestId、bindingId、workspaceId、operation、path；result.v1 和下一请求生成。
4. Browser src/native-agent/workspace-chat-edit-ui.js：prepareFileRequest → fillContext → readChatGPT → handleRequest → fillPacket；提案 review/adopt/saved 与读写上下文绑定。
5. Browser src/native-agent/workspace-chatgpt.js：在 Chrome ISOLATED world 核对 tabId/documentId/URL/turnKey/answerKey；向空输入框插入、独立读回，不自动发送。
6. Browser src/native-agent/workspace.js：文件工作区与真实 Native 文件读取、编辑草稿、files.write(expectedSha256)、保存 ACK 后再次 files.read 校验。
7. Native internal/browserbridge/files_service_unix.go：真实受限工作区读写、校验 SHA-256、路径/用户/授权/租约及冲突、保存后回执；原 Go owner 不应搬迁。
8. Browser src/native-agent/chatgpt-fixed-bridge-page.js、chatgpt-fixed-bridge-host.js、src/sw.js：另有正式 ChatGPT 浏览器任务 Bridge，不等于文件 Bridge。

历史事实：docs/framework/workstreams/webcodex-chat-edit-r2.md 与 OpenDesk docs/integrations/browser/webcodex-local-files-demo-r1.zh-CN.md 明示 R2 是从可信工作区开始的手动网页请求循环。历史 Mac 上同一 ChatGPT 对话随机标记→两轮写入仍 NOT_TESTED。

## 3. 当前最小缺口（不是文件服务缺失）

**GAP-1 / 最高优先级：从 ChatGPT 原网页到现有可信文件工作区的单次意图交接。**

已有入口是先打开 Workspace、选择对话、生成带可信 nonce 的请求，再在 ChatGPT 网页等模型回显。当前没有确认一个在官方 ChatGPT 网页直接识别文件请求、可用可信 UI 处理并沿原有 WebCodex 文件链运行的正式入口。现有固定任务 Bridge 解析的是浏览器任务，不可直接把 opendesk.task.intent.v1 改成 Native 文件指令。

可信 request.v1 含 requestId、bindingId、workspaceId，必须先由扩展工作区生成。**不允许由普通网页提供这些字段就获得权限。** 引导用户从 ChatGPT 网页发起时，应只接收“希望读取的相对 .txt 路径 / 用户可见意图”作为不可信提示；打开可信 UI 后，由用户明确选择当前 Native 授权的 Workspace + 具体文件，并由原 createFileRequestContext 生成真实 request.v1 身份。不可沿用来自页面的旧 nonce，也不可发明网页可调用的 files.read RPC。

**GAP-2：可信 UI 的明确披露同意。** 在读取真实正文并准备放入 ChatGPT 原对话前，必须清楚显示目标文件、Workspace、相对路径、读取/共享范围，要求用户确认；不能将“我请求读取”暗中等同于允许向远程 AI 发送整份文件。现有回填只写入输入框、由用户发送的保护必须保留。对过大内容、草稿占用、目标不一致、对话切换需要拒绝而不是自动改投其他对话。

**GAP-3：单次生命周期的可验收证据。** 文件协议本身和历史组件测试不能替代 macOS 正式 Chrome + Native 的真实随机标记、回填、修改、读回、撤权证据。

## 4. 交唯一代码 Owner 的最小集成要求

先在用户 Mac 本地核对两仓库 AGENTS.md、实际 HEAD、git status --short、目标文件 git diff、活动 Codex 写入 owner。**如 src/native-agent/ 或 Native 文件 owner 有重叠，禁止跨 owner 修改；只交接接口和差异，不另开分支、worktree 或第二服务。**

建议最小技术分工（文件名与最终接口必须按最新源码核实，以下是目标合同而不是已存在的 API）：

- ChatGPT 网页第一方识别/入口：只产生无权限文件意图，携带真正的 Chrome sender tabId、documentId、URL 与一次性领取标识；不可从 payload 采信来源身份或 Native session。
- 背景交接：只接受 https://chatgpt.com 受控主框架的源身份，单次短期领用，入口打开原 native-agent/workspace.html；**不新增通用文件 RPC**，不赋予页面直接查询 Workspace 的能力。
- 可信 Workspace：重新枚举 live workspaces.list、由用户选定精确 .txt 文件与权限，再绑定同一个 ChatGPT 会话，利用原 request.v1 与 workspace.js 的 requestFile/readFile；显式审阅后才能将实际结果 fill 到原输入框，仍由用户发送。
- 修改：继续用原 edit.v1 提案审阅/采用草稿/明确保存。文件基线 SHA-256 只取真实 read，不信任模型提供的 SHA；save 后二次独立 readback 才可生成成功回执。
- 不改 projects/webflow/、Controller/RunHost、cmd/opendesk-mcp/、Tunnel harness、Go 文件执行器主体，不复制 AI Send Queue 发送队列。
- 如果需要触及 src/sw.js、src/native-agent/service-worker.js、workspace.js、workspace-chat-edit-ui.js、chatgpt-fixed-bridge* 等共享 owner 文件，必须由唯一 owner 在阅读当前 diff 后串行集成；不要由两个并行会话同时写。

**协议待审点**：当前 parseFileRequest 会核对 requestId/bindingId/workspaceId，但不要求请求的 operation/path 等于最初准备的值。针对本轮“单个、具体授权的 .txt 文件”，必须在受信任 UI 锁定并审阅最终 operation/path，或者由唯一 owner 调整本场景的匹配策略；绝不能让模型未经新审阅而扩大文件选择。

## 5. 完成判据与必做负例

P0 一条真实单文件操作链（Mac + 已安装正式 Native 与开发版 Browser）：

A. 在独立临时授权目录中创建已存在 .txt 文件，其随机内容在模型读取前未知。记录原字节数、SHA 和本机文件路径（证据存于本机 .runtime/，不要向 ChatGPT 发送绝对私人路径）。
B. 使用原可信 CLI 授予该目录临时或显式 read-write 许可，记录实际 workspaceId 和 Native session/lease 状态（不得将秘密写进证据）。
C. 在一个**已建立的 chatgpt.com/c/** 对话发出文件读取意图；扩展发现，但不直接在网页代码里调用 Native。
D. 可信 UI 核对工作区、相对文件与共享内容；用户明确批准；Go Native 真读，得到未知随机标记。
E. 仅将真实结果回填绑定的原 ChatGPT 输入框，独立确认不是其他对话；用户检查并发送。
F. ChatGPT 提供 edit.v1 完整新正文；可信 UI 显示前后内容、供用户审批。明确 Save 时用原 SHA 写入。
G. 再用独立本机命令读取真实磁盘，逐字节确认实际新正文、bytes 与 SHA；不是仅看网页回执或 Node 内存模拟。
H. revoke 授权后再次发起读取，Native 必须拒绝。

负例单独记录：旧/伪造 nonce、网页注入同名代码块、错误标签、其他 ChatGPT 对话、刷新/SPA 切换、撤权/lease 过期、只读 Workspace、超出 32 KiB、符号链接或越界路径、文件被外部修改、写入超时 OUTCOME_UNKNOWN（不重试）。

验证等级必须分别标注 NODE_PASS / CHROME_PASS / NATIVE_PASS / MAC_SAME_CHAT_PASS / NOT_TESTED；没有现场证据绝不可上调。

## 6. 本次远程审计的真实交付与限制

- 已读取上述 Browser/Go 源码、历史 R1/R2 文档、两个仓库 AGENTS/默认分支，确认现有文件引擎不是首要缺口。
- 当前执行环境**不能访问用户 Mac 的 /Users/shopme/... 目录**，不能取得其 git status --short、未提交 diff、Chrome Profile 或已安装 Native 实例。
- 浏览器连接不可用；不得声称实际读取了本机文件、修改磁盘、Chrome 页面已加载，或任何 A–H 已通过。
- 本次只创建此独立审计/交接文档，不触及共享生产代码、Web Flow、MCP Tunnel，也不创建并行 Native Host 或授权层。
- 下一步唯一核心动作：由能够读取用户本机状态的唯一 src/native-agent/ owner，**先确认无 owner 冲突，然后实现 GAP-1 + GAP-2 最小接线，紧接着在 Mac 做上述 A–H 真机验收**。既有文件读写服务和 R2 不要重写。

## 7. 专家评估的口径

架构复用、权限安全、用户体验、跨项目一致性、最小增量可维护性、真实验收可验证性各 100 分，综合按六项算术平均；目标 >=95，但本次“实际功能完成度”没有资格获得 95+ 或 PASS，因为 GAP-1/GAP-2 尚未实施、真机未测。评价实施方案与评价运行实证必须分开。
