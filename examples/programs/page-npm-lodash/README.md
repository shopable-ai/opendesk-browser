# 已锁定 npm 的 Page 示例

## ESM R2.2：修改模块后明确运行

以下命令均在 **opendesk-browser 仓库根目录**执行。入口 `src/main.js → heading.js → 已锁定 lodash-es/escape.js`，运行环境为 **Page USER_SCRIPT**。项目沿用真实 `opendesk.project.v1` 元数据。

完成一次 Native/扩展配对后，日常目录开发使用现有 [R17 入口](../../../docs/framework/local-directory-cli-r17.zh-CN.md)：

```sh
opendesk browser dev "$PWD/examples/programs/page-npm-lodash"
```

网页授权范围：`https://example.com/* 与 http://127.0.0.1/*`。本地测试页统一用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`；若端口已被其他任务占用，先核对服务，不关闭对方进程。HTTPS-only 项目日常打开其原授权网站，本轮 localhost 验收只改测试副本，原规则保持不变。

在同窗口 Sidebar 选择已连接目录并明确运行；Page 还需 Chrome「允许用户脚本」。高级 [MCP 路径](../../../docs/api/mcp-local-development.zh-CN.md) 使用 `status/attach` 返回的真实 `bindingId`，`run` 使用新的有意执行 `requestId`，以实际返回的 `previewId` 或 `runId` 查询 `result`。Page 不传 Controller params/deadline；Controller 搜索示例参数为 `{"keyword":"OpenDesk"}`。

预期：{text,safeHtml}；真实 h1 和 HTML 转义结果。修改 `src/heading.js 的返回字段` 并保存后，页面不会自动操作；再次明确运行才应出现新 `sourceHash`、新运行身份及新结果。目录直连无须另跑 build:program、上传编译结果或重装扩展。旧结果仍对应原源码。发生未知效果时只用原 `admissionRequestId` 查询，不自动重放。

正式冻结交付和 Node 构建验证：

```sh
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts --no-audit --no-fund
node scripts/validate-program-project.mjs examples/programs/page-npm-lodash
npm run build:program -- examples/programs/page-npm-lodash
node --test tests/environment/sidebar-project-demo.test.mjs tests/environment/program-build.test.mjs tests/integration/esm-examples-acceptance.test.mjs
```

集成测试的完全离线证明要求 Node 26.3.1（操作系统拒绝网络）；它是 **Node L2**。输出目录以构建回执 `outputDirectory` 为准，`BUILT_UNVERIFIED` 不等于运行成功或 Installed。真实 Chrome 使用同一 [Native runner](../../../tests/framework/local-dev-native-acceptance.mjs) 的 `OPENDESK_DEV_SLICE=esm-examples`，隔离参数和原始证据见 [R2.2 验收记录](../../../docs/framework/workstreams/esm-r22-examples-01a1296d.zh-CN.md)。

当前等级：**真实 npm 安装/闭包 L2 + 本机 Chrome L4 PASS；没有 CDN 运行时下载**。这些结论绑定该记录的源码/扩展包身份；不代表任意新版本、任意网站或最终安装验收。

## 原有使用方式与冻结交付
项目已有独立 package-lock.json，固定 lodash-es@4.17.21。源码是 [src/main.js](src/main.js) 与 [src/heading.js](src/heading.js)，运行类型 Page USER_SCRIPT；使用说明见[依赖教程](../../../docs/api/dependencies-and-errors.zh-CN.md#npm先准备项目自己的安装目录)。

从仓库根执行，已有正确安装目录时跳过：

```sh
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
```

MCP --allow-project 包含此目录，attach 只传目录 path。打开已授权 demo-form.html 或 https://example.com/，允许用户脚本；用真实 bindingId 调 opendesk.dev.run，传新的 requestId、不传 Controller params/deadline。返回 previewId 后调用 result；demo-form 上 result.resultText 应展示 text/safeHtml 均为 Browser Test Lab（来自真实 h1）。

修改 heading.js 后保存，用新 requestId 明确再运行，核对 previewId/sourceHash。旧预览用原 previewId 查询，不是持久 Controller Result；本例未导入受管 UI，Stop 返回 E_PAGE_PREVIEW_STOP_UNSUPPORTED。丢 ACK 时同会话 admissionRequestId 只读恢复，未知效果不重放。

正式冻结/导入时才执行 `npm run build:program -- examples/programs/page-npm-lodash`。artifact 的 npmDependencies/npmBundledModules/npmLockSha256/sourceHash 是来源与产物记录，不代表安装或真实浏览器验收。R9 原证据见[依赖工作流](../../../docs/framework/workstreams/r9-dependency-closure-20261009.md)，后续 R10.1 定向证据按[原记录](../../../docs/framework/workstreams/r101-development-01a12159.md)的输入/级别复用，不能推广到任意新包。
