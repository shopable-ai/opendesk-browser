# R2.1 Reading TOC · 最终交付与验证

独立 owner 完成时的观察记录；仅 main、未新建分支。最终集成、构建和提交状态以 [总交付记录](locale-packs-r21-delivery.md) 为准。保留其他 owner 的 Bridge、main.js、打包器、metadata/locale service、管理 UI 与共享预览改动。本 owner 的产物为 Reading TOC 配置、README、日语样例、可信 page/view、正式包/pin、三份同源预览、定向测试及本合同文档。

## 交付身份

- 唯一正式 JSON：`examples/sidebar-tools/reading-toc/reading-toc.opendesk-tool.json`，版本 **1.0.10**，35,044 UTF-8 字节。
- 包 SHA-256：`8d6bf170c92f3093de34f1401f49897d9734f740a0deef87076666a548cc39f0`。
- 官方 pin：`src/sidebar-tools/official-reading-toc.js` 已同步版本/摘要；真实官方准入 helper 在 Node 测试中验证通过。
- sourceCatalogHash：`3e5cb20769aff8d0038979c4e837171fb57c89bc44f7edb5f86611ece8739da9`。
- `languages/ja.opendesk-locale.json`：55 条原有业务 UI 文案，逐条 source、占位符与源 hash 匹配；没有宿主权限/安全授权译文。
- provenance：Node fixture 中匹配 pin 的记录准入通过；真实 Chrome 已安装 provenance 未读取/写入，**NOT_TESTED**。历史 release 与 source catalog 无需更改。
- 包已经唯一打包器 candidate → 定向测试 → `--promote-from` → `--check-project`；返回 `PROJECT_PACKAGE_PROMOTED` / `PROJECT_PACKAGE_MATCH`。本次只新增回归测试，不改变包输入，无需再晋升。

## 源码与安全边界

`localization` 是 v1/v2 可选只读 metadata；旧无 metadata 包 round-trip 保持原字节。源 hash 使用固定外层顺序、源键排序、无换行紧凑 JSON 的 UTF-8 SHA-256；同步结构校验不代替异步摘要验证。旧版不识别新增字段的宿主不能假定可安装。

作者资源输入最多 96,000 字节，12 语言 / 每语言 160 键 / 每文案 380 UTF-16 单元；正式包最多 320,000 UTF-8 字节，内嵌 catalog 与 metadata 均计入。未调整预算，保留纯文本、占位符、原型键、CSP、身份与撤权保护。

主 agent 的 main.js 优先读取只读 `OpenDeskTool.messages`，每次通知重新读取 catalog，保留内嵌兜底。可信 page 先经 `verifyOfficialReadingToc` 验证已安装包身份/版本/摘要/provenance，成功后才读同一 Host 受控 locale store，复用 `resolveToolLocaleState` / `toolLocaleStorageKey`。语言变化沿独立展示路径调用既有 view 的 `setLocale(next,catalog)`，不重新索引或挂载；异步 token 阻止生命周期结束后的旧结果应用。

可信 page/view 固定随 Browser 发布，JSON 升级不替换这些 Content Script。当前 Chrome 加载状态及实际功能均未核对。Page Program、Controller 等扩展类型以后接入。

## 验证证据

| 范围 | 命令/证据路径 | 结果 |
| --- | --- | --- |
| 包 metadata、语言包数据安全与服务 | `node --test tests/environment/sidebar-tool-localization-metadata-r2.test.mjs tests/environment/sidebar-tool-locale-packs-r21.test.mjs` | 上次实跑 19/19 PASS；本次输入未改，复用 |
| 包安全、候选晋升及隔离/Host 接入 | `node --test tests/environment/sidebar-tools.test.mjs` | 上次实跑 6/6 PASS；本次输入未改，复用 |
| controller 生命周期与 locale 安全 | `node --test tests/environment/reading-toc-lifecycle-r41.test.mjs` | 本次 20/20 PASS |
| 同语言译文替换、移除回退保留挂载/章节节点/scrollTop | `node --test --test-name-pattern='R2.1 dynamic' tests/environment/sidebar-tool-localization-r12.test.mjs` | 本次 1/1 PASS；此前完整 R12 7/7 PASS |
| 三份预览源绑定与可复现性 | `node --test tests/environment/reading-toc-localization-preview-r12.test.mjs` | 上次实跑 7/7 PASS；本次相关输入未改，复用 |
| 语法/差异 | `node --check tests/environment/reading-toc-lifecycle-r41.test.mjs` 与受影响路径 `git diff --check` | 本次 PASS |

新增 controller 回归最小纳入原 lifecycle 文件，复用 `pageFixture`，没有复制整份 artifact。它观察真实摘要完成后才访问 locale store；译文替换与移除不增加 heading 查询、不中断/替换 observer；修改 JS 字节而保留 provenance 时，真实摘要拒绝后不访问 pack。等待以实际摘要完成信号为界，不用固定延时推断拒绝。真实 view 的不重挂载由受维护 R12 行为测试单独覆盖，controller fixture 不伪装具有完整 DOM view。

## 同源预览

