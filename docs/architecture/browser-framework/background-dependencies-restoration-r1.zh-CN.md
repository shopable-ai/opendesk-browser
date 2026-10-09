# R9.1：旧版重复依赖分析与 Background / Content / Page 多世界使用方案

> 状态：**架构修正与实施验收合同；不是已完成代码或 95 分验收结果**。2026-10-09，针对 R9 曾将 Page USER_SCRIPT 的 lodash-es 示例当作 Background 依赖完成证据的错误进行纠正。以主分支实际源码为准。

## 一、结论优先

**结论修正：旧版依赖是“构建时 import + 运行时独立全局文件”并存，不能把后者的文件数量当作新版必须复制的依赖数量。** 旧版 `src-bex/TimeReview.ts` 的 Lodash/Moment 和 `src-bex/background.ts` 的 npm 模块已经包含在构建好的 `background.js` 中；此外，`background-sw.js` 再通过 `importScripts` 加载一批独立库供其他旧全局脚本使用，存在同名库重复加载。新 WXT 的静态 ESM 打包方式本身没有遗漏。**真正未完成的是部分旧行为的取舍与功能迁移**：例如旧 TimeReview 业务尚未恢复、现行 `getFingerprint` 明确不可用；但没有保留的 Background 消费者时，根 `package.json` 不安装 Lodash 并非错误。`examples/programs/page-npm-lodash` 只证明用户 Page 世界的 npm 构建能力，不能冒充 Background 的行为兼容验收。

**目标**：让新版受信任的 Background 框架源码通过静态 ESM/npm import 使用真正需要的第三方库，并保留适当的旧功能语义；其他执行世界独立处理，不增加任意动态特权脚本加载器。

### 旧版的三条加载链（已从源码确认）

```text
① src-bex/TimeReview.ts、src-bex/background.ts
   -> TS/ESM npm import -> Quasar/esbuild -> 已内置 lodash/moment/axios 等的 background.js
② background-sw.js
   -> importScripts(旧 libs/*.min.js、core/*.js、plugins/*.js、background.js)
   -> 在经典 Service Worker 中为另外一批全局旧脚本提供变量
③ manifest.json content_scripts
   -> moment/axios/jquery/.../my-content-script.js [ISOLATED]
   -> my-content-script.js 再 appendScript(旧 libs/lodash/moment/axios/...) [MAIN]
```

**① 已 import 的 npm 包不需要再因为 ② 而额外复制一次才能在 `src-bex` 中调用；② 的旧全局变量并不自动等于①的 npm 模块。** ③ 的库可能与①/②同名，但运行于不同页面 JavaScript 世界，不能共享全局对象。旧 Content Script 和 MAIN 页面注入是两个独立链路，也不应该和 Background 依赖混为一谈。

特别是旧 `manifest.json` 明确把 Moment、Axios、jQuery 等列入 `content_scripts`；旧 `my-content-script.js` 的 `appendScript` 则把 Lodash、Moment、Axios、js-cookie 等放到网页 MAIN。若按“Background 已包含这些 npm 包”就删掉③，原来真正依赖网页全局变量的调用会出问题。应先用 API/世界归属核对需求，再决定替代。

### 新版各世界应该怎样用第三方库

