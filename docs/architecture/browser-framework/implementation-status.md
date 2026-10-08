# R3 当前实施状态（人工交接，不代替机器账本）

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
