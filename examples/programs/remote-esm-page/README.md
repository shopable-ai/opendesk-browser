# HTTPS ESM + 本地模块包装示例

## ESM R2.2：修改模块后明确运行

以下命令均在 **opendesk-browser 仓库根目录**执行。入口 `src/main.js → add.js → 标准 HTTPS add.js`，运行环境为 **Page USER_SCRIPT**。项目沿用真实 `opendesk.project.v1` 元数据。

完成一次 Native/扩展配对后，日常目录开发使用现有 [R17 入口](../../../docs/framework/local-directory-cli-r17.zh-CN.md)：

```sh
opendesk browser dev "$PWD/examples/programs/remote-esm-page"
```

网页授权范围：`https://example.com/*`。本地测试页统一用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`；若端口已被其他任务占用，先核对服务，不关闭对方进程。HTTPS-only 项目日常打开其原授权网站，本轮 localhost 验收只改测试副本，原规则保持不变。

HTTPS 首次锁定必须按下文先取得 reviewToken，再逐 URL 明确批准；未锁定不允许下载或运行。

在同窗口 Sidebar 选择已连接目录并明确运行；Page 还需 Chrome「允许用户脚本」。高级 [MCP 路径](../../../docs/api/mcp-local-development.zh-CN.md) 使用 `status/attach` 返回的真实 `bindingId`，`run` 使用新的有意执行 `requestId`，以实际返回的 `previewId` 或 `runId` 查询 `result`。Page 不传 Controller params/deadline；Controller 搜索示例参数为 `{"keyword":"OpenDesk"}`。

预期：{value:42,pageTitle}；固定依赖离线入包。修改 `src/main.js 的 20, 22 改为 21, 22，明确再运行应得 43` 并保存后，页面不会自动操作；再次明确运行才应出现新 `sourceHash`、新运行身份及新结果。目录直连无须另跑 build:program、上传编译结果或重装扩展。旧结果仍对应原源码。发生未知效果时只用原 `admissionRequestId` 查询，不自动重放。

正式冻结交付和 Node 构建验证：

```sh
node scripts/validate-program-project.mjs examples/programs/remote-esm-page
npm run build:program -- examples/programs/remote-esm-page
node --test tests/environment/sidebar-project-demo.test.mjs tests/environment/program-build.test.mjs tests/integration/esm-examples-acceptance.test.mjs
```

集成测试的完全离线证明要求 Node 26.3.1（操作系统拒绝网络）；它是 **Node L2**。输出目录以构建回执 `outputDirectory` 为准，`BUILT_UNVERIFIED` 不等于运行成功或 Installed。真实 Chrome 使用同一 [Native runner](../../../tests/framework/local-dev-native-acceptance.mjs) 的 `OPENDESK_DEV_SLICE=esm-examples`，隔离参数和原始证据见 [R2.2 验收记录](../../../docs/framework/workstreams/esm-r22-examples-01a1296d.zh-CN.md)。

当前等级：**受控 Mock 锁定/OS 拒绝联网构建 L2 + localhost 临时授权副本 Chrome L4 PASS；真实 CDN smoke NOT_TESTED**。这些结论绑定该记录的源码/扩展包身份；不代表任意新版本、任意网站或最终安装验收。

## 原有使用方式与冻结交付
`src/main.js` 只导入本地 `./add.js`；`src/add.js` 中有标准写法 `import add from 'https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js'`。只通过可信本地终端明确审阅/锁定后才能内存编译成 classic JavaScript。Chrome 运行时不会向 CDN 请求此 JS。

## 首次锁定（仓库根目录，显式授权才允许联网）

```sh
npm ci --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/remote-esm-page
# 离线审阅根 URL、域名及 reviewToken，无网络、无执行
node scripts/lock-program-remote.mjs examples/programs/remote-esm-page
# 用户自己核对 URL 后，用上条回执替换 REVIEW_TOKEN
# 新增的传递 URL 必须在交互终端单独确认；不可自动 yes
node scripts/lock-program-remote.mjs examples/programs/remote-esm-page --approve REVIEW_TOKEN
# 检查 opendesk.remote-lock.json 和 .opendesk/remote-cache/*.mjs
npm run build:program -- examples/programs/remote-esm-page
node --test tests/environment/remote-esm-review.test.mjs tests/environment/remote-esm-import.test.mjs
```

普通测试只使用隔离 HTTPS Mock，不自动下载真实 CDN。若本机只有源码，没有完整锁与缓存，断网编译会明确失败：本仓库不预装第三方远端依赖。缓存完整后可以断网重复构建。改变远端 URL（包括查询参数）要重新审阅；**不要将包含令牌或秘密的 URL 提交到版本管理**。SHA-256 只保证缓存字节一致，不证明第三方代码安全。

## 真实运行

使用已有 Native/MCP 授权并 attach 本目录，打开 `https://example.com/`（原规则为 `https://example.com/*`，不是 localhost），同窗口 Sidebar 选择该项目并另行明确执行。需要 Chrome MV3 USER_SCRIPT 开关与网站权限，预期 Page result 为 `{value:42,pageTitle:document.title}`；把 `src/main.js` 的 `20, 22` 修改为 `21, 22`，保存后另一次明确执行得到 `value:43`，比较新的 `previewId`/`sourceHash`。

缺锁 `E_REMOTE_UNLOCKED`、缓存缺失 `E_REMOTE_CACHE`、篡改 `E_REMOTE_HASH` 必须停止业务执行；恢复后重新审阅/授权，不在浏览器偷偷下载。Node 是构建器/锁定工具，不是 Page 的执行世界；本例不需要 Goja。本轮受控 Mock / 离线构建与 localhost 临时授权副本 L4 已通过；真实 CDN、原网站及 L5 未执行。
