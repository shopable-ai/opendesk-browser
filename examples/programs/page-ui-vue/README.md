# Vue SFC · OpenDesk Browser R24.3

> **R24.5 分版：** 默认 Standard **不包含浏览器内 JSX/SFC 编译器**，但本示例仍可经本地 `opendesk browser dev .` 自动编译并运行。只有 Developer Edition 支持不安装 Native、直接在 Side Panel 粘贴原始组件源码即时编译。[双版本说明](../../../docs/architecture/browser-framework/browser-compiler-editions-r245.zh-CN.md)。


## 自动编译状态（2026-10-12）

**状态：已实现、历史候选真实 Chrome PASS；R24.4 最终验收未完成。** `src/App.vue` 是原始 Vue SFC，Chrome 不能直接当普通 JavaScript 运行。OpenDesk 会自动转换：本地 `opendesk browser dev .` 在保存后准备；Developer Edition 无 Native 浏览器「直接编辑 → Vue SFC」在明确 Run 时用受信 Worker 编译 `<script setup>`、`<template>` 与 `<style scoped>`。用户无须每次手动 Vite/npm build，**保存、编译并不自动运行**。

证据：[本地 Vue 20 次真实 Chrome Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890)、[浏览器 Vue `ref` 交互与 Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847)、[浏览器 Vue 语法错误拒绝与修复恢复](https://github.com/shopable-ai/opendesk-browser/actions/runs/38230083408)、[独立安装 CLI SFC 编译](https://github.com/shopable-ai/opendesk-browser/actions/runs/38231722128)。这些是历史候选 PASS；最新 `main` 浏览器 20 次循环、SPA/BFCache、撤权、完整 scoped CSS、缩放/主题与最终交付 **NOT_TESTED**。[完整状态表](../../../docs/api/page-ui-frameworks.zh-CN.md)。


**当前默认入口：`src/App.vue`**，用户直接使用官方 `<script setup>`、`<template>` 和 `<style scoped>`，标准 `import {ref} from 'vue'`，无需写内部挂载样板、`main()` 或手工 Vite。系统使用固定 `@vue/compiler-sfc@3.5.22` 数据转换器、扩展内置 Vue runtime 和原项目编译器，生成 `createApp`、`app.unmount`、受管 CSS 清理。

## 使用方法

本地多文件编辑需要已安装配对的 OpenDesk Native Host。从本目录执行 `opendesk browser dev .`，保存自动准备，明确点击 Sidebar「开发 → 本地项目 → 运行本地项目」才操作目标网页。统一测试页 `http://127.0.0.1:43111/demo-form.html`，仓库根目录运行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。原用户脚本许可和网站授权不可跳过。

**仅 Developer Edition 无需 Native 也可在浏览器直接编辑 Vue SFC：** Side Panel →「开发」→「直接编辑」→「Vue SFC」，把本项目 `src/App.vue` 的 `<script setup>` / `<template>` / `<style scoped>` 粘贴进编辑器，明确点击「运行 React/Vue 组件」；固定 Dedicated Worker 转换后进入原 Page USER_SCRIPT，使用原「停止受管 UI」卸载。此功能针对单组件源码，不是对本地目录的多文件同步。另可[导入冻结的 Vue JSON 草稿](../../import-ready/README.zh-CN.md)并试运行，导入 JSON 与在线转换属于不同入口。TS/TSX、外部 `src`、未经批准的预处理器和 CSS 网络依赖仍会拒绝。

维护者 `npm run build:program` 现在直接运行项目编译器，不先执行 Vite。独立保留 `build:framework`、`src/runtime-entry.js`、`vite.config.mjs`、源锁和许可证作为固定运行时来源。旧 `src/Widget.vue`、`src/main.js`、`src/enhancement.js` 仅用于原 R24.1 高亮/撤销场景，不作为新默认组件依赖。

## 验收边界

- [真实 Mac Chrome Vue SFC 挂载、Scoped CSS、点击、Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353894)，当前源码 `sourceHash=747838ef6225583e6128f906ec2491f0ce141b7f8f50f3d01e2bcf7877f8f0c0`。
- [Vue 20 次独立 Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890)，新 `previewId/documentId`、原生回执和 DOM 清理。

本地 SFC 自动编译以及[无 Native 浏览器端原始 SFC → Worker 编译 → 指针交互 → Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847) 已有旧候选真实 Chrome 证据；同一驱动还验证了无效源码不重播旧效果和受控 Teleport 清理。当前候选完整 R24.4：独立编辑/运行/停止 20×、SPA/BFCache、撤权、安装更新、200% 缩放/窄屏及最终 F3/ZIP 仍待验收。

[组件/API 指南](../../../docs/api/page-ui-frameworks.zh-CN.md) · [本地目录](../../../docs/framework/local-directory-cli-r17.zh-CN.md)
