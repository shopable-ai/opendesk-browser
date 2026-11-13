# 鼠标手势响应与启动延迟优化

## R6 · 2026-11-13 本机核验（验收未完成）

**当前不能判断松开后的动作是否已足够快，也不能判断网页打开后是否及时可用。** 本机已核实已提交基线及工具包同源，但新 Browser 框架尚未成功构建、应用，Chrome 实际安装工具版本未核实；没有有效延迟样本，不报告改善百分比或 Chrome PASS。

本节取代下文历史记录中的“尚未提交／需应用补丁”状态。`66617e66828869f4b17aaedb055289403fe61c26` 已包含在本机 `main` 的 `f41b40e0e25f24ed9a50dc95acac4c311560e0c2` 中，未重放 `changes.patch`，未重做 R1–R5，未创建分支、worktree 或 PR。

### 环境与候选身份

本机观察时间：2026-11-13 00:51（北京时间）。当前为**恢复后的旧静态 development 输出，持续开发服务未运行**，不是 production 验收包，也不是已确认应用 R6 的候选。

| 项目 | 本轮观察 | 证据边界 |
| --- | --- | --- |
| Chrome | 运行 Helper 路径为 `157.0.8103.38`；磁盘应用已为 `157.0.8103.78` | 应用存在待更新差异；浏览器自身版本 UI 未核实，不混用磁盘版本与运行版本 |
| Chrome 主程序 | `/Users/shopme/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，PID 44951 | 已有日常实例；没有启动新 Chrome/CFT 或操作他人的 CFT |
| OpenDesk 扩展 ID | `ccfcjegpkdlgbclopjmadlcjedelidmf` | 来自现有 Side Panel 的实际 `chrome-extension://` URL |
| 实际加载目录 | **未核实** | Chrome 工具不支持 claim 现有内部管理页；未换 surface 绕过该限制 |
| 磁盘开发目录 | `/Users/shopme/Documents/workspace/opendesk-browser/dist/development` | 不代表 Chrome 已从此目录加载 |
| 磁盘 Browser 名称／版本 | `OpenDesk Browser Developer` / `0.1.0` | 仅为还原后的 manifest；运行身份未闭合 |
| 磁盘旧 revision | `e3fd4b6bccf7fe3e57fc063e284103b0763d0b0abebc45288795150461ecb2b8` | 文件时间 2026-11-12 14:32:40；不是 Chrome 已应用回执 |
| 工具正式包 | `mouse-gestures` / `0.3.2`；`app.mouse-gestures` / revision `6` | `--check-project` 返回 `PROJECT_PACKAGE_MATCH`；**安装及运行未核实** |
| 工具 SHA-256／大小 | `a0dccb7ebea18c856998b785845c92a8a955a52a43aa40b6ca991dc88109d772` / 56,840 字节 | 与已提交 R6 候选相同；未改正式 JSON |
| Page sourceHash | `4a87d02601620029eba12b76e0424dce04fcb25aa8e84ddffca271677fe9c9c3` | 包内身份，未替代运行验证 |
| 标准测试入口 | `http://127.0.0.1:43111/demo-form.html` | 端口由 PID 11384 的既有 `passive-form-proof.mjs` 服务占用；未覆盖、停止、刷新其页面或提交表单 |

### 开发环境恢复及具体阻塞

1. 只读检查未发现本仓库现有 dev watcher，原输出锁文件不存在。保留全部并行未提交改动；它们涉及 AI Proxy、Cookie Editor 和部分 Page 框架文件。
2. 使用原 `npm run dev` 和输出锁恢复服务前，备份旧输出及 `.wxt/public`。首次准备资源时发生 `ENOSPC`，尚未进入 WXT 构建。恢复原输出 186 个文件并逐文件核对 SHA-256，恢复 `.wxt/public`，只释放本任务创建的备份占用。
3. 当前可用空间变为约 1.18GB 后，按这一新环境证据重试一次。服务曾监听 `127.0.0.1:43119`，随后首次编译被原可信来源门禁拒绝：`Trusted AI Proxy source changed; review and re-pin: projects/ai-proxy/src/service.ts`，最终 `Failed to build tool-shell`。**这是并行输入的来源审阅阻塞，不是手势故障；未重置该文件、更新 pin 或绕过门禁。** 没有输入变化前不再重复构建。
4. 失败构建产生 78 个文件，尚未达到 `RUNNING`。在原输出锁保护下移除本次半成品，从备份恢复旧 186 文件及 `.wxt/public`，核对全部哈希一致；服务已自行停止，锁已释放，没有 Chrome 重载或工具安装动作。
5. 原生 UI 锁由另一个 owner 持有，申请返回 `native UI busy`。现有 Side Panel 正在 Cookie Editor，不争抢窗口、焦点、剪贴板、原生菜单或锁，不停止其他服务。这独立阻挡 Side Panel「调试 → 本地开发服务」和「扩展」安装版本核验。

