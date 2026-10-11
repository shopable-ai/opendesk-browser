# GOAL：OpenDesk Browser R24.3 — React/Vue 官方组件语法、内置依赖、自动准备、四目录迁移与真实验收

日期：2026-10-11。默认中文。目标仓库：https://github.com/shopable-ai/opendesk-browser

作为 Chrome MV3、WXT/Vite、React、Vue、JavaScript 编译、Page USER_SCRIPT、Native 本地开发、供应链安全、UI/UX 和真实 Chrome 验收负责人，直接检查和增量修改真实仓库、测试、修复、更新文档并按授权安全提交。不是再输出一份方案或下一份提示词。

## 一、先读已经确认的方案

- AGENTS.md
- docs/framework/testing-guide.md
- docs/architecture/browser-framework/page-framework-authoring-r243.zh-CN.md
- docs/api/page-ui-frameworks.zh-CN.md
- docs/api/local-projects.zh-CN.md
- docs/framework/local-directory-cli-r17.zh-CN.md
- docs/framework/local-development-prebuild-r23.zh-CN.md
- docs/framework/workstreams/page-framework-authoring-r243-20261011.md
- docs/framework/workstreams/page-ui-no-build-r242-20261011.md
- 四个 examples/programs/page-ui-* 相关 README 与 examples/import-ready/README.zh-CN.md

设计文件已经确认目标和技术边界；不得重新设计另一套 SDK、执行器、安装器、权限系统、vendor 注册表或本地连接。文档的“设计已确认”不是“代码已实现”，历史 PASS 不是当前候选证据。若最新主线已完成部分能力，先核对真实源码与输入身份再复用，不重复造轮子。

仅在 main 工作，不创建分支或 Worktree，不强推、不做破坏性 reset/clean，不覆盖其他 Agent 的未提交源码、dist、浏览器 profile 或证据。先查看 pwd、git status --short --branch、HEAD、origin/main 和近期日志；fetch 后仅安全快进。无法访问用户 Mac 时不得假装已经在 Mac 执行，仍完成可进行的源码工作和验证，明确实机阻塞。

## 二、固定的最终用户体验

用户选择 React 或 Vue，直接写官方组件或导入源码，点击运行。OpenDesk 提供固定框架、必要的自动语法转换、受管挂载和停止。

基础浏览器编辑/单组件导入必须不依赖 Native 或项目 node_modules，不要求用户执行 npm、Vite、webpack。维护者开发依赖与用户免安装分开。多文件本地开发继续使用已安装配对的 opendesk browser dev .，保存自动准备，用户明确 Run 才应用；不是保存即 HMR，不自动安装。

默认用户代码不要求 createPageUI、createDemoEnhancer、内部全局变量或 main()。这些不是新的必学语法。createPageUI 留在系统生成入口里；高亮业务保留为进阶示例，不能删掉旧可逆 DOM 验收。

React 最小验收源码，目标 src/App.jsx：

```jsx
import { useState } from 'react';
export default function App() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(n => n + 1)}>已点击 {count} 次</button>;
}
```

Vue 最小验收源码，目标 src/App.vue：

```vue
<script setup>
import { ref } from 'vue';
const count = ref(0);
</script>
<template>
  <button type="button" @click="count++">已点击 {{ count }} 次</button>
</template>
<style scoped>
button { padding: 8px 14px; cursor: pointer; }
</style>
```

以上源码必须保持官方组件形式，不能为了让测试通过强迫用户改写成 createElement/h 或 OpenDesk 专用 DSL。普通 JS 渲染函数本身也是官方能力，作为另一种选择继续支持。

## 三、四个目录全部处理，不重建四套框架

1. examples/programs/page-ui-react：升级为默认 JSX 组件示例，在原目录提供 App.jsx，取消用户必须手工 build:framework 的路径。
2. examples/programs/page-ui-vue：升级为默认 SFC 示例，在原目录提供 App.vue，处理 script/template/scoped CSS。
3. examples/programs/page-ui-react-direct：保留目录和项目身份，简化 src/main.js，标准 react 导入、普通 JS 组件和自动挂载；旧 async-main 模式继续兼容。
4. examples/programs/page-ui-vue-direct：保留目录和项目身份，标准 vue 导入、普通 JS 组件和自动挂载；旧模式继续兼容。

