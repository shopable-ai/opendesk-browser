# GOAL：OpenDesk Browser Cloud Control R3 · Mac Chrome 最终测试、修复与正式验收

日期：2026-10-12。默认中文。本文件是**本机 Codex 执行 GOAL**，不是 Cloud Control 的新架构设计提案。

## 一、核心目标与执行边界

- 唯一仓库：`https://github.com/shopable-ai/opendesk-browser`
- 用户 Mac 本地目录：`/Users/shopme/Documents/workspace/opendesk-browser`
- **唯一可写分支：`main`**。禁止新分支、新 Git Worktree、PR、强推、破坏性 reset/clean。
- 允许在无并行冲突、必要测试完成且安全的前提下直接修复源码、提交并推送 main。
- 不能占用、终止或删除其他 Agent 的 Chrome Profile、localhost 端口、原始 Provider 状态、`.local`、`dist`、证据目录。
- 不得安装第二套云控 Task Authority/RunHost/Worker/Result，不得通过额外 Host 或 offscreen 页面实现挂机。
- 不得仅输出测试方案或静态截图；必须读原始实际源码、使用真实 Mac Chrome/CFT、执行实际受影响测试并保留原生证据。确实无法操作的必须登记 BLOCKED/NOT_TESTED。

### 已经完成的远端 R3 证据（只对应指定代码候选）

- 已通过的云控组件、导航、Host 控制器、Authority、Provider 和双构建候选：
  `e9e4fd513cc117360b44ab80d1a0919d37f26866`。
- 真实 GitHub Actions：https://github.com/shopable-ai/opendesk-browser/actions/runs/38249509707
- cloud-r3-component：**201 PASS / 0 FAIL**。
- cloud-r3-package：`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` **PASS**。
- 该候选生产包 packageHash：
  `e14999103d090de93c3a540ce1109501b9070061dd6320093f4d6a31e1751a98`。
- 该候选开发包 packageHash：
  `1b5d89bd2bfcc0ceb77c99b54fb8c7850da9afc0bd00a6f1b26a6bd674eb1572`。

**重要**：上面的 SHA 是可信的 R3 代码/CI 复用锚点，**不是对未来 main HEAD 的猜测**。
本地实际开工先记 `git rev-parse HEAD` 和 `git rev-parse origin/main`，
与上面锚点执行相关文件/传递依赖差异分析。若发生新的源码、构建输入或
合同差异，则为受影响项跑新的测试和包哈希；旧 CI/包哈希保留为历史，不抬升为
新候选通过。普通文档增补不需要盲目重复全部原生 Gate1–3。

## 二、首先读取这些文件与原生检查点

阅读并遵循：
- `AGENTS.md`、`docs/framework/testing-guide.md`、`docs/framework/parallel-development.md`。
- `docs/architecture/browser-framework/cloud-control-r1.zh-CN.md`。
- `docs/architecture/browser-framework/cloud-control-workspace-runner-r2.zh-CN.md`。
- `docs/architecture/browser-framework/cloud-control-r3.zh-CN.md`。
- `docs/architecture/browser-framework/scheduled-tasks-r1-design.zh-CN.md`。
- `docs/architecture/ui-layout-conventions-r27.zh-CN.md`。
- `docs/framework/workstreams/cloud-control-r1.md`、`cloud-control-r1.json`。
- `docs/framework/workstreams/cloud-control-r3-20261012.md`。
- `examples/cloud-control/README.zh-CN.md`。
- 实际源码 `src/cloud-control/`、`src/platform/host/`、`src/run-host.js`、
  `src/ui/tool-shell.js`、`cloud-hosting.js`、`cloud-status-presentation.js`、
  `cloud-control-console.js`、`src/ui/tool.html`、`src/platform/storage/idb.js`、
  `scripts/cloud-control/`、`tests/cloud-control/`、`tests/framework/k3-controller-authority.test.mjs`。

本次不能靠旧对话里记住的路径和 PID 假定资源仍在运行。先只读核查
进程、Profile、服务端持久目录、已加载扩展版本、原 Run、Provider 状态和原证据哈希。
先与并行资源占用者核实，不擅自重启或抢占。

## 三、特殊 P0：不可重放的原副作用后中断现场

R1 交接 `docs/framework/workstreams/cloud-control-r1.json` 存在
`pendingUnknownCase`，历史原始凭证为
`docs/framework/workstreams/evidence/cloud-control-r1/native-effect-interrupt-1791733558986.json`。

**历史原事实**（请重新从实际文件确认，不当作当前进程事实）：

- Job：`584bcbd1-eefa-4f78-8c52-8761a004dd4e`
- Request：`cloud:ed794251-e8b3-4345-8dfc-6e98e15181ab`
- Run：`afd37543-f456-45f6-9e12-ea3548e65d4d`
- Reserved resultId：`0b388df6-783c-47b0-a8f9-3e9fd2df20a3`，
  **该预留 ID 本身不是完成 Result**。
