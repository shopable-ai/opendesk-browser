# 零参数 main()、预置运行变量与第三方库执行世界合同

**权威使用合同｜2026-10-12｜OpenDesk Browser。** 本文用于 Sidebar AI 生成代码、源码 Demo、开发文档和验收任务；`src/libs/runtime-contract.js` / `src/libs/catalog.js` 仍是**实际库的 ID、世界、版本和 API** 权威，本文不建立第二份可执行注册表。**长期产品需求是普通用户零参数直接调用受控能力；它不是把所有库塞进 SW，也不是让每个世界共享同一组全局。**

## 1. 入口合同：推荐零参数，不把内部绑定参数当成用户 API

**Controller 多文件 ESM（`runtimeKind: controller`，`sourceFormat: esm`）**：

```js
export default async function main() {
  const title = await page.title();
  const url = await page.url();

  return {
    title,
    url,
    words: _.words(title),
    date: dayjs().format('YYYY-MM-DD')
  };
}
```

**Controller Sidebar 直接编辑／单文件 `async-main`**（代码没有 ESM 构建器，**不能**粘贴 `export default`；完整可复制源码：[`controller-globals-zero-arg.js`](../../examples/programs/single-file/controller-globals-zero-arg.js)）：

```js
async function main() {
  const title = await page.title();
  return {
    title,
    url: await page.url(),
    words: _.words(title),
    date: dayjs().format('YYYY-MM-DD'),
    abi: OpenDeskLibs.abi
  };
}
```

**Page USER_SCRIPT 网页运行**（有 `document`，没有 Controller `page`）：

```js
async function main() {
  const title = document.title;
  return {
    title,
    words: _.words(title),
    date: dayjs().format('YYYY-MM-DD')
  };
}
```

目录 Page ESM 对应 `export default async function main()`；受管 UI 项目如显式声明 `assets`，历史 `main({assets})` 仍有自己的构建合同，**不能把这里的零参数 Controller 规则机械套用到资产注入项目**。

**以下是设计约束，不是需要用户自己补的调用：**

- `page`、`params`、`axiosx`、`AppStorage`、`AppLocal`、`storage` 由 **Controller Worker 的受控 AsyncBody 词法作用域**提供。脚本可以直接引用 `page.title()`、`params.keyword`，**不需要** `main({page,params})` 或 `main(page)`；也不要假定它们是 `window.page` / `globalThis.page`。后台 Broker/Authority 仍负责授予、绑定、撤权及错误回执。
- `_`、`dayjs`、`OpenDeskLibs` 在 **Controller 与 Page USER_SCRIPT** 的默认内置链运行前安装（`src/libs/core.js`、`src/libs/loader.js`）；直接访问，不要求用户 npm、CDN、`import lodash from 'lodash'`、传 `libraries` 参数或声明 `@opendesk-lib lodash`。这些**仅在对应脚本环境**预置，不能推导出任意页面、SW、工具 iframe 都有该全局。
- 内部 ESM 包装器 `scripts/build-program-project.mjs` 目前仍可兼容旧入口 `main({page,params,...})`；这是**保留旧 ABI**，不是鼓励 AI 继续生成带参数的标准写法。新 Demo、规范文档与 AI 输出均以 `main()` 为默认，不通过删除兼容逻辑来修正文档。
- 不向**网站 MAIN** 注入这些全局；Page USER_SCRIPT 的 `document` 是该世界可访问的 DOM，不能据此获得扩展高权限、跨站网络或 Controller 的 RunHost。权限、来源、documentId、Stop、持久结果保持原边界。

## 2. `src/libs` 实际消费矩阵：构建、加载、作用域分开看