顺序是共享能力 -> 两个默认组件 -> direct 兼容 -> 导入产物与文档。不先提交无法运行的示例就声称迁移完成，不新建第五、第六套替代目录。保留并核对 runtime-entry.js、scripts/build-page-framework-runtimes.mjs、锁文件、许可证及预装框架来源，不能清理 Vite 用户路径时误删维护者构建来源。

## 四、实现原框架上的完整链路

优先核查并复用：

- src/libs/page-frameworks/contract.js、loader.js、固定资源与许可证；scripts/libs.mjs、scripts/libs-doctor.mjs 和已有包清单。
- scripts/build-program-project.mjs、scripts/validate-program-project.mjs、schemas/opendesk-program-project.v1.schema.json。
- native-agent/local-dev/resolver.mjs、preparation.mjs、snapshot.mjs。
- src/scripting/user-scripts/page-ui.js、page-ui-mount.js、execution-source.js、preview.js、installed-programs.js、managed-ui-lifecycle.js。
- 原开发 UI、源码/草稿导入、安装更新流程和 examples/import-ready。

### 4.1 标准模块与入口

react、react-dom/client、选定 JSX 转换需要的辅助模块、vue 及 Vue 编译 helper 均链接到扩展固定框架。不把整套框架重复打进用户源码，不借用网站全局对象。

审计当前选择性 API 导出，覆盖声明支持的客户端 API。至少验证 React useCallback/useReducer 等非旧最小集合接口，以及 Vue 模板生成 helper；不支持导出、混用框架或版本不匹配要在准备阶段定位文件/行/列。

沿用 framework/pageRules 和 opendesk.project.v1。按设计新增 Page 专属 entryMode: component，省略保持旧 async-main；若已有等价字段则直接复用并更新设计记录。schema、验证器、导入、快照和本地消费者一起改，不改变 Controller/classic-userscript 的语义。

组件模式生成一次受管挂载和卸载，不全局修改官方 createRoot/createApp。即使用户源码已不直接 import @opendesk/ui，生成入口依赖的 UI/Mount/Rules 等辅助文件也必须纳入原快照闭包、身份哈希和 managedUI 判定，防止再次出现缺失 helper 或 Stop 不可用。

### 4.2 共享纯转换核心

浏览器与本地共享转换规则、编译器版本、测试向量和输出合同。浏览器使用扩展自带按需 Worker；本地接入已有 Resolver/preparation/Webpack。不要将 Node webpack 强塞进浏览器，不增加第二个网页执行器。

使用成熟且固定的转换器，禁止正则替换 JSX/SFC 或手写模板解释器。Vue 预编译为 render 函数；处理普通 script、script setup、Options API、常用模板绑定和 scoped CSS。静态相对模块、CSS 与 Source Map 经过原文件/资产边界。

转换只处理数据，不执行组件、源码顶层业务、用户 package scripts、构建配置或插件。只引入完成该转换确实必需且经授权的固定维护者依赖，审核版本、来源、许可证、传递闭包和体积；不自动下载 latest，不通过 CDN/远端编译服务处理用户源码。不把“用户免安装”解释为允许无审计新增依赖。

JavaScript/JSX、Vue JavaScript SFC 和四目录所需静态模块为必达范围；未支持的 TS/TSX、预处理器、外部 src 块或其他扩展语法给出明确诊断，不悄悄吞掉。既有经验证能力保留，不无故回退。

### 4.3 版本、缓存与资源

输出复用原 Page 源码、资产、身份和回执合同。缓存涵盖完整源码图、入口模式、框架/编译器版本与哈希、转换选项、生成入口和 CSS。准备阶段与执行阶段复核同一输入，错误不回退旧成功源码，迟到结果不能覆盖新版本或框架切换。

编译器不进入常驻 SW，按需加载、限量输入、可取消、超时并释放 Worker。测量冷/热准备、缓存命中、输入响应、内存和包大小。原 SW、Page、Native 预算不暗中调大，安全扫描不删除。若最新主线已有无关构建阻塞，记录具体归因，不冒用别的候选 PASS。

框架资源升级核对 API/ABI、代码/许可证哈希与旧草稿策略，原身份记录不可伪造。direct 源码变化后真实重建当前 import-ready JSON，更新一致性测试，同时保存旧快照/回执做兼容；不是把历史哈希改成新值继续引用旧测试。