- 中断前原 Worker 的真实 Typed 效果回执已观察；retirement 还是 not-started。
- 扩展当时被 Chrome 原生 UI 禁用，Provider 当时 admitted；重启后终态未回收确认，
  **NOT_TESTED_RECOVERY**。
- 历史 CFT Profile 位于 `/var/folders/.../codex-cft-eyauw4w0`，
  历史 PID 97044、扩展 ID `bldkfieeffncnmjgnmlkmdmimicflfen`，
  这些数值可能早已失效，不得假定仍然活着。
- 旧 `native-session stop` 指令会删除 Profile，绝对禁止对原现场执行它。

执行顺序：先只读核对原始证据、原 Provider/Run/Result/slot/receipt；
确认真实 Profile 尚在且为当前授权者独占后，再按原 Chrome 原生操作
启用扩展、观察**同一个**原 Request 的 SW 对账与不可重复效果保护。
**不得**重投原请求、换 requestKey 或 requestId 重做效果、手写 IDB、
篡改 provider state.json、伪造 Result、强行释放原槽或重建 Profile 掩盖未知。
如果原现场消失或没有操作授权，记 `NATIVE_PENDING / EVIDENCE_INCOMPLETE`，
不要模拟它通过。

## 四、P1：正式 Side Panel + 独立控制台的 Mac 实测

分别加载受检生产包与 development 包，分别绑定独立实际 packageHash。

1. 生产 Side Panel 精确六个一级页签：我的｜发现｜工作流｜开发｜工具｜云控。
   development 为六个加第七「调试」；生产 Debug 无法经 URL、localStorage、
   Tab 记忆、工具页、脚本消息等访问。
2. 300 / 360 / 420 / 520 CSS px、125% 和 200% Zoom：
   顶部页签局部横向滚动，正文、云控卡片、按钮、长连接文字不造成横向溢出。
   执行真实 scrollWidth、元素截屏、可见焦点及文字对比度测量。
3. 键盘 ArrowLeft/ArrowRight/Home/End/Tab/Shift+Tab；
   role=tab/tabpanel、aria-selected、tabIndex 及当前 tab 焦点同步。验证触控板。
4. 「我的」简洁云控入口能打开第六页；「工具」不作为云控安装入口；
   多次切换「我的 / 云控 / 开发 / 工具」期间，原 Run/Stop 所有权不移动。
5. Side Panel 中真实点击「在大页面打开」后，
   Chrome 打开正式 `chrome-extension://<id>/ui/cloud-control.html`；
   控制台提供连接/对账/槽/授权任务计数、状态筛选、20 条分页、
   已确认 receipt 与原资源释放状态。空/异常/离线/长列表/窄屏均可读。
6. **关键 Observer 安全**：对比打开前后的原 Host registration、
   原 `commandJournal`、原执行槽及 Cloud Provider claim 记录；
   仅打开控制台、分页、筛选、刷新不能注册第二个 Host、
   发起 cloudNext/cloudResolve、增加新的 Run、grant、startPermit 或真实副作用。
   普通网页、Tool Sandbox、完整任务目录、伪造文档/Tab/Frame 对
   `cloudObserve` 和敏感 Cloud RPC 必须由真实 Chrome sender 验证拒绝。
   不能用 DOM synthetic event 或手动伪造 sender 作为原生通过证据。
7. 关闭控制台不停止原 Side Panel Run；关闭 Side Panel 后
   **不宣称浏览器仍可无人值守运行**。可见 Runner 尚未交付，不开放开关。
8. 真实 Chrome 采样同时核对生产 Manifest、extension CSP、
   静态资源清单、包大小和未额外增广权限。输出可审阅的截图与数据。

## 五、P2：Gate 4 不可省略的可靠性现场

分别对**新且经授权的安全测试任务**执行，不复用第三节未知效果的旧请求。

- **真正运行中 UI Stop**：选择可以稳定持续足够时间、具有可观察
  原运行状态的安全任务。在 Controller Run 仍为 running/原 Worker 尚活时
  通过真实 UI 点击 Stop。记录点击前、动作时、动作后原
  Run/cancelSeq/ownerEpoch/commandJournal/Result/retirement/released/receipt。
  如果任务先 completed 才点击，判定 **FAIL/NOT_TESTED**，不得算通过。
- **权限撤销**：运行过程中撤销实际 Chrome 网站权限；
  另一次撤销已安装 Task 授权/禁用固定版本；另一次停止托管和解除配对。
  原效果不能假装回滚；后续页面操作必须被原 Authority 栅栏拒绝。
- **IDB 事务失败**：在单独隔离、可恢复、无用户生产数据的 Profile 中，
  注入受控 QuotaExceededError/事务 abort，验证原 Run/slot/permit、
  commandJournal 原子准入回滚；未持久批准不能创建目标或派发 Worker。
  不对用户现存 Profile 盲目填满磁盘、删除或清空数据库。
- **回执丢响应**：合法独特 requestKey 的任务，Provider /v1/receipt 响应断开后
  只重发原 request + 同一 durable Result，provider receipt 必须唯一；
  无新的 Run、Worker 业务操作提交。