环境恢复的前置操作是：**由 AI Proxy 变更的原 owner 完成可信来源审阅并使原开发服务可成功编译，再在 UI 资源可用时核对已应用 revision。** 新框架运行身份确认后，才通过原「扩展」审阅链更新同 ID 手势包；本轮未颠倒该顺序。

### 输入与计时边界

用户后续明确允许使用 Computer Use 或 `opendesk ai` CLI 完成操作，不再以用户手持物理鼠标作为采样前置。CLI 已公开 `mouse.down --button right`、`mouse.move`、`mouse.up --button right` 接口；**本轮尚未发送输入，不能将接口存在计作真实手势通过**。后续样本须标记自动化来源，保留真实浏览器事件和可见效果，不能伪造 `isTrusted` 或用 DOM 调用、模拟授权回执替代。

准备实际采样时，用同一份 Chrome Performance trace 关联导航、DOMContentLoaded、USER_SCRIPT ready、有效 mouseup 处理入口、策略读取前后与动作 API 调用；必要的临时非暂停日志点仅记录阶段，不记录网页正文、Cookie 或凭据。跨执行世界的裸 `performance.now()`、CLI 进程耗时、命令 ACK 或截图往返不能直接相减作为动作延迟。鼠标事件排队、处理入口、授权、动作派发、实际 Paint／导航效果各自保留边界。

热态至少 30 次、页面新文档启动至少 10 次；新文档启动不冒称浏览器进程冷启动。先核对候选身份和一条核心操作，再扩充样本。失败率预先确定完成条件、超时及分母；没有同条件旧版基线，不计算改善比。

| 指标 | 有效样本数 | P50 | P95 | 最大值 | 失败率 |
| --- | --- | --- | --- | --- | --- |
| 页面 DOM 完成 → Runtime ready | 0 | — | — | — | 未测（无分母） |
| 有效手势 mouseup → 动作调用 | 0 | — | — | — | 未测（无分母） |
| 动作调用 → 页面可见效果 | 0 | — | — | — | 未测（无分母） |

`mouseup → 动作调用` P95 100ms 是待验目标；实际瓶颈及是否达标仍未知。共享 Page 启动队列是源码审查提出的潜在开销，尚无实机占时证据，不据此重构。

### 当前 Chrome 功能验收状态

| 验收范围 | 状态 | 原因 |
| --- | --- | --- |
| 左后退、右前进、上刷新、下到底 | NOT_TESTED | 新框架运行及安装版本前置未闭合 |
| 已配置双段、未配置方向、不完整手势 | NOT_TESTED | 同上 |
| 普通右键、Shift 右键、两种菜单策略 | NOT_TESTED | 同上；原生 UI 正由其他任务占用 |
| Esc、失焦、隐藏、页面关闭 | NOT_TESTED | 无当前候选实际输入证据 |
| 编辑区与应排除输入场景 | NOT_TESTED | 无当前候选实际输入证据 |
| 设置停用立即失效、恢复 | NOT_TESTED | 未操作当前安装及其设置 |
| loading 时停用、撤权、迟到回执 | NOT_TESTED | 原生证据缺失；静态安全疑点另做最小诊断，不冒充 Chrome 复现 |
| HTTP(S)、SPA、受限页面 | NOT_TESTED | 未运行本轮功能链 |
| 连续手势、切页、重复动作与残留监听 | NOT_TESTED | 无当前候选连续操作证据 |

### 本轮文件、验证与原始证据

当前业务源码与正式包未修改；本任务只持久修改本工作记录。项目 88 项、框架 213 项、清理 45 项沿用下文已提交历史证据，**未为环境问题重跑全套**。包同源核验、环境恢复及来源门禁结果不提升为 Chrome 功能或性能 PASS。

