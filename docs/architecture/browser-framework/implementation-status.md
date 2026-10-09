# OpenDesk Browser 当前实施状态（人工交接，不代替机器账本）

## 2026-10-09 R8.1 E07.1 Page Candidate 独立切片（PR #31 已合入 main）

**main 正式集成回执**：PR #31 → `c0303f6b1c25504ddc9fdd88e44d9016407abb90`（父提交 `d2c6f9d2` 和 `fee4ef12`），GitHub CI 中 Page 131/131、新 Candidate 8/8、Canonical 14/14、Backlog 3/3、check 174 文件，生产/开发构建、verify、ZIP/dist 字节一致性均 PASS。产物 hashes 为 `9622cb829b8987c755963c5f59399317b4a7605dd9747e45b013dd3b86ac474d` / `f0a85682d8ec454558d8434257b8637d8315f850040e5121636117dfb3d24818`。生产 SW 接近 327680 bytes 上限，下一增量必须先评估减重；真实 Chrome/Page 安装/Native Agent/Codex/F3 不因此自动验收。并行主线其余测试仍分别绑定各自回执。

仅实现可信 Host 驱动的 `importPageCandidate/getPageCandidate` 与现有 `frameworkKV` 不可变候选，沿用原 DependencyManager 解析/锁及原 Broker 验证。支持带明确 `@match` 的受限 D1 元数据脚本；按 namespace + programId + revision 阻止变相覆盖；Candidate stage 固定，拒绝脚本自行声称 Available。无运行、安装、批量列表、GM、定时或原生注册能力。完整 E07/E09/E10/E12 仍属 `PARTIAL/MISSING`。

