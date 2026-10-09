# 已锁定 npm 的 Page 示例

项目已有独立 package-lock.json，固定 lodash-es@4.17.21。源码是 [src/main.js](src/main.js) 与 [src/heading.js](src/heading.js)，运行类型 Page USER_SCRIPT；使用说明见[依赖教程](../../../docs/api/dependencies-and-errors.zh-CN.md#npm先准备项目自己的安装目录)。

从仓库根执行，已有正确安装目录时跳过：

```sh
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
```

MCP --allow-project 包含此目录，attach 只传目录 path。打开已授权 demo-form.html 或 https://example.com/，允许用户脚本；用真实 bindingId 调 opendesk.dev.run，传新的 requestId、不传 Controller params/deadline。返回 previewId 后调用 result；demo-form 上 result.resultText 应展示 text/safeHtml 为 OpenDesk Browser Test Lab。

修改 heading.js 后保存，用新 requestId 明确再运行，核对 previewId/sourceHash。旧预览用原 previewId 查询，不是持久 Controller Result；本例未导入受管 UI，Stop 返回 E_PAGE_PREVIEW_STOP_UNSUPPORTED。丢 ACK 时同会话 admissionRequestId 只读恢复，未知效果不重放。

正式冻结/导入时才执行 `npm run build:program -- examples/programs/page-npm-lodash`。artifact 的 npmDependencies/npmBundledModules/npmLockSha256/sourceHash 是来源与产物记录，不代表安装或真实浏览器验收。R9 原证据见[依赖工作流](../../../docs/framework/workstreams/r9-dependency-closure-20261009.md)，后续 R10.1 定向证据按[原记录](../../../docs/framework/workstreams/r101-development-01a12159.md)的输入/级别复用，不能推广到任意新包。
