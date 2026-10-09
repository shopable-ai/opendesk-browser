# GOAL：OpenDesk Browser R12 —— 本机 Mac Codex / MCP / Chrome 真正可用、失败修复与 main 收敛

> **执行环境：用户自己的 Mac 上的本地 Codex。** 这是 R2.2 已交付功能的**本机验收交接**，不是重新设计 P0–P3。网页版云会话不能直接访问 `/Users/...`，已有云端 CI PASS 不能冒充用户现场 PASS。

## 一、先理解要解决的需求

让 AI/Codex **直接编辑本地 JavaScript 多文件项目**，不需要每次压缩、构建/导出 JSON、上传、重新安装扩展；通过**同一个 MCP → Native → OpenDesk 扩展**在已授权的真实 Chrome 页面运行、查看结果、修复后显式再次执行。

不要开发第二套运行器、文件同步服务器、IDE 或新的 Sidebar 一级页签。Controller 负责浏览器自动化；Page USER_SCRIPT 负责注入网页 UI；两者共用目录绑定但保持不同的执行与停止合同。

**特别注意：** `python3 -m http.server` 只用于在端口 43111 临时提供静态 `demo-form.html` 测试网页；它不是项目编译器、产品服务或第三套程序。真实网站开发不需要 Python。不要为了消除 Python 命令而在产品中新增一套 HTTP 运行服务。

仓库：`shopable-ai/opendesk-browser`

Mac 工作目录：`/Users/shopme/Documents/workspace/opendesk-browser`（必须先检查确实存在）。默认中文。

## 二、只读核对已完成内容，再决定是否修改

首先阅读并严格遵守：

- `AGENTS.md`（包括并行 worktree/PR/main 集成规则）
- `docs/framework/local-development-quickstart.zh-CN.md`（一页说明）
- `docs/framework/local-development-r22.zh-CN.md`（正式权限、协议、操作细节）
- `docs/framework/local-development-r22-report.zh-CN.md`（已验证/未验证矩阵与原始证据）
- `.agents/skills/opendesk-program-publish/SKILL.md`
- `docs/framework/program-evidence-reuse.zh-CN.md`、`docs/framework/testing-guide.md`

当前已实现并合入 `main` 的基线：PR #37（Native/MCP/目录直连）、PR #42（受管 UI 安全刷新）、PR #44（真实证据和文档）。**执行时重新核对 `origin/main`、已关闭 PR 和当前工作树**，不要依据提示词中的历史 SHA 盲目重置代码。

先做：`pwd`、`git status --short`、`git fetch origin`、`git branch -avv`、`git log -1 --oneline`、`node --version`、`codex --version`。保护现有未提交修改；遇到其他 Agent 正在改相同模块、profile、dist 或端口，先避开共享资源。不要 `reset --hard`、`git clean`、强推、删除用户数据或覆盖旧证据。

## 三、第一阶段：本机实际接入

1. 确认 Node.js `>=22.12.0`、依赖与现有扩展版本；只有首次准备或依赖未安装时执行 `npm ci --ignore-scripts`。
2. 使用 `node native-agent/cli.mjs doctor` 判断真实 Host 与授权状态。检查 Chrome 扩展的实际 ID、Native Host 安装绑定的 `browser` / profile 与这个 ID 是否相同。
3. 扩展自身版本不包含 R2.2 功能时，按说明执行一次 `npm run build`，在 Chrome 加载 `dist/production`。此步骤与每次项目文件修改无关。
4. 没有 Native 安装时，在确认 Chrome 实际扩展 ID 后执行 `setup --extension-id ...`；旧版 Host 仅在停用连接、旧运行收尾后执行 `update --extension-id ...`，必要时携带真实 `--browser` / `--user-data-dir`。不允许猜扩展 ID、随意删除 socket 或使用日常 Chrome profile 做破坏性测试。
5. 核查 `codex mcp` 现有注册。只有尚未注册时，以指南中的 `codex mcp add opendesk-dev -- node .../native-agent/local-dev/mcp.mjs --allow-project ...` 配置两个示例目录。一个 Native Host 只保持一个 local source provider；不要开启第二个相同 MCP 会话来抢占。
6. 通过 Chrome 实际 UI 批准 Native、目标网站授权及 Page 所需「允许用户脚本」；不能直接篡改 Chrome 授权文件来假装成功。需要用户点击的真实权限步骤明确列出，不隐瞒阻塞。
7. `opendesk.dev.status` 必须证明 Native 已连接、Host 真实登记、当前目标和 `bindingId` 正确；`attach.connected` 或仅凭命令退出码不足以判定可执行。

## 四、第二阶段：真实 JavaScript 多文件闭环

**Controller：**使用 `examples/programs/local-controller`，标准网站为 `http://127.0.0.1:43111/demo-form.html`。手工演示可临时使用：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

这是测试网页服务，不负责读取 JS 或向扩展传代码。若端口已有他人会话，不能随意终止或改 origin 伪造验证；需要隔离资源并符合项目配置。让相应扩展窗口/Sidebar 保持真实活跃，核对网站权限。

