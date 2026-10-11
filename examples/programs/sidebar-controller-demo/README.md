# 多文件 Controller Demo（现代 Page API）

## ESM R2.2：修改模块后明确运行

以下命令均在 **opendesk-browser 仓库根目录**执行。入口 `src/main.js → params.js / search.js`，运行环境为 **Controller Worker / OpenDesk page Locator**。项目沿用真实 `opendesk.project.v1` 元数据。

完成一次 Native/扩展配对后，日常目录开发使用现有 [R17 入口](../../../docs/framework/local-directory-cli-r17.zh-CN.md)：

```sh
opendesk browser dev "$PWD/examples/programs/sidebar-controller-demo"
```

网页授权范围：`http://127.0.0.1:43111`。本地测试页统一用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`；若端口已被其他任务占用，先核对服务，不关闭对方进程。HTTPS-only 项目日常打开其原授权网站，本轮 localhost 验收只改测试副本，原规则保持不变。

在同窗口 Sidebar 选择已连接目录并明确运行；Page 还需 Chrome「允许用户脚本」。高级 [MCP 路径](../../../docs/api/mcp-local-development.zh-CN.md) 使用 `status/attach` 返回的真实 `bindingId`，`run` 使用新的有意执行 `requestId`，以实际返回的 `previewId` 或 `runId` 查询 `result`。Page 不传 Controller params/deadline；Controller 搜索示例参数为 `{"keyword":"OpenDesk"}`。

预期：CONTROLLER_DEMO_OK；#results 显示关键词，#search-count 每次明确运行增加一次。修改 `src/params.js 的默认关键词` 并保存后，页面不会自动操作；再次明确运行才应出现新 `sourceHash`、新运行身份及新结果。目录直连无须另跑 build:program、上传编译结果或重装扩展。旧结果仍对应原源码。发生未知效果时只用原 `admissionRequestId` 查询，不自动重放。

正式冻结交付和 Node 构建验证：

```sh
node scripts/validate-program-project.mjs examples/programs/sidebar-controller-demo
npm run build:program -- examples/programs/sidebar-controller-demo
node --test tests/environment/sidebar-project-demo.test.mjs tests/environment/program-build.test.mjs tests/integration/esm-examples-acceptance.test.mjs
```

集成测试的完全离线证明要求 Node 26.3.1（操作系统拒绝网络）；它是 **Node L2**。输出目录以构建回执 `outputDirectory` 为准，`BUILT_UNVERIFIED` 不等于运行成功或 Installed。真实 Chrome 使用同一 [Native runner](../../../tests/framework/local-dev-native-acceptance.mjs) 的 `OPENDESK_DEV_SLICE=esm-examples`，隔离参数和原始证据见 [R2.2 验收记录](../../../docs/framework/workstreams/esm-r22-examples-01a1296d.zh-CN.md)。

当前等级：**L2 + 本机 Chrome L4 PASS；真实 Locator、持久 Result 和未知 ACK 只读恢复已验证**。这些结论绑定该记录的源码/扩展包身份；不代表任意新版本、任意网站或最终安装验收。

## 原有使用方式与冻结交付
`src/main.js` 静态引用 `params.js` 与 `search.js`；在唯一标准测试页 `examples/tasks/demo-form.html` 的「05 动态搜索」区域执行填表、点击与等待。

```sh
node scripts/validate-program-project.mjs examples/programs/sidebar-controller-demo
npm run build:program -- examples/programs/sidebar-controller-demo
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html`，优先在「发现 → 导入」完整任务目录选择构建输出的 `program.opendesk-draft.json`，在 Sidebar「开发」查看只读源码列表并运行固定编译字节；也可回退使用 `program.js` 的粘贴或 .js 文件导入；参数填 `{"keyword":"OpenDesk"}`，点击底栏 **运行草稿**。应出现 `#results` 的「结果：OpenDesk」以及 `#search-count` 每次只增加 1；检查真实 `runId`、持久结果和冻结网页目标。

`program.opendesk-task.json` 是待验证 **Task v1 Candidate**，不是已安装任务。正式安装只能通过同源码与真实 runId 的核验，遵循原 Verification→Available→用户确认安装流程。

运行前在真实网页点「05 动态搜索」，必要时向下滚动，确认搜索输入框和按钮位于视口内。目标绑定与原生输入不会绕过不可见控件；若元素仍在视口外，执行可能超时并释放 Worker，此时提交计数应保持不变。

代码只用 OpenDesk 的 `page.getByLabel().fill()`、`getByRole().click()`、`getByText().waitFor()`、`locator().textContent()`；没有 `chromium.launch()`，不需要 Codex/Native Host 才能手动测试。


普通用户使用同一 Demo 时需采用另一条**正式任务**路径：将同一构建的 `program.opendesk-task.json` 导入完整任务目录；使用匹配源码、版本和目标网站的真实草稿运行 `runId` 验证候选，再设为 Available 并明确安装。随后在 Sidebar「我的任务」直接填写自动生成的「搜索关键词」，无需继续编辑源码。可展开「运行记录 → 技术信息」核对真实 `runId/resultId`；发生超时或状态未知时先看页面是否已经执行过搜索，避免再次点击造成重复。

## ESM 源修改与证据边界

现有 `main.js → params.js/search.js` 已满足多文件 Controller 示例要求，不创建重复目录。Node 只校验和 Webpack 构建；`page` Locator 使用现有授权 Controller Worker，不是 Node Playwright 或直接 DOM 全局。修改 `src/params.js` 中的默认关键字后重新**明确运行**，检查新 `sourceHash`、`runId`/`resultId` 以及标准测试页 `#search-count` 只增加一次。导航、撤权、超时或 ACK 未知时按原身份只读查询，不能盲目重放搜索。错误应正常传播。

定向 Node 测试：`node --test tests/environment/sidebar-project-demo.test.mjs tests/environment/program-build.test.mjs`。Chrome 请按上面的 demo-form 实际操作并记录原始回执。R2.2 当前候选的真实 Chrome 结果见下述记录；Node 编译和 vm 返回值不可代替验收。
