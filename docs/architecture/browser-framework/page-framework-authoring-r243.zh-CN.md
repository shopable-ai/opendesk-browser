# R24.3 · React/Vue 官方组件开发与四目录迁移

日期：2026-10-11，实施状态更新于 2026-10-12。**原设计已分阶段实施：本地四目录、固定运行时、组件自动挂载、预构建导入、40 次独立 Chrome Run/Stop 已有源码与原生证据；浏览器原始 JSX/SFC 无 Native 实时编译仍未实现。**

> 下文 1—7 节保留最初设计决策和当时“待实现”措辞以避免丢失架构约束；其时间性状态应以 [最新 API 指南](../../api/page-ui-frameworks.zh-CN.md) 和 [工作流验收记录](../../framework/workstreams/page-framework-authoring-r243-20261011.md) 为准。不得将原始设计自评 96/100 当成实现评分。

本文件保存用户确认的方案，供新对话直接继续开发。本次只更新 Markdown，不修改运行源码、框架资源、导入 JSON 或历史测试回执。核查基线为 `1d70456638124d79829f761cb71ea9f878dc8b14`；下次必须重新检查最新 main。

## 1. 用户体验目标

用户选择 React 或 Vue，编写官方组件，点击运行。OpenDesk 提供固定框架依赖、必要的语法转换、受管挂载和停止。用户不用理解内部容器 API，也不用为每个工具安装 React/Vue。

- 浏览器基础编辑与单组件导入：不要求用户安装 Native 或执行 npm/Vite。
- 本地多文件开发：保留已有 `opendesk browser dev .`，本地 AI/编辑器保存后自动准备，明确点击运行才改变网页。本地连接自身仍需安装与配对。
- 普通 JavaScript：React createElement/Hooks、Vue h/ref/Options API 继续支持，不强制所有用户改用 JSX/SFC。
- 本轮只做当前网页的 Page USER_SCRIPT 工具，不创建第二套执行器、安装器、权限系统、RPC 或独立 IDE。

免手工编译不等于没有系统转换；框架预装不等于所有页面常驻两套框架。保存、导入、预览、安装和自动触发必须分开。

## 2. 四个目录都修改，但职责不同

| 目录（examples/programs 下） | 后续修改 | 目标定位 |
| --- | --- | --- |
| page-ui-react | 在原目录提供 App.jsx 默认组件，接入自动转换与挂载，取消用户必须手工 build:framework 的路径 | 默认 React JSX 示例 |
| page-ui-vue | 在原目录提供 App.vue，处理 script、template 和 scoped CSS，接入同一准备链 | 默认 Vue SFC 示例 |
| page-ui-react-direct | 简化 src/main.js，使用标准 react 导入和普通 JS 组件，挂载样板由系统生成 | React 普通 JS 与兼容示例 |
| page-ui-vue-direct | 简化 src/main.js，使用标准 vue 导入和普通 JS 组件，复用生成入口 | Vue 普通 JS 与兼容示例 |

不重建四套框架，不新增第五、第六套替代目录，不无故更改目录名和项目 ID。先完成共享能力，再迁移默认两例，再同步 direct 两例。共享能力尚未就绪时，不先把示例改成无法运行的语法并宣称完成。

`createPageUI` 留在内部生成入口中，继续提供原有容器、样式与清理能力。`createDemoEnhancer` 是高亮演示业务，不是框架 API；从最小入门代码移出，但保留可逆 DOM 进阶场景及原测试。不能只删两行 import 就声称实现官方组件开发。

旧 main()/async-main、旧草稿、已安装固定版本和旧全局接口都需要兼容回归。新 component 入口不得改变旧函数的调用语义。

## 3. 最小验收组件

以下是待实现入口的验收输入，不表示当前旧编辑框已经能够运行。

React `src/App.jsx`：

```jsx
import { useState } from 'react';
export default function App() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(n => n + 1)}>已点击 {count} 次</button>;
}
```

Vue `src/App.vue`：

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

新入口默认导出组件，不要求 main()、@opendesk/ui、enhancement.js 或 OpenDeskPageReact/OpenDeskPageVue。原生 createRoot/createApp 手动入口仍可作为兼容高级用法，不全局修改官方函数来接管挂载。

