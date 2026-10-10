# GOAL：在当前 Mac 完成 WebCodex R2 测试、修复与验收

## 用户目标与执行方式

当前电脑是 macOS，已经有 OpenDesk Go。直接完成本机可运行的 Demo 验收、必要修复和提交；本轮先完成 Mac，其他系统后续处理。Browser 仓库只在 `main` 工作，不创建分支或 worktree。保留其他会话与用户的未提交修改，不重置、不强推、不覆盖别人的进程、profile 或构建产物。用户已要求在主分支写入并完成 Demo，按此任务继续，不停留在建议或重复询问是否实施。

目标是：**用户当前的官方 ChatGPT 网页对话给出修改，真实扩展审阅并保存到这台 Mac 的已授权目录，独立读回核对成功；同一对话可以继续第二轮修改。** 不另外新建一个 Codex 对话替代这个网页对话。

R2 已写入 Browser `main`，首个远端交付提交是 `79c0cabd72accc959ae4ffeb6b09c60a39daf0be`。沿用当前主干后续修复，不回退到旧提交。已有单文件上下文、回答文本读取、提案审阅、采用草稿、显式保存和回执；不重新开发第二套文件桥或编辑器。当前是用户确认的文本提案模式，不是已经注册给 ChatGPT 模型的 MCP tools。

## 先读与定位

先找到真实本机仓库；可能在 `/Users/shopme/Documents/workspace/opendesk-browser` 和 `/Users/shopme/Documents/workspace/opendesk`，以实际存在路径为准。

读取两仓库 `AGENTS.md`，以及：

- Browser `docs/architecture/browser-framework/webcodex-chat-edit-r2.zh-CN.md`。
- Browser `docs/framework/workstreams/webcodex-chat-edit-r2.md` 和 `docs/framework/testing-guide.md`。
- OpenDesk `docs/integrations/browser/webcodex-local-files-demo-r1.zh-CN.md`。
- 需要修复安装时再读 OpenDesk `docs/integrations/browser/native-mac-build-install-test-r5.zh-CN.md`。

检查主分支、工作区差异、远端更新和正在进行的任务。Browser 使用 `main`；Go 源码先只读核对，主分支以仓库实际值为准（本次为 `master`）。需要 Go 修复时先核对该目录的并行工作和规则；不能覆盖其他会话正在完善的功能。

## 1. 核对现有 Mac 与 Go，健康安装直接复用

记录 `uname -s` / `uname -m`、Chrome/CFT 版本、扩展 ID、实际加载目录、两仓库 SHA 和未提交差异；确认 `node --version` 满足仓库要求。检查实际命令：

```bash
command -v opendesk
opendesk browser doctor
opendesk browser workspace help
opendesk browser workspace list
```

如果 PATH 没有 launcher，先定位已安装的 App 内可执行文件；常见路径为 `/Applications/OpenDesk.app/Contents/MacOS/opendesk`，只在存在时使用。不要因为 PATH 缺失就重新实现 Go Host。

核对 Chrome 实际 Native manifest 的 `allowed_origins` 与扩展 ID，以及 manifest `path` 指向的 wrapper 最终启动的 Go executable。默认路径：

- Chrome：`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.shopable.opendesk_browser.agent.json`。
- CFT：按实际版本/profile 的 `NativeMessagingHosts` 目录核查，不假定与普通 Chrome 共用。
- 默认 wrapper：`~/.opendesk-browser/native-agent-r1/native-host`。

`install.json` 含私有凭据，只选择性读取所需路径/版本字段，不整份输出或上传。`doctor` 的 installed/socketExists/connected 分别记录；它们不单独证明文件接口可用。实际扩展文件状态需协商 `localFilesVersion:1` / `opendesk.local-files.v1`。

