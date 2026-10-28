# R5.11 唯一交互预览

范围 owner：本任务仅写 `preview/**` 与 `tests/crown-preview.test.mjs`；不写产品源码、正式打包器、安装包或 Host admission，不提交。主 agent 的 Vite / 候选构建输出只读消费。端口 43827 为本预览临时 HTTP 服务，不使用既有浏览器 Profile、watcher 或 dist writer。

唯一入口 `preview/index.html`。网页皇冠的 R5.4 CSS/WebP、34/42px 尺寸、坐标、角度和双图层保持原字节。页面队列由正式 `src/page/engine.js` 与 `remote.js` 管理；正式 `dist/tool.js` 自己创建唯一 React Root，预览没有第二个 App/Root/队列。iframe 使用正式 `src/sidebar/root.html`、tool CSS、React 19.2.0 与共享 UI Runtime 的既有构建字节。网页区延续原设计预览排版，不宣称是实际 ChatGPT DOM 或完整 Page view 的原生验收。

所有消息、网站快照、reply 和 Host 都明确标记为模拟；没有 Chrome、安装、授权或真实发送能力。回复推进由“模拟 AI 回复完成”触发，不模拟后台持久计时。编辑取回输入框，修改后点皇冠重新入队；排序可用 Sidebar 更多菜单或网页行 Alt+上下键。unknown 禁止继续操作/重放，重置会创建新模拟 owner。

从仓库根目录：

```sh
# 读取已有正式构建，不运行/覆盖编译器、packager 或 watcher。
node examples/sidebar-tools/ai-send-queue/preview/prepare.mjs
python3 -m http.server 43827 --bind 127.0.0.1 --directory .
```

打开 http://127.0.0.1:43827/examples/sidebar-tools/ai-send-queue/preview/index.html 。点“加入示例消息”显示三条明确模拟消息。

必需前置产物由构建 owner 提供：

- 工具原有 `npm --prefix examples/sidebar-tools/ai-send-queue run build` 产生 `dist/tool.js`、`tool.css`、`build-ready.json`。仅在这些产物缺失/与 JSX 不符时协调 owner 构建，不能并行覆盖其输出。
- 已有 Browser 构建的 `libs/page-frameworks/react-19.2.0.js`、`sidebar-shared-ui.js`、`ui/design-tokens.css`。默认只读 `dist/development`，可用 `prepare.mjs --runtime /absolute/existing/browser-build` 选择已构建目录。不自动启动 Browser 构建。
- 每次正式工具源码/构建、Page engine/remote、共享 Runtime 或预览 model 变化后重新 `prepare.mjs`，然后刷新唯一 HTML。它校验正式 receipt 中所有 JSX/CSS 来源与产物 SHA/字节数，原子写入被忽略的 `.generated/source.json`，不复制/重编译正式源码。浏览器先核对全部资源 SHA，再执行已验证字节；漂移直接阻止 React 挂载。

最小验证：

```sh
node --test examples/sidebar-tools/ai-send-queue/preview/preview.test.mjs examples/sidebar-tools/ai-send-queue/tests/crown-preview.test.mjs
node --check examples/sidebar-tools/ai-send-queue/preview/boot.js
```

`preview/browser-smoke.js` 可直接作为 Playwright `browser_run_code_unsafe.filename`，在上述 HTTP 页执行真实点击。它核对三条示例、双端暂停/恢复、排序、编辑重新入队、删除、提前发送、reply/FIFO、unknown 不重发、theme/width、R5.4 两档皇冠参数及重置。旧 `scripts/crown-r53-chromium.mjs` 的 document.write 单文件加载方式是历史离线入口，不能用来装载当前 HTTP 模块预览；未改动该历史运行器。

本轮验证：7/7 Node 定向检查、Playwright 13 项交互检查通过，浏览器 pageerror 为零；HTTP 拦截给 tool.js 追加一行的负例被 SHA 栅栏拒绝，React 挂载数为零。读取的工具 buildId 为 `2afd844a-816e-46de-b93a-453adf30dd2a`；后续以 `.generated/source.json` 与页面实际 SHA 校验结果为准。真实 ChatGPT/已安装 Chrome/正式候选安装为 `NOT_TESTED`。
