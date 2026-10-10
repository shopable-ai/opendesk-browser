# OpenDesk Browser R3.1 独立安全审计简报（最终签署版）

审计日期：2026-10-10。签署者：独立只读子任务 `authorization_audit`。本签署版另存，原草稿保持原样。

## 结论与适用范围

**在本次审查的 Page 安装自动运行、已安装 Task 的 Controller 执行、安装/恢复 UI 和既有 Authority 边界内，历史上实际复现的高优先级越权或旧授权复活路径均已修复；本次最终复审未发现仍可复现的 P1/P2。** 此结论以源码审查、独立组件复现及修复后复测为依据。现已独立核验固定提交的真实 Chrome 原始证据：20 次自动文档执行、Worker 重建后的第 21 次、完整浏览器同 profile 重启后的第 22 次均通过，已观察窗口内 `permissions.request` 为 0。尚未实测的异常排列仍逐项保留，不扩大通过范围。

最终原生验收固定提交为 **`992f11732657171d9691d99a6b114106c0b7782f`**。历史 R3.1 安全修复审查固定于 `13e02a689e2a3db77ff444e75e7a41d595fb1f93`，并已补审 `92ddeeb43a129942226d2d5c5c2967d7c305a9e8` 的默认全部 HTTP(S) 网站范围；补充组件检查当时 HEAD 为 `6f5516dbc058d88df185a1374d5566cf384bf9fc`。本次只读 Git 对比确认 Page/Task 授权核心、权限 gate、相关安装 UI、RunHost、SW、Preview 与 Manifest 从 13e02a6 到最终验收提交未改变；新默认范围另有下文的专门审计。

不将“测试数量”折算成总体完成度。本简报签署下述安全适用范围，不另造总体数值评分；最终质量评分由 `entrypoints_review` 按已披露 rubric 核验。本轮原生通过不等于全部权限能力、全部浏览器异常或完整 F3/ZIP 验收通过。

## 已关闭的实际问题

| 原可复现路径 | 最小安全修复 | 修复后独立验证结论 |
| --- | --- | --- |
| Page 在停用再启用、撤销再授予后，旧 bootstrap token 恢复可用 | 在原 `page-installed-v1` 内保存安装身份、generation、status、exact scope；安装、恢复、停用和撤销轮换 token/代次 | 旧消息被拒绝，不能借新一代授权再次派发源码 |
| 权限移除发生在最后一次异步校验与派发之间 | `onRemoved` 同步增加内存 fence，随后有序持久 suspend；最后提交后、调用 Chrome 前再次同步核对 epoch | 已移除权限不能通过迟到 contains 结果跨越最后派发边界；`onAdded` 不复活 suspended Page |
| User Scripts API 关闭或 contains 返回 false，但没有 `onRemoved`，原安装仍可自动恢复 | 仅针对真实 `E_USER_SCRIPTS_UNAVAILABLE` 或内部 `pageAccessLost` 标记，按 namespace/nativeId/token 做 CAS 持久 suspend | API 恢复及 Worker 重建后旧消息仍拒绝；显式恢复产生新身份代次；伪造 marker 错误不会停用其他安装，无有序队列重入死锁 |
| Page 已发生效果，但在最后 contains 等待期间停用后仍交付成功 | 原生结果后重新授权；持久结果提交再核对当前 token/status/epoch | 保留已确认效果事实，结果为失败、成功值不交付；不声称回滚，不自动重放 |
| 安装 Task 只声明 page.automation，却可借普通 Controller 调用共享宿主存储、HTTP、Cookie 或 URL 下载上传 | 持续核验绑定的安装记录；已安装 Task 的 service 路径和特权 Cookie/uploadFromUrl 路径在派发前拒绝 | APPSTORAGE/AXIOS/Cookie/uploadFromUrl 组件调用以 `E_CAPABILITY` 拒绝，无特权 native 派发 |
| Task 停用后仍继续调用、重用旧回复，或迟到 finish 将其变成 completed | owner(active)、准入、重放及前后校验均核对 Task 安装身份；安装变更与活动 run 的 stopping/cancel fence 同事务提交 | 老操作/老回复不能继续；停用后 finish 收敛为 stopped，不能伪造成功 |
| Task 停用启用代次变化，以及卸载同版本重装导致 generation 重用后，旧 Run/Toggle/Install/Uninstall 点击被接受 | 全链绑定 `expectedGeneration` 和 `expectedInstallationId`，UI 在首个 await 前冻结选择，Authority 再 CAS | 同版本重装即使 generation 都为 1，旧四类请求均 `E_REVISION`；当前安装的新 Run 可准入 |
| 旧记录迁移或 Worker 恢复借机取得新授权、重放未知副作用 | Page 仅迁移完整固定来源和原验证证明匹配的安装；Task 仅在新 Run 的受控事务中迁移；旧 run/receipt/slot 维持失效或 unknown | 旧 live run 不能附着新安装授权；同 manifest/document 不重放；服务重建、session 改变或 BFCache 枚举遗漏不能证明原文档已消失 |

