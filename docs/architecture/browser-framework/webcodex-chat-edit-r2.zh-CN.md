# WebCodex 当前 ChatGPT 对话编辑 Demo R2

日期：2026-10-10。当前目标：用户的 macOS + 已有 OpenDesk Go。Demo 已写入 `main`，首个远端交付提交为 `79c0cabd72accc959ae4ffeb6b09c60a39daf0be`；组件验证、同源内存 Demo 与构建结果见专属工作流。真实 Mac / ChatGPT 联合验收单列。

## 结论与历史承接

Native Messaging 可以把 Chrome 扩展连接到本机文件服务，因此当前对话与授权项目结合的技术路线可行。已有 R1 不是空白：Browser `1f312b72`、OpenDesk Go `34aea292` 已实现文件工作区、目录授权、六个文件方法、SHA-256 冲突检查、保存读回和静态预览。历史说明见 [R1 本地文件工作区](webcodex-local-workspace-r1.zh-CN.md) 及 [Go 文件服务](https://github.com/shopable-ai/opendesk/blob/master/docs/integrations/browser/webcodex-local-files-demo-r1.zh-CN.md)。

R1 依靠复制裸文件、手工粘贴修改内容；R2 增加当前文件的结构化上下文、用户触发的 ChatGPT 回答读取、修改建议对照、采用为草稿及成功回执。这里的回答文本仍是用户审阅的输入资料，**不是模型已经注册或调用了本地文件工具**。

**技术路线可行；已核查的源码具备 macOS 所需的 Native 文件能力。** 已有 Go Host 解决本地文件访问，主要工程工作是把选定文件可靠地交给当前对话、识别完整且属于本次请求的回答，以及避免覆盖本地编辑器或另一 Agent 的新修改。R2 已实现这条显式确认流程；真实页面兼容性和已安装版本是否匹配，需要在用户 Mac 验收。

## 与其他并行任务的关系

| 能力 | 本轮关系 |
| --- | --- |
| `native-agent/workspace.html` | 直接复用并补充对话编辑 UI，不另建编辑器 |
| `opendesk browser workspace add/list/revoke` | 复用 R1 已有目录授权，普通读取和保存复用授权 |
| `opendesk browser dev` / 简写 `opendesk browser` | 另一工作流负责的开发入口；不是此 Demo 的先决条件 |
| 本地脚本 `project.resolve` | 保持只读脚本来源语义，不因可读取脚本而获得目录写权限 |
| R16 本地 Codex provider | 保持受限规划器语义，不把其配置直接改成任意文件/shell Agent |
| HMR、axiosx、第三方库、侧栏整体布局 | 独立工作流；本轮不接管公共入口 |

本轮同步的 R17 已开始用 `sourceId` 关联 Dev 项目与文件工作区。Go `5f09dc9d` 新增 `dev.attach`、临时目录租约和多 Provider 聚合：新接入目录默认是临时只读工作区；已有正式工作区则复用原 ID 与权限。`sourceId` 只用于定位，读写权限仍来自 Native 返回的实时工作区。第一版文本编辑可直接使用已有正式读写授权，不依赖项目自动启动、后台监听或整个 Dev 入口收尾。

## 直接体验同源 Demo

打开 [webcodex-workspace-demo.html](../../../examples/ui/webcodex-workspace-demo.html)。该文件由正式 UI、预览和提案模块生成，使用明确标识的内存文件后端。

1. 默认打开 `README.md`，填写修改要求，点击「1. 生成文件上下文」。
2. 点击「生成示例回答（内存）」，查看「原文件 / 建议内容」。此按钮只生成演示文本，不调用 AI。
3. 点击「3. 采用为草稿」，检查下方源码和静态预览；此时文件尚未保存。
4. 点击文件标题旁的「保存」，查看读回核对和 `memory-only` 回执。

也可以复制生成的上下文，放入自己当前 ChatGPT 对话，让真实模型生成提案，再手工粘贴进这个内存 Demo 测试格式。它仍然只修改演示内存，不会连接你电脑上的 Native Host。刷新页面会重置演示文件。

维护者修改 UI 后，使用原生成器更新 Demo：

```bash
node scripts/build-workspace-demo.mjs
```

## 在当前 Mac 的真实扩展中使用

复用已经安装的 OpenDesk Go。先在终端核查：

```bash
command -v opendesk
opendesk browser doctor
opendesk browser workspace help
```

确认 Chrome 的 Native Host 实际启动的是该 Go executable，并协商 `localFilesVersion:1`。健康安装直接复用；只有版本或安装指向确实不匹配时，才按 Go 仓库既有流程更新。`doctor` 的连接状态不等于文件保存已经验收。

在 Browser 仓库根目录构建本轮代码：

```bash
node scripts/build.mjs production
```

Chrome 加载或重新加载该仓库的 `dist/production`。确认实际加载的路径与本次构建一致。旧的工作区页面需重新打开，不能仅凭源文件已更新判断现有页面已加载新脚本。

从 Browser 仓库根目录创建并授权独立演示目录，避免后续生成 Demo 时重写测试文件：

```bash
WEBCODEX_DEMO_DIR=$(mktemp -d "${TMPDIR:-/tmp}/opendesk-webcodex-r2.XXXXXX")
cp examples/local-workspace/README.md "$WEBCODEX_DEMO_DIR/README.md"
cp examples/local-workspace/index.html "$WEBCODEX_DEMO_DIR/index.html"
opendesk browser workspace add --path "$WEBCODEX_DEMO_DIR" --access read-write
opendesk browser workspace list
shasum -a 256 "$WEBCODEX_DEMO_DIR/README.md"
```

保存返回的实际目录和工作区 ID，后续在同一个目录验收。`browser dev` 新目录是临时只读来源；若它已在线，新增正式授权可能产生不同的工作区 ID。刷新后选正式 `read-write` 工作区，不能只靠同名判断权限。界面会在当前目录只读时显示开启编辑的命令；不会自动扩大授权。单文件 Demo 可直接使用正式工作区，无需等待其他对话的 Dev 入口完成。

然后按以下流程操作：

1. 在 ChatGPT 打开一个已有对话。从扩展「本机连接设置」进入「本地文件工作区」，刷新连接并选择授权目录。
2. 选中一个文件和对应的 ChatGPT 目标页面。可以先点击「在侧栏打开」，再在侧栏中生成上下文；工作区标签页与侧栏是不同 UI 实例，不共享尚未保存的内存草稿。
3. 文件必须处于已保存、无冲突、无未知保存状态。填写要求，生成并查看上下文，点击复制，粘贴到原 ChatGPT 对话并由用户发送。
4. 等回答结束，点击「读取目标对话回答」。遇到不兼容的页面结构，展开「手动粘贴回答代码块」并粘贴同一个 `opendesk-edit` 提案。
5. 在扩展内查看原文件和建议内容，点击「采用为草稿」，最后点击「保存」。真实写入及再次读取的内容/hash 一致，才会给出保存回执。
6. 将回执复制回原对话继续讨论。下一次修改重新生成上下文；旧 requestId 不再有效。

保存后从同一终端再次读取演示文件、运行 `shasum -a 256 "$WEBCODEX_DEMO_DIR/README.md"`，与回执中的 hash 对照。真实扩展回执为 `native-files`；独立 HTML 的 `memory-only` 回执只说明内存演示成功。

若在 ChatGPT 新对话首页生成上下文，首次发送可能改变 URL。R2 要求先建立或打开具体对话，避免隐式重新绑定；取消目标选择后仍可使用只关联文件的手工粘贴模式。当前不是自动输入、自动发送、自动运行或无限自主循环。

## 三层技术能力不能混为一谈

| 层级 | R2 状态 | 准确含义 |
| --- | --- | --- |
| 扩展访问本地文件 | 复用 R1 | 可信工作区通过 Native Port 请求授权目录里的文本文件 |
| 原 ChatGPT 对话辅助编辑 | 本轮新增 Demo | 用户发送文件上下文；扩展读取或接收提案；用户审阅并保存 |
| ChatGPT 模型主动调用文件工具 | 未实施 | 需要正式 MCP adapter、自定义工具配置与真实工具调用验收 |

Chrome content script 能读写网页 DOM，但不会通过注入某个 JavaScript 对象就给 OpenAI 服务端模型增加 tools；这是页面接口与服务端工具接口分离带来的工程边界。当前 R2 已能在既有对话中交换文件上下文和修改提案。进一步自动化文本发送/结果回传，也可以沿用这条路线，但要另行处理用户授权、网页变化、生成完成、重复执行与停止；它仍然是文本协议循环。

正式工具模式可以在同一受限文件服务上做 MCP adapter，按 ChatGPT 支持的方式连接工具。OpenAI 文档还提供 Secure MCP Tunnel，支持私有环境的 stdio/HTTP MCP 服务，但需要相应配置和权限。不能承诺安装扩展后普通历史对话就自动得到模型工具；当前 R2 不以该接入完成为前提。

Codex app-server 则是另一条本机编码 Agent 路径，具有自己的线程和执行生命周期；不能把它自动视为网页既有 ChatGPT 对话的同一运行时。本轮保留现有 R16 规划器边界。

## 文件与对话绑定

扩展只在内存中记录一次有效上下文：`workspaceId`、相对路径、原 SHA-256、原正文、随机 requestId，以及可选的 `tabId + documentId + 完整 URL`。导出的上下文元数据不会额外加入目录绝对路径、工作区授权 ID 或 Native credential；选定文件正文按原内容提供，用户发送前可完整查看。

提案字段固定为五个字符串：

```json
{
  "protocol": "opendesk.workspace.edit.v1",
  "requestId": "从当前上下文原样保留",
  "path": "README.md",
  "baseSha256": "从当前上下文原样保留",
  "content": "修改后的完整文件内容"
}
```

只允许替换本次明确选定的一个现有文本文件。正文仍最多 32 KiB，Native JSON 帧仍最多 60 KiB；大量转义可能先触达原有 Native 帧上限。允许空正文，但预览明确显示“将清空文件正文”。拒绝未知字段、重复字段（包括转义重复 key）、非法 Unicode/NUL、非字符串值、错误请求/路径/版本以及多个命名提案；不解析任意补丁语言或执行命令。

从网页读取时，先后核对真实 frame/document/URL，注入函数也核对 `location`。在最新 user 消息之后聚合可见 assistant 内容片段，忽略用户代码、工具输出和旧回答；检测到流式生成、缺失边界、多个相关提案或不兼容结构就停止并提示手工选择。此适配依赖 ChatGPT 页面 DOM，实际在线兼容性需单独验收。

用户在等待回答时修改了草稿、切换文件/工作区、改变原版本或出现未知保存状态，旧提案不能覆盖。读取提案和采用草稿都不写盘。采用后立即消费 requestId；真正写入仍由既有 `save()` 执行 `files.write(expectedSha256)` 并读回。Native 断线或未知写入不自动重试。

只有读回内容与已采用提案完全一致时，才产生该 requestId 的成功回执。如果用户进一步手改，文件仍可以正常保存，但不会把手改后的内容错误归因为原 AI 提案已应用。

## 后续平台范围

本轮先完成用户当前 macOS 的真实闭环；其他系统适配后续处理。先前 Windows 调查保留在历史工作流与原始证据中，不作为 Mac Demo 的前置工作或本轮验收要求。

## 验证与后续入口

本轮受影响验证、源码身份、构建包与限制见 [R2 工作流](../../framework/workstreams/webcodex-chat-edit-r2.md)。本机完整验收任务见 [本地验收与修复提示词](../../framework/prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md)。

当前执行环境的 Unix Socket 探测返回 EPERM，不能使用这里的 DOM 模型测试冒充 Chrome 加载、用户手势、真实 Native 磁盘或真实 ChatGPT 页面验收。R1 的原组件记录保留，不升级为本轮原生 PASS。

## 官方依据

- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Chrome content scripts / isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [OpenAI 自定义插件 quickstart](https://developers.openai.com/plugins/quickstart)
