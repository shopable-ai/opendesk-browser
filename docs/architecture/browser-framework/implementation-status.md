# R3 当前实施状态（人工交接，不代替机器账本）

## 2026-10-09 R8 Engineering Program R1 执行复核

本轮从真实 `main@945cf92726fcadcd60ecb3dc70729029fb9f28e6` 建立隔离工作区，并先后同步并行主线 `0dcc23b6` 的 40 任务计划、`71fa54e` 的 Browser Test Lab 更新，以及 `c2538e9` 的 188 项归属 CI 门禁、`36cdb63` 的最新 PR 归属和 40 组独立评分。保留既有 E01–E40 稳定 ID，以 [唯一执行计划](../../product/browser-automation-r8-implementation-plan.zh-CN.md) 记录工程任务，原 [188 能力目录](../../product/browser-automation-feature-catalog-r8.zh-CN.md) 继续是唯一功能总账本。源码地图、15 模块分工、R8.0–R8.6 门槛、14 项增量 ADR、依赖和下一批 GOAL 均已按真实源代码建立；规划文件本身不代表实现完成。

### 本轮实际产品与集成修复

1. **E08/E40 的元数据审查子项**，产品提交 `84dc3c7abe08505ae5e24849315dc8dd5587932d`：修复 `src/ui/page-dependencies.js` 的异步检查旧结果覆盖新 `@grant/@resource/@include` 准入，以及没有 input 事件的编辑未在审批时复查。依赖列表/锁可复用，当前代码的权限策略必须重算。`dependency-metadata.js` 同时在已有审核区显示 `@antifeature` 的纯文本风险自述。未新增权限或运行内核，未放开不支持的 GM。
2. **E06 的主线集成守护子项**，提交 `c84585f`：并行主线的测试指南再次写入旧临时 URL，导致原有 canonical 手工入口测试失败。本轮先用专项文档引用修复并重跑原断言；并行主线随后由 `ca3e765` 完成等价修复，最终合入保留远端指南措辞和全部新 HTTP/Locator 场景，未放宽测试规则。
3. **PR #22 的既有测试入口修复已由并行工作完成**：保留远端 `tests/fixtures/d1-userscript.html` 的移动方案；本地独立候选未覆盖远端。该修复解除组件/构建阻断，不等于本机保存/重启/安装与最终 ZIP 验收完成。

### 分层实际证据

| 验证层 | 本轮结果 | 精确范围与限制 |
| --- | --- | --- |
| 源码接线 | SOURCE_IMPLEMENTED | 元数据 parser → 现有依赖审核 UI → Broker 前的当前源码复查；独立 review 接受两处 catch 修正；无额外 Task/Storage/Auth 模型 |
| 定向组件 | COMPONENT_TESTED | 71/71 Page/dependency/editor/package 测试；5 个新增行为用例在旧实现复现失败，修复后通过 |
| 主线集成组件 | COMPONENT_TESTED | 原候选环境组 197/197；同步 `71fa54e` 后 198 项曾 1 fail（指南旧 URL），修复后 198/198，canonical 页面组 12/12；再同步 c2538e9 的计划门禁并适配任务卡后 201/201，最终计划契约 3/3 |
| 静态检查 | BUILD_VERIFIED 范围内的 source check | `npm run check`：最终 139 个源文件/测试/构建输入（增加一份主线计划契约测试；旧候选 138）；不作为 Chrome 证据 |
| 构建与包 | BUILD_VERIFIED | 生产/开发构建、`npm run pack` / `pack:dev` 及 `npm run verify` 均通过；后续主线与文档合入经 122 项构建输入 hash 对照无漂移，固定 packageHash 见独立回执 |
| Chrome 原生 | NOT_TESTED | 本轮未启动 Chrome/CFT 做安装、实际页面、开关/权限和重启验收；不能据此签收 Page/GM/Cron |
| 用户任务 / 本机 Codex | NOT_TESTED | 用户本机路径不可访问；安装后使用、AI/Native 退出后重跑、停止及同版本 ZIP F3 需本机接管 |

