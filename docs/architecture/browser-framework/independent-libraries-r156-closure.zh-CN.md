# R15.6 历史第三方 JS 消费者与 src/libs 完整性闭环（滚动证据）
日期：2026-10-11。**本轮为审计、诊断和负向测试，不创建第三套库管理器，不宣称原生 Chrome 验收。**

## 已有实现与历史来源
- 正式运行时库唯一登记位于 `src/libs/{runtime-contract,catalog,loader,core}.js`。Lodash、Day.js、my-utils 为审计版默认库；jQuery 3.7.1 是仅 USER_SCRIPT opt-in 的受 SHA 与许可证固定资源。用户 ESM/npm 多文件项目由独立构建器处理，不将其依赖注入 SW。
- 已有 `f2ef1d5f70ed` 完成 `src/runtime/builtin-libraries/` 五文件迁移，identity 到 `src/libs/identity.js`，不得恢复兼容转发。
- 旧 `docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js` 中 `BACKGROUND_SCRIPTS` 有 17 项，前 6 项为 JS 库，其他 11 项是 core、插件、站点业务或旧背景包。旧 `manifest.json` 将 Moment/Axios/jQuery 放入 Content ISOLATED，旧 `my-content-script.js:814-833` 将 Lodash、Moment、Axios、js-cookie、CryptoJS、FingerprintJS 和 CSS Selector Generator 放入 MAIN。这些世界彼此隔离。
- 旧 `todo-src-bex/src-bex/TimeReview.ts:2-5,61,78-82,165-206,292` 的 axios.defaults、Moment duration/endOf、query-string 用法不等于新版 axiosx/Day.js/URLSearchParams；`background.ts:502-506` 的 Socket.IO 连接和 `UtilDevice.ts:103` 的指纹采集不应自动迁回。
- 来源账本是 `historical-library-decisions-r156.json`：版本、旧消费者、旧 API、执行世界、替代语义、产物、许可、加载模式、源码坐标与证据级别逐项列明。该 JSON **不是**运行时第二登记表。

## 15 项审计决定
| 库 | 旧版本 | 决定 | 旧世界 | 当前世界／替代产物 |
|---|---|---|---|---|
| axios | 0.21.1 | 部分兼容（不等价） | BACKGROUND, ISOLATED, MAIN | MAIN SDK (axiosx only) |
| cheerio | 1.0.0（文件名） | 已排除旧业务 | BACKGROUND | No equivalent runtime world attested |
| cryptojs | 未证实 | 未确认 | MAIN | No equivalent runtime world attested |
| cssSelectorGenerator | 3.6.4（文件名） | 部分兼容（不等价） | MAIN | No equivalent runtime world attested |
| fingerprintjs | 3.4.2 | 已排除旧业务 | BACKGROUND, MAIN | No equivalent runtime world attested |
| jquery | 3.2.1 | 部分兼容（不等价） | ISOLATED | USER_SCRIPT；libs/vendor/jquery/3.7.1/jquery.min.js |
| jsCookie | 3.0.5 | 部分兼容（不等价） | MAIN | No equivalent runtime world attested |
| lodash | 4.17.21 | 部分兼容（不等价） | BACKGROUND, MAIN | CONTROLLER + USER_SCRIPT；libs/packages/lodash.js |
| moment | 2.18.1 | 部分兼容（不等价） | BACKGROUND, ISOLATED, MAIN | CONTROLLER + USER_SCRIPT (Day.js only)；libs/packages/dayjs.js |
| psl | 未证实 | 未确认 | 仍需追踪 | No equivalent runtime world attested |
| quasar | 2.12.7 | 未确认 | 仍需追踪 | No equivalent runtime world attested |
| queryString | 1.0.1（旧 CDN 路径） | 部分兼容（不等价） | BACKGROUND | No equivalent runtime world attested |
| socketIo | 4.0.0 | 已排除旧业务 | 仍需追踪 | No equivalent runtime world attested |
| store | 2.0.12 | 部分兼容（不等价） | 仍需追踪 | No equivalent runtime world attested |
| vue | 3.3.4 | 未确认 | 仍需追踪 | No equivalent runtime world attested |