| 执行场景 | 开发者怎样用 | 可直接使用的能力 | 明确不能推断 |
| --- | --- | --- | --- |
| **Controller 用户脚本 / Worker** | Sidebar 草稿 `async function main()`；多文件 ESM `export default async function main()` | 词法 `page`、`params`、`axiosx`、`AppStorage` 等；默认 `_`、`dayjs`、`OpenDeskLibs`；显式声明后可用真实 Axios（受控 Broker） | 无 `document` / 网站 `window`；Page-only 库不会自动提供给 Controller，`axiosx` 本身不是上游 Axios |
| **目标网站 Page USER_SCRIPT** | `main()` 中使用 `document`，在显式 `// @opendesk-lib <id>` 下使用批准的可选库 | `document` / DOM；默认 `_`、`dayjs`、`OpenDeskLibs`；被显式选择的一个或多个已审定可选 Page 包 | 无 Controller `page` / `axiosx` / `params`；`@opendesk-lib` 不是权限授权；不污染网站 MAIN |
| **网站 MAIN** | 普通网站代码及经审核的独立 MAIN SDK 合同 | 网站自身 `window` 与业务 JS | 不因安装 OpenDesk 就有 `_` / `dayjs` / `page` 等预置变量 |
| **后台 Background / MV3 SW** | **扩展开发者**按需在受信源代码中显式 `import`、并经 WXT 生成产物 | 仅实际被后台 bundle 引入且受审核的依赖、Chrome 扩展内部 API | 没有用户 `main()` / `page` / DOM；不把所有 `packages/*` 汇总到 SW |
| **Side Panel 宿主 / 扩展自定义 HTML 页** | **扩展开发者**在独立可信入口中静态 `import` 自己使用的库、经构建审查 | 该入口实际引入的 JS 和受信宿主能力 | 用户 Controller 的 `page` 与默认 `_` 不会凭空出现；不是网站 USER_SCRIPT |
| **Side Panel 已安装工具 iframe** | 依工具合同 `globalThis.OpenDeskTool.root`、`OpenDeskTool.request`；静态工具自己的固定包 | 工具自己的隔离 DOM 和有限桥调用 | opaque 沙箱不是宿主，不能访问 `chrome.tabs`、Controller `page` 或把宿主的库自动继承为全局 |
| **Content Script ISOLATED** | 扩展开发者通过明确的 Content/SDK 静态入口与批准桥实现 | 该入口导入的受审依赖/SDK | 不能把 USER_SCRIPT 全局、MAIN 全局或 Controller 能力混为一谈 |

**预装（扩展随包自带）≠ 默认加载（当前程序需要）≠ 按需加载（明确使用才读取）**。Page `// @opendesk-lib react` 复用单个 React+ReactDOM 固定物理资源，Vue 复用已有独立 Page 固定物理资源。任何其他按需库也须从扩展本地资源获取并核对 ABI、版本、SHA、许可，而不是运行时 CDN。当前 Page 单程序最多六行可选库声明、重复去重；不保证任意第三方模块的自动依赖闭包。

`src/libs` 是 **框架的源码与公共能力目录**，不是用户需要逐文件 `import` 的 npm 路径。确实需要第三方依赖的后台、Side Panel 页面与扩展自定义页，应让受信构建器把**用到的**模块归属到自己的入口；保持各包资源和 SW 运行组独立，不因 ZIP 内包含多个物理资源就判定 SW 重复加载。区别参见 [src/libs/README](../../src/libs/README.md) 和 [真实大小报告](../../scripts/audit-fixed-entries.mjs)。

### Side Panel 工具 iframe 的不同写法

这是另一个隔离程序类型，**并不使用** Controller 的 `main()` 或用户 Page 脚本的 `page`：

```js
const {root, request} = globalThis.OpenDeskTool;
const label = root.querySelector('[data-output]');
if (label) label.textContent = '工具已初始化';
// 只有当前工具被授权的具体 method 才能经 request 发往可信宿主。
```

可信 Background / Side Panel 宿主 / 扩展自定义页面的源码可以在其各自 WXT 固定入口中静态导入实际需要的包，例如 `import dayjs from 'dayjs'`，**不是**把 `OpenDeskLibs` 全局注入所有扩展页面；这属于框架开发者构建行为，而不是普通用户脚本需要写的 import。


### 实际可运行示例：四种扩展世界不要混用

- [Background 的 ESM 模块示例](../../examples/libs/trusted-imports/background.mjs)：从固定 npm 锁静态 `import dayjs from 'dayjs'`、`import {words} from 'lodash-es'`；只把所需模块编入该受信 WXT entry，**不能**假设有 Controller `page`。
- [可信 Side Panel 宿主模块](../../examples/libs/trusted-imports/sidebar-host.mjs)：显式导入 `query-string`、`dayjs`，是扩展维护者的受信代码，绝不导入到用户工具的 opaque iframe。
- [可信扩展自定义 HTML 页模块](../../examples/libs/trusted-imports/extension-page.mjs)：按需 import `lodash-es`，安全用 `textContent` 更新自己的 DOM；非用户 Page 脚本。
- [可打包的 Side Panel 用户工具](../../examples/sidebar-tools/runtime-globals-demo/README.md)：`tool.config.json` + HTML/CSS/经典 JS，真实通过 `globalThis.OpenDeskTool.root/request` 使用已授权桥；有明确导入与手工验收流程。
- [单文件 Page 的零参数示例](../../examples/programs/single-file/page-globals-zero-arg.js)：`async function main()` + `document` + 默认 `_`、`dayjs`；单文件编辑器不要粘贴 ESM 的 `export default`。

