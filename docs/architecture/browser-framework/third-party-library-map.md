# OpenDesk Browser R9：旧新模块与第三方依赖迁移清单

更新：2026-10-09。本文以当前源码、WXT 产物和对应构建记录为准；历史快照不是运行资源。R9 的已观察候选、CI、包 SHA 和原生失败保存在 [工作记录](../../framework/workstreams/r9-dependency-closure-20261009.md)。源码、构建、浏览器组件和正式产品验收分别记录，不能互相替代。

## 1. 开发者先理解这四件事

旧版把多个 JS 按顺序放入同一个全局环境，后面的文件使用前面创建的对象，所以需要 BACKGROUND_SCRIPTS。新版在源码中用静态 import 表达关系，构建器把真正需要的模块合成固定产物；不需要保留同样的 min.js 文件列表。

npm 包安装在其所属项目的 node_modules，主要作为本地构建输入。扩展自身的依赖进入 WXT 对应产物；用户项目依赖进入自己的 program.js。浏览器不会自动执行 npm install，也不会把用户项目的依赖变成高权限 Background 代码。

必须按字节独立注入的资源才保留在 vendor，例如 jQuery 3.7.1。它在扩展内被读取为文本、校验哈希，再交给获准的 USER_SCRIPT；不是在 Background 中执行。

确认库可用要同时看：实际消费者、构建模块记录、最终字节哈希和对应运行结果。只看 package.json、历史文件或一个 API 名称，都不够。

## 2. 新版 Background 的真实构建链

```text
src/entrypoints/background.js  [WXT defineBackground]
  → src/sw.js
      → src/environment.js / src/platform/protocol.js
      → src/platform/host/broker.js
          → authority / storage / controller-methods / sdk-broker
          → framework/sdk / platform/chrome / user-scripts
  → WXT / Vite / Rollup
  → dist/{production,development}/sw.js [单个 classic IIFE]

唯一固定启动特例：
sw.js → importScripts('native-agent/transport.js')
      → 同扩展包的固定 Native Transport IIFE
```

保持 **14 个固定入口、无拆包、无远程代码、classic SW**。生产 SW 上限仍为 327680 字节，开发上限 524288 字节。Native Transport 与原 Broker 共用受验证的 hostPorts；不是另一个权限管理器，也不是通用第三方加载器。R9 为可选 Transport 加载失败加可见诊断，核心 Sidebar 不因此停止。

本轮归档验证：生产 sw.js **327661 字节，只剩 19 字节预算**；新增构建记录没有改变实际 dist/ZIP 字节。后续扩展能力应先去耦、审查真实消费者和削减冗余，不直接提高上限。构建成功并不单独证明 SW 重启后的所有业务恢复。

### 每次构建都能看到依赖去向

`scripts/bundle-provenance.mjs` 通过 WXT 的真实 Rollup chunk.modules 收集每个固定入口的模块，在既有 build-production.json / build-development.json 的 **bundleModules** 中保存：输出路径、最终 bytes/SHA-256、源码路径、npm 名称/版本/resolved/integrity/许可证字段。记录不进入 dist，不新增运行资源或第二个构建器。构建要求 14 份记录完整且与已校验产物绑定。

已核对的 sw.js 有 **47 个 Rollup 模块记录**：43 个项目源码、2 个 npm helper、2 个虚拟入口。实际 npm helper 包括 `@wxt-dev/browser@0.3.4` 和 `wxt@0.21.4` 的 define-background；不能因为它们列在 devDependencies 就认为产物里没有相应代码。`renderedLength` 是压缩前字符数，不是各模块最终字节贡献，也不是运行证据。

历史快照、examples 用户项目和 src/vendor 不能作为固定特权入口的 import 模块混入。jQuery 作为独立资源另行按精确哈希校验；用户 npm 的去向由独立 Program 工件记录。

## 3. 旧 Background 的 17 项加载清单

来源：`docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js` 的 BACKGROUND_SCRIPTS，经 getURL 映射后 `importScripts(...scriptUrls)`。下表的“列入加载”是源码证据，不代表旧版每个库在真实 Worker 中都工作正常；没有确认的新核心消费者不盲迁。

