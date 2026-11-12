# Native 调用已安装 Task

本入口把已正式安装的 Controller Task 交给现有 `run.start` / RunHost / Authority。公开 Browser SDK 没有 `tasks.run`。它不发布、不安装 Task，也不创建 Runner、队列或嵌套执行槽。已有全局 `@slot` 被占用时立即拒绝 `E_OWNER`，调用方不能在占槽的 Controller 中等待另一个 Task。

**已实测通过当前 Go Native 的 installed-task `run.start` → `run.get`；`task.list` 发现仍有独立缺口。** 2026-10-27（北京时间），已安装的 `opendesk.chatgpt-calculation-relay@0.2.0`，sourceHash `94b604e88d82074d749f34ca81e62e276c414fd7a90bb8b29d642369829ada6f`，由公开 Native CLI 调用 `status` 和 `inspect`，从实际 Chrome/RunHost 返回 `completed`、`retirementState:released`、`workerRetired:true` 和 `slotAvailable:true`。例如 status Run `172464d6-165c-4fd1-92c6-b4133831aa76` / Result `b91f7472-4a15-448d-8472-24fef13d56fd` 独立读回「我的」已完成业务 `relay-isolated-017` 的 A=42、B=126；当时整个业务项目目录已临时离线。真实请求与 Host 回执见[调用请求](../../artifacts/chatgpt-task-0.2.0-20261026/owner4/relay-owner4-isolated17-status-request.json)、[完整终态回执](../../artifacts/chatgpt-task-0.2.0-20261026/owner4/relay-owner4-isolated17-status-result-2.json)及[解码结果](../../artifacts/chatgpt-task-0.2.0-20261026/owner4/relay-owner4-isolated17-status-decoded.json)；业务汇总见[证据索引](../../examples/programs/chatgpt-calculation-relay/EVIDENCE.json)。这些是当前持续开发扩展的安装/调用证据，production 扩展验收仍为 `NOT_TESTED`。

第二组「我的」业务 `relay-isolated-019`（19、25、3）也由同一固定版本完成，Native status Run `6ab91e6e-3408-4381-96a6-0ca51284fc7b` / Result `932ac97a-a71d-4f00-83fb-e04d0682e28d` 独立读回 A=44、B=132；[终态回执](../../artifacts/chatgpt-task-0.2.0-20261026/owner4/relay-owner4-isolated19-status-result-2.json)同样为 completed/released。第二组运行和回读时业务源码目录仍不存在，之后20个文件按原 SHA 完整恢复。

2026-10-26 的 `task.list` 两次现场调用仍记录为 **FAILED（连接关闭）**，不反复重试。原始[发现诊断](../../artifacts/chatgpt-task-0.2.0-20261026/native-discovery.json)保存 `E_EFFECT_UNKNOWN` / `Native connection closed` / `OUTCOME_UNKNOWN`，当时未发起 Run。只读源码核对发现 Go 仓库 `internal/browserbridge/wire.go` 的 allowlist 缺少 `task.list`，保留 `run.start`；这解释发现缺口，但不证明二进制逐字同源。本轮沿原 Go、认证、配对和服务运行，没有为此修改或重装 Go。调用者可从真实安装审阅/回执取得固定身份，再用已验证的 `run.start`。Node 接入的 91 项测试属于另外的 `NODE_PASS` 证据，不能代替上述原生回执。

## 获取当前身份

以下命令和 JSON 是协议调用说明；实际 Host、目标和任务身份必须当次读取。当前 Go 不支持 `task.list` 时，跳过发现命令并使用真实安装回执，不能猜测身份或更换 owner。

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

从列表选择 `enabled:true` 的实际 Task，或使用真实安装回执，把 taskId、version、sourceHash 原样填入 `request.json`。将同一 Host 的 `target.current.result.target` 完整复制为 target；示例中的参数须替换为该 Task 已审阅 paramsSchema 允许的内容。

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

## 原可信 Host 的 Task 准备与独立目标

`prepareTaskRun`、`inspectTaskRun` 和 `startControllerRun` 是原 Authority 面向已登记可信 Host 的内部合同，不是网页 API；这里的目标形式也不改变上述 Native `run.start` 的公开参数。普通 Content sender、Page USER_SCRIPT、网页事件和自报安装身份不能据此获得 Host 权限。

原准备记录接受两种目标：`borrowed` 必须提供精确的 tab/frame/document，并固定原生观察到的 URL；`owned` 只允许 `{mode:"owned",url:"https://已授权站点/路径"}`。`owned` 准备阶段核对真实 Task 安装、版本、manifest/source 哈希、安装 ID、授权代次、参数、目标站点范围与 Chrome 网站权限，然后在既有 `commandJournal` 固定这些输入。准备与查询都不创建 Run、不创建标签页、不导航当前页。

用户通过原可信审批入口批准后，Host 将准备记录中的 `source`、`params`、`target`、期限与安装身份原样交给 `startControllerRun`，并提供原 `taskPreparationId`。Authority 在原事务里重新检查授权并消费这份准备；`owned` 目标由原 Controller 的一次性创建账本建立后台标签页（`active:false`）。创建和导航仍走原 Run 的权限、停止和资源回收机制。准备后撤销再恢复网站权限，也不能使原准备重新获准提交。

同一准备的双击、并发提交或回执丢失，只能读到同一个 Run；不能另建目标或自动重发。`inspectTaskRun({preparationId})` 只读原准备和原持久 Run/Result，结果缺失或执行未获确认时保持 `unknown`。终态仍需核对原 Result 与资源释放。来源 Page 使用[已安装 Page 固定任务合同](page-userscript.zh-CN.md#已安装-page-的固定-task-审批请求)，只提交待审批请求；原 Host 在 `prepareTaskRun` 中引用 `pageRequestId`，Authority 重新核验该请求的安装、来源文档和固定输入。Page 不能直接调用 Host 的准备或执行方法。
