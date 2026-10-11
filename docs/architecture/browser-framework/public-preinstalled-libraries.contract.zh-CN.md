# 公共预装类库：用户脚本能力合同

日期：2026-10-11。性质：用户需求纠偏、目标目录与实施合同；不是新增库已实现的证明。
源码核查基线：`72bcc0451294c1f709eaf667626e10d45a8eb50e`。本次不修改运行时代码、依赖锁、权限、构建产物或其他任务的工作记录。

## 1. 不再改变的需求边界

OpenDesk Browser 是供用户编写脚本和工具的框架。框架维护者负责预装真实第三方库；普通用户不需要安装 npm、复制第三方文件或填写 CDN 地址，就能在获准的执行环境调用这些库。

**内部有 axiosx/fetch、Web Crypto、Cookie/Storage/Downloads 服务，不等于用户脚本已有 axios、moment、CryptoJS、Cookies、queryString、store、saveAs。** 不允许用内部服务存在或 API 名称相似，将这些公共库标记为已替代、已迁移或无需实现。

用户已要求纳入公共预装目标：Axios、Moment、CryptoJS、js-cookie、query-string、store.js/store.legacy 的相应兼容能力、FileSaver、Cheerio、FingerprintJS、Socket.IO Client、React、ReactDOM、Vue；保留已有 Lodash、Day.js、jQuery。Tailwind CSS 属于框架供给的公共 UI 样式能力，不是向 SW 注入的 JS 库。

用户程序就是公共 API 的消费者，不以“框架内部尚无 import”为理由删除该需求。每个库仍须有真实用户代码、功能测试、合法固定版本/许可证及对应执行世界的证据。

TimeReview 是业务模块，不是第三方库；不迁移 TimeReview、旧采集产品、旧远程命令处理器。Monaco Editor、ECharts、Docsify 等不属于本次预装范围。**不恢复指纹追踪/远控业务，不等于禁止提供用户明确选择的 FingerprintJS/Socket.IO 通用库。**

本合同替代历史讨论中“只有四个登记库即可宣布公共库完成”“React/Vue 只能由每个工具自行 npm 安装”“Cheerio/FingerprintJS/Socket.IO 因旧业务排除而一概退役”等范围结论。旧快照/回执不改写；安全与真实验收规则保留。

## 2. 当前状态和目标分开

核查时 `runtime-contract.js` 只有 lodash/dayjs/myUtils/jquery；`core.js` 只暴露三个默认对象；`loader.js` 只组合适用世界的默认库，jQuery 是独立明确选择路径。**基础机制已有，完整公共预装目标未完成。**

下面标记新增的文件均未实现，不得创建空包装文件后宣称 ACTIVE_BUILTIN。新版本、许可证、SHA、体积必须在实际锁定/构建后记录，本合同不臆造版本。

## 3. 预装不等于全部默认执行

预装表示代码随扩展本地发布；可选库也预装，用户无需下载或 npm。默认组仅在程序真正运行时加载，不是打开每个网站就全部运行。

目标常用组：Lodash、Day.js、Axios、Moment、CryptoJS、query-string；DOM Page 再提供 js-cookie。Moment 与 Day.js 保留各自真实 API。新增默认成本必须测冷/热加载和总组合体积；超预算要报告阻断并优化，不悄悄删除需求。

目标可选组：jQuery、store、FileSaver、Cheerio、FingerprintJS、Socket.IO、React+ReactDOM、Vue、Tailwind 样式。只加载代码不连接服务器、不调用指纹 load/get、不读 Cookie、不写存储、不挂载 UI。

复用现有 `@opendesk-lib`，扩展为一行一个 ID 的声明；React 自动解析 ReactDOM 依赖。多库支持是待实现内容，当前只有 jQuery 路径不能冒充通用能力。不通过不可靠的变量名扫描猜测依赖，不另造库安装器。

## 4. 最终文件落点和公开 API

`packages` 是本项目的上游库适配器；npm 原码由根 package.json/package-lock.json 锁定，位于 node_modules，不复制整个 node_modules。目标产物为 `dist/<mode>/libs/packages/<文件名>`。

