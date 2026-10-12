# OpenDesk Browser 公共预装第三方库

更新：2026-10-11，R15.9 交接。实际源码与**规划中的文件**必须分开：部分库已接线但尚未通过最新同候选工程/Chrome 验收，不能因文件存在就视为正式可交付。总需求见 [公共预装合同](../../docs/architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md)。

## 首先确认用户代码入口（2026-10-12 补充的不可回退需求）

用户**不需要**把内置变量通过 `main` 参数传入。Controller 多文件 ESM 直接写：

```js
export default async function main() {
  const title = await page.title();
  return {title,words:_.words(title),date:dayjs().format('YYYY-MM-DD')};
}
```

Sidebar 内联 Controller 草稿写 `async function main()`（不含 `export default`），拥有同样的 `page`、`_`、`dayjs` 使用合同。这里 `page` / `params` 是受控 Worker 的**词法能力**，不是网页 `window.page`；`_` / `dayjs` / `OpenDeskLibs` 由内置库注册器只在 Controller / Page USER_SCRIPT 世界预装。Controller 的旧 `main({page})` ESM 入口仍兼容，但不能以此要求新用户显式传参。

Page USER_SCRIPT 用 `document` + 默认 `_` / `dayjs`，没有 Controller `page`。SW、Side Panel 可信宿主和扩展自定义 HTML 页面要在**各自的 WXT 固定入口**静态导入依赖，不能把 `src/libs` 当作整个浏览器共享的 JS 全局；安装的 Side Panel 工具 iframe 使用 `OpenDeskTool.root/request`，不继承主扩展全局。现有可选 Page 库仍按 `@opendesk-lib` 单 ID 声明才加载；无 CDN、不污染网站 MAIN。

具体的世界矩阵、正确 API、零参数 Controller/Page 双 Demo 和下一阶段验收入口，见 **[零参数 main 与预装库使用合同](../../docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)**。请优先引用该规范，避免继续从历史样例误推导 `main({page,params})` 是强制签名。

## 1. 当前真实目录及库状态

```text
src/libs/
  catalog.js                  唯一作者元数据：公开 API、许可证
  runtime-contract.js         运行 ABI、文件、版本、执行环境
  core.js / loader.js          默认库安装和扩展内固定 SHA 资源读取
  identity.js                  已安装/候选程序的 ABI、bundle 身份
  runtime/bootstrap.js        原有注册握手
  packages/
    lodash.js                  已实现，受控 8 个方法
    dayjs.js                   已实现，核心 + duration/utc/timezone/customParseFormat
    js-cookie.js               已实现，Page USER_SCRIPT 显式 opt-in
    crypto-js.js               R15.8 新接线，真实 CryptoJS 子集（待构建/Chrome 验收）
    file-saver.js              R15.8 新接线，真实 FileSaver，仅 Page Blob 保存（待 Chrome 验收）
    query-string.js            R15.9 已接线，真实上游 9.5.1（仅 USER_SCRIPT，待同候选验收）
    axios.js                   R15.9 已接线，真实上游 Axios 1.20.0（Page opt-in，待验收）
    store.js                   R16.0 已接线，真实 store 2.0.12 按程序持久前缀（待验收）
    cheerio.js                 R16.1 已接线，真实 Cheerio 1.2.0 的 browser slim（待验收）
    fingerprintjs.js           R16.3 已接线，真实 FP v5.3.0，强制关闭 npm monitoring（待验收）
  adapters/
    axios-transport.js         已实现纯协议组件；还没有与 Controller 的真实 Axios/取消传播接通
  page-frameworks/
    contract.js / loader.js    并行已完成 Page 可选静态资源及哈希
    react-19.2.0.js            已有，包含 React + ReactDOM createRoot
    react-LICENSE.txt
    vue-3.5.22.js              已有 Vue runtime
    vue-LICENSE.txt
  vendor/
    jquery/3.7.1/              已实现，原样 JS+许可证，Page opt-in
    my-utils/1.0.0/            自有演示库+许可证，保留 ABI 兼容
```

现有 npm 构建输入在根 `node_modules`，不是所有上游源码都必须复制到 packages。正式生成产物在 `dist/{production,development}/libs/**`；固定资源、版本、MIT 文件和 SHA 必须经本轮构建/ZIP 对账。

### 构建预装、启动加载和按需加载是三回事