- 先 `opendesk.dev.status`，拿到准确目录、Native、Host 和目标。
- 第一版 `opendesk.dev.run` → `opendesk.dev.result`；保存原 `requestId`、`runId`、`resultId`、`revision.sourceHash`、真实结果和资源收尾。
- 只改 `src/extract.js`，版本号和读取 `h1` 的逻辑发生实际变化。**不运行** `build:program`、不生成/上传 JSON 或重新加载扩展，第二次主动调用 `dev.run`（新 requestId）。
- 第二版必须来自新的真实文件与执行身份，返回预期 heading；旧 run/result 查询应仍保持原始内容。再验证执行期间修改源码不会修改已入场运行的冻结 revision。
- 运行中发生 `OUTCOME_UNKNOWN`、丢 ACK 或断线：用原 requestId 的 `admissionRequestId` / 原 runId **只读恢复**，不得自动重放原业务操作。

**Page UI：**使用 `examples/programs/local-page-ui`；在 USER_SCRIPT 世界核对真实按钮、Shadow DOM、图片、CSS 与目标页面原有表单。修改 `src/model.js` 和 `assets/ui.css` 后主动再次运行；核对旧实例安全退出、新代码真实挂载、原 `previewId` 和新 `previewId`、真实 hash 与 documentId。`dev.stop({previewId})` 只对受管 Page 进行 typed 资源清理；不能将预览虚构成 Controller `resultId`。旧清理失败时不得挂新 UI。

**Sidebar：**在已有「开发 → 本地项目连接」选择同一已授权项目，使用原 Run/Stop；切换回手工源码时草稿不丢失。关闭重开真正的 Sidebar 后再运行一次已修改代码。关闭 MCP 时本地新运行应禁用，旧 Host 仍可清理其拥有的受管 Page UI。不能通过重开 Host 冒充接管旧文档。

## 五、第三阶段：只补真实尚未验证的边界

优先在**隔离的 Chrome for Testing profile**中验证：

- 完整 Chrome 进程退出与重新启动后的连接/运行恢复（不是仅重开 Sidebar）。
- Native 未安装、Host 断线、MCP EOF / 丢 ACK 时的安全拒绝与不重放。
- 在读取/入场临界时导航、documentId 改变、网站撤权的目标与权限检查。
- 实际 Native 60 KiB 完整报文边界，项目源文件/资产限制，不得绕过大小检查。
- 受管 UI 异步清理超时、清理回执丢失及失败保守阻断；未知结果不自动重复。
- **停用本地开发连接**后，已有正式安装 Task 在它原本的授权/运行条件下是否继续正常工作。

能用真实 Chrome 验证的写 `REAL_CHROME_PASS/FAIL`；只能组件模拟的写 `COMPONENT_PASS`；不能安全触发的写 `NOT_TESTED` 并说明原因。不新增与框架无关的故障注入服务、不对真实网站执行有副作用的风险操作。

## 六、如果没有缺陷就不要改代码

已有 P0–P3 真实 CI、组件与文档证据在 `docs/framework/evidence/local-dev-r22-c036/`，保持原记录身份。先对比执行输入，避免因换了对话重跑未变化的全量测试。

发现真实失败才修改最少的原文件，优先原 Resolver、Native、MCP、Sidebar 或 USER_SCRIPT 生命周期链，不能再建并行实现。Local Dev 现在不支持 npm/HTTPS import；不要在本轮擅自重做 R10.1（已有 [独立提示词](goal-r10-1-local-codex-https-esm-acceptance.md)）。

修复后根据影响范围选择 `node --test tests/environment/local-dev*.test.mjs tests/environment/local-project-connection.test.mjs` 等相关回归，再执行 `npm run check`、必要的 `npm run build` 与生产包体积验证。当前 `sw.js` 曾距预算上限仅剩 6 字节，任何相关构建改动都需要重新核对实际尺寸；不得提高上限掩盖超标。

## 七、提交与最终交付

- 不修改无关产品功能和历史原始证据；新测试结果写到本轮独立记录并保留真实输出。
- 按 `AGENTS.md` 保护并行工作和使用合规 worktree/PR；**最终只保留正式 `main`**，如果有临时分支，只有合格改动安全集成之后才删除。不要绕过远端规则或无授权强行直写 main。仅验收、没有代码或文档变化时不为制造 commit 而改文件。
- 最终必须给出实际 Mac Node、Codex、Chrome 和 Native 版本，项目/目标、两次真实 `runId` / `resultId` 或 `previewId`、`sourceHash`、终态、PASS/FAIL/NOT_TESTED，以及修复文件、测试、最终 main SHA、远端分支状态。
- 对 Codex 使用、版本正确性、多文件兼容、权限安全、Chrome 稳定性和 Sidebar UX 分别评分。目标 ≥95，但没有现场原始证据不可声称 95+ 或「全部完成」。

**完成定义：**用户能在自己的 Mac 里通过 Codex 修改本地项目源文件，经现有 MCP / Native 在真实 OpenDesk Chrome 中运行，得到可信结果，修改后再次有意运行；安全异常不会静默重放，原已安装 Task 与普通用户入口没有回归。