**部分兼容**只说明现行有相关职责，绝不承诺旧 API/行为、版本和 JS world 完全一致；**排除旧业务**指旧采集、指纹追踪、旧远端命令链按现行产品范围不恢复，若出现保留的合法消费者则重新审查；**未确认**没有预装不自动构成缺陷。当前没有库被标成 FULLY_MIGRATED。

## 单一诊断与开发者流程
- `scripts/libs-history-audit.mjs` 为 `libs:doctor` 的只读输入：逐个校验 15 个历史源的实际 bytes/SHA，旧 17 项清单及 Background/ISOLATED/MAIN 的 `file:line:column`，15 行决策完整性。未知历史资源、坏目录、漏项、危险 symlink 和活跃源码引用废弃路径会报 SOURCE_FAIL。
- 当前活跃 `src/`、`scripts/` 中的名称/API 检索仅是 `LEXICAL_HINT_ONLY` / `API_REVIEW_ONLY`，不当作真实运行消费者，`_.map` 与 `dayjs.extend` 之类超出白名单的调用需人工复核；未迁移的历史库不直接判严格诊断失败。
- 沿用现有 `libs:check` vendor SHA/许可证、npm 精确锁、`libs/manifest.json` 与源输出对账；追加锁根 dependencies、resolved HTTPS、SHA-512、许可证和运行世界校验。不增加 SW 字节，生产 sw.js 硬限制始终为 327680 B。
- 新增依赖只有在合法现行消费者、世界、精确版本、许可和测试证据齐备时，才决定放到 `src/libs/packages` 的 WXT 独立入口，或 `src/libs/vendor` 的单字节 SHA 固定资源；禁止 CDN 运行时执行及扩大权限。

## 新候选验收（严格区分 SOURCE/PACKAGE/RUNTIME/NATIVE）
```sh
git status --short --branch
git rev-parse HEAD
git fetch origin main && git rev-parse origin/main
npm ci --ignore-scripts
npm run libs:list && npm run libs:check
node --test tests/environment/libs-history-r156.test.mjs tests/environment/libs-doctor-r155.test.mjs
npm run check && npm run build && npm run build:dev
npm run libs:doctor -- --strict && npm run verify
npm test && npm run build:size
npm run pack && npm run pack:dev
```
同一候选需保存 WXT dist 的 packageHash、ZIP SHA、SW 实际 bytes/余量、Controller 与 Page 本地调用、jQuery opt-in/MAIN 隔离、损坏文件/哈希/版本/世界负向案例；Mac CFT 还需真实安装、撤权、离线、更新、SW/Chrome 重启、P50/P95 性能原始回执。不能用历史候选的 Chrome 或 CI 结果冒充新候选。

本次网页侧不能操作用户 Mac 真实工作区/Chrome Profile，因而 `npm ci`、Mac 原生和本地 WXT 构建未在此环境运行；需查看新 SHA 的 GitHub Actions 及本地 Codex 验收。历史 R15.5 `31fe532...` 候选生产 SW 曾为 320180 B、余 7500 B，但不是新候选实测。**NATIVE_UNVERIFIED，验收未整体关闭。**

## 2026-10-11 同包 GitHub Actions 验收证据（保留失败）

> 被测试的代码/构建输入提交：`db8772258a3e1f3667571d6b5fa0982fdb8e5a76`。后续本节文档自身更新不改变构建输入，不把文档提交 SHA 伪称为新 WXT 构建候选。

### 真实 Ubuntu 构建和双 ZIP