| 库 | src/libs 内的文件 | 用户目标 API | 环境/边界 |
| --- | --- | --- | --- |
| Lodash | packages/lodash.js（已有） | `_`、OpenDeskLibs.lodash | Controller/USER_SCRIPT；当前八方法，危险导出不自动开放 |
| Day.js | packages/dayjs.js（已有） | dayjs | Controller/USER_SCRIPT；不是 Moment 兼容层 |
| Axios | packages/axios.js（新增） | axios.get/post/create/defaults/interceptors | 上游 Axios + 合适 transport；不是 axiosx 改名 |
| Moment | packages/moment.js（新增） | moment().format/endOf、moment.duration | Controller/USER_SCRIPT；locale/时区另行声明 |
| CryptoJS | packages/crypto-js.js（新增） | CryptoJS.SHA256、经审核的算法/编码 | Controller/USER_SCRIPT；不是 WebCrypto 更名 |
| js-cookie | packages/js-cookie.js（新增） | Cookies.get/set/remove | DOM Page 当前站点；不等于扩展 Cookie 权限 |
| query-string | packages/query-string.js（新增） | queryString.parse/stringify | Controller/USER_SCRIPT；重复键/数组/空值另测 |
| store.js | packages/store.js（新增） | store.get/set/remove、OpenDeskLibs.store | DOM/明确后端；不与异步 storage/AppStorage 混名 |
| FileSaver | packages/file-saver.js（新增） | saveAs、OpenDeskLibs.fileSaver.saveAs | 允许下载的 DOM Page；工具 sandbox 需显式适配 |
| Cheerio | packages/cheerio.js（新增） | cheerio.load(html) 及结果查询 API | 浏览器解析构建；不承诺 Node stream/fromURL |
| FingerprintJS | packages/fingerprintjs.js（新增） | FingerprintJS.load()、agent.get() | DOM Page 明确选择/告知；不自动采集或上报 |
| Socket.IO Client | packages/socket-io.js（新增） | io()、socket.on/emit/disconnect | 允许 transport 的 Page/工具；Worker 接线前不承诺 |
| React | packages/react.js（新增） | React.createElement/useState 等 | DOM Page/工具 sandbox；同一实例 |
| ReactDOM | packages/react-dom.js（新增） | ReactDOM.createRoot、root.render/unmount | 与 React 匹配，不能再捆绑第二份 React |
| Vue | packages/vue.js（新增） | Vue.createApp/h/ref、app.unmount | DOM Page/工具 sandbox；runtime-only |
| jQuery | vendor/jquery/3.7.1/（已有） | $、jQuery | USER_SCRIPT 明确选择；不污染网站 MAIN |
| my-utils | vendor/my-utils/1.0.0/（已有） | OpenDeskLibs.myUtils.upper | 演示及既存 ABI 兼容，不代表目标完成 |
| Tailwind | styles/tailwind.input.css、styles/tailwind-classes.json（新增） | 已预编译集合内的 class | 输出 libs/styles/tailwind.css，作用于受管 UI |

旧 store.legacy 整包的过时浏览器回退不自动照搬。使用真实上游 engine + 经审查后端，保留可证明的同步 API；不能偷偷换成 Promise，不能以内存回退冒充持久化，不能让 clearAll 删除框架/其他工具数据。站点存储与工具私有存储明确命名和授权；不支持的环境报错而不是假成功。

PSL、CSS Selector Generator、PrismJS、Marked、QRCode 保留为下一批公共可选候选，不再因暂无内部消费者而永久剔除；Quasar/Hammer.js/JSZip/XLSX/XMind 不为凑数量加入首批。Babel 仅在确需源码转换时作为开发编译工具。

