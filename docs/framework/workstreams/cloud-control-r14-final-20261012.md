# Cloud Control R1.4 Final — 2026-10-12

## 独立评审后修复与候选 C（2026-10-12 19:38）

- 负责人仍为本会话；新增写入 `src/ui/cloud-hosting.css`，既有写入 `src/ui/debug-workbench.js`、`src/ui/tool.html` 及对应两个 Cloud UI 测试。共享 `tool-shell.css` 有其他任务未提交改动，本轮不接管该文件；专用 CSS 只恢复原六条托管控件规则并使用现有 token。
- 修复 Debug 任意原始错误码泄露，以固定安全错误码反馈；补测带敏感 code 的失败输入和失败后的复制边界。
- 候选 B 的构建/ZIP 证据保持原样，源码修改后不得升级到 C。C 使用独立物理目录与现有依赖副本，不覆盖根 `dist`；真实 Chrome 与 a11y 仍等待本机解锁。
- C 首次开发构建准确拒绝未登记的新 CSS（ENOENT），原失败日志及诊断保留；新增同一负责人写入 `scripts/prepare-public.mjs`、`scripts/verify-package.mjs`、`scripts/audit-fixed-entries.mjs`，登记固定离线 CSS、必需产物与原严格 CSS 扫描，不改变 JS 入口、CSP、权限或体积预算。这三个文件写前无未提交差异。
- 配套原布局驱动 `scripts/tests/sidebar-r19-layout-visual.mjs` 加入新固定 CSS 的只读静态路由与输入说明；旧布局断言 `tests/environment/sidebar-ui-preview.test.mjs` 和固定资源 fixture `tests/environment/fixed-entries-audit.test.mjs` 同步必需 CSS。后一测试及驱动写前无他人差异，preview 文件原差异均属本轮导航修复。首轮资源测试保留真实失败，修复 fixture 后只补受影响测试。

负责人：Codex 会话 `01a12f5b-8ed0-7782-8277-c1168b30a715`；状态 IN_PROGRESS。

仅在 main 编辑；不推送、不建分支/worktree/PR。开始 HEAD `af54d89b9fd931ae589b48daa080bf52876bfbcf`，fetch 后 origin/main `9e5a65fc`。其他 Page UI 示例和 LAN-origin 工作流改动保留。

写入范围：`src/cloud-control/service.js`、`connection.js`、`scripts/cloud-control/provider.mjs`、对应 cloud 测试、`src/ui/cloud-status-presentation.js`、必要相关 UI；现有 cloud-control 架构、v0.2 合同、示例 README、cloud-control-r1 工作流以及本任务 GOAL/证据。契约负责人为本会话；只读子代理不写共享文件。每次修改前复核相关 diff。

通过条件：旧现场只查询原事实并经真实 Chrome UI 恢复；无非法二次网页动作；完整请求绑定/epoch/撤销负向测试；许可先持久化且拒绝时零目标/Worker副作用；结果与退休/Receipt 独立；输出授权发送前复核；完成结果不因后续租约过期被伪装为失败。组件、构建、原生证据分级记录，五 Gate 不预设 PASS。

