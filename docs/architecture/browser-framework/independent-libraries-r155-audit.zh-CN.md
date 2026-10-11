# OpenDesk Browser R15.5 第三方库完整性与加载链审计（滚动证据）

日期：2026-10-11。主干基线：R15.5 初始实施提交 `eddbc17309ef8a053973f3a457029e78d2fe330e`。
**这是源码与历史证据审计，不是最终的本地 Mac / 最新同包 Chrome PASS。**
前置资料：`independent-libraries-r154.zh-CN.md`、`third-party-library-map.md` 与 `docs/framework/workstreams/r15-4-independent-libraries-20261010.md`。

## 1. 实际架构（避免将目录数量当成 API 覆盖）

- 扩展自身的 npm 库由 `package.json` / `package-lock.json` 锁版本，WXT/Vite 在 `src/entrypoints/{lodash,dayjs}.js` 的单独 IIFE 入口生成包。源码入口 `src/libs/packages/*.js` 是适配代码，**不要求**将所有第三方源码复制到 `src/libs`。
- Controller/USER_SCRIPT 预装库：`src/libs/runtime-contract.js` 为唯一 ID、版本、路径、world 与固定哈希合同；`catalog.js` 补充来源、许可证、允许 API；`loader.js` 读取当前扩展资源清单和包中字节并校验 SHA-256，`core.js` 注册只读 `OpenDeskLibs`、`_`、`dayjs`。Controller 在受控 Worker，Page 在 USER_SCRIPT；不等于网页 MAIN。
- `my-utils` 与 jQuery 为原字节 vendor JS，经 `scripts/prepare-public.mjs` 复制。前者默认；后者 **仅当 Page 显式声明** `// @opendesk-lib jquery` 或经过已有 @require 锁流程时按需读取。当前 `loadPackagedJquery` 直接使用 catalog 固定的字节和 SHA，并不经过默认库的 manifest 函数；R15.5 增强了扩展 URL、响应重定向和固定长度验证，但统一 manifest 路径仍是待验收项。
- 普通用户程序的 npm / ESM 依赖通过它自己的项目构建流程进入最终 JS；不等于自动成为 Controller/USER_SCRIPT 的预装全局。历史库出现在 `docs/contracts/source-snapshots/**` 也不等于当前消费者还存在。
- 开发框架本身 import 的 npm 包不能冒充预装库；预装库受限 API 也不能标记为 npm 包全量兼容。

## 2. 当前注册和历史资源迁移矩阵

执行世界缩写：C=CONTROLLER，U=USER_SCRIPT，B=Background/SW，I=Content ISOLATED，M=网页 MAIN，S=Sidebar。
「未确认」意味着当前尚无完整消费者反向索引、当前构建及浏览器实测，不是已经缺失，也不是无需迁移。

| Library | Legacy Version | Current Version | Source | Consumer | World | Build Mode | Actual Output | Runtime Loading | API Coverage | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lodash | 旧 min.js，待提取版本 | lodash-es 4.18.1 | npm | 用户程序中的 `_` / 测试 | C、U | WXT 独立 IIFE | `libs/packages/lodash.js` | 默认 | **仅 get/has/words/trim/uniq/chunk/escape/truncate** | SOURCE_PASS（登记）；最新 PACKAGE/RUNTIME 待复验 |
| Day.js | 旧无；历史日期库为 Moment | 1.11.23 | npm | 用户程序中的 `dayjs` / 测试 | C、U | WXT 独立 IIFE | `libs/packages/dayjs.js` | 默认 | 核心函数及 isDayjs；无 extend/locale mutators | SOURCE_PASS（登记）；最新 PACKAGE/RUNTIME 待复验 |
| my-utils | 无 | 1.0.0 | vendor | OpenDeskLibs.myUtils / 测试 | C、U | 原字节复制 | `libs/vendor/my-utils/1.0.0/index.js` | 默认 | upper | SOURCE_PASS（登记）；最新 PACKAGE/RUNTIME 待复验 |
| jQuery | 旧快照 min.js；旧 `src/vendor` 为 3.7.1 | 3.7.1 | vendor | `preview.js`、`dependency-manager.js`、用户 Page DOM | U，不在 C/M | 原字节复制 | `libs/vendor/jquery/3.7.1/jquery.min.js` | 显式 opt-in 或已授权依赖锁 | $ / jQuery 3.7.1；隔离世界 | SOURCE_PASS（登记）；原生负向场景未验收 |
| Moment.js | 旧 min.js，待提取版本 | 未预装 | 历史快照 | 旧日期代码；当前保留消费者未确认 | 旧 B/I/M 待分辨 | 不适用 | 无 | 无 | **Day.js 不是无差异兼容实现** | UNVERIFIED |
| Axios | 旧 min.js，待提取版本 | 未预装 Axios | 历史快照 | 旧网络代码；现有 axiosx 为独立的授权代理 API | 旧 B/I/M 待分辨 | 不适用 | 无 | 无 | 不承诺 Axios 同 API | UNVERIFIED |
| Cheerio | 1.0.0（旧文件名） | 未预装 | 历史快照 | 当前消费者未确认 | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| CryptoJS | 旧 min.js，待提取版本 | 未预装 | 历史快照 | 当前消费者未确认；当前 WebCrypto 并非完整 CryptoJS | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| FingerprintJS | 3.x（旧文件名） | 未预装 | 历史快照 | 旧指纹调用；现有相同语义未验证 | 旧 I/M 待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| js-cookie | 旧 min.js，待提取版本 | 未预装 | 历史快照 | 当前消费者未确认 | 旧 I/M 待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| query-string | 旧 min.js，待提取版本 | 未预装 | 历史快照 | 当前消费者未确认；URLSearchParams 不等价 | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| Socket.IO | 旧 min.js，待提取版本 | 未预装 | 历史快照 | 当前消费者未确认 | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| Vue | 旧 global build，待提取版本 | 未作为预装库 | 历史快照 | 旧 UI；当前 UI 的具体消费者须另证 | 旧 I/M/S 待确认 | 不适用 | 无 | 无 | 不声称 Vue 迁移 | UNVERIFIED |
| Quasar | 旧 UMD，待提取版本 | 未作为预装库 | 历史快照 | 旧 UI；当前消费者未确认 | 旧 I/M/S 待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| PSL | 旧 min.js，待提取版本 | 未预装 | 历史快照 | 当前消费者未确认 | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| store.legacy | 旧 legacy min.js，待提取版本 | 未预装 | 历史快照 | 当前消费者未确认 | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| CSS Selector Generator | 3.6.4（旧文件名） | 未预装 | 历史快照 | 当前消费者未确认 | 旧 I/M 待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |

旧快照路径：`docs/contracts/source-snapshots/scrapyJsChrome/assets/js/libs/`（15 个 JS 文件）。
旧 `src/vendor/jquery-3.7.1.min.js` 与 `src/libs/vendor/jquery/3.7.1/jquery.min.js` 的 Git blob SHA 均为 `7f37b5d99122b4928505d1e0ac5ca7279edd56ed`，实际 87,533 字节；旧和新许可证 blob 同为 `f642c3f7a77a5833bc3dfee643ad8ca6387b23e7`。R15.5 发现 `tests/framework/k5-package-four-service-resources.test.mjs` 中仍有两处旧路径消费；已改用 canonical `src/libs/vendor/jquery/3.7.1/`，并删除两个重复的 `src/vendor/jquery-3.7.1.*` 文件。`npm run libs:doctor` 的 live-source 消费者扫描和 CI 复验用于防止回归；历史快照不删除。

## 3. R15.5 的实质性代码与可观测性

首批提交 `eddbc17309ef`：
- `src/scripting/user-scripts/packaged-dependencies.js` 对 jQuery 按需加载增加当前扩展 root + 精确路径 + runtime.id 交叉校验；禁止重定向及不匹配响应 URL；校验固定 87,533 字节与源码 SHA；网络失败显式拒绝。未请求该库时调用方不读取它。
- `scripts/libs-doctor.mjs` / `npm run libs:doctor` 为**只读**检查，报告四库的 ID/版本/世界/模式/API 边界，检查 `libs:check`、npm 锁/安装版本、源码重复、生产和开发 manifest 对实际库文件的逐字节 SHA、WXT IIFE 私有命名以及真实 SW 体积。无构建时报告 PACKAGE_UNVERIFIED。不会制造 Chrome 回执。
- 新增 `tests/environment/packaged-jquery-loading-r155.test.mjs` 与 `libs-doctor-r155.test.mjs`；原测试桩在加强 URL 验证后按真实 `getURL(path)` 行为调整。
- **注意：** doctor 的 PACKAGE_PASS 只表示内置库包资源的静态对账，不是整个 ZIP / 全部权限 / 浏览器加载 PASS。所有原生状态始终 NATIVE_UNVERIFIED，除非另有同候选真实回执。

## 4. 未关闭的 P0 问题，不能误报通过

