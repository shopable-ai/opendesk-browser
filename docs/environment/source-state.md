# 02A 独立来源新鲜度审计

采集窗口（UTC）：`2026-10-01T21:04:55.495560+00:00` 至 `2026-10-01T21:04:56.239401+00:00`。唯一产品：`/Users/shopme/Documents/workspace/opendesk-browser`。
本报告只读核验来源、contract 和捕获证据，仅创建两个 source-state 文件；不迁入旧 SDK/业务 bundle，不执行浏览器或产品测试。

固定 baseline/overlay 各 442 路径；delta 覆盖 23 路径，全部证据字节与台账一致。
baseline→live：408 一致、34 modified、0 missing。
overlay→live：415 一致、27 modified、0 missing。
另发现 98 个范围内未捕获 live 路径，标记 `new capture generation`（需未来审阅捕获，未加入 accepted overlay）。

| 来源 | baseline/overlay 路径 | delta 路径 | overlay modified/missing | 新路径待捕获 | HEAD 与 baseline | dirty（tracked/untracked） |
|---|---:|---:|---:|---:|---|---|
| scrapyJsChrome | 265 | 12 | 13/0 | 86 | 一致 | 13/66 |
| scrapyJs | 105 | 11 | 13/0 | 12 | 一致 | 39/162 |
| todo-src-bex | 72 | 0 | 1/0 | 0 | 一致 | 122/165 |

## 固定哈希与采集含义

- accepted sourceHash（ledger 文件字节）：`6188ff9cadd06b44a19d08982a3dadc5596cd6303140c8eba0fdd25996e89f29`。不是 live checkout 哈希。
- baseline scope：`a4fce237adf0293f5171c166a74884a79986cdd13f52735dd047087075d3a6d0`。
- overlay scope：`bbe36df21b4c5a764a5871a2131c1f7673c9543d853cd0e43ab033c920110eef`。
- 本次 live captured scope：`d96caa7670205772af4006cdf407124f5ad82a54fee79a01f948dd7d5e0ef16a`。
- accepted contractHash：`1486ff9c442807c0d447e542252830731faeede5f81cd685c5f146daecdba2a1`（继承 handoff；本任务不重新定义合同哈希）。
- baseline：`2026-10-01T18:29:13.482003+00:00`；delta：`2026-10-01T19:06:04.379902+00:00`。overlay 是两个历史捕获代的明确组合。
- scope 哈希沿用⑤原规则：按 ledger 顺序序列化 `{repo,file,sha256}` 数组，UTF-8、`ensure_ascii=False, indent=2`，结尾换行，再 SHA-256。
- 每个路径的完整 baseline/overlay/live/第二次 live 哈希、绝对捕获路径和采集时间见同目录 source-state.json 的 `capturedPaths`；所有新路径见 `sources[].newLivePaths`。
- 双次文件读取、前后 HEAD/status/inventory 均一致；这是非原子采样，只能证明观察窗口的采样一致，不能排除瞬时或后续编辑。

## 来源 HEAD、scope 与 exclusions

### scrapyJsChrome

根：`/Users/shopme/Documents/workspace/scrapyJsChrome`。
HEAD：`9d55e4b615db3ef044094f3e8c3f1015a795dd83`；分支：`main`；dirty：`True`。
scope：`.`。
exclusions：`.git`、`node_modules`、`.omx`、`.agents`、`temp`、`todo`、`.cache`、`.DS_Store`、`coverage`、`.env*`、`symlinks`。
git dirty 观察整个仓库；内容哈希只覆盖上述 scope。排除目录名/`.env*`/符号链接，不跟随链接；未被排除的 ignored 范围内文件也纳入新路径扫描。

### scrapyJs

根：`/Users/shopme/Documents/workspace/scrapyJs`。
HEAD：`5bebc68832fe1bd6b4466de53a824dfae5fdaf5e`；分支：`master`；dirty：`True`。
scope：`src`、`test`、`scripts`、`project`、`package.json`、`package-lock.json`、`README.md`、`webpack.config.js`、`gulpfile.js`、`vitest.config.js`。
exclusions：`.git`、`node_modules`、`.omx`、`.agents`、`temp`、`todo`、`.cache`、`.DS_Store`、`coverage`、`.env*`、`symlinks`。
git dirty 观察整个仓库；内容哈希只覆盖上述 scope。排除目录名/`.env*`/符号链接，不跟随链接；未被排除的 ignored 范围内文件也纳入新路径扫描。