- **构建期**：WXT 为每个 `src/libs/packages/*` 执行独立的固定入口，生成扩展本地 IIFE；所有正式预装代码随安装 ZIP 分发，用户不需要 npm/CDN，不在浏览器里现场编译。这会增加 ZIP 文件量，但**不等于把所有库合并进 SW 或浏览器启动时内存**。
- **后台启动**：SW 只依赖已审核的后台入口和明确登记的本地 sidecar；Lodash/Day.js 的公共包装器、Cheerio/React/Vue 等 UI 或解析库**不应被编进 SW**。发布构建的真实 Rollup 模块图由 `scripts/bundle-provenance.mjs` 检查。
- **用户运行**：Controller/Page 在启动相应用户程序时才取默认 Lodash、Day.js、my-utils 等固定资源；Page 的 `// @opendesk-lib <id>` 必须显式声明，才读取对应扩展内代码文件并验证 manifest SHA。jQuery、React（内含 ReactDOM）、Vue 和其他可选库**不进入未声明的程序**。当前仍是**一个 Page 程序最多一个可选声明**，不是自动加载全部。
- **静态样式**：Tailwind 目标是本地构建的 CSS，只有特定工具 UI 用到时才挂载，不应生成后台 `tailwind.js` 或网页全局重置样式。

真实体积报告运行 `npm run build:size`，结果位于 `artifacts/package-size-production.json`。其中 `totalPackageBytes` 是 **dist 文件原始字节数之和，不等于压缩 ZIP 大小**（开发包还含 source map），`loadingGroups` 是彼此**重叠、不能相加**的典型资源集合；`runtimeResourcePlan` 明列 SW 启动、Page/Controller 默认资源及每项按需资源的独立字节数、真实加载器允许的上限和剩余空间。React/Vue 独立固定资源当前按其 **256 KiB** 运行时读取限制计，不得错误当成普通 JS 的 512 KiB 上限。报告不是内存峰值或性能基准；若需得到真正的运行开销，应使用实际 Chrome 内存和网络记录。

`npm run libs:list` 当前登记 Lodash、Day.js、my-utils、jQuery、js-cookie、CryptoJS、FileSaver、query-string、Axios、store.js、Cheerio、FingerprintJS，React/Vue 通过已有独立 `page-frameworks/contract.js` 而非另一个 WXT/npm wrapper 注册。不要重复新增 `packages/react.js`、`packages/react-dom.js`、`packages/vue.js`，造成双份运行时。

## 2. 目前用户代码怎么用

无需用户单独安装 npm。默认可用 `_`、`dayjs`、`OpenDeskLibs.myUtils`；jQuery、React、Vue、js-cookie、CryptoJS、FileSaver 通过受控显式选择按需加载。**其中 CryptoJS 与 FileSaver 仍待同候选正式构建/实际页面操作验收，不得在发布说明中提前标记为验证通过。**

```js
// @opendesk-lib js-cookie
async function main() {
  Cookies.set('opendesk-demo','hello',{path:'/'});
  const result=Cookies.get('opendesk-demo');
  Cookies.remove('opendesk-demo',{path:'/'});
  return result;
}
```

`Cookies` 来自真实上游 `js-cookie@3.0.8`，用于当前页面可访问的 `document.cookie`；不提供 HttpOnly、浏览器扩展 Cookie API、Controller DOM 或越过用户的页面权限。只在目标网页的独立 USER_SCRIPT world 注册 `Cookies`，不会默认写目标网站 MAIN global。

`// @opendesk-lib react` 使用 `OpenDeskPageReact`；`// @opendesk-lib vue` 使用 `OpenDeskPageVue`。

Axios 1.20.0 的 Page 使用方式是显式声明：

```js
// @opendesk-lib axios
async function main() {
  const client = axios.create({baseURL: location.origin});
  const response = await client.get('/api/status');
  return response.data;
}
```

这是网页环境的真实 Axios，受实际同源/CORS/CSP 与网页网络策略约束，不会自动升级成扩展跨站权限。 发布包保留严格的动态反射扫描器；官方 Axios 在浏览器环境没有 Node Buffer，构建只将 v1.20.0 原样包的 Node Buffer 反射降为 false，并将 AxiosHeaders 的 `this.constructor` 动态判断改为准确的 `AxiosHeaders` 实例判断。任何上游源码模式变化均立即阻断 WXT 构建，不放宽 CSP。Controller 当前依然使用受授权的 `axiosx`；`axios-transport.js` 尚未接入 RunHost 的真实 Axios，且单请求取消未实现。

store.js 使用真实上游 `store@2.0.12`，只在 Page USER_SCRIPT 显式声明：

```js
// @opendesk-lib store
async function main() {
  const count = store.get('counter', 0);
  store.set('counter', count + 1);
  return store.get('counter');
}
```