| 旧路径（快照根目录下） | 旧加载/职责与消费者线索 | 新实现或处理方式 | 等价性/剩余问题 |
|---|---|---|---|
| assets/js/libs/axios.min.js | Background；HTTP、bridge | framework/sdk/http.js → host/sdk-broker 或 controller-methods → platform/chrome/network.js | axiosx 为受控子集，不等于完整 Axios |
| assets/js/libs/moment.min.js | Background；旧时间业务 | 核心用 Date/Intl；不提供 moment 全局 | 旧业务未逐例迁移，不默认装库 |
| assets/js/libs/lodash.min.js | Background；旧工具/业务 | 核心按需原生实现；用户项目 npm import | 不提供全局 _；真实 npm 示例已构建执行 |
| assets/js/libs/query-string.min.js | Background；旧查询参数处理 | URL / URLSearchParams | 不承诺全部 query-string 语义 |
| assets/js/libs/fingerprintjs@3.js | Background 列表；旧设备工具引用 | framework/utils/device.js、受控设备 ID | 设备 ID 不等于浏览器指纹 |
| assets/js/libs/cheerio.1.0.0.min.js | Background 列表；旧 HTML/采集环境 | Page DOM / Locator；不恢复旧采集业务 | 非 Cheerio API 兼容层 |
| assets/js/core/common.js | Background 全局工具 | framework/sdk/*、platform/protocol.js 等按职责组织 | 按已实现方法迁移，不全局照搬 |
| assets/js/core/bridge.js | Background 桥；页面与后台通信 | framework/sdk/{bridge,transport}.js、agents/page-relay.js、host/sdk-broker.js | 已有真实源码链；世界授权逐项验收 |
| assets/js/core/tb-bridge.js | Background；旧站点桥 | 无当前通用核心消费者证据 | 不搬站点业务到 SW |
| assets/js/core/utils.js | Background；旧公共/业务工具 | framework/sdk/utils.js、framework/utils/* | 部分承接，不宣称同名全兼容 |
| assets/js/core/webRequestBg.js | Background；旧网络监听业务 | 现有网络服务及权限门 | 不暗中恢复旧 webRequest 业务 |
| assets/js/core/serverUtils.js | Background；旧服务端接口 | framework/sdk/servers.js 与受控服务 | 旧专用业务接口未恢复 |
| assets/js/plugins/TraceTimeUtil.js | Background；时间跟踪器 | 无同名现行核心消费者 | 旧业务排除，不是缺 npm 包 |
| assets/js/plugins/ChromePage.js | Background；自动化工具 | framework/ChromePage.js、context.js、control/*、RunHost | 核心源码已迁；完整行为依原合同验收 |
| assets/js/plugins/scrapyJs.js | Background；旧采集器 | features/scraping 仅保留必要迁移边界 | 不扩展采集产品 |
| assets/app_script/crawl_zhuanlan_pay.js | Background；特定站点业务 | 不属于当前产品主线 | 不迁回 |
| background.js | 旧打包主入口，本身已含模块代码 | entrypoints/background.js → sw.js → 单一 Broker | 按职责重构，不按旧文件数复制 |

旧快照 background.js 本身是构建产物；不能把它同时当作独立 npm 包和源码模块。对未列出明确函数调用的旧项，以上仅是 loader/职责线索，仍需真实消费者样本才能宣称逐 API 等价。

## 4. 其他库及执行世界

旧 manifest 的 Content Script 列表包含 moment、axios、jquery、custom_event、utils、GrowlNotification、detect_focus、Env、my-content-script；它们默认在 ISOLATED 世界。旧 MAIN 动态 script 注入是另一条链，不能与 Background 全局混算。

| 资源 | 当前去向 | 不能误解成 |
|---|---|---|
| jQuery | src/vendor/jquery-3.7.1.min.js，87533 bytes；MIT；build-contract/verify-package 精确校验；批准后 USER_SCRIPT 执行 | Background 自带 $；旧 3.2.1 插件全兼容；任意新 @require 自动批准 |
| js-cookie | 旧资源；现有 platform/chrome/cookies.js 是受控 Chrome cookies 服务 | js-cookie 全局 API 或 document.cookie 的完全替代 |
| CryptoJS | 快照文件存在；未确认当前核心消费者 | 已进入新版运行环境 |
| Socket.IO | 旧静态文件与旧后台 npm socket.io-client 要分别确认 | 应恢复服务器任意代码命令通道 |
| psl / store | 历史文件；核心 URL/Storage 职责各有现有实现 | PSL 公共后缀算法、store API 已全兼容 |
| Vue / Quasar / React | 旧 UI/备用页面资源；新扩展 UI 有自己的固定产物 | 每个 Page/Controller 世界都有这些框架 |
| GrowlNotification | 旧页面提示；现有 SDK/Chrome notifications 属另一呈现通道 | DOM Growl 样式与行为完全等价 |
| custom_event / axiosx | 新 MAIN SDK → ISOLATED relay → Broker/Authority → 服务 | 将 Background 全局对象暴露到网站 |

当前 axiosx 主要保留 GET/POST/PUT/DELETE、常用 data/status/headers 外观；底层是受授权的 fetch，使用 credentials:omit、redirect:manual、受限配置与请求头。Axios 拦截器、defaults、认证 Cookie 和任意旧业务上报不能据此标“完全迁移”。

Controller 在 opaque sandbox 的 Worker 中运行，使用原 PageProxy/ChromePage 和 Broker；用户 npm 可随 Controller program.js 打包，但不应含 DOM 专用库。Side Panel 自身资源和用户 `.opendesk-tool.json` 是不同信任层；用户工具不作为特权组件直接执行。Native Agent 复用既有 Node/CLI/IPC，不另建包管理系统。

## 5. 三层依赖及 Codex 操作

| 层次 | 唯一源码/锁入口 | 编译和验证 |
|---|---|---|
| 扩展自身 | 根 package.json、package-lock.json、静态 ESM | WXT → 固定 IIFE；build receipt 的 bundleModules + 包校验 |
| 固定独立资源 | src/vendor 及对应 LICENSE、版本/哈希合同 | build.mjs 复制；verify-package 按精确字节核查；受控读取与注入 |
| 用户项目 | 各项目 package.json、package-lock.json、src/*.js | 既有 Webpack Program builder → program.js / artifact.json / draft；不进入 SW |

```sh
npm ci --ignore-scripts
npm run check
npm run build
npm run build:dev
npm run verify
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
npm run build:program -- examples/programs/page-npm-lodash
node --test tests/integration/npm-project-closure.test.mjs
```

Program 的直接 npm import 要求精确 SemVer、npm lockfile v2/v3，根依赖一致，包条目版本/HTTPS resolved/SHA-512 字段完整。此处是元数据约束，不是自行实现 npm tarball 校验；实际安装完整性仍由 npm ci 验证。工件分别记录 npmPackages、npmDependencies、npmBundledModules、npmLockSha256、最终 sourceHash。Webpack 模块清单不能独自证明树摇后每个 API 都存在，关键消费者仍需执行结果。

“开发”保持普通 JS 编辑器。已有唯一合法 @require 锁继续复验复用；无锁/多锁明确拒绝，新依赖在本地 npm/ESM 或已支持的构建期 HTTPS 锁流程处理，不在浏览器运行时远程 import，也不恢复依赖表单。页面入口当前为 **“网页 JavaScript 试运行 → 在当前网页试运行”**，Controller 使用 **“运行草稿”**。

## 6. 示例、证据与剩余问题

`examples/programs/page-npm-lodash/`：两个本地模块 + lodash-es@4.17.21，真实 npm ci、Webpack 构建及生成代码 VM 执行已在 CI 通过，返回正确 HTML 转义结果。它仍是 BUILT_UNVERIFIED，不等于 Page 正式安装或浏览器验收。

`examples/tasks/jquery-page-draft.js`：已有合法 jQuery 锁的兼容示例；无锁的新配置不可直接运行。实际 vendor 字节、现有 Page 编译器和该示例已通过 Chromium 144 正常沙箱下的真实 DOM 组件诊断，MAIN $/jQuery 哨兵未变。该诊断使用 CDP 隔离世界，**不等于 chrome.userScripts 授权/Sidebar 链路通过**。精确哈希和限制见工作记录的 JSON。

P1：同一最终候选的 USER_SCRIPT 授权、npm Page 入口、Controller 权限隔离、断网、导航、撤权和 SW 重启完整回执；Mac Native 权限对话框与握手门槛仍以最新 PR 原始结果判断。P2：SW 仅余 19 字节的预算压力、未确认消费者的旧库语义及 npm 许可分发范围继续复核。没有这些证据，不宣布全维度 95 分或最终验收通过；603+19/B05/F3/ZIP 安装原分母不变。
