# 本地 Controller：修改模块后直接运行

## ESM R2.2：修改模块后明确运行

以下命令均在 **opendesk-browser 仓库根目录**执行。入口 `src/main.js → extract.js`，运行环境为 **Controller Worker / OpenDesk page Locator**。项目沿用真实 `opendesk.project.v1` 元数据。

完成一次 Native/扩展配对后，日常目录开发使用现有 [R17 入口](../../../docs/framework/local-directory-cli-r17.zh-CN.md)：

```sh
opendesk browser dev "$PWD/examples/programs/local-controller"
```

网页授权范围：`http://127.0.0.1:43111`。本地测试页统一用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`；若端口已被其他任务占用，先核对服务，不关闭对方进程。HTTPS-only 项目日常打开其原授权网站，本轮 localhost 验收只改测试副本，原规则保持不变。

在同窗口 Sidebar 选择已连接目录并明确运行；Page 还需 Chrome「允许用户脚本」。高级 [MCP 路径](../../../docs/api/mcp-local-development.zh-CN.md) 使用 `status/attach` 返回的真实 `bindingId`，`run` 使用新的有意执行 `requestId`，以实际返回的 `previewId` 或 `runId` 查询 `result`。Page 不传 Controller params/deadline；Controller 搜索示例参数为 `{"keyword":"OpenDesk"}`。

预期：{version:1,title,heading}；读取网页标题和 h1，无提交动作。修改 `src/extract.js 的 version:1 改为 version:2` 并保存后，页面不会自动操作；再次明确运行才应出现新 `sourceHash`、新运行身份及新结果。目录直连无须另跑 build:program、上传编译结果或重装扩展。旧结果仍对应原源码。发生未知效果时只用原 `admissionRequestId` 查询，不自动重放。

正式冻结交付和 Node 构建验证：

```sh
node scripts/validate-program-project.mjs examples/programs/local-controller
npm run build:program -- examples/programs/local-controller
node --test tests/environment/sidebar-project-demo.test.mjs tests/environment/program-build.test.mjs tests/integration/esm-examples-acceptance.test.mjs
```

集成测试的完全离线证明要求 Node 26.3.1（操作系统拒绝网络）；它是 **Node L2**。输出目录以构建回执 `outputDirectory` 为准，`BUILT_UNVERIFIED` 不等于运行成功或 Installed。真实 Chrome 使用同一 [Native runner](../../../tests/framework/local-dev-native-acceptance.mjs) 的 `OPENDESK_DEV_SLICE=esm-examples`，隔离参数和原始证据见 [R2.2 验收记录](../../../docs/framework/workstreams/esm-r22-examples-01a1296d.zh-CN.md)。

当前等级：**L2 + 本机 Chrome L4 PASS；新 sourceHash/version 与旧 runId/resultId 独立保存**。这些结论绑定该记录的源码/扩展包身份；不代表任意新版本、任意网站或最终安装验收。

## 原有使用方式与冻结交付
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