三个可信入口示例是**可在 Node 执行的受审静态 import 模块**，供维护者把实际需要的函数放进已有 `src/**` WXT 入口，不是已在产品注册的三个新入口，更不能直接把 examples 目录当成生产 SW 依赖；否则会被构建来源审查拒绝。它们的独立 `npm ci` + Node 方法测试不构成真实扩展页面安装回执。

已安装小工具是第四种独立世界：没有 `page` / `_` / `dayjs` 自动注入，不需要 `main({page})`，也不能把可信宿主中的原始 import 放进经典工具 JS。真要使用第三方库，应在该工具本地先打包为审核过的自包含经典 JS；用户依然不用重新编译整个 Chrome 扩展。

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/runtime-globals-zero-arg.test.mjs tests/environment/runtime-libs-trusted-worlds.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/runtime-globals-demo
```

构建后的工具 JSON 还须用户在「工具」中审阅、确认安装与主动打开；真实 Chrome 验收用原始版本/权限/文档/构建哈希判断，L2 与实测不能混作一个 PASS。

## 多库声明（R16.6）

用户在 Page USER_SCRIPT 源码的前导注释或正式元数据头中，可以最多写六行 `// @opendesk-lib <id>`。例如 React、Axios、query-string 可组合使用，重复的相同 ID 不会重复读入；React 和 Vue 同时声明、未知 ID、与 `@require` 混用均拒绝。声明顺序决定独立固定资源的执行顺序，默认 `_` / `dayjs` 不受影响，`main()` 仍是零参数。

按需载入不修改网站 MAIN、SW 或任何 Chrome 权限。组合后的 Chrome USER_SCRIPT 编译文本上限 512 KiB，新回执逐库保存 ID/SHA 供安装和升级核对。完整双库源码见 [Page Axios + query-string](../../examples/programs/single-file/page-axios-query-string.README.md)，可见三库组件示例见 [React + Axios + query-string](../../examples/programs/page-ui-react-axios-query/README.md)（项目 JSON 可用 `opendesk.libraries` 声明真实固定依赖）；可见 React UI 需要既有受管 ShadowRoot 生命周期，不能仅靠声明就声称 React UI 已安装并可卸载。

## 3. 可选 Page 库如何直接使用

**示例一：真实 Axios（普通网页网络，遵从 CORS/CSP）**：

```js
// @opendesk-lib axios
async function main() {
  const response = await axios.get(location.origin + '/api/status');
  return {status:response.status,data:response.data};
}
```

**示例二：真实 query-string**：

```js
// @opendesk-lib query-string
async function main() {
  return queryString.parse('tag=one&tag=two');
}
```

**示例三：Page React/Vue**：必须在受管 Page UI 中真正挂载并于 Stop 时清理，而非创建游离 DOM 后声称已显示。优先直接使用 [React Direct](../../examples/programs/page-ui-react-direct/README.md)、[Vue Direct](../../examples/programs/page-ui-vue-direct/README.md) 和 [React TOC](../../examples/programs/page-ui-toc-react-direct/README.md) 的可见 UI 项目；仍使用各自的 `// @opendesk-lib react` 或 `vue` 选项，可在同一个 Page 脚本里声明多个可选 ID，但 React 和 Vue 不可同用。

这几段仅说明 **当前世界与 API 写法**，不是对网络端点、任意 DOM 挂载、Controller Axios 或 Chrome 成功回执的承诺。精确可选清单及状态查当前 [运行 Catalog](../../src/libs/runtime-contract.js)、[公共库 README](../../src/libs/README.md)；并按所选版本检查该 ID 是否已接线、是否通过正式构建及真实 Chrome。用户不用自行安装 npm 或填写版本，但框架开发者必须固定上游来源/锁文件并审计权限、许可证、大小、ABI。

## 4. 自动化 / AI 输出必须通过的合同测试

