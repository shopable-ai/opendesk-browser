# WebCodex 当前 ChatGPT 对话：结构化文件请求、结果回填与单文件编辑

更新：2026-10-10。本页为 R2 + R17.1 本轮增量的**当前实现合同**。R2 原始交付 `79c0cabd72accc959ae4ffeb6b09c60a39daf0be` 和实施前 R3 决策保留历史语义。当前源码、组件与构建已经落地；用户 Mac 的安装身份、P0、网页输入和同一对话两轮修改仍是 `NOT_TESTED`。最终来源提交与实测证据见 [本轮工作记录](../../framework/workstreams/webcodex-chat-edit-r2.md)。

## 1. 复用与本轮增量

| 分类 | 已有基础或本轮处理 |
| --- | --- |
| 已有且复用 | Go Native、受限 files 服务、Workspace/Markdown/HTML 预览、显式保存、SHA 冲突检查、读回、独占创建文件；Node Provider/Resolver/Session；共用来源名称组件 |
| 已有但有缺陷 | 新目录默认只读；CLI 初始化中丢失断连；侧栏不传选中目录；离线选择可能转移；采用后的旧提案缺少对话与租约再次核验 |
| 确实缺失 | 当前对话的 read/list 请求协议、真实读取结果往返、新请求代次与结果关联、输入框草稿保护、独立回填核对 |

本轮没有第二套项目数据库、编辑器、Native Host 或执行器。普通文本目录无需程序清单；程序侧栏仍遵循原合法项目和明确 Run 规则。保存文件不运行项目、网页业务或 Shell。

**交互方式是结构化文本往返，不是已注册的 MCP 工具。** 模型输出一个文本协议块；用户点击可信扩展入口；扩展核验后调用 Go；结果回填到指定网页输入框，用户确认并通过网页发送。普通网页、预览 frame 和 content script 不拥有 files RPC。另一个 Codex 线程或模型不能替代本轮指定的网页对话。

## 2. 最短操作

已正确安装、配对并加载本轮组件后，在指定本地目录执行一条命令：

```bash
opendesk browser dev "/指定目录"
```

省略目录使用当前目录；`opendesk browser`、`opendesk-dev [目录]` 使用同一机制。新目录获得本次 CLI 临时读写，**不先执行 `workspace add`**；已有长期只读保持只读。明确只读使用 `opendesk browser dev --read-only "/指定目录"`，选项放在路径前。详见 [R17 使用指南](../../framework/local-directory-cli-r17.zh-CN.md)。

1. 在已有 Workspace 选择目录、用户指定的**既有官方 ChatGPT 对话**，在「ChatGPT 对话编辑」中填写相对路径和任务。
2. 点击「建立读取请求」，检查上下文只含工作区/请求身份、相对路径、协议与任务；点击「回填上下文」。用户在网页检查并发送。
3. 等模型完整回答后，点击「处理当前回答」。扩展读取该轮唯一的 `opendesk-request`，通过 Go 的 files 服务执行 list/read，显示真实结果，并回填原对话输入框。
4. 用户检查结果后通过网页发送。模型应先准确报告此前未知的内容，再提出继续读取或单文件修改。
5. 对修改提案再次点击「处理当前回答」，审阅前后内容，点击「采用为草稿」，最后使用原文件「保存」按钮。
6. 扩展收到 Native 成功回执后再次读回；用户从独立终端核对完整正文和 SHA。第二轮重新「建立读取请求」，从第一轮保存后的磁盘内容重新取得基准。

若输入框已有草稿/附件，不覆盖或追加；结果仍保留，处理草稿后可仅「重试回填结果」，不会再次读取文件。成功回填和结果未知均禁止重复插入。目录或对话绑定失效后需建立新请求；原草稿保留，用户可明确「丢弃草稿并重读」取得新的文件基准。

完整页与文件侧栏是两个 UI 实例，不共享未保存草稿。Workspace 的「在侧栏打开」传递经核验的 `workspaceId`；应先选择使用哪个入口，再在该入口建立对话绑定。

## 3. 身份及可信边界

