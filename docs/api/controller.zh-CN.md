# Controller：自动化、结果和 Stop

[返回总入口](README.md)。Controller 在受控 Worker 中通过公开 `page` 操作获准网页；没有网页全局 document。本地项目、MCP、Sidebar 使用原 RunHost、Authority 和持久结果体系。

## main 输入

目录项目入口 default export 接收对象：

```js
export default async function main({page,params}) {
  return {
    title:await page.title(),
    url:await page.url(),
    heading:await page.locator('h1').textContent()
  };
}
```

实际项目调用对象包含 `page, params, axiosx, AppStorage, AppLocal, storage`；按需解构。params 来自 run/Sidebar 的 JSON 对象并受项目 paramsSchema 验证。本页主要覆盖 Page/Locator；HTTP 实例复用[现有测试示例说明](../../examples/tasks/README.zh-CN.md)，不通过 Controller 访问 Node 文件系统或 Native 内部协议。

**单文件或手工草稿调用 main() 时不传这个对象**，page/params 是注入变量，使用：

```js
async function main() {
  return {title:await page.title(),value:params.value ?? 0};
}
```

可直接运行的文件见 [title.js](../../examples/programs/local-controller/title.js)，多文件见 [local-controller](../../examples/programs/local-controller/README.md)。

## Page / Locator 最小用法

在 demo-form 的项目入口中可写：

```js
export default async function main({page}) {
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

run.deadlineMs 默认 30000，范围 1000–120000；到期以 E_TIMEOUT 收尾。Locator 等待默认 30 秒，单次 timeout 上限 120 秒，同时受运行期限约束；timeout:0 是立即到期。未知 native effect/缺回执/撤权仍保守拦截。[断连恢复](dependencies-and-errors.zh-CN.md#断连和未知结果)。

实现依据：[项目包装器](../../scripts/build-program-project.mjs)、[Worker main](../../src/scripting/sandbox/worker-runtime.js)、[MCP Session](../../native-agent/local-dev/session.mjs)、[持久结果](../../src/platform/host/controller-methods.js)。内部 run.start/get/stop 是实现协议，不是新增公开 MCP 工具。