最小 Node 诊断已复现一项既有框架安全竞态：`reconcile()` 的慢原生读取占住 mutation 队列，`revokePermissions()` 已同步记录精确站点权限撤销，但持久状态仍等待队列；`appExecution()` 的最后一次授权没有核对同步撤权 epoch，`storage.get` 仍可能返回旧 `enabled:true`。普通 ON 和撤权持久化完成后拒绝读取两个对照均通过。**这是产品授权链的 Node 组件失败证据，不是 Chrome 中已执行迟到动作的证据。**

提议修复仅在原 `appExecution()` 入口捕获现有 `permissionEpoch(row)`，最终授权返回前核对相等，复用原拒绝路径；不增加桥调用、不缓存权限、不修改存储协议。该文件已有并行未提交改动，实际 owner／释放未核实；按 AGENTS 同文件单一落盘者规则，只准备精确补丁及内存加载验证，**不把补丁写进工作区产品文件**。回归代码临时加入原 `app-page-programs.test.mjs` 以获取红测，再归入同一补丁并精确撤回本任务新增测试段，测试文件最终与 HEAD 一致。

| 最小诊断／拟议修复验证 | 结果 | 范围 |
| --- | --- | --- |
| 未修复产品＋新增定向用例 | 2 PASS / 1 FAIL | 最后一次授权期间撤权仍返回 ON；原始红测已保存 |
| 内存加载拟议修复＋同一定向用例 | 3/3 PASS | 前置授权撤权、返回前撤权、无关站点撤权不误拒绝 |
| 内存加载拟议修复＋完整受影响文件 | 40/40 PASS | 包含上述 3 项，不与定向数量相加；不是磁盘工作区已修复 |
| `git apply --check` | PASS | 只核对补丁可应用，未实际应用 |

精确补丁：`artifacts/mouse-gestures-latency/r6-mac-20261113/proposed-permission-epoch.patch`，SHA-256 `38f16af807f80433d9cb5816cf50c8b0312a6e4597c957140f39a74d9d1c6fcd`。产品文件前后 SHA-256 均为 `b38019f7f410f0d4d949775fd7076ffa40944907a67337b6252c5ba1b9090593`；loader 只在 Node 测试进程内对原函数作精确两处替换，未绕过 Browser 构建／安装门禁。**工作区内该安全缺陷仍未修复，需由原文件 owner 集成补丁后定向复验，再进入 Chrome。**

安全审查代理随后独立核对精确补丁、loader 及红绿日志，确认拟议修改封住已复现竞态，未额外削弱保护；因实际源码未修复、Chrome 未测，最终仍为 `REQUEST CHANGES`，维持 75/100。

本轮协调 owner：当前对话 `01a1d09f-33aa-7351-b949-356b1cab297a`；持久写入仅本记录，诊断／补丁／日志仅写上述任务 artifacts。共享产品文件只读，不声明他人文件释放；未取得 UI 锁，不释放其他 owner 的锁。两次本任务 dev 进程均已停止，输出恢复完成；未占用 Git 索引／HEAD、Chrome Profile、43111 测试服务或现有原生配对。当前状态为 `WAITING`，等待文件 owner 协调、可信来源审阅及 UI 资源可用。

本机原始材料在忽略目录 `artifacts/mouse-gestures-latency/r6-mac-20261113/`：`environment.json`、`git-status-observed.txt`、`package-check.json`、`dev.log`、`dev-retry.log`、`recovery.json`、`recovery-after-build.json`、`failed-build-files.json`、`trusted-source-blocker.json`；安全候选的 `app-execution-permission-epoch-{red,green,green-file,handoff}.log`、`permission-epoch-test-loader.mjs`、精确补丁及命令／身份记录也在同目录。该目录不提交成重复验收账本；恢复备份已收尾，不保留多份完整输出。

### 五个独立视角评分

分别由五个独立 AI 子代理审查，属于本轮验收证据评分，不是外部认证或物理体验评分；没有真实 Chrome 证据的项目明确扣分，拟议修复未落盘不计为缺陷已关闭。