沿用唯一 `scripts/preview/build-preview.mjs` 的 `generatePreview`，仅刷新 `index.html`、`reading-toc-r12-interactive-preview.html`、`reading-toc-r12-overlay-preview.html`；场景 success、light、360×760 为既有生成参数，不代表尺寸专项验收。两处旧版本硬编码改为对照现场包版本，保留源码摘要与逐字节同源断言。历史 R17/R183 快照及其他工具未刷新。

三份 manifest 的 toolVersion 为 1.0.10，UI 源摘要 `970e56a399c6e5d044fa19d6f1953bfdef12983d685bd04fca57c0bd748dc8dd`，可信 overlay 源摘要 `2017ee5fd4f04662092c2a0ab92d6eb134f922ae23dab4ed48b4f7ebcedbc8f1`；这两种源摘要与正式 JSON SHA 分开使用。manifest 均为 `mock:true`、`installed:false`、`permissionsGranted:false`。

预览证据为 **PREVIEW_SOURCE_MATCH / NODE_PASS**；未执行本轮 Chromium 交互、真实 Mac Chrome 安装/升级或 production，均为 **NOT_TESTED**，不标 native PASS/95。

## 独立评分与完成状态

- **6．测试交付：93/100**。包与 pin 同源、三份预览 7/7，新增 controller 安全回归已进入受维护测试，view 状态保持有真实行为断言。扣分：本轮没有真实浏览器对动态语言包导入、切换、移除及安装升级的证据；尚未提供本次提交后的 CI 回执（评分形成时尚未提交，最终状态见总交付记录）。
- **7．增量去重：92/100**。复用唯一打包器、locale helper、原 controller fixture 与既有预览生成器；本次只重跑受影响 lifecycle 和 view 行为，不重复构建包、不扩其他工具。扣分：R12 的轻量 DOM fixture 仍与 placement 测试存在重复维护，后续若有实际需求可统一，不在本轮增加重构。

评分仅针对该范围的源码/测试交付与增量执行，不是 native 综合评分。当前范围 ready，资源 released；未启动 Browser build/watcher、Chrome/Profile 或额外服务。


## 最终预览冻结 · 交主集成

共享 app-localization 输入稳定后，仅重新生成三个 Reading TOC 同源 HTML；未修改测试、生成器、其他工具、正式包或 pin。`node --test tests/environment/reading-toc-localization-preview-r12.test.mjs`：**7/7 PASS**，包括当前源摘要与三个文件逐字节可复现。正式 JSON 生成前后原始字节比较不变，无需重建或晋升。

冻结摘要（SHA-256）：

- `preview/index.html`：`9b0ab822fbe1cd1c3514fb9037ede930a5d5adea81f52d0dae5a3e7a80871bea`。
- `preview/reading-toc-r12-interactive-preview.html`：`bce58f386bd173e9cf266f1c8c5e635d52060f6f2c39d34d5b0542ee77911dcd`。
- `preview/reading-toc-r12-overlay-preview.html`：`9b0ab822fbe1cd1c3514fb9037ede930a5d5adea81f52d0dae5a3e7a80871bea`。
- UI 源：`970e56a399c6e5d044fa19d6f1953bfdef12983d685bd04fca57c0bd748dc8dd`。
- 可信 overlay 源：`2017ee5fd4f04662092c2a0ab92d6eb134f922ae23dab4ed48b4f7ebcedbc8f1`。

状态：**FROZEN_FOR_MAIN_INTEGRATION / PREVIEW_SOURCE_MATCH / NODE_PASS**。本 owner 已完成并释放这些文件的写入权，后续由主 agent 集成；输入再次变化时由集成者核对相应证据。137/138 是主 agent 提供的前次集成结果，本 owner 仅实跑本次 preview 7 项，不冒称已重新跑完 138 项。Native 继续 NOT_TESTED；未 commit。

## 固定 production 来源 pin · 交主集成

主集成报告隔离 production build 在固定 page-relay 来源检查处阻断后，核对唯一 owner 为 `scripts/bundle-provenance.mjs` 的 `compiledReadingTocInputs` / `reviewedCompiledReadingToc`。仅同步已审 Reading TOC 两个实际源码的 Git blob SHA-1（不是普通 SHA-1 文件摘要，也不是工具包 SHA-256）：

- `trusted/page.js`：`4b95602c7f4bf2a41a7236b525c5555951702dfc`。
- `trusted/view.js`：`8a7d7d1b42871b6943c2794ea741359ca61b178b`。

保留来源校验、路径/符号链接限制及固定输出 owner：page/view 仍只允许进入 `agents/page-relay.js`。`node --test --test-name-pattern='Reading TOC' tests/environment/bundle-provenance.test.mjs`：1/1 PASS；既有测试扩为读取 page/view 实际源，通过合法字节、拒绝改字节、拒绝符号链接及跨输出 owner。`node --check scripts/bundle-provenance.mjs` 与定向 `git diff --check`：PASS。

同文件已有 Prompt owner 的 rail-open pin hunk，未修改或覆盖；主 agent selective staging 仅纳入 Reading TOC pin hunk及相应 Reading TOC 测试 hunk。未改历史 release、正式包/pin、可信业务源或三个预览，因此不触发再次晋升/刷新。固定 production 编译本轮未执行，由主 agent 将已审 pin 同步至隔离快照后 build；当前结果只证明来源门禁定向通过，不代表 production BUILD_PASS 或 NATIVE_PASS。