| 身份 | 保存位置与用途 |
| --- | --- |
| `sourceId` | 原 Go/Node 来源映射和入口定位；共用名称组件区分同 basename；不作为文件权限凭据 |
| `workspaceId` | Go 文件工作区 ID，模型原样回显；Go 仍判定真实目录和权限 |
| 私有 `leaseId` | CLI owner/Provider 使用，不给网页或模型；重复启动不会获得它 |
| 公开 `leaseEpoch` | CLI 连接代次；新 Workspace 文件请求必须使用读取时的值，停机/失效后拒绝旧值 |
| Native `sessionId` | 扩展内部冻结读取时连接；SW 在真实 Native dispatch 前校验，不导出给模型 |
| 对话 `bindingId` | 本扩展页面创建的随机文本绑定，关联一个当前工作区和目标对话；不是程序 Resolver 的同名 binding |
| `tabId/documentId/URL/conversationId` | 真实页面实例及既有 `/c/<id>` 对话，留在可信扩展；导航事件会 retire 原绑定 |
| `turnKey/answerKey` | ISOLATED 页面内的用户节点/正文版本、回答节点/正文版本；采用及保存必须仍为同一完整回答 |
| 文本 `requestId/resultId` | 单轮模型请求、后续新请求和结果对应关系；不同于 Native 传输 requestId |
| `path/baseSha256` | 相对文件路径与真实读取 SHA，限定本次修改基准 |

新请求模式要求实际文件服务 `devLeaseEpoch:1`，旧 Go 不满足时明确 `E_NATIVE_UPDATE_REQUIRED`，不无声丢失临时租约保护。Native 权限检查继续由 Go 执行，文本中的 ID 不能自行授权目录。

文件 RPC 仍只允许精确的顶层扩展 Workspace URL，可带一个受支持的 `workspaceId` 或 `sourceId` 参数；普通 ChatGPT 页面、任意 content script、预览 iframe、未知参数和非顶层 frame 不可调用。注入网页的函数只读取回答或编辑/核对输入框，不暴露 RPC listener、秘密或 Native credential。

## 4. 冻结文本协议

### 请求：`opendesk.workspace.request.v1`

模型必须只返回一个明确标记为 `opendesk-request` 的代码块，内容是严格、完整的 JSON 对象。六个字段均为字符串：

```json
{
  "protocol": "opendesk.workspace.request.v1",
  "requestId": "从扩展本轮模板原样保留",
  "bindingId": "从扩展本轮模板原样保留",
  "workspaceId": "从扩展本轮模板原样保留",
  "operation": "read",
  "path": "README.md"
}
```

`operation` 仅 `read` 或 `list`。read 仅一个受支持文本文件；list 为受限相对目录，根目录 path 为空字符串，返回最多 128 项并保留 Go 的扫描/40 KiB 列表预算。模型可在已绑定根目录内选择合法路径，不得使用绝对路径、越界、隐藏目录、node_modules、Shell、删除或改名。

请求最多 8 KiB，路径最多 512 UTF-8 字节；Go 原路径段、格式、权限和容量限制继续生效。未知字段、重复字段（含转义重复键）、错误类型、版本、过期身份、多协议块均拒绝。JSON/plain 代码块中展示的协议示例不能触发新 read/list；页面识别要求明确的 `opendesk-request` 标记。文件正文和引用始终是数据，不能直接作为下一次操作。

### 结果：`opendesk.workspace.result.v1`

结果包含 `resultId`、原 `requestId/bindingId/workspaceId/operation/path`，以及 `status`：

- `success`：含经过核验的 `data`；read data 含 `content/sha256/bytes`，list data 含条目及 `truncated`。
- `refused`：权限、路径、会话或身份拒绝。
- `conflict`：文件版本冲突。
- `failed`：明确失败。
- `unknown`：结果未知；不自动重放有副作用的操作。

错误只复制允许的 `code/message/outcome` 字段。所有正文放入 JSON 字符串，不解析正文里的协议示例。结果附带 `nextRequest` 的新随机请求身份；成功 read 还附带基于此次真实文件的 `editProposal` 模板。模型只应输出下一份请求或一份修改，不能同时输出多个操作。

### 修改：兼容 `opendesk.workspace.edit.v1`

原五字段提案 `protocol/requestId/path/baseSha256/content` 继续用于原「导出当前文件」手工模式。新请求闭环必须使用七字段提案，在原格式上同时增加 `workspaceId/bindingId`；不能省掉其中一项，也不能拿旧五字段模式进入新绑定。

