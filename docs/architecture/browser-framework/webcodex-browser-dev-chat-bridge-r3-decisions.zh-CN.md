# WebCodex R3 × browser dev R17.1：现有 ChatGPT 对话与本地可编辑工作区——决策与调用链

> **2026-10-10 后续产品边界修正（先读）**：用户不接受本页旧版本所列的“每次手动处理模型请求、回填并发送”作为最终使用方式；网页 SDK 不等于云端模型工具，DOM 自动接力／MCP Tunnel 也不是已选定架构。正式方案必须先验证原官方对话中的实际模型文件工具、账号权限及无人工逐轮中继体验。详见 [WebCodex 云端模型与本地文件访问技术边界 ADR](webcodex-cloud-model-local-file-boundary-20261010.zh-CN.md)。本页旧流程保留为阶段性验收历史，不能据此宣称最终产品通过。


> **实施前历史决策快照**：以下保留 2026-10-10 决策时的状态。当前实现与协议见 [WebCodex R2 结构化请求说明](webcodex-chat-edit-r2.zh-CN.md)，本机继续执行 [本轮 Mac 完整验收任务](../../framework/prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md)。下文“实现待完成/旧默认只读”不作为当前操作指引；真实 Mac P0 和两轮闭环仍未验收。

> 决策日期：2026-10-10  
> 状态：**产品方向已确定 / 增量实现待完成 / 当前 Mac 真机全链路未验收**。本文件记录下一轮的目标和约束，**不是“相关代码已全部实现”的声明**。  
> 适用仓库：OpenDesk Browser `main`（主编排），OpenDesk Go `master`（Native 权限与来源租约）。  
> 本轮范围：单台 macOS、一套已配对 OpenDesk Go、一套 Chrome/扩展，多目录并行；Windows、多机/LAN 留待以后。

## 1. 先冻结最终用户体验

目标：用户在任意自己拥有的项目目录运行 `opendesk browser dev`（或 `opendesk browser`），即可把**这个目录**接入已有 `native-agent/workspace.html` 为**本次 CLI 会话默认可读写**的目录；无需再先执行 `workspace add`。多个终端可以启动不同目录，Workspace、开发侧栏与当前对话能准确选择对应工作区。

最终闭环：**当前官方 ChatGPT 网页对话**提出读取文件请求 → 可信扩展从本轮回答识别请求 → 通过已绑定 Workspace 的 Native 文件服务从 Mac 读取 → 把真实结果送回**同一对话** → 模型据结果提出修改 → 扩展显示前后对照 → 用户采用并显式保存 → Native 读回 + 独立磁盘核验。不得用另开 Codex 会话、内存 Demo、粘贴已知正文或只完成目录列表代替该目标。

简化流程：

```text
目录 A: opendesk browser dev      目录 B: opendesk browser dev
             |                                |
        本机认证 CLI 来源 / 独立租约 / sourceId
                         |
        已有 Go Native Host 及受限 files 服务
                         |
           已有 Workspace / 侧栏目录选择
                         |
                绑定指定 ChatGPT 对话
                         |
模型文本 read 请求 → 用户触发解析 → Native read
                         |
       结果进入同一个对话（用户核对后发送）
                         |
   模型文本修改提案 → 扩展审阅 → 明确保存
                         |
         Go files.write(expectedSha256)
                         |
     扩展 readBack + 独立 Mac 磁盘读回
```

## 2. 三层能力绝不能混为一谈

| 层级 | 已知实现/性质 | 本轮判定 |
| --- | --- | --- |
| 本地文件服务 | R1 Go + 扩展已有 `workspaces.list`、`files.list/read/write/create`，SHA-256 预条件、读回与冲突拒绝 | **已有代码基础**；真实已安装 Go/Chrome 版本必须核验 |
| R2 当前网页单文件提案 | 生成文件上下文、用户发送、点击读取网页回答、提案审阅、采用草稿、显式保存和回执 | **已有实现**；网页 DOM/真实 Mac 两轮仍需验收 |
| R3 模型按需发起读取、结果回到同一对话 | 扩展识别结构化读取请求、执行受限 Native read、结果回填同一网页对话 | **关键 P0 新增/待验收**，不是 R2 已完成能力 |
| 模型原生调用 MCP tools | 需正式 MCP server/adapter、账号及产品模式的工具连接 | **尚未接入**；仅安装浏览器扩展或注入 JS 不能给 OpenAI 服务端模型注册工具 |

**技术可行性结论**：已有 Native 文件服务和 CLI 目录来源机制有明确可行路径；“网页内容注入 = 模型获得 MCP 权限”这条假设**明确不成立**。页面结构化文本的请求—结果往返具有工程实现路径，但 DOM 兼容、输入框回填、用户手势及目标对话一致性存在实际风险，**不能说整体已 100% 可行或已 100% 完成**。真实阻断必须以 P0 证据界定；不可绕过这一步直接报全链路 PASS。

### P0 验证与备用方案

