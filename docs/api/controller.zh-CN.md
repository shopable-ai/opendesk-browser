# Controller：自动化、结果和 Stop

[返回总入口](README.md)。Controller 在受控 Worker 中通过公开 `page` 操作获准网页；没有网页全局 document。本地项目、MCP、Sidebar 使用原 RunHost、Authority 和持久结果体系。

## main 输入：推荐零参数环境变量写法（Controller）

**多文件 ESM 项目**应优先写 `export default async function main()`，直接使用受控 Worker 里的 `page`、`params` 和已预装 `_`、`dayjs`：

```js
export default async function main() {
  const title = await page.title();
  const url = await page.url();
  return {
    title,
    url,
    words: _.words(title),
    date: dayjs().format('YYYY-MM-DD')
  };
}
```

**Sidebar 手写草稿／独立单文件**不通过 ESM 构建器，去掉 `export default`：

```js
async function main() {
  return {title:await page.title(),keyword:params.keyword ?? ''};
}
```

运行器内部的 `AsyncBody` 受控词法作用域提供 `page`、`params`、`axiosx`、`AppStorage`、`AppLocal`、`storage`；`src/libs/core.js` 在运行前提供 `_`、`dayjs`、`OpenDeskLibs`。这些是用户可以直接使用的环境变量，**不要让用户在 `main()` 签名解构参数、创建 `new Page()` 或 npm 安装已有内置库**。其中 `page` 是 Worker 的词法绑定，**不是** `window.page` / `globalThis.page`；Controller 不存在网页 `document`。params 仍由 run/Sidebar JSON 提供并受 paramsSchema 校验，不等于 `main` 必须声明形参。

历史多文件代码 `main({page,params})` 仍由 `scripts/build-program-project.mjs` 内部兼容调用支持；这只是避免破坏已安装程序/旧源码，**不再是生成新代码的推荐示例**。本页覆盖现代 Page/Locator；特权 HTTP 应使用受限 `axiosx` 而不是把 Page 普通 Axios 假装成 Broker。实现范围详见[零参数预置运行合同](runtime-globals-and-preinstalled-libraries.zh-CN.md)。

真正的零参数多文件示例：[controller-globals-zero-arg](../../examples/programs/controller-globals-zero-arg/README.md)；单文件示例：[title.js](../../examples/programs/single-file/title.js)。

## Page / Locator 最小用法

在 demo-form 的项目入口中可写：

```js
export default async function main() {
  await page.getByLabel('搜索关键词',{exact:true}).fill('OpenDesk');
  await page.getByRole('button',{name:'搜索',exact:true}).click();
  await page.getByText('搜索完成',{exact:true}).waitFor({state:'visible'});
  return {result:await page.locator('#results').textContent()};
}
```

这是有意填写和点击的例子，执行前核对目标网站与业务效果。标题读取例子没有这些副作用。

| API | 返回 / 用法 |
| --- | --- |
| `page.title()` / `page.url()` | Promise，读取标题 / URL |
| `page.locator(selector)` | 构造绑定目标文档的 Locator，构造时不读取网页 |
| `page.getByRole(role,{name,exact})` | 按角色和可访问名称定位 |
| `page.getByLabel(text,{exact})` / `getByText` / `getByTestId` | 按对应语义定位，可在容器 Locator 中继续定位 |
| `locator.count()` | Promise<number>，立即读取，可为 0 |
| `textContent()` / `getAttribute(name)` | Promise<string\|null>，严格单匹配，不隐式等待 |
| `fill(value)` / `click()` | Promise<void>；操作完成不等于业务异步完成 |
| `waitFor({state,timeout})` | attached/detached/visible/hidden；默认 visible |

多匹配违反严格模式；现代 click 是 DOM click，fill 使用原生 setter 和变更事件，不能描述成真实系统鼠标/键盘输入或完整 Playwright 兼容。完整参数、观察和错误参考[现代 Page/Locator API](../framework/modern-page-api.zh-CN.md)。