```text
src/libs/
  README.md / AGENTS.md             需求与使用入口
  runtime-contract.js / catalog.js  保留唯一合同；扩展库组/依赖/世界
  core.js / loader.js / identity.js 保留机制，扩展 API/选择集合身份
  runtime/bootstrap.js             复用注册，支持依赖顺序/实例工厂
  packages/                        上表列出的真实库适配器
  vendor/                          原字节经典 JS + 许可证 + 哈希
  adapters/                        薄适配，不另建 Broker
    axios-transport.js             新增：上游 Axios 接受权 HTTP
    store-backend.js               新增：明确后端和命名空间
    file-save.js                   新增：saveAs/受控下载的边界
    socket-lifecycle.js            新增：连接登记、停止/退权清理
  styles/
    tailwind.input.css             新增，复用现有设计 Tokens
    tailwind-classes.json           新增，零构建脚本的 class 合同
```

adapters 仅在已有模块不能直接复用时新增。目标输出为 `dist/{production,development}/libs/{packages,runtime,vendor,styles}/`、`libs/manifest.json` 和 `licenses/`；这是目标位置，不是现有产物存在性声明。

## 5. 不是只添加文件：现有执行链必须接通

1. 扩展现有 catalog/bootstrap/core/loader，以“常用组 + 明确选择 + 依赖闭包”生成确定顺序。identity 绑定确切库集合/版本/hash，不能仍只绑定旧四库。未知 ID、环依赖、世界不符、缺资源、SHA/版本错误失败关闭，无 CDN 回退。
2. `OpenDeskLibs` 与别名绑定只读，但不要将上游对象全部深冻结，破坏 Axios defaults/interceptors、Moment locale 或 UI 框架状态。每程序隔离可变配置/实例，并测试泄漏、重复运行和旧 realm 恢复。
3. 复用 `src/scripting/user-scripts/{dependency-metadata,execution-source,preview,dependency-manager}.js` 和已安装程序链路，先载库后运行正文；不写网站 MAIN 同名全局。
4. Controller 复用 `src/scripting/sandbox/worker-runtime.js`、page-proxy 和 RunHost，只给该 Worker 能运行的 API，不给 DOM/UI/Cookie/FileSaver/Fingerprint 假环境。
5. 工具复用 `src/sidebar-tools/bridge.js`、`src/ui/sidebar-tools.js`、`src/ui/sidebar-tools/package.js` 及构建器。宿主校验库字节，在隔离 iframe 先装库再执行工具，不在可信 Side Panel DOM 执行用户代码。schema/版本必须正式演进，现有严格包结构不支持的新字段不能直接塞进去。
6. 根 package/lock、`src/entrypoints/`、wxt.config、build-contract、prepare-public、verify-package、现有 libs 命令同步登记固定资源。React/ReactDOM 必须共享匹配实例，不能分别捆绑不同 React。所有库不默认打进 SW；受信 Background/Content 仅按真实内部需要静态 import。

### Axios 与权限

真实上游 Axios 负责 create/defaults/interceptors、转换、错误；Controller 使用自定义 adapter 接现有 Broker。Page 普通网络与扩展特权跨站 transport 分开说明；后者必须绑定程序自身授权，不能继承 MAIN SDK 权限。signal/timeout、重定向、凭据、响应类型、状态码逐项测试。禁止把 adapter 任意改写变成特权逃逸，不支持的 Node adapter/任意 transport 失败关闭。Page Broker 没接通就是未完成，不得由安装 Axios 代替。

### Cheerio / FingerprintJS / Socket.IO

Cheerio 提供真正浏览器解析 API，load 处理文本；Node 的 loadBuffer/stream/fromURL 不承诺。解析不等于 HTML 消毒，不将未经处理结果插进特权 DOM。

FingerprintJS 用最终版本审查过的本地包，核对许可及所有网络行为。声明不触发 load/get；明确告知用途，不自动上报或恢复旧服务。需验证 DOM/iframe/CSP/禁用 API 条件；不能保证任何浏览器下都得到稳定唯一身份。

Socket.IO 预装 socket.io-client，不是服务器或旧远控模块。无默认服务器、无导入即连接；用户代码明确创建后，按实际网络约束运行。登记 socket，停止/卸载/撤权/导航后断开并终止重连；远端消息不得当代码执行。Worker transport 不支持时标明未实现，不放宽 CSP。