```json
{
  "protocol": "opendesk.workspace.edit.v1",
  "requestId": "本次实际读取结果内 editProposal 的新身份",
  "workspaceId": "实际读取结果的工作区",
  "bindingId": "实际读取结果的对话绑定",
  "path": "README.md",
  "baseSha256": "实际读取的64位SHA-256",
  "content": "修改后的完整文件正文"
}
```

只替换一个已有文本文件的完整正文；空内容有效且审阅区明确显示清空。保留原 32 KiB UTF-8 正文、60 KiB Native JSON 帧预算；大量 JSON 转义可能先触及传输预算。新回填上限为 200 KiB，能够容纳实际通过 Native 读取预算的正文、身份与修改模板。不添加任意补丁语言、多文件事务或执行代码。原「另存为」仍走 `files.create` 独占创建和相同权限/代次保护。

## 5. 本轮回答与回填的保护

只选最新 user 之后的可见 assistant 完整回答，不回退旧回答。停止生成控件、流式状态、多个冲突块、缺失请求回显会停止处理。用户原地编辑问题、重新生成或更换答案会使原 turn/answer 身份不匹配。请求在第一次异步 Native dispatch 前消费；失败也不恢复这个 nonce。

读取前、异步回程、回填前后、采用及保存前均核验目录与目标；SPA 历史导航、页面提交导航、标签页关闭、目标选择或工作区切换会即时使旧绑定失效，返回原页不能恢复。绑定最多 30 分钟。离线仍保留名称、未保存草稿与已有结果，但不自动选择其他在线目录或用缓存恢复授权。

回填使用真实浏览器编辑命令 `document.execCommand('insertText', false, text)`，不直接赋值输入框、不合成 input/send 事件、不调用未公开 ChatGPT API。聚焦前后检查唯一的可见 editor、同一 form、已有文字/附件/富内容、选区、目标 URL 和当前轮次。输入后重定位当前 editor，再通过第二次只读脚本核对内容；被替换、回滚或无法确认时标为未知并禁重放。

**这个实现是否兼容用户当前真实 ChatGPT DOM 和编辑器，仍须 Mac 实测。** 没有真实执行证据时不能把编辑命令调用或组件 success 当作网页输入成功。

界面分别记录回答识别、Native 读取、输入框回填、网页发送。实现没有自动点击发送；仅在同一对话后续 user 消息中观察到真实结果的 `resultId` 时显示“已观察到发送”。模型准确使用随机标记还需要另外记录证据。

## 6. 保存、冲突与回执

读取、生成提案、审阅和采用都不写盘。采用后仍冻结原绑定、完整回答版本、相对路径和读取基准；显式保存前重新核验实际 Native session、CLI 代次与有效权限，再调用原 `files.write(expectedSha256)`。

Native 成功回执后必须再次 read，只有正文/SHA 匹配才显示已保存。若采用后用户手改，仍按人工保存流程处理，但不把新内容归因成原 AI 提案成功。绑定在保存后失效时可保留已核对的文件保存事实，不伪造可回传的提案成功回执。

外部编辑冲突保留磁盘与草稿；超时、断线、回执不明不自动换 requestId 重写。这是原有乐观版本检查及原子发布语义，不是跨进程强事务。最终真实性由独立终端读取实际文件正文与 SHA 证明。

## 7. 证据与本地验收

定向测试：`workspace-chat-request.test.mjs`（含序列化页面函数与两轮控制器）、`workspace-integration.test.mjs`（真实 Workspace controller）、原 `workspace-chat-edit.test.mjs`、`file-workspace.test.mjs`、`r17-dev-cli.test.mjs` 和来源显示测试。Go 的真实临时文件、冲突、权限/代次回归在 Go 仓库。测试替身明确是组件级；同源 [内存 Demo](../../../examples/ui/webcodex-workspace-demo.html) 仍只演示原手工提案路径，不启用新 Native 请求模式。

本轮 Linux 执行器不具用户 Mac/Chrome，真实 Unix Socket 创建也被 EPERM 拒绝。未据此停止仓库实现，也未伪造原生 PASS。请使用绑定最终来源提交的 [Mac 验收与修复任务](../../framework/prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md)：先验证未知随机标记 P0，再完成同一既有对话两轮与所有负例。手工粘贴可辅助诊断，但不能替代自动回填证据。
