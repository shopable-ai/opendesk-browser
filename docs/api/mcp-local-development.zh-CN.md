# 七个 MCP 本地开发工具

[返回总入口](README.md)。工具由已配置的本地 stdio MCP 客户端调用，不是网页全局对象，也不是七个进程。示例采用 `tools/call` 的 params 对象 `{name,arguments}`；Codex 通常替你完成协议封装。bindingId/runId/previewId/registrationId 的占位文字必须替换成真实返回值。

## 公共参数与返回约定

- 每个工具顶层参数都是对象，`additionalProperties:false`；未知字段 E_SCHEMA。普通字符串 minLength:1，schema 没有 maxLength/pattern；实际路径、ID、origin 另有运行时验证。
- run.requestId 与传入的 Stop requestId 使用 `[A-Za-z0-9._:-]`，1–100 字符，标识一次有意操作。run 已登记的 ID 不重新执行；新的有意运行用新 ID，未知效果不重放。
- params 是 JSON 对象，不能是 null/数组；Controller 另按项目 paramsSchema 验证。Page 建议省略 params/deadlineMs，只接受空 params 和默认 30000ms。
- result/stop 恰选 runId、previewId、admissionRequestId **一个**。resultId 是持久结果身份，不是工具选择器。
- diagnostics 不要求选择器，但最多选一个执行选择器；这是实际参数校验，schema 没有该 oneOf。

MCP 成功返回的业务数据 D 位于 `result.structuredContent`，`result.content[0].text` 是 D 的 JSON 文本。下面各节描述 D，不再重复 JSON-RPC 外壳。工具业务错误会返回 `isError:true` 和 `structuredContent.error`，例如以下是 MCP result 对象的示意：

```json
{"isError":true,"content":[{"type":"text","text":"{\"error\":{\"code\":\"E_SCHEMA\",\"message\":\"Unexpected or missing tool arguments\",\"phase\":\"local-dev\",\"outcome\":\"NOT_DISPATCHED\"}}"}],"structuredContent":{"error":{"code":"E_SCHEMA","message":"Unexpected or missing tool arguments","phase":"local-dev","outcome":"NOT_DISPATCHED"}}}
```

error 还可能带 location/requestId/admissionRequestId/runId/previewId。outcome 以实际返回为准；查询失败中的 NOT_DISPATCHED 不证明原业务未执行。协议错误走 JSON-RPC error（未初始化 -32002、未知工具 -32602、未知方法 -32601、解析失败 -32700）。通常由 MCP 客户端处理初始化。

## 1. opendesk.dev.attach

| 参数 | 要求 |
| --- | --- |
| path | 必填，绝对项目目录或 .js/.mjs 文件；realpath 精确属于 --allow-project 集合 |
| runtimeKind | 单文件必填：controller / page-userscript；目录从 package 读取 |
| entryFormat | 可选，默认 async-main；classic-userscript 仅 Page 单文件 |
| siteOrigin | 单文件必填，精确 HTTP(S) origin，无路径或末尾斜杠 |

目录操作只传 path，其他三个字段用于单文件配置；不要把它们当成覆盖 package 范围的手段。目录和 Controller 单文件只用 async-main。授权目录不自动授权其子文件作为独立绑定。

```json
{"name":"opendesk.dev.attach","arguments":{"path":"/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-controller"}}
```

