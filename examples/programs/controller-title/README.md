# 多文件 Controller 示例

## ESM R2.2：修改模块后明确运行

以下命令均在 **opendesk-browser 仓库根目录**执行。入口 `src/main.js → title.js`，运行环境为 **Controller Worker / OpenDesk page Locator**。项目沿用真实 `opendesk.project.v1` 元数据。

完成一次 Native/扩展配对后，日常目录开发使用现有 [R17 入口](../../../docs/framework/local-directory-cli-r17.zh-CN.md)：

```sh
opendesk browser dev "$PWD/examples/programs/controller-title"
```

网页授权范围：`https://example.com`。本地测试页统一用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`；若端口已被其他任务占用，先核对服务，不关闭对方进程。HTTPS-only 项目日常打开其原授权网站，本轮 localhost 验收只改测试副本，原规则保持不变。

在同窗口 Sidebar 选择已连接目录并明确运行；Page 还需 Chrome「允许用户脚本」。高级 [MCP 路径](../../../docs/api/mcp-local-development.zh-CN.md) 使用 `status/attach` 返回的真实 `bindingId`，`run` 使用新的有意执行 `requestId`，以实际返回的 `previewId` 或 `runId` 查询 `result`。Page 不传 Controller params/deadline；Controller 搜索示例参数为 `{"keyword":"OpenDesk"}`。

预期：{title}；通过真实 page.title() 读取标题。源码练习：把 `src/title.js` 改为 `export const readTitle = async page => 'R2.2: ' + await page.title();`，再次明确运行应返回带 `R2.2: ` 前缀的当前网页标题。仅保存不会操作网页；新运行应出现新 `sourceHash` 和运行身份。目录直连无须另跑 build:program、上传编译结果或重装扩展。旧结果仍对应原源码。发生未知效果时只用原 `admissionRequestId` 查询，不自动重放。

正式冻结交付和 Node 构建验证：

```sh
node scripts/validate-program-project.mjs examples/programs/controller-title
npm run build:program -- examples/programs/controller-title
node --test tests/environment/sidebar-project-demo.test.mjs tests/environment/program-build.test.mjs tests/integration/esm-examples-acceptance.test.mjs
```

集成测试的完全离线证明要求 Node 26.3.1（操作系统拒绝网络）；它是 **Node L2**。输出目录以构建回执 `outputDirectory` 为准，`BUILT_UNVERIFIED` 不等于运行成功或 Installed。真实 Chrome 使用同一 [Native runner](../../../tests/framework/local-dev-native-acceptance.mjs) 的 `OPENDESK_DEV_SLICE=esm-examples`，隔离参数和原始证据见 [R2.2 验收记录](../../../docs/framework/workstreams/esm-r22-examples-01a1296d.zh-CN.md)。

当前等级：**L2 PASS；本机 Chrome L4 localhost 临时授权副本 PASS；原 example.com 网站 NOT_TESTED**。这些结论绑定该记录的源码/扩展包身份；不代表任意新版本、任意网站或最终安装验收。

## 原有使用方式与冻结交付
运行 `node scripts/build-program-project.mjs examples/programs/controller-title`，生成 `program.js` 和 `program.opendesk-task.json`。`.js` 可通过「发现 → 导入」的独立完整目录转交同窗口 Sidebar「开发」再点击旧版 **「运行草稿」**；JSON 可通过同一完整任务目录导入为 **Candidate（待验证）**；构建不会让任务自动变为 Available 或 Installed。依赖由开发者在可信环境使用 npm ci --ignore-scripts 安装，构建不执行第三方安装钩子。
