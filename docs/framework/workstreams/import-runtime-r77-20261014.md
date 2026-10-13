# Import Runtime R7.7 · 场景真实执行

状态：CORE_CHROME_PASS / FULL_CLOSURE_INCOMPLETE；负责人：Codex 会话 `01a13640-b3ee-7c01-b1b4-e74995391188`；2026-10-14。

## 范围与验收

仅 main；起点 `89c3b298dc3cf8927b227b041b101770780ce58a`（已安全 fast-forward）。保留启动时所有其他未提交文件。先核查 CI，按 S04 → S05 → S09 验证固定 D3 `v3.2.4/src/max.js` 的真实 `max([2,5,3])=5`；复用旧 npm/React/HTTPS 证据。SOURCE、NODE、BUILD、CHROME_CFT、MAC_NATIVE、SECURITY 分开登记；未测不能提升为 PASS。

负责人写入：本记录及对应 JSON；`examples/programs/single-file/page-d3-max-esm.js`、`controller-d3-max-esm.js`；必要的现有 Import 驱动修复（编辑前逐文件复核）；Import 导航。共享 `src/ui/script-editor.js`、依赖准备器、Worker 只有确认真实失败且无他人重叠写入后才修改，并在此补充。工具示例独立子任务拥有 `examples/sidebar-tools/import-max-probe/`，不写公共宿主。证据核查子任务只写本工作流专属 evidence/reuse 子目录。

通过标准：真实 Side Panel 控件输入/Run/Save/安装/打开，真正调用第三方函数；Page DOM 和实际 receiptNonce/documentId/sourceHash/resultText、Controller runId/resultId/持久结果/sourceHash、Tool 包 SHA/opaque sandbox 输出一致。普通 Page 没有受管组件 previewId，不能添加虚构字段。首次/重复请求计数、SHA/来源/权限和撤权保留；构建与 package verify、受影响 Node 回归通过。未知执行结果不重放。

资源：复用既有 127.0.0.1:43111 只读测试网页服务（PID 48261，待核对正文）；不占用 Cloud R14 CFT/profile。使用本工作流独立 CFT profile 与 `.runtime/tests/import-r77/` 候选及证据。日常 dist/development、Chrome ID、Native 配对不改。所有真实测试串行。Git 索引/HEAD 由主负责人串行操作，子任务不 add/commit/push。

## 进展

- 本地/远端 main 已核对；gh 不在 PATH，CI 使用既有 GitHub API/连接器，不创建第二工作流。
- 已读约束、复用指南和现有 R7.6 合同；历史排队/Node 测试不计 Chrome PASS。
- 写入范围新增 `src/ui/page-dependency-install.js`、`tests/environment/page-dependency-r71-ui.test.mjs`（当前无其他 diff）：真实 Classic CFT 卡在禁用的 Run。权限 prepare 结束仅 render(false)，未通知编辑器；回归要求异步检查完成主动更新 Run readiness，保留真实手势要求。现有 `page-browser-worker-r243-cft.mjs` / `page-dependency-r72-cft-cycle.mjs` 由主负责人维护；工具子任务独占 `page-import-fixed-tools-cft.mjs`。

## 实际结果与候选

P0 Page、Controller、用户 Tool 均真正调用原始 D3 `max([2,5,3])` 得到 5。固定资产 SHA `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`。产品修复只有 Classic warm 权限观察完成后通知编辑器的三处 `render()`；失败回归先复现，再修复，未删断言或放宽权限。

真实验收候选为 `.runtime/tests/import-r77/candidate/dist/production-developer`，独立物理源码副本，非 Git worktree。起始 main `89c3b298` 加源码快照及本任务 readiness 修复，所有实际构建输入见 [build receipt](evidence/import-r77-20261014/build-final-02/build-production-developer.json)，packageHash `01a79da5b9f3cb3e3041e26f6acdf766bded7fb0645743939af24db220732c75`。Chrome 155.0.8059.39、实际扩展 ID `kbeocokdaadgcpinbamkhfmjlhillanh`。用户本地 Mac CFT、真实 Chrome pointer/keyboard Input；未连接 Native Host、未执行 macOS 原生 CUA 输入，MAC_NATIVE_NOT_TESTED。driver 的 sourceHead 是启动时宿主 checkout，不能代替 package/sourceInputs 身份。

