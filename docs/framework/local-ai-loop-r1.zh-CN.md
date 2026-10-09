# 本地 AI 修改、执行、定位与修复

本地开发使用已有 `opendesk.dev.*` stdio MCP，接到同一个 Native、Controller/RunHost 或 Page USER_SCRIPT。Sidebar 保留现有 JavaScript 编辑器；用户已在本轮明确接受并行 main 的「我的 / 发现 / 开发 / 工具」四页签，R1 不改导航。项目目录不需要反复导出 JSON 或上传文件。

## 一次连接

本机安装 Node 与 OpenDesk Native Host，并在 Chrome 的 OpenDesk 设置页通过真实控件启用 Native。已有安装只需按 [R2.2 指南](local-development-r22.zh-CN.md) 更新一次；更新前原运行必须收尾。

在 Codex 中配置 stdio MCP，`--allow-project` 必须是明确授权的目录或单个 JS 文件：

```sh
codex mcp add opendesk-dev -- node /absolute/opendesk-browser/native-agent/local-dev/mcp.mjs --allow-project /absolute/my-project
```

目录从 `package.json.opendesk` 继承 runtime 与精确网站范围；`attach` 只传 path。单个文件才显式传 runtimeKind/siteOrigin。MCP 目录授权不能替代浏览器的网站权限；`status.connected` 也不代表一次运行已通过。标准测试网页为 `examples/tasks/demo-form.html`，日常访问 `http://127.0.0.1:43111/demo-form.html`。

配置方式依据 [OpenAI MCP 文档](https://developers.openai.com/codex/mcp)。已有 Codex 会话的工具清单应在配置生效后的新客户端会话中核对，不能把注册配置当作真实浏览器回执。

同一 Native 实例只接纳一个本地项目 Provider。让 Sidebar 使用当前 MCP 的项目列表；出现 `E_DEV_PROVIDER_CONFLICT` 时先关闭重复的 MCP 进程，再连接原实例，不重放已入场运行。

## 每次修改后执行

让 Codex 读取并修改允许目录中的真实 JS 文件，随后调用 `opendesk.dev.status` 获取 bindingId 和真实目标，再调用 `opendesk.dev.run`。每次有意执行使用新的 requestId。目录 Resolver 重新读取源码、项目元数据、锁与实际依赖闭包；本地只保存 JS，不生成开发交接包。

Controller 返回 runId 后查询 `result` 或 `diagnostics`，直到持久 `controller-result` 出现且 `retirementState` 为 `released`。核对 runId、resultId、结果自身 revision.sourceHash 和目标 documentId。成功值使用原 valueWire；可无损表示为 JSON 的值同时给出 value。Page 返回 previewId 与 USER_SCRIPT 回执，证据等级不冒充 Controller 持久 Result。

Controller 失败时保留实际 error（包括原始 stack）和持久结果；可验证的 V8 AsyncFunction 坐标会附带：

```js
diagnostic: {
  sourceHash: '本次执行的固定哈希',
  location: {file: 'src/extract.js', line: 2, column: 9},
  generated: {line: 1, column: 123},
  basis: 'v8-async-function-stack'
}
```

location 的行列从 1 开始。映射使用该 run 入场时冻结的 source map，磁盘后续修改不会改变旧错误定位。没有可映射的坐标就只返回原错误，不猜行号；Page 当前错误回执不提供这项 Controller 映射。按实际错误修复文件，再用新 requestId 执行；旧结果和旧失败仍可读取。

若回执丢失或状态为 OUTCOME_UNKNOWN，只用原 admissionRequestId 查询原入场记录，不换 ID 自动重放。Controller Stop 走原 RunHost 并确认收尾；Page Stop 仅清理本实例登记的受管 UI。

## 多文件和依赖

静态相对 ESM、npm 和 HTTPS ESM 都使用已有唯一内存 builder。npm 在该项目声明精确依赖与 package-lock，先 `npm ci --ignore-scripts`；HTTPS 首次锁定须明确审阅授权，保留 `opendesk.remote-lock.json` 和缓存，dev.run 只读已有字节。运行不会自动执行项目 shell、安装 npm 包、下载新 URL 或新增锁。依赖新增的解析候选也必须在下一次有意执行重新解析。

正式冻结交付继续使用 `build:program` 以及原 Candidate/Verification/Available/Installed 合同；MCP 成功不代表发布或安装。MV3/CSP、60 KiB Native 包络、文件授权、精确目标与未知效果保护保持原合同。

## 证据

本轮候选、组件、用户 Mac Chrome、实际 Codex 及未测项见 [R1 工作流](workstreams/local-ai-loop-r1-01a12158.md)。历史 R10.1 已有实际 Codex/Chrome 定向回执，但必须比较相关输入后复用。框架 603＋19、独立 B05、最终 F3 与 ZIP 安装不由本轮定向闭环提升为 PASS。