1. **SW 预算冲突：** 任务要求生产 SW hard gate 为 **327,680 B**。核查时 `scripts/build-contract.mjs` 实际设置 `serviceWorkerProductionBytes: 512*1024`，320 KiB 只是 review threshold；对应 `sw-budget-policy.test.mjs` 也显式断言 512 KiB。因此「保留原 320 KiB hard gate」**当前 FAIL**，不能用提高限额掩盖。此变更来自并行体积工程，未在本任务盲目撤销；必须以同候选生产 SW 真正瘦身和全量回归后收敛。
2. jQuery 现有 opt-in 独立固定哈希校验可用；尚未复用默认库 manifest 严格对账（需要同时更新依赖管理器模拟器及原生用例，不能仅改函数签名）。
3. 未执行当前提交的 npm ci、双 WXT、完整 npm test、双 ZIP、真实 Mac Chrome、Controller/USER_SCRIPT 负向及权限撤销等场景；GitHub CI 可提供部分同 SHA 的自动证据，但用户 Mac 的原生安装与专项冷/热性能仍独立待测。
4. 旧 jQuery 两个文件的在用消费者扫描和路径修复已实施，源码重复副本已删除；历史 15 库的跨工程全量消费者反向扫描及替代策略仍未完成。**不得**把未迁移直接当成功能缺陷，也不得把「没看到调用」当成已扫描通过。
5. 最新包的默认加载字节、jQuery opt-in 字节、SW、Controller、构建耗时、冷/热执行耗时须从**同一新候选**实测；R15.4 较早的 319,248 B SW、12,832 B Lodash、7,546 B Day.js、36,780 B Controller 等数字仅为历史基线，不能贴到当前候选当成绩。
6. R15.4 已有 macOS CFT 155 真正 Page 三库调用、20 文档和浏览器重启的历史证据：`docs/framework/workstreams/r15-4-independent-libraries-20261010.md`，生产 CI `38063996344`（提交 `b35052f7555d...`）。**不能**将这份证据升级为当前 R15.5 的原生 PASS。

## 5. 本地开发者检查命令

```bash
git status --short --branch
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
npm ci --ignore-scripts
npm run libs:list
npm run libs:check
npm run libs:doctor
npm run check
npm run build && npm run build:dev
npm run libs:doctor -- --strict
npm run verify
npm test
npm run build:size
npm run pack && npm run pack:dev
```

注意 `npm test` 包含读取实际生产和开发 WXT 产物的测试，必须先双构建。
检查 `dist/{production,development}/libs/manifest.json` 与
`dist/{production,development}/libs/packages/{lodash,dayjs}.js`、`libs/vendor/jquery/3.7.1/jquery.min.js`，
以及 `docs/framework/evidence/wxt/builds/build-{production,development}.json`；严格校验 hash、ABI、格式、两个世界下的真实执行结果。每个构建必须记录候选 source input fingerprint，不能将前一提交的 dist 验收结果套到当前 commit。

### 原字节 classic JS

添加固定 `src/libs/vendor/<id>/<version>/index.js` 和许可证；`npm run libs:hash -- <path>`；
在唯一 `runtime-contract.js` 登记版本、world、output、字节、SHA，`catalog.js` 登记许可证、
方法、source，然后按实际默认/按需运行入口实现注册与消费；执行
`libs:check`、双构建、`libs:doctor -- --strict`、全部自动测试与同包 Chrome。
当前 core 对新增默认库需显式增加公开 API；非默认库需显式连接按需 loader，**不是只登记就可运行**。

### npm ESM/包

在根精确锁依赖后新增 `src/libs/packages/<name>.js` 适配器，并由 `src/entrypoints` 和
`scripts/build-contract.mjs`、WXT 固定入口生成独立 IIFE；不能让 node_modules 路径进入浏览器。
适配器明确 API 白名单与世界，许可证进入 dist。变更既有库 ABI 时拒绝旧 Candidate/Task 的旧验证。
不能在运行时访问 npm registry/CDN，也不能把未审查库塞入 SW/MAIN。

## 6. 完成判据

完整迁移矩阵要落到消费者 grep 与实际代码引用；source / package / runtime / native 四阶段分别 PASS；
生产 SW ≤327680 B 且 320 KiB 恢复为真正 hard gate；资源 manifest 与单包 ZIP 相符；
jQuery 按需隔离与失败关闭、Controller 和 USER_SCRIPT 实际调用、扩展更新/撤权/导航/离线/重启、
重复加载性能均有当次 Chrome 原始证据。没有这些结果不能宣布 R15.5 全部完成或专家 95/100。

## 7. 2026-10-11 更新：旧 jQuery 去重

`libs:doctor` 的 current-source 扫描曾发现唯一实际残留消费者：`tests/framework/k5-package-four-service-resources.test.mjs`。先将其中 JS 和 License 两个读取点迁移到 `src/libs/vendor/jquery/3.7.1/`；对照两个源文件 Git blob 身份一致，然后原子删除两个 `src/vendor/jquery-3.7.1.*` 重复文件。此次静态扫描排除历史文档快照；不能替代完整 Mac Chrome 原生复验。后续以同候选 `npm test` / 核心相关 tests/framework / WXT 双包和 zip 审核结果为准。