### todo-src-bex

根：`/Users/shopme/Documents/workspace/todo-user-vue`。
HEAD：`3f8a10613df4d87cb7a76f6bb71fcac5fcd17d20`；分支：`dev-quasar`；dirty：`True`。
scope：`src-bex`、`LICENSE`、`package.json`、`AGENTS.md`。
exclusions：`.git`、`node_modules`、`.omx`、`.agents`、`temp`、`todo`、`.cache`、`.DS_Store`、`coverage`、`.env*`、`symlinks`。
git dirty 观察整个仓库；内容哈希只覆盖上述 scope。排除目录名/`.env*`/符号链接，不跟随链接；未被排除的 ignored 范围内文件也纳入新路径扫描。

## 旧 25 项差异的本次情况

旧审计时间：`2026-10-01T20:09:49.255028+00:00`；完整名单绑定 source-manifest.json 的已核 SHA-256：`6f88a3a928a1779fff78aa9f093db2ee4d14fdfb86d8b3e784b4ee646b410bb0`。
本次分类：`{"still-modified": 25}`；其中 8 项 live hash 又发生变化。旧名单以外新增 captured-path 差异 2 项。

| 来源/路径 | 当前分类 | 自旧审计后 live 又变 |
|---|---|---|
| `scrapyJsChrome/README.md` | still-modified | 否 |
| `scrapyJsChrome/assets/js/plugins/ChromePage.js` | still-modified | 是 |
| `scrapyJsChrome/assets/js/plugins/scrapyJs.js` | still-modified | 是 |
| `scrapyJsChrome/assets/js/plugins/scrapyJs.source.json` | still-modified | 是 |
| `scrapyJsChrome/background-sw.js` | still-modified | 否 |
| `scrapyJsChrome/background.js` | still-modified | 是 |
| `scrapyJsChrome/scripts/extension-check.cjs` | still-modified | 否 |
| `scrapyJsChrome/test/devflow-contract.cjs` | still-modified | 否 |
| `scrapyJsChrome/test/protocol-regression.js` | still-modified | 否 |
| `scrapyJsChrome/www/popup_crawl.css` | still-modified | 否 |
| `scrapyJsChrome/www/popup_crawl.html` | still-modified | 是 |
| `scrapyJsChrome/www/popup_crawl.js` | still-modified | 是 |
| `scrapyJs/README.md` | still-modified | 否 |
| `scrapyJs/package-lock.json` | still-modified | 否 |
| `scrapyJs/package.json` | still-modified | 否 |
| `scrapyJs/scripts/sdk-sync.cjs` | still-modified | 否 |
| `scrapyJs/src/core/ChromeSpider.js` | still-modified | 否 |
| `scrapyJs/src/core/Scrapy.js` | still-modified | 是 |
| `scrapyJs/src/exporter/ExportManager.js` | still-modified | 否 |
| `scrapyJs/src/exporter/FeedExport.js` | still-modified | 是 |
| `scrapyJs/src/index.js` | still-modified | 否 |
| `scrapyJs/test/devflow-sync.test.cjs` | still-modified | 否 |
| `scrapyJs/test/export-manager-extra.spec.js` | still-modified | 否 |
| `scrapyJs/test/spider-boundaries.spec.js` | still-modified | 否 |
| `todo-src-bex/package.json` | still-modified | 否 |

## 捕获代变化与新增路径

`new capture generation` 分为两个轴：23 个 delta 路径已是冻结的显式覆盖代；未捕获 live 新路径仅要求未来新捕获，不能被误认为已经 accepted。baseline→live 与 overlay→live 分开分类，避免把已批准的 delta 当成当前 live 改动。

