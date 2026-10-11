# Vue SFC · OpenDesk Browser R24.3

**当前默认入口：`src/App.vue`**，用户直接使用官方 `<script setup>`、`<template>` 和 `<style scoped>`，标准 `import {ref} from 'vue'`，无需写内部挂载样板、`main()` 或手工 Vite。系统使用固定 `@vue/compiler-sfc@3.5.22` 数据转换器、扩展内置 Vue runtime 和原项目编译器，生成 `createApp`、`app.unmount`、受管 CSS 清理。

## 使用方法

本地多文件编辑需要已安装配对的 OpenDesk Native Host。从本目录执行 `opendesk browser dev .`，保存自动准备，明确点击 Sidebar「开发 → 本地项目 → 运行本地项目」才操作目标网页。统一测试页 `http://127.0.0.1:43111/demo-form.html`，仓库根目录运行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。原用户脚本许可和网站授权不可跳过。

无需 Native 也可以在浏览器[导入已冻结的 `page-ui-vue.opendesk-draft.json`](../../import-ready/README.zh-CN.md)并试运行；**这不是浏览器直接编辑 `.vue` 然后即时编译**。TS、外部 `src`、预处理器和未经审查的 CSS 网络依赖会明确拒绝。

维护者 `npm run build:program` 现在直接运行项目编译器，不先执行 Vite。独立保留 `build:framework`、`src/runtime-entry.js`、`vite.config.mjs`、源锁和许可证作为固定运行时来源。旧 `src/Widget.vue`、`src/main.js`、`src/enhancement.js` 仅用于原 R24.1 高亮/撤销场景，不作为新默认组件依赖。

## 验收边界

- [真实 Mac Chrome Vue SFC 挂载、Scoped CSS、点击、Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353894)，当前源码 `sourceHash=747838ef6225583e6128f906ec2491f0ce141b7f8f50f3d01e2bcf7877f8f0c0`。
- [Vue 20 次独立 Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890)，新 `previewId/documentId`、原生回执和 DOM 清理。

本地 SFC 自动编译链实测通过。浏览器原始源码免 Native 即时编译、SPA/BFCache/撤权、Teleport/外部 DOM、安装更新与 200% 缩放仍需专项 Chrome 证据。

[组件/API 指南](../../../docs/api/page-ui-frameworks.zh-CN.md) · [本地目录](../../../docs/framework/local-directory-cli-r17.zh-CN.md)
