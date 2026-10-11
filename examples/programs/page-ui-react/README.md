# React JSX 网页组件 · R24.3 已接入本地自动准备

**当前状态：React `App.jsx` 已在原目录声明为 `component` 入口；本地 Node/Webpack 自动转换使用根锁定的 esbuild，并在原 Page 受管容器挂载。浏览器无 Native 的 JSX Worker 尚未实现，也不得把本地链宣称为浏览器直接编辑完成。** 需要核对本轮 CI 与真实 Chrome 才能给出最终 PASS。

用户编辑 `src/App.jsx`，使用标准 `import {useState} from 'react'`、JSX 与默认导出组件，不写 `createPageUI`、`createDemoEnhancer`、`main()` 或手工构建命令。当前本地目录模式依旧要求已安装配对的 OpenDesk Host，运行 `opendesk browser dev .`；保存只准备，点击「运行」才改变网页。组件通过扩展预装 React 19.2.0（固定哈希）渲染，系统入口登记 `root.unmount()`。

当前原样保留 `src/main.js`、`src/framework.jsx`、`src/runtime-entry.js`、`src/enhancement.js` 供旧 R24.1 回归和维护者固定资源重建；它们不是新默认组件的依赖。未支持的固定 React 导出会在验证阶段报错。历史手工 Vite / 旧输出超限记录在下文，不能冒充新链证据。

## 历史设计及 R24.1 路径

**状态：R24.3 设计已确认，源码迁移待实施。本次只更新 README。** 当前目录仍是原 React 19 JSX + Vite 示例，不能因为文档标题更新就认为已经支持浏览器内 JSX 自动转换。

[四目录总览](../../../docs/api/page-ui-frameworks.zh-CN.md) · [确认的技术方案](../../../docs/architecture/browser-framework/page-framework-authoring-r243.zh-CN.md) · [下一轮 GOAL](../../../docs/framework/prompts/goal-r243-page-framework-authoring.zh-CN.md)

## 目标开发方式（待实施）

在本目录提供 `src/App.jsx`：用户使用 `import { useState } from 'react'` 和默认导出组件；OpenDesk 自动准备并挂载。基础浏览器编辑/导入不要求 Native，也不要求用户安装 React/Vue 或手工运行 npm/Vite。本地开发继续原 `opendesk browser dev .`，连接自身仍需安装配对。

默认组件不要求 createPageUI、createDemoEnhancer 或 main()；原容器与卸载逻辑保留在生成入口。框架来自扩展固定资源，不能每个用户包重复携带 ReactDOM。

先完成共享转换/标准导入/挂载链，再修改本目录源码及项目声明，不新增替代目录、不无故改项目 ID。保留 `src/runtime-entry.js` 与维护者 `scripts/build-page-framework-runtimes.mjs` 的关系，不能删除预装框架来源。旧高亮与可逆 DOM 场景继续回归，不用计数器取代全部旧测试。

## 现有源码与历史构建（不是新入口操作指南）

当前主要组件是 `src/framework.jsx`，项目入口是 `src/main.js`。这是 Page USER_SCRIPT 网页增强，不是 Side Panel。原入口将组件挂在 `ui.content`，登记 root.unmount，并修改/撤销标准测试段落。

从本示例目录复现 R24.1 构建：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:framework
cd ../../..
node scripts/validate-program-project.mjs examples/programs/page-ui-react
npm run build:program -- examples/programs/page-ui-react --mode development
```

历史 R24.1：依赖锁已生成，Vite JSX 构建通过，但产物 **961,871 字节**，OpenDesk 项目校验报 E_PROJECT_LIMIT，未满足原 Page 预算，真实 Chrome 未通过该路径。数字属于历史候选，不能当作最新全仓状态；不得绕过预算或用 CDN 代替。

在新链完成前，体验已有普通 JS 路径见 [page-ui-react-direct](../page-ui-react-direct/README.md)。

## 统一测试与交付

从仓库根目录启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，访问 `http://127.0.0.1:43111/demo-form.html`。网站许可与用户脚本能力独立核对；运行、停止、安装互不等价。

后续验收包含：App.jsx 无用户安装依赖、标准 API、自动挂载/卸载、浏览器无 Native 和本地两条路径、CSS/Source Map、旧示例兼容与独立 Run/Stop。历史记录见 `docs/framework/workstreams/page-ui-r241-20261011.md`；新证据记录到 R24.3，不能改写旧回执。