这些结论分别落在 `src/scripting/user-scripts/installed-programs.js`、`page-install-authorization.js`、`preview.js`、`src/platform/tasks/service.js`、`src/platform/host/controller-methods.js`、`src/run-host.js`、`src/ui/task-workbench.js`、`src/ui/page-program-library.js` 和 `sw.js` 的既有路径中。本次没有引入第二套权限数据库、执行器或给整页装 SDK 来代替脚本授权。

主执行者已把核心复现固化到 `tests/environment/page-installed-programs.test.mjs`、`tests/framework/k3-controller-authority.test.mjs` 和 `tests/environment/page-program-library.test.mjs`；本审计期间的独立复现使用真实组件和替身 Chrome API，不标为原生 Chrome 通过。

## 授权复用成立的条件

Chrome 网站权限是扩展级的原生权限，允许复用已有批准；OpenDesk 程序授权仍绑定独立安装身份、冻结源码/依赖/规则和当前状态。Chrome 对某网站或全部网站的批准，不会自动创建另一个程序的安装授权。

正常 Run、Verify、Preview、Enable 只做静默 `contains` 检查。可信 Install/Restore 点击根据预先观察的缺失子集同步请求；过期观察不会自动转化为新弹窗。内部创建 RunAuthority 是一次执行的绑定与校验，不是再次要求用户同意。

Page 当前授权能力为隔离 `page.dom`，Task 当前为 `page.automation`，两者 networkOrigins 均为空。**这里拒绝的是额外的宿主网络、浏览器 Cookie、宿主存储、Native 服务能力；不能把它宣传成阻止 DOM 程序访问其获准网页本来可访问的数据、Cookie 或网页网络行为。** 已授权 DOM 执行本身可以产生网页效果；独立网页 SDK 的文档级授权仍是另一条边界。

停用或撤销不能撤销已经发生的网页效果。现有 Page 源码创建的任意监听器、计时器或界面不承诺即时消失，界面已提示刷新原网页；后续派发和迟到成功交付会被挡住。未知结果继续保留，恢复操作不会自动重放当前文档。

## 并行变更 92ddeeb：默认全部 HTTP(S) 网站

该产品变更将新普通 JavaScript、没有 `@match` 的兼容导入默认范围设为 `*://*/*`、顶层、`USER_SCRIPT`；未另声明运行时机时默认 `document_idle`，显式时机仍受既有安装限制。它扩大了新候选的默认调度范围，仍通过明确的安装 UI 展示和确认；没有扩大 Manifest。已存在的显式规则与冻结安装保持原范围，不会因重新读取而变成全部网站。旧 GM 元数据继续只作为兼容输入，未实现的 grant 仍不能形成 OpenDesk 能力。

本次独立只读 stdin 检查实际通过：

- 新普通 JS 与无 `@match` 导入的默认范围正确；显式窄规则仍冻结。
- 窄 scope 升级为 `*://*/*` 被列为新增范围；同一 broad scope 不重复要求程序范围确认。
- 给 broad row 配窄 grant 被 `E_PAGE_AUTHORIZATION` 拒绝。
- 全 HTTP(S) 安装与 HTTPS 单站、localhost 端口、子域 wildcard、`<all_urls>`、IPv6 端口撤销均被判为有交集；file 范围不混入 HTTP(S)。
- 原生替身仅有窄站点权限时，Run 静默拒绝；可信 Install 同步申请 broad 一次；之后同 scope 确认和 20 次静默检查新增 request 为 0。

