# OpenDesk Browser · 单应用业务独立化进度

> 动态事实表；以 GitHub `main` 代码、提交、CI 与实机记录为准。此文件不是 PASS 证据。并行工作写入前必须重新读最新文件及 SHA，不覆盖其他应用结论。

| 应用 | A 业务源码独立 | B 安装与生命周期 | C 可信特权代码独立升级 | 本轮代码结论 | 产品结论 |
| --- | --- | --- | --- | --- | --- |
| Web Markdown Clipper | 并行会话验证中 | 未在本轮验证 | 未在本轮验证 | IN_PROGRESS_OTHER_CONVERSATION | NOT_TESTED |
| Reading TOC | **STATIC_VERIFIED / FIX_COMMITTED_CI_PENDING**：8 份 trusted 源 SHA 与固定入口一致；R1.5.1 React 回归和预览修复已入 main，Node 尚未重跑通过 | **CHROME_NOT_TESTED**：旧 SHA Ubuntu Chrome 测试失败；新 SHA 排队；Mac 未验收 | **BLOCKED_ARCHITECTURAL**：可信 JS 固定编入 WXT，不允许动态包执行特权脚本 | FIX_COMMITTED / CI_QUEUED；CODE_COMPLETE=NOT_VERIFIED | PRODUCT_DONE=NO |
| Stay Focus | 未在本轮核验；避免并行覆盖 | 未在本轮核验 | 未在本轮核验 | NOT_AUDITED_THIS_ROUND | NOT_TESTED |
| Time Review | 未在本轮核验 | 未在本轮核验 | 未在本轮核验 | NOT_AUDITED_THIS_ROUND | NOT_TESTED |
| AI VIP Share | 未在本轮核验 | 未在本轮核验 | 未在本轮核验 | NOT_AUDITED_THIS_ROUND | NOT_TESTED |
| Browser Framework 集成 | 仅在五应用源码闭环后推进 | — | — | NOT_STARTED | NOT_TESTED |

## Reading TOC · 2026-10-19（本轮）

- 代码基线：`fc9b1546c46dff6490dd134f1604f039f9ea3c42`；Reading TOC 定向提交：`e6680133ac3e4047d9ee0c899cc7c81e5ef869f5`。后续并行提交不自动算成本插件验收。
- A：移走旧 `src/sidebar-tools/reading-toc-existing-tabs.js`，改以 `examples/sidebar-tools/reading-toc/trusted/existing-tabs.js` 为唯一维护源；正式 `src/entrypoints/preinstall-intent.js` 调用插件源；对应两个 Node 测试修订导入。旧 `src/reading-toc/` 在本轮开始前已不存在（属于历史完成，不能重复计算）。
- 防越权：`scripts/bundle-provenance.mjs` 固定审核新 Git blob `f5d9882cd1de65ef2ed0115c4d002114575c1058`，**仅**允许进入既有 `sidebar-tools/preinstall-intent.js`，禁止进入用户脚本、沙盒、动态包；修复执行仍须核对官方安装包、站点/单页停用及 Chrome live permission，并只注入内置 `agents/page-relay.js`。未增加任何 SDK、Host、安装器或授权通路。
- Node 范围：`examples/sidebar-tools/reading-toc/app.ci.json` 将 7 个既有测试入口扩展为 14 个，补齐实际 ChatGPT 布局、多回答、已有标签页、worker Chrome 访问、官方身份、目录概览、显隐规则。所有测试源码均保持原断言。
- 本轮精确提交 diff：7 个 GitHub changed-file 记录（含一次 rename）；+30 / -14 行；净 +16 行（按 GitHub API `stats`，不计后续文档）。
- CI：<https://github.com/shopable-ai/opendesk-browser/actions/runs/39259980401>（App CI）与 <https://github.com/shopable-ai/opendesk-browser/actions/runs/39259980384>（Reading TOC）在首次读取时均为 **QUEUED**，还不是 PASS。需核对 **同一提交 SHA** 的所有定向回归，及 `node scripts/app-ci.mjs inspect reading-toc`、`build`、`node`、`browser`、`native` 实际结果；GitHub Actions 队列与 Mac Chrome 本地证据不可混用。
- B：原 `1.0.9` 正式 UI 包、安装/升级/撤权和用户数据机制本次未改；需要同候选真实 Chrome 安装/更新/停用/网站与单页撤权/重启/卸载/错误回退验证，**NOT_TESTED**。
- C：`trusted/page.js` 与 `trusted/existing-tabs.js` 虽归插件维护，却由 WXT 固定编译进浏览器；正式 `.opendesk-tool.json` 仅携带沙盒 UI 的 HTML/CSS/JS，无法独立升级特权 JS。不得宣称 C PASS；禁止为了过关直接执行可安装包或远端 JS 作为特权脚本。应在 Browser Framework 专项产品决策中确定可审计的独立可信代码交付边界，再实施/复核。
- 当前判定：`A=PATCH_COMMITTED_CI_PENDING`，`B=CHROME_NOT_TESTED`，`C=BLOCKED_ARCHITECTURAL`，`CODE_COMPLETE=NOT_YET_VERIFIED`，`PRODUCT_DONE=NO`。未运行本机 Node/npm，也没有使用用户 Mac Profile；历史 R1.9.2 的 87/87 不代表本次提交测试结果。
- 下一步：先核对本次 Reading TOC CI，失败则只修 Reading TOC；若源码回归确实通过，记 `CODE_COMPLETE / CHROME_NOT_TESTED`，再进入 Stay Focus 源码独立性复核；C 的架构约束和 Chrome 验收继续跟踪，不跨任务冒充 DONE。

