# 公共预装类库：用户脚本能力合同 R1.1

日期：2026-10-11。源码核查基线：`53b09e45036c39a3dda8f638a992677cddae0135`。
性质：R1.1 设计合同与 R15.7 滚动实施状态；完整公共预装能力仍未完成。R15.7 已提交 Day.js 插件源码、ABI/Catalog/测试和独立 Axios 薄适配及测试（Axios 上游包与完整 Runner 接线未实现），但尚无同候选 Chrome 全验收。

## 1. 本次收敛结论与范围

用户本次明确允许以轻便的 Day.js 满足日期需求，不必与 Moment 并存。因此，**公共日期库统一为 Day.js，本轮不预装 Moment，不新增 packages/moment.js，不提供 moment=dayjs 假别名**。这取代 R1 的强制双库安排；不是声称 Day.js 全量兼容 Moment。旧快照、历史回执和用户自有项目不删除、不批量改写。

这个日期特例不授权把其他已明确的真实公共库再次改成内部相似服务。框架仍需为普通用户程序预装真实 Axios、CryptoJS、js-cookie、query-string、store.js、FileSaver、Cheerio、FingerprintJS、Socket.IO Client、React、ReactDOM、Vue；保留 Lodash、Day.js、jQuery 和既存 my-utils ABI；提供 Tailwind 公共样式。

普通用户无需安装 npm、下载 JS 或填写 CDN 地址。用户程序就是公共 API 消费者，不以“框架内部没有 import”为由移除需求。axiosx/fetch、Web Crypto、Chrome Storage 等内部服务不等于真实 axios/CryptoJS/store 已对用户开放。

本轮不迁移 TimeReview、旧采集产品、旧指纹上报、旧远程命令业务；不添加 Monaco Editor、ECharts、Docsify。保留通用库能力不等于启动原业务。PSL、CSS Selector Generator、PrismJS、Marked、QRCode 是下一批候选；Quasar、Hammer.js、JSZip、XLSX、XMind 不为凑数量加入首批；Babel 不作为浏览器运行时编译器。

## 2. 当前事实与公共加载策略

R15.7 已在 `src/libs/packages/dayjs.js` 通过锁定的 Day.js 引入固定插件，并同步 Catalog/ABI；但构建和 Chrome 结果仍需验收。现有 runtime-contract/catalog 登记 lodash、dayjs、myUtils、jquery；core/loader 不是已经完成的任意可选库系统。**目标文件、实际源码、构建产物、Chrome 运行分别记账，不创建空文件冒充完成。**

预装表示固定代码随扩展本地发布；默认加载表示运行程序前自动准备，并非每次打开网站执行全部库。可选加载仍从本地预装资源取得，不要求用户安装。

目标常用组为 Lodash、Day.js、Axios、CryptoJS、query-string；有 DOM 的网页程序再提供 js-cookie。目标可选组为 jQuery、store、FileSaver、Cheerio、FingerprintJS、Socket.IO、React UI 组、Vue、Tailwind。保留一行 `// @opendesk-lib jquery`，在既有元数据上扩展其他 ID；不建另一套安装器，不用变量名猜测依赖。

每个世界只提供实际可运行的 API。加载资源本身不能连接服务器、调用指纹 load/get、读取站点 Cookie、写存储或挂载 UI。需要环境检测的库不得通过有副作用的持久化探测掩饰为“只是加载”；初始化时机也必须测试。常用组合的冷/热加载、总字节和资源数须测量；不把性能优化变成删除预装需求。

## 3. Day.js：单库、固定插件、明确兼容边界

目标公共 API 保持 `dayjs` / `OpenDeskLibs.dayjs`。集中在已有 `packages/dayjs.js` 接入 duration、utc、timezone、customParseFormat 四个经过审核的官方插件，不创建第二日期门面或插件管理器，不引入整个插件/locale 集合。

| 需求 | 目标 API | 验证条件 |
| --- | --- | --- |
| 格式化、加减、日边界 | format、add、subtract、startOf、endOf、diff | 单位、跨月、闰年、秒/毫秒语义 |
| 时间长度 | dayjs.duration、dayjs.isDuration | 90 seconds -> 1.5 minutes；不是用固定时长代替日历月份 |
| UTC/命名时区 | dayjs.utc、dayjs.tz、实例 tz | utc 先于 timezone；显式 IANA 时区；夏令时和无效时区 |
| 严格字符串解析 | dayjs(text, format, true).isValid() | customParseFormat 已启用；2026-02-30 必须无效 |