命令、完整 SHA、原始失败/通过日志、build receipt、独立审查及 PR 时间戳快照见 [工作流回执](../../framework/workstreams/r8-engineering-r1-b62cc961.json) 和 [证据目录](../../framework/workstreams/evidence/r8-engineering-r1-b62cc961/)。生产 SW 为 **327366 / 327680 bytes**，仅 314 bytes 余量；后续增加可信服务必须重新通过原预算，不能靠悄悄放宽门槛。

### 尚未关闭的产品门槛

- 正式 Page 类型专属 Candidate/Verification、安装状态、userScripts register/update/unregister/getScripts 对账、启停/更新回滚和重启证明仍 **PARTIAL/MISSING + Native NOT_TESTED**。当前预览和纯注册描述不能替代这条链；沿用既有 Controller、Authority、RunHost、IDB v2 frameworkKV、Task revision。
- GM API、@connect 网络兼容、Background/Cron、UserCSS、跨浏览器仍按各自任务实施。专用 USER_SCRIPT 消息并不直接证明哪个脚本发送；可信脚本实例认证是特权 GM 的安全门槛。普通浏览器 fetch 与 SDK axiosx 均不等于 GM_xmlhttpRequest。
- PR #11 仍是 **Draft / 未合 main**；#20 已于 17:04:34 UTC、#22 已于 17:11:02 UTC 合到 Native 候选分支，分别为 `33a551a6` 与 `a2e1bda5`，均不是 main 交付。最新组合 `75e4cde` 的精确 push CI 有 47/47 Native 组件、58/58 共享回归、254 PASS/4 SKIP 环境组、157 项检查及双构建/verify；CFT 155 的 Options 诊断仍 0/1 失败（CDP timeout 被 continue-on-error 吸收）。不能算 Native/Codex E2E PASS，也不能用旧 #22 CFT 149 回执签收新组合。
- 当前广泛 manifest 权限不自动下发给脚本；公开发布前的最小权限及供应链审查仍未关闭。`FINAL_FRAMEWORK_ACCEPTED=NO`，不以高平均分或本轮组件通过改写。

---

## 2026-10-08 后续主干复核（覆盖下方早期快照的当前状态判断）

> 以下状态按 GitHub 主干实际源码及 CI 核对；下方原始 R3 分支记录完整保留作为历史快照。主干已发生多次集成，下文早期“Candidate 缺失 / async main 缺失 / PR #4 未合并 / R3 未合并”等描述不再适用于最新主干。不要据此重复实施。

| 产品链环节 | 最新源码事实 | 证据与未关闭事项 |
|---|---|---|
| 开发草稿与 Controller | `src/ui/script-editor.js` 草稿无需保存可运行；`src/scripting/sandbox/worker-runtime.js` 可执行 `async function main()`；共用 RunHost/Authority | Chrome 原生会话、Stop、重启闭环未在本轮重验 |
| Task Candidate → Verification → Available | `src/platform/tasks/contract.js` 与 `service.js` 已有不可变任务包、真实运行证据与 Available 检查；安装与 paramsSchema 已接入现有 Broker | Task v1 为单 HTTP(S) origin 的 Controller Task；IndexedDB v2 的 `frameworkKV` 承载任务资产，不应将此前的 v3 设想再误判为必须重建 |
| Sidebar 用户工作台 | `src/ui/task-workbench.js`、`tool.html`：已安装任务卡片、可信表单、独立全页发现目录、分类搜索、运行记录、候选安装 | UI 与 SDK / Chrome 原生完整用户流程仍须在固定候选验收 |
| Page Program 底层 | `src/scripting/user-scripts/page-program-package.js` 已可编译 USER_SCRIPT 注册描述，含受信 Available 回执合同；`src/vendor/jquery-3.7.1.min.js` 带固定哈希 | **尚未接入**正式受信 `Available + Installed + Enabled` 到 `chrome.userScripts.register/unregister` 的持久 URL 匹配链 |
| Page Script 即时试运行 | `src/scripting/user-scripts/preview.js` 通过既有 Broker、精确 documentId、用户站点授权调用原生 `userScripts.execute`；Sidebar 可选择固定 jQuery 3.7.1 | 2026-10-08 提交 c313a6b、3d24e82、2c8bf77；CI/Node 是组件证据，**Chrome 用户脚本开关、真实 DOM 效果与 MAIN 引用保持仍 NOT_TESTED** |
| 原生 / ZIP 正式交付 | R3 与 Sidebar 定向 CI、生产/开发构建可提供构建级证据 | **NATIVE_CHROME_VERIFIED = NOT_TESTED；FINAL_FRAMEWORK_ACCEPTED = NO**。不能用 Linux Node/WXT 取代真实 Chrome 安装与浏览器重启 |

