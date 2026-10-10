# GOAL：WebCodex R3 × R17.1 —— browser dev 临时默认读写、同一 ChatGPT 对话按需读文件、Workspace 多目录及 Mac 真机闭环

> **实施前历史任务快照**：以下保留 2026-10-10 原 GOAL。当前 R17.1/结构化请求实现、源码提交与实测范围已进入本轮交付；接续本机修复和验收请执行 [与本次源码提交绑定的 Mac 完整任务](goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md)。下文“待实施”不是当前状态；真实 Mac P0 和两轮闭环仍未验收。

> 这是新对话**独立可执行任务**，不得只完成 UI/CLI 默认权限就收工。  
> 决策来源：[Browser 架构与可行性决策](../../architecture/browser-framework/webcodex-browser-dev-chat-bridge-r3-decisions.zh-CN.md)、[OpenDesk Go 读写租约契约](https://github.com/shopable-ai/opendesk/blob/master/docs/integrations/browser/browser-dev-session-rw-r17-1-decisions.zh-CN.md)。  
> 日期：2026-10-10。决策已冻结，**新增代码与 Mac 真机验收均不能仅凭此文档视为已完成**。

## 1. 任务对象、明确边界

- Browser：https://github.com/shopable-ai/opendesk-browser；仅 `main` 修改、提交与按权限集成。
- OpenDesk：https://github.com/shopable-ai/opendesk；先核对实际默认主分支（当前 `master`），仅在实际主分支修改。
- macOS 优先；已有 OpenDesk Go，健康安装直接复用。当前仅单机、一套 Chrome/配对 Go，允许多个本地目录/CLI 进程并行。
- 不创建 Git 分支或 Worktree，不强推、不破坏性 reset/clean、不覆盖并行 Agent 的未提交修改或抢占运行中的 Native Socket、Chrome Profile、固定端口、构建产物。先核对 owner 和 `git status`、`HEAD`、`origin`，只有可安全集成时才写入。不要用历史文件全量覆盖当前源码。
- 只完成此工作流所需缺口，不重建 Service Worker、Native Host、Controller、Page SDK、RunHost、R16 Codex App Server、已有 Workspace、文件服务或 Sidebar 框架。

**整体完成目标**：

用户在目录中仅执行 `opendesk browser dev` / `opendesk browser` → 该目录以本 CLI 会话默认可读写的状态出现在**既有** Workspace/侧栏 → 用户把指定的已存在官方 ChatGPT 网页对话绑定此目录 → 模型提出读取相对文件的结构化请求 → 扩展核验并通过 Native Go 真实读取 → **结果回到同一个对话，被模型用到** → 模型产生对应修改提案 → 用户审阅、采用草稿、显式保存 → 扩展读回和 Mac 终端独立读回内容与 SHA-256 一致。再在同一对话完成第二轮修改，并检验多目录和故障场景。

以下均**不是**单独验收终点：默认目录可写、目录列表/侧栏好看、复制上下文、手工提前粘贴文件正文、模型生成未执行的 JSON、内存 Demo PASS、Go 模拟 Chrome、另开的 Codex/Work 对话或仅 CLI 组件测试。

## 2. 先完整读取已有真相，不重复开发

两仓 `AGENTS.md`，Browser：
- `docs/architecture/browser-framework/webcodex-browser-dev-chat-bridge-r3-decisions.zh-CN.md`（本轮最高优先级新增需求）
- `docs/framework/local-directory-cli-r17.zh-CN.md`
- `docs/framework/workstreams/local-directory-cli-r17.md`
- `docs/framework/prompts/goal-r17-local-macos-acceptance.zh-CN.md`
- `docs/architecture/browser-framework/webcodex-chat-edit-r2.zh-CN.md`
- `docs/framework/workstreams/webcodex-chat-edit-r2.md`
- `docs/framework/prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md`
- `docs/framework/testing-guide.md`

OpenDesk：
- `docs/integrations/browser/browser-dev-session-rw-r17-1-decisions.zh-CN.md`
- `docs/integrations/browser/local-directory-cli-r17.zh-CN.md`
- `docs/integrations/browser/webcodex-local-files-demo-r1.zh-CN.md`
- 实际需要 Native 重新安装时再读对应 Mac 安装/签名流程。

核对主要源码：
- Browser `native-agent/local-dev/{dev-cli,provider,resolver,session}.mjs`，`packages/opendesk-dev/`、`scripts/pack-opendesk-dev.mjs`；
- Browser `src/native-agent/{workspace,service-worker,file-workspace-service,workspace-chatgpt,workspace-ai-proposal,workspace-chat-edit-ui,source-label}.js` 与 `src/ui/local-project.js`；
- Go `internal/browsercli/{command,dev_unix}.go`、`internal/browserbridge/{host_unix,host_dev_multi_unix,dev_workspace_unix,files_service_unix,workspace_store_unix}.go`；
- 受影响的对应测试/Workstreams。

先用简短表格记录：**已经存在且可复用 / 已有但有问题 / 确实缺失 / 当前真机是否已测**。当前 R2 仍是文本提案模式，不是模型主动注册的 MCP tools；R17 新目录默认临时只读是旧代码，用户明确要求**改变为默认临时读写**。两件事都不要写反。

## 3. 必须先画清调用链和风险边界

以实际代码列出：
`opendesk browser dev` / Node CLI → Go `dev.attach` / 租约 → Native `workspaces.list`、`files.read` 等 → Workspace 目录选择器 → 当前 ChatGPT 对话身份 → 回答中的文本请求 → 用户触发的扩展适配器 → Go 实际 read → 结果回填同一对话 → 用户网页发送 → 修改提案 → 扩展审阅、采用草稿 → `files.write(expectedSha256)` → 扩展读回 → 终端读盘。

同时分别说明：
- `sourceId`（来源展示/定位）、`workspaceId`（文件目标）、`bindingId/providerEpoch`（运行源码）、CLI lease、`tabId/documentId/full URL`（对话）、文本协议 `requestId`、Native 传输 requestId；
- 哪个节点拥有实际写盘权限、哪一步仅做内存操作、何时需要用户手势；
- “扩展 Native 文件服务”“网页文本请求桥”“真正 MCP 工具”是三种能力。安装扩展后向网页注入 JS **不能**让 OpenAI 服务端模型自动获得 MCP 文件工具。
- 可行性不是 100% 结论：Native 路径有实装，网页 DOM 读取/回填与原对话消费仍需真实 P0。阻断须给出实测证据，不能凭猜测发明工具或绕过限制。

完成简图/表后**立即执行真实代码与最小验证**，不要陷入第二轮大架构选型。

## 4. P0：优先补通同一对话的“读取→返回结果”

先选一个不含秘密的专用测试目录，创建带随机标记的文本文件。**给 ChatGPT 的初始用户消息不能提前包含文件正文或标记。**

基于既有 R2 `inspectChatGPTEditsOnPage`/`readChatGPTEdit` 与 Go `files.read`，增量设计受限文本读取请求协议（新协议字段必须以现有代码实现及测试为准，不能虚构已上线的工具 API），至少携带：
- 版本、请求 ID、可信 Workspace 绑定引用、操作名、相对路径；
- 结果可对应请求 ID 与原对话身份；
- 仅允许明确列举的 list/read 操作，先不开放 Shell、删除或任意写入 RPC；
- 不能把模型给出的绝对路径、`workspaceId` 字符串或权限声明当作真实授权。

用户点击已有或复用的“处理当前回答”控件后：
1. 核验真实 ChatGPT 网站、具体对话、`tabId/documentId/full URL`、当前最新完整 assistant 消息的边界；忽略用户消息、旧回复、引用的协议文本、流式残缺内容及多个冲突请求。
2. 在可信扩展 Workspace 侧核验当前已绑定工作区与其 Native 实时 `access`；不向 ChatGPT 页、预览 iframe、普通 content script、USER_SCRIPT 开放任意 files RPC。
3. 调用 Go Native `files.read` 获取真实正文，显示用户可核对的读取结果；**禁止静默发送整个目录、隐藏文件、凭据或文件绝对路径**。
4. 再核验目标页面与对话未切换，安全地将实际读取结果回填到**原对话的输入框**；已有用户输入时不得覆盖。由用户确认并在官方网页发送。
5. 模型后续回答必须能够准确引用**此前未提供的随机标记**，保留真实浏览器证据。

精确区分状态：请求已识别 ≠ Native 已读取 ≠ 已回填输入框 ≠ 真实网页已发送 ≠ 模型已消费。只有五项均有证据，P0 才算通过。当前 R2 “生成文件上下文供用户复制”不能代替本 P0。

不得读取会话 cookie、调用未公开 ChatGPT 内部接口、伪造网页用户手势或以 `input.value` / synthetic events 代替有效的实际输入。对网页 DOM 兼容问题做定向修复。若在受支持环境中确认自动回填无法稳定实现，允许手动复制/粘贴**单列降级结果**，但整体 P0 保持未通过；另行评估正式 MCP adapter/插件/隧道时必须说明账号/模式约束及可能不再是原普通对话，不能偷偷改为新 Codex 线程后冒充通过。

## 5. R17.1：新目录临时默认可读写

统一：
- `opendesk browser` = `opendesk browser dev .`；
- `opendesk browser dev [dir]`；
- `opendesk-dev [dir]`（同一来源机制）。

**新目录不执行 workspace add 即可 Native read/write**，其中“默认读写”只来自本地认证 CLI 指定的根目录、受本会话租约限制，不等于长期授权或网页自动授权。

保留既有长期 `read-write`，尊重已有明确长期 `read-only`；新增显式 `--read-only` 模式（当前尚未实现，不得照原样假装命令已支持）。若与既有授权/在线租约模式冲突，明确返回真正有效的权限，不能建立隐藏的影子来源来绕过只读。

Node CLI 和 Go `dev.attach` 建立可核验的权限传递/版本协商：**旧客户端不携带新 access 时仍只读**；新旧组件错配时明确诊断。Go 最终实时判权；`sourceId`/显示名称不是凭据。沿用 owner/device/inode、真实物理路径、symlink 和 `..` 防穿越、允许扩展名、32 KiB 文件、60 KiB Native 帧、`os.Root` 约束、SHA 读写预条件、未知效果不自动重试。绝不扩大至父目录、Git 根、`HOME`、Shell 或整个磁盘。

租约需满足：同名不同路径可并行；同目录重复启动不能夺租约；关闭 A 不能撤销 B、长期授权或另一个 Provider；Host 重启/离线/迟到请求不能恢复失效权限；打开目录不会自动运行网页 JS 或项目 `npm scripts`。现有 Controller/RunHost 与目录写权限相互独立。

## 6. 复用并补齐 Workspace / Sidebar 身份和界面

不得创建第二套编辑器、项目数据库或无关视觉重构。复用 `native-agent/workspace.html`、选择器、源码编辑、静态预览、`source-label`、`src/ui/local-project.js` 与真实文件服务。

在原工作区选择区域清晰呈现：
- 目录名称和同名区分、实际在线/离线；
- Native 返回的实时 read-write/read-only；
- 当前选中相对路径和文件状态；
- 当前绑定的官方 ChatGPT 对话，以及读取/回填/审阅/保存反馈。

从 Workspace 选目录 A → 点击在侧栏打开，侧栏必须保留 A；目前代码里侧栏入口是固定 Workspace URL，先核对是否未传当前身份，再按当前 API 修复。多目录场景禁止依赖全局最近选择。Workspace 历史名称仅用于展示，不能复活失效写权限。刷新、SPA 切换、迟到回包不能覆盖其他工作区未保存草稿。

新增/优化“复制工作区上下文”可服务用户编写使用提示词：提供所选目录名称、sourceId/workspaceId、相对文件、有效权限及**实际可用**的请求协议；可预览、可复制，不含凭据或未授权文件正文，不能因此宣称模型已注册 MCP。

## 7. 修改提案与保存继续沿用 R2

R2 单文件 `opendesk.workspace.edit.v1`、基准 `baseSha256`、`path`、`requestId`、严格 JSON 字符串格式、重复字段/超长文本拒绝等合同不变（如需演进，明确版本和兼容测试）。

收到建议只在扩展显示对照；“采用为草稿”不写盘，只有显式保存才调用 Native `files.write(expectedSha256)`。写后必须再读回；UI 回执为 `backend:"native-files"` 且 `readBackVerified:true`，并与**本轮** requestId / 文件 hash 绑定；若用户采用后手改，不得把改变后的内容假报成原 AI 提案。旧提案不重放，外部编辑冲突保留双方修改，连接断开/结果未知不能盲目重复保存。

这条单文件保存链**不自动执行**程序、Controller、页面操作或 Next/Vite 热更新，不替代 R16 Codex 工作流，也不授权任意文件创建以外的新高危操作。

## 8. Mac 真实验收：顺序与证据

首先核验实际 Mac、Go 可执行文件与 Native manifest wrapper、真实扩展 ID/加载 dist/Chrome Profile、Node ≥22.12、全局 npm CLI tarball/登记哈希、`localDevMultiVersion`/`localFilesVersion` 能力与两仓最新源码。Git HEAD 不等于安装版。健康安装复用；需要修复时按原构建/安装规则做最小更新；不能接管别人 Socket 或浏览器。

准备 A/B 两个用户拥有、带空格与中文路径、相同 basename 但不同 inode 的测试目录，各有测试文本。用户现有工作项目只读旁观，除专用演示目录外不做测试写入。

按以下门槛提供证据：

1. **P0 同对话真实读取**：随机标记并未预先发送；模型发起读取请求、Go 执行、返回同一原对话、模型正确使用读取结果。分别报告输入框自动回填、实际发送、手动导入情况。
2. **P1 无额外授权新目录读写**：A/B 分别运行 `browser dev` 和 `opendesk-dev`，在现有 Workspace 打开并实际写盘，独立读取正文与 SHA。核对同名不串源、侧栏保留选择。
3. **P2 临时授权与兼容**：旧客户端仍只读、显式只读、长期只读、长期读写、重复启动、CLI A 退出 B 不受影响、断线与 Host 重启按 owner 清理。
4. **P3 同一既有 ChatGPT 对话两轮修改**：各使用本轮唯一请求 ID 与最新文件基准；真实模型提案 → 用户审阅 → 显式保存 → 扩展读回 → 终端独立文件 SHA 和正文。第二轮不得复用第一轮成功回执。
5. **P4 安全故障**：外部编辑冲突、旧请求/提案重放、撤权、路径穿越、同名 B 伪造来源、迟到响应、SPA 换会话、网页流式回复、已有输入框草稿、只读后端拒绝、未知保存效果，必须符合保守拒绝规则。
6. **P5 代码/安装回归**：受影响的 Node/Go 定向测试，真实 npm tarball、生产构建及包校验；不得提高既有 SW 大小预算或取消校验来绕开其他任务问题。构建输入和 Chrome 真正加载身份一致。

每项单列 `PASS/FAIL/NOT_TESTED` 及 SHA/证据，不把内存 Demo/DOM 模型/模拟 Native 帧升级为 `MAC_NATIVE_CHATGPT_PASS`。真实用户 Mac 证据缺失时不能宣布全闭环通过、100% 可行或“专家评分 95+”。设计评价与验收评价单独给出。

## 9. 实施与同步文档

需要源码修改时先定位实际 consumer 和缺口，在对应 owner 层最小改动，保留其他 Agent 已实现的 R17 多目录、原 R2、R16 和 UI 风格。受影响 tests 定向跑；旧证据仅在输入版本和合同不变时复用。

只有新行为真正落地后，更新**现行** R17 使用指南、R17 Mac 验收 GOAL 中“新目录默认只读”与“先 workspace add”的过时说明；R2 Mac GOAL 中“browser dev 不可直接写入”的旧前置也按版本更新。旧历史证据与旧提交的表现照旧保留，不修改成新候选 PASS。

把正式决策、代码路径、验证结果追加到本工作流的独立文档/证据目录；不要改写其他 Agent 的原进度记录。两仓分别只在对应当前主分支按规则完成必要提交，推送前核对远端及冲突，禁止强推。不能修改环境时，完成可独立实施的源码/单测/文档并给**对应实际 SHA** 的本地 Codex 验收任务，不承诺后台交付。

## 10. 最终必须输出

用中文报告且区分**实际已做**与**仅计划**：
- 当前用户的最短实际可用命令、需要的安装/加载版本、实际可用的网页交互步骤；
- Browser/Go 最终提交 SHA、是否已提交/推送；
- 原官方对话 P0 的每个环节真实结果，具体失败在哪一层；
- A/B 多目录、默认读写、只读模式、租约、权限隔离的结果；
- 两轮修改前后完整文件及 SHA 核对，Native 回执和独立磁盘读回；
- 外部冲突、旧请求/提案、SPA 切换、断线/未知写入；
- 尚未实现的真正 MCP 工具注册/其他平台能力的边界；
- PASS/FAIL/NOT_TESTED、证据路径、残留阻断。

**不可改变的收口标准**：只完成“CLI 默认可写 + Workspace 列表 + 复制上下文”不是 WebCodex R3 完成；P0 模型请求到原对话结果回传不通时，要说明阻断与备用路线，不能以手工预先提供正文冒充真实按需读取。