旧 legacy adapter 正例需要先冻结 broad candidate，再生成匹配的 authority proof。原先“窄 proof 后改 broad candidate”的测试失败是安全拒绝正确生效，不能通过放宽生产校验来修；主执行者已保留该负例并修正正例 fixture。

原文和实际输出保存在仓库外，复查方式为从仓库根目录执行 `node --input-type=module < /workspace/scratch/eceef8694f0a/r31-fullscope-audit.stdin.mjs`：

| 文件 | SHA-256 |
| --- | --- |
| `/workspace/scratch/eceef8694f0a/r31-fullscope-audit.stdin.mjs` | `e673b402ec89b29ecf99556822c1b48746a3465461b9d5867652f91849525d23` |
| `/workspace/scratch/eceef8694f0a/r31-fullscope-audit.output.json` | `6ad89ef6463155a5dd73f5317bd0d058f3ba57287ad0f0ec96b299ea9cf45785` |

## 原生证据：独立核验通过

原始 CI：[R3.1 installed permissions real Chrome，run 38042717294](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294)。原始附件：[artifact 11665844192](https://api.github.com/repos/shopable-ai/opendesk-browser/actions/artifacts/11665844192)。固定 sourceCommit 为 `992f11732657171d9691d99a6b114106c0b7782f`；真实浏览器为 macOS Chrome for Testing `155.0.8059.39`。

原始文件读取自 `/workspace/scratch/eceef8694f0a/r31-evidence/ci-992f117/`。本次独立核验重新计算附件摘要、验证 ZIP 完整性、按配方重算包清单指纹，并把四个原生驱动输入文件的 SHA-256 与固定 Git 提交内容比对。包指纹在 acceptance 和 development build 记录一致；此处明确是从已存清单重算指纹，没有把附件 ZIP 当作完整扩展安装包重新构建。

| 固定证据 | 核验值 |
| --- | --- |
| 原始 native ZIP SHA-256 | `e3eba2fee811ffd8aadc0b7cd9e5c55146270e7e9df6ce81360614fc3d24b47d` |
| development packageHash | `f7791357fce94f7d96870eb4a6c74d805de35433642cc00baf5fcd52429e6aa4` |
| 权限观察 | 4 个观察上下文、51 个 checkpoint；请求 0、观察错误 0 |
| 实际执行 | 22 份不同 documentId，逐份 actualFrame 身份匹配，均 completed |
| 原生用例 | 4 类功能用例 PASS；cleanup 单独核验，不计作功能用例 |

逐项读取 `installation-baseline.json`、`document-01.json` 至 `document-22.json`、`after-browser-restart.json`、`permission-observations.json`、`events.jsonl` 和 `launcher.cleanup.json` 后，确认：

1. **真实明确安装及独立身份。** Side Panel 原生可信点击完成普通 JS 的保存、验证、安装，安装前显示 `*://*/*` 及能力边界。A/B 的 installationId 与 nativeId 不同；B 经明确停用后授权为 disabled，全部测量文档中 B 的安装自动执行回执为 0。
2. **20 次自动执行复用。** 前 20 份真实新文档每份只新增一个 A 的持久完成回执；授权 installationId、generation、scope、approvedAt 及浏览器权限保持不变。执行无需新的权限申请。
3. **真实 Worker 重建。** 记录包含 Worker 的 stopping/stopped、目标实际消失、恢复 running 和新的 execution context uniqueId。Chrome 重用了 targetId，因此以原生上下文变化作为重建证据；新 observerId 也不同。旧 20 个完成回执保持原样，第 21 个新文档在同一程序授权下成功。
4. **完整浏览器同 profile 重启。** 进程 PID 从 4393 变为 4666，profile 路径、device/inode 和启动参数一致，浏览器 session incarnation 改变。两程序安装、权限和原生注册逐项不变，旧 21 个完成回执逐项不变，第 22 个新文档在新 session 中成功。
5. **清理。** 两个 Chrome 子进程均退出码 0；launcher 退出码 0；profile 为 removed，residual/errors 均为空。此项证明测试资源收尾，不增加授权功能完成度。

观察器只包装 `chrome.permissions.request`，以 `Reflect.apply` 返回原函数结果；不伪造授权、不写安装记录、不替换执行结果。源码断言核对观察器身份、原函数包装完整性和事件无丢失；原始 checkpoint 与即时事件中的计数一致。

原生用例使用一个系统分配的 loopback HTTP origin。它验证默认全 HTTP(S) 规则的展示、持久化与 Chrome 注册，以及该 origin 的真实执行；不能据此声称跨域、HTTPS、所有端口或多 frame 的全量兼容验收。Worker/浏览器重启原生场景是在旧回执已完成后进行，尚未覆盖运行中强杀且效果未知的所有异常排列。

## CI 计数更正与未完成项

已读取 `r31-evidence/ci-final-workflows.json`，更正旧草稿的“10 条相关 CI”口径：13e02a6 阶段是 **9 条产品 CI 通过、1 条 cleanup 通过，另有 R3.1 原生 CI 失败**。不能把 cleanup 计为功能测试，也不能隐藏该原生失败。主执行者保留此前 a88919c、13e02a6、789fa3a 的失败原始附件，最终 992f117 的通过证据独立固定。

992f117 实际触发的 **7 条 workflow 全部 success，其中 6 条产品 workflow、1 条 cleanup**。最终原生 CI 的 `components.log` 为 233 tests / 233 pass / 0 fail，`check.log` 检查 250 份文件，development build 记录 passed。[最终 Native Agent CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717333) 的 job 114186007722 原始日志包含全环境 627 tests / 620 pass / 0 fail / 7 skipped，及 production/development 构建通过记录。这个 workflow 名称不代表本次完成了 Native Task E2E，跳过项也不计 PASS。

以下项目继续按原生报告保留，不因上述成功而升级为 PASS：

- **NOT_TESTED：**真实 Chrome 网站访问撤销、权限同意框与明确恢复；User Scripts 关闭后恢复及晚到权限事件排列。
- **NOT_TESTED：**同范围版本升级和扩大网站范围的原生权限确认交互。
- **NOT_TESTED：**真实跨程序恶意 RPC、旧回执利用、故意注入竞态，以及运行中强杀后的未知效果排列；相关组件拒绝证据仍有效。
- **NOT_TESTED：**普通 Controller 和本地项目分别连续 20 次运行的原生 request 计数。
- **NOT_OBSERVED：**浏览器/Worker 启动至权限观察器附着之前的权限调用。已观察到的 0 次不得写成未观察窗口也为 0。

这些未测项不是已发现的运行漏洞，也不能由测试数量或 cleanup 通过替代。最终归档应保持每项原始状态及准确提交；新增未知副作用、跨程序或原生能力不属于本签署范围。

## 当前能力边界

目前正式 Installed Page 仅支持顶层、`document_idle` 的隔离执行。早期时序、多 frame 和更多能力不在本次准入范围。程序私有的特权跨站 HTTP、Cookie、宿主存储和 Native Messaging 桥未实现，不应列为本轮已交付能力。

Native 直接以 `task:` 保存来源启动的路径还没有安装快照传递能力，当前安全拒绝缺少身份/代次的调用；不能记作已安装 Task 的 Native E2E 通过。普通 Native 草稿/已保存来源与本次无关，没有据此重新验收。完整 F3/ZIP 等扩大范围的测试也不在本简报的通过声明中。

审计未修改共享仓库、dist、Git 状态、Manifest 或任何 SDK/Native 实现。保留精确来源、单一 Authority、未知副作用保护与程序间授权隔离，是本次源码/组件结论的前提。

## 签署

`authorization_audit` 于 2026-10-10 完成独立只读核验，签署源码/组件安全边界及固定提交 992f117 的上述四类原生功能通过。未发现新的开放 P1/P2；不为未测能力、未观察窗口或完整 F3/ZIP 结果背书。本签署文件为审计责任记录，不宣称密码学身份签名。
