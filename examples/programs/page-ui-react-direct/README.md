# React 普通 JavaScript · R24.3 标准组件入口

原目录和 ID `sample.page-ui-react-direct` 不变。默认 `src/main.js` 使用官方 `import {createElement, useCallback, useReducer} from 'react'`，导出 `App` 组件，不需要 JSX、`main()`、`createPageUI` 或用户执行 npm/Vite。OpenDesk 从固定 React/ReactDOM 生成受管挂载、`root.unmount()`，用户源码不会重复打入框架。

**本地：**安装配对 Native Host 后在本目录执行 `opendesk browser dev .`；保存自动准备，点击「运行」才操作获准网页。统一测试目标 `http://127.0.0.1:43111/demo-form.html`，从仓库根目录启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。Stop 卸载组件，不修改网页表单。

**旧版保留：**`src/legacy-main.js` 原样保留 R24.2 `async-main`、`@opendesk/ui` 与 `enhancement.js` 的高亮/撤销。旧 JSON 与回执单独冻结在 `examples/import-ready/history/`，不能代替新组件验收。当前 JSON 用原构建器重新生成。浏览器直接编辑 JSX/SFC 且免 Native 自动转换尚未完成。

[组件总览](../../../docs/api/page-ui-frameworks.zh-CN.md) · [导入草稿](../../import-ready/README.zh-CN.md) · [目录 CLI](../../../docs/framework/local-directory-cli-r17.zh-CN.md)