### 最新执行优先级

1. 在固定候选下，用真实 Chrome 138+ 打开扩展详情「允许用户脚本」，验收开发页当前文档一次性 `async main` 的 DOM 效果、精准 documentId、错误、撤权和固定 jQuery MAIN 隔离。不得人工伪造 native ack。
2. 为页面脚本建立**正式资产与准入桥接**：拓展经验证的 Page Program 类型及依赖锁，通过现有 Authority 的真实 Available + Installed + Enabled 证明调用 `chrome.userScripts.register/unregister`，完善重启/升级对账。不得将普通 Controller Task 的 `entryFormat='async-main'` 偷换为页面自动脚本或通过 UI 传入假证明。
3. 原生验收 reload once / nonmatch zero / disable next-document zero、脚本匹配授权、第三方库先后加载、页面 SPA / 关闭重启与安全边界；完成后才按机器账本与同版本 ZIP 开展最终 F3 验收。

本阶段决策详情：[R3 Page Script 预览](page-script-preview-20261008.zh-CN.md)、[原 R3 设计](script-runtime-and-dependencies.md)。

---

## 以下为先前冻结的 R3 分支历史快照（保留原文，不再用于判定最新主干完成度）


> 记录日：2026-10-08；源 main：`7bf72497c14d97a2b5cdedd642c4599c46c1983f`；工作分支：`agent/r3-page-script-dependencies-20261008-1533`；提交 / PR 见实际 GitHub，**未合 main**。
> 实际 Mac 工作区、工作区脏文件、local dist/ZIP、CFT profile、运行中 Writer 进程：**NOT_ACCESSIBLE**。旧 `public-owner.json` 仍记录 `active-implementation`（历史身份不得更改）；`AGENTS.md` 已在 main 允许独立分支并行写，禁止共享 main 和 native 环境。
> 证据等级：`SOURCE_CONFIRMED` 与新增纯模块的局部 Node 测试。只读的 Legacy 审计来自完整附件；**BUILD_VERIFIED/CHROME_TESTED/USER_FLOW_VERIFIED 均 NOT_TESTED**。

## 1. 正式 Task 主线（main@固定 HEAD）

| 环节 | 实际源码与状态 | 证据边界 |
|---|---|---|
| Controller Program Revision | `src/platform/host/controller-methods.js`：`scriptHeads/scriptRevisions`，固定 scriptId/revision/contentHash，**SOURCE_CONFIRMED** | 无本轮真实 Chrome |
| 标准 `async function main()` | main `src/scripting/sandbox/worker-runtime.js` 仍 `new AsyncBody(..., data.body)`，**尚非 main 调用** | 其它未合分支可能在升级；不能直接改动 |
| Sidebar 未保存草稿直接测试 | main `src/ui/script-editor.js` 仍要求 `currentRevision`；**MISSING 于 main** | 独立 PR #4 draft 在实施，不重复编辑 |
| Task Candidate | 未找到独立 frozen Task Manifest/candidateId/manifestHash 的正式持久资产链，**MISSING 于 main** | 不把 Controller revision 当 Candidate |
| Verification | 未找到按 candidateId + target/run/result/业务成功条件校验后批准的正式 Task verification，**MISSING 于 main** | Node PASS ≠ Verification |
| Available + 原子批准/安装 | 未找到 Task Available 受控 CAS/保留依赖资产与授权启用，**MISSING 于 main** | `slotAvailable` 仅是 RunHost 空闲，不是 Task Available |
| paramsSchema 普通用户运行 | Sidebar 只有调试 JSON params，没有 Available 表单+安装后运行闭环，**MISSING/PARTIAL** | 不拼接参数进 JS |
| Controller durable Run/Result/Stop | `src/run-host.js` + controller-methods + `results` 的版本 pin/Stop/retirement **SOURCE_CONFIRMED** | 本轮未做重启真实验收 |
| IDB | `src/platform/storage/index.js` v2；`src/platform/storage/idb.js` 未有 `taskAssets`，**v3 未实现** | 禁止并行 DB 或删库重建 |

