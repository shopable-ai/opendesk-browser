# WebCodex 本地文件工作区 Demo R1

状态：IMPLEMENTED / COMPONENTS_PASS / NATIVE_UI_BLOCKED。负责人：本对话 root（Browser main），native_core_audit（独立 OpenDesk master）；Chrome/Browser 与 Native 两侧均完成独立只读复核。

## 范围与授权

用户要求核查 Native Messaging + ChatGPT 网页本地文件编辑和 Sidebar / 页内 MD、HTML、Next.js 预览可行性，并完成 Demo。复用现有 Host，不重新设计 Browser Core，不把 R16 只读规划通道放宽成文件/Shell 执行器。

## 独占资源

- Browser: /workspace/scratch/4dbca7955fd1/opendesk-browser，main，只由 root 写入。
- Go: /workspace/scratch/4dbca7955fd1/opendesk，master，由 Native 子任务独占实现、冻结交接后由 root 串行集成。
- 其他对话目录只读；无新分支、无 worktree。
- 构建使用本工作区 dist 与 evidence；测试使用新建 profile 和临时 loopback 端口。
- resources.released: true。构建及子任务已结束，没有运行中的 Demo 服务或 Chrome 实例。

## 现有证据复用

已读 testing-guide.md、parallel-development.md、local-dev-r22-c036.json。既有 MCP/Native/USER_SCRIPT 证据保留为原候选结果，不重跑无关 Controller / Locator / AI / F3。新增文件子协议与 UI 属于 AFFECTED_INPUTS：仅验证受影响 Native 组件、文件服务、页面渲染、当前包和真实连接。官方 ChatGPT MCP 和用户 Mac 的真实结果仍单独记为 NOT_TESTED，直到实际验证。

## 实施目标

工作区授权 → 文件列表 → 读取 → 明确保存 → 外部变更检测 → MD/静态HTML隔离预览；可接已有 loopback Next.js URL。普通网页不持有 Native 文件桥。

## 实际交付

- [架构、快速体验与真实文件使用说明](../../architecture/browser-framework/webcodex-local-workspace-r1.zh-CN.md)。
- [独立内存交互 Demo](../../../examples/ui/webcodex-workspace-demo.html)，使用正式 UI 与预览模块；明确标识 memory-only，刷新重置。
- Browser 在同一 Native Port 接入六个 `opendesk.local-files.v1` 方法，限定精确受信任工作区文档；支持保存冲突、未知结果后只读核实及独占创建恢复。
- Go Native 使用既有 Host，增加 CLI 目录授权及真实文本文件操作。原十个 RPC、只读脚本 Provider、R16 规划语义不变。
- 单次正文 32 KiB、Native 帧 60 KiB；未新增 shell、目录创建、删除、监听或 Next 启动功能。

## 验证账本