| 环境 | 当前源码/执行入口 | 如何使用第三方库 | 注意 |
| --- | --- | --- | --- |
| 扩展 Background | `src/entrypoints/background.js` → `src/sw.js` → `src/platform/**` | 扩展根 `package.json` 精确依赖，消费者静态 `import`，现有 WXT 输出 `dist/production/sw.js` | 不复制旧 min.js，不向用户脚本暴露扩展权限；仅有真实消费者才增加依赖 |
| 框架 Content Script（ISOLATED） | `src/entrypoints/page-relay.js`、`page-agent.js` 等固定脚本 | 同一个根 npm 锁，**由真正的 Content 源码 import**，WXT 打包到该入口；Broker 按批准目标注入 | 与 Background 分开构建、不能通过 `globalThis._` 跨世界共享 |
| 受信页面 MAIN SDK | `src/entrypoints/sdk-main.js` → `src/framework/sdk/entry.js` | 若确需固定第三方库，由明确的 MAIN 源码静态导入并独立打包 | `MAIN` 与网站 JS 共享环境，有污染/越权风险；目前仅允许现有受信 SDK 入口，不开放任意第三方 MAIN 注入 |
| 用户 Page Program | `examples/programs/page-npm-lodash/`、`page-userscript` | 用户项目各自 `package.json` + `package-lock.json` + `src/main.js` 静态 import，既有 Webpack 输出固定 JS；通过 `USER_SCRIPT` 运行 | 无权直接访问网页 MAIN 的 JS 变量或扩展 Background 私有对象；DOM 可以读写 |
| Controller Program | `examples/programs/controller-title/`、`controller` | 与 Page 相同的用户项目 npm/锁定构建机制；最终在受控 Worker 使用纯 JS 库 | 无 `window/document/chrome`；通过既有 `page` 和 Broker 操作网页；成品源码上限 65536 bytes |
| Sidebar 自身与自定义工具 | `src/ui/` 的固定入口、`src/sidebar-tools/` 隔离工具 | 扩展**自身 UI**用根锁+WXT；**用户工具包**走现有受限工具构建合同 | 用户安装的工具不能伪装成可信 Background / Sidebar 框架入口 |

**开发时无需每次上传 JSON：** `native-agent/local-dev/resolver.mjs` v2 当前**已经支持**已安装、精确锁定的 npm 包和已有 `opendesk.remote-lock.json` / `.opendesk/remote-cache` 的 HTTPS ESM。连接授权的多文件本地项目后，现有 `buildProgramProjectInMemory` 在内存中编译，进入原 Page/Controller 执行链；源码修改后再显式 `dev.run` 会重读依赖图。独立单文件直连或 Sidebar 手工草稿没有 npm 项目上下文，不等于支持裸 `import 'lodash-es'`；正式交付仍用 `build:program` 冻结产物。旧产品使用指南中“不支持 npm/HTTPS 本地运行”属于旧阶段残留，应以实码和此处更正为准。

**操作示例——框架开发者**：仅在确定 `src/platform/**` 或 `src/agents/**` 有实际消费者时，从仓库根执行 `npm install --save-exact --ignore-scripts lodash-es@4.17.21`，并在该消费者源码写 `import throttle from 'lodash-es/throttle.js';`；WXT 各入口独立打包后审查其 `bundleModules`、体积和真实行为。若没有真实消费者，不添加该包，不引入纯演示模块。

**操作示例——用户 Page/Controller 开发者**：在已授权的多文件项目目录安装精确版本、维护该项目的锁文件，然后在 `src/main.js` 写 `import escape from 'lodash-es/escape.js';`；启动既有 MCP/Native 本地连接，明确运行并看结果。前提是 `npm ci` 完成、所有已声明包合法且源码满足运行世界与体积限制。未连接本地环境时可在项目根执行既有 `npm run build:program -- <项目目录>` 并导入正式冻结产物。已打包示例不依赖运行时 CDN。

**既有例外**：`src/vendor/jquery-3.7.1.min.js` 是唯一已有固定资产、哈希与许可合同的 Page USER_SCRIPT jQuery 字节资源；既存批准锁可继续复验使用，但不能据此推断所有库都可直接通过 `@require` 新增。新增 HTTPS ESM 只在受信本地开发端显式锁定和缓存，不允许在扩展/目标网页运行时动态下载执行。

## 二、源文件在哪里、实际需要什么