| 显式 delta 覆盖路径 | 当前对 overlay |
|---|---|
| `scrapyJsChrome/assets/js/ai/selector-contract.js` | matches |
| `scrapyJsChrome/assets/js/plugins/ChromePage.js` | modified |
| `scrapyJsChrome/assets/js/plugins/scrapyJs.js` | modified |
| `scrapyJsChrome/assets/js/plugins/scrapyJs.source.json` | modified |
| `scrapyJsChrome/background-sw.js` | modified |
| `scrapyJsChrome/background.js` | modified |
| `scrapyJsChrome/scripts/extension-check.cjs` | modified |
| `scrapyJsChrome/test/devflow-contract.cjs` | modified |
| `scrapyJsChrome/test/protocol-regression.js` | modified |
| `scrapyJsChrome/www/popup_crawl.css` | modified |
| `scrapyJsChrome/www/popup_crawl.html` | modified |
| `scrapyJsChrome/www/popup_crawl.js` | modified |
| `scrapyJs/scripts/browser-smoke.cjs` | matches |
| `scrapyJs/scripts/consumer-smoke.cjs` | matches |
| `scrapyJs/scripts/sdk-sync.cjs` | modified |
| `scrapyJs/src/core/CloseSpider.js` | matches |
| `scrapyJs/src/core/RunFailure.js` | matches |
| `scrapyJs/src/core/Scheduler.js` | modified |
| `scrapyJs/src/core/Scrapy.js` | modified |
| `scrapyJs/src/exporter/FeedExport.js` | modified |
| `scrapyJs/src/item/ItemLoader.js` | matches |
| `scrapyJs/test/devflow-sync.test.cjs` | modified |
| `scrapyJs/webpack.config.js` | matches |

新增 live 路径（全部未捕获；确定哈希见 JSON）：

