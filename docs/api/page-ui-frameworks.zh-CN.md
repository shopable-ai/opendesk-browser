# Page UI · React/Vue 官方组件开发（R24.3）

> **R24.5 分版说明：** 默认 **Standard** 不打包 4.25 MB 浏览器 JSX/SFC 编译资源，但保留 React/Vue Direct、固定运行时、现有工具和 `opendesk browser dev .` 的 Node 本地 JSX/SFC 自动准备。只有单独安装的 **Developer Edition** 才支持在浏览器 Side Panel 中直接输入原始 JSX/Vue SFC 并即时编译。请查看 [R24.5 双版本架构与构建命令](../architecture/browser-framework/browser-compiler-editions-r245.zh-CN.md)。该分支尚未正式发布。

2026-10-12 核查：**四个本地目录的 JSX/SFC 自动准备和 40 次 Chrome Run/Stop 有历史原生证据；浏览器无需 Native 的 Side Panel JSX/SFC → Worker 编译 → USER_SCRIPT 网页交互 → Stop 也在固定候选上通过真实 Chrome 验收。** 这不代表 R24.4 的全部异常路径、20 次浏览器编辑循环及最终 ZIP 已验收。

[Page USER_SCRIPT](page-userscript.zh-CN.md) · [本地项目](local-projects.zh-CN.md) · [受管 UI 生命周期](../framework/ui-api.zh-CN.md) · [架构](../architecture/browser-framework/page-framework-authoring-r243.zh-CN.md)

## 零、自动编译可行性与验收状态

**已证实可行：JSX 和 Vue SFC 必须转换为浏览器可执行的普通 JavaScript，但 OpenDesk 已能自动转换。用户不需要每次手动运行 Vite、npm build 或导入预编译 JSON。** 本地项目保存后后台准备，浏览器直接编辑则点击 Run 后按需编译；两条路径都只有用户明确点击 Run 才操作网页，绝不是“保存即热更新／自动执行”。

| 实际入口 | 自动编译时机 | 本机 Native | 验收结论 |
| --- | --- | --- | --- |
| 本地 `page-ui-react/src/App.jsx` | 保存后准备；Run 时重验最新输入 | 必需（读取已授权本地目录） | **历史真实 Chrome PASS**：React 20/20 Run/Stop；独立 npm CLI 编译 PASS |
| 本地 `page-ui-vue/src/App.vue` | 保存后准备；Run 时重验最新输入 | 必需 | **历史真实 Chrome PASS**：Vue 20/20 Run/Stop；独立 npm CLI 编译 PASS |
| 浏览器直接编辑 React JSX | 用户点击 Run 后扩展可信 Worker 转换 | 不需要 | **历史真实 Chrome PASS**：JSX、Hooks 点击状态更新、Stop |
| 浏览器直接编辑 Vue SFC | 用户点击 Run 后 Worker 编译 `<script setup>`、模板和样式 | 不需要 | **历史真实 Chrome PASS**：`ref` 交互、Stop、无效源码拒绝及修复后重新运行 |
| 最新 `main` 的完整 R24.4 矩阵 | 每候选需重新核对受影响输入 | 各自对应 | **NOT_TESTED / 未正式放行**：浏览器 React/Vue 各 20 次独立循环，完整 SPA/BFCache、撤权、未知效果 Stop、主题/窄屏/200% 缩放与最终 F3/ZIP |

