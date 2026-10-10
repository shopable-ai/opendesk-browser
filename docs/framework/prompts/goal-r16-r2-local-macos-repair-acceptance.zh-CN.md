# GOAL：OpenDesk Browser R16 R2 —— 本机 Mac 真实 Codex、Go Native、Chrome 工作流修复与最终验收

## 目标（直接执行，不重新规划）

你是 macOS、Chrome MV3/WXT、OpenDesk Go Native Messaging、Codex CLI/App Server、AI Agent、WorkflowCompiler/RunHost/Controller、测试、安全和反方审计的联合工程负责人。

**直接在我当前 Mac 的真实仓库实施、测试和修复，直至具备可信闭环证据或明确存在不可克服的外部阻塞。不要只写方案、只运行 Mock、反复请求已经给出的信息，也不要为修复测试而绕开安全校验。**

仓库：

- Browser：https://github.com/shopable-ai/opendesk-browser，仅使用现有 `main`。
- OpenDesk：https://github.com/shopable-ai/opendesk，仅使用实际主分支，当前为 `master`。
- 本机目录以实际存在的仓库为准，优先检查 `/Users/shopme/Documents/workspace/opendesk-browser` 与 `/Users/shopme/Documents/workspace/opendesk`，不存在则搜索已有工作空间而非擅自覆盖或另建重复 checkout。

**禁止**创建新分支/worktree、强推、reset --hard、git clean、覆盖其他 Agent 的未提交文件、干扰正在使用的 Chrome/CFT profile、Native socket、dist 或端口。只在确认主分支和当前文件版本后做最小改动；与其他并行任务冲突时保留双方修改，不能将旧版整个文件覆盖新版。除非确有新缺口，**不重新开发** R15 Side Panel、WorkflowDefinition、WorkflowCompiler、RunHost、Task v1，也不实现 Windows、跨站 Task v2、R6 多机配对或完整 Node 删除/迁移。

## 先读取并核对现状

Browser 阅读：
- `AGENTS.md`
- `docs/framework/testing-guide.md`
- `docs/framework/workstreams/r16-local-codex-20261010.md`
- `docs/framework/workstreams/r16-local-codex-r2-20261010.md`
- `docs/architecture/browser-framework/workflow-ai-provider-routing-r16.zh-CN.md`
- `docs/product/sidebar-ai-workflow-ux-r15.2.zh-CN.md`
- `docs/framework/prompts/goal-r16-local-macos-acceptance.zh-CN.md`

OpenDesk 阅读：
- `AGENTS.md`
- `docs/integrations/browser/workflow-codex-app-server-r16.zh-CN.md`
- `docs/integrations/browser/workflow-codex-app-server-r16-implementation.zh-CN.md`
- 当前 Native Host 的构建/安装、身份配对及命令说明

两仓分别执行 `git status --short`、`git branch --show-current`、`git rev-parse HEAD`、`git remote -v`，核对本地与远端已同步但不要以 pull 覆盖现有修改。记录 `uname -a`、CPU 架构、`node -v`、`go version`、`codex --version`、`command -v codex`、`command -v opendesk`；这些信息不能代替 Native 进程实际可见的 PATH。复核先前 R16 与其他并行工作流的可复用证据，以受影响输入的实际变化决定重测范围；不存在的证据标记 NOT_TESTED。

核对 GitHub Actions 最新结果。2026-10-10 本轮核查曾看到 Browser `script-editor.test.mjs:136` 仍断言旧的“本地项目服务未连接”，而新版展示“本地程序来源未连接”；Go `TestR17HostConcurrentDirectoriesAndScopedResolver` 曾等待 `dev.state` 超时。这两处属于待复核的并行回归线索，不能因为历史失败就直接修改 R16，也不能为了绿灯伪造成功。先查当前 SHA 和具体原因；若影响本轮 Native/Sidebar/打包且无其他 Owner 正在修，按最小范围修复。文案变化符合已确认 UX 时更新旧测试，不恢复错误的旧文案；Go 真实超时先分析竞态/生命周期/等待条件。