| 视角 | 分数 | 主要扣分 |
| --- | --- | --- |
| 性能工程 | 55/100 | 实际样本为 0；启动、派发及尾延迟未测，运行候选未闭合 |
| Chrome 扩展架构 | 82/100 | 同候选安装／启动缺证；共享启动队列风险尚未实测 |
| 权限与安全 | 75/100 | 动态组件诊断证实撤权竞态，工作区尚未修复；真实撤权及清理未测 |
| 交互体验 | 68/100 | 原生菜单、Shift、取消和响应缺当前候选 Chrome 证据 |
| 测试验收 | 60/100 | 包同源可确认，实际加载、安装及原生矩阵未完成 |

算术平均：`(55 + 82 + 75 + 68 + 60) / 5 = 68/100`，未达到 95/100。独立结果及代理身份在 `expert-scores.json`；Node 拟议修复绿测不能提升为已安装 Chrome PASS。当前状态为 **SOURCE_SECURITY_FIX_PENDING_OWNER / ENVIRONMENT_BLOCKED / INSTALL_NOT_TESTED / CHROME_LATENCY_NOT_TESTED / FINAL_ACCEPTANCE_NOT_PASSED**。

下一条最重要操作：由 `installed-programs.js` 原 owner 集成上述精确撤权补丁并定向复验；同时仍须由 AI Proxy owner 完成来源审阅后恢复原 dev，UI 资源可用后按“先框架应用，再工具更新，后实测”继续。本任务未取得这些 owner 的交接／释放，不自动应用到其文件，也未提交或推送。

---

以下为 2026-11-12 的历史开发及验证记录，保留原始阶段措辞；当前状态以上述 R6 本机核验为准。

## 本轮目标与基线

- 用户操作：已能画出轨迹并执行动作；本轮减少松开鼠标后的等待，以及打开页面后手势首次可用的等待。
- 基线：`main` / `e0d8e5a233ec1b2f43bea2a27db5708090688971`。当前云端检出初始干净；用户 Mac 的 CodexPro 连接不可用，不能将本检出的验证称为用户 Chrome 实测。
- 产品 owner：`projects/mouse-gestures/`，现有 Sidebar Tool v2 + USER_SCRIPT Page Module，沿用 `OpenDeskAppPage`、Page Authority、受管 UI、原安装器。
- 阶段：已有功能的性能修复与受影响定向验证；没有开始正式发布或替换用户已安装的扩展。

## 源码证据与修改分工

协调 owner：本轮主代理。Git 状态与产物更新由主代理串行处理；审计代理只读，不操作浏览器、Git 索引或用户设备。

### 工具内响应路径（主代理写入）

`mouseup → finish → readPolicy → readContext → storage.get → execute` 中，`readContext` 的返回值没有被使用；`storage.get` 自身通过真实 sender、父应用安装身份和读取前后 Authority 核验。移除冗余上下文读取，保留每次动作的新鲜设置读取及失败关闭。低优先级偏好轮询不应额外抢占正在进行的策略读取。

写入范围：`projects/mouse-gestures/src/page/runtime.js`、`tests/runtime.test.mjs`、`package.json`、`tool.config.json`、原 `README.md`，验证后通过原打包器更新唯一 `mouse-gestures.opendesk-tool.json`。

### 通用启动时序（startup_framework_audit 代理写入）

已证实的公开能力缺口：现行组合包/安装/目录校验只允许 `document_idle`，工具内部无法提前自身启动。即使仅把 bootstrap 改早，后续 `userScripts.execute` 默认仍等待 idle。通用改动仅增加顶层 USER_SCRIPT 的可审阅 `document_end`，保留旧包的 idle 默认、固定源码、精确文档、原安装权限和撤权生命周期，不按工具 ID 分派。

框架写入范围：`src/scripting/user-scripts/{page-install-package,official-page-catalog,installed-programs,preview-worlds,preview}.js`、`src/ui/sidebar-tools/package.js`、`scripts/build-official-pages.mjs`，以及这些合同已有的定向行为测试。只有已审核为 `document_end` 的安装实例，才把后续固定探测、实际执行及 Sidebar 请求设为 `injectImmediately:true`。固定受管销毁控制统一尽早执行，避免页面仍在加载时无法及时停用；这不执行新的业务源码。`document_start`、allFrames 及任意 world 不在本轮新增范围。

主代理维护相关公开 API 文档和本记录。框架代理修改的测试为 `tests/environment/{page-install-package,sidebar-tool-page-module-package,page-installed-programs,app-page-programs,official-page-catalog-r124}.test.mjs`。主代理最后修复 `page-installed-managed-lifecycle.test.mjs` 一项受影响回归的等待驱动；未改变产品断言或扩展其他业务。