## 运行与源码身份

由 MCP 客户端调用 run，或在 Sidebar 点击「运行草稿」。run 返回 `runId`、`revision`、`source` 和 `completion:"PENDING"`，仅证明入场。MCP 的 `source` 是源码元数据，不含原源码正文或 source map。

检查 `revision.sourceHash === source.sourceHash`。revision 描述本次冻结源码，`runRevision` 是运行状态版本，两者不能混淆。后续改文件只影响下一次有意运行；受控导航只能沿原 Authority 目标会话推进，不能切到无关标签页。

## 读取持久结果

调用 result，参数 `{"runId":"原 runId"}`。返回的主要结构：

```text
run: runId / resultId / state / revision / retirementState / runRevision …
results[]: tag / resultId / runId / revision / state / outcome …
kind: controller / runId / requestId / sourceHash / slotAvailable
成功时的顶层 valueProtocol / valueWire / valueIsJson / 可选 value
失败持久结果的顶层 error
```

在 results 中选 `tag:"controller-result"`、runId 匹配、resultId 等于 `run.resultId` 的记录，核对**结果自身 revision/sourceHash**。源码当前版本不能替代旧结果身份。

- 成功：匹配结果 state 为 completed，`outcome.ok:true`，持久值位于 `outcome.valueWire`。MCP 同时在返回顶层提供 `valueProtocol:"opendesk.value.v1"`、valueWire；可无损 JSON 表达时，顶层额外返回 `valueIsJson:true` 和 value。
- 不能无损 JSON 表达时顶层 `valueIsJson:false`，使用 valueWire；undefined、负零等不会被悄悄转为 null/0。
- 失败：`outcome.ok:false`，读取匹配结果的 `outcome.error` 或 MCP 顶层 error；工具查询成功不等于业务运行成功。可核验 V8 坐标存在时，顶层另有 `diagnostic:{sourceHash,location:{file,line,column},generated:{line,column},basis}`，行列均为 1-based；它绑定原冻结源码，不改写持久 error，缺少映射时不猜行号。[已合入的改错闭环](../framework/local-ai-loop-r1.zh-CN.md)。
- 收尾：确认 `run.retirementState:"released"`。终态和资源释放分开，只有 completed 不足以证明槽已释放。网站撤权导致 MCP E_PERMISSION，不能当作持久结果不存在。

local-controller 首次 MCP 顶层 value 应为 `{version:1,title:"OpenDesk Browser Test Lab"}`。改 extract.js 为 version 2，保存后使用新 requestId 运行；新 runId/resultId 对应新值，查旧 runId 仍得到旧值和旧 revision。不要把更新后的 sourceHash 写回旧结果。

## Stop 和期限

```json
{"name":"opendesk.dev.stop","arguments":{"runId":"原 runId","requestId":"tutorial-stop-1"}}
```

Stop 走原 RunHost，停止原因 E_CANCELLED；完成回执后继续查询原 runId 确认终态与 released。它不撤销已发生的点击、请求、提交或下载。Stop 丢 ACK 时只读查原结果，不能自动重发 Stop。