- 新生成 **Controller ESM** 推荐 `export default async function main()`；Sidebar 手工脚本推荐 `async function main()`。任何示例使用 `main({page})` 应标注“历史兼容用法”，不能当成必要条件。
- 不把 `page` 当 `window.page`，不从 `src/libs/packages/*` 给用户脚本手动 `import`，不要求 `new Page()`、注入 `axiosx` 或权限凭据参数；又不可错误承诺 `page` 在 Page USER_SCRIPT/Background/iframe 中直接存在。
- 使用真实 `scripts/build-program-project.mjs` 编译零参数 ESM，调用真实 `controllerProgramBody` / Page compiler 做 Node 组件回归；Node/vm 证据标记 L2。真实 Chrome 独立核对源码 SHA、USER_SCRIPT 允许开关、Controller runId/resultId、Page previewId、MAIN 隔离、导航与停止。无原生回执即 `NATIVE_UNVERIFIED`。
- 完整公共库交付仍须 `npm ci`、`libs:check`、`libs:doctor -- --strict`、WXT production/development `build`、`verify`、`pack`、manifest/许可证 SHA 和同候选 Chrome。Socket.IO、Tailwind 等尚未完成的功能不能因有目录或文档而计入通过；Controller Axios 已有源码与 L2/部分 CI，但仍须按新候选实测后才能正式接受。
- 当前项目生产 SW 上限以**运行中的 `scripts/build-contract.mjs`**为准（现行主分支为 1 MiB 工程硬上限，另有非阻断 review 水线），不使用历史 R15 文档中 327680 B 数字覆盖后来经审查的策略，更不能为了绕过失败偷偷扩大任一限制。

## 5. 已存在的真实使用示例

- [Controller 零参数多文件](../../examples/programs/controller-globals-zero-arg/README.md)：运行 `page.title()` + `_.words()` + `dayjs()`。
- [Page USER_SCRIPT 零参数多文件](../../examples/programs/page-globals-zero-arg/README.md)：运行 `document.title` + `_.words()` + `dayjs()`。
- [Controller 单文件默认公共库](../../examples/programs/single-file/controller-globals-zero-arg.js)、[历史 Controller 单文件](../../examples/programs/single-file/title.js)、[Page 单文件零参数](../../examples/programs/single-file/page-globals-zero-arg.js)、[可信扩展静态 ESM 模块](../../examples/libs/trusted-imports/README.zh-CN.md)、[可打包 Side Panel 工具](../../examples/sidebar-tools/runtime-globals-demo/README.md)、[React Direct](../../examples/programs/page-ui-react-direct/README.md)、[Vue Direct](../../examples/programs/page-ui-vue-direct/README.md)、[Side Panel 工具开发](sidebar-tool-development.zh-CN.md)。

相关来源合同：[Controller](controller.zh-CN.md)、[Page](page-userscript.zh-CN.md)、[项目格式](local-projects.zh-CN.md)、[公共库实现](../architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md)。**使用体验必须以同一候选实际运行代码来证明，文档和组件测试不等于整体 95 分产品验收。**

## R16.7 Controller 真实 Axios opt-in

Controller 支持 `// @opendesk-lib axios`（单文件）或多文件项目的 `opendesk.libraries: ["axios"]`，由可信运行器按声明加载已审核的同一固定 Axios 1.20.0 WXT 资源，并只在受控 Worker 初始化真实 Axios。新推荐仍为零参数 `main()`。所有 HTTP 请求从 Axios transport 经过原本的 `axiosx`→Host Broker→网站授权路径；不会通过 Worker/目标网站全局 fetch 绕过 Broker。已有默认 Controller 的启动资源不会主动获取 Axios。

已实现的范围：`get/post/put/delete/request/create/getUri`、请求/响应拦截器、常见文本/JSON 响应、`validateStatus`、最终 URL 及安全 Header，HTTP 错误在受授权回执基础上生成 AxiosError。拒绝替换 `adapter`、高权限敏感 Header、请求携带 Cookie/凭据、上传/下载流、二进制及逐请求取消令牌。停止任务会通过原 Controller 生命周期中断授权操作。

[完整 Controller Axios 项目](../../examples/programs/controller-axios-zero-arg/README.md)；该环境没有 Page `document` 或网页 `window.axios`。发布/真实 Chrome 验收必须核对实际 Broker 及同候选 SHA。