## 复用与验收边界

- 复用已有分段识别、轨迹 rAF、12px 意图/56px 识别阈值、右键保护、Esc、失焦、停用、撤权与迟到动作取消；450ms 菜单关联窗口不是动作等待，不改小来制造提速。
- 既有 R5 报告只作历史证据；本轮变化涉及 runtime 与启动合同，须重新验证对应行为、失败关闭及新旧启动时序；不重复无关 UI/全仓回归。
- 分开记录：源码等待链、可控桥延迟回归、构建包一致性、用户 Chrome 的真实毫秒数。没有当前机器数据不报告实测改善百分比。
- 实机待测：页面导航→模块就绪，mouseup→动作调用；页面网络导航/滚动动画完成不混入动作派发时间。冷态与热态、取消/失败分别统计。
- 未获当前任务明确提交/推送授权，不推送远端 `main`；先完成可审阅的源码、测试和交付补丁。

## 已完成与验证

2026-11-12（北京时间）本轮源码、定向回归与可导入候选准备完成，**用户 Chrome 的实际延迟及安装生效尚未验证**。本工作区仍为上述 `main` 基线上的未提交修改。交付前读取远端 `main` 为 `ee9933f5140ad93abee1e3fafb93d355a77d9d0f`；与基线比较，本轮写入文件没有远端变化，仅未触碰的旧 `projects/mouse-gestures/docs/final-acceptance-r5.zh-CN.md` 有更新。因此不覆盖其历史验收追加，也不因无关 HEAD 更新重复测试。

### 确切行为变化

1. 每次初始化、松开后的动作授权只读一次有 Authority 核验的 `storage.get`；移除未使用的上下文往返。
2. 用 `activePolicyReads` 计数覆盖所有未完成读取。慢手势读取与快显式刷新交错后，低优先级轮询也不会插入额外等待；每次新手势仍发起新鲜读取。
3. 退役实例在发桥请求之前直接返回 false，旧回包不能重新启用。
4. 已批准的自动 `document_end` bootstrap 后，原标记探测、三个独立世界探测及源码执行均尽早注入。内部 `runAtReached` 仅由已验证自动 bootstrap 设置；手动运行未证明 DOM 就绪时仍保留原时机。
5. end 模块的 Sidebar 请求和固定受管销毁不再等 idle。继续绑定当前文档、world、nonce、安装代次，保留读取/派发前后撤权检查及 UNKNOWN 不重放。
6. 原有 UI、分段、阈值与右键策略不重新设计；0.3.2 的唯一包也带入了基线 main 上尚未打入 0.3.1 的精简设置 UI。

### 测试记录

环境为本次独立 Linux 检出、Node `v24.22.1`；按原 `package-lock.json` 通过离线 `npm ci --ignore-scripts` 还原依赖，未修改依赖声明或锁。所有原始日志在 `artifacts/mouse-gestures-latency/`，同时随本轮交付归档。目录不提交原始生成物。

| 范围 | 实际命令/证据 | 结果 |
| --- | --- | --- |
| 项目 runtime 先失败后修复 | `runtime-before.tap`、`runtime-overlap-before.tap` | 先定位 4 项额外读取/等待问题；再以单项红测捕获“旧请求慢、最新请求快”的计数遗漏 |
| 项目完整定向集合 | `node --test --test-reporter=tap projects/mouse-gestures/tests/*.test.mjs`，`app-final.tap` | 88/88 PASS，包含新鲜授权、旧 ON/OFF 乱序、关闭/销毁、右键与组合保护 |
| 框架新时机红测 | `framework-red-ready.tap`、`framework-manual-red.tap` | 先证明旧校验拒绝 end，并捕获初版手动运行过早的缺陷；依赖未齐的初始日志独立保留，不当作产品失败 |
| 五个框架合同 + 原清理文件 | `framework-final.tap` | 共 258 项，257 PASS、1 FAIL；五个修改合同文件的 213 项全部通过 |
| 唯一失败的定位 | `framework-lifecycle-isolated.tap`、`framework-lifecycle-file.tap` | 单项原样运行 1/1；整清理文件 44/45。失败在进入 disable 之前，固定 100 次 setImmediate 尚未等到 UI，不能写成整批通过 |
| 修正等待驱动后的清理文件 | `node --test --test-reporter=tap --test-concurrency=1 tests/environment/page-installed-managed-lifecycle.test.mjs`，`framework-lifecycle-final.tap` | 45/45 PASS。等待 fixture main 在设置 finishMain 后发出真实就绪信号，保留 3 秒总上限、UI 数量、disable、迟到 main 拒绝等原断言；没有改产品来迎合测试 |
| 语法/差量 | runtime `node --check`、`git diff --check` | PASS |
| 组合包 | 原 `build-sidebar-tool.mjs` 的 `--out` → `--promote-from` → `--check-project`；三个 package 日志 | PASS / PROJECT_PACKAGE_MATCH；不等于已安装或 Browser 本体全量构建 |

