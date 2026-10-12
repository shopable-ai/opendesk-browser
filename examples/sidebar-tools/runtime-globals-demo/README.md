# Side Panel 已安装工具：OpenDeskTool 全局桥 Demo

这是**真正可打包、可经用户确认导入的** `opendesk.sidebar-tool.v1` 工具项目。运行在 opaque-origin iframe，**不是**可信 Side Panel 宿主、Controller Worker 或目标网页 USER_SCRIPT。

和 Controller 的 `main()` 不同，工具入口是单个经典 JS，在容器创建后读取框架提供的 `globalThis.OpenDeskTool`。使用 `root` 查找自己的 UI，只有明确声明并获授权的 `currentPage.read` 才能用 `request('currentPage.info')`；点击按钮前不自动读取网页。

本仓库根目录执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/runtime-globals-demo
node --test tests/environment/runtime-libs-trusted-worlds.test.mjs
```

输出 `artifacts/sidebar-tools/runtime-globals-demo/1.0.0/runtime-globals-demo.opendesk-tool.json`。在 Side Panel → 工具 → 导入，查看工具及 `currentPage.read` 权限并确认安装，再点击打开。打开 `http://127.0.0.1:43111/demo-form.html` 或已授权的 HTTP(S) 网站，点击“读取当前网页标题”，检查是否更新；受限页面应显示不可读取，而不是越权。**这是需要真实手动/Chrome 验收的步骤；Node 通过只证明源码可打包和桥逻辑。**

这里不支持：
- `page.title()`：这是 Controller 受控 Worker 词法能力；
- `document.title` 获取外部网站：iframe 的 document 是工具自己的 DOM；
- 默认 `_` / `dayjs` / `window.chrome.tabs`：不继承 Controller/Page/可信宿主的变量；
- 未经打包的 `import dayjs from 'dayjs'`：工具包只接受单个经典 JS，若工具自身要使用第三方模块，必须在**工具自身**事先离线编译、检查来源，不能运行时 CDN。

与可信 Side Panel Host 导入的区别，见[静态导入示例](../../libs/trusted-imports/README.zh-CN.md)及[运行环境权威合同](../../../docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。