只有发现旧 binary、缺失文件能力或错误安装指向时才更新。使用既有构建/安装流程：Go 仓库 `./scripts/build_macos_app.sh` 构建真实 App，必要时用真实安装路径运行 `browser update`；全新绑定才使用 `browser setup --extension-id <真实ID>`。如果报 `E_SOCKET_IN_USE`，定位连接归属并受控关闭后再操作，不直接删 socket 或停止未知进程。组件 fixture 不是用户正式 App 的替代品。

## 2. 构建真实扩展，创建专用磁盘演示目录

先核查现有构建证据是否匹配本次输入及实际加载包；需要构建时，在 Browser 根目录按现有依赖安装和锁规则执行：

```bash
node scripts/build.mjs production
```

Chrome 加载/重新加载 **这个仓库的 `dist/production`**，重新打开工作区页面，确认有“ChatGPT 对话编辑”和 R2 页脚。入口是扩展设置中的“打开本地文件工作区 Demo”。直接打开 `src/native-agent/workspace.html` 或独立 HTML 文件不算 Native 验收。

在 Browser 根目录创建只用于本轮的演示目录：

```bash
WEBCODEX_DEMO_DIR=$(mktemp -d "${TMPDIR:-/tmp}/opendesk-webcodex-r2.XXXXXX")
cp examples/local-workspace/README.md "$WEBCODEX_DEMO_DIR/README.md"
cp examples/local-workspace/index.html "$WEBCODEX_DEMO_DIR/index.html"
opendesk browser workspace add --path "$WEBCODEX_DEMO_DIR" --access read-write
opendesk browser workspace list
shasum -a 256 "$WEBCODEX_DEMO_DIR/README.md"
```

记录实际目录路径、授权命令返回的 workspaceId 和初始 hash。后续终端复用这一路径；不要每一步创建不同目录。先授予正式读写权限，再打开工作区进行测试。

**`opendesk browser dev` 不是本次前提。** 新 Dev 目录默认临时只读。若它已在线，再新增正式授权，旧临时 ID 与新正式 ID 可能同时显示；刷新后选择 `workspace add` 实际返回的 `read-write` 工作区，不能仅凭同名目录判断权限已升级。CLI `workspace list` 只列正式授权，Native 列表还可含临时目录。

## 3. 在真实 ChatGPT 既有对话完成两轮

1. 从正式扩展打开 `native-agent/workspace.html`，选择演示目录和 `README.md`。独立核对磁盘正文/路径/hash 与 UI。
2. 选择用户指定的已有 ChatGPT 对话页面。先完成侧栏/独立页选择，再生成上下文；两种入口的未保存草稿不共享。使用具体对话 URL，不在新对话首页隐式重新绑定。
3. 填写明确要求，例如“把标题改为 OpenDesk Mac Demo，并在末尾增加一行 macOS 本地编辑已验证，保留其他内容”。生成上下文，核查只包含所选演示文件及提案格式。
4. 由用户将上下文发送到当前 ChatGPT 对话；若本地 Agent 已取得明确的网页发送授权，可按允许的真实浏览器操作执行。未取得发送授权时先把全部可独立完成的准备、组件/磁盘核查和待发内容做完，再明确交接这一操作。不要读取会话 cookie、调用未公开 ChatGPT 接口或把 synthetic events 当用户输入证据。
5. 回答结束后点击“读取目标对话回答”。记录真实 DOM 的消息边界、代码块和目标身份。无法自动读取时，先修复有证据的 DOM 兼容问题；可以同时用手工粘贴验证提案/Native 保存路径，但必须把自动读取单列结果。
6. 审阅原内容/建议内容，独立 `shasum` 证明磁盘未变；点击“采用为草稿”后，再次证明磁盘仍未变。
7. 点击既有“保存”，用独立磁盘读取核对完整正文和 SHA-256；UI 回执必须是 `backend: native-files` 且 `readBackVerified: true`。不能只看按钮/提示或 native ack 就报成功。
8. 把回执带回同一个对话，完成第二个不同修改；重新生成上下文、requestId 和基线。核对旧提案不能重放。

