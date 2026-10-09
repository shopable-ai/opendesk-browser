# HTTPS ESM 导入与本地运行示例

[src/main.js](src/main.js) 静态导入固定版本 add.js，返回 value 42 和真实 pageTitle；[package.json](package.json) 的 Page 范围是 https://example.com/*。它不使用 @require，也不会在运行的 Chrome 中从 CDN 加载代码。

首次需明确批准远端锁定，并审阅项目的 opendesk.remote-lock.json 与 .opendesk/remote-cache/*.mjs，连同源码版本化；仓库示例不保证本机已有它们。具体项目外临时输出命令及后续步骤见[HTTPS 依赖教程](../../../docs/api/dependencies-and-errors.zh-CN.md#https一次显式锁定之后离线运行)。本轮不自动锁定或下载。

已有锁和缓存后，MCP --allow-project 包含此目录，attach 只传 path；打开获准的 https://example.com/ 与同窗口 Sidebar并允许用户脚本。run 使用真实 bindingId 和新的 requestId；result 用原 previewId，预期 result.resultText 展示 value 42。修改为 add(21,22) 后保存，用新 requestId 明确再运行，预期 43、新 previewId/sourceHash。日常无需输出项目 JSON。

预览不是持久 Controller Result。本例没有受管 UI，不支持受管 Stop；丢 ACK 只在原会话以 admissionRequestId 只读恢复，未知效果不重放。

正式冻结/兼容导入时，可在仓库根离线运行 `npm run build:program -- examples/programs/remote-esm-page`，将输出的 program.opendesk-draft.json 按既有导入入口试运行；BUILT_UNVERIFIED 不等于 Installed。安全/锁合同见[HTTPS ESM R1](../../../docs/architecture/browser-framework/https-esm-imports-r1.zh-CN.md)，已有实际开发证据和限制见[R10.1 工作流](../../../docs/framework/workstreams/r101-development-01a12159.md)。