- [D3 最终原始回执](evidence/import-r77-20261014/chrome-d3-10/acceptance.json)：Page sourceHash `9f5357b3eee7997f9be04b48f67d2bc9bf4e373b81ac14aaa2c4f6059d29a4ca`；Controller sourceHash `a6c35513d9a276ad6b88fdc498009497945e9ba296ebf6b4366c93d895a6039b`。Page 首次请求 1，重复/加载固定 Candidate/安装后新文档 0；同一节点、不同 receiptNonce，同一 tab/document。固定版本验证、安装及停用后新文档禁止自动执行通过。Controller 首次 1，重复/保存加载后草稿 0；每次 result 自身 revision.sourceHash 与 UI 一致，run/resultId 独立，Worker retirement released。
- [Classic/npm 原始回执](evidence/import-r77-20261014/chrome-classic-02/acceptance.json)：真实 marked UMD、Controller mitt UMD、`mitt@3.0.1` 与受信映射 `mitt` 实际 emit 一次；A/B 复用 SHA 字节但锁/授权独立。并行 R78 owner 的 helper 额外执行了自己的子例，原始记录保留，R7.7 不归功或提交该 owner 的文件。
- [工具原始回执目录](evidence/import-r77-20261014/tool-chrome-02/)：D3 和 v2 Classic 工具均真实安装、打开、关闭、重开、卸载；导入/安装不执行，opaque origin=null，无 chrome.tabs/page，运行期无网络。依赖顺序 `mitt>second>main`；浏览器、launcher、profile 清理验证后才允许 PASS。工具包 SHA 分别 `fecc6cfcf224250912e20bd3e59ae3c5ddf67f9ecf0365bf10baee426a9799f4`、`1c8124021d84f65e193157ff885d880174791924bd72c9ca9b9ab3acfa995f9a`。
- [Standard 真实 Chrome](evidence/import-r77-20261014/chrome-standard-01/acceptance.json)：无浏览器编译器 UI、普通 JS 仍能执行。不能将这项证据升级成 Standard ESM import 支持或可信静态示例的第三方函数 Chrome PASS。

截图：[实际网页 D3=5](evidence/import-r77-20261014/chrome-d3-10/page-document.png)、[Page 固定安装身份](evidence/import-r77-20261014/chrome-d3-10/page-sidebar.png)、[Controller 结果](evidence/import-r77-20261014/chrome-d3-10/controller-sidebar.png)，工具分阶段截图在上述 tool-chrome-02 目录。

## 十二场景账本

六维机器状态、原始候选、证据范围及剩余工作见 [summary.json](evidence/import-r77-20261014/summary.json)。PASS 仅覆盖记录的边界，原生坏 SHA/onerror/撤站点权限未测试项保持 NOT_TESTED。

| 场景 | 已实现 / 已复用历史 PASS | 本轮真实 Chrome | 剩余或后续动作 |
| --- | --- | --- | --- |
| S01 本地多文件 npm | 已实现；R2.2 page-npm-lodash 真实 Mac/Native 历史 PASS | REUSED_PASS | 不重建；localhost 授权副本范围，非原站点或当前全组合 |
| S02 本地多文件 HTTPS | 已实现，锁/缓存/构建复用 | NOT_TESTED（真实上游全链） | 旧远端示例使用 Mock 锁，不能作为真实第三方函数 Chrome PASS |
| S03 React URL + ECharts | 已实现；93878f44 的真实 Chrome 20/20 PASS | REUSED_PASS | 原示例/包身份保留；不升级成当前 editor 全组合 PASS |
| S04 普通 Page URL | 已实现 D3 简短示例 | PASS | 全浏览器离线重启、Chrome 撤权/篡改故障未测 |
| S05 Controller URL | 已实现 D3 简短示例与持久结果 | PASS | 固定已安装 Revision Run、离线重启、定时/Cloud 未测 |
| S06 Controller npm/bare | 已实现固定 mitt 3.0.1 | PASS | 同 S05 的安装/触发生命周期未测 |
| S07 Page Classic | readiness 真缺陷已修复 | PASS | Chrome 负向撤权/SHA/onerror 未测，Node 负向已测 |
| S08 Controller Classic | 原 Worker 实际 UMD 功能保留 | PASS | 固定安装/离线/触发生命周期未测 |
| S09 Tool 本地 ESM | 新最小 D3 工具，原 builder | PASS | Chrome 故障注入、宽度/暗色全量未测 |
| S10 Tool 多 Classic | 原 v2 Loader，真实 mitt 示例 | PASS | Chrome 坏 SHA/onerror 未测，Node 阻断已测 |
| S11 可信 Background | 原静态例；真实 npm Node 与静态构建 PASS | NOT_TESTED | 示例不自动进入 SW，函数实际 Chrome smoke 未测 |
| S12 可信页/Host | 原静态例；真实 npm Node 与静态构建 PASS | NOT_TESTED | 静态示例函数 Chrome 调用未测；Standard 边界另记 |