插件由框架在用户代码之前固定初始化。沿用不公开任意 extend/全局 locale 修改的原则；tz.setDefault 等可变全局不直接开放给跨程序共享实例。需要本地化时登记具体 locale，不自动打包所有语言。Intl/时区能力不可用时明确报错，不下载远程 polyfill。

修改包装器时同步 catalog 的公开方法、core 的 API 校验、runtime/identity 的接口指纹、构建溯源和回归。不能只 extend 插件却仍冻结旧 isDayjs 门面，造成底层支持而用户看不到。不得把 Day.js 对象不变性改回 Moment 可变语义；旧 moment 脚本应明确迁移并测试，不静默更名或执行源码替换。遇到确切无法迁移的旧项目，另行评审项目级兼容依赖，不因此恢复框架默认双库。

以下示例现已纳入 R15.7 正式测试输入，但只有同候选构建/Chrome 通过后才能宣称浏览器完成验收：

```js
async function main() {
  return {
    minutes: dayjs.duration(90, 'seconds').asMinutes(),
    valid: dayjs('2026-02-30', 'YYYY-MM-DD', true).isValid(),
    tokyo: dayjs.utc('2026-10-11T00:00:00Z').tz('Asia/Tokyo').format('HH:mm')
  };
}
// 目标：{ minutes: 1.5, valid: false, tokyo: '09:00' }
```

目标插件组合优先复用现有单一 Day.js 产物；实际 gzip/原始字节、初始化耗时和 ABI 必须按同候选构建验证，本轮不宣称节省了某个未经测量的字节数。

## 4. packages、adapters、vendor 三者各做什么

| 目录 | 保存什么 | 不做什么 |
| --- | --- | --- |
| packages/ | 引用真实上游 npm 包、注册公共名称、必要实例工厂 | 不复制整个 node_modules，不手写同名假库，不处理特权授权 |
| adapters/ | 某库确实无法直接使用现有执行环境时的薄协议转换 | 不为每个库预建一个文件，不建第二 HTTP/权限/存储框架 |
| vendor/ | 必须保持原字节且经登记的经典 JS 和许可证 | 不是全部第三方源码的总目录，不接收随手下载的旧 min.js |

**`adapters/axios-transport.js` 已新增为无特权纯协议转换模块，并通过隔离 Node 5 个定向测试；真实 Axios 上游包、Controller 绑定和真正取消尚未完成。** Controller 需要把真正的 Axios 接到既有消息代理，故这个边界合理。store-backend.js、file-save.js、socket-lifecycle.js 不再作为必须创建的占位文件；优先复用现有后端和受管生命周期，只有出现真实复用不足及定向失败测试时再拆分。

### Axios 适配器的职责和依赖方向

```text
用户 axios.get / axios.create / interceptors
  -> 真实上游 Axios（用户执行环境中的独立实例）
  -> src/libs/adapters/axios-transport.js（仅需受权传输的配置）
  -> 既有程序客户端 / page-proxy / 消息通道
  -> 现有 Broker / Authority（根据可信 sender 与运行记录核权）
  -> src/platform/chrome/network.js
  -> 原网络回执，经消息通道返回 Axios response/error
```

`packages/axios.js` 提供真实 Axios，不将 axiosx 改名。适配器通过参数接收运行器注入的窄请求/取消接口；**不能直接 import 受信 network.js、Broker 或 chrome.*，不能向用户暴露任意 privileged fetch 函数、宿主凭据或把 runId 当授权**。不创建新 Worker/SW/RPC 路由系统、不默认重试、不缓存凭据。

运行器根据已批准的执行配置固定选择传输，普通用户不必编写 adapter。Page 的普通网络优先使用上游浏览器适配器，仍受实际 CORS/CSP 约束；Controller 的受控网络通过现有 Broker。Page 特权跨站模式必须先接通该程序自己的授权客户端，不借网站 MAIN SDK 或别的工具权限。禁止请求失败后自动从普通网络切换成特权通道。