| 旧证据/源码 | 旧版真实用途 | 目前新版状态 | 修复责任 |
| --- | --- | --- | --- |
| assets/js/libs/lodash.min.js；background.js 内嵌 node_modules/lodash/lodash.js | Background 加载；src-bex/TimeReview.ts 调用 throttle、isEmpty、sortBy、values | 根 package.json 未安装；Page lodash-es 示例**不属于** Background | 有保留消费者时，根依赖+Background import+等价测试；新代码优先细粒度 lodash-es，需 CJS 兼容时单独评估 lodash，避免双份打包 |
| assets/js/libs/moment.min.js；background.js 内嵌 moment | TimeReview 时间格式、endOf、duration；旧 background.ts 日志及日期 | Date/Intl 仅部分覆盖，不是 Moment API 替换 | 按仍保留的调用逐项迁移；行为有差异时使用固定版本兼容模块 |
| assets/js/libs/axios.min.js；background.js 内嵌 axios | TimeReview 及旧 background 桥 HTTP；历史请求可含认证/headers | src/framework/sdk/http.js 是**网页 SDK 门面**，src/platform/chrome/network.js 是**受授权的受限 fetch 服务**，不是完整 Axios | 逐消费者决定：受信核心直连也需策略与审计；需要 Axios 完整语义时以根依赖引入，并避免突破 Broker 权限 |
| assets/js/libs/query-string.min.js；background.js 内嵌 query-string | URL 参数工具，旧包有源码但待确认保留消费者 | URLSearchParams 不等价于 query-string 的所有选项与数组格式 | 针对调用定义回归向量，再决定 npm 包或原生实现 |
| assets/js/libs/fingerprintjs@3.js；assets/js/core/utils.js | 旧 getFingerprint 直接 FingerprintJS.load() | src/framework/sdk/utils.js 当前明确抛出 E_RESOURCE_UNAVAILABLE；未完成迁移 | 如果产品确实需要，单独用户授权和合适 DOM 环境执行；SW 无 DOM，不得假装 SW 可直接执行浏览器指纹采集 |
| assets/js/libs/cheerio.1.0.0.min.js | 旧后台采集/HTML 处理，具体可保留消费者待核实 | 没有 Cheerio 兼容层；Page DOM/Locator 不是 Cheerio | 只有确认仍属产品需求后迁移；Node 依赖不能不验证就运行在 SW |
| 其余 core/bridge、common、webRequestBg、serverUtils、ChromePage、TraceTimeUtil、scrapyJs 与站点任务 | 混合框架核心、通信和历史站点业务 | 新 Broker / Controller / SDK 部分承接；并未逐导出/行为一对一证明 | 建立 API/消费者级清单，区分保留、替换、延期、正式删除，不可仅凭相似名称判完成 |

上述依据来自 docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js、background.js（内含 src-bex/TimeReview.ts 及 background.ts 源模块注释）、assets/js/core/utils.js、新版根 package.json、src/framework/sdk/utils.js、src/platform/chrome/network.js 和 src/framework/sdk/http.js。注意：历史加载列表不保证旧库在 MV3 Worker 实际能够正常运行；必须有真实调用及 Chrome 回执。

## 三、推荐实现：唯一 Background 构建链

```text
根 package.json + package-lock.json（扩展自身的、精确锁定的生产 dependencies）
  -> src/entrypoints/background.js
  -> src/sw.js
  -> src/platform/host/* / src/platform/chrome/* / 其他确有需要的受信模块
     -> import { throttle, isEmpty, sortBy, values } from 'lodash-es'
     -> 按确认的消费者 import 其他 npm 包或自有薄适配器
  -> 现有 WXT/Vite/Rollup，单一受信 Background 产物
  -> dist/production/sw.js（保留现有 build receipt 的 bundleModules 溯源）

另一路：用户项目 package.json -> Webpack -> program.js -> USER_SCRIPT 或受控 Controller。
两路锁文件、消费者、运行世界、权限全部隔离，互不充当验收证据。
```

1. **先真实消费者、后依赖安装**：提取旧打包背景源码的调用链；每一项写出旧 API、是否当前产品功能、现有新消费者、行为向量和决定。纯业务遥测、特定站点抓取、旧远程命令通道不能因为曾加载而自动重启。
2. **让框架直接 import**：确认要保留的能力在扩展根 npm 安装固定版本及锁文件；受信 Background 代码静态 import。不要求在用户 Page/Controller Program 里安装一遍，不自动提供全局 _ 或 moment。确需短期 globals 的迁移脚本只在明确定义的私有兼容模块内适配，附弃用期限与测试。
3. **安全与语义优先**：时间/查询库按真实测试向量选择；Axios 不能绕开现有 Host Authority 的来源、目标、权限及请求范围；指纹识别/DOM 库不能硬塞进无 DOM 的 Service Worker。不得恢复未审核的站点采集、遥测或远程指令执行。
4. **守住真实工程约束**：当前生产 sw.js 327661 字节，原预算 327680 字节，只余 19 字节。先去重与瘦身、必要时评审预算及构建形态；不把增加限额伪装成性能修复，不通过 importScripts 全量加载旧 vendor 去绕开 bundle/modules 审查。不新增第二个 Broker/构建器。
5. **多文件源码不等于多份运行时文件**：源码可拆成任意多个 ESM 模块，WXT 汇总到当前单产物；绝非要求退回一个巨大手写 js。生产库来源可在根 node_modules，最终入 sw.js；是否真的入包以 Rollup bundleModules 与运行结果为准。