资源：原 Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-eyauw4w0` 及 `.local/cloud-control` 保留。原 CFT PID 97044、Provider PID 5208 已不存在；43112 未监听，43111 标准 demo 服务仍为 PID 48261，复用不停止。原 candidate-security 仅用于旧现场恢复；新候选使用本会话独立 `.runtime/cloud-control-r14-final-20261012`。root dist 和日常 development 不写。

执行顺序：原未知副作用现场 → 安全/持久一致性 → 数据与产品 UI → 最终候选定向验证/五 Gate/文档/本地提交。

UI 子代理已交回四文件占用。主代理追加写入：`src/ui/tool.html`、`src/ui/task-workbench.js`、`src/ui/tool-shell.js`、`src/ui/sidebar-tab-memory.js`、`tests/environment/sidebar-tab-memory.test.mjs`、`tests/environment/sidebar-ui-preview.test.mjs`；复核无相关他人 diff。按本 GOAL 将已有云控区域收回「我的」，五个产品 Tab + 开发第六「调试」，历史 cloud 页签偏好安全映射到 tasks。

## main 合并交接（2026-10-12）

状态：`SOURCE_AND_GIT_WRITES_PAUSED_FOR_MAIN_MERGE`。收到用户已授权的 Git 对话 `01a12f80-47de-7343-b3bc-2adb7cae2a75` 交接要求后，本负责人停止本轮源码、测试及共享 Git 写入；不暂存、不提交、不 stash。本轮代码子代理已全部结束，无后台源码/Git 写入者。文档子代理已收到最小收尾并交回的指令，完成状态另记；其范围不含源码、索引或 HEAD。

重点暂停文件：`src/cloud-control/service.js`、`src/ui/cloud-hosting.js`、`src/ui/cloud-status-presentation.js`、`src/ui/tool.html`、`tests/environment/cloud-control-debug-r14.test.mjs`、`tests/environment/sidebar-tab-memory.test.mjs`、`tests/environment/sidebar-ui-preview.test.mjs`、`tests/framework/k3-controller-authority.test.mjs`。为避免契约漂移，同步暂停本轮 `connection.js`、Provider、其测试及其他侧栏导航文件写入。完整路径、逐文件 SHA-256、保留补丁与测试日志 Hash 见 [交接身份](evidence/cloud-control-r14-final-20261012/git-handoff-identity.json)，可恢复差异见 `git-handoff-preserved.patch`；这些不是正式候选 receipt。

必须保留的未提交语义：

- Provider 持久 revoke 后才确认服务端失效；离线本机立即禁止执行，凭据只用于同次撤销重试，重配对轮换身份与代次。
- 请求内部键按 Provider/Executor/Pairing 范围隔离，公共 requestId 保持原格式；同键异内容、旧 Attempt、跨配对与迟到 Claim/Permit 不可执行。
- 完整 Permit 先持久化、原 Authority 再核验；缺失或不合法许可不得创建目标/Worker。网络发送前复核网站、Task 与输出授权；原 Result 只重传不重新执行。
- 已完成且资源释放的 Run 不因后续租约到期被写成取消；真实取消历史保留。恢复退休不确定时保守占槽。
- 云托管位于「我的」，五个产品 Tab；开发「调试」第六，生产隐藏并阻止进入；旧 cloud 页签偏好映射 tasks。保留原托管控制、脱敏只读诊断与停止后资源/回执状态。
- 原 frameworkKV 云关联与 runs/results/commandJournal/@slot 分工保持，不新增第二套 Run/Result/Scheduler；旧无 pairingId 的历史行保持兼容并保守隔离。

交接验证：`handoff-security.tap` 119/119 PASS（Authority 108 + Provider 9 + connection 2）；`ui-navigation-fixed.tap` 38/38 PASS。这两份绑定交接时逐文件 Hash；此前 `targeted-security-final.tap` 122/122 PASS 包含 recovery/task-package 定向验证，后续绑定发送和有限租约校验已由本次 119 测试覆盖基本回归，未假称全部负向场景覆盖。最新源码尚未构建、未绑定新包、未完成当前候选五 Gate；合并改变相关输入后仅补受影响验证。

资源仍由本会话占用，Git 合并不需要停止：原 Provider PID **11416**，43112，源码为旧 candidate-security，state `.local/cloud-control`；原 CFT PID **11427**，Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-eyauw4w0`，原扩展 ID `bldkfieeffncnmjgnmlkmdmimicflfen`。标准 demo 43111 不归本会话，不停止。没有 root dist/development watcher 或新候选构建进程；独立新候选尚未创建。不得删除 Profile、Provider state 或 IDB；不要将旧运行服务替换成当前源码。

历史恢复：原 Job `584bcbd1-eefa-4f78-8c52-8761a004dd4e`、Request `cloud:ed794251-e8b3-4345-8dfc-6e98e15181ab`、Run `afd37543-f456-45f6-9e12-ea3548e65d4d` 已通过合法原生 UI 重新启用原扩展进行观察；仅 1 Run、1 Result `0b388df6-783c-47b0-a8f9-3e9fd2df20a3`，无中断后派发。Worker 已退休，Target 创建跨 browser incarnation 无法确认，retirement=fenced、槽未释放、无 Receipt，正式状态 **BLOCKED**。原始 JSON/包身份与摘要均保留，不 reseed、不重跑、不伪造 release/PASS。

交接 HEAD `af54d89b9fd931ae589b48daa080bf52876bfbcf`；origin/main `e5852c5db056eb58498a7cc5eec0f944ae60e4f8`，ahead 9 / behind 80。索引为空，未 commit/push。本轮 GOAL 仍未完成；源码/Git 在主分支合并交接期间暂停，收到明确完成交接后再核对现状、续接受影响实现与验收。

