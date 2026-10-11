# OpenDesk Browser R15.5 第三方库完整性与加载链审计（滚动证据）

日期：2026-10-11。主干基线：R15.5 初始实施提交 `eddbc17309ef8a053973f3a457029e78d2fe330e`。
**这是源码与历史证据审计，不是最终的本地 Mac / 最新同包 Chrome PASS。**
前置资料：`independent-libraries-r154.zh-CN.md`、`third-party-library-map.md` 与 `docs/framework/workstreams/r15-4-independent-libraries-20261010.md`。

## 1. 实际架构（避免将目录数量当成 API 覆盖）

- 扩展自身的 npm 库由 `package.json` / `package-lock.json` 锁版本，WXT/Vite 在 `src/entrypoints/{lodash,dayjs}.js` 的单独 IIFE 入口生成包。源码入口 `src/libs/packages/*.js` 是适配代码，**不要求**将所有第三方源码复制到 `src/libs`。
- Controller/USER_SCRIPT 预装库：`src/libs/runtime-contract.js` 为唯一 ID、版本、路径、world 与固定哈希合同；`catalog.js` 补充来源、许可证、允许 API；`loader.js` 读取当前扩展资源清单和包中字节并校验 SHA-256，`core.js` 注册只读 `OpenDeskLibs`、`_`、`dayjs`。Controller 在受控 Worker，Page 在 USER_SCRIPT；不等于网页 MAIN。
- `my-utils` 与 jQuery 为原字节 vendor JS，经 `scripts/prepare-public.mjs` 复制。前者默认；后者 **仅当 Page 显式声明** `// @opendesk-lib jquery` 或经过已有 @require 锁流程时按需读取。`loadPackagedJquery` 保持独立按需读取，并依照 catalog 的固定字节数/SHA-256 检查，未额外加载其他库。R15.5 在默认库 loader 的 manifest 准入阶段进一步逐项比对所有具有固定 SHA 的 vendor 行（包括未加载的 jQuery）；即使默认脚本不请求 jQuery，伪造的 jQuery manifest hash/bytes 也会阻断运行。两条读取路径仍独立，没有增加默认下载 jQuery 的行为。
- 普通用户程序的 npm / ESM 依赖通过它自己的项目构建流程进入最终 JS；不等于自动成为 Controller/USER_SCRIPT 的预装全局。历史库出现在 `docs/contracts/source-snapshots/**` 也不等于当前消费者还存在。
- 开发框架本身 import 的 npm 包不能冒充预装库；预装库受限 API 也不能标记为 npm 包全量兼容。

## 2. 当前注册和历史资源迁移矩阵

执行世界缩写：C=CONTROLLER，U=USER_SCRIPT，B=Background/SW，I=Content ISOLATED，M=网页 MAIN，S=Sidebar。
「未确认」意味着当前尚无完整消费者反向索引、当前构建及浏览器实测，不是已经缺失，也不是无需迁移。