用户可以修改自己环境中可变的 Axios 配置，这不能成为提升宿主权限的手段。特权边界在 Broker：最终 URL、方法、header、body、发送前/完成后授权均校验；baseURL、冻结 JS 属性、限制 adapter 名称本身都不能代替权限校验。

### 已核查的协议差异：必须先解决而不是假接线

基线 `src/platform/chrome/network.js` 只接受 GET/POST/PUT/DELETE，只读有上限的 UTF-8 text/JSON，credentials 固定 omit、redirect 固定 manual；非 2xx 抛 E_HTTP，错误携带 response。`src/framework/sdk/registry.js` 的 normalizeConfig 只允许 params/headers/timeout/responseType/withCredentials，禁止 Authorization/Cookie/Origin 等 header，timeout 必须正整数，withCredentials 仅接受 false。这不是上游 Axios 完整配置协议。

因此适配器需要以下明确合同：

- Axios 在用户环境完成 interceptors/transform；paramsSerializer、URL 拼接和规范化只执行一次，再将最终绝对 HTTP(S) URL 送 Broker，不能重复编码 query 或重复 stringify body。鉴权针对最终 URL，不信任 baseURL 前缀；url 内用户名密码继续拒绝。
- 返回 Axios response 的 data/status/statusText/headers/config。需要保留 transformResponse 语义时请求原始 text，再由 Axios 处理；不能重复解析 JSON。二进制、流、multipart、上传进度、PATCH/HEAD/OPTIONS 等只有真实通道支持后才开放，否则明确 E_CONFIG_UNSUPPORTED/E_SERVICE_UNSUPPORTED；不默默忽略配置。
- 只有经宿主 post 授权且真实回执完整的 E_HTTP.response 才能还原成 Axios HTTP response，随后按照该请求 validateStatus 决定成功/失败。须核对该字段能否跨消息序列化，缺字段就是待修缺口。权限、撤销、导航、超时、未知效果等错误永不因 validateStatus 变成成功。
- AbortSignal 和回调函数不能跨 JSON 边界传递；在用户环境保持监听，将取消关联到现有可信运行/请求，宿主必须真正中止请求并清理订阅。已有通道不支持单请求取消时，应明确未完成而不是只在客户端丢弃响应。
- Axios timeout=0 表示没有用户设定超时，不能原样传给当前正整数校验器；映射时省略该值并保留宿主最大预算，明确宿主上限仍然有效。认证、Cookie、重定向限制继续沿用既有政策，不为模拟完整 Axios 静默放宽。
- 同一个程序的 axios.create 保留该世界批准的 transport 和隔离配置；不同程序不共享 defaults/interceptors。异常转成 AxiosError/CanceledError 时保留可诊断的框架错误码，不记录 token/敏感 header，不伪造本地 XHR request 对象。

上述是接入和测试要求，未验证前不得宣传“Controller/Page 全量 Axios 兼容”。

### vendor 的保留、来源与完整性

保留已有 `vendor/jquery/3.7.1/jquery.min.js` + LICENSE.txt，继续当前 USER_SCRIPT 按需原字节路径，不再另装一份 jQuery npm runtime。my-utils 是项目自有演示而非上游第三方；为既存 ABI 暂保其原路径，不混入第三方迁移计数，不在本轮删除。

新增库默认选 npm -> packages -> WXT 路线。仅在确有原字节要求或无法合理构建的独立经典资源时选择 vendor。每个 vendor 在现有 catalog/runtime-contract 中登记唯一源路径、版本、来源 URL/原始分发文件、SPDX/实际许可证文件、字节数、代码及许可证 SHA-256、运行世界、加载策略；项目自有资源记真实自有来源，不伪造 npm/下载出处。

npm tarball integrity 与最终 JS SHA 不是一回事。npm 路线核对精确声明、lock、安装版本、许可证、模块溯源及最终产物 SHA；vendor 路线核对原字节与发布字节完全一致，含换行/BOM；来源与 SHA 同时由可信发布流程固定，不能从任意文件算出一个 hash 就把它视为安全。扫描许可证缺失、重复来源/版本、符号链接/路径逃逸、未登记文件和意外 MAIN 暴露。原样源不手工改补丁；确需修补另记转换与源/产物身份。

复用 scripts/libs.mjs、libs-doctor.mjs、prepare-public.mjs、verify-package.mjs 和现有 catalog；不新建第二 vendor manifest/锁文件/管理器。升级必须重新审计许可/安全及下游行为，并重新验收实际固定包；保留历史快照，不把旧漏洞版本设成默认。