## 四、验收门槛（未完成前不宣称 95+）

- P0 一份版本化的旧 Background API/消费者矩阵：每行路径、原调用、保留与否、新文件、npm 名称/版本、目标产物、权限、语义测试、证据与负责人，未经证明不得标 DONE。
- P0 针对**当前仍保留的 Background 消费者**，静态 import 所需的根 npm 依赖并验证对应真实 API 的语义与 SW 行为；若不存在保留消费者，则不安装 Lodash、不创造假消费者，明确标注 TimeReview 等旧业务已退役/待恢复，另由 WXT 静态 import 机制与运行环境验证证明框架具备该能力。Page 示例不可代替 Background 测试。
- P0 干净 npm ci、npm 锁文件与许可证/供应链检查、生产+开发 WXT 构建、package/ZIP 校验；**仅当有实际引入**时才要求 bundleModules 定位新增库；无新增库时须验证 SW 与现有 Content/UI 入口未凭空遗漏消费者。
- P0 Chrome MV3 真实启动、授权操作、Service Worker 睡眠/重启后再次调用；网络有权限及拒绝路径；无跨世界全局污染、无运行时远程脚本；保留对 Native、SDK、Controller、Page 的回归。
- P1 Moment 日期边界/时区、query-string 数组/编码、Axios 旧参数/响应/异常等针对实际保留消费者的对比用例；不保留的旧行为给出明确移除理由，不能打勾表示兼容。
- P1 生成清晰的迁移表与运行指南，文档里显示缺口及验收等级，最终在 main 对照 GitHub CI 和真实 Chrome 记录，不以设计评分冒充验收结果。

## 五、分阶段推进与评分规则

| 阶段 | 内容 | 退出条件 |
| --- | --- | --- |
| R9.1-A | 旧 bundle、importScripts、Content/MAIN 注入三路消费者扫描与去重 | 所有仍承诺的 API 有明确执行世界与去向；同名依赖重复与真正缺失分开 |
| R9.1-B | 保留的纯工具/时间/URL 库及 Background/Content 实际消费者迁移；控制固定产物体积 | 按需锁定 npm + WXT 构建 + 对应世界真实调用，绝不为刷验收创造假消费者 |
| R9.1-C | 网络、指纹、HTML/采集等跨环境需求逐一迁移或明确退役 | Broker 授权、不越权、不假兼容，必要的 Chrome E2E |
| R9.1-D | Mac Chrome 真实重启/恢复、回归、main 集成 | 验收证据完整、失败透明、远端仅保留 main（不删除未合改动） |

专家目标 95/100 只是**未来验收标准**，不是当前实现分数。采用：需求/职责准确性 20、旧消费者与功能闭环 25、Background 可用性及构建溯源 20、MV3 安全/生命周期 20、真实验收及文档 15。任一 P0 失败，最高记 89 分；只有 95+ 且所有 P0 真实通过才可标为正式完成。禁止用 Page USER_SCRIPT 的 npm 测试填充 Background 项目得分。

## 六、执行纪律

默认直接在 main 开发，但先 fetch 最新 HEAD 和目标文件 SHA，保护协作者修改；不创建平行构建工具或 UI；涉及依赖锁必须用真正 npm ci 复验，不手写伪造锁。没有 Mac 本地环境时，真实 Chrome 阶段明确标 BLOCKED 并提供精准 Codex 本地复验入口。本文件是修正规范，不是完成声明。