## Gate A：本机 Codex 真实能力

1. 验证 OpenDesk Go Native Host 用户的实际 Codex 路径、CLI 版本、官方 ChatGPT 登录状态，及 `opendesk browser ai doctor` 的真实结果；区分 Native 已连接、CLI 已安装、已登录、App Server 受限协议可用、实际模型推理成功五种独立证据。
2. 检查 `codex app-server` 的 stdio initialize / account / thread / turn / event / cancel，以及本机账号联网状态。不得要求用户填写 OpenAI API Key，不得读取/打印/拷贝 `~/.codex` 授权正文、Token、Cookie 或个人对话。
3. 代码原先只审计并允许 `codex-cli 0.159.2`。若本机版本不同而返回 `CODEX_UNSUPPORTED`，先核对安装的实际 JSON Schema、官方协议与隔离语义；只有有对应源码、安全边界和真实进程测试证据，才能扩展版本兼容。绝不能为了通过测试删除版本白名单、空 environments、MCP 禁用、沙箱或权限限制；无法审计则标记 BLOCKED 并保留安全拒绝。
4. 如果 `environments.toml` 等本机配置阻止隔离启动，不修改或隐藏用户个人配置来通过测试。
5. 仅使用合成公开任务进行实际模型推理。记录真实 App Server sessionId/threadId/turnId、事件连续性、完成/中断终态；就绪 probe 不算推理成功。冷恢复不满足安全条件时 `resumeSupported:false`，不强行测试为 PASS。

## Gate B：Go / Browser 组件与构建

先执行受影响测试及静态校验。命令可根据仓库现有脚本与测试资料作必要准确调整，不能跳过失败而把总结果写 PASS。

Browser 根目录：

```bash
npm ci
node --test --test-reporter=tap tests/environment/workflow-r15.test.mjs tests/environment/workflow-ui-states.test.mjs tests/environment/workflow-local-codex.test.mjs tests/environment/workflow-ai-transport.test.mjs tests/environment/workflow-ai-observation.test.mjs
node --test --test-reporter=tap tests/environment/opendesk-native-provider.test.mjs tests/environment/native-agent-package.test.mjs tests/environment/script-editor.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
```

OpenDesk 根目录：

```bash
go test -count=1 ./internal/browserai ./internal/browserbridge ./internal/browsercli
go test -race -count=1 ./internal/browserai ./internal/browserbridge ./internal/browsercli
go vet ./internal/browserai ./internal/browserbridge ./internal/browsercli
```

在确认用户本机真实 Codex 官方登录、网络与模型额度可使用后，明确执行 opt-in：

```bash
OPENDESK_TEST_REAL_CODEX=1 go test -count=1 -v ./internal/browserai -run '^TestInstalledCodexProbe$'
OPENDESK_TEST_REAL_CODEX=1 OPENDESK_TEST_REAL_CODEX_TURNS=1 go test -count=1 -v ./internal/browserai -run '^TestInstalledCodex(ContinuousSession|Cancellation|AmbientMCPIsNotStarted)$'
```

对 `TestInstalledCodexWorkflowProposal` 按既有实施文档先生成纯合成 `workflow-input.json`，设置 `OPENDESK_TEST_REAL_CODEX_WORKFLOW=1` 再运行。模型可能联网，保留用户同意，不向模型发送工作目录、真实敏感网页或本机密钥。真实 CLI 测试和模拟 agent 组件结果分开统计。

构建时检查实际 SW/Side Panel 包体预算、manifest、CSP、nativeMessaging permission、host permission、生产和开发两包准确加载及文件 hash。完整 `npm test` 如遇其它并行任务失败，留下原始失败并完成影响分类，不静默略过。

## Gate C：真实 macOS OpenDesk App 与 Native Chrome