没有把重复运行次数相加当成独立测试数量。最终相关范围为项目 88 项、框架合同 213 项、清理 45 项；保留前述失败和修复过程。

### 候选身份

| 字段 | 值 |
| --- | --- |
| 唯一包 | `projects/mouse-gestures/mouse-gestures.opendesk-tool.json` |
| Tool ID / version | `mouse-gestures` / `0.3.2`（原 0.3.1） |
| Page ID / revision | `app.mouse-gestures` / `6`（原 5） |
| UTF-8 字节数 | 56,840 |
| 文件 SHA-256 | `a0dccb7ebea18c856998b785845c92a8a955a52a43aa40b6ca991dc88109d772` |
| Page sourceHash | `4a87d02601620029eba12b76e0424dce04fcb25aa8e84ddffca271677fe9c9c3` |
| Page packageHash | `93cdb6dd169ff2759cbefe367786373659213a23d2dfabab09b51852c8a1a1e2` |
| 时机/范围 | `document_end` / 原 HTTP(S)、顶层、USER_SCRIPT |
| 能力 | 原 `page.module`、`storage.local` |
| 状态 | `PACKAGE_READY / INSTALL_NOT_TESTED / CHROME_LATENCY_NOT_TESTED` |

### 独立复核

另一个只读代理分别审查项目并发读取和框架身份/时机/撤权链路，发现的布尔读取标志遗漏与 manual end 过早注入均以先失败后通过的用例修复。复核确认没有在框架新增鼠标业务分支，没有把旧偏好快照当授权，没有因即时清理绕过 UNKNOWN 栅栏。该评审不是外部认证，不给没有原生证据的 95+ 验收分数。

## 本机下一条操作与剩余工作

1. 在用户机器当前仓库 `main` 读取真实工作区和本轮补丁，保留并行改动；若相关差量已经存在，直接跳过，不重做 UI/手势核心或历史 R1–R5。
2. 本次包含 Browser 固定代码变更：复用原 `npm run dev` / `dist/development`，核对实际已连接开发服务、加载路径/ID、已应用构建。需要提交/推送时按当前授权边界处理，不创建其他分支、worktree 或 PR。
3. 再经既有“扩展”审阅入口把鼠标手势更新至上表精确包。旧 Browser 不能靠单个 JSON 获得新启动能力；不要先卸载同 ID 工具，不改写安装授权记录。
4. 在获准普通页面用真实输入测两条链：导航/DOM 完成→手势 runtime ready，以及 mouseup→动作 API 调用。首次冷态与后续热态分别记录；轨迹越阈值→rAF 提交和动作调用→导航/滚动可见效果单独统计。
5. 验证右键两种模式、Shift 右键、四方向/组合、Esc/失焦/关闭、撤权及网页仍 loading 时停用。只有同一实际包/Browser 身份的原始结果才能登记为 Chrome PASS。

源码还存在共享 Page 启动队列和 Authority 材料重复验证等潜在开销，本轮没有实机耗时占比，不进一步重构或缓存 live authority。若更新后仍慢，先按上述阶段测量；拿到证据后只修改占时的段落。

官方时序依据：[Chrome userScripts.execute](https://developer.chrome.com/docs/extensions/reference/api/userScripts#method-execute)（默认 idle，injectImmediately 可避免再次等加载）、[content scripts run_at](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#run_time)（end 在 DOM 完成后）。本轮记录中的收益是去掉已证实的等待点，不是未测的毫秒数或改善百分比。
