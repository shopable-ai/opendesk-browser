# Shared AI Conversation R2.1 · 并行写入和执行记录（2026-10-23）

**负责人：** 当前 R2.1 AI Chat 架构实施对话（与其他 Agent 的源码修改相互独立，未申请排他性全仓库写入）。

**最初核对分支：** main；用户提供的旧候选 fc4e623、079f25d；开始时读取 main@9e2835a5ee9e5d84f8abf1b78681e7f51814dd1c；提交前须重新核对最新 main 及全部已有文件 blob SHA。

## 声明的最小文件范围

- 新建 src/ui/ai/provider-runtime.js。
- 新建 src/ui/conversation/provider-consumer.js、bookmark-instructions.js、my-task-instructions.js。
- 修改 src/ui/workflow/local-codex.js、workflow-view.js、tool-shell.js、sidebar-tools.js。
- 新建 tests/environment/shared-ai-provider-runtime-r21.test.mjs。
- 新建 docs/architecture/browser-framework/shared-ai-conversation-r2.zh-CN.md。
- 在 browser-framework/README.md、react-ui-shared-components-r33.zh-CN.md、workflow-ai-provider-routing-r2.zh-CN.md 增加权威入口与历史语义提醒。
- 本文件为本轮唯一协作记录。上述以外源码、Native Host、Worker、业务 Model/Service、React Root、Prompt iframe 不修改。

**公共合同负责人：** 本轮仅管理 ToolShell → 共享 Runtime → Consumer Lease 的内部新增合同；原 Host/Authority/SDK/Native 协议不变；createWorkflowProviderFacade 保留旧入口。原 Provider 配置保持 Workflow 设置 UI + 内存密钥，不扩存储。

**资源：** 不使用 Mac watcher、dist/development、Chrome Profile、Native Port、真实远端 Provider；不占用其他 Agent 的测试资源，不写 global ledger，不用 Worktree/新分支/PR。

## 当前实读与分级验证

- 静态源码：R2.0 遗留 WorkflowView 同时拥有 workflow/其他业务三 Planner；书签、Prompt 曾共用 conversationPlanner，My Task 使用 taskConversationPlanner；旧 local-codex dispose 的无 sessionId Native close 会影响整个 Host owner。
- 结构性方案：ToolShell 唯一 Runtime；正式业务 Adapter 独立 acquire 并在安装实例退出时 release；WorkflowView 仅拥有自身 Workflow Lease；prompt-edit 单独 thread；无 sessionId 关闭改为仅等待精确 late-open close。
- **VERIFIED（限定性）：** 通过独立 V8 静态 JavaScript 语法解析（忽略 ESM import/export 包装）以及 Runtime 源码的隔离烟雾实验（三个独立 mock Planner，关闭其中一个不影响其他）。不意味着运行 Node tests。
- **NOT_TESTED：** Node --test 项目环境、WXT、原生 Chrome、Native Codex、正式安装/升级、长时间错误恢复；提交后须在绑定具体 SHA 的环境执行并保留原始证据。
- **生产状态：** SOURCE_IMPLEMENTED 待正式 main 提交后确认；本记录不声明产品 PASS。

## 风险、剩余验证和接续点

1. 一台 Sidebar Host 同时最多 4 个 Native 活动 sessions；业务并行超过额度必须由既有 Native 返回 E_AI_LIMIT，不可跨 Lease 复用线程。
2. Workflow Provider 设置 UI 还在 Workflow 页；Runtime 独立于 DOM，但统一配置视图和会话状态归 R2.2。
3. 真实 Chrome Provider permission gesture、Prompt 正文外发审阅、ETag、业务读回、My Task/Workflow RunHost Stop/UNKNOWN 等，须在新候选做定向验证；尚无本轮 Native 真机证据。
4. R2.2 首先落中立 Conversation Session 和共享 Chat Frame；不要在 R2.1 跨范围改业务存储或第二 Provider。
