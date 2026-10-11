# 多文件 Page Demo（真实 Browser Test Lab）

## ESM R2.2：修改模块后明确运行

以下命令均在 **opendesk-browser 仓库根目录**执行。入口 `src/main.js → fixture.js / proof.js`，运行环境为 **Page USER_SCRIPT**。项目沿用真实 `opendesk.project.v1` 元数据。

完成一次 Native/扩展配对后，日常目录开发使用现有 [R17 入口](../../../docs/framework/local-directory-cli-r17.zh-CN.md)：

```sh
opendesk browser dev "$PWD/examples/programs/sidebar-page-demo"
```

网页授权范围：`http://127.0.0.1/*；源码另限定端口 43111、路径 /demo-form.html`。本地测试页统一用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`；若端口已被其他任务占用，先核对服务，不关闭对方进程。HTTPS-only 项目日常打开其原授权网站，本轮 localhost 验收只改测试副本，原规则保持不变。

在同窗口 Sidebar 选择已连接目录并明确运行；Page 还需 Chrome「允许用户脚本」。高级 [MCP 路径](../../../docs/api/mcp-local-development.zh-CN.md) 使用 `status/attach` 返回的真实 `bindingId`，`run` 使用新的有意执行 `requestId`，以实际返回的 `previewId` 或 `runId` 查询 `result`。Page 不传 Controller params/deadline；Controller 搜索示例参数为 `{"keyword":"OpenDesk"}`。

预期：PAGE_DEMO_OK；#lab-text 中一个 #opendesk-multifile-page-proof。修改 `src/proof.js 的可观察字符串` 并保存后，页面不会自动操作；再次明确运行才应出现新 `sourceHash`、新运行身份及新结果。目录直连无须另跑 build:program、上传编译结果或重装扩展。旧结果仍对应原源码。发生未知效果时只用原 `admissionRequestId` 查询，不自动重放。

正式冻结交付和 Node 构建验证：

```sh
node scripts/validate-program-project.mjs examples/programs/sidebar-page-demo
npm run build:program -- examples/programs/sidebar-page-demo
node --test tests/environment/sidebar-project-demo.test.mjs tests/environment/program-build.test.mjs tests/integration/esm-examples-acceptance.test.mjs
```

集成测试的完全离线证明要求 Node 26.3.1（操作系统拒绝网络）；它是 **Node L2**。输出目录以构建回执 `outputDirectory` 为准，`BUILT_UNVERIFIED` 不等于运行成功或 Installed。真实 Chrome 使用同一 [Native runner](../../../tests/framework/local-dev-native-acceptance.mjs) 的 `OPENDESK_DEV_SLICE=esm-examples`，隔离参数和原始证据见 [R2.2 验收记录](../../../docs/framework/workstreams/esm-r22-examples-01a1296d.zh-CN.md)。

当前等级：**L2 + 本机 Chrome L4 PASS；两次运行和子模块修改均有真实 DOM/previewId 证据**。这些结论绑定该记录的源码/扩展包身份；不代表任意新版本、任意网站或最终安装验收。

## 原有使用方式与冻结交付
三个源文件 `src/main.js → fixture.js + proof.js` 在本地静态 ESM 构建后，借助既有 USER_SCRIPT 试运行链在标准测试页追加 **一个非破坏性 DOM 标记**。不是安装包。

```sh
npm ci --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/sidebar-page-demo
npm run build:program -- examples/programs/sidebar-page-demo
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html`。加载 `dist/development` Chrome 扩展并开启用户脚本和网页权限，优先在「发现 → 导入」的完整任务目录选择 `outputDirectory/program.opendesk-draft.json`，向同窗口 Sidebar 交付**只读多文件源码快照与冻结执行字节**；传统方式仍可导入 `program.js`（仅显示已编译程序）或粘贴完整 JS。两种方式都只是未保存草稿，不自动执行。在「网页用户脚本 · 依赖与试运行」选择 async main 类型，点击 **在当前网页试运行 DOM 脚本**。不要点击 Controller 的底栏「运行草稿」。

期望页面 `#lab-text` 中出现 `#opendesk-multifile-page-proof` 且文本包含「多文件 Page 程序已运行」；再次运行仍只有一个标记。程序内部核对端口 43111 与路径 `/demo-form.html`，非目标路径会返回 `SKIPPED_OUT_OF_SCOPE`。

现有构建生成 `program.js`、`program.opendesk-draft.json` 和 `artifact.json`（`BUILT_UNVERIFIED`）；`--mode development` 可另生成本地 Source Map；并不支持直接选择源码文件夹进行浏览器内构建，也不表示已安装。真实 Chrome 执行回执应单独采集。