同一正式安装程序跨页面的存储作用域按 namespace + programId 保持稳定；临时预览按源码哈希隔离。没有网站 localStorage 就报 `E_STORAGE_UNAVAILABLE`，**不会降级成易失内存**。这些键仍保存在**网站 origin 的 localStorage**，网站可以读取，不能用于密码、令牌或敏感内容；扩展私有存储继续使用 AppStorage。封装的 `clearAll` 只删除当前工具前缀，不调用整个网站的 `localStorage.clear()`。用户脚本自身仍能直接访问网站存储，封装不是权限边界，也不支持 Controller 的同步私有存储。

FingerprintJS 的 npm 版上游默认允许少量使用统计监测。OpenDesk
**始终强制关闭 upstream monitoring**，并且不在声明或加载库文件时执行
指纹采集。用户需要显式 opt-in，再自主调用 `load()` 和 `agent.get()`：

```js
// @opendesk-lib fingerprintjs
async function main() {
  const agent = await FingerprintJS.load();
  const result = await agent.get();
  // 指纹属于敏感浏览器识别数据，由你的程序自行处理。
  return { available: typeof result.visitorId === 'string' };
}
```

`FingerprintJS.load({monitoring:true})`、`debug:true` 均明确拒绝，
不自动上传任何数据、不在网页 MAIN 公开，也不缓存或持久化 visitorId。
这不等于网页隐私沙箱：工具代码自己的网络请求仍受原有用户授权、
目标页 CORS/CSP 和浏览器行为约束。

Cheerio slim 只做本地 HTML 文本解析，明确 opt-in：

```js
// @opendesk-lib cheerio
async function main() {
  const $ = cheerio.load('<h1 class="title">OpenDesk</h1>');
  return $('.title').text();
}
```

`cheerio` 不是 DOMPurify；其解析结果不代表已净化，未经审核不得插入特权 DOM。默认不抓取网页、不自动联网、不加载网站 MAIN。

query-string 必须在 Page USER_SCRIPT 显式声明（不能与其他可选库在同一程序声明）：

```js
// @opendesk-lib query-string
async function main() {
  return queryString.parse('tag=one&tag=two');
}
```

返回的重复参数为数组；本阶段尚未向 Controller 暴露 queryString，不能把这段 Page 示例当作双环境验收。

CryptoJS 必须显式声明（只在当前 Page 的 USER_SCRIPT world 中安装）：

```js
// @opendesk-lib crypto-js
async function main() {
  return CryptoJS.SHA256('abc').toString(CryptoJS.enc.Hex);
}
```

FileSaver 仅在 Page USER_SCRIPT 显式声明时执行，不需要 Chrome downloads 权限：

```js
// @opendesk-lib file-saver
async function main() {
  FileSaver.saveAs(new Blob(['hello'], {type:'text/plain'}), 'hello.txt');
}
```

受浏览器用户激活状态限制，调用返回不能视为文件已保存；拒绝 URL 和路径型文件名。不能把 Page 原生保存误称为扩展 downloads API。

这是真实上游包的受控兼容子集，不是将 WebCrypto 冒充 CryptoJS。上游已停止维护；新加密设计优先 WebCrypto，不默认加载或提供网站 MAIN 特权。现有 parser **每个程序最多允许一个可选 ID**；尚未实现多个可选库同时声明和自动依赖闭包，不能声称全部组合已经可用。

```js
async function main() {
  return {
    minutes: dayjs.duration(90,'seconds').asMinutes(),
    tokyo: dayjs.utc('2026-10-11T00:00:00Z').tz('Asia/Tokyo').format('HH:mm')
  };
}
```

上述 Day.js 公开功能已实现并有源码、WXT 产物测试；同版本 Mac Chrome 回执仍需独立验收。`dayjs` 不是 `moment` 的假别名；不预装 Moment。

## 3. 缺失库的真实目标，不得标已完成