## 5. 目标目录及公共 API

以下新增路径是计划，不是已经存在；adapters 只有 Axios 明确列入首批。

```text
src/libs/
  README.md / AGENTS.md
  catalog.js / runtime-contract.js
  core.js / loader.js / identity.js
  runtime/bootstrap.js
  packages/
    lodash.js                       已有，安全八方法边界不擅自扩大
    dayjs.js                        已实现源码扩展，待同候选实测
    axios.js                        新增
    crypto-js.js                    新增
    js-cookie.js                    新增
    query-string.js                 R15.9 已接入 Page opt-in，Controller 与同包验收尚缺
    store.js                        新增
    file-saver.js                   新增
    cheerio.js                      新增
    fingerprintjs.js                新增
    socket-io.js                    新增
  page-frameworks/                已有并行实现，优先复用，不再创建重复包
    contract.js / loader.js
    react-19.2.0.js                已有 React + createRoot 集成的 Page 固定资源
    vue-3.5.22.js                 已有 Vue Page 固定资源
  adapters/
    axios-transport.js              已有无特权薄适配，尚未与上游 Axios 接线
  styles/
    tailwind.input.css              新增，复用既有 Tokens
    tailwind-classes.json           新增，固定预编译 class 范围
  vendor/
    jquery/3.7.1/{jquery.min.js,LICENSE.txt}  已有，按原字节发布
    my-utils/1.0.0/{index.js,LICENSE.txt}     已有，保留兼容
```

| 库/组 | 用户目标名称 | 环境与接入要点 |
| --- | --- | --- |
| Lodash / Day.js | _ / dayjs / OpenDeskLibs 对应名称 | Controller/USER_SCRIPT；Day.js 不是 moment 别名 |
| Axios | axios.get/post/create/defaults/interceptors | 真实上游与按环境选择的 transport，见第4节 |
| CryptoJS | CryptoJS.SHA256 及登记的算法/编码 | 使用真实上游；弱算法不因兼容而被推荐为新安全设计 |
| js-cookie | Cookies.get/set/remove | 有 DOM 的当前站点 Cookie；无 HttpOnly/扩展 Cookie 权限特权 |
| query-string | queryString.parse/stringify | Controller/USER_SCRIPT；重复键、数组、空值逐例测 |
| store.js | store.get/set/remove / OpenDeskLibs.store | 真实上游 engine；网站存储与工具私有存储区分；不用 Promise 偷换同步 API |
| FileSaver | saveAs / OpenDeskLibs.fileSaver.saveAs | 可下载的 DOM 环境；声明初始化不等于真实文件落盘 |
| Cheerio | cheerio.load(html) 及查询 API | 真实浏览器文本解析，不承诺 Node 的 stream/fromURL 等 API |
| FingerprintJS | FingerprintJS.load、agent.get | 明确选择/告知；具体版本许可与所有网络行为核实后才可发布；不得静默采集上报 |
| Socket.IO Client | io、on/emit/disconnect | 无默认服务器；声明不自动连接；原生 transport 可用且通过策略后才连接 |
| React UI 组 | OpenDeskPageReact.createRoot 等 | Page 已有一份固定 `page-frameworks/react-19.2.0.js`（包含 React 和 DOM 创建根）；不要重复构建 |
| Vue | OpenDeskPageVue.createApp/h/ref | Page 已有 `page-frameworks/vue-3.5.22.js`；工具 iframe 复用仍需验证 |
| Tailwind | 已登记 class | 本地预编译 CSS，仅受管 ShadowRoot/工具 iframe |
| jQuery / my-utils | $/jQuery、OpenDeskLibs.myUtils.upper | 保留已存在的世界、opt-in 和 ABI 边界 |

同一库不同时复制 npm 和 vendor 两套正式来源。React/ReactDOM 已由 `libs/page-frameworks/react-19.2.0.js` 提供一个固定 Page 资源，Vue 已由 `libs/page-frameworks/vue-3.5.22.js` 提供；应复用当前独立固定合同和已批准加载器，避免再新增竞争性的 react-ui 包/第二 Catalog。新增 entrypoints、资源路径/组和产物验证必须显式登记，不能改变输出数量而不更新合同。其余 npm 库输出 `dist/<mode>/libs/packages/<id>.js`；Tailwind 输出 `libs/styles/tailwind.css`；原样 vendor 输出保持 vendor 路径，许可证位于正式 licenses 目录。