返回 `{bindingId,name,runtimeKind,source:"local-files",connected:true}`；目录 runtimeKind 为 from-package。不运行源码、不授予网站权限。单文件示例见[项目格式](local-projects.zh-CN.md#单文件)。更改已有运行类型/范围先 detach，避免 E_DEV_CONFLICT。未允许路径 E_DEV_AUTH，非法文件/类型 E_DEV_RUNTIME，非法 origin E_DEV_ORIGIN。

## 2. opendesk.dev.status

无必填；可选 bindingId（核对本地绑定）、registrationId（选真实 Host）。

```json
{"name":"opendesk.dev.status","arguments":{}}
```

连接成功返回 `{connected:true,bridge,target,targetError,projects,localProjectProvider?}`：

```text
projects[]: bindingId / name / source:local-files
bridge: extensionId / bridgeVersion / nativeConnected / enabled / hostRegistrations
target: null 或 {registrationId,target:{windowId,tabId,frameId,documentId,url,origin}}
targetError: null 或 {code,message}
```

connected 只说明 Native 可达，仍检查 enabled/nativeConnected、Host 和 targetError。多个 Host 可能 E_HOST_AMBIGUOUS，传实际 registrationId；没有 Host 的 target 可以是 null。Native 不可用时正常返回 `{connected:false,projects,error:{code,message}}`，**不设置 isError:true**，所以不能只看工具是否报错。

## 3. opendesk.dev.run

| 参数 | 要求 |
| --- | --- |
| bindingId / requestId | 必填，已绑定项目 / 本次有意执行 ID |
| params | 可选对象，默认 {}，Controller 按项目 schema 校验 |
| registrationId | 可选，多个 Host 时明确选择 |
| deadlineMs | Controller 可选整数 1000–120000，默认 30000；Page 不自定义 |

```json
{"name":"opendesk.dev.run","arguments":{"bindingId":"实际 bindingId","requestId":"reference-run-1","params":{},"deadlineMs":30000}}
```

这个例子是 Controller；Page 省略 params/deadlineMs。返回：

```text
Controller: kind:controller / requestId / runId / state / sourceKind:draft
            revision / completion:PENDING / target / executionTarget / source
Page: kind:page-userscript / requestId / previewId / sourceHash / target
      state:preview-pending / durable:false / 可选 managedUI、bindingId / source
```

两类 source 的元数据包括 bindingId/projectId/runtimeKind/managedUI/entry/entryFormat/sourceHash/sourceBytes/inputHash/validationHash/files/cacheHit/capturedAt/siteOrigins，以及可选 pageRules/paramsSchema；files 项为 path/bytes/sha256。不含 sourceUtf8/sourceMapUtf8。run.target 是实际目标对象，区别于 status.target 的外层包装。

每次运行重读当前源图，不在错误时使用旧源码。请求捕获并再次校验原 Host、网站、documentId 与哈希。会话最多 256 个 admission，同一时刻只入场一个，忙时 E_OWNER；历史达到上限按真实错误处理。已有 ID 的确认失败返回 E_REQUEST_REUSED，未确认返回 E_EFFECT_UNKNOWN，不用它重试。PENDING 不表示成功。

## 4. opendesk.dev.result

恰选 runId / previewId / admissionRequestId 之一，没有其他参数：

```json
{"name":"opendesk.dev.result","arguments":{"runId":"原 Controller runId"}}
```

Controller 返回 `{kind:"controller",runId,requestId,sourceHash,run,results,slotAvailable}`；成功额外有顶层 valueProtocol/valueWire/valueIsJson/可选 value，失败持久结果额外有 error。结果记录包含 tag/resultId/runId/revision/state/outcome；核对原 run.resultId、结果自身 revision 和 released。详见[持久结果读取](controller.zh-CN.md#读取持久结果)。

Page 调用参数改成 `{"previewId":"原 previewId"}`；返回 kind/previewId/sourceHash/target/state/durable:false/requestId，以及可选 managedUI/bindingId/result/error/cleanup。result 是原 USER_SCRIPT 预览回执，非持久 Controller Result。[Page 说明](page-userscript.zh-CN.md)。

丢 run 入场 ACK 时：

```json
{"name":"opendesk.dev.result","arguments":{"admissionRequestId":"reference-run-1"}}
```

仅限当前会话原先登记的 run.requestId，按原 Host/method/digest 只读恢复 runId 或 previewId，再查询结果；不读当前文件编译、不重发执行。NOT_FOUND/OUTCOME_UNKNOWN 不证明未执行。会话归属不匹配 E_DEV_RUN/E_DEV_PREVIEW，哈希/身份变化 E_DEV_HASH，撤权 E_PERMISSION，终态已 released 却无可读持久结果 E_RESULT_UNAVAILABLE。

## 5. opendesk.dev.stop

恰选一个执行选择器，可选本次 Stop requestId（省略生成 UUID）：

```json
{"name":"opendesk.dev.stop","arguments":{"runId":"原 Controller runId","requestId":"reference-stop-1"}}
```

Controller 走原 RunHost，普通返回 runId/state/cancelSeq/runRevision；已进入结算的路径可返回 runId/state/result/retirement。必须再 result 确认 released，Stop 回执不证明已收尾或业务回滚。

受管 Page 以 previewId 调用，返回 previewId/sourceHash/state:preview-retired/receipt；receipt 要求 ok:true、scope:managed-ui-only，并有 format/nonce/requestNonce/instances 等实际清理身份。非受管 E_PAGE_PREVIEW_STOP_UNSUPPORTED。

admissionRequestId 可先恢复原 run 身份再 Stop，但不是 Stop 自身的恢复键。Stop/清理丢 ACK 只读查原 runId/previewId，不自动重发 Stop 或换 ID 清理。

## 6. opendesk.dev.diagnostics

无必填，可选 bindingId，或最多一个 runId/previewId/admissionRequestId。

```json
{"name":"opendesk.dev.diagnostics","arguments":{}}
```

| 参数组合 | 返回 |
| --- | --- |
| 无参 | projects、errors 列表，每项有 bindingId 及错误 |
| bindingId | bindingId、lastError；无错误 lastError:null，不主动触发新解析 |
| runId 或 previewId | 对应 result 返回 |
| admissionRequestId | admissionRequestId/state/source、可选 ledgerState、runId 或 previewId、error |
| bindingId + admissionRequestId | 同上并核对原请求项目归属 |

bindingId + runId/previewId 实际直接走 result，不额外验证 bindingId 的项目归属；需要归属核对时使用返回身份，勿赋予不存在的保障。没有真实映射时不编造源码行号。diagnostics 是只读，不启动新业务。

## 7. opendesk.dev.detach

必填 bindingId：

```json
{"name":"opendesk.dev.detach","arguments":{"bindingId":"实际 bindingId"}}
```

返回 `{bindingId,connected:false}`，移除绑定/解析缓存。它不 Stop 已入场运行、不改文件、不删除持久结果；旧执行保持原冻结输入和当前会话归属。已移除绑定 E_DEV_DETACHED。

## 权限与恢复共同边界

工具不自动授予网站权限；需要 Native 权限/启用、网站授权及精确实时 Sidebar Host。MCP EOF 关闭 provider，不盲目取消或重放浏览器操作。重启 MCP 重新绑定允许目录，但不恢复旧请求/Run/Preview 归属；新 registration 不接管旧执行。内部 request.get/run.start/page.preview 等不是第八个 MCP 工具。

错误和恢复操作见[故障排查](dependencies-and-errors.zh-CN.md#断连和未知结果)。接口事实来源：[工具 schema/包装](../../native-agent/local-dev/mcp.mjs)、[Session](../../native-agent/local-dev/session.mjs)、[Resolver](../../native-agent/local-dev/resolver.mjs)、[Native Host 消费器](../../src/native-agent/host-adapter.js)。