在已接入的目录放一个未提前给模型的随机标记文件：模型只知道相对路径，产生单个读取请求；用户点击处理；扩展通过 Go 获得真实内容并送回**原对话**；用户通过网页发送；后续模型准确报告随机标记。分别记录「请求识别」「Native 实际读取」「目标输入框回填」「网页发送」「模型消费真实结果」。全套证据才算 P0 PASS。

若 DOM 回填不兼容：先根据真实页面证据做定向修复；允许“复制结果→用户粘贴/发送”作为**明确降级**，但不能把它记录为自动回填 PASS。若特定 ChatGPT 形态不支持稳定网页往返，另行探索正式 MCP 插件/私有隧道，但必须核对目标账号/对话模式并说明可能不能继续使用原普通会话，不能偷偷改用其他 Codex 线程或未公开 ChatGPT API。

本轮最小可靠交互：用户在扩展选择工作区及官方已有对话，模型按格式输出请求，用户点击“处理回答”；Native 读出后扩展回填，用户核对并通过网页发送；返回修改提案后仍需用户审阅/采用/保存。未经真实验证，不承诺无手势自动发送、无人值守循环。

## 3. CLI 临时读写：覆盖旧 R17 默认只读决策

确认的**目标行为**：

- `opendesk browser` ≡ `opendesk browser dev .`；`opendesk browser dev [目录]`、`opendesk-dev [目录]` 使用同一内核与权限语义。
- **新、尚未长期授权的目录**：本地用户在该目录显式运行受信 CLI，建立本次 CLI 租约的临时 `read-write` Workspace；无需第二条 `workspace add --access read-write`。
- 保持**已有长期 `read-write`** 授权并复用其真实工作区身份；**已有明确长期 `read-only`** 授权仍只读，不能被新的默认模式悄悄提升。
- 新增显式 `--read-only` 选项作为受限调试模式（是待实现参数，不是现有承诺）；同目录在线或已有授权发生模式冲突时返回明确结果，不虚称只读。
- 临时权限只对**本次受认证 CLI 显式给出的单个根目录**生效。支持被允许的子路径，但不自动扩权 Git 根、`HOME`、父目录、其他项目或网站脚本。
- 退出、Ctrl+C、断线、Host 恢复时，仅释放本 CLI 所有的临时授权；同目录重复启动不能抢夺原租约，A 退出不能影响 B；长期 `workspace add` 授权不因 CLI 结束而撤销。
- Node CLI 必须向 Go 明确传递本次申请的访问级别，Go 是最终权限裁决者；核对严格消息 schema/协议协商。**旧 CLI 请求未携带 access 字段时保留旧的只读语义**，不能因 Go 升级而自动把旧客户端升级为读写。
- 沿用真实目录 owner、inode/device、symlink、防穿越、文件扩展名、大小和会话限制；仅修改授权来源与生命周期，不开放任意 Shell、删除、跨目录写入或任意网页文件 RPC。