| 目标上游库 | 源码拟落点 | 当前缺口 |
| --- | --- | --- |
| **Axios** | packages/axios.js | R15.9 已接入真实上游 Axios 1.20.0 到 Page USER_SCRIPT；Controller 的受控 Broker transport、单请求取消及完整兼容性仍缺，不得标全量完成 |
| CryptoJS | packages/crypto-js.js | R15.8 已接入真实 crypto-js@4.2.0，Page 显式声明、限制 SHA256/HmacSHA256/AES/enc；工程及 Chrome 同候选证据待确认；上游停止维护，默认不注入 |
| query-string | packages/query-string.js | R15.9 接入真实 query-string@9.5.1、三项真实传递依赖和许可，Page USER_SCRIPT 显式 opt-in，支持 parse/stringify/parseUrl/stringifyUrl/extract/pick/exclude；Controller 仍未开放，工程/Chrome 待同候选验收 |
| store.js | packages/store.js | R16.0 已接入真实 store@2.0.12 的 Page 同步适配，仅网站 localStorage、由编译器给程序分配前缀，clearAll 不影响其他程序/网站；Controller 尚缺、同候选验收待检查 |
| FileSaver | packages/file-saver.js | R15.8 已接入真实 file-saver@2.0.5，仅允许 Blob/File 与显式 Page 声明；下载用户手势及落盘回执仍待 Chrome 验收 |
| Cheerio | packages/cheerio.js | R16.1 真实 Cheerio 1.2.0 browser slim 入口，仅 Page USER_SCRIPT `cheerio.load(html)`，无网络抓取/HTML 清洗功能；同候选工程与 Chrome 验收待核查 |
| FingerprintJS | packages/fingerprintjs.js | R16.3 已接入 MIT 的真实 @fingerprintjs/fingerprintjs@5.3.0，仅显式 Page opt-in；导入时不执行 load/get、任何 load 都强制 monitoring:false，debug:true 拒绝；正式 CI 与实际 Chrome 待验收，不宣称自动授权上报 |
| Socket.IO Client | packages/socket-io.js | **不存在**；须用户明确连接、授权/断开/停止/重连生命周期 |
| Tailwind 用户 UI 样式 | styles/ | **不存在**；当前根工程有 Tailwind 构建工具不代表已向用户提供类名预编译 CSS |

用户程序就是消费者，不得因框架内部没有 import 而删库；但也不能绕过许可证、CSP、Browser 世界或供应链门槛将旧版 min.js 直接复制成为默认包。TimeReview、Monaco、ECharts、Docsify 和旧远控/旧指纹上报业务本轮不迁移。PSL、CSS Selector Generator、PrismJS、Marked、QRCode 是后续候选。

`packages` = 真实上游 npm ES/CJS 适配和公开接口；
`adapters` = 仅必要的执行环境协议转换，不新建一套 Broker；
`vendor` = 只有必须原字节发布的文件及可核对许可证；
`page-frameworks` = 当前已有单独固定 Page React/Vue 可选资源（不可再复制）。

## 4. 发布链条与验收

```text
根 package.json + package-lock.json（真实上游固定版本/integrity）
 -> node_modules（构建输入）
 -> src/libs/packages/<库>.js + WXT 审批入口
 -> dist/<mode>/libs/packages/<库>.js
 -> libs/manifest.json + 精确 SHA / ABI / 许可证
 -> 受授权的 Controller / USER_SCRIPT / 独立工具执行世界
 -> 普通用户程序实际调用 + 失败关闭测试
```

```sh
npm run libs:list
npm run libs:check
npm run check
npm run build
npm run build:dev
npm run libs:doctor -- --strict
npm run verify
npm test
npm run pack
npm run pack:dev
```

当前固定入口集合由 `scripts/build-contract.mjs` 的 `PACKAGE_ENTRIES`、`FIXED_OUTPUTS` 唯一定义；历史 19/20 个入口的数字已过时，脚本和测试须随真实入口变更同步核对。现行 `BUILD_POLICY`：**生产 SW 1 MiB 硬限、512 KiB 复核线；其他独立固定 JS 512 KiB 硬限、320 KiB 复核线；开发 SW 1.5 MiB**。此数值是仓库工程约束而不是 Chrome 平台强制上限；历史 327680 B 合同已被后续构建策略替代。单独按需库超限时应先精简依赖、确认模块溯源和拆分是否可行，确需提高某一类资源上限必须**同步调整加载器、manifest 校验、固定包验证、测试和文档**，不能仅修改一个 WXT 常量获得 PASS。所有体积调整均不允许扩大 Chrome 权限或放宽 CSP/供应链校验。Node CI/ZIP 结果和同包 Mac Chrome 结果分别记录；Chrome 未核验时为 `NATIVE_UNVERIFIED`。

本轮实际补充与阻断见 [R15.9 工作记录](../../docs/framework/workstreams/public-libraries-r159-status-20261011.md)。原 [R15.7 Mac Codex GOAL](../../docs/framework/prompts/goal-r157-public-libraries-mac-codex-final-20261011.zh-CN.md) 属于尚未完成库迁移的历史实施任务，**不能称为已经可执行的最终验收**。