沿用 `opendesk.project.v1`、`framework`、`pageRules`。拟新增 Page 专属 `opendesk.entryMode: "component"`；省略字段保持旧 async-main 语义。此字段尚未实现。同步 schema、验证器、快照、导入与所有消费者；若最新主线已有等价字段则复用，禁止两个同义开关。Controller/classic-userscript 不受新组件模式影响。

## 4. 固定技术路线

```text
用户源码与明确授权的文件图
  -> 原项目/草稿验证
  -> 共享纯转换核心：JSX/SFC、静态模块链接、CSS、Source Map
       浏览器适配：扩展固定资源、按需 Worker、只处理数据
       本地适配：原 LocalDevResolver/preparation/Webpack
  -> 系统生成受管挂载入口
  -> 原源码身份、权限、tab/frame/document 核验
  -> 原 Page USER_SCRIPT 运行与停止回执
```

浏览器和本地共享转换规则、版本与测试向量，不要求将 Node webpack 放入浏览器。转换器不是第二个执行器。

复用文件：`src/libs/page-frameworks/{contract,loader}.js`、`scripts/build-program-project.mjs`、`scripts/validate-program-project.mjs`、`schemas/opendesk-program-project.v1.schema.json`、`native-agent/local-dev/{resolver,preparation,snapshot}.mjs`、`src/scripting/user-scripts/{page-ui,page-ui-mount,execution-source,preview,installed-programs,managed-ui-lifecycle}.js`。开发 UI、导入、安装、库清单和审核沿用现有模块。

### 标准导入与转换

标准 `react`、`react-dom/client`、实际 JSX 转换使用的运行时辅助模块，以及 `vue` 和 Vue 编译辅助导出，映射到扩展固定框架。同一工具只使用所选框架，不将整套 ReactDOM/Vue 重复打进用户包，不借用目标网站的框架。

当前内置 API 是选择性导出，需补齐声明支持的客户端范围，验证 useCallback/useReducer 等接口和 SFC 生成代码需要的 helper。缺失导出、混用框架、版本不匹配应在准备阶段给出文件/行/列，不留到运行时变成含糊错误。不宣称 SSR、任意 npm 插件或所有未来 API 均可用。

使用成熟的固定语法转换器，不能正则替换 JSX/SFC 或手写模板解释器。Vue 模板预编译为 render 函数。基础范围包括 JavaScript/JSX、静态相对模块、Vue script setup/普通 script/Options API、模板常用绑定与 scoped CSS。TS/TSX、预处理器、外部 src 块和其他未支持语法应明确诊断，不静默降级；既有已验证能力仍保留。

转换阶段不执行组件或源码顶层业务，不运行用户 package scripts、构建配置或插件。维护者确需新增固定编译依赖时，遵循任务授权并审核版本、来源、许可证、传递闭包和体积；用户无需安装。不得依赖 CDN、远端编译服务或上传用户源码。

### 身份与兼容

新增入口、生成器、CSS、Source Map、框架及编译器身份全部进入原输入指纹。快照文件闭包与 BUILD_INPUTS 同步，不能准备后又读取未冻结文件。

固定资源升级沿用原 contract/catalog 和校验机制，验证 API/ABI 与旧草稿策略，保留原历史哈希和回执。不能只改旧哈希让新字节通过。框架和编译器版本匹配应显式校验。

direct 源码变化后重新生成相应当前导入 JSON 和一致性测试，并保留旧快照/回执用于兼容测试。维护者 runtime-entry 和 scripts/build-page-framework-runtimes.mjs 的来源关系不能因清理 Vite 示例被误删。

### 准备、缓存、性能

缓存覆盖完整文件图、入口模式、转换选项、框架/编译器哈希、生成器和资产。保存只准备；运行复核最新输入；失败不回退旧成功代码；迟到结果不能覆盖新版本或框架切换。

编译 Worker 按需加载，具有输入大小、超时、取消和资源释放约束，不塞进常驻 Service Worker。分别测冷/热准备、缓存命中、编辑响应和内存/包体积。原 SW、Page、Native 预算继续有效；真实超限先定位与优化，不偷偷调大阈值或删检查。