文档子代理已完成并关闭，四份文件已交回；所有本轮写入子代理均已结束。三份正式文档已整理功能/数据/状态/故障/多端矩阵，80个本地链接核对有效；文档独立保留补丁及逐文件身份见 `git-handoff-docs.patch`、`git-handoff-docs-identity.json`。后续本会话不继续写源码、测试、正式文档或共享Git，等待主分支合并交接完成；后台只有旧现场Browser/Provider，均不写共享源码或Git。

资源更新（2026-10-12 18:05 +08:00）：本会话在独立只读稳定观察后正常收尾旧资源。Provider PID11416 经命令行归属核对后SIGTERM，原CLI正常exit0；CFT PID11427经原生Chrome应用菜单退出，正常exit0。43112已无监听；原Profile、IDB目录及`.local/cloud-control/state.json`均存在，无数据删除。原退休仍BLOCKED，退出进程不冒充retirement released。原始新证据为`historical-stability-1791799143631.json`和`historical-resource-stop-observed.json`。源码及Git暂停状态保持，研究子代理仅查官方资料、不写文件或Git。

## 合并完成后续接

用户授权Git对话已明确交回源码/Git：main HEAD `0593cba4ba022ba36c20157cc8870412e1ea0263`，origin/main `e5852c5db056eb58498a7cc5eec0f944ae60e4f8`，ahead10；索引为空、无冲突、未推送。本负责人恢复本轮原源码/测试/文档范围写入，保留其他React/LAN/library任务所有差异。源安全身份语义、My托管/Debug第六、有界cloudStatus、redacted cloudObserve、只读固定控制台及cheap poll分离均按合并后实际源码复核。新增组合测试文件声明：`tests/cloud-control/browser-provider-integration.test.mjs`（仅本会话负责人）。当前未正式冻结新候选；旧原生证据不升级。

独立架构审阅发现legacy config→升级Provider配对迁移组合缺口及事务摘要文档失真，待受控修复。UI审阅的四项P1中，最近请求排序已被远端有界查询修复，按当前源码不重复修改；继续处理当前网站权限事实、槽/资源原因、读取失败残留肯定指标与操作错误反馈。新字段只做原数据的脱敏投影，不新增执行或存储模型。
# 2026-10-12 19:05 增量验证与写入范围

本轮原生资源：独立 `.runtime/cloud-control-r14-final-20261012/candidate-a`（普通源码拷贝，非 worktree）及其独立 dist/.wxt；生产 packageHash `8a8202c323dd27314972ca323d170bf4881f1b065eac7e91412ffa83253e8cba`，开发 `fba4417c6414ec8d5bf7d407daa363265b62fb82172506fbdf2480f5a4eab723`。新 CFT 使用独立新 Profile/动态 CDP，只用受控 mock-keychain 参数；任务复制 launcher 唯一修改为退出保留本任务 Profile，skill 原文件不变。旧 unknown Profile/IDB/.local state 不变。Provider 将独占空闲 43112、持久目录 `.runtime/cloud-control-r14-final-20261012/provider-a`，不使用旧 state；demo43111 仅复用，不停止或修改共享server。其他 R16 CFT/CDP43139/其 native bridge 不操作。源码在当前候选后的任何相关变化需形成新候选，旧原生记录不升级身份。

第二次 main 合并负责人 `01a12fb9` 已记录索引/HEAD released，当前 HEAD 为 `e859cf1942d2fc3dd70c4658052eecf51d60c68f`。保留其全部合并与本地改动，仅继续本任务文件。新增写入 `src/ui/debug-workbench.js`，清除诊断读取失败后的旧正向事实；对应负向用例仍由 UI executor 协调 `tests/environment/cloud-control-debug-r14.test.mjs`。原有 `tests/framework/k3-controller-authority.test.mjs` 的 direct request 查询断言允许原安装授权必要查询，按授权基准限制云控新增历史查询；不删改实际授权步骤。真实 Provider/connection 组件 11/11；原定向 156 项为 155 PASS/1 FAIL，首次失败保留在证据目录。



## 当前安全本地交付快照