- **租约过期终态**：先确认真实原 Result、retirement=released、
  Provider receipt=confirmed，随后让原远端 lease 合法过期/对账，
  该任务不得被投影成 E_CLOUD_CANCELLED；有真实不确定终态则保持 UNKNOWN。
- **SW 重启/浏览器重启/断网/升级**：已有相同包/相关输入的原生
  PASS 可按 testing-guide 复用；只补改变的代码或缺失的断言。
  不强制重跑原已完成副作用任务。
- **迁移与性能**：对旧 `cloud:config` 缺 `pendingRequestId` 的安全测试 DB，
  只做一次原 waiting 请求恢复；之后的 2 秒轮询验证 KV 全历史扫描不再发生；
  original Run admission 必须在原事务中清除 pointer。
  对过期未执行 assignment，应成为 E_LEASE 并不创建原生效果。
  对 100 / 1000+ 条安全虚拟历史观察只读分页响应、查询耗时与内存。
  **注意**详细 Observer 历史仍使用全量 KV 扫描，尚未有原生索引/游标实现，
  性能不能记 95+ 或声称百万请求通过。

## 六、P3：长时间 Runner 与本地/云端调度的边界

- `src/cloud-control/host-owner-lease.js` 已有 dormant 的原 IDB
  atomic claim/renew/release/epoch fence，并由 Node 测试覆盖。
  **当前并未绑定到 RunHost 或云端派发**；不得通过开启假开关或
  新建 offscreen 执行页把它宣布为正式 Runner。
- 原 `runs/@slot` / Controller Authority 是最终真实执行事实，
  Owner Lease 仅是未来唯一派发身份约束，不代替权限授权/Result。
- 继续设计/实施前先验证真实 Side Panel 与候选可见 Runner 的
  sender/registrationId/generation/fencingEpoch 交接安全，
  迟到旧 owner、许可过期、关闭页及未知效果禁止重跑。
  如果本轮无安全证据，正式 Runner 维持禁用并登记 NOT_IMPLEMENTED。
- 本地定时任务实现以最新主分支源码为准；复用
  ScheduleDefinition/FireId/Chrome alarms/原 RunHost/原 Result，
  云端 source/generation 原子 ownership 没有验证前，
  **不得同时开启本地 alarm 与云端同一计划的双派发**。

## 七、定向测试、构建与提交

本机首先核对 `git branch --show-current` = main、`git status --short`、
HEAD 与 origin/main、正在占用的 Profile/端口/持久目录；
检查代码变更范围，防止覆盖其他 Agent。禁止 Worktree、PR、force push。

至少执行以下**受影响**命令（对应的旧候选相同输入则可保留复用证据）：

`node --test tests/environment/cloud-control-sidebar-r28.test.mjs`
`node --test tests/environment/cloud-control-debug-r14.test.mjs`
`node --test tests/environment/cloud-control-console-r3.test.mjs`
`node --test tests/environment/cloud-hosting-r3.test.mjs`
`node --test tests/environment/sidebar-tab-memory.test.mjs`
`node --test tests/environment/task-workbench.test.mjs`
`node --test tests/environment/workflow-r15.test.mjs`
`node --test tests/environment/sidebar-ui-preview.test.mjs`
`node --test tests/framework/k3-controller-authority.test.mjs`
`npm run test:cloud`

源代码检查与包验证：
`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`。

构建前确认根 `dist` / `.wxt` 没有别的 Agent 独占；若被占用，
先请求明确交接，不运行会覆盖产物的构建。每项明确记录代码 SHA、
命令、版本、退出码、通过/失败数和原始日志；Linux CI 与 Mac Native 等级不能互换。

证据追加到 `docs/framework/workstreams/evidence/cloud-control-r3/`
的独立新目录，保留历史 R1/R2/R3 所有 PASS 和 FAIL、包哈希、
截图、请求/运行对账和失败日志，不写入管理凭据或敏感原始结果正文。
只在测试安全、无并行冲突、权限已授权情况下对 main 提交和推送。

## 八、逐项验收/专家评分（10 个独立维度）

必须逐项记录测试依据、可重复原始证据和数值或 NOT_VERIFIED：

1. 总体架构与职责边界。
2. 权限与数据安全。
3. 云任务可靠性与幂等。
4. Side Panel UI/UX。
5. 独立控制台 UI/UX。
6. 响应式与可访问性。
7. 执行性能与资源管理。
8. 自动化测试覆盖。
9. 真实 Chrome 验收证据。
10. 长期运行及恢复能力。

正式各项目标分别 ≥95。任一项目仍未实现、运行失败或证据不足，
必须单独标 **NOT_VERIFIED**，不得用综合评分覆盖。

最终交付：最终 main SHA、实际变更文件、完整测试回执与 Actions 链接、
生产/开发 packageHash、原生 Chrome 证据目录、Gate1–4 状态、
双窗口/Observer 隔离、已确认 receipt、原 Profile 恢复事实、
各项独立评分及剩余阻断。只对真正已测试的功能宣称完成。
