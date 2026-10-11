# R25.1 本地项目一键保存 / 本机安装 / 版本更新工作流

日期：2026-10-11。仓库：`shopable-ai/opendesk-browser`，分支：`main`。

## 已直接写入源码

- Page 默认规则从所有 HTTP(S) 收窄到实际预览协议+主机；R12 旧断言已随源码更新。
- 本地 Page 结果进入原可见 `#developer-results-panel`；Provider Epoch/项目/文档变化导致旧结果失效。
- 复用底部 `#script-save`：本地 Page/Controller 只有成功运行并具备版本身份时可进入小型安装确认；未验证不可安装。
- `src/ui/local-project-install.js` 复用现有 Page Candidate/Verify/Available/Install 与 Task v1 Import/Verify/Available/Install，不建新安装数据库。每次确认前重新解析本地源码并核对 `bindingId/providerEpoch/inputHash/sourceHash/sourceBytes`。
- Page 正式 Verify 的二次执行会在确认区明示；Controller 复用持久完成结果及原生页面操作回执。
- 「工具」从正式 Page Installed/Authority 查询和展示已安装网页脚本，提供原生授权受控的启停；Controller 安装后刷新「我的」任务。
- Page/Task 升级时保留原工具停用状态；自包含已安装代码独立于本地 Provider。
- 安装未知/错误不自动重试，必须只读核对持久安装记录。

主要修改：`src/ui/script-editor.js`、`src/ui/local-project.js`、`src/ui/local-project-install*.js`、`src/ui/installed-page-tools.js`、`src/ui/tool-shell.js`、`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/page-candidate-source.js`、`src/platform/tasks/service.js`、`src/scripting/user-scripts/installed-programs.js`、相关测试与文档。

## 测试证据等级与状态

| 项目 | 当前状态 | 说明 |
| --- | --- | --- |
| GitHub 对 `main` 的源码提交 | 已完成 | 多次受保护的精确 HEAD/文件 SHA 写入，未新建分支 |
| 源码组件与合约回归 | NOT_TESTED（等待新提交 CI 完成） | 已增加 `tests/environment/local-project-install-r251.test.mjs`，旧 R12 范围测试已修正 |
| `npm run check` / `npm test` / 双构建 / `npm run verify` | NOT_TESTED | 当前聊天执行环境不含用户 Mac 仓库，不能声称已本机执行 |
| 真实受控 Mac Chrome/CFT、真实 Native Provider | NOT_TESTED | 必须核对独立 Chrome Profile、运行回执与候选包 SHA |
| 本地保存→安装→断线→Chrome 重启→重复使用 | NOT_TESTED | 需要 Mac 原生完整 E2E |
| 明暗主题、360/400/600px、200% 缩放与 WCAG 对比度 | NOT_TESTED | 已增加窄侧栏审阅布局 CSS，需要截图与辅助技术检查 |
| 在线第三方作者市场发布 | 未实现 | 当前 Market 只支持随扩展发行的官方固定 Catalog 安装，无真实上传发行服务合同 |

历史 CI 在改变普通 Page 默认匹配后曾因旧测试仍期望 `*://*/*` 而失败；已定位并修改 `tests/environment/script-editor.test.mjs`，不能把旧失败自动升级为新候选成功。

## 接下来最小闭环

在 Mac 本地 Codex 执行 `docs/framework/prompts/goal-r251-mac-final-acceptance.md`，先定向测试、修复真实断言和权限/版本缺陷，再运行必要全量构建与受控 Chrome；记录 PASS/FAIL/BLOCKED/NOT_TESTED 与真实截图、安装数据、结果身份、最终 SHA。任何修复只能保持原有安全边界，不能跳过 Page 正式验证或伪造 Task 原生成功回执。

## 2026-10-11 后续安全加固、组件回归与构建阻塞

本轮增量提交已直接进入 main，不存在另行下载应用的补丁。后续实现包括：