| Library | Legacy Version | Current Version | Source | Consumer | World | Build Mode | Actual Output | Runtime Loading | API Coverage | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lodash | 4.17.21（旧 bundle 内置版本） | lodash-es 4.18.1 | npm | 用户程序中的 `_` / 测试 | C、U | WXT 独立 IIFE | `libs/packages/lodash.js` | 默认 | **仅 get/has/words/trim/uniq/chunk/escape/truncate** | SOURCE_PASS（登记）；最新 PACKAGE/RUNTIME 待复验 |
| Day.js | 旧无；Moment 为 2.18.1 | 1.11.23 | npm | 用户程序中的 `dayjs` / 测试 | C、U | WXT 独立 IIFE | `libs/packages/dayjs.js` | 默认 | 核心函数及 isDayjs；无 extend/locale mutators | SOURCE_PASS（登记）；最新 PACKAGE/RUNTIME 待复验 |
| my-utils | 无 | 1.0.0 | vendor | OpenDeskLibs.myUtils / 测试 | C、U | 原字节复制 | `libs/vendor/my-utils/1.0.0/index.js` | 默认 | upper | SOURCE_PASS（登记）；最新 PACKAGE/RUNTIME 待复验 |
| jQuery | 3.2.1（历史快照）；3.7.1（原 `src/vendor`） | 3.7.1 | vendor | `preview.js`、`dependency-manager.js`、用户 Page DOM | U，不在 C/M | 原字节复制 | `libs/vendor/jquery/3.7.1/jquery.min.js` | 显式 opt-in 或已授权依赖锁 | $ / jQuery 3.7.1；隔离世界 | SOURCE_PASS；production WXT USER_SCRIPT opt-in DOM / MAIN 隔离已通过（9f594e）；其余负向场景待验收 |
| Moment.js | 2.18.1（源码头注释） | 未预装 | 历史快照 | 旧日期代码；当前保留消费者未确认 | 旧 B/I/M 待分辨 | 不适用 | 无 | 无 | **Day.js 不是无差异兼容实现** | UNVERIFIED |
| Axios | 0.21.1（源码头注释） | 未预装 Axios | 历史快照 | 旧网络代码；现有 axiosx 为独立的授权代理 API | 旧 B/I/M 待分辨 | 不适用 | 无 | 无 | 不承诺 Axios 同 API | UNVERIFIED |
| Cheerio | 1.0.0（旧文件名） | 未预装 | 历史快照 | 当前消费者未确认 | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| CryptoJS | 旧 min.js，待提取版本 | 未预装 | 历史快照 | 当前消费者未确认；当前 WebCrypto 并非完整 CryptoJS | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| FingerprintJS | 3.4.2（源码头注释） | 未预装 | 历史快照 | 旧指纹调用；现有相同语义未验证 | 旧 I/M 待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| js-cookie | 3.0.5（源码头注释） | 未预装 | 历史快照 | 当前消费者未确认 | 旧 I/M 待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| query-string | 1.0.1（jsDelivr 原文件路径） | 未预装 | 历史快照 | 当前消费者未确认；URLSearchParams 不等价 | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| Socket.IO | 4.0.0（源码头注释） | 未预装 | 历史快照 | 当前消费者未确认 | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| Vue | 3.3.4（bundle 内部版本字符串） | 未作为预装库 | 历史快照 | 旧 UI；当前 UI 的具体消费者须另证 | 旧 I/M/S 待确认 | 不适用 | 无 | 无 | 不声称 Vue 迁移 | UNVERIFIED |
| Quasar | 2.12.7（源码头注释与 jsDelivr 路径） | 未作为预装库 | 历史快照 | 旧 UI；当前消费者未确认 | 旧 I/M/S 待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| PSL | 旧 min.js，待提取版本 | 未预装 | 历史快照 | 当前消费者未确认 | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
| store.legacy | 2.0.12（bundle 内部版本字段） | 未预装 | 历史快照 | 当前消费者未确认 | 旧环境待确认 | 不适用 | 无 | 无 | 未迁移 | UNVERIFIED |
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

1. **SW 预算恢复：** 曾核查到 `serviceWorkerProductionBytes: 512*1024`（320 KiB 仅警告），与本轮明确的 **327,680 B** 要求不一致。R15.5 在 `scripts/build-contract.mjs`、`scripts/verify-package.mjs` 与定向测试恢复了 SW **320 KiB 硬限制**，其他生产入口 512 KiB 和开发 SW 768 KiB 不变。新的源码合同已提交；实际生产 WXT 构建是否低于硬上限仍待同候选 CI 确认，不能提前标 PACKAGE_PASS。
2. **jQuery manifest 行的静态 ABI/字节/SHA 校验已补足**：`src/libs/loader.js` 在执行用户代码前检查全部固定 vendor 的 manifest 行（包含按需 jQuery），并新增「只修改 jQuery 清单 SHA 或 bytes」的负向测试；jQuery JS 本体仍只在显式声明后读取，且独立 SHA pin。更深的资源被物理损坏、升级/离线失败原生场景仍须专项验收。
3. 初审时未有本轮同包 Chrome 回执；后续已对特定 R15.5 候选获得生产 CI 和原生回执，详见第 9 节。后续主干提交必须重新复验，不能将历史验收直接迁移。jQuery opt-in DOM、用户 Mac 撤权/离线/冷-热性能仍未完整验收。
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
生产 SW ≤327680 B 且 320 KiB 仍为真正 hard gate；资源 manifest 与单包 ZIP 相符；
jQuery 按需隔离与失败关闭、Controller 和 USER_SCRIPT 实际调用、扩展更新/撤权/导航/离线/重启、
重复加载性能均有当次 Chrome 原始证据。没有这些结果不能宣布 R15.5 全部完成或专家 95/100。

## 7. 2026-10-11 更新：旧 jQuery 去重

`libs:doctor` 的 current-source 扫描曾发现唯一实际残留消费者：`tests/framework/k5-package-four-service-resources.test.mjs`。先将其中 JS 和 License 两个读取点迁移到 `src/libs/vendor/jquery/3.7.1/`；对照两个源文件 Git blob 身份一致，然后原子删除两个 `src/vendor/jquery-3.7.1.*` 重复文件。此次静态扫描排除历史文档快照；不能替代完整 Mac Chrome 原生复验。后续以同候选 `npm test` / 核心相关 tests/framework / WXT 双包和 zip 审核结果为准。

