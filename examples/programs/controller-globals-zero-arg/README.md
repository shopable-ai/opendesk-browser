# 零参数 Controller 预置环境 Demo

入口：[src/main.js](src/main.js)。这是 **多文件 ESM Controller**，所以写 `export default async function main()`。公开用户入口不需要 `{page}`、`{params}` 或 `{libraries}` 参数，不要自行 npm 安装 Lodash/Day.js，也不要给 `main()` 显式注入能力。真实的 `page` 是受控 Worker 词法绑定；`_`、`dayjs` 来自已审核的本地预装资源，不来自网页 window。

使用：仓库根目录运行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`。在 Sidebar「开发」授权并连接本目录，或使用已经连接的 `opendesk.dev.attach/status/run/result`，明确点击 Controller 运行，再以实际 `runId/resultId` 查询持久结果。本项目授权来源只包含 `http://127.0.0.1:43111`，不会自动扩大权限。

```sh
node scripts/validate-program-project.mjs examples/programs/controller-globals-zero-arg
node --test tests/environment/runtime-globals-zero-arg.test.mjs
```

这组自动化只算 L2 编译和词法变量回归；真实 Mac Chrome、权限、ZIP 验收仍需同候选回执，不因代码文件存在而自动通过。完整边界：[运行世界与预置变量](../../../docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。