| 层级 | 结果 | 范围 |
| --- | --- | --- |
| Browser 文件服务及 Native Bridge | PASS，45 项 | `node --test tests/environment/file-workspace.test.mjs tests/environment/native-agent-bridge.test.mjs` |
| Native 包合同 | PASS，4 项 | `node --test tests/environment/native-agent-package.test.mjs` |
| 上游 R16 Native AI 合并回归 | PASS，22 项 | `tests/environment/workflow-ai-transport.test.mjs`；与上两组最终合计 71 项通过 |
| DOM 事件组件 | PASS，3 个流程 | 实际 UI 初始化、编辑保存、创建成功但目录刷新失败；linkedom 补 Option/select.value DOM shim，未运行浏览器渲染器 |
| Browser 源码检查 | PASS | 最终 265 个 source/test/build 文件 |
| Browser production / development | PASS | WXT 15 个入口、原有包校验；未放宽体积阈值或全局 CSP |
| Production ZIP | PASS | 495837 bytes；SHA-256 `502b5988055af58f5cf01e8e9827faa42948ef8b786459403f820b3aab4bbbeb` |
| Go race 定向及相邻回归 | PASS，20 个顶层 case | 真实临时文件/Native frame；12 个新能力 case 与 8 个相邻回归 |
| Go vet | PASS | `internal/browserbridge`、`internal/browsercli` |
| Darwin arm64 | CROSS_COMPILE_PASS / NOT_EXECUTED | 包测试 executable 与 browsercli-only 组件工具；不是实际桌面发行包 |
| 完整 OpenDesk 桌面构建 | BLOCKED | 离线缓存缺少既有桌面依赖 |
| Go 全库测试分类审计 | BASELINE_FAIL | 24 个原有未登记测试，逐项确认早于本轮；本轮两个新测试已登记 |
| 真实 Chrome 加载及 UI | BLOCKED / NOT_TESTED | process singleton Unix Socket 创建返回 EPERM，浏览器在页面加载前退出 |
| 用户 macOS、Sidebar 真手势、目标页面预览、CSP 实际阻断、Next HMR | NOT_TESTED | 不由 Node DOM、协议测试或交叉编译推断 |
| 官方 ChatGPT 模型工具调用 | NOT_IMPLEMENTED / NOT_TESTED | 尚无 MCP adapter/tunnel 注册及真实对话调用 |

最终生产 package hash：`ef73b016a93ac49ba90ee153c0eb6162fe8b9eeacf6d73b7bc11f1689b511a5f`。源码实现建立在 Browser `74297145` 后，保留 `992f1173` 更新，并再次合入 `bd76b2d1` 的 R16 本地 Codex 规划集成。最后一次合入影响 Native service-worker 与构建输入，因此手工保留 workflowAI/files 各自接线，重新完成 71 项组件、265 文件源码检查以及 production/development 构建与打包；独立复核确认没有丢失上游接线或扩张文件入口。Go 基线 `005a2f33`，集成 `15af7bbd` 文档后发布提交 `34aea292`，该文档合入未改变测试涉及源码。

首次更宽的 Browser 组件运行保留为失败证据：包含一项已修复的输入快照测试失败，以及七项现有 Native Socket 测试的 EPERM。首次生产包在旧基线上触及 SW 预算；同步 main 已有的 compact-schema 优化后按原阈值重新构建通过，没有提高阈值。

曾对一次有界临时 Unix Socket 探测申请提权；自动审批明确拒绝：`sandbox_approval:false`，不可请求 escalated execution。没有换通道绕过限制或修改生产 Host 使其假通过。此项是环境阻塞，不是实际 Native/Chrome 成功证据。

## 证据与复核

Browser 原始本轮证据位于本工作区 `docs/framework/evidence/webcodex-workspace-r1/`；Go 原始日志、源码/产物 hash 与架构基线逐项核查位于对应仓库 `.runtime/tests/native-files/`。可版本化的摘要和组件日志位于 [evidence/webcodex-workspace-r1](evidence/webcodex-workspace-r1/)。构建产物与临时二进制不提交进源码仓库。

独立复核未发现新的 blocker。复核修正过保存回执形状、NOT_DISPATCHED、connection 快照、read-only UI、页内预览生命周期和创建后目录失败状态。完整 HTML 的 linkedom 解析与浏览器片段解析存在差异，其输出未被作为 Chrome 视觉证据；没有生成或伪造截图。

## 后续真实环境验收

在安装了本轮 Go Host 的用户本机，沿快速体验说明验证读取、修改、保存、磁盘读回；另一个编辑器修改同文件时确认冲突保留草稿；拔断 Native 后确认不自动重放。随后分别验收 Sidebar 点击、精确目标文档预览、静态 HTML 无脚本/外联以及实际 Next 开发服务。ChatGPT 模型主动编辑需要在同一受限服务上实现官方 MCP adapter 并完成独立授权与工具调用验收，不能通过抓取聊天 DOM 代替工具通道。
