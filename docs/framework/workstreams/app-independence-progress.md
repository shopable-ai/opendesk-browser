# OpenDesk Browser · 单应用业务独立化进度

> 动态事实表；以 GitHub `main` 代码、提交、CI 与实机记录为准。此文件不是 PASS 证据。并行工作写入前必须重新读最新文件及 SHA，不覆盖其他应用结论。

| 应用 | A 业务源码独立 | B 安装与生命周期 | C 可信特权代码独立升级 | 本轮代码结论 | 产品结论 |
| --- | --- | --- | --- | --- | --- |
| Web Markdown Clipper | 并行会话验证中 | 未在本轮验证 | 未在本轮验证 | IN_PROGRESS_OTHER_CONVERSATION | NOT_TESTED |
| Reading TOC | 已迁移专属既有标签页修复；CI 待验 | 现有安装机制保留；本轮未实测 | **BLOCKED**：可信逻辑静态编入 Browser | PARTIAL / CI_PENDING | CHROME_NOT_TESTED |
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

## 变更守则

仅 `main`；不创建分支、Worktree、PR，不强推/reset/clean。并行会话的其他插件文件、暂存区、进度节及成果不覆盖。修改进度记录前逐次刷新 SHA；每个状态标记关联代码提交、测试命令与对应运行环境。