- `scrapyJsChrome/.sdk-backups/1790879403130-c23cdf2e-da04-4648-9f6f-36bb29ebb21c/before-0`
- `scrapyJsChrome/.sdk-backups/1790879403130-c23cdf2e-da04-4648-9f6f-36bb29ebb21c/before-1`
- `scrapyJsChrome/.sdk-backups/1790879403130-c23cdf2e-da04-4648-9f6f-36bb29ebb21c/transaction.json`
- `scrapyJsChrome/.sdk-backups/1790881957279-b8e2a72b-41a0-4eef-bf8d-d353c57ba7f2/before-0`
- `scrapyJsChrome/.sdk-backups/1790881957279-b8e2a72b-41a0-4eef-bf8d-d353c57ba7f2/before-1`
- `scrapyJsChrome/.sdk-backups/1790881957279-b8e2a72b-41a0-4eef-bf8d-d353c57ba7f2/transaction.json`
- `scrapyJsChrome/.sdk-backups/1790882286692-e047f7f6-e610-4e47-8d67-a7263406d0df/before-0`
- `scrapyJsChrome/.sdk-backups/1790882286692-e047f7f6-e610-4e47-8d67-a7263406d0df/before-1`
- `scrapyJsChrome/.sdk-backups/1790882286692-e047f7f6-e610-4e47-8d67-a7263406d0df/transaction.json`
- `scrapyJsChrome/.sdk-backups/1790884004367-939089d6-bb85-44e7-a48d-dceda0d4229d/before-0`
- `scrapyJsChrome/.sdk-backups/1790884004367-939089d6-bb85-44e7-a48d-dceda0d4229d/before-1`
- `scrapyJsChrome/.sdk-backups/1790884004367-939089d6-bb85-44e7-a48d-dceda0d4229d/transaction.json`
- `scrapyJsChrome/.sdk-backups/1790885562347-ee5ea0df-35bf-4db7-a872-120c3d7b50fb/before-0`
- `scrapyJsChrome/.sdk-backups/1790885562347-ee5ea0df-35bf-4db7-a872-120c3d7b50fb/before-1`
- `scrapyJsChrome/.sdk-backups/1790885562347-ee5ea0df-35bf-4db7-a872-120c3d7b50fb/transaction.json`
- `scrapyJsChrome/.sdk-backups/1790886856962-d8763848-49d9-45b9-a098-9cce970866ea/before-0`
- `scrapyJsChrome/.sdk-backups/1790886856962-d8763848-49d9-45b9-a098-9cce970866ea/before-1`
- `scrapyJsChrome/.sdk-backups/1790886856962-d8763848-49d9-45b9-a098-9cce970866ea/transaction.json`
- `scrapyJsChrome/ai-service/README.md`
- `scrapyJsChrome/ai-service/config.cjs`
- `scrapyJsChrome/ai-service/demo.cjs`
- `scrapyJsChrome/ai-service/doctor.cjs`
- `scrapyJsChrome/ai-service/fixtures/products.request.json`
- `scrapyJsChrome/ai-service/proposals.cjs`
- `scrapyJsChrome/ai-service/server.cjs`
- `scrapyJsChrome/assets/js/ai/crawl-profile.js`
- `scrapyJsChrome/assets/js/ai/dom-agent.js`
- `scrapyJsChrome/assets/js/ai/run-journal.js`
- `scrapyJsChrome/assets/js/ai/service-client.js`
- `scrapyJsChrome/docs/AI_PHASE2.md`
- `scrapyJsChrome/docs/AI_PHASE2_BENCHMARK.md`
- `scrapyJsChrome/docs/AI_SELECTOR_ASSIST.md`
- `scrapyJsChrome/scripts/ai-phase2-benchmark.cjs`
- `scrapyJsChrome/scripts/ai-phase2-check.cjs`
- `scrapyJsChrome/test/ai-assist-ui.test.cjs`
- `scrapyJsChrome/test/ai-browser-harness.js`
- `scrapyJsChrome/test/ai-browser.cjs`
- `scrapyJsChrome/test/ai-completion-browser.cjs`
- `scrapyJsChrome/test/ai-credential-binding.test.cjs`
- `scrapyJsChrome/test/ai-demo.test.cjs`
- `scrapyJsChrome/test/ai-full-extension.cjs`
- `scrapyJsChrome/test/ai-phase2-benchmark.test.cjs`
- `scrapyJsChrome/test/ai-phase2-cdp.cjs`
- `scrapyJsChrome/test/ai-phase2-extension.cjs`
- `scrapyJsChrome/test/ai-phase2-journal.test.cjs`
- `scrapyJsChrome/test/ai-phase2-runtime.test.cjs`
- `scrapyJsChrome/test/ai-phase2-ui.test.cjs`
- `scrapyJsChrome/test/ai-profile.test.cjs`
- `scrapyJsChrome/test/ai-selector-contract.test.cjs`
- `scrapyJsChrome/test/ai-service.test.cjs`
- `scrapyJsChrome/test/ai-storage-boundary.test.cjs`
- `scrapyJsChrome/test/devflow-extension-pack.test.cjs`
- `scrapyJsChrome/test/fixtures/ai-phase2/.gitignore`
- `scrapyJsChrome/test/fixtures/ai-phase2/article-01.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/article-02.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/article-03.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/article-04.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/article-05.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/browser-harness.js`
- `scrapyJsChrome/test/fixtures/ai-phase2/card-01.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/card-02.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/card-03.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/card-04.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/card-05.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/expected.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/fixture-hash.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/results/browser-fixed.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/results/browser-fixed.stdout.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/results/browser-mock.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/results/browser-mock.stdout.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/results/offline.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/results/offline.stdout.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/results/service-mocked-browser.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/results/service-preflight-unconfigured.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/table-01.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/table-02.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/table-03.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/table-04.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/table-05.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/tasks.json`
- `scrapyJsChrome/test/fixtures/ai-phase2/ul-01.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/ul-02.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/ul-03.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/ul-04.html`
- `scrapyJsChrome/test/fixtures/ai-phase2/ul-05.html`
- `scrapyJsChrome/www/ai-selector-assist.js`
- `scrapyJs/src/ai/ConfigExecutor.js`
- `scrapyJs/src/ai/Provider.js`
- `scrapyJs/src/ai/TaskSpec.js`
- `scrapyJs/src/ai/Workflow.js`
- `scrapyJs/src/ai/index.js`
- `scrapyJs/test/ai-config/browser-boundary.spec.js`
- `scrapyJs/test/ai-config/config-executor.spec.js`
- `scrapyJs/test/ai-config/task-generation.spec.js`
- `scrapyJs/test/ai-config/workflow.spec.js`
- `scrapyJs/test/core-adversarial.spec.js`
- `scrapyJs/test/core-review-regressions.spec.js`
- `scrapyJs/test/item-loader-explicit.spec.js`

