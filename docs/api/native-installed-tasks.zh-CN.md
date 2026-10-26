# Native 调用已安装 Task

本入口把已正式安装的 Controller Task 交给现有 `run.start` / RunHost / Authority。公开 Browser SDK 没有 `tasks.run`。它不发布、不安装 Task，也不创建 Runner、队列或嵌套执行槽。已有全局 `@slot` 被占用时立即拒绝 `E_OWNER`，调用方不能在占槽的 Controller 中等待另一个 Task。

本次证据是 Node fixture 中的实际 adapter、RunHost、Authority、存储和 Native service；Chrome API 与 Worker 执行使用替身。真实 Chrome 安装、Native 配对、运行均为 **NOT_TESTED**。本轮没有打开浏览器、重启服务或更新本机安装。旧 Native Host 若仍使用复制快照，源码 allowlist 更新不代表该快照已经支持新方法；部署另行处理。

## 获取当前身份

使用已完成合法认证和授权的现有 Native CLI，不读取或复制 socket credential。需要可用的已登记 Side Panel Host、Native Messaging 权限和既有网站授权。多个 Host 时必须指定 `registrationId`。

```sh
node native-agent/cli.mjs bridge.status
```

把其中选定的真实 Host 写入 `host.json`：

```json
{"registrationId":"实际的-host-registrationId"}
```

```sh
node native-agent/cli.mjs task.list --file host.json --request-id discover-installed-1
node native-agent/cli.mjs target.current --file host.json --request-id current-target-1
```

`task.list` 通过既有 Native 认证、nativeMessaging 授权、Host 路由和 `listTaskCatalog`，连接 installed/catalog 的相同 taskId/version/manifestHash，仅返回：

```json
{
  "v":1,"kind":"response","requestId":"discover-installed-1",
  "result":{"tasks":[{
    "taskId":"实际-taskId","version":"1.0.0",
    "sourceHash":"实际的64位小写SHA256","manifestHash":"实际的64位manifest摘要",
    "permissions":["page.automation"],"siteOrigins":["https://目标站点"],
    "deadlineMs":60000,"enabled":true,
    "generation":1,"installationId":"实际安装UUID"
  }]}
}
```

此为结构示意，不能直接当真实身份使用。未安装的候选不列出；已停用条目显示 `enabled:false`，不能运行。列表不返回源码、验证结果、历史 Run 或业务结果。generation/installationId 仅供观察，客户端声明不能授予执行权限。历史安装可能返回二者均为 null，沿原 Authority 的迁移及竞态规则处理。

## 固定身份并运行

从列表选择 `enabled:true` 的实际 Task，把 taskId、version、sourceHash 原样填入 `request.json`。将同一 Host 的 `target.current.result.target` 完整复制为 target；示例中的参数须替换为该 Task 已审阅 paramsSchema 允许的内容。

```json
{
  "registrationId":"实际的-host-registrationId",
  "source":{
    "kind":"installed-task",
    "taskId":"实际-taskId",
    "version":"1.0.0",
    "sourceHash":"实际的64位小写SHA256"
  },
  "params":{},
  "target":{
    "windowId":5,"tabId":10,"frameId":0,
    "documentId":"实际-documentId",
    "url":"https://目标站点/实际路径","origin":"https://目标站点"
  }
}
```

```sh
node native-agent/cli.mjs run.start --file request.json --request-id installed-call-1 > receipt.json
```

三项 pin 全部必填；source 内不允许 permissions/generation 等额外字段。adapter 用 `resolveInstalledTask({taskId})` 获取权威安装身份，精确核对 taskId、version、manifest.program.sourceHash 和 contentHash，转换成原 `saved` source，并传服务端的 expectedTaskGeneration/expectedTaskInstallationId。调用者在顶层提供同名值不会被转发。Authority 在原事务中重新检查安装、撤权代次、版本、参数、目标及槽，解析后升级/停用/撤权不能越过检查。

`deadlineMs` 可省略，采用已审阅 manifest.deadlineMs；manifest 未声明时为 30000。声明与请求必须是 1000..120000 的整数，请求只允许小于或等于 manifest 期限，不能延长。开发草稿和普通 saved source 原行为保留。不会调用 Chrome 权限弹窗，缺少授权须通过原用户入口处理。

准入回执形如：

```json
{
  "v":1,"kind":"response","requestId":"installed-call-1",
  "result":{
    "runId":"原Controller-runId","state":"running","sourceKind":"saved",
    "revision":{"scriptId":"task:实际-taskId:1.0.0","revision":1,"sourceHash":"实际SHA256"},
    "completion":"PENDING","target":{"示意":"原精确目标快照"},
    "executionTarget":{"示意":"Authority返回的执行目标"}
  }
}
```

这是结构示意，真实 revision/target 以原回执为准。`PENDING` 只证明准入，不能当业务成功。将原 registrationId 和 runId 保存为 `run.json`：

```json
{"registrationId":"实际的-host-registrationId","runId":"原Controller-runId"}
```

```sh
node native-agent/cli.mjs run.get --file run.json --request-id installed-read-1
node native-agent/cli.mjs run.stop --file run.json --request-id installed-stop-1
```

`run.get` 查询原持久 Controller snapshot，包含 run/results/downloads；终态还须结合 result 和 retirement 判断。`run.stop` 沿原停止及资源回收链，不能将停止请求 ACK 当作所有副作用已清除。两个方法只允许最初 Native ledger 确认归属的同一个注册 Host。

## 回执丢失与 unknown

同一 requestId + 相同规范化输入及 Host 只返回原回执或 unknown，不重复派发；更改参数复用同一 ID 返回 `E_REQUEST_CONFLICT`。超时、断连或持久化结果未知不能换新 ID 盲目重跑。

没有拿到 runId 时，可只读查询原 admission。使用原 `request.json` 生成 `admission.json`（本地计算摘要，不访问凭据）：

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import {agentDigest} from './src/native-agent/protocol.js';
const {requestId:ignored,...params}=JSON.parse(fs.readFileSync('request.json','utf8'));
const registrationId=params.registrationId;
const requestDigest=await agentDigest({method:'run.start',params,registrationId});
fs.writeFileSync('admission.json',JSON.stringify({registrationId,
  admissionRequestId:'installed-call-1',admissionMethod:'run.start',requestDigest},null,2));
JS
node native-agent/cli.mjs request.get --file admission.json --request-id installed-reconcile-1
```

须使用原请求逐字段输入，不能用新的 target 或安装身份替换。`ACKNOWLEDGED` 返回 admission.runId 后继续 `run.get`；`OUTCOME_UNKNOWN` 表示效果未知，保持原请求并只读对账；`FAILED_CONFIRMED` 是已确认拒绝；`NOT_FOUND` 只说明当前账本没有该 admission，不证明业务从未发生。`hostAvailable:false` 不代表重建 Host 后可继承旧运行，跨 Host/摘要不符会拒绝。

常见拒绝：`E_SCHEMA`（pin/期限格式）、`E_REVISION`（pin 或授权代次改变）、`E_PERMISSION`（未安装、停用、站点或权限不符）、`E_PARAMS`（参数不符合合同）、`E_DOCUMENT_STALE`（精确目标改变）、`E_OWNER`（执行槽占用）、`E_PERMISSION_REQUIRED`（Chrome 网站授权缺失）。不自动重放、不自动授权。

现行基础合同：[Native Agent Bridge](../architecture/browser-framework/native-agent-bridge-r1.zh-CN.md)。