在 OpenDesk 根目录使用官方 `./scripts/build_macos_app.sh`，核对实际生成的 `dist/OpenDesk.app/Contents/MacOS/opendesk`。根据仓库既有安装文档完成固定路径安装与 CLI 注册；若尚未确认用户已安装的 App owner 或签名，不要未经确认覆盖旧 App 或改变系统信任设置。核对 `command -v opendesk`、二进制 SHA-256、实际 Native Messaging Host manifest 路径、extensionId 与当前 Go 二进制一致。

已配对的安装使用 `opendesk browser setup`、`opendesk browser doctor`、`opendesk browser ai doctor`；新建专属 CFT profile 且尚无已知 extensionId 时才使用 `opendesk browser setup --extension-id <实际ID> --browser cft --user-data-dir <实际CFT目录>`。不能乱填 ID、复用其他 Agent 的 profile、静默换 Host 或私有 Socket。实际 Chrome Native welcome 必须携带 `workflowAiVersion:1`；旧十个 Browser RPC、`bridge.status` 和 Node/Go 迁移 fence 不回归。旧 Node Host 无 AI 协议时，应明确拒绝而不能转发未知 AI 帧。Native 连接成功不等于 Codex 已就绪。

## Gate D：真实 Chrome Side Panel → 模型 → 页面

Browser 根目录使用正式 Demo：

```bash
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

目标为 `http://127.0.0.1:43111/demo-form.html`。用专属真实 Chrome/CFT profile 加载本次实际 `dist/development`，确认扩展 ID、包 SHA、Service Worker、Side Panel 实际文件和 Native 二进制归属。只通过真实界面中的受信操作、原 Controller/RunHost 和用户明确授权操作。禁止直接 DOM 赋值、伪造点击/Native 回执、或用 CDP/桌面鼠标绕开 Browser Authority 执行业务动作。

以真实用户交互执行：

1. 打开「工作流」→ 齿轮 → 选择本机 Codex → 连接并刷新状态。需看到真实 Host、Codex 诊断；缺失时给明确恢复，不显示假 READY。
2. 本轮同意发送后，输入：“为当前示例表单创建一个可重复使用的观察工作流，暂不填写或提交内容。”等待真实 `turn/completed`、非空最终消息及 Workflow Schema 合法建议。
3. 同一 Sidebar 再次输入：“继续刚才的计划，将标题改为 R16 示例表单检查，保留观察步骤。”核对同一 threadId、不同 turnId、事件序号连续和本次同意，不能自动上传到 HTTPS 备用 Provider。
4. 允许本轮网页观察后，让模型请求 `browser.observe`；必须出现准确审批卡，用户真实同意并具有 Chrome 对精确网站权限，执行固定 `page.observe`。核对前后 window/tab/frame/document/url/origin、RunHost runId、Controller Durable Result 的 resultId 和 revision.sourceHash，以及发送给模型的 12KiB 有界投影。不得发送 Cookies、输入框私密值、完整 URL/query 或无关历史。
5. 拒绝观察一次，验证无 observe Run；变更标签页、导航文档或撤权时必须拦截旧观察与回传。
6. 用户真实点击「采用这份计划」；AI 产物未采用前不得修改草稿、运行 JS 或保存。采用后检查语义步骤，必要时增加只作用于公开 Demo 表单的安全填入/读取步骤（不提交真实表单数据）。
7. 通过原 WorkflowCompiler 获取确定性 JS/sourceHash，点击原 Run，确认站点和动作许可；核对实际 DOM 行为、RunHost start/settlement、Controller Durable Result、runId/resultId/revision/sourceHash、Stop ownership 和资源释放。
8. 真正保存为 Workflow Revision，重读原持久化源码与 WorkflowDefinition，确认同一 sourceHash；不能把 UI 上写着“已保存”当作落盘成功。
9. 关闭 Codex AI 会话，选择手动/不使用 AI，并关闭该扩展 Native AI 连接；重新载入保存版本，在保留浏览器必要网站授权的情况下独立运行两次。每次必须取得不同 runId/resultId，且都使用完全相同冻结 sourceHash/revision，网络侧没有额外 Codex 模型请求。若缺一项则标 FAIL/NOT_TESTED，不以 mock 替代。