候选 C 的双构建、严格包验证、ZIP 内容逐文件一致性已经通过；原始 identity/receipts/logs 见 `evidence/cloud-control-r14-final-20261012/` 及正式 `cloud-control-r1.md` 的“Leader 当前候选 C 与独立评审分账”。源码核心/410 构建输入在最终检查时匹配。六维评分 94/94/90/87/93/83，未达 95 原因逐项列入正式账本。

本机锁定仍阻断原生 UI，待用户本机解锁。候选 A 的空库存 CFT 进程 85732 已合法 SIGTERM 并退出（launcher exit 0），原 Profile 原 IDB 保留；没有新 Job/Provider，没有宣称原退休释放。候选 C 尚未启动真实 Profile，因此 extensionId/profile 为 null、native NOT_TESTED。旧原未知现场的 Run/Result/held slot/noReceipt 仍 BLOCKED，旧 state/profile/IDB 完整保留。

下一步只补当前相关原生与视觉验收，再做独立最终 F3 和与已验 dist 相同 ZIP 安装；现阶段局部验证及本地 Git 提交不等于正式发布。禁止推送远端 main。


## 本轮 Git 串行写入窗口

本会话作为用户已授权本地提交负责人，目标仅 main 上已验证的 Cloud 源码/测试、固定离线 CSS 资产合同、五份正式文档、本 GOAL、自己的工作流与原始证据。`src/ui/cloud-control-console.js` 仅纳入交接后核对的单行 Cloud Observer 注释，避免旧“NO createHostClient”注释误中严格只读源审计；无执行权或行为变化。共享 `tool-shell.css` / tokens / design-system、Broker、依赖迁移及其他工作流不纳入。

窗口开始核对：main；HEAD e859cf1942d2fc3dd70c4658052eecf51d60c68f；origin/main 43e7e47703b0fff40be2d9e5140dde91d7e20279；ahead11/behind6；共享索引为空，无 index.lock/MERGE_HEAD，无 Git 写入进程；两次 Git 集成工作流已明确释放。仅逐路径 git add，完整 staged diff 审阅；Lore 决策记录明确 native/F3/ZIP 未测及旧现场 BLOCKED。禁止 push、切分支、stash、reset、clean。


用户最新已回复“已解锁”，锁屏事实按原时间保留；本机原生工具与新候选 CFT 身份待复核。当前 native/F3/ZIP 安装仍 NOT_TESTED，不将用户回复当作验收结果。先完成当前安全本地提交、释放 Git 窗口，再继续候选 C 原生资源。

全 staged 空白检查发现原始终端日志/失败 TAP/交接补丁的真实行末空白，以及保存 GOAL 的原尾换行；保留原始 bytes/SHA，不为格式检查改写证据。严格源码、测试、正式文档路径的 diff --check 已通过；本轮 UI writer 工作流含原始补丁也保留原样。

## 候选 C 原生续接（2026-10-12，当前会话 01a13005）

状态 IN_PROGRESS；负责人当前 Codex 会话。起始 main HEAD `6084d4dea8c8c6100c6a6794f839e580741fa07d`，本地 origin/main `43e7e47703b0fff40be2d9e5140dde91d7e20279`；不 fetch/pull/push，不改共享 Git 索引。完整续接提示词和 local-commit/candidate-C 回执已核对；保留其他工作流差异。

本次写入仅此工作流、新增 `evidence/cloud-control-r14-final-20261012/continuation-c-*` 原始证据/驱动，以及本任务 `.runtime/cloud-control-r14-final-20261012/provider-c` 的持久服务状态、专属 CFT 新保留 Profile。不修改生产源码、协议、原回执、历史 Profile/IDB/state 或候选 C dist/ZIP。需要源码修复时另登记具体文件与契约。

复用 C 双构建、verify/pack/ZIP 字节一致性和已有组件证据；本次仅补候选 C 未执行原生/视觉验收。专属 CFT 路径 `.runtime/cloud-control-r14-final-20261012/browser/Google Chrome for Testing.app`；使用原保留 Profile 启动器和 mock-keychain 参数，实际 PID/Profile/extensionId 启动后登记。43111 Python PID48261 只读复用；43112 已核对空闲，拟由 Provider C 独占。其他 CFT PID15706/87029 不操作。

