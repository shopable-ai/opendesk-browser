# OpenDesk Browser R9：旧新第三方依赖与模块装载对照（当前版）

> 2026-10-09 重新核对当前源码。**这是迁移与构建核查入口，不是 Chrome 原生验收报告。** 以当前 GitHub main 源文件、R9 改动合入后的实际代码及对应构建回执为准。原 R3 文档中“jQuery 缺失”“无依赖锁”“禁止并行分支”等结论已过期，不再引用为当前状态。历史审计证据可由 Git 历史查看；source-snapshots 不属于发布包。

## 一、结论：旧版 17 项串行 importScripts，不等于新版需要 17 份 JS

旧快照 **docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js** 确认：BACKGROUND_SCRIPTS 有 17 项，经过扩展内 URL 映射后执行 importScripts(...scriptUrls)；它们在同一个 classic Worker 里依靠全局对象和加载顺序协作。快照的 **background.js** 本身就是约 665 KiB 的旧构建产物，不能同时算源码模块和一个独立 npm 包。

新版已是：

~~~text
src/entrypoints/background.js  (WXT defineBackground)
  └─ src/sw.js
       ├─ src/environment.js + src/platform/protocol.js
       ├─ src/platform/host/broker.js
       │    ├─ authority / sdk-broker / storage / chrome services
       │    └─ src/scripting/user-scripts/... + framework/sdk/...
       └─ importScripts('native-agent/transport.js') [唯一固定同扩展特例]
                  ↓ WXT 0.21.4 / Vite 7.3.6 / Rollup
dist/{production,development}/sw.js [固定 classic IIFE]
dist/{production,development}/native-agent/transport.js [单独固定 IIFE]
~~~

**ESM import 用于组织源码，不表示发布包仍有逐个 JS 文件，也不表示运行时可以从 CDN 加载模块。** 这两份固定产物既不能合并成任意远程脚本，也不能改变当前 classic SW 模式。WXT 的固定 14 入口、单 chunk、IIFE、生产 320 KiB / 开发 512 KiB SW 预算，参见 **wxt.config.mjs** 与 **scripts/build-contract.mjs**。最终单入口包闭包由 **scripts/verify-package.mjs** 校验；源码单独存在不能代替这些证据。

可选 Native Transport 的同步 importScripts 是明确的本地启动特例；R9 给失败路径加错误日志，核心 Sidebar 不因该可选资源失败而停止。**不要将其当作通用第三方依赖加载器。** Service Worker 重启需重新初始化；Authority 的受控状态不得仅依赖旧全局变量。

## 二、旧 Background 17 项实际加载路径 → 新消费者

以下“旧加载”只证明被旧快照列入 importScripts；**不证明旧脚本在真实 Chrome 中均正常使用**。“源码承接”也不表示逐 API 行为等价。