没有 `opendesk browser files.read` / `files.write` 这样的 CLI。文件接口通过正式扩展请求，终端用于独立读取真实磁盘证明效果。

## 4. 验收与必要修复

先完成上面的主路径，再验证直接影响本次功能的故障场景：

| 场景 | 必须观察到的结果 |
| --- | --- |
| 只读目录 | 提示如何开启编辑，采用/保存不能写入；正式授权后选择正确目录可编辑 |
| 等待回答期间手改草稿 | 拒绝旧提案，保留手改内容 |
| 生成提案后外部编辑器改磁盘 | 保存报告冲突，磁盘和草稿分别保留，无静默覆盖 |
| 采用后进一步人工修改再保存 | 不错误出具“原 AI 提案已应用”的回执 |
| 同文档 SPA 切换对话、页面刷新 | 旧绑定不能导入到新对话 |
| 回答未结束、最新 user 无回复、多段/多份相关提案 | 等待或明确拒绝，不截断保存、不读取旧回答 |
| 已有预览后再次读取失败 | 旧预览不能继续被采用 |
| 断线、超时或保存效果未知 | 不自动重放，先读回确认 |
| 目录撤权、错误请求/路径/hash | 不写盘 |
| sourceId 不在线而另一个历史目录在线 | 不自动读替代目录；明确手选之后刷新保留选择 |

32 KiB 文本上限和 60 KiB Native JSON 帧预算维持原协议。当前 Demo 是单个已有文本文件的完整替换。Markdown/HTML 走静态预览；JS/TSX 是源码文本。Next/Vite 服务、HMR、多文件事务、shell 与真正 MCP 工具不作为本次 Mac 主路径验收前置。

## 5. 定向验证和主分支交付

只对变化输入补验证；未变的完整证据按 testing-guide 复用。需要 R2/文件组件回归时：

```bash
node --test tests/environment/workspace-chat-edit.test.mjs tests/environment/file-workspace.test.mjs
```

改了 UI 后，使用原生成器更新同源 Demo，再做必要构建和包校验：

```bash
node scripts/build-workspace-demo.mjs
node scripts/build.mjs production
node scripts/verify-package.mjs dist/production
```

生成器也会重写仓库 `examples/local-workspace` 样本，所以真实试验使用上面的独立目录。

Go 文件实现发生变化时，从 Go 仓库运行相关定向测试：

```bash
go test -race ./internal/browserbridge ./internal/browsercli -run 'TestNativeFiles|TestWorkspaceCLI' -count=1 -v
```

注意现有 `tests/environment/native-agent-chrome-real.test.mjs` 使用 Node Host，不能用它证明 Go Host 已通过；`opendesk-native-provider.test.mjs` 验证真 Go 与模拟 Chrome，也不等于真实网页文件闭环。

将本次原始证据写入 R2 工作流内新的 `mac-local-<日期或任务ID>` 子目录，保留实际加载包/Go binary、Chrome 与对话身份、关键截图、脱敏 Native 回执、每一步文件 hash、错误与修复记录。保留旧失败和旧证据，不把内存 Demo 或 DOM 模型结果标成 Native PASS。

修复直接提交 Browser `main`；推送前 fetch，逐文件核对并行变化并正常集成，禁止强推。Go 如需修改，按该仓库真实主分支和并行规则完成，不新建任务分支。释放本轮占用的构建、测试和浏览器资源。

最终交付必须包含：实际新增修复与提交/推送结果、真实安装/加载版本、两轮同一对话编辑的磁盘核对、自动读取与手工导入各自结果、冲突和断线结果、用户下一次怎样打开和操作。只有取得真实 Mac 证据时标记 `MAC_NATIVE_CHATGPT_PASS`；未完成的项说明具体阻断，不把这一状态提升成全框架 F3/ZIP 安装验收。
