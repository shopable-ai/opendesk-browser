# Vue SFC 网页组件 · R24.3 本地自动准备

**当前状态：本目录 `src/App.vue` 已声明为默认 Vue `component` 入口，采用扩展固定版本的 Vue runtime 与同一仓库固定的 SFC 数据编译器自动准备。** 用户代码保留官方 `<script setup>`、`<template>`、`<style scoped>`；不写 `createPageUI`、`createApp`、`main()` 或手动构建命令。

从本项目目录运行已安装配对的 `opendesk browser dev .`。保存只准备，用户明确 Run 才进入获准网页；Stop 经原受管生命周期调用 `app.unmount()` 并清理组件及 scoped CSS。Vue 框架仍从扩展固定资源加载，不向用户运行包重复加入 Vue。

浏览器无 Native 的源码编辑→编译 Worker→运行尚未完成。JSX/SFC 其他语言、外部 src 和预处理器不在本地已验证范围，必须明确报错。当前 Node CI / Chrome 证据仍需以实际新提交为准。

保留旧 `src/Widget.vue`、`src/main.js`、`src/framework.js`、`src/runtime-entry.js`、`src/enhancement.js` 及其 R24.1 旧测试，不覆盖历史失败或回执。

## 历史 R24.1 资料（不代表当前入口）


**状态：R24.3 设计已确认，源码迁移待实施。本次只更新 README。** 当前目录仍是原 Vue SFC + Vite 示例，不代表浏览器内 SFC 自动转换已经完成。

[四目录总览](../../../docs/api/page-ui-frameworks.zh-CN.md) · [确认的技术方案](../../../docs/architecture/browser-framework/page-framework-authoring-r243.zh-CN.md) · [下一轮 GOAL](../../../docs/framework/prompts/goal-r243-page-framework-authoring.zh-CN.md)

## 目标开发方式（待实施）

本目录提供 `src/App.vue`，采用官方 script setup 或普通 script/Options API、template 与 scoped CSS。用户写 `import { ref } from 'vue'`；系统自动转换、链接扩展内置框架并挂载。

基础浏览器编辑/单组件导入不要求 Native 或项目 node_modules，不让用户手工 npm/Vite。本地开发保留已安装配对的 `opendesk browser dev .`。框架预装与 SFC 转换是不同环节，不能宣称浏览器原生执行 .vue。

默认组件不写 createPageUI、createDemoEnhancer、main() 或强制手动 createApp；受管容器和 app.unmount 留在生成入口。先完成共享链，再迁移本目录，不建替代目录、不无故改 ID。保留 `src/runtime-entry.js`、维护者固定运行时构建及许可证来源；原网页高亮和可逆 DOM 回归不删除。

## 现有源码与历史构建（不是新入口操作指南）

当前组件是 `src/Widget.vue`，使用 script setup/Composition API；框架入口使用 createApp(Widget)，通过原 createPageUI 容器运行和卸载。不是 Side Panel 或独立应用。

从本示例目录复现 R24.1：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:framework
cd ../../..
node scripts/validate-program-project.mjs examples/programs/page-ui-vue
npm run build:program -- examples/programs/page-ui-vue --mode development
```

原状态为 LOCKED_SOURCE / BUILD_LIMIT_BLOCKED：Vite SFC 产物 **144,502 字节**，超过原 Page 预算，最终 Page 构建与 Chrome 未通过该路径。此为历史候选证据，不代表最新全仓构建状态；不得靠调大限制或 CDN 冒充可运行。

新链完成前体验已有普通 JS 路径见 [page-ui-vue-direct](../page-ui-vue-direct/README.md)。

## 统一测试与交付

从仓库根目录启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，访问 `http://127.0.0.1:43111/demo-form.html`。pageRules 不是 Chrome 网站权限或安装批准；运行和安装分开。

后续验收涵盖 App.vue、模板常用指令/绑定、编译辅助 API、scoped CSS、Source Map、浏览器无 Native/本地两条路径、真实挂载/停止与旧示例兼容。SPA/BFCache、撤权、独立 Run/Stop、CSP、窄屏/暗色/200% 必须单列原生证据，不沿用旧候选 PASS。历史记录保留在 `docs/framework/workstreams/page-ui-r241-20261011.md`。