| 序 | 旧 Background 文件（相对 assets/） | 旧职责或可核对消费者 | 当前代码/处理方式 | 迁移与验收 |
| --- | --- | --- | --- | --- |
| 1 | js/libs/axios.min.js | 旧后台 HTTP / bridge | platform/chrome/network.js + framework/sdk/http.js；受控 fetch、axiosx 接口子集 | **PARTIAL**，不等于 Axios defaults、拦截器或认证行为；Chrome 待验 |
| 2 | js/libs/moment.min.js | 旧时间处理/业务 | 当前核心依赖 Date/Intl；未提供 moment 全局 | 旧业务未迁；不纳入默认 SW |
| 3 | js/libs/lodash.min.js | 旧工具函数/业务 | 核心局部 JS 实现；用户项目可 npm 安装 lodash-es | 无全局 _ 兼容承诺；不默认打包 |
| 4 | js/libs/query-string.min.js | 旧 URL 查询业务 | URL / URLSearchParams；未提供 queryString 全局 | 仅一般 URL 功能替代，非全量 API 等价 |
| 5 | js/libs/fingerprintjs@3.js | 旧设备指纹相关脚本 | framework/utils/device.js；SDK 未承诺指纹等价 | 旧业务未迁，不能声称指纹支持 |
| 6 | js/libs/cheerio.1.0.0.min.js | 旧 HTML 解析/采集环境 | 框架 Page 走 DOM/Locator，旧采集不恢复 | 排除业务专用代码 |
| 7 | js/core/common.js | 旧通用工具/全局状态 | framework/sdk、platform/protocol 分职责实现 | 部分语义承接，非原全局同名 |
| 8 | js/core/bridge.js | 旧页面与后台桥 | framework/sdk/{bridge,transport}.js + agents/page-relay.js + host/sdk-broker.js | 新授权链已有源码，真实 MAIN/ISOLATED 待验 |
| 9 | js/core/tb-bridge.js | 旧站点桥 | 无通用核心消费者证据 | 不搬旧业务到 SW |
| 10 | js/core/utils.js | 旧通用/业务工具 | framework/sdk/utils.js + framework/utils/* | 按已实现方法判断，非同名全量等价 |
| 11 | js/core/webRequestBg.js | 旧后台请求/监听业务 | platform/chrome/network.js 与权限门；不复刻旧网络拦截业务 | PARTIAL，不暗中启用 webRequest |
| 12 | js/core/serverUtils.js | 旧服务端 API 与业务操作 | framework/sdk/servers.js + 既有受控服务 | PARTIAL，旧业务服务不迁 |
| 13 | js/plugins/TraceTimeUtil.js | 旧时间跟踪器 | 无同名核心消费者 | 旧业务排除 |
| 14 | js/plugins/ChromePage.js | 旧页面自动化工具 | framework/ChromePage.js + framework/context.js + control/* + RunHost | 核心接口已迁源码；行为按独立测试/原生回执验收 |
| 15 | js/plugins/scrapyJs.js | 旧采集器 | features/scraping/* 只保留迁移必要边界 | 不恢复采集产品能力 |
| 16 | app_script/crawl_zhuanlan_pay.js | 特定站点业务 | 当前无产品核心消费者 | 排除 |
| 17 | background.js | 旧打包后台业务主入口 | entrypoints/background.js → sw.js → platform/host/broker.js | 架构重组，非一对一代码替换 |

旧 Content Script 和 MAIN **与 Background 不是同一个世界**。旧快照 **manifest.json** 的 Content Script 包括 moment、axios、jquery、custom_event、utils、GrowlNotification、detect_focus、Env 和 my-content-script 等，并按旧 manifest 注入 ISOLATED；旧页面 MAIN 还有条件式动态 script 注入。不能将这两类“存在旧文件”误记为新版 Background 缺库。

## 三、其余历史第三方文件的分类（不是旧 17 项）

| 历史资源 | 旧来源/消费者证据 | 当前必须怎么办 |
| --- | --- | --- |
| jquery.min.js | 旧 Content Script；用户 Page 可能需要 DOM helper | **已保留独立锁定 jQuery 3.7.1**：src/vendor/jquery-3.7.1.min.js + LICENSE。build.mjs 复制，build-contract.mjs / verify-package.mjs 验哈希；仅批准的 USER_SCRIPT 依赖按锁注入。不是 SW 库，也不是旧 3.2.1 完全兼容 |
| js.cookie.min.js | 旧快照资源存在，未进入 17 项 SW 列表 | 当前 cookies 服务与 js-cookie 全局 API 不等价，按真实消费者单独迁移 |
| crypto-js.min.js | 旧快照存在 | 无现行核心消费者证据，不引入 SW |
| socket.io.min.js | 旧资产存在；旧业务后台可另有 npm socket.io-client | 不恢复远端任意命令运行通道 |
| psl.min.js / store.legacy.min.js | 旧快照存在，不在该 17 项列表 | 核心 URL/Storage 接口不等价于 PSL 公共后缀解析器或 store 全 API |
| vue.global / quasar.umd / react / react-dom | 旧 UI 或备用页面构建资源 | 当前 Side Panel/Tool Shell 有自身资源；Vue/Quasar/React 不是默认 page/Background 全局 |
| growl-notification.min.js | 旧 Content Script 的页面提示 | framework/sdk/notifications.js / platform/chrome/notifications.js 是浏览器通知而非 DOM Growl |
| css-selector-generator、其他快照库 | 资产文件存在 | 仅有历史文件不算必须打包；需先确认当前执行消费者 |

历史快照全部位于 **docs/contracts/source-snapshots/scrapyJsChrome/**；实际发布白名单由 **scripts/build-contract.mjs** / **scripts/verify-package.mjs** 控制，故历史文件不会自动进入 dist。最终生产 JS 可能只有固定 sw.js 等 IIFE 加上单独 vendor，不应因此认定静态 import 消失。

## 四、三类依赖的唯一管理入口

| 层次 | 编写 / 锁定 | 生成资源与消费者 | 验证 |
| --- | --- | --- | --- |
| **扩展自身** | 根 package.json、根 package-lock.json、静态 ESM import | WXT 编译进所属固定 IIFE（SW、Side Panel 等各自独立） | npm ci → npm run build / build:dev → npm run verify，核对 manifest、sw.js 和包指纹 |
| **固定独立资源** | src/vendor/ 下仅需要按字节注入的已审核依赖 + LICENSE | vendor/jquery-3.7.1.min.js；受控 USER_SCRIPT 加载器读取**文本**、比对 SHA 后注入 | PINNED_USER_SCRIPT_LIBRARIES、源文件 hash、dist vendor hash、UserScript 依赖组件测试 |
| **用户 ESM 项目** | 各自目录 package.json + package-lock.json + src/*.js；可构建期固定 HTTPS ESM（独立远端锁和缓存） | 本地 Webpack **单个** program.js，经已有 Page USER_SCRIPT 或 Controller 草稿/Task v1 受控运行 | validate-program-project.mjs → build-program-project.mjs → artifact.json 的依赖/模块/源码 SHA → 独立运行回执 |

R9 的项目规则：直接 npm import 必须是精确 SemVer；lockfile v2/v3 的根依赖和 node_modules 实际包条目一致，包含合法 HTTPS resolved 和 SHA-512 integrity；无锁、不符或包未安装直接失败。构建工件保存 **npmPackages**（声明中实际被导入的包名）、**npmDependencies**（锁定版本/来源/完整性）、**npmBundledModules**（Webpack 真实模块清单）和最终 **sourceHash**。**某包被声明不代表实际入包**：树摇优化可能去掉未使用代码；只有来源记录 + 模块记录 +运行结果才能证明相关函数可用。已编译 program.js 不会获得后台特权。

独立 npm 的真实示例：**examples/programs/page-npm-lodash/** 使用两个本地 ESM 文件 + lodash-es@4.17.21。先对示例目录单独 npm ci，再运行仓库 build:program；CI 使用 tests/integration/npm-project-closure.test.mjs 对真实锁定包的 Webpack 产物做 VM Page 运行验证。**Node VM 不等于 Chrome USER_SCRIPT 原生回执**。

## 五、如何判定“库到底在哪里”

1. 根扩展源码 import 的 npm 包：查看根 package-lock、WXT 对应入口模块树；最终进入 **dist/production/sw.js 等固定 IIFE**，不需要另有 min.js。
2. 独立 vendor：查看 dist/production/vendor/jquery-3.7.1.min.js 和许可证的 exact SHA；只能在经锁定的 USER_SCRIPT 中使用。
3. 用户项目 npm：查看该项目 node_modules（仅本地构建输入）、本地 artifact.json 的 npmDependencies、npmBundledModules、npmLockSha256 和 program.js 最终 sourceHash。浏览器内**没有 npm install/node_modules 目录**。
4. 浏览器执行：观察受控同一目标 document 与 world、网站授权、注入或 Controller 返回、SW 重启/导航/撤权。不准用 Git 提交或 bundle 存在替代。

~~~sh
npm ci --ignore-scripts
npm run check
npm run build
npm run build:dev
npm run verify

npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/page-npm-lodash
npm run build:program -- examples/programs/page-npm-lodash
node --test tests/integration/npm-project-closure.test.mjs
~~~

## 六、当前优先级与证据等级

**P0**：若同一实际安装包的 manifest/sw.js 缺资源或 SW 重启出错，应直接修复；本次仅源码审计，**没有凭静态检查宣称 P0 已全部排除**。

**P1**：完成最新 main 对应的 CI 构建和上述真实 npm 示例；在受控 Mac Chrome 对已锁定 jQuery USER_SCRIPT、npm Page 程序、Content/MAIN SDK、Controller 隔离、网络断开重用、撤权、导航及 Worker 重启取同一候选回执。未有相应回执即 **NOT_TESTED**。

**P2**：继续淘汰历史文档中失效的 UI 操作描述；不要因文档而新增旧采集业务、重复 Broker 或大型 @require 界面。

这里的“已实现源码”“Node/CI 通过”“完整扩展包验证”“真实 Chrome 通过”是四种不同等级。所有 603+19 / B05 / F3 / ZIP 正式合同仍以当前受控测试与原始证据为准，**不得重置或捏造分母**。