### Reading TOC R1.5 · 2026-10-19（源码归属与 CI 复核）

- **基线**：本轮核验 main 快照 `54bfd259c86a7be033ec4810ad83eece3eb4558e`；原 Reading TOC 提交 `e6680133ac3e4047d9ee0c899cc7c81e5ef869f5`；未重复迁移已完成的代码；后续 main 提交不自动算本插件通过。
- **A · STATIC_VERIFIED / CI_PENDING**：应用 `examples/sidebar-tools/reading-toc/trusted/` 的 8 份可信模块（model/overview/placement/page/view/policy/locales.generated/existing-tabs）的 Git blob SHA 与 `scripts/bundle-provenance.mjs` 固定 SHA 全匹配。正式 `src/entrypoints/page-relay.js` 和 `src/entrypoints/preinstall-intent.js` 已引用 App 目录，旧 `src/reading-toc/` 及 `src/sidebar-tools/reading-toc-existing-tabs.js` 已不存在；没有新建 Host、SDK、Registry 或安装器。
- **正式包静态身份**：仓库 `reading-toc.opendesk-tool.json` 版本 1.0.9，HTML/CSS/沙盒 JS，无应用可信 worker/page 源；原始 UTF-8 共 28525 字节，独立计算 SHA-256 `56890b9feeb6908c5967eb16aed19a1e811f8d376dd270c01e78c0c93b052071`，与官方锁定值一致。`existing-tabs.js` 仅可进入固定 `sidebar-tools/preinstall-intent.js`，不能进入沙盒用户包。未产生本轮新的 build 包。
- **CI（同一提交）**：App CI [39259980401](https://github.com/shopable-ai/opendesk-browser/actions/runs/39259980401) = QUEUED；Reading TOC [39259980384](https://github.com/shopable-ai/opendesk-browser/actions/runs/39259980384) = QUEUED；Sidebar Tools [39259980301](https://github.com/shopable-ai/opendesk-browser/actions/runs/39259980301) = QUEUED。已查询 Run / Job，未有执行完成 Step、失败日志或本 SHA 的 PASS 证据；14 个列明的 Node 测试文件均在仓库列表可见但未在本轮运行。
- **执行环境**：实际执行 GitHub 远程源码、提交、Run、Job、包字节审计；没有用户 Mac 工作区。容器 `git ls-remote` 因 github.com DNS 解析失败。`node --test`、`app-ci inspect/build/node/browser/native`、`build-sidebar-tool --check-project`、`npm run build/verify` 均为 NOT_TESTED，不得记 PASS。
- **B · CHROME_NOT_TESTED**：已有覆盖安装、章节、多回答、Side Panel、停用、撤权、升级/卸载的自动化测试源码，尚无这次提交的真实 Mac Chrome 执行证据，不能据测试存在声明完成。
- **C · BLOCKED_ARCHITECTURAL**：App-owned 可信 JS 固定编入 WXT Browser，独立 `.opendesk-tool.json` 无特权 JS 升级能力。本轮不放松权限隔离、不创建第二套可信运行平台。
- **本轮变更与结论**：Reading TOC 产品源码 +0/-0/净 0；仅更新进度文档。A=STATIC_VERIFIED_CI_PENDING，B=CHROME_NOT_TESTED，C=BLOCKED_ARCHITECTURAL，CODE_COMPLETE=NOT_VERIFIED，PRODUCT_DONE=NO。
- **后续门槛**：先获取真实 CI 结果；FAIL 仅修 Reading TOC 根因；Node/候选构建通过后才允许记 CODE_COMPLETE，仍须保留 Chrome NOT_TESTED 和 C 阻断。CI 仍 QUEUED 时不自动切换 Stay Focus，不覆盖 Web Markdown Clipper / Stay Focus 的并行修改。

### Reading TOC R1.5.1 · 2026-10-19（真实 CI 解阻与复测等待）

- **最新直接修复**：[提交 03a243f4577cc5b96e0e16de989af78f4d02780f](https://github.com/shopable-ai/opendesk-browser/commit/03a243f4577cc5b96e0e16de989af78f4d02780f)；main 从 `c2f99f09eed1782c2ebdf531a89a36e8b1ef5c89` 以非强制且校验预期 HEAD 的方式前进。仅 7 文件：`tests/framework/reading-toc-native-r41.test.mjs`、`tests/environment/reading-toc-overview-r43.test.mjs`、`tests/environment/reading-toc-r41.test.mjs`、`tests/environment/sidebar-tool-localization-r12.test.mjs` 的 Reading TOC 测试断言，以及 `examples/sidebar-tools/reading-toc/preview/{index.html,reading-toc-r12-interactive-preview.html,reading-toc-r12-overlay-preview.html}`。Reading TOC trusted/、正式包和其他应用产品文件未改。
- **旧 SHA CI 真实日志**：`e6680133ac3e4047d9ee0c899cc7c81e5ef869f5` 上 [Reading TOC run 39259980384](https://github.com/shopable-ai/opendesk-browser/actions/runs/39259980384) 最终 `CANCELLED`，但其步骤 #5 Node 实际执行 **82/86 PASS、4 FAIL**（过时 React 宿主断言 3 处 + 已提交交互预览不再等于构建输出）；步骤 #9 真实 Ubuntu Chrome 测试失败（同名标题实际跨三回答有 4 个，不是旧断言要求的 3 个）；步骤 #6 `npm run build` 成功、#10 Chromium 预览成功、#11 100 项 Sidebar regressions 成功。旧 CI 出现 FAIL 不可因最终 CANCELLED 而宣称 PASS。
- **根因和修复**：保持四个同名标题的独立导航 ID 与回答归属验证（每回答 2/1/1），不减少断言；读取官方目录、审阅与更新路径仍由原可信 Host 控制，React Extension Center 现为 UI 源；语言与例外采用当前 React 标签快照；将三份预览的 React SSR shell 与实际失败日志的生成输出同步，Side Panel 预览字节经重建核对一致。未放宽安装包验证、SDK/Host、授权、XSS/权限边界或写入特权逻辑。
- **修复 SHA 的 CI**：[Reading TOC 39275966044](https://github.com/shopable-ai/opendesk-browser/actions/runs/39275966044)、[App CI 39275965877](https://github.com/shopable-ai/opendesk-browser/actions/runs/39275965877)、[Sidebar Tools 39275965681](https://github.com/shopable-ai/opendesk-browser/actions/runs/39275965681) 在首次核查时均为 `QUEUED`、未开始 Node/Chrome 检验；不可将旧 SHA 的绿色构建计作新 SHA 的最终候选验收。
- **本轮执行环境**：GitHub Actions 的原始 Run/Job/Step/TAP 日志与 GitHub 原生 Blob/Tree/Commit 写入；用户 Mac 工作区未挂载到本环境，容器虽有 Node v22.16.0，却无法通过 DNS 访问 github.com。`node --test --test-concurrency=1 tests/environment/app-business-ownership-r1.test.mjs tests/environment/reading-toc-*.test.mjs`、`node scripts/app-ci.mjs inspect|build|node reading-toc`、`node scripts/build-sidebar-tool.mjs examples/sidebar-tools/reading-toc --check-project` 未能在新 SHA 的真实仓库执行，均记 `NOT_TESTED`。
- **门槛**：`A=STATIC_VERIFIED / CI_PENDING`；`B=CHROME_NOT_TESTED`（真实 Mac Profile、站点/单页权限、重启与卸载未验收）；`C=BLOCKED_ARCHITECTURAL`（独立 JSON 不可热升级 WXT 内置可信 JS）；`CODE_COMPLETE=NOT_VERIFIED`、`PRODUCT_DONE=NO`。必须取得新 SHA Node + 构建 + 候选包校验全部实际 PASS，才能准备 Stay Focus 下一轮交接；不得因此修改 Stay Focus 并行成果。

## 变更守则

仅 `main`；不创建分支、Worktree、PR，不强推/reset/clean。并行会话的其他插件文件、暂存区、进度节及成果不覆盖。修改进度记录前逐次刷新 SHA；每个状态标记关联代码提交、测试命令与对应运行环境。