## 五、UI、权限与生命周期

在已有开发页面提供 React/Vue 选择、主要代码区、简短状态、运行/停止；挂载位置和网站范围放设置。不新建 IDE。切换框架保留各自草稿，不静默覆盖代码；旧实例清理失败阻止替换。

基础浏览器路径在无 Native 环境完成编辑、源码导入、准备、真正 Page 运行和停止。本地路径继续既有 CLI。只生成 JavaScript 不算预览，独立静态 HTML 不算扩展运行。

保持原网站授权、实际 tab/frame/document、sourceHash、USER_SCRIPT 和消息身份。遵守扩展页面/Worker CSP，不在特权页面执行用户源码，不绕过原权限或扩大到全站。Shadow DOM 不是安全沙箱。

React root.unmount/Vue app.unmount、样式、自建 DOM 和受管资源全部清理。官方 effect/onUnmounted 中的外部监听和计时器、Portal/Teleport 外部 DOM 要有释放测试。不承诺回滚已提交的网络或表单业务。

重复运行、停止、SPA、BFCache、导航和撤权分别落实到原生命周期服务并取证。仅拒绝新的运行不等于撤权后旧 UI 已清理。

## 六、测试、修复与三轮审计

先读 testing-guide，核对相关测试输入/环境是否变化。复用未受影响证据，有变化只跑受影响范围；不覆盖旧产物和其他 Agent 的独占资源。

现有基础回归入口：

```sh
node --test tests/environment/page-ui-no-build-r242.test.mjs tests/environment/page-ui-import-drafts-r242.test.mjs
node --test tests/environment/page-ui-mount.test.mjs tests/environment/page-installed-programs.test.mjs tests/environment/local-dev-managed-ui.test.mjs
node --test tests/environment/page-url-scope-r241.test.mjs tests/environment/page-framework-examples-r241.test.mjs
npm run check
npm run build:dev
npm run build
```

按新增代码补测试，并在可安全使用的真实 Mac Chrome/CFT 中验收：

- 两个最小官方组件、direct 普通 JS、标准 API、相对模块、CSS scoped、源码错误定位。
- 无 Native 浏览器编辑/导入，本地保存/缓存/错误不回退，框架切换与重复挂载。
- 旧 async-main、旧 JSON 草稿、固定程序保存/安装/更新、框架版本兼容。
- 网站/精确端口/撤权/CSP、SPA/BFCache、导航失效、开发/生产包身份与预算。
- React/Vue 各 20 次独立 Run/Stop；每次不同真实 previewId，记录 sourceHash/documentId/stop receipt 和 DOM 清理。不是 20 次按钮点击。遵守原命名世界预算，必要时使用新 document，不削弱隔离限制。
- 窄屏、暗色、200% 缩放、键盘与错误可读性，提供真实 UI 截图。

标准手测页面为 examples/tasks/demo-form.html；端口未占用时从仓库根目录启动 python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks，访问 http://127.0.0.1:43111/demo-form.html。复用现有真实 Chrome 驱动，不使用合成点击或伪造回执冒充原生证据。

第一轮：用户路径与最小代码；第二轮：官方语法/API、源码闭包与兼容；第三轮：权限/供应链、性能、生命周期和真实 UI。每轮输出具体缺陷、修复、证据，不只重复打分。

## 七、交付与评分

更新四目录源码/README、API 指南、设计的实际实施状态、真实生成的导入示例及本轮专属 workstream。代码 UI 有变化就提供可查看预览与真实截图；静态预览明确标注，不能替代 Chrome PASS。保留全部历史证据。

最终列出：实际修改路径、提交 SHA、实际测试命令与结果、候选/扩展身份、原生截图及回执、未完成事项与具体阻塞。仅提交本任务文件；推送遵守用户授权，不发布 release、不强推。

设计自评 96/100 不是实现分数。官方语法/API、零安装易用性、架构兼容、安全供应链、生命周期、性能/可访问性/文档逐项独立评分，均达到 95 且关键用例有证据才放行。P0/P1 或必达项 NOT_TESTED 不能用平均分抵消。没有 Mac/Chrome 证据就如实标未测，继续完成能执行的代码工作，不再次只交付建议或新提示词。
