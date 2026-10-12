# React JSX · OpenDesk Browser R24.3

## 自动编译状态（2026-10-12）

**状态：已实现、历史候选真实 Chrome PASS；R24.4 最终验收未完成。** `src/App.jsx` 是原始 JSX，Chrome 不能直接将其作为普通 JavaScript 运行。OpenDesk 会自动转换：本地 `opendesk browser dev .` 在保存后准备最新源码，Side Panel 明确 Run 才执行；浏览器无 Native 的「直接编辑 → React JSX」在 Run 时按需编译，同样无需用户每次手动 Vite/npm build。**保存和编译不会自动执行网页业务。**

证据：[本地 React 20 次 Chrome Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890)、[浏览器 JSX Hooks 点击与 Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847)、[独立安装 CLI JSX 编译](https://github.com/shopable-ai/opendesk-browser/actions/runs/38231722128)。上述只对对应历史 CI 候选 PASS；最新 `main` 的浏览器 20 次独立循环、SPA/BFCache、撤权、缩放/主题及最终安装验收 **NOT_TESTED**。[完整状态表](../../../docs/api/page-ui-frameworks.zh-CN.md)。


**当前默认入口：`src/App.jsx`**。用户写官方 React `import`、Hooks 与 JSX、默认导出 `App`，无需手工 `main()`、`createPageUI`、`createDemoEnhancer` 或项目级 Vite 操作。OpenDesk 使用原本地编译器（固定 esbuild + Webpack）和内置 React/ReactDOM，生成受管页面挂载与 `root.unmount()`；不重复打包框架到用户源码。

## 使用方法

本地多文件编辑先安装并配对 OpenDesk Native Host。进入本目录运行 `opendesk browser dev .`，保存后自动准备；在 Sidebar「开发 → 本地项目」点击 **运行本地项目** 才执行最新源码。可在仓库根目录启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，用 Chrome 打开 `http://127.0.0.1:43111/demo-form.html`；原 Chrome 网站许可和用户脚本设置仍必须满足。

**不连接 Native Host 也能直接写 JSX：** Side Panel →「开发」→「直接编辑」→「React JSX」，粘贴本项目 `src/App.jsx` 的组件源码并明确点击「运行 React/Vue 组件」。扩展固定 Dedicated Worker 在浏览器内完成 JSX 转换，仍由原 Page USER_SCRIPT 执行；点击「停止受管 UI」会卸载 React root。该浏览器入口目前面向单组件，不等同于连接/同步本机的多文件项目。另可[导入已预编译的 R24.3 JSON](../../import-ready/README.zh-CN.md) 作固定草稿试运行；JSON 导入不是重新编译 JSX。

如维护者需要显式导出，仓库已将 `npm run build:program` 改为直接调用原项目编译器，**不再串联 Vite**。保留 `npm run build:framework`、`src/runtime-entry.js`、`vite.config.mjs`、锁文件及许可证作为维护者固定运行时来源。旧 `src/main.js`、`src/framework.jsx`、`src/enhancement.js` 仅作历史 R24.1 功能回归（含高亮/撤销），不是默认源码图。

## 验收边界

- [真实 Mac Chrome JSX 挂载、点击、Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353894)，当前源码 `sourceHash=97ff050d29977932156b130a01f2149799a2c821a65a25778c2f269591e3c557`。
- [React 20 次独立 Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890)，20 个不同原生 `previewId/documentId`、受管卸载回执与 DOM 清理。

本地自动准备与[无 Native 浏览器端原始 JSX → Worker 编译 → 运行 → Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847) 都已有绑定旧候选的真实 Mac Chrome PASS。浏览器端 20× 独立编辑/运行/停止、SPA/BFCache、撤权、安装更新、窄屏/暗色/200% 缩放及当前最新候选仍需新证据；不能用历史 PASS 声称全部完成。

[组件/API 指南](../../../docs/api/page-ui-frameworks.zh-CN.md) · [本地目录](../../../docs/framework/local-directory-cli-r17.zh-CN.md)
