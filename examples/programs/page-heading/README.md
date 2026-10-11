# 多文件 ESM 示例：网页标题（Page USER_SCRIPT）

## ESM R2.2：修改模块后明确运行

以下命令均在 **opendesk-browser 仓库根目录**执行。入口 `src/main.js → dom.js / utils.js → describe.js`，运行环境为 **Page USER_SCRIPT**。项目沿用真实 `opendesk.project.v1` 元数据。

完成一次 Native/扩展配对后，日常目录开发使用现有 [R17 入口](../../../docs/framework/local-directory-cli-r17.zh-CN.md)：

```sh
opendesk browser dev "$PWD/examples/programs/page-heading"
```

网页授权范围：`https://example.com/*`。本地测试页统一用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`；若端口已被其他任务占用，先核对服务，不关闭对方进程。HTTPS-only 项目日常打开其原授权网站，本轮 localhost 验收只改测试副本，原规则保持不变。

在同窗口 Sidebar 选择已连接目录并明确运行；Page 还需 Chrome「允许用户脚本」。高级 [MCP 路径](../../../docs/api/mcp-local-development.zh-CN.md) 使用 `status/attach` 返回的真实 `bindingId`，`run` 使用新的有意执行 `requestId`，以实际返回的 `previewId` 或 `runId` 查询 `result`。Page 不传 Controller params/deadline；Controller 搜索示例参数为 `{"keyword":"OpenDesk"}`。

预期：{heading,found}；读真实 h1。修改 `src/describe.js 的返回字段` 并保存后，页面不会自动操作；再次明确运行才应出现新 `sourceHash`、新运行身份及新结果。目录直连无须另跑 build:program、上传编译结果或重装扩展。旧结果仍对应原源码。发生未知效果时只用原 `admissionRequestId` 查询，不自动重放。

正式冻结交付和 Node 构建验证：

```sh
node scripts/validate-program-project.mjs examples/programs/page-heading
npm run build:program -- examples/programs/page-heading
node --test tests/environment/sidebar-project-demo.test.mjs tests/environment/program-build.test.mjs tests/integration/esm-examples-acceptance.test.mjs
```

集成测试的完全离线证明要求 Node 26.3.1（操作系统拒绝网络）；它是 **Node L2**。输出目录以构建回执 `outputDirectory` 为准，`BUILT_UNVERIFIED` 不等于运行成功或 Installed。真实 Chrome 使用同一 [Native runner](../../../tests/framework/local-dev-native-acceptance.mjs) 的 `OPENDESK_DEV_SLICE=esm-examples`，隔离参数和原始证据见 [R2.2 验收记录](../../../docs/framework/workstreams/esm-r22-examples-01a1296d.zh-CN.md)。

当前等级：**L2 PASS；本机 Chrome L4 localhost 临时授权副本 PASS；原 example.com 网站 NOT_TESTED**。这些结论绑定该记录的源码/扩展包身份；不代表任意新版本、任意网站或最终安装验收。

## 原有使用方式与冻结交付
`src/main.js` 通过 namespace import 使用 `dom.js`，从 `utils.js` 具名导入函数；`utils.js` 再 re-export `describe.js`。入口默认导出 `async function main()`，在真实网页读取 `<h1>`；它不是在 Node 环境操作 `document`。

## 校验 / 构建（仓库根目录）

```sh
npm ci --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/page-heading
npm run build:program -- examples/programs/page-heading
node --test tests/environment/program-project.test.mjs tests/environment/program-build.test.mjs
```

以上仅 L1/L2：构建的 `program.js` 和 `artifact.json` 是 `BUILT_UNVERIFIED`，不是浏览器运行回执。无需 HTTPS/npm 第三方依赖联网。

## 真实 Page 运行

项目 `package.json` 保持原 `https://example.com/*` 匹配，不自动放宽到 localhost。打开 `https://example.com/`，授予用户脚本与网站权限，在同窗口 Sidebar「开发 → 本地项目」连接授权目录，再**明确点击运行**。也可通过既有草稿导入流程执行已构建的 `program.js`，不可直接将未编译 ESM 粘贴到 classic 编辑框。

返回值预期 `{heading,found}`，找到页面 `<h1>` 时 `found:true`。在 `src/describe.js` 修改返回结果并保存，再次**明确点击运行**，核对新 `sourceHash`、`previewId` 和新结果；保存源码不会自动对页面执行副作用。若失败核对站点规则、当前 `documentId`、授权与 Native 连接；不盲目重放未知结果的运行。

Node：仅负责验证和编译；Native / Node CLI：仅在目录直连模式需要；Chrome MV3 / USER_SCRIPT：实际执行环境；无需 Goja。本轮 localhost 授权副本 L4 已通过；原网站与 Installed/F3/L5 验收未执行。
