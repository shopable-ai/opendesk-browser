# 本地 Controller：修改模块后直接运行

> R10.1 当前中文使用入口：[快速入门](../../../docs/api/quickstart.zh-CN.md)，[七个 MCP 工具](../../../docs/api/mcp-local-development.zh-CN.md)。复用原候选证据，按相关输入判断是否需要重测；不以示例运行代替安装/F3。 单文件例子 [title.js](../single-file/title.js) 的 exact-path 授权、参数及再次运行见[项目格式](../../../docs/api/local-projects.zh-CN.md#单文件)。

入口 `src/main.js`，网页提取逻辑在 `src/extract.js`。项目沿用 `opendesk.project.v1`，只读取标准测试页，不点击或提交表单。

一次性连接方法见 [本地开发 MCP 指南](../../../docs/framework/local-development-r22.zh-CN.md)。在仓库根目录启动标准测试页：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html` 和同窗口 OpenDesk 工作台。从 `opendesk.dev.status` 获取启动时自动绑定的本目录 bindingId，或让 Codex 调用 `opendesk.dev.attach` 绑定本项目绝对路径；再调用 `opendesk.dev.run({bindingId,requestId,params:{}})`，以返回的 `runId` 查询 `opendesk.dev.result`。

然后把 `src/extract.js` 修改为：

```js
export async function readSummary(page) {
  return {
    version:2,
    title:await page.title(),
    heading:await page.locator('h1').textContent()
  };
}
```

再次 `dev.run`，使用新的有意运行 `requestId`。新结果应包含网页真实 `heading`，新 `sourceHash` 应不同，旧运行的结果和哈希仍保持原值。两次运行间不执行 `build:program`、不导出或上传 JSON、不重新安装扩展。

`requestId` 不是自动重试键。若入场 ACK 丢失，在同一个 MCP 会话调用 `opendesk.dev.result({admissionRequestId:原requestId})` 只读恢复原身份；它不重新解析当前源码。`NOT_FOUND` 或 `OUTCOME_UNKNOWN` 时先核对原运行与网页状态，不能换一个 ID 盲目重复可能有副作用的程序。MCP 重启后目录可重新绑定，旧运行归属不自动恢复。

正式发布时才使用 `npm run build:program -- examples/programs/local-controller`；得到的 Task v1 包仍须经过 Candidate、验证、Available 和显式安装。源码目录的修改不会改变已经安装的任务。

真实 Chrome 回执与未验证边界见 [本轮工作记录](../../../docs/framework/workstreams/local-dev-r22-c036.json)。