证据：[本地各 20 次真实 Chrome](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890)；[浏览器无需 Native 的 JSX/SFC 完整正向 Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847)；[Vue 错误拒绝与修复后再次运行](https://github.com/shopable-ai/opendesk-browser/actions/runs/38230083408)；[macOS/Ubuntu 独立 npm 安装包四目录编译](https://github.com/shopable-ai/opendesk-browser/actions/runs/38231722128)。上述 PASS 只属于记录中的固定 CI 源码/包身份，不等于任意最新 HEAD 已通过完整测试。

**不支持**：绕开 OpenDesk 把原始 `.jsx` / `.vue` 文件直接交给 Chrome 当普通 JS 执行；浏览器单组件编辑器也不支持任意磁盘多文件依赖、任意 npm/远程 CDN、TS/TSX、动态导入或自定义 Vite 插件。需要完整目录开发时请使用配对 Native 的 `opendesk browser dev .`。

## 一、选择官方组件开发方式

| 项目目录（`examples/programs/`） | 默认入口 | 用户代码 | 系统承担 |
| --- | --- | --- | --- |
| `page-ui-react` | `src/App.jsx` | `import {useState} from 'react'`、JSX、`export default App` | JSX 转换、内置 React/ReactDOM、受管挂载 |
| `page-ui-vue` | `src/App.vue` | `<script setup>`、`<template>`、`<style scoped>` | Vue SFC 编译、固定 runtime/helper、scoped CSS |
| `page-ui-react-direct` | `src/main.js` | 标准 React Hooks、当前网页信息与悬浮交互 | 跨普通 HTTP(S) 网页的自动悬浮挂载与 Stop |
| `page-ui-vue-direct` | `src/main.js` | 标准 Vue `h/ref` 普通 JavaScript Options 组件 | 无 SFC 编译，仍自动生成 Vue app/Stop |

四个目录各有独立项目身份，但只共用**一套** `opendesk.project.v1` 本地解析器、页面执行链、固定 framework 资源和受管 UI 生命周期，不产生额外 SDK/安装器。默认入口标记 `opendesk.entryMode: "component"` + `framework: "react" | "vue"`；未声明该入口的旧 `async-main`、classic 用户脚本和 Controller 保持兼容。

所有默认组件只写官方语法和默认导出；**不要求** `createPageUI`、`createDemoEnhancer`、`main()` 或手动 `createRoot/createApp`。原高亮/撤销演示的完整源码保存在 `examples/import-ready/history/` 的 R24.2 历史 JSON，旧版原生回归从快照还原临时测试项目。React Direct 已删除重复旧源码；Vue Direct 仍保留 `src/legacy-main.js` + `src/enhancement.js`。

## 二、本地源码开发：保存自动准备，Run 才操作网页

本地目录开发仍需要**已安装和配对**的 OpenDesk Native Host，这是连接本地文件系统的前置条件；不是让用户手动安装 React/Vue、为此示例创建 `node_modules` 或执行 Vite。

从仓库根目录启动测试页：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

Chrome 可打开 `http://127.0.0.1:43111/demo-form.html` 进行回归；**React Direct 也能在另一个已授权的普通 HTTP(S) 网页手动运行**，不依赖本测试服务。进入任意一个示例目录，启动已配置的 `opendesk browser dev .`；Sidebar → 开发 → 本地项目 → 选择已授权项目。编辑器或 Codex **保存后自动准备，保存不是 Run/HMR**；明确点击「运行本地项目」才在获准网页执行当前输入。停止由原 `previewId` 生命周期调用 React `root.unmount()` 或 Vue `app.unmount()`，移除受管 DOM/样式。不要将网页权限和项目 `pageRules` 混为一谈。

维护者/离线导出如需显式构建，`npm run build:program` 直接调用 `scripts/build-program-project.mjs`，**不再隐式执行 Vite**。`build:framework` 与 `src/runtime-entry.js` 仅保留为维护者预装固定运行时来源，不是用户日常 Run 操作。

## 三、Developer Edition：浏览器内直接开发（无需 Native）

仅 Developer Edition 提供：进入 Side Panel → 开发 → 直接编辑，选择「React JSX」或「Vue SFC」，输入原始组件源码并明确点击「运行 React/Vue 组件」。扩展自身的按需 Dedicated Worker 编译受信固定版本的 Babel/Vue SFC；生成的普通 JS 由原有 Page USER_SCRIPT 在当前已授权文档中运行。点击「停止受管 UI」卸载 root/app 和受管样式。**编辑、保存与编译均不会自动执行网页业务。** 此路径无需本机 Go/Node/npm/Vite/Native 编译服务，但仍需 Chrome「允许用户脚本」、当前网站访问授权和可运行的 HTTP(S) 页面。

[真实 macOS Chrome 无 Native 编译、交互与 Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847) 已在候选 `9cdb3bf98fe410b88c456801855e2635f6b1a7b0` 验证 React Hooks 状态更新与 Vue `ref` 更新；它不是此后任意代码变动的自动通过证明。浏览器目前面向单组件和受信固定框架导入，不提供任意 npm 包、跨文件相对导入、动态导入、远程 CDN、TypeScript/TSX 及自定义 Vite 插件。转换错误应以侧栏错误/位置诊断为准，不会回退执行旧版本。

### 兼容：导入已经冻结的 JSON

「发现 → 导入」仍可选择已预构建 JSON；校验冻结的 `program.js`/`sourceHash` 后回到「开发 → 直接编辑」明确运行。该路径不会因导入自动安装/执行；只读 JSX/SFC 快照与浏览器直接编辑原始组件是两种不同的入口。

## 四、运行时、转换器与安全边界

固定 React 19.2.0 与 Vue 3.5.22 来自扩展资源并进行 SHA-256/字节/许可证校验；React/Vue 官方常用 Hook/helper 已按真实运行时导出注册，缺失导出和跨框架导入在准备期拒绝。Vue SFC `@vue/compiler-sfc@3.5.22` 以独立固定资源进行数据转换，不在页面 USER_SCRIPT 执行编译器。Node 路径使用现有根锁定 `esbuild@0.28.2` 和原 Webpack，限制源码图及编译字节，不重复打入 ReactDOM/Vue。

所有业务源码仅由原 Chrome `USER_SCRIPT`、原权限/目标文档/来源身份运行；Shadow DOM 不是安全沙箱。安装、预览、运行、停止是不同的明确动作；Stop 可卸载受管 DOM/监听器/样式，不承诺撤销已经提交的表单或网络请求。**React Direct 通用悬浮示例**现使用 `*://*/*` 匹配普通 HTTP(S) 网页，仅供手动跨站开发；这不是网站权限授予，更不是全站自动安装许可。另三个示例仍使用各自的页面规则。

## 五、实测证据与缺口

- [R24.3 六项实际组件 + R24.2 旧版 Chrome Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353894)：四种 R24.3 编写方式、两个 R24.2 兼容案例全部取得原生 `previewId/sourceHash/documentId/Stop`。
- [R24.3 React 20 次 + Vue 20 次独立 Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890)：`40` 个独立 `previewId`、`40` 个新 `documentId`、`40` 次成功 Stop/DOM 清理，原生输入及资源释放。候选 `1e532a8...`，不把它套到后续任意输入。
- [R24.3 四目录冻结导入 JSON 生成](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154353845)：固定产物、真实构建源码哈希、历史快照单独保存。
- [项目合同、组件语法/导入/编译/哈希测试](https://github.com/shopable-ai/opendesk-browser/actions/runs/38154669950)，后续 CI 会验证更新后的构建入口。

**R24.3 原生新增证据：**[无 Native Side Panel React/Vue 真实编辑/Run/指针交互/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847) 已在所绑定的 macOS Chrome 候选 PASS；早期只有 Worker 编译的记录继续保留但不再代表唯一验收。**R24.4 仍未关闭：**浏览器内 20×React/20×Vue 独立编辑-运行-停止矩阵、React 编译错误完整恢复与重复运行保护、SPA/BFCache、撤权、CSS scoped 全面样式验证、200% 缩放/窄屏/暗色/键盘、性能与完整新候选安装/更新/F3/ZIP。未取得原生证据的项目依然 NOT_TESTED，不得自评 ≥95。浏览器编译器候选的供应链审查见 [工作流](../framework/workstreams/page-browser-compiler-r243-20261012.md)。这些缺口禁止用设计分或已有本地 Chrome PASS 抵消。

实测、评分和待办持续更新到 [R24.3 工作流](../framework/workstreams/page-framework-authoring-r243-20261011.md)。

## 六、本地 Codex 当前源码验收入口

可复制执行的逐项验收 GOAL（包含四示例目录、受信框架依赖、浏览器无 Native、真实 Mac Chrome、独立 20 次循环、失败回退、证据绑定及主分支并行保护）：[R24.4 本地 Codex 验收任务](../framework/prompts/goal-r244-page-ui-local-codex-acceptance.zh-CN.md)。开始前先核对最新 `main` 和已存在的工作流证据，避免重复启动受占用的 CFT Profile 或重新打包无关资产。