- `src/ui/local-project-install.js`：将编译源码字节、`inputHash/sourceHash/sourceBytes`、项目 `sourceContract`（runtimeKind、项目身份、网站范围、Page 规则、参数 Schema 等）以及原精确 `targetContract` 一并冻结；确认/安装阶段重新核对，阻止旧 Run 回执认证新配置。
- `src/ui/local-project-install-ui.js`：首次安装确认在原 Source 区以可聚焦区域打开；版本号/名称从真实点击时冻结。权限明确拒绝视为零派发，可重新审阅；可能已执行 Page Verify 或提交安装的未知回执，进入只读核对流程，不自动再次安装或重放业务。
- 原 `#script-save` 在未知状态显示「核对安装状态」，读取原 Page/Task Authority 并严格匹配候选/版本/sourceHash/siteRules/nativeState 或 Task manifestHash。只有正式已安装结果完全匹配才展示成功；不存在第二安装数据库。
- `src/ui/task-workbench.js`：停用任务仍可在「我的」进入管理，但 Run 仍被禁用；`src/scripting/user-scripts/installed-programs.js` 保持停用版升级后的授权和原生注册为 disabled。
- `tests/environment/local-project-install-r251.test.mjs`、`local-project-install-ui-r251.test.mjs`、`page-installed-programs.test.mjs`、`task-workbench.test.mjs`：覆盖回执核对、零重复安装、元数据/目标变更、保留停用、Page 二次执行说明、信任点击、权限拒绝、冻结版本与来源身份、键盘焦点。

R25.1 专项 CI 现将「组件合同+ `npm run check`」与「生产/开发构建+双包验证」拆成独立 job，不能因为前者成功就宣称整个工作流通过。已核验的历史 R25.1 组件结果：`651159e63f899d970abcbb274b328833b86b85b9` 的 `local-install-contracts` job **PASS**（[证据](https://github.com/shopable-ai/opendesk-browser/actions/runs/38139402591)）。新增的各项用例必须以各自的最新 CI 精确 SHA 再核验；不断有其他 Agent 往 main 提交，跨提交结果不得提升等级。

生产构建的当前已定位硬阻塞：SW 固定预算 327680 字节，而已核查 CI 候选 `651159e63` 为 348997 字节，见该 run 的 production-package 日志；因此 `npm run build` **FAIL**，`build:dev / verify / 最终 ZIP / 真实 Chrome` 不得宣称 PASS。该增量与并行的第三方库及官方工具工作流耦合，不允许擅自放宽预算或覆盖其他 Agent 的优化。需在同一个最终 HEAD 上保留每个打包资源的归因与安全优化证据，严格预算恢复后再进行真实 Mac Chrome 安装和持久验收。

**最终完成条件仍未满足**：用户 Mac/受控 CFT 加载与断线、停用升级、Worker/Chrome 重启后的实际注册和持久结果、360/400/600px 深浅主题及 200% 缩放均需要真实截图/原始回执。网络 Market 上传/作者发行 API 未存在可确认的正式服务，不得显示假发布成功。最新本地验收目标仍见 [goal-r251-mac-final-acceptance.md](../prompts/goal-r251-mac-final-acceptance.md)。


### 新一轮 R25.1 CI 核实（不替代最终原生验收）

- `dfa167aa22a20927efd3fe82229c1ffc1f2ec9d3` 的 [R25.1 专项 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38140701171) 中，独立 `local-install-contracts` job **PASS**，涵盖 R25 安装桥接/UI/权限/回执/停用回归和 `npm run check`。
- 同一精确提交的 `production-package` job **FAIL**：`sw.js = 330248` 字节，严格上限 `327680`，仍超出 **2568** 字节。先前 `651159e63` 的 348997 字节属于更早候选；不能把任何旧包的 PASS 用于当前 HEAD。
- 上游并行 `164a3e328fef` 的 Service Worker 引导依赖瘦身已减少包大小。R25 不负责修改其他 Agent 正在开发的云端库/官方工具模块，也不得通过提高大小预算伪造生产构建通过。
- `readLocalInstallOutcome` 对缺失安装回执只读取原 Page/Task 持久状态，要求冻结版本、SHA、Page 原生状态与授权或 Task Available manifest 全部匹配，**不**再次调用安装/验证。安装前拒绝权限时允许重新审阅，已进入可能有效果的阶段时只能核对。
- 主分支可能在此记录之后继续前进，最新修复需按 R25 CI 的实际 SHA 再核验；Mac CFT、用户本机 Native、Chrome 重启及 UI 色彩可访问性仍为 NOT_TESTED。