### React / Vue / Tailwind

普通 JS 使用 React.createElement 或 Vue.h 即可构建 UI，不强迫用户创建 npm 项目。复用 page-ui.js 及受管生命周期，关闭/重跑/导航卸载 React/Vue；库不注入网站 MAIN。

React runtime 不是 JSX 编译器；Vue runtime-only 不接受未编译的任意模板/SFC。JSX/.vue 继续用现有本地编译流程，不增加运行时 Babel/eval。

Tailwind 编译器保留在框架开发/本地构建端；框架额外发布真实 Tailwind 编译出的常用 class CSS，挂入用户 ShadowRoot/工具 iframe。复用 src/ui/design-tokens.css，处理主题变量/:host/Preflight 作用域，不在网站全局 reset。

零构建脚本只承诺已列入集合的 class；任意动态拼接/任意值需要开发端生成 CSS，不声称一份静态 CSS 覆盖全部语法。不用 Play CDN/网页实时编译器。根项目有 tailwindcss devDependency 不等于用户 UI 已有 Tailwind。

## 6. 用户代码与验收

以下是待实现后的普通代码验收输入，当前不能保证运行：

```js
async function main() {
  return {
    digest: CryptoJS.SHA256('hello').toString(),
    minutes: moment.duration(90, 'seconds').asMinutes(),
    query: queryString.parse('tag=a&tag=b')
  };
}
```

可选库仍零 npm，仅声明要使用哪个本地预装库；泛化声明待实现：

```js
// @opendesk-lib cheerio
async function main() {
  const $ = cheerio.load('<h1>OpenDesk</h1>');
  return $('h1').text();
}
```

实施顺序：常用真实 API 与加载器 → store/FileSaver/Cheerio 的环境语义 → React/Vue/Tailwind 两种 UI 世界 → FingerprintJS/Socket.IO 的明确选择、许可和生命周期。分批不改变完整预装范围。

每库完成必须有：固定上游版本/许可证、入口、固定产物/hash、公开名称、普通用户真实调用、对应世界的正向/失败测试。至少验证 Axios 拦截器/配置隔离/取消/退权，Moment duration/endOf，CryptoJS 编码，query-string 数组空值，Cookie 路径与拒绝，store 真实持久化或明确不支持，saveAs 实际回执，Cheerio Node API 边界，React/Vue 挂载交互卸载，Tailwind 已登记 class，指纹无静默运行/上报，Socket 双向消息和停止后不重连。

Node、构建、Chrome、最终包证据分开。生产 SW 327680 bytes 硬限不提高；不加任意 CDN/CSP 权限。大库作为独立预装资源管理，若触及现有工具包/入口/manifest 限制，记录真实失败并优化，不能盲升预算。

**本次是需求和文档提交。新增库实现 NOT_IMPLEMENTED；本次工程构建 NOT_TESTED；新增库 Chrome NATIVE_UNVERIFIED。** 后续不能用本合同或旧四库 PASS 宣称全部完成。

## 7. 官方技术依据（2026-10-11 核实）

- [Chrome 执行世界](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[网络权限](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)。
- [Axios adapter](https://axios-http.com/docs/req_config)、[Cheerio 浏览器边界](https://cheerio.js.org/docs/basics/loading/)。
- [React createElement](https://react.dev/reference/react/createElement)、[createRoot](https://react.dev/reference/react-dom/client/createRoot)、[Vue h](https://vuejs.org/guide/extras/render-function.html)、[Vue runtime-only](https://vuejs.org/guide/scaling-up/tooling.html)。
- [store.js](https://github.com/marcuswestin/store.js)、[FileSaver](https://github.com/eligrey/FileSaver.js)、[FingerprintJS](https://github.com/fingerprintjs/fingerprintjs)、[Socket.IO Client](https://socket.io/docs/v4/client-options/)。
- [Tailwind Play CDN 仅开发使用](https://tailwindcss.com/docs/installation/play-cdn)、[class 生成限制](https://tailwindcss.com/docs/detecting-classes-in-source-files)。
