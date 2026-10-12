# Vue 普通 JavaScript · R24.3 标准组件入口

> **R24.5 Standard 可用。** 本示例是普通 JavaScript `import` + 官方 React/Vue Runtime，不依赖浏览器内 JSX/SFC 编译器。本地项目仍需已授权 Native/Node 工具。[双版本说明](../../../docs/architecture/browser-framework/browser-compiler-editions-r245.zh-CN.md)。


## 自动编译状态（2026-10-12）

**状态：已验证的普通 JavaScript Vue 示例，不是 SFC 示例。** 默认入口 `src/main.js` 使用 Vue `h/ref`，**无需 `.vue` SFC 语法转换**；系统仍自动准备、链接固定 Vue Runtime、生成受管挂载/Stop。真实独立 npm 安装包四目录编译在 [macOS/Ubuntu CI PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38231722128)，但最新完整 Chrome 生命周期仍有未测矩阵。使用本地项目需已授权 Native；浏览器 Vue SFC 单组件直接编辑是另一种入口。**保存不自动 Run。** [状态表](../../../docs/api/page-ui-frameworks.zh-CN.md)。


原目录与项目 ID `sample.page-ui-vue-direct` 不变。默认 `src/main.js` 使用官方 `import {h, ref} from 'vue'`，默认导出 Vue Options 组件及渲染函数。无需 `.vue` 编译器、`main()`、`createPageUI`、手动 npm/Vite；系统复用固定 Vue 3.5.22 运行时和受管容器，执行 `createApp` / `app.unmount`。

在已配对 Native Host 的本目录执行 `opendesk browser dev .`；保存只准备，Sidebar 明确点击 Run 才应用于获准网页。测试页 `http://127.0.0.1:43111/demo-form.html`，仓库根目录用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks` 启动。Stop 清理受管 DOM，不更改宿主表单。

**旧版兼容：** `src/legacy-main.js` 原样保留 R24.2 `async-main` 高亮/撤销与 `enhancement.js`；历史 JSON、SHA 和回执继续保存，不冒充 R24.3 PASS。当前 JSON 将通过原构建器重新生成。浏览器现在已有无需 Native 的 **Vue SFC 单组件** 编辑、编译、Run/Stop（[真实 Chrome 历史证据](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847)）；但那是输入 `<script setup>`/`<template>` 的浏览器直接模式，**不会读取本目录 `src/main.js` 或自动将其转换成 SFC**。当前 Vue Direct 项目依然通过 `opendesk browser dev .` 进行本地目录开发并明确点击 Run，保存只准备、不会自动执行。

[组件总览](../../../docs/api/page-ui-frameworks.zh-CN.md) · [导入草稿](../../import-ready/README.zh-CN.md) · [目录 CLI](../../../docs/framework/local-directory-cli-r17.zh-CN.md)