用户已解锁，钥匙串诊断 unlocked=true；原生工具 `cua.getState()` 本次超时，尚未证明桌面可操作。改用启动后专属应用绑定，保留失败。历史未知请求不重复 seed/运行，仍 BLOCKED；当前 C native/F3/ZIP 安装均未通过。
#### 当前网络响应观察驱动范围

- 本会话新增 `evidence/cloud-control-r14-final-20261012/continuation-c-receipt-hold.mjs`，由独立原生子代理负责该单文件；只准备驱动，不操作 CFT/Provider。Leader 独占当前 CFT/Profile 和 43112。
- 用候选 C 原 SW 的 CDP Fetch 暂停真实 `/v1/receipt` 响应，保留真实 HTTP 请求与 Provider 持久事实；原生 UI 撤权后仅将该真实响应释放为网络失败。不写 DOM/IDB，不造 Receipt/ack，不修改产品或 Provider。须真实命中后才能登记补传撤权证据。

#### 本轮原生发现的 Observer 协议缺口

- Leader 独占写入 `src/ui/cloud-control-console.js`、`tests/environment/cloud-control-console-r3.test.mjs`。两文件当前无他人 diff；不改并行任务的 `broker.js`。
- 原生从「我的」打开合法 Console，`E_OWNER`。`continuation-c-observer-console-native-sender.json` 证明 sender 的 id/url/documentId/frameId/tab 完整，`continuation-c-native-script-inventory.json` 证明对应唯一真实 TAB context。
- Console 错用了 `environment.js` 的环境协议，进入 `agents/health-host.js`；Foundation 的 `cloudObserve` 路由未到达。不放宽 sender guard，只改协议引用并锁定发送 envelope 断言。
- 通过条件：定向 Console 组件测试通过；新候选 D 原生 Console 读取成功、无 Host/Run/Result 新增。C 的目录/包/ZIP/失败证据全部保留。D 仅在真实输入已变化后构建，其他 C 验证不重复也不跨包提升。
- 新构建资源：Leader 独占 `.runtime/cloud-control-r14-final-20261012/candidate-d` 与 `evidence/cloud-control-r14-final-20261012/continuation-d-*`。D 从 C 物理 APFS 副本生成，仅替换已登记 Console 源码和对应测试；不把根目录同期其他改动带入候选，不覆盖日常 `dist/development` 或 C。


## 本轮原生进展交接（用户要求切换新对话）

HEAD 仍为 `6084d4dea8c8c6100c6a6794f839e580741fa07d`；本轮没有新增 commit/push，索引为空。实际源码修复只有 Console 协议引用及其回归测试：旧 3/4，新 4/4 PASS。候选 D 双构建、包验证、ZIP 逐项字节一致性已通过，C 证据保留；D 生产 Console 原生读取/刷新成功，runs/results/frameworkKV 均为 0。C 正常云执行、本地独立运行、运行中 Stop、Task 撤权及补传撤权有原生子场景证据；不是整 Gate PASS。

补传撤权原始核对：同一 Run `066807e0-aa17-4613-b02d-37dfd12cd1ca` / Result `55120e0d-12bb-4635-beb1-67e3faf7721f`，三次真实 200 响应持有后客户端超时；撤权后约 110 秒观察到新 receipt 请求 0，Result 未变，completed/workerRetired/released，本地 delivery pending。Provider 撤权前已持久接收，未声称远端零接收。Driver errors=0、cleanupAcknowledged=true。

事务回滚 v7 因 pending-request 扫描异常 NOT_OBSERVED，未 terminate；v8 修复就绪且仅 ARMED，没有 seed 新 Job。用户要求交接后核对 PID94345 的本驱动命令，用 SIGINT 收尾，进程已退出，不声称正常 finish 或 SW 停止。全部网络/Debugger 驱动和两个子代理已收尾；CFT PID17878、Provider PID23150 及原 Profile/state 保留。最后只读快照活动 Run=0。

真实 300/320px、完整恢复故障、生产 Debug 拒绝、五 Gate、独立最终 F3 和 ZIP 安装仍未关闭；历史未知 fenced/held/无 Receipt 原事实保留。完整下一对话指令为 `docs/framework/prompts/cloud-control-r14-handoff-candidate-d-native-progress-20261012.zh-CN.md`，派生核对/原文件 SHA/seed 防重清单为 `evidence/cloud-control-r14-final-20261012/continuation-native-progress-handoff.json`。不覆盖正式全局账本、旧 receipt 或其他任务改动。