## 6. 其余已确认需求不缩减，运行边界不伪装

store 后端优先复用既有实现，不能把内存回退宣称为持久化，也不能允许 clearAll 删除框架或其他工具数据。在工具 opaque sandbox 或 Worker 中没有同步持久后端时标明不支持，另用已命名的异步 storage 服务，不将其冒充 store。FileSaver 需要受控下载适配时明确差异；没有真实保存回执不能宣称文件已写入。

Cheerio 解析不是 HTML 消毒；不能将结果未经处理插入特权 DOM。FingerprintJS 及 Socket.IO 继续是公共可选目标，但许可、隐私或 transport 审查未完成就是发布阻断，不等于已通过，也不能悄悄从需求中删除。Socket 在停止、卸载、撤权和导航时断开并取消重连；普通网页自带网络不属于扩展权限沙箱，不能凭 USER_SCRIPT 隔离承诺拦截该世界所有原生网络。

React/ReactDOM 使用同实例运行库，Vue 使用 runtime-only；无编译用户代码可用 createElement/h。JSX/SFC 仍走现有本地编译，不加浏览器 Babel/eval。网页 UI 复用 page-ui.js 和受管生命周期；侧栏工具复用现有 bridge/包结构的版本化演进，在隔离 iframe 内运行，不能在可信 Side Panel DOM 执行工具代码。两条入口都需实测，不用独立 npm 示例冒充公共预装。

Tailwind 编译发生在框架开发端，复用 src/ui/design-tokens.css，输出 class 集合覆盖的静态样式，处理 :host/主题变量/Preflight 作用域。无 Play CDN、网页实时编译器或网站全局 reset。任意动态类名/任意值不在预编译集合内时需要本地重新生成，不宣称静态 CSS 支持全部语法。

## 7. 实施顺序与不能省略的验收

先扩展现有 catalog/bootstrap/core/loader/identity 的世界、依赖闭包与选择集合身份，再接常用库和单一 Day.js 插件组合；Axios 按第4节完成真正 transport；随后 store/FileSaver/Cheerio、React UI/Vue/Tailwind、FingerprintJS/Socket.IO 分组验收。阶段安排不是删除剩余目标。

未知 ID、环依赖、版本/SHA不符、文件丢失、世界不符均失败关闭。用户公开别名绑定可只读，上游 defaults/interceptors 等可变对象要按程序隔离而非全部深冻结；同 realm 重跑、导航和旧 ABI 升级重新核验，旧候选不能沿用过时库环境授权。

每库必须具备真实固定上游版本与许可、src/libs 入口、登记的固定资源/最终 SHA、可调用 API、普通用户脚本示例、对应世界正向/负向测试。工程组件、构建、Chrome 和最终安装包证据不得互相提升。新增库许可未核实、没有浏览器调用或缺同候选字节证据时保持未验收。

本轮细化的必测项：
- Day.js：duration、utc/tz、严格无效日期、闰年、DST、不可变性、未暴露任意 extend；调用矩阵与 catalog/core 一致，不提供伪 moment。
- Axios：真实拦截器/create、序列化一次、非 2xx + validateStatus、跨 IPC 的错误回执、timeout=0/宿主上限、取消到达真实请求、退权/导航、禁止 header/凭据/协议、不同实例不泄漏。
- vendor：来源与许可证齐全、源/产物原字节和 hash、锁/版本漂移、重复资源组验证、缺失或错 SHA 失败关闭；npm 构建源和 vendor 分别记账。
- 公共 UI/可选库：React/Vue 两环境挂载与卸载、Tailwind 已登记 class、存储重启语义、真实下载、Cheerio 解析、Fingerprint 无静默采集/上报、Socket 消息与停止后无重连。

按实际变更运行 libs:list/libs:check/check、production+development build、libs:doctor --strict、verify、test、build:size、pack/pack:dev，核对最终 ZIP。遵守 testing-guide 的证据复用与资源占用规则。生产 SW 327680 bytes 硬限不提高；固定资源、工具 schema、manifest 和组合总量的现有预算不盲升。