CSS 走现有受管样式/资产路径，scoped 标记与 Source Map 回到用户源码。CSS 外部资源沿用原策略，不能泄漏到宿主页面。

## 5. 产品入口与清理

已有开发页主要显示框架选择、代码区、短状态、运行/停止；网站范围和挂载位置放设置，不新增庞大控制台。切换框架保留各自草稿，旧实例清理失败就阻止替换。默认挂载使用已有容器策略。

基本组件必须在无 Native、无项目 node_modules 的浏览器路径完成编辑/导入、准备、真实运行和停止。本地路径继续已有 CLI。只生成代码不是预览，导入成功不是已安装。保存/更新固定程序继续原生命周期。

最终用户代码只进入获准 USER_SCRIPT；遵守 Chrome 对扩展页面和 Worker 的 CSP，不在特权上下文执行用户源码，不扩大网站授权或绕过原消息身份。Shadow DOM 不是安全沙箱，权限与执行隔离仍由原框架负责。

React root.unmount/Vue app.unmount、受管样式与自建 DOM 要清理。用户自行创建的外部监听器/计时器需要按官方生命周期释放并有测试。Portal/Teleport 的外部 DOM 也要验证卸载。系统不承诺撤销已经提交的表单或网络业务。

停止、重复运行、SPA、BFCache、导航与撤权分别验收。撤权仅阻止新运行不等于旧 UI 已回收，缺口应在原生命周期服务修复。

## 6. 实施顺序与三轮审计

```text
核对最新源码和测试身份
  共享标准导入、转换与生成入口
    React App.jsx / Vue App.vue 最小闭环
      direct 两例及旧 async-main/草稿兼容
        浏览器直接编辑/导入与本地自动准备
          固定程序保存/更新回归与四目录文档同步
            三轮审计、真实 Chrome 证据和交付
```

第一轮审查用户路径与源码可读性；第二轮审查语法/API、快照和兼容；第三轮审查安全、资源、生命周期及真实 Chrome。每轮记录发现、修复和证据，不把重复口头打分当审计。

必须覆盖：两个官方最小组件、普通 JS 对等效果、无 Native 基础路径、本地保存/缓存/新错误不回退、缺失导出、CSS/Source Map、旧入口/旧草稿、网站/端口/撤权/CSP、SPA/BFCache、开发与生产构建、窄屏/暗色/200%/键盘。

React/Vue 各 20 次独立 Run/Stop，记录真实 previewId、sourceHash、documentId、stop receipt 和 DOM 清理。20 次按钮点击不能代替 20 次重建。核查原命名世界预算，必要时用新 document 验证，不放宽隔离限制。复用标准 examples/tasks/demo-form.html 和现有 Chrome 驱动。

## 7. 评分与完成判定

设计自评 **96/100**，不是独立外部评分或实现验收。待实测风险包括浏览器转换器 CSP/体积、API/ABI 兼容、准备性能和生命周期。

以下维度分别要求达到 95：官方语法/API、零安装与易用性、复用与兼容、安全与供应链、生命周期、性能/可访问性/文档。每项列评分依据、扣分项和证据。新入口当前均为 NOT_TESTED，不能因设计得分宣称代码达到 95。

任一关键 P0/P1 未关闭或必达项未测，不以平均分掩盖，不宣称全部完成。旧候选、mock、静态 HTML 和历史 Chrome PASS 不能代替本候选证据。不得用测试数量推算产品完成率。

## 8. 官方参考

- React JSX 环境与页面挂载：https://react.dev/learn/add-react-to-an-existing-project
- React 普通 JS：https://react.dev/reference/react/createElement
- Vue SFC：https://vuejs.org/guide/scaling-up/sfc.html
- Vue 渲染函数：https://vuejs.org/guide/extras/render-function.html
- Chrome 扩展 CSP：https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
- Chrome 用户脚本：https://developer.chrome.com/docs/extensions/reference/api/userScripts

公开文档的新版本不自动改变仓库固定依赖；升级必须明确审计。