若真实模型未请求 `browser.observe`，不要伪造模型 tool call；使用可复验的合成提示再试有限次数，仍未触发记 NOT_TESTED，并独立验证 Browser 的用户批准流程。

## Gate E：失败矩阵与安全反方验收

逐项检查：Native/CLI 未安装或未登录的隔离 fixture、未审版本、协议不兼容、网络/限额、会话关闭或 Stop、取消 ACK 与真实 interrupted terminal 区分、events cursor 缺口、requestId 重放、跨窗口窃取 session、断线重连、owner/generation 变化、网站权限撤销、文档导航、跨 origin Task、未授权 shell/file/MCP/外网工具调用、60KiB Native 帧和 12KiB 观察预算、独立控制通道、未确认网页副作用不得重试。禁止删除用户个人 Codex 凭据来制造未登录分支；这些可在独立合成 fixture 测试。

保留原 HTTPS Provider、手动编辑、已保存离线执行、Node 高级 ESM/npm/MCP 路线，不触碰 R17 多目录与文件工作区的既有权限边界。UI 检查 Side Panel 320/360/420/520px 与 200% 缩放、键盘焦点、aria label、状态/错误与 Stop/Run/Save 可达性；截图必须是当前真实加载的同候选，不拿 HTML prototype 冒充产品截图。

## Gate F：修复、复验与提交

发现失败立即精确定位 owner 与层次（Browser、Go、CLI、Chrome 权限、网页、环境、并行任务）。修改前先重读受影响的最新远端文件与本地 diff。每次只做必要定向修复和关联测试；修改安全协议必须补正例、负例、取消/撤权回归，不允许仅改变断言让错误代码通过。受影响源码收敛后才冻结候选并完成同 SHA 的构建和真实验收。保留未修改历史 evidence，不把 GitHub runner、模拟 Chrome、旧 packageHash 的 PASS 当 Mac 现场验证。

测试日志/截图/敏感诊断以脱敏形式放 `.runtime/tests/r16-r2-macos/`（不进 Git）；正式人类可读总结与可提交的最小证据索引放 `docs/framework/workstreams/` 的专属文件，标明每条 PASS 对应的命令、退出码、操作系统、Chrome/Go/Codex 版本、commit SHA、二进制/包 SHA、真实 runId/resultId/revision/sourceHash。Mac 不具备桌面访问或系统授权时标 `NOT_TESTED`，不要用 mock 宣称真实能力。

最终分别独立评分：Provider 就绪、Agent 多轮、网页工具授权、隐私、沙箱安全、取消/未知效果、Compiler/RunHost、保存复跑、Node/Go 兼容、Side Panel UX、真实 Chrome。以有证据的每项 ≥95 为质量目标；关键安全失败直接 NOT_ACCEPTED；不强制凑分。只提交对应主分支（Browser main / OpenDesk master），提交前重新核对最新远端、并行修改、`git diff --check`；不强推/重置/另建分支。给出双方最终 commit SHA、推送/验证状态和明确剩余问题。

## 必须输出的最终验收摘要

表格逐行列出：Gate A-F，`PASS / FAIL / BLOCKED / NOT_TESTED`、对应真实证据、是否修复、剩余问题；另列真实启动路径、插件 ID/加载目录、Codex 版本登录类型但不得打印凭据、Go 安装及 manifest 路径、API/本机连接状态、运行与保存的精确身份、旧 RPC 是否回归、真正关闭 AI 后复跑两次是否通过。没有到达真实 `Side Panel → Native Go → Codex App Server → 用户授权 → RunHost → 持久保存 → 断开 AI 复跑` 的整个闭环，必须明确写“R16 R2 尚未完成最终验收”。