- 同候选 [PR #31](https://github.com/shopable-ai/opendesk-browser/pull/31) 代码 SHA `77e533c3e6446a0687fe69575c4257bf06da9650`：环境 Page **125/125 PASS**、新增 Candidate **8/8 PASS**、Canonical 页 **14/14 PASS**、Backlog **3/3 PASS**；源码检查 **174 files PASS**；Production/Development build、verify、pack 和 ZIP 与 dist 字节比较全部 PASS。
- WXT 生产 `packageHash=cc6553dc15d3a48291530159e209a42cc6399499d61c9a88d3233656039a7229`；开发 `packageHash=c6748570cf1b8eeafbaf23d8f5cc8381a102fa80463aa434f8567d216fe29752`，属于候选构建而非发布验收。最初两次 SW 预算失败分别为 334316/328078 字节，修复采用已有 Manager 且不放宽 `327680` 上限。
- `CHROME_NATIVE_VERIFIED=NOT_TESTED`，`USER_TASK_VERIFIED=NOT_TESTED`，`FINAL_FRAMEWORK_ACCEPTED=NO`。本组件测试不证明 E09 Page 验证、E07.2 已安装脚本、E10 浏览器注册或 E12 可信启动消息已完成。原 Native CFT 失败保留独立证据，不因本切片通过而关闭。

## 2026-10-09 R8 Engineering Program R1 执行复核

本轮从真实 `main@945cf92726fcadcd60ecb3dc70729029fb9f28e6` 建立隔离工作区，持续同步并行主线。元数据审查切片及完整计划由 [PR #25](https://github.com/shopable-ai/opendesk-browser/pull/25) 合入 `70fb3449ae97cfdf69b4fc83f0466e36f8501006`；随后另一并行集成者将 [PR #11](https://github.com/shopable-ai/opendesk-browser/pull/11) 合入 **`main@189a7037afce89efe7fef7772e781fd70643143c`**，PR #20/#22 一并进入主线。PR #11 已关闭、已合并、非 Draft；其完整 Native/Chrome/Codex 用户验收仍未通过。

[唯一执行计划](../../product/browser-automation-r8-implementation-plan.zh-CN.md) 保留 E01–E40 稳定 ID、40 项工程任务、15 个工程模块、R8.0–R8.6 门槛、14 项增量 ADR、依赖与下一批 GOAL。原 [188 能力目录](../../product/browser-automation-feature-catalog-r8.zh-CN.md) 继续是唯一功能总账本；当前源码归类为 **21 S / 80 P / 87 M / 0 U**，每个 ID 只有一个工程主责，独立评分不平均成完成率。规划与目录条目不代表实际实现或原生验收。

**收尾增量基线为 `main@bd47d40c9cf88af6942fe35c7468a92c3042c2d1`**，已在独立分支无冲突同步。189→bd 无扩展运行时/构建输入变化，新增工程样例、Native 观察与 CI 门禁；当前增量 44/44、check 161 PASS。mainbd Node 环境 276 PASS/5 SKIP/0 FAIL，Page CI 通过 ZIP 与 dist 逐字节一致性。新的 ARM/Intel CFT 各 0 PASS/2 FAIL，连不加载扩展的 bare renderer 基线也超时；工作流已移除 continue-on-error，真实显示失败。下表 189/f1ca/35fd 结果保留各自身份，最新变化与原始日志见执行计划 **10.6**；不能把旧 278 项本地结果或旧 CFT 0/1 当作新分母。

**最终运行时基线已再次同步为 main@74d261b7**：并行新增受限 Sidebar 工具包、opaque UI sandbox 与本地 packer，三一级页签不变，工具不能自动启动 Task。构建输入已变，最新生产/开发 hash 为 2633c571… / 1124f3fa…；本轮新组合 72/72 定向、check 167、双构建/verify/pack PASS。当前 UI 工具的局部版本/能力/安装存储尚未统一 ProgramRef/Authority，E39/E40 明确限制后续扩权。双 macOS 原生诊断仍各 0 PASS/2 FAIL，详情与精确 hash 见执行计划 **10.7**，下文旧 189/bd 回执只保留历史身份。

**发布前已无冲突同步 main@5769730**：保留并行 Page UI/资源构建和真实工具 Host 消息测试、跨窗口失效；当前本地组合 49/49、check 172、双构建/verify/pack/ZIP 对字节 PASS。生产/开发 packageHash 已更新为 75dd897f… / e61be2a4…，原 main74 哈希只作历史。最新完整值见执行计划 **10.8**；main576 Native workflow 仍 failure，本地 Chrome/Codex/安装后用户任务/F3 均未关闭。

### 本轮实际产品与集成修复

1. **E08/E40 元数据审查切片已经进入 main**：`src/ui/page-dependencies.js` 对晚到 inspect/prepare 结果及审批前的当前源码重新准入，修复相同依赖下旧结果覆盖新 `@grant/@resource/@include` 拒绝，以及缺少 input 事件时的审批复查。依赖列表/锁可复用，当前源码策略必须重算。`dependency-metadata.js` 在既有审核区显示 `@antifeature` 纯文本自述。没有新增权限、运行内核或 Sidebar 页签，也未开放不支持的 GM。原产品审查 SHA `84dc3c7abe08505ae5e24849315dc8dd5587932d` 保留为本地证据身份；远端 PR #25 head `a884942e63a82220c4188ca73dbe232b1a48387b` 与原审候选完整树相同，不能因本地 SHA 不是远端祖先就重复实施。
2. **E04/E06 HTTP 消费者修复**：main189 保留了单个“发送 GET”网页按钮及标准 fetch，但遗漏的 `examples/tasks/http-axiosx-page-draft.js` 仍查找旧按钮并声称 SDK axiosx。当前产品提交 `35fd8a27c7364a8e5cfe6993ab07324423224e19` 修正实际 Locator 与 `page-fetch-through-page-api`，增加真实草稿→实际页面处理函数→原 HTTP server 的 200/503 回归，并同步本地验收 GOAL。网页 fetch、MAIN SDK axiosx、Controller axiosx 独立取证，不新建服务或把页面 CORS 绕过当成功。
3. **主线复用与历史冲突已核对**：标准手工测试入口仍为 `examples/tasks/demo-form.html`；README 的旧 URL guard 曾触发并由并行 `ca3e765` 等价修复，未放宽断言。PR #22 fixture 现为 `tests/fixtures/program/d1-userscript.html`。早先 main70 与 Native75 的三个文本冲突已由 main189 解决，仍存在的独立 HTTP 草稿消费者缺口由上项修复；不重复建设 Native、Program Source 或 HTTP 底层。

### 分层实际证据

| 验证层 / 身份 | 本轮真实结果 | 精确范围与限制 |
| --- | --- | --- |
| 源码接线 | SOURCE_IMPLEMENTED | 当前元数据准入、已有 UI/Broker 与 HTTP 草稿实际消费者接线；无额外 Task/Storage/Auth/Network 模型 |
| 元数据切片组件 / PR #25 | COMPONENT_TESTED | 定向 71/71；5 个新增行为在旧实现失败、修复后通过。main70 发布树环境 201/201，后续 Native 主线扩充后的全量结果另列 |
| 新 HTTP 切片组件 | COMPONENT_TESTED | 旧实现 0 PASS/2 FAIL，修复后定向 16/16；使用现有真实 HTTP 服务，DOM harness 与 Node fetch 不是原生输入/CORS 验证 |
| 当前本地完整环境组 | PARTIAL，命令 exit 1 | 重建当前 dist 后 278 项：268 PASS/6 FAIL/4 SKIP；六项均在 Native Host fixture 的 Unix socket listen 返回 EPERM。未跳过/改写失败测试，不标全量 PASS |
| main189 已读原始 CI | COMPONENT_TESTED 于相应基线 | Page 123/123、canonical 12/12、backlog 3/3；Sidebar 149/149、Locator 15/15、驱动 Node 合同 34/34；多文件 37/37；同树 HTTP 88/88 |
| Native 最终 head f1ca 同树 CI | COMPONENT_TESTED | Native 47/47、共享 58/58、环境 272 PASS/4 SKIP/0 FAIL；这是具备 socket 能力的 CI 环境，未包含本轮新增两个 HTTP 回归，也不抹去本地环境失败 |
| 静态与产物 | BUILD_VERIFIED | 当前 `npm run check` 160 文件；生产/开发 build、verify、pack 均 PASS；packageHash 与 main189 CI 相同，实际哈希见执行计划 10.5 |
| PR #11 集成候选 f1ca 的 macOS/CFT | PARTIAL，真实 Chrome 步骤失败 | Host/CLI 模拟 framing 3/3；CFT 155.0.8059.39 真实步骤 0 PASS/1 FAIL，`real unpacked OpenDesk extension ID timed out`，exit 1；continue-on-error 导致工作流绿色不等于原生 PASS |
| 本轮本地 Chrome / 用户任务 / Codex | NOT_TESTED | 本轮未启动 Chrome/CFT 安装或占用用户本机；用户 Mac 路径不可访问，实际审查、网页效果、开关/权限、重启、安装后独立重跑和停止需要本地接管 |
| 最终 F3 / ZIP 安装一致性 | NOT_TESTED / 未关闭 | 原完整冻结验收合同仍有效，不能用 Node、旧候选或打包成功代签 |

完整命令、SHA、失败/通过原始日志、独立 build/pack receipt、PR 时间戳与审查见 [工作流回执](../../framework/workstreams/r8-engineering-r1-b62cc961.json)、[证据目录](../../framework/workstreams/evidence/r8-engineering-r1-b62cc961/) 和执行计划 **10.4–10.5**。当前生产 SW 为 **324976 / 327680 bytes**，余量 **2704 bytes**；旧 main70 的 314 bytes 余量仅是历史记录。新增可信服务仍须守住原预算。

### 尚未关闭的产品门槛

- 正式 Page 类型专属 Candidate/Verification、安装持久状态、userScripts register/update/unregister/getScripts 对账、启停/更新回滚和重启证明仍 **PARTIAL/MISSING + Native NOT_TESTED**。当前预览和注册描述不能替代这条链；沿用既有 Controller、Authority、RunHost、IDB v2 frameworkKV、Task revision。
- Native 六方法、HTTP 服务、Program Source 消费者已在 main，继续定向验收；Native Host 只是认证 IPC，实际执行仍在活跃 Sidebar 的原 RunHost、期限最多 120 秒。它不构成独立长任务、常驻后台或 MCP 服务。
- 多文件 ESM 构建、开发 source-map 和映射辅助函数存在；原工程快照持久化、重启后恢复及运行时错误→原模块 UI 消费者仍不完整。禁止把“可生成 map”写成“可完整源码调试”。
- GM API、@connect 网络兼容、Background/Cron、UserCSS、跨浏览器按任务实施。USER_SCRIPT 消息通道不直接证明脚本身份；真实安装代次/脚本实例认证是特权 GM 的门槛。fetch 是浏览器 API，axiosx 是已有 SDK，均不是完整 GM_xmlhttpRequest。
- 当前广泛 manifest 权限不自动下发给脚本；公开发布前的最小权限及供应链审查仍未关闭。**FINAL_FRAMEWORK_ACCEPTED=NO**，不以源码合并、平均分或部分组件通过改写。

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