Controller 保存后点击“运行草稿”实际仍是 draft，回执现命名 postSaveDraftRun，不假称固定已安装 Revision。当前 Task 制作入口比较保存包装字节和 author 源码，属于现有任务安装闭环的进一步核对范围；相关 task-workbench/公开 UI 正由其他 owner 修改，本任务不覆盖。整 Chrome 离线重启、定时/Cloud 触发、最终 F3、ZIP 安装和 CWS 合规均未关闭。本记录不能作为全框架正式验收或发布依据。

## 验证、CI 与并行阻塞

- 修复后定向 Node **105/105 PASS**；最终当前源码选择的回归 **48/48 PASS**，随后完整已存在九文件选择 **71/71 PASS**（不同选择，不相加成唯一数量），[最终日志](evidence/import-r77-20261014/local/current-targeted-final.log)。`check-source` **668 文件 PASS**。默认工具驱动验证通过并保持 Chrome 测试 opt-in；三种错误 R77 开关组合均在启动前拒绝。可信 Background/Host/Page 使用实际已安装的 npm 包静态构建，函数 Node 测试通过，不进入特权远程执行。
- 冻结输入生产/开发、Standard/Developer 四种构建及 package verify PASS，sourceDriftDuringBuild=[]，原始 receipts 在 [build-final-02](evidence/import-r77-20261014/build-final-02/)。初始 symlink provenance、observer/输入/receiptId 错误和 Classic 真失败日志均保留，失败不覆盖成 PASS。
- 最新 CI 原日志已读取：旧 R72 的 URL constructor Mock 问题、React Page 的无 layout 节点 observer、旧 source static-import 断言失败、Sidebar R10 Host settle 失败分开登记。本轮当前定向 Import Node 不复现旧断言失败，不删安全断言；其余 owner 的 UI/SDK/Cloud 不改。最新 CI 状态原文见 [ci-latest-final.json](evidence/import-r77-20261014/reuse/ci-latest-final.json)。
- 为核对当前并行工作区，又建立独立普通源码副本 `candidate-current`。其 Developer build **FAIL**：tool-shell **531339 > 524288**，见 [原日志](evidence/import-r77-20261014/local/build-current-developer-02.log)。不放宽硬门槛、不将先前包 PASS 冒充当前组合 PASS；[逐输入漂移](evidence/import-r77-20261014/current-main-input-drift.json)包含 RunHost/Authority/SDK/UI 的其他 owner 更新，故本轮原生结果仍绑定原冻结快照。
- 远端 main 最新 `ddbadf6dd0277a00dfe51a6025b601c0bce1fdc6`；从本地 c29f35fa fast-forward 被 Git 阻止，冲突是其他 owner 的 `src/ui/workflow/local-codex.js`、`src/ui/workflow/workflow-view.js` 未提交改动。保留这些源码、暂存和远端提交，不 stash/reset/覆写。安全本任务提交与推送实况见最终回复及本工作流 git-delivery 记录；不能自动强推绕过。

所有本任务 CFT/launcher/profile 已释放；共享 43111 原服务器未关闭，日常 dist/development 和 Native/Chrome 配对未改。例子入口见 [Import README](../../../examples/programs/single-file/IMPORT-README.zh-CN.md)。