**现存事实 vs 目标**：截至本决策读取的源码，Go `internal/browserbridge/dev_workspace_unix.go` 的 `attachDevWorkspace` 仍用 `Access:"read-only"`；Browser R17 使用文档和两份旧 Mac 验收任务中的“默认只读”属于**旧行为基线**，不能当作新要求已实现。需要在后续实施后更新当前使用文档和验收提示词，同时保留旧候选的历史证据。Go 端补充决策：[R17.1 临时读写契约](https://github.com/shopable-ai/opendesk/blob/master/docs/integrations/browser/browser-dev-session-rw-r17-1-decisions.zh-CN.md)。

## 4. Workspace / Sidebar 只补缺口，不造第二套

复用 `src/native-agent/workspace.{html,js,css}`、`src/native-agent/source-label.js`、`src/ui/local-project.js` 和已有选择器、文件编辑器、静态预览、文件保存与冲突提示。`native-agent/workspace.html` 是文件入口，开发侧栏显示同一来源的程序信息；普通 Markdown/HTML 目录不必有程序清单，不自动 `npm run`。

核心身份：

| 名称 | 含义 | 禁止的误用 |
| --- | --- | --- |
| `sourceId` | 认证安装作用域内的目录来源关联 | 不能作为权限凭据，也不能只按目录名合并 |
| `workspaceId` | Native 当前文件授权和操作目标 | UI 历史缓存不能自己恢复授权 |
| `bindingId` / `providerEpoch` | 已声明可运行源码与来源路由 | 不因文件写权限而自动取得 RunHost 或网站权限 |
| `tabId` + `documentId` + 完整对话 URL | 当前网页会话身份 | SPA 换对话、刷新、关闭后不得继续使用旧绑定 |
| 提案 `requestId` + `path` + `baseSha256` | 单次模型输出与文件基线 | 与 Native 传输 requestId 不是同一个；旧提案不重放 |

已有同名项目标签逻辑应保留。Workspace 中目录 A → 侧栏打开 → 必须仍是 A；同名目录 B 不得借最近选择或缓存接管。当前 `workspace.js` 的侧栏入口仅传固定页面路径而未携带当前目录 ID，需**检查/修复并真机验证**，不能未经验证断言发生了故障。不同入口的未保存草稿不得被错误覆盖。

建议在现有选择区域紧凑显示：目录名称、同名区分、在线/离线、实际读写权限、当前相对文件、ChatGPT 绑定；在现有 R2 上下文入口增加可检查的“复制工作区上下文”。它只说明当前可用工具/协议及目标身份，**不是模型已能直接调用工具的证据**。授权判定只看 Go 实时返回结果，不看模型文字或 UI 缓存。离线、来源撤销、迟到结果不得落盘或自动切到其他目录。

## 5. ChatGPT 文本请求与数据回传必须设计成可核验协议

读取请求协议是**待设计/实现**的 R3 增量，优先复用 R2 `opendesk.workspace.edit.v1` 的严格结构化处理，不破坏现有有效单文件提案。至少要有版本、唯一请求 ID、绑定的工作区身份、受限操作名、相对路径和关联的应答 ID。首版最小能力是受限目录列举与单个受支持文本文件读取；写入仍必须经过现有用户审阅与 `files.write(expectedSha256)`。

- 从**当前绑定对话的本轮完整助手回答**识别请求，忽略用户消息、引用的示例、旧回答、正在生成的残缺块及多份冲突提案。
- AI 文本是**不可信的数据/建议**，不能凭模型输出新路径自动授权；扩展通过已绑定工作区进行路径解析和限制。
- Native 返回的文件内容默认需在扩展中提供清晰预览，用户决定是否发送到 ChatGPT；不自动上传整个目录、敏感凭据、绝对路径或隐藏文件。
- 结果回填必须在目标对话和页面身份两次核验后进行；如果输入框已经有用户草稿，不覆盖。未经实测不得把 `input.value=...` 或合成 DOM 事件等同于真实网页成功发送。
- 回填、用户确认发送、模型后续消费分别记录证据；未知结果、重复请求、断线、切工作区/对话应 fail closed。
- 保存沿用 R2 “审阅→采用草稿→显式保存→读回”的分离；草稿采用不写盘；成功回执必须属于**本轮**请求。Go 乐观并发 SHA 与原子发布不等于对不协作外部编辑器的绝对串行事务。

首版**不包含**自动执行 Shell、删除/重命名、多文件事务、全量源码搜索、整个 Next/Vite HMR、后台无限循环、其他电脑连接或新的私有 ChatGPT 接口。

## 6. 实施先后与最低验收

1. **能力盘点**：读取主分支当前实现、两仓 `AGENTS.md`、R17/R2 工作流与原始证据，区分已实现/缺失/可复用；不重建 Native Host、Resolver、侧栏或文件服务。
2. **P0 真正读取回传**：文件随机标记从真实 Go 到同一 ChatGPT 对话并被模型正确使用；不能用手动提前提供正文代替。
3. **CLI 默认读写**：新目录无需 `workspace add`，实际 Native 读写及独立磁盘验证；旧客户端兼容、显式只读、权限租约和复用长期授权。
4. **Workspace 多来源绑定**：两个不同路径但同名的 A/B 同时接入，选择/侧栏一致；跨源请求、迟到回包与离线状态不串线。
5. **同一对话两轮修改**：每轮新 `requestId`、新 `baseSha256`，先提案后明确保存，并独立读盘比较正文与 hash。
6. **故障注入**：外部编辑冲突、旧请求/旧提案重放、断线和结果未知、撤权、只读、目录逃逸、SPA 切换、已有输入框草稿。
7. **版本与交付**：实际 Go executable、CLI tarball/Node、Native manifest、扩展 ID/Chrome Profile、已加载 dist、源码 SHA 必须匹配；组件/DOM Mock/内存 Demo 不等于 Mac Chrome PASS。

状态分别记录 `IMPLEMENTED`、`COMPONENTS_PASS`、`MAC_NATIVE_CHATGPT_PASS`、`FAIL`、`NOT_TESTED`。对未完成的 P0 不允许宣传“总体 100% 可行”“已经 MCP 化”或“专家验收 95+”。设计评审与真机质量评分分开，**只有真实证据支持的级别才报告 PASS**。

## 7. 项目文档与后续实施入口

- [R17 旧日常入口](../../framework/local-directory-cli-r17.zh-CN.md)（已有只读基线，等待实施后的正式更新）
- [R17 已落地与历史证据](../../framework/workstreams/local-directory-cli-r17.md)
- [R2 当前对话单文件提案现状](webcodex-chat-edit-r2.zh-CN.md)
- [R2 原 Mac 两轮验收任务](../../framework/prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md)
- [本决策对应的 **R3 完整执行任务**](../../framework/prompts/goal-webcodex-browser-dev-chat-bridge-r3-main.zh-CN.md)
- [OpenDesk Go 对应权限契约](https://github.com/shopable-ai/opendesk/blob/master/docs/integrations/browser/browser-dev-session-rw-r17-1-decisions.zh-CN.md)

执行者必须区分“新规范覆盖旧默认只读**设计**”与“已完成对应的源码修改”；只记录实际提交和真机验收，不能回写历史 PASS。