## 8. 2026-10-11 更新：恢复 SW 320 KiB 硬限制

R15.5 提交 `cb59a8ca0a53d20bc03a49773eab399d0abc1154` 重新保证 `entryByteBudget('sw.js','production')===327680`；真实 WXT bundle writer 与 package verifier 共用此合同，其他入口预算保持原样。同候选生产 WXT/ZIP 及全面 Chrome 验收仍须根据 CI/本地记录判断，不能直接复用历史 SW 的约 319.89 kB 数字。

## 9. 真实 CI 新证据（候选 `7144c33cdf2e3d202687456722385945b5f2b94d`）

- [macOS Chrome for Testing 155.0.8059.39 与 WXT production #38108842277](https://github.com/shopable-ai/opendesk-browser/actions/runs/38108842277)：**PASS**，同一个真实 production 扩展包的 Page 三种默认库、20 个文档、服务 Worker 与 Chrome 重启；证据 Artifact **11690707132** 内 `docs/framework/evidence/r154-production-native/acceptance.json`。这不是用户本机的验收。
- 同候选实际 production `packageHash=acab9e522230ae10540f0c12fd61cc1b7bc4ce1986ea0fd35bf0fa72d1d792c3`。压缩 ZIP **415,648 B**，`SHA256=add27897d0a8ae089c8d29b958f518b2a6da9f3b6e25670de7d86b06787fd03a`。
- 真实分离文件大小（字节）：`sw.js=320027`（限制 **327680 B**，剩 **7653 B**）；`lodash.js=12832`；`dayjs.js=7546`；`my-utils/index.js=291`；`jquery.min.js=87533`（仅 opt-in）；`libs/runtime/bootstrap.js=876`；`libs/runtime/page-core.js=5165`；`worker-runtime.js=37121`；`libs/manifest.json=2020`。每个资源的 SHA 在本次 package 验证回执中。
- [独立 source-bound Chrome Controller/Page/MAIN 隔离 #38108842211](https://github.com/shopable-ai/opendesk-browser/actions/runs/38108842211)：**PASS**；真实 Controller 默认库与 USER_SCRIPT `HELLO`/日期/分词返回正确，网站 MAIN `lodash` 和 `dayjs` 哨兵未更改。**该测试是独立装载，不是上面 WXT 生产包同包验证。**
- [固定入口、双模式包大小和边界 #38108842212](https://github.com/shopable-ai/opendesk-browser/actions/runs/38108842212)：**PASS**，SW 320 KiB 硬限制已真实执行。R15 资格 [#38108842224](https://github.com/shopable-ai/opendesk-browser/actions/runs/38108842224) 的 `npm test` 曾因另一处 Native 测试仍断言 SW 512 KiB **FAIL**；该旧断言已由提交 `d187b0e33d5d9caf7b9d48d595fa029a7dd5d434` 修正，需以新 SHA 再验收。
- **未关闭：** jQuery 在真实 production USER_SCRIPT 下 opt-in DOM/MAIN `$-jQuery` 隔离、manifest 单项校验、撤权/离线/资源损坏、17 行库矩阵中未确认的历史消费者/版本、用户本机冷启动/重复执行测量、最终 ZIP 和 Mac 同候选一体化测试。不可宣布完整 R15.5 或专家 ≥95/100。

## 10. 后续候选最终 CI（2026-10-11）

**实际代码候选**：`d187b0e33d5d9caf7b9d48d595fa029a7dd5d434`，此前 SW 320 KiB 测试合同错配已修复。

- [R15 全部库资格 CI #38109016458](https://github.com/shopable-ai/opendesk-browser/actions/runs/38109016458)：**PASS**，覆盖 npm ci、libs:check、定向 builtin、check、production/development WXT、verify、完整 npm test、pack/pack:dev；原始诊断 Artifact ID `11690462835`。
- [双模式独立入口与真实资源预算 #38109016505](https://github.com/shopable-ai/opendesk-browser/actions/runs/38109016505)：**PASS**，Artifact ID `11691521391`。
- [同 production WXT 包的 macOS Chrome 155 原生 #38109016427](https://github.com/shopable-ai/opendesk-browser/actions/runs/38109016427)：**PASS**，Artifact ID `11690681446`，包含 `docs/framework/evidence/r154-production-native/acceptance.json`。
- 该候选最终 production `packageHash=5895836107d61b2d70f701d5f0b9dabb6763ac6a6a4ee2f2b4a674fc6cdf70ae`，ZIP **415,707 B**、`SHA256=b0453fb3aa65f4d7ffc15defb4fcbfa41c28e00d1d20b6edbdb5a0875bb5c68e`；生产 SW **320,027 B**（比 327,680 B 限额少 **7,653 B**）。各内置库单文件字节数与上节一致。

**仍不代表 R15.5 所有承诺都已关闭**：正式 WXT 同包的 opt-in jQuery DOM/M AIN 全局哨兵、独立 manifest 行比对、已安装程序的真实权限撤销/离线/版本不匹配负向、历史 15 个库逐项消费者、冷/热性能与用户自己的 Mac 全生命周期验收尚缺专项实测证据。不能因此宣称专家评分 ≥95。

## 11. R15.5 同包 jQuery USER_SCRIPT 原生成功证据（2026-10-11）

- 已提交浏览器驱动和 CI 开关：`9f594e39713295d6dabb465f910b1d8f245f7a76`。
- [R15.4 / R15.5 同包 WXT production macOS Chrome 155 测试 #38110109697](https://github.com/shopable-ai/opendesk-browser/actions/runs/38110109697) **PASS**；Artifact ID `11690977675`，原生原始回执 `docs/framework/evidence/r154-production-native/acceptance.json`。在**完全相同的生产扩展包**内，通过可信 Side Panel 输入触发两个 Page 预览。
- 默认不声明的 USER_SCRIPT 执行 `typeof jQuery === 'undefined'` 和 `typeof $ === 'undefined'` 检查，通过；真实页面 DOM 的 `data-r155-jquery-default` 写入为 `absent`。显式 `// @opendesk-lib jquery` 后，`$('#fixture-ready')` 实际命中 **1** 个节点，jQuery 返回 `3.7.1`，DOM `data-r155-jquery-opt-in` 实际更新为 `3.7.1`。
- 同一真实网页 MAIN 中的 `$ / jQuery / _ / dayjs / OpenDeskLibs` 属性描述符，在两次 USER_SCRIPT 执行前后均保持 `{present:false}`；**0 次额外权限请求**，已安装程序 grant 与 durable execution receipts 未变。
- 本生产包 `packageHash=8ba0c382513f2485e0c89c4ca84755bfe3a99305217c88e5c38908a34f3d8e3c`；ZIP 415710 B，SHA-256 `1cc172f3843cf3c9955ccce3f097284c318cde74badefc3a400f012cb4d3c031`。实测 `sw.js=320027 B`，距 327680 B 硬限制仍有 7653 B；独立文件 `lodash=12832 B`、`dayjs=7546 B`、`my-utils=291 B`、`jQuery=87533 B`、Controller Worker `37121 B`、Page CORE `5165 B`、manifest `2020 B`。这些数据仅适用于此 candidate。
- 后续提交 `56b40a1e3bea07fb44ffc992daf8b5baafa591bd` 追加了所有固定 vendor manifest 行的身份预校验及 SHA、字节篡改负向测试，不能自动继承前述 9f594e 的构建包 / 浏览器原生回执。必须查看该新提交的 R15 资格和 Chrome CI。
- **仍未完成：** 用户本机 Mac 实际 ZIP 安装/撤权/离线、完整重启负向矩阵，Controller 和 USER_SCRIPT 本地冷/热启动计时，CryptoJS/PSL 等旧库快照的准确版本与全部旧消费者溯源。

### 历史快照版本核实边界

历史目录 `docs/contracts/source-snapshots/scrapyJsChrome/assets/js/libs/` 的文件在本轮逐个读取并检索头注释、固定 CDN 路径或 bundle 内置版本常量。可直接确认：Axios **0.21.1**、jQuery **3.2.1**、Moment **2.18.1**、Lodash **4.17.21**、FingerprintJS **3.4.2**、js-cookie **3.0.5**、Vue **3.3.4**、Quasar **2.12.7**、query-string **1.0.1**、Socket.IO **4.0.0**、store.js **2.0.12**。Cheerio 1.0.0 与 CSS Selector Generator 3.6.4 仅据历史文件名/CDN 路径标识，未独立验证 package metadata；CryptoJS、PSL 无可信版本字段，不编造版本号。特别注意 PSL 旧 bundle 中存在 `punycode.version=1.4.1`，**不能把它当作 PSL 自身版本**。

这些版本仅说明历史代码来源，不是已经恢复或与新版 API 兼容的证明。Vue、Quasar、Cheerio 等不应该因为旧文件数量而被无条件复制到 `src/libs` 或 SW。