## SDK 代际边界

| 观察代 | SDK 与 receipt 自身一致 | receipt input-map 自洽 | core 输入 hash 不同数 |
|---|---|---|---:|
| baseline | True | True | 5/27 |
| overlay | True | True | 7/27 |
| live | True | True | 0/32 |

SDK/receipt 自洽不证明对应 core 源码同代、运行等价、签名来源或分发权。固定和 live provenance 的 SDK/receipt/input-map 全哈希及不同输入明细见 JSON；本任务不构建或同步 SDK。

## 02A 与 EXT-R01 边界

02A 仅创建独立工程、build/package/lock/manifest、singleton 窗口壳、固定经典注入槽/模块占位与目标健康探针。空业务槽继续 MODULE_NOT_INSTALLED；本审计不实现或证明这些行为。
EXT-R01 的 adapt 是参考窗口行为意图：toolbar 打开 800×600 工具窗口、复用并 focus 单例、移除后可重建、显式来源标识。它不等于复制 background.js、旧 SDK、业务 bundle 或旧任务 owner/runtime；contract 与来源证据保持只读。
RunHost/PagePort 生产能力、journal/stop/recovery、IDB stage/seal、downloads/Artifact/Entitlement 和 scraping domain 均排除在 02A 实现范围之外。

## 02B 接手前须核验

- Rerun freshness after receiving the real docs/environment/handoff.json and before source adoption; current hashes expire as evidence of live state when sources change.
- Adopt/reject each baseline/overlay/live delta using exact source hash, changed behavior, fixture and impact evidence in docs/migration/migration-ledger.json; current modified/new paths remain unapproved.
- Keep installed SDK, receipt input-map and captured/live core generations separate; internal SDK/receipt consistency cannot prove matching core inputs. Never perform implicit sdk-sync or copy old bundles.
- EXT-R01 shell intent ends at window lifecycle; authenticated RunHost registration, lifecycle and root/common ownership pass serially to 02B after environment handoff.
- Replace legacy ChromePage/global callbacks, MAIN/dynamic function fallbacks and SW full task Promise with accepted fixed-agent/PagePort, target binding/fencing, sole RunHost, short journal/stop/recovery and sole IDB contracts.
- Stage/seal, Artifact/attempt/download receipts, late outcomes and Entitlement require 02B implementation and fresh verification; none are established by this audit.
- Scraping domain, selector/UI migration, TemplateCompiler, pagination, runner and formatter remain 03 scope, using 02B public interfaces.
- Missing legacy AI service/controller and new AI, desktop/account/Android/HID/Capacitor files are evidence or exclusions, never automatic runtime dependencies.
- Recheck source notices and distribution boundaries before redistribution: extension root license unresolved, core ISC declaration/full text and SDK/vendor rights unresolved, todo MIT notice preserved.

## 核验与限制

已核 442 个 baseline 和 23 个 delta 捕获证据；输入台账、reuse 与前序 handoff hash 一致，⑤ scope hash 已独立重算，旧 25 项已逐项对比。
docs/contracts 共 504 个普通文件的前后清单 hash 一致：`704ab0e0d769f44f2c07717f0da0587596684520a14ca0049d9323715777c428`；⑤外部 handoff/manifest 保持原字节。
本任务产品测试执行数 0；productImplementationPassed=false，productAcceptance=not-run。来源新鲜度审计成功不代表环境 build/探针或完整产品通过。
未执行 stash/reset/clean/sync/fetch/commit，也没有改写任何来源、root/config/src/contracts 或其他作者文件。

后续独立复核（UTC `2026-10-01T21:08:52.446975+00:00`）：442 baseline + 23 delta 证据、540 个 live 哈希、25 项旧名单、98 个新增路径及范围内 inventory/HEAD 均仍一致。todo-user-vue 的 `src-capacitor/android/.kotlin/sessions/*.salive` 临时会话文件名在采集后变化，位于 `src-bex/LICENSE/package.json/AGENTS.md` 捕获 scope 之外；whole-repository status 原文因此不再完全相同，dirty 标记和条数不变。变化明细保存在 JSON 的 `postAuditVerification`，不改写原采集窗口，也不声明来源冻结。
