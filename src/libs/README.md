# OpenDesk Browser 公共预装第三方库

更新：2026-10-11，R15.9 交接。实际源码与**规划中的文件**必须分开：部分库已接线但尚未通过最新同候选工程/Chrome 验收，不能因文件存在就视为正式可交付。总需求见 [公共预装合同](../../docs/architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md)。

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
  adapters/
    axios-transport.js         已实现纯协议组件；还没有真实 Axios 上游入口
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

`npm run libs:list` 当前登记 Lodash、Day.js、my-utils、jQuery、js-cookie、CryptoJS、FileSaver，React/Vue 通过已有独立 `page-frameworks/contract.js` 而非另一个 WXT/npm wrapper 注册。不要重复新增 `packages/react.js`、`packages/react-dom.js`、`packages/vue.js`，造成双份运行时。

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
| **Axios** | packages/axios.js | **不存在**。现有 adapters/axios-transport.js 仅是可验证的受限 HTTP 协议组件，没有真实 Axios npm/Runner/全量取消 |
| CryptoJS | packages/crypto-js.js | R15.8 已接入真实 crypto-js@4.2.0，Page 显式声明、限制 SHA256/HmacSHA256/AES/enc；工程及 Chrome 同候选证据待确认；上游停止维护，默认不注入 |
| query-string | packages/query-string.js | **不存在**；URLSearchParams 不等价于全部 query-string 选项 |
| store.js | packages/store.js | **不存在**；同步 API/持久化、作用域和安全边界需明确 |
| FileSaver | packages/file-saver.js | R15.8 已接入真实 file-saver@2.0.5，仅允许 Blob/File 与显式 Page 声明；下载用户手势及落盘回执仍待 Chrome 验收 |
| Cheerio | packages/cheerio.js | **不存在**；需浏览器兼容真实上游 `load` |
| FingerprintJS | packages/fingerprintjs.js | **不存在**；须逐版本许可证审查、用户明确选择、不自动采集/上报 |
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

当前固定入口集合由 `scripts/build-contract.mjs` 的 `PACKAGE_ENTRIES`、`FIXED_OUTPUTS` 唯一定义；历史 19/20 个入口的数字已过时，脚本和测试须随真实入口变更同步核对。生产 SW 严格限 **327680 字节**，不能以扩库为由放宽权限、大小上限或 CSP。Node CI/ZIP 结果和同包 Mac Chrome 结果分别记录；Chrome 未核验时为 `NATIVE_UNVERIFIED`。

本轮实际补充与阻断见 [R15.9 工作记录](../../docs/framework/workstreams/public-libraries-r159-status-20261011.md)。原 [R15.7 Mac Codex GOAL](../../docs/framework/prompts/goal-r157-public-libraries-mac-codex-final-20261011.zh-CN.md) 属于尚未完成库迁移的历史实施任务，**不能称为已经可执行的最终验收**。