- [R15 库资格 CI #38118092757](https://github.com/shopable-ai/opendesk-browser/actions/runs/38118092757)：`npm ci --ignore-scripts`、`libs:check`、R15.6+R15.5 定向测试 **11/11 PASS**、builtin 定向测试 **69/69 PASS**、`npm run check`、`build`、`build:dev`、`libs:doctor -- --strict`、`verify`、`pack`、`pack:dev` 均 **PASS**。先完成双 ZIP 再运行通用测试，以保留独立的包身份。诊断原始 Artifact ID `11694101833`。
- 实际 production `sw.js=320278 B`，硬限 `327680 B`，余量 `7402 B`，未放宽限制；本次生产 `packageHash=491fa356acb7956dfdd32da29bd84fdefab5f07d7c42b45c474ae625222f0358`。生产 ZIP **441331 B**，SHA-256 `707c3af28b5bd7003b89026b44a48026a1d25ce3911757974e9b82ab67832b5e`。
- 实际 development `packageHash=fcb1f8c824b4cd55e2aab30e5ee55590a74e888eb1dec449f93e804de14dade3`。开发 ZIP **1429437 B**，SHA-256 `5d4f210c40531e48739251ed0fbbe28caf758cab217312c0aa88106837322411`。
- **不能声称完整 CI PASS：** 实际 `npm test` **986 tests / 978 pass / 1 fail / 7 skipped**。唯一失败 `tests/environment/basic-browser-page.test.mjs:291`（“examples/tasks must not accumulate duplicate manual browser pages”），主干别的任务增加 `examples/tasks/reading-toc-article.html` 和 `reading-toc-conversation.html`，与旧契约 `demo-form.html` 唯一性冲突。也使若干不相关的定向 workflow 失败。这不是库哈希、World 或 WXT 构建故障；本工作流不擅自删除 TOC 负责人的示例，需该负责人调整 fixture 放置或明确升级测试合同后复测。**该失败保留为 FAIL，不计入 PASS。**

### macOS Chrome for Testing 同一生产包的原生回执

[真实 Mac Chrome CI #38118092780](https://github.com/shopable-ai/opendesk-browser/actions/runs/38118092780)：macOS-15 Runner、独立复制的 **Google Chrome for Testing 155.0.8059.39**、同一个 `production packageHash=491fa356acb7956dfdd32da29bd84fdefab5f07d7c42b45c474ae625222f0358`、同一个生产 ZIP。已保存 Artifact **11694726762**，含 `docs/framework/evidence/r154-production-native/acceptance.json`、`libs-doctor-r156.json` 和 ZIP。

`install-once-permissions-native.mjs` **5/5 原生场景 PASS**：

1. `real-plain-JS-save-verify-install-and-independent-program-identities`；
2. `20-installed-auto-runs-zero-permissions-request`；
3. `real-wxt-production-jquery-optin-isolated-from-main`；
4. `real-worker-restart-restores-installations-without-replay`；
5. `real-complete-browser-restart-same-profile-persistent-grant-reuse`。

**边界：** 上述是 GitHub macOS CI 的实际 Chrome 回执，不是用户个人 Mac 的本地 profile 验收。它验证受支持生产包中的 User Script/jQuery、20 文档和重启，但**不证明**历史十五库 API 完全兼容、独立用户 Mac 安装、特定撤权/恢复、离线损坏资源、旧 ABI 跨版本升级、Controller 真实完整用户旅程或本地冷热 P50/P95。保持这些为 `NATIVE_UNVERIFIED`，不要把 5 项 PASS 自动提升成全部产品验收。

### 下一步阻断项

1. TOC 示例 owner 修复 `basic-browser-page.test.mjs:291` 目录契约后，在**更新后的同一源码候选**复测完整 `npm test` 和相关 workflow。
2. 用户本地 Codex 在安全独占的 Mac Chrome Profile 中补测：Controller/USER_SCRIPT 完整执行与锁/哈希/撤权/离线/版本失败路径、安装/重启/升级和 P50/P95（记录原始样本、源 hash、包 ZIP hash 和 Chrome 版本）。
3. 对已保留合法消费者若有超出 Lodash 8 API、Moment/Day.js、Axios/axiosx 或其他历史差异，先形成真实失败复现和 world/权限最小修复；不要仅凭遗留文件数量恢复全量旧库。