run.deadlineMs 默认 30000，范围 1000–120000；到期以 E_TIMEOUT 收尾。Locator 等待默认 30 秒，单次 timeout 上限 120 秒，同时受运行期限约束；timeout:0 取消局部超时，仍受运行期限约束。未知 native effect/缺回执/撤权仍保守拦截。[断连恢复](dependencies-and-errors.zh-CN.md#断连和未知结果)。

## 已安装 Task 的存储与调用

Task `siteOrigins` 接受 1–8 个唯一 canonical 精确 HTTP(S) origin；拒绝空、重复、超限、credentials、路径、opaque origin 与通配（包括 `<all_urls>`）。在列表内任一 origin 上，同一固定源码的成功 run、持久结果及匹配 native receipt 即可通过 `verifyTaskCandidate({taskId,version,runId})` 进入 verified → Available → 安装；安装审阅覆盖完整列表。`verification.origin` 记录真实验证站点，不表示其余站点运行成功，localhost fixture 也必须在列表内。单 origin 旧流程保持可用。证据绑定 sourceHash、manifestHash 和内置运行库身份；改动列表须新版本重新验证。安装/委托逐次校验真实目标 origin、固定 Revision 与安装代际，跨站 navigation 继续走原目标 session/Authority，列表不扩充网络授权。

固定 ChatGPT bridge 的单站 intent 入口和 Cloud 程序交付审阅入口暂不接收多 origin Task，分别明确返回 `E_BRIDGE_UNSUPPORTED_SCOPE` / `E_CLOUD_UNSUPPORTED_SCOPE`；不会自动选择列表首项。多 origin 的本地项目审阅安装和带真实目标的 Task/委托运行遵守上述通用合同。

Task 默认只有 `page.automation`。需使用 AppStorage 的任务在固定 manifest 中显式声明 `storage.persistent`；只开放 getItem/setItem/removeItem/clear 四个 AppStorage 方法，不因名称相同的能力标记开放 Chrome local、HTTP、Cookie 或 Native。存储按 namespace + 稳定 taskId 隔离，同一任务跨版本保留；草稿旧记录不自动迁入，脚本不能指定其他任务的存储作用域。

使用受控 `axiosx.get/post/put/delete` 的已安装 Task 必须在同一固定 manifest 中显式声明 `network`。该许可只开放这四项请求，不授予其他服务、Cookie 或存储权限；请求仍限当前获准目标同源，并在发送前、结果返回后重新检查原 Authority。Stop、停用和网站撤权均阻止后续调用，未知效果不自动重放。

**本机 HTTP 开发路径**：`axiosx.get(url,{transport:'isolated-http',userAgent:'Example/1.0',headers:{Accept:'application/json'},responseType:'text'})` 当前仅在 development 构建接受 `http://127.0.0.1:43121` 的 GET。`userAgent` 可省略以继承 Chrome 默认值，显式值限 1–512 个可打印 ASCII 字符；不能放入 `headers['User-Agent']`。普通 Fetch 路径继续拒绝 UA 覆盖。固定可信请求页按每请求独立 tab、精确 URL 和扩展 initiator 隔离 UA 规则，完成、Stop 或超时后清理页面和规则；无法确认清理则返回 `E_EFFECT_UNKNOWN` 并封锁该 driver 的后续请求。此路径不带 Cookie、不跟随重定向、响应最多 8192 字节，仍受原 15 秒服务上限与消息预算约束。返回的 `request.runId/requestId` 来自实际 Host 操作，可与自有回显服务器关联。生产、公网及其他本机地址均未开放；它不替代正式 HTTP 采集的计划、审批与生产出口合同。

Task manifest 的可选 `deadlineMs` 为1000–120000整数，默认30000；安装审阅显示权限与期限，全部受 manifestHash 绑定。「我的」和本地项目按该声明启动；安装版共享 Authority 强制该上限，外部调用只能缩短。Stop、撤权及资源退役合同保持有效。

「我的」手动运行使用固定安装版本。另有原 Native Agent 的[已安装任务调用](native-installed-tasks.zh-CN.md)：只读 `task.list` 发现真实安装身份，`run.start` 的 `installed-task` 来源必须明确 pin taskId/version/sourceHash，经原 RunHost 和 Authority 执行；不读取源码 Provider，不是新增开发 MCP 工具。工作流和 Worker SDK 没有因此增加 `tasks.run`。新调用合同的 Node 验证与真实 Chrome/Native 验收分别记录，不能互相代替。

实现依据：[项目包装器](../../scripts/build-program-project.mjs)、[Worker main](../../src/scripting/sandbox/worker-runtime.js)、[MCP Session](../../native-agent/local-dev/session.mjs)、[持久结果](../../src/platform/host/controller-methods.js)。内部执行协议与公开 Native/MCP 接口各自遵守其文档，不把直接调用内部函数当作公开 SDK。