## 2. R3 分支增量：已修改与未验证

| 文件 | 改动 | 状态 |
|---|---|---|
| `src/scripting/user-scripts/page-program-package.js` | Candidate/revision/manifest/pageRules/dependencyLock 校验，USER_SCRIPT worldId，once-per-document 包装器，注册描述 | **IMPLEMENTED COMPONENT；未产品接线** |
| `src/scripting/user-scripts/packaged-dependencies.js` | 固定扩展内 URL，校验 jQuery hash，代码不在 SW 执行 | **IMPLEMENTED COMPONENT；未 native 装载** |
| `src/vendor/jquery-3.7.1.min.js` 与 `src/vendor/jquery-3.7.1.LICENSE.txt` | 官方 `jquery/jquery@3.7.1` 完整包和 MIT | **SOURCE_CONFIRMED；package 未本轮 build** |
| `scripts/build-contract.mjs`、`scripts/build.mjs`、`scripts/verify-package.mjs`、`scripts/check-source.mjs` | 源码侧与产物侧分别校验 vendor 精确 SHA256/byte allowlist，校验 Runtime/Build 锁一致，不开放网页 MAIN WAR，不变更原 11 条 WXT entry | **修改候选；BUILD_NOT_TESTED** |
| `tests/environment/page-program-package.test.mjs` | module 4 项安全/行为 Node 测试 | **4/4 local Node PASS，Chrome NOT_TESTED** |
| `docs/architecture/browser-framework/third-party-library-map.md` | 完整移入 Legacy 双表审计、旧发现与 UNKNOWN；前言标识 main/Writers 已 superseded | **仓库分支已落盘；合 main 待审** |
| `docs/architecture/browser-framework/script-runtime-and-dependencies.md` | 决策 ID、否决方案、Task 与 Page 分离、安全与验收 | **人工决策；非机器 PASS** |
| `docs/framework/workstreams/r3-page-dependencies-20261008-1533.json` | 独立 Agent/workstream 身份、范围与证据 | **工作流记录，不改中央 owner/ledger** |

P1 尚未实现用户编辑/即时测试/启用 UI、register/unregister 实际调度、刷新/nonmatch/停用 Chrome 效果；P2 尚未证明原生 USER_SCRIPT 中 jQuery 的 DOM 效果、不同版本隔离、MAIN 兼容、资产引用 GC。**原有侧边栏 Controller/Authority/RunHost/Storage/Native Driver 全部不改写。**

## 3. BLOCKER / 风险 / 下一步（仅三项）

1. **先合并协调 Task 主线**：围绕 `src/platform/storage/idb.js`、`src/platform/host/controller-methods.js` 和 PR #4 的草稿运行，完成 Candidate→Verification→Available 的 v3 数据/事务合同、可用状态和 revision pin；**通过条件**：固定 revision + manifestHash 的真实验证/授权状态，可在重启后读取，且无旁路发布。
2. **接入 PAGE_USER_SCRIPT 与安全 UI**：由既有 Broker 提供 `authority.assertAvailable` 并受控调用 `chrome.userScripts.register`，由 Sidebar 启用/禁用和可信 target 授权调度，保存注册对账，沿用本文组件；**通过条件**：Chrome 执行证明 reload once、nonmatch zero、disable next-doc zero，刷新与 stop 的限制清晰可查，扩展重启可恢复配置。
3. **同一候选做构建+原生 jQuery 验收**：对 `scripts/verify-package.mjs`、`vendor/jquery-3.7.1.min.js` 和原生 `userScripts` 执行真实 build/ZIP/hash、USER_SCRIPT DOM、MAIN $ 引用未改变、错误阻断与业务回执；**通过条件**：同 HEAD 同 ZIP 可复核 `BUILD_VERIFIED` + `CHROME_TESTED` + 必要完整用户链，未通过不标 Available。

详细依据与反方意见：[运行/依赖决策](script-runtime-and-dependencies.md)、[原始迁移双表](third-party-library-map.md)、[原机器账本](../../framework/source-compatibility-ledger.json)。