**本次仅修订文档。新增库/日期插件/适配器 NOT_IMPLEMENTED，工程运行测试 NOT_TESTED，Chrome NATIVE_UNVERIFIED。设计审查分数不是这些门槛已通过的证明。**

## 8. 依据及修订追溯

2026-10-11 R1.1：按用户最新决定撤销强制预装 Moment；其余真实公共库要求保留。将四个预设 adapter 文件收敛为明确需要的 Axios 转换点；补充真实 network/normalizeConfig 差异、vendor 单一来源、React 单实例物理资源和验收门槛。原 R1 由 Git 历史保留，不另建竞争性方案。

本轮核实的官方资料：
- [Day.js Duration](https://day.js.org/docs/en/plugin/duration)、[Timezone 依赖 UTC 及行为差异](https://day.js.org/docs/en/plugin/timezone)、[严格日期解析](https://day.js.org/docs/en/parse/is-valid)。
- [Moment 项目维护状态](https://momentjs.com/docs/)。
- [Axios 请求配置/adapter/validateStatus](https://axios-http.com/docs/req_config)、[Axios adapters](https://axios.rest/pages/advanced/adapters)。
- [Chrome 跨站请求与权限](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)。
- [npm package-lock 与 integrity](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)。

原 R1 的 React/Vue/Cheerio/store/FileSaver/FingerprintJS/Socket.IO/Tailwind 上游资料仍可作实施入口，具体发布版本、许可证和代码行为须在实际引入时再次核实，不能把本次日期/网络资料审查当成所有库已审计。


## R15.9 源码实施回写（2026-10-11）

`query-string@9.5.1` 已有真实 npm 锁、固定资源、许可证和单选 Page USER_SCRIPT 接入（见 `src/libs/packages/query-string.js`、`src/libs/runtime-contract.js` 和 `docs/framework/workstreams/public-libraries-r159-query-string-20261011.md`）。尚未开放 Controller 环境或拿到此次候选的正式完整验收，不得将原合同中双环境目标写为已关闭；不会用 URLSearchParams 假冒上游兼容性。

## R15.9 Axios 真上游增量说明（2026-10-11）

Axios 1.20.0 已按 npm 锁和完整传递来源集成到 `packages/axios.js` 与受控 USER_SCRIPT 固定资源。用户须声明 `// @opendesk-lib axios`，网络走网页普通浏览器连接，受 CORS/CSP 约束，不提供后台 Chrome 特权跨站访问。现有 `adapters/axios-transport.js` 是 Controller 所需的薄适配器，但尚未接上 RunHost 和单请求取消传播；不能把 Page 接线称为整个 Axios 双世界合同完成。参见 `docs/framework/workstreams/public-libraries-r159-axios-page-20261011.md`，工程与 Chrome 验收均按新候选记录。

## R16.0 store.js 持久存储范围说明（2026-10-11）

`store@2.0.12` 已增量接入 `src/libs/packages/store.js`，复用现有 npm 供应链锁、WXT 静态资源与 USER_SCRIPT 公开接口。这里的 `store` 不等于浏览器扩展私有存储：同步 API 仅在 HTTP(S) 网站 Page world 使用 localStorage。真实 store.js 引擎接收由原有 Page 编译器按程序身份设置的固定前缀后端，`clearAll()` 与 `each()` 只能处理该程序的前缀，无法清空网站和其他工具的键；不可持久时应明确拒绝。不提供伪装的 Worker 内存回退或 Chrome 特权存储。源码接线后仍需同候选 CI、Mac Chrome 持久性和重载、正式产物与 ZIP 验收，不能把当前实施稿记为产品级 PASS。

## R16.1 Cheerio 增量说明（2026-10-11）

`cheerio@1.2.0` 使用 npm 固定完整依赖/SRI，并从 `cheerio/slim` 构建一个仅解析网页 HTML 字符串的 Page USER_SCRIPT 固定资源。公共接口 `cheerio.load` 需要显式 opt-in，不能把文本解析器当作 HTML 净化器或自动网页采集器。旧版 Cheerio 在业务代码中的迁移仍需逐个验证；Controller 的 Cheerio API 未实现，正式 WXT/ZIP 与真实 Chrome 分别保留证据。详见 `docs/framework/workstreams/public-libraries-r161-cheerio-20261011.md`。
