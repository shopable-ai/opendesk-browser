# React JSX · OpenDesk Browser R24.3

**当前默认入口：`src/App.jsx`**。用户写官方 React `import`、Hooks 与 JSX、默认导出 `App`，无需手工 `main()`、`createPageUI`、`createDemoEnhancer` 或项目级 Vite 操作。OpenDesk 使用原本地编译器（固定 esbuild + Webpack）和内置 React/ReactDOM，生成受管页面挂载与 `root.unmount()`；不重复打包框架到用户源码。

## 使用方法

本地多文件编辑先安装并配对 OpenDesk Native Host。进入本目录运行 `opendesk browser dev .`，保存后自动准备；在 Sidebar「开发 → 本地项目」点击 **运行本地项目** 才执行最新源码。可在仓库根目录启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，用 Chrome 打开 `http://127.0.0.1:43111/demo-form.html`；原 Chrome 网站许可和用户脚本设置仍必须满足。

不连接本地目录也可以在浏览器[导入已预编译的 R24.3 `page-ui-react.opendesk-draft.json`](../../import-ready/README.zh-CN.md)，点击预览操作网页。导入无需 Native，但导入的是冻结执行代码，**不能在浏览器里直接修改 JSX 后免 Native 编译**；此能力仍在实施。

如维护者需要显式导出，仓库已将 `npm run build:program` 改为直接调用原项目编译器，**不再串联 Vite**。保留 `npm run build:framework`、`src/runtime-entry.js`、`vite.config.mjs`、锁文件及许可证作为维护者固定运行时来源。旧 `src/main.js`、`src/framework.jsx`、`src/enhancement.js` 仅作历史 R24.1 功能回归（含高亮/撤销），不是默认源码图。

## 验收边界

- [真实 Mac Chrome JSX 挂载、点击、Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353894)，当前源码 `sourceHash=97ff050d29977932156b130a01f2149799a2c821a65a25778c2f269591e3c557`。
- [React 20 次独立 Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890)，20 个不同原生 `previewId/documentId`、受管卸载回执与 DOM 清理。

本地自动准备已实测。浏览器原始 JSX 即时编译、SPA/BFCache/撤权、安装更新、窄屏/暗色/200% 缩放仍需新证据；不能用上述本地 Chrome PASS 声称全部完成。

[组件/API 指南](../../../docs/api/page-ui-frameworks.zh-CN.md) · [本地目录](../../../docs/framework/local-directory-cli-r17.zh-CN.md)
