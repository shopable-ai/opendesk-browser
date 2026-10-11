# Page UI · React/Vue 官方组件开发（R24.3）

2026-10-12 状态：**四个项目目录的本地自动准备、标准导入、受管挂载、预构建草稿导入和真实 Chrome Run/Stop 已实施并有对应证据；浏览器直接输入 JSX/SFC 并免 Native 实时编译仍未实现，不能标记 R24.3 最终完成。**

[Page USER_SCRIPT](page-userscript.zh-CN.md) · [本地项目](local-projects.zh-CN.md) · [受管 UI 生命周期](../framework/ui-api.zh-CN.md) · [架构](../architecture/browser-framework/page-framework-authoring-r243.zh-CN.md)

## 一、选择官方组件开发方式

| 项目目录（`examples/programs/`） | 默认入口 | 用户代码 | 系统承担 |
| --- | --- | --- | --- |
| `page-ui-react` | `src/App.jsx` | `import {useState} from 'react'`、JSX、`export default App` | JSX 转换、内置 React/ReactDOM、受管挂载 |
| `page-ui-vue` | `src/App.vue` | `<script setup>`、`<template>`、`<style scoped>` | Vue SFC 编译、固定 runtime/helper、scoped CSS |
| `page-ui-react-direct` | `src/main.js` | 标准 React `createElement`、`useReducer`、`useCallback` | 无 JSX 编译，仍自动生成 React root/Stop |
| `page-ui-vue-direct` | `src/main.js` | 标准 Vue `h/ref` 普通 JavaScript Options 组件 | 无 SFC 编译，仍自动生成 Vue app/Stop |

四个目录各有独立项目身份，但只共用**一套** `opendesk.project.v1` 本地解析器、页面执行链、固定 framework 资源和受管 UI 生命周期，不产生额外 SDK/安装器。默认入口标记 `opendesk.entryMode: "component"` + `framework: "react" | "vue"`；未声明该入口的旧 `async-main`、classic 用户脚本和 Controller 保持兼容。

所有默认组件只写官方语法和默认导出；**不要求** `createPageUI`、`createDemoEnhancer`、`main()` 或手动 `createRoot/createApp`。原高亮/撤销演示保留在两个 direct 项目的 `src/legacy-main.js` + `src/enhancement.js`，既有历史 JSON 保存在 `examples/import-ready/history/`。

## 二、本地源码开发：保存自动准备，Run 才操作网页

本地目录开发仍需要**已安装和配对**的 OpenDesk Native Host，这是连接本地文件系统的前置条件；不是让用户手动安装 React/Vue、为此示例创建 `node_modules` 或执行 Vite。

从仓库根目录启动测试页：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

Chrome 打开 `http://127.0.0.1:43111/demo-form.html`。进入任意一个示例目录，启动已配置的 `opendesk browser dev .`；Sidebar → 开发 → 本地项目 → 选择已授权项目。编辑器或 Codex **保存后自动准备，保存不是 Run/HMR**；明确点击「运行本地项目」才在获准网页执行当前输入。停止由原 `previewId` 生命周期调用 React `root.unmount()` 或 Vue `app.unmount()`，移除受管 DOM/样式。不要将网页权限和项目 `pageRules` 混为一谈。

维护者/离线导出如需显式构建，`npm run build:program` 直接调用 `scripts/build-program-project.mjs`，**不再隐式执行 Vite**。`build:framework` 与 `src/runtime-entry.js` 仅保留为维护者预装固定运行时来源，不是用户日常 Run 操作。

## 三、无需 Native：导入已冻结的官方组件示例

[当前四份可导入 JSON 和固定 SHA-256](../../examples/import-ready/README.zh-CN.md)：

- `page-ui-react.opendesk-draft.json`（`App.jsx`）
- `page-ui-vue.opendesk-draft.json`（`App.vue`）
- `page-ui-react-direct.opendesk-draft.json`（React 普通 JS）
- `page-ui-vue-direct.opendesk-draft.json`（Vue 普通 JS）

在「发现 → 导入」选择 JSON，校验原构建器冻结的 `program.js`、`sourceHash`、只读源码快照后，回到「开发 → 直接编辑」并明确点击「在当前网页试运行」。**这条预构建导入路径无需 Native，也不会因导入自动安装或运行。** 但只读 JSX/SFC 快照不能在浏览器编辑后即时重新编译；想持续编辑请使用本地目录，或等待后述浏览器独立编译器完成。导入预构建 JSON 不等于浏览器原始源码编译已经 PASS。

## 四、运行时、转换器与安全边界

固定 React 19.2.0 与 Vue 3.5.22 来自扩展资源并进行 SHA-256/字节/许可证校验；React/Vue 官方常用 Hook/helper 已按真实运行时导出注册，缺失导出和跨框架导入在准备期拒绝。Vue SFC `@vue/compiler-sfc@3.5.22` 以独立固定资源进行数据转换，不在页面 USER_SCRIPT 执行编译器。Node 路径使用现有根锁定 `esbuild@0.28.2` 和原 Webpack，限制源码图及编译字节，不重复打入 ReactDOM/Vue。

所有业务源码仅由原 Chrome `USER_SCRIPT`、原权限/目标文档/来源身份运行；Shadow DOM 不是安全沙箱。安装、预览、运行、停止是不同的明确动作；Stop 可卸载受管 DOM/监听器/样式，不承诺撤销已经提交的表单或网络请求。示例 `pageRules` 仅匹配 `http://127.0.0.1:43111/*`；精确端口和排除路径需遵守原声明。

## 五、实测证据与缺口

- [R24.3 六项实际组件 + R24.2 旧版 Chrome Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353894)：四种 R24.3 编写方式、两个 R24.2 兼容案例全部取得原生 `previewId/sourceHash/documentId/Stop`。
- [R24.3 React 20 次 + Vue 20 次独立 Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890)：`40` 个独立 `previewId`、`40` 个新 `documentId`、`40` 次成功 Stop/DOM 清理，原生输入及资源释放。候选 `1e532a8...`，不把它套到后续任意输入。
- [R24.3 四目录冻结导入 JSON 生成](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353845)：固定产物、真实构建源码哈希、历史快照单独保存。
- [项目合同、组件语法/导入/编译/哈希测试](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154669950)，后续 CI 会验证更新后的构建入口。

**明确未完成（NOT_TESTED）：**浏览器中无 Native 的原始 JSX/SFC 实时编译与按需 Worker 闭环；对应 CSP/性能/包体积；安装/更新固定程序完整新候选验收；Portal/Teleport 外部 DOM、SPA/BFCache、撤权与 200% 缩放/窄屏/暗色/键盘等全部矩阵。浏览器编译器候选的供应链审查见 [工作流](../framework/workstreams/page-browser-compiler-r243-20261012.md)。这些缺口禁止用设计分或已有本地 Chrome PASS 抵消。

实测、评分和待办持续更新到 [R24.3 工作流](../framework/workstreams/page-framework-authoring-r243-20261011.md)。
