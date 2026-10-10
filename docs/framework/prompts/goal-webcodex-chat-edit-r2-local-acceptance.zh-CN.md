# GOAL：WebCodex R2 当前 ChatGPT 对话与本机文件的实际验收、修复

直接完成本机验收和必要修复。Browser 仓库 `https://github.com/shopable-ai/opendesk-browser` 只用 main；OpenDesk 仓库 `https://github.com/shopable-ai/opendesk` 使用实际主分支（本次为 master）。不创建分支或 worktree，不覆盖其他 Agent 或用户未提交修改，不强推或重置。先检查实际本机路径，不能假定网页会话能访问用户电脑。

## 先读与复用

- 两个仓库各自的 `AGENTS.md`。
- Browser `docs/architecture/browser-framework/webcodex-chat-edit-r2.zh-CN.md`。
- Browser `docs/framework/workstreams/webcodex-chat-edit-r2.md` 和 `docs/framework/testing-guide.md`。
- Browser `docs/architecture/browser-framework/webcodex-local-workspace-r1.zh-CN.md`。
- OpenDesk `docs/integrations/browser/webcodex-local-files-demo-r1.zh-CN.md` 及既有 Native 安装文档。

R1 文件 Host、R2 对话提案和同源内存 Demo 已有源码，不重新开发第二套桥、编辑器或规划器。R2 使用用户触发的回答文本读取，不是官方 ChatGPT MCP tools；不要虚报模型工具调用。用户在当前网页发送的内容和文件权限始终分开。

## 环境与配套

1. 核查真实 OS、Chrome/CFT、扩展 ID、浏览器加载目录、Browser/Go 源码 SHA、已安装 OpenDesk executable 的路径与版本。保护其他会话的 profile、端口、dist 和进程。
2. 在 macOS/Linux，若本机 Host 不包含 `localFilesVersion:1`，按原仓库流程构建、安装更新并完成既有配对。不能只刷新扩展或在旧二进制上重复试错。
3. 在 Windows，先核查是否仍走 `internal/browserbridge/unsupported.go`。若如此，明确该平台原生实现尚缺，不使用 WSL/Node 旧 Host 冒充 Windows 支持。用户要求完成 Windows 本机读写时，先实现并验证 Windows Native Host、注册、私有授权和文件平台适配，复用相同 files 协议；不得仅删除 build tag 或用交叉编译代替真机验收。该工作记录为独立 Windows 平台工作流，保留本轮已通过的浏览器组件证据。
4. 使用专用临时演示目录及其中的 Markdown/HTML 文件，执行已有 `opendesk browser workspace add --path <实际目录> --access read-write`。不要以正在开发的 `opendesk browser dev` 简写是否完成作为本次文件验收前提。

## 实际闭环

先构建并加载当前 Browser 包，打开真实 `native-agent/workspace.html`，确认显示“ChatGPT 对话编辑”和 R2 页脚。在真实 Chrome 中完成：

1. 文件列表、读取内容/相对路径/hash 与实际磁盘一致。
2. 打开用户指定的已有 ChatGPT 对话，先选目标页面；如使用 Side Panel，先在侧栏打开工作区，再生成上下文。
3. 为一个已保存文件生成上下文，核查只包含这个文件。发送具体测试请求必须已有用户授权；没有授权时由用户发送，或准备好待发送内容后明确交接，不擅自给外部站点发送本地文件。
4. 等回答结束，点击“读取目标对话回答”；核查实际 DOM 的消息角色、多内容块、代码文本，禁止把 fixture 或模拟网页当真实 ChatGPT。
5. 提案审阅阶段核查磁盘未变；采用为草稿后再次核查仍未写盘；最后实际点击保存。
6. 使用独立本机文件读取核对正文与 SHA-256，确认 UI 保存回执为 `native-files` 且读回一致。不能仅信任按钮状态或本机命令返回成功。
7. 在同一对话完成第二次修改，确认 requestId 更新；旧提案重放不能覆盖。

## 必须补的故障场景

- 等待回答时本地手改草稿：保留手改内容，拒绝旧提案。
- 提案生成后从外部编辑器修改磁盘：保存冲突，保留草稿和磁盘，不自动覆盖。
- 采用提案后进一步手改并保存：不生成原提案已应用的错误回执。
- ChatGPT 同文档 SPA 切换另一对话：拒绝导入；新对话首页也不得静默重绑定。
- 回答仍在生成、最新 user 尚无回复、多个 assistant 内容块、多个相关提案、隐藏旧回答分支：行为与 R2 合同一致；不支持的 DOM 明确提示手工粘贴。
- 成功预览 A 后重读失败：不能继续采用隐藏的旧 A。
- 断线/超时/保存结果未知：不自动重放；先读回核实。
- 只读工作区、撤销目录授权、路径穿越及错误 requestId/path/SHA：不产生写入。
- 指定 sourceId 不在线但另一个历史目录在线：不自动读取替代目录；首次来源解析或用户明确选择后，后续刷新不覆盖用户选择。
- Markdown/HTML 静态预览没有脚本或外联；代码只按文本编辑。Next.js/HMR 是独立服务验收，不因 TSX 文件已保存就宣称应用已运行。

## 验证与交付

只对变化的输入补定向验证。基础定向命令为：

```bash
node --test tests/environment/workspace-chat-edit.test.mjs tests/environment/file-workspace.test.mjs
```

UI 源码变化后重新生成 `examples/ui/webcodex-workspace-demo.html`，再执行必要构建/包检查；不要手工维护另一份同名演示。测试截图、Native 原始消息、文件 hash、实际安装版本和 Chrome 目标身份保存在该工作流专属证据目录。不得把 Node DOM/内存后端的成功提升为用户系统 Native PASS。

修复后集成到指定主分支，推送前 fetch 并逐文件核对并行变化。最终明确列出：新增修复、提交与推送、实际安装/加载的版本、真实 ChatGPT 与本地文件闭环结果、Windows 的真实支持状态、仍未验证项。仅在对应真实证据齐全时关闭该层验收。
