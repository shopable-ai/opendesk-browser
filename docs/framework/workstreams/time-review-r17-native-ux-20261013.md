# Time Review R1.7 · Native permission-control UX closure

## R1.9 · 用户 Mac 本地执行范围（2026-10-14）

- 状态：IN_PROGRESS；负责人：Codex 会话 `01a1364f-486c-70e3-bea5-04c5578e0581`；仅 `main`。安全 fetch/fast-forward 后基线 `c29f35fa4ea1a465b144e0a1f7751d774bd1ab24`，已有其他任务修改保留。
- 预期写入：`tests/environment/sidebar-tools-host.test.mjs`、确需修复时的 `src/ui/sidebar-tools.js`、`tests/framework/time-review-r13-native.test.mjs`、本记录。Time Review 生产模块仅在真实失败定位后追加具体范围；不修改公共 SDK 合同/预算/CSP。
- 成功条件：R10 真实拒绝和一次性 Host 授权保留；九文件 Node 回归零 FAIL；正式工具及隔离双构建/verify 通过；现有驱动在真实 Mac CFT 的安装/授权/原生 UI/计时/生命周期取得原始证据。每项独立记录 FAIL/BLOCKED/NOT_TESTED，不提升证据等级。
- 资源：原始输出 `artifacts/time-review-r19-local-01a1364f/`；独立 CFT 临时 Profile；现有 `npm run dev` PID 67778 占用 `dist/development`，本任务不覆盖该目录。构建隔离输出合同正在只读核查；共享 Git 事务串行。只读原生覆盖审计子 Agent 不启动浏览器、不落盘。
- 环境：macOS 26.5.1（25F80），Node v24.16.0。历史 Ubuntu PASS 用于影响分析，当前 Mac 与最新 main 的验证按本轮原始日志登记。
- 范围追加：`src/ui/workflow/local-codex.js` 当前无已有工作区 diff；当前 main 双构建均因 tool-shell 超过 524288 bytes 失败。限定清理计划：先运行已有工作流/观察回归锁定授权、取消、实际 locator 与 schema 行为，再仅压缩内嵌规划提示词的重复英文表述，保留全部约束；不改执行路径、不删除安全 fallback、不改预算/构建器。独立只读 reviewer 审核语义保留，落盘与最终构建由本负责人执行。
- 预算清理追加计划：同一文件精简重复的状态/错误表述，保留 code 与行动含义；复用规划和停止回执完全相同的 batch/事件身份谓词，保留原取消检查。现有 50 项取消、事件流、身份和观察回归先行通过。所有 fail-closed 条件保留；不增加第三方依赖、运行时或特权加载路径。
- 真实 Chrome 范围追加：首轮实际原生安装/无 iframe/四宽度/200% PASS 后出现 `E_TIME_DATA` 并阻断导出。当前 `src/ui/sidebar-tools.js` 无他人 diff；定位可信转发错误丢弃 day/classify/settings/export payload，以及读取回执不应通知状态变更。由本负责人修改该共享文件与已有 Host 回归；正式包字节/版本不变，仍由唯一服务验证 payload、sender、epoch 和导出能力。失败原始记录 `native-run-1.tap` / `native-run-1/native-report.json` 保留。

- 原生输入范围追加：`tests/framework/time-review-native-input.swift` 编辑前无 diff。CDP 点击未给予 Canvas 真实 macOS 键盘焦点，现有受控 helper 增加限定所属 CFT 窗口内的真实 CGEvent 点击与文件选择路径快捷键；不注入 DOM 值、事件或业务存储。
- 并行整合更新：远端 Workflow 在 `ddbadf6d` 完成同预算减重，本任务撤回重复 `local-codex.js` 改动，保留所有失败与旧隔离候选证据。其他负责人以 `fea2b5d8` 将本地 Import 提交与远端 main 安全整合，本任务未覆盖折叠组件负责人两处 class 改动；当前 main 已到 `f831f5d3`。
- R10 根因：历史非规范 API 探针错误复用 20000 字符载荷，被既有 12000 字符输入预算在 dispatch 前拒绝；改为有界 retired 探针，仍要求两条旧 API 拒绝。伪点击返回 E_CANCELLED、待审核 UI 清除、后续真实点击恢复及 one-use Host 授权计数均保留。
- 本地证据：原九文件 166/166；增加可信参数转发回归后，连同当前 Workflow 相关回归共 217/217、0 FAIL/0 SKIP。正式 1.6.0 包保持原 SHA，隔离双构建/Check/Verify 均 EXIT 0。真实 CFT 已证明无 iframe、四宽度、200% 真缩放、精确网站授权、单击开始、下载磁盘内容、真实计时和其他三工具安装/启停隔离；后续原生流程仍 IN_PROGRESS，不登记全合同 PASS。

- 日期：2026-10-13；唯一写入分支：`main`；本对话仅通过已授权 GitHub connector 操作。
- 负责人：Time Review R1.7 本次执行；不占用用户 Mac 的 Chrome Profile、`dist/development` 或其他 Agent 的本地工作区。
- 写入范围：`src/time-review/host-controls.js`、`tests/environment/time-review-r16-trusted-native.test.mjs`、本文件。未修改 Tool Host、Installer、SDK、Service Worker、正式 Time Review 包或共享前端源码。
- 现状核查：原生路径存在但新旧同名工具必须区分；CI 运行 `38408021850` 检查为 `queued`，无 job steps、无 artifacts。GitHub main 仍持续被其他 Agent 推进。
- 本轮目标缺陷：Chrome idle 已授权时仍展示重复授权入口；静态可信原生 UI 与宿主同时展示两个开始/恢复按钮；全站授权后仍出现无效的网站授权入口。
- 实施：只调整 Time Review 现有可信宿主控制 DOM 的可见性及真实权限读取；Chrome permission request 仍在真实点击同步调用；异步读取仍有 generation fence；沙箱 fallback 的可信开始按钮保留。
- 验证：在 GitHub connector 隔离 JS 沙箱执行六种 DOM/权限 mock 合约，结果 PASS（不等同于仓库 Node/Chrome）；新增现有 R1.6 专项文件中的 Node 回归用例，等待仓库 CI 真正执行。
- 尚未完成：本地 `npm run build:sidebar-tool/check/build/build:dev/verify`、真实 macOS Chrome/200% 缩放、Worker/Chrome 重启、实际下载与全生命周期回归均 `NOT_TESTED`。云同步 `LOCAL_ONLY / NO_UPLOAD / BLOCKED`。八维目标不打 95 分。

- 本轮源码候选提交 `8cfda5ee8d863cdebed635812be159c68cfb0c66` 对应的 macOS workflow：<https://github.com/shopable-ai/opendesk-browser/actions/runs/38412562187>，复查仍 `queued`，没有 job steps/artifacts；历史指定运行 <https://github.com/shopable-ai/opendesk-browser/actions/runs/38408021850> 也仍 `queued`。这不是 Chrome PASS。
- R1.7 后续源码修补：网站授权成功后增加异步 read generation fence，防止授权前旧的 `storage.local.get` 结果覆盖已确认的新授权 UI；新增延迟读回归用例。当前仅做隔离 JavaScript DOM Mock 验证，待 Node/Chrome 真实运行。

- R1.7 macOS Chrome 驱动补强：在原有真实 Side Panel 的已安装/授权流程核对 `chrome.permissions.contains(idle)` 与实际按钮状态，要求原生界面没有第二个开始按钮；已获授权时不再重复请求 Chrome permission；确切获权后校验状态切换。未新增浏览器驱动/伪造宿主点击。
- 此驱动修改仍等待真实 macOS Runner 执行，不能宣称 Chrome PASS 或构建通过。

- R1.7 生命周期缺陷与修复：`MARKET_PROVENANCE_STORE` 是所有应用共享映射。以前安装 Cookie Editor 等其他官方工具时，即使 `time-review` 的来源身份完全未变，Side Panel 也会销毁可信原生 UI；现在仅在 Time Review 自身来源 SHA/版本/发行 ID 改变、撤销或结构异常时关闭，其余应用安装保留 Time Review 实例。复用 R1.6 唯一可信准入与原 Host，未另建运行时。新增 R1.7 来源映射变更负向/正向 Node 用例。

## R1.8 · 真实 CI 拆分与安全回归（2026-10-14）

- 执行者：Time Review R1.8 本次 GitHub connector 会话；唯一写入 `main`。
- 实际可访问资源：GitHub 源码、Actions 运行记录；当前执行容器 Node 22.16.0。**不能访问用户 Mac 本地仓库、日常 `dist/development` watcher 或 Chrome Profile**，不占用这些独占资源。
- 计划写入范围：现有 `.github/workflows/time-review-r13-native.yml`、`src/time-review/host-controls.js`、`tests/environment/time-review-r16-trusted-native.test.mjs` 与本工作流记录；不触碰 Browser SDK、共享 Sidebar 宿主、安装器、SW 或其他 Agent 工具。
- 只读核对基线：2026-10-13T16:31:52Z 最新已观察到的 `main=e64af0b8a42fd4ae02eeeedf50da5f23a52802ae`，写入时仍需逐文件读取当前 blob；后续其他 Agent 主分支提交不可直接覆盖。
- 原生队列阻塞：Actions `38408021850`、`38416518447` 的 macOS job 当前仍为 `queued`，无 steps 结果与 artifacts；Node/Build 与 Native Chrome 均不可按排队状态登记 PASS。
- P0：在既有唯一 Time Review 工作流中增加独立 Ubuntu Node/Build 检查，保留原 `macos-15` 原生验收不降级。等待真实 CI 命令、日志和退出码后再记录测试结论；发现实质缺陷才定向修复。
- 本轮尚未触达本地 `git status`，无法核实其他 Agent 的未提交修改；本轮远端写入只使用原 blob SHA 条件更新。

- R1.8 第一轮真实 Ubuntu CI：`91ba7eb4350f67b1cede6dc68473280c8204b8e5`，Actions <https://github.com/shopable-ai/opendesk-browser/actions/runs/38433206176>，Node 165 项中 158 PASS / 7 FAIL。实际日志显示 4 处 `host-controls.js:refresh` 的同步缺失 API 导致 unhandledRejection、R1.6 静态测试误匹配注释、R1.7 来源测试把有效映射错误标为撤销；另有非 Time Review 的共享 Tool Host R10 export 测试超时，保留独立 FAIL 不为本任务回退 SDK。
- 同候选 Ubuntu 构建已实际 PASS：`build:sidebar-tool`、`check`、`build`、`build:dev`、`verify`。正式工具与 Production 同 SHA-256 `90f5029049ed4b2cadd69fa91c4efaefb45f031bd94c07e708c9f78d5f2776f6`；Production `ui/tool-shell.js` 523432 bytes、Development 523672 bytes（均低于 512 KiB）；Production `sw.js` SHA-256 `2b98b4bf2d10d4661951f1fbc434c77aebacecf6e539ba7d3344a9c49974c114`。
- R1.8 根因修复候选：`host-controls.js` 异步包装 Storage/Chrome optional-permission 状态读取，让缺失 API 进入 `allSettled` fail-closed 分支；已有测试增强未授权/不可用路径。R1.6 注释不应被误判为执行路径；R1.7 有效 Time Review provenance 映射不应因其他工具增加而误撤销，缺失/损坏仍必须拒绝。**该修复已在后续同候选 Ubuntu Node/Build CI 中复验，但原生 macOS Chrome 仍未执行。**

## R1.8 · 三轮真实 Linux CI 收敛与剩余阻塞

- 当前实际变更提交：`60554614d8e6cfe4cd3b8477b38504dff824802e`（范围登记）、`91ba7eb4350f67b1cede6dc68473280c8204b8e5`（Linux 原始证据 CI）、`1e1066f81aff401c80c54cbbed290981c5bc4f0d`（Chrome API 缺失 fail-closed + 回归）、`42545c7864a2d7cf633665b148f8418285aaa35b`（同 Origin 已授权时隐藏重复入口）、`0c4809b0cdff51b9195bd28b75f806924c0c5f50`（精确 Origin 正负向 Node 测试）。除上述范围外未修改 Browser SDK、Time Review Service、工具包业务文件、共享 Side Panel 宿主。
- 真实候选 `0c4809b0cdff51b9195bd28b75f806924c0c5f50`，Actions <https://github.com/shopable-ai/opendesk-browser/actions/runs/38435451142>；Linux Node `166 tests / 165 pass / 1 fail / 0 skip`，**整体 Node FAIL**。唯一剩余失败为独立共享接口 `tests/environment/sidebar-tools-host.test.mjs:1653` 的 R10 clipboard export 伪点击拒绝响应等待超时 `host state did not settle`。未回退 Browser SDK、未删除/跳过测试；Time Review 自身专项和新增“已授权 Origin 不重复授权”案例均通过。
- 同一候选 Ubuntu Job 的 `npm ci --ignore-scripts --no-audit --no-fund`、`npm run build:sidebar-tool -- examples/sidebar-tools/time-review`、`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 实际 PASS。原始 `node.tap`、`build.log`、`identities.txt` artifact ID `11832433044`（`time-review-r18-node-build-0c4809b0cdff51b9195bd28b75f806924c0c5f50`），无假造浏览器结果。
- 同候选包 SHA-256 `90f5029049ed4b2cadd69fa91c4efaefb45f031bd94c07e708c9f78d5f2776f6`（工具包与 Production 内置 release 相同）。Production `ui/tool-shell.js` 523445 bytes / SHA `bca74679c8a42905a739e0d2efef24e785b72934e3f008e551a7bb55e3417b63`；Development 523685 bytes / SHA `3abca06f13c47c2cea40cfb582065cf9564df0194037e4d2e99b0203479f24c1`。Production `sw.js` 559499 bytes / SHA `2b98b4bf2d10d4661951f1fbc434c77aebacecf6e539ba7d3344a9c49974c114`；Development `sw.js` 559665 bytes / SHA `b328a2e7e38466b8c7b40057c9160a11b142b04fb40273a35583f7918fc2467f`。固定 tool-shell 512 KiB 上限当前 PASS，但 Production 仅剩 843 bytes、Development 仅剩 603 bytes，后续不得简单提高预算。
- 真实 Mac Chrome：指定旧 run `38408021850`、`38416518447` 及本轮 `38435451142` 的 `native-mac-time-review` job 仍 `queued`；没有同候选原生 Side Panel、放大缩小、真实 Chrome UI、Idle 真实授权、SW/浏览器重启或截图成果；全部 `BLOCKED / NOT_TESTED`。当前环境无用户个人 Mac 工作目录访问，`git status`、真实已加载 Profile、Mac Chrome 版本均无法验收。
- 云同步保持 `LOCAL_ONLY / NO_UPLOAD / BLOCKED`，未编造后端/云功能。**R1.8 仍不能标记最终 95+，八维原生终验均 `NOT_SCORED`**。下一实际任务：协调 Browser SDK Owner 复核共享 R10 ToolHost 假点击回执及相关架构，保留真实拒绝安全语义并使测试收敛；随后复测最新同候选 Node/Build；等待/取得 macOS runner 或用户 Mac 原生执行资源，使用原有 `tests/framework/time-review-r13-native.test.mjs` 记录真实 Chrome、身份和截图。


### R1.9 · 本地真实执行进展（2026-10-14，继续验收）

- 最后 R10 Node FAIL 已修复并提交 `284b0d94b1518a0d0af0ddd7aff5309b79833d79`：旧 API 探针沿用 20,000 字节规范接口负载，超过旧消息 12,000 字节拒收上限，造成驱动等待；改用有界旧 API 探针并增强 `isTrusted=false` 拒绝、批准次数不变、后续真实授权恢复断言。未删除测试或放宽用户手势/一次性 Host 授权。
- 原生运行实际发现 Host 丢弃 Time Review day/classify/settings/export payload；修复现有 `src/ui/sidebar-tools.js` 参数转发，并避免只读 status/day/export 发送虚假 mutation 通知。真实下载和分类已通过；新增回归先 FAIL 后 PASS。没有第二后台/Host/SDK。
- 当前已提交 main 候选 `3c19c71b36f656da941ff2b690bf67420d9c571a` 的独立源码副本 `artifacts/time-review-r19-local-01a1364f/source-accepted/`：九文件 Node **167/167，0 FAIL / 0 SKIP**；正式工具、check、production、development、verify 全部 EXIT 0。原始日志和命令/退出码：`accepted-node-build/`；双构建身份：`accepted-artifact-identities.json`。不使用未提交的共享模块，不覆盖日常 dist。
- `native-run-17/` 已实际证明安装、原生 main.review 无 iframe、四个 CSS 宽度、真实 200% Chrome 缩放、真实网站/分钟记录、原生 Canvas 键盘 ARIA、其他三个工具生命周期隔离、失焦、关面板后台、双 Origin、系统 idle、暂停恢复、SW 替换、两类撤权、分类、实际磁盘 JSON/CSV、真实 Chrome 进程重启、停用启用、选择性卸载。该运行最终 FAIL：重装后一次读取抢在新 UI 的异步初始写入前；已改为等待真实持久状态，不伪写存储。该运行加载较旧候选，不能提升为最新 main 的全量 PASS。
- `native-run-18/` 使用当前 main 双构建，保留真实 foreground owner 变化 FAIL，未向其他进程发送输入。现有 Swift helper 仅对所持有 PID 激活并确认前台，CGEvent 创建失败返回非零；所有结果仍需 Chrome 状态/ARIA/文件/持久记录独立证明。当前继续 `native-run-19/`，并补真实文件审阅安装的同名动态包隔离和自己被替换时的身份退休，不另建驱动。
- CFT 启用真实完整 AX 树以获得原生 WebArea 坐标，依据 Chromium 官方 accessibility switch；这是读取真实 UI，未模拟 Chrome API、权限、计时或 ACK。原始失败、截图、TAP 均保留。官方 catalog 仅有 1.6.0，较新正式 release 升级暂为 NOT_TESTED；本地审阅替换不会冒充官方升级。
- R1.9 写入范围追加：`src/time-review/service.js`、`tests/environment/time-review-r13-service.test.mjs` 写入前均无工作区 diff。真实 `native-run-32` 观察 Chrome 已失焦，但下一次后台 tick 结算旧检查点，补记 20,813 ms（合法上限 1,166 ms）。由本负责人在唯一服务修复无合法当前观察时的保守结算，先增加失焦/idle 回归复现，不增加计时器。原始 FAIL 不覆盖。
- 全九文件回归暴露 R1.2 两项夹具把首次观察 inactive/权限已失效之前的未知区间当作已证明 active。`tests/environment/time-review-r12.test.mjs` 编辑前无 diff；保留旧的历史不丢失/停止/恢复断言，显式增加合法 active tick 锁定已证明历史，再对未知失效区间增加 discardedMs 断言，不能降低安全分母。

- R1.9 交付证据范围追加：由本负责人新建 `docs/framework/workstreams/evidence/time-review-r19-local-20261014/`，只复制真实原始日志、报告、选定截图、命令和哈希索引；不复制运行树/依赖/dist，不另建状态账本。完整失败证据继续保留在本任务独立 artifacts 目录。最新 `native-run-46` 文件选择失败：持有 Chrome PID 3907、实际前台 CFT PID 3948；拒绝向其他进程发送输入。官方升级流程未执行到，保留 BLOCKED。现有完整运行 42 的 TAP EXIT 0 与 `acceptance=PARTIAL` 分别记录，绝不合并为全合同 PASS；现驱动进一步要求默认 full 的所有必需项 PASS 才能成功退出。

### R1.9 · 本地验收收尾：PARTIAL（2026-10-14）

- 生产修复提交：`284b0d94b1518a0d0af0ddd7aff5309b79833d79` 修复共享 Host 丢弃 Time Review 参数与错误只读通知，修正 R10 旧接口探针并保留伪点击拒绝/one-use 授权；`dba771cc8e64fa5f3b1ef7163568a8812af9d024` 修复唯一计时服务在首次观察已失焦/idle 时结算未知区间的问题。失焦原生 FAIL 的 20,813 ms 保留；修复后真实运行 42 测得失焦边界新增 179 ms，合法上限 1,163 ms。没有新增后台计时器/Host/SDK/依赖或放宽 CSP/512 KiB 预算。
- 最终冻结生产候选为 `dba771cc8e64fa5f3b1ef7163568a8812af9d024`。独立物理源码副本 `artifacts/time-review-r19-local-01a1364f/source-r19-final/` 的 558 项生产/构建输入逐个核对 Git blob 与 SHA-256，零差异。不是 Git worktree。收尾观察 main=`097de119d486d89986a7a2b04fc306e08404addb`；之后已提交差异仅 `src/platform/chrome/bookmarks.js`、`src/ui/sidebar-tab-memory.js`、`src/ui/task-workbench.js`。未提交并行修改未进入候选；不将冻结证据提升为整个较新 main 的原生 PASS。
- 环境：macOS 26.5.1 / 25F80，最终 Node v26.3.1（最初复现为 v24.16.0），CFT 155.0.8059.39。真实加载 `source-r19-final/dist/production`，扩展 ID `coelkalcpnbppgbncibnckabllabgnoo`；运行 42 的独占临时 Profile 为 `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/opendesk-time-r13-aKhsqb`。报告确认持有进程终止、Profile 删除；没有替换日常 Chrome 加载目录或覆盖 watcher 的 `dist/development`。
- Node：指定九文件 **169/169 PASS、0 FAIL、0 SKIP**；加上受影响安装/生命周期/布局合同的十四文件 **205/205 PASS、0 FAIL、0 SKIP**。命令、Node 版本、退出码和原始 TAP 在证据目录的 `inactive-complete-node-after.tap` 与 `final-validation/`。R10 单独实际复现 FAIL、修复后 1/1 PASS；原失败没有删改。两项未知失焦/idle 区间回归先 2 FAIL 后通过，保留 `inactive-regression-before.tap`。
- 构建：`build:sidebar-tool -- examples/sidebar-tools/time-review`、`check`、`build`、`build:dev`、`verify` 均 EXIT 0，固定独立 output guard 43272。Production / Development `ui/tool-shell.js` 分别 494,692 / 494,932 bytes；Development 余量 29,356 bytes。原 WXT IIFE/MV3/CSP 及官方多工具构建的既有 Verify 检查通过，不将静态预算检查当成运行时性能评分。
- 正式 Time Review 1.6.0 包（41,548 bytes）SHA-256：`90f5029049ed4b2cadd69fa91c4efaefb45f031bd94c07e708c9f78d5f2776f6`，与实际官方 catalog / Production release 一致。Production `sw.js`（592,119 bytes）：`9d85e1370c1dc5c1e896764e6c3bb367d2a94a4d32efc93760d78c313cb56e9f`；Development（592,285 bytes）：`e49d69652a5713f4c61a75c50d301ef9269290b0df86aa188b62ecdd1321256b`。原始身份文件为 `final-artifact-identities.json`。
- 真实原生运行 42：**TAP 1 PASS / 0 FAIL / EXIT 0，但 35 项必需结果仅 34 PASS、officialUpgrade NOT_TESTED，acceptance=PARTIAL**。实际原生 `main.review` 无 iframe；同名同 capability 的另一 ID 经真实文件审阅安装仍是 sandbox。自己的实际改版本/字节替换删除官方 provenance、退休旧原生 root 和授权，未借包标签提权。
- 实际已证明：精确 Origin / Chrome idle 授权、已授权入口隐藏、一次点击开始/暂停/恢复；前台非 idle 网站计时、未授权 Origin 不计时、失焦/真实系统 idle 停止、关 Side Panel 后无 Time RPC 的后台计时；两类撤权停止、历史保留；六分类/24h Canvas/真实键盘 ARIA、日期/排行/JSON 和 CSV 实际 Chrome 下载与磁盘内容；整浏览器关闭重启、SW target 真替换、停用/启用的真实 epoch 轮换、选择性卸载、重装重新授权；Reading TOC/Cookie Editor/Stay Focus 的安装及启停不退休 Time Review。
- UI 证据：320/360/400/600 为已安装真实 UI 的 **CDP CSS viewport**，不是手工拖动 Side Panel 宽度；200% 为所属 CFT 窗口的真实 macOS Command+Plus，DPR 2→4，CSS 宽度 360→180。真实长域名、无横向溢出、Canvas 边界与焦点分别有原始观察和截图。没有 HTML 原型或注入 Tailwind Preflight。
- 完整合同仍未闭合：① 官方升级 **BLOCKED**：新尾段采用明确的本地审阅 1.5.0 夹具→实际 catalog 1.6.0，不声称旧官方 release；43–46 被另一 CFT 前台争用安全中止，未执行到 PASS。② SW 验证是暂停时真实 target 替换；**活跃计时中的自然休眠/恢复 NOT_TESTED**。③ 修改版本/字节/provenance 的组合替换与 epoch 轮换有真实证据，但逐字段独立篡改原生矩阵为 **PARTIAL**。④ 其他工具的真实安装/启停通过，跨正式版本升级隔离 **NOT_TESTED**。旧历史官方版本升级不由本地夹具证据替代。云同步始终 `LOCAL_ONLY / NO_UPLOAD / BLOCKED`。
- 原生观察器沿用 `tests/framework/time-review-r13-native.test.mjs` 与 `time-review-native-input.swift`，补充实际窗口几何、原生选择文件、真正 CGEvent 键盘/鼠标与实际安装生命周期；输入逐次核对所属 PID，发生前台变化停止。读 AX 与 PID 激活依据 [Chromium 官方 accessibility switch](https://chromium.googlesource.com/chromium/src/+/HEAD/ui/accessibility/accessibility_switches.cc) / [Apple AX frontmost API](https://developer.apple.com/documentation/applicationservices/kaxfrontmostattribute)。前台检查与系统投递不是原子操作，普通 layer 0 点位 owner 校验也不等于任意系统遮挡检测；不夸大无竞争保证。最终 JS `node --check` 与 Swift 编译均 EXIT 0，最新驱动新增升级尾段和 full 成功门槛尚无完整原生 PASS。
- 原始证据：[`evidence/time-review-r19-local-20261014/index.json`](evidence/time-review-r19-local-20261014/index.json)；193 份原始日志/报告/选定截图已保留，全部 46 次运行 TAP/退出码/原始报告保留，不覆盖历史。所有本地原生文件哈希索引 `local-native-inventory.json`，完整本机证据根 `artifacts/time-review-r19-local-01a1364f/`。真实通过报告 `native-run-42/native-report.json`、失败 `native-run-32.tap` 与 `native-run-46.tap` 可直接核查。
- 八维专家限定审核：功能完整性、权限与身份安全、UI/UX、性能与构建预算、后台计时真实性、数据持久化与恢复、安装与生命周期、验收证据可信度均 **NOT_SCORED**。分项原生事实有效，但未取得完整同交付候选终验；不以静态检查或 34 项结果预设 95 分。
- 资源状态：本任务 CFT/Profile/fixture 进程已收尾，隔离构建结束；其他聊天浏览器、watcher、dirty 文件原样保留。本轮源码修复已安全提交，驱动与证据正在仅 main 串行提交/推送。终验状态 PARTIAL，前台争用阻塞不提升为产品 FAIL 或完整 PASS。

- R1.9 交付回执：驱动、原始证据与本记录已在 `main` 提交并正常推送 `956afafc9cf9d28123d5f7987352b3f506a65d6a`；`git ls-remote origin refs/heads/main` 当时确认相同 SHA。该提交父级 `097de119` 已在远端；本轮没有顺带推送他人未发布提交。任务文件与共享暂存索引检查均无残留；未改其他聊天 dirty 文件。
- 该源码交付提交的 [Time Review CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38470639939) 已真实触发；最初查询整项排队，随后 Ubuntu Node/Build job 为 in_progress、macOS job 为 queued，不能记为 CI PASS。原始 GitHub API receipt 为证据目录 `delivery-ci-runs.json` / `delivery-ci-jobs.json`，与本机冻结候选证据分开。后续本段及 API 回执的文档提交不改变生产/观察器输入，无须重跑已通过构建或将其提升为较新全候选验收。

### R1.9 · 自动续接补验（2026-10-14）

- 上一目标回合为 progress：源码/证据与交付回执已正常推送，Ubuntu CI 实际 success。当前仍有待证原生项，不标记目标 complete。负责人、main、现有写入范围不变；追加原始证据仅使用本记录已声明的独立 artifacts/evidence 目录。
- 资源复核：上一失败的竞争 PID 3948 已不存在；只有两项先前其他任务遗留的独立 CFT 主进程（43356 / 45301，PPID 1）仍存在，未处理这些进程/Profile。前台实际为日常 Chrome PID 73139；本任务仍仅对新持有 CFT 输入，前台变化即中止。新真实环境证据 `resume-resource-processes.json` 允许有意义地重试，不因旧观察超时重启存活测试。
- `native-run-47` 使用已提交 `956afafc` 的现有观察器、冻结 `dba771cc` Production 产物、独立 Profile；仅补 identity 范围，活动覆盖缺项保留 NOT_TESTED，不合并为完整 full PASS。Node/双构建相关生产输入没有变化，继续复用原始 PASS。自然 SW 休眠策略同步做只读官方研究，不新建运行时/驱动、不制造时间或存储。
- 运行 47 已真实执行同名动态包隔离、自己改版本/字节替换及本地 1.5.0 审阅安装；最新 FAIL 是 `actionable #sidebar-tool-official-time-review-install timed out`，不再是前台争用。原始持久记录保留 1,134 ms 的真实历史，报告确认清理。根因是观察器仍选择默认“可安装”筛选，该筛选只列 available；实际旧版本已被生产目录识别为 update。修正现有驱动，真实点击“全部”并要求目录 `installationState=update` 后再点击升级；不改生产目录、不制造来源记录。保留运行 47，方法变更后定向复验 48。
- 运行 48 身份范围 EXIT 0；`officialUpgrade=PASS`：明确本地 1.5.0 夹具→实际官方 1.6.0，真实审阅/安装、精确包/provenance、非零历史与全部持久字段保留、旧 iframe 退休、可信原生挂载和无自动开始均通过。该 identity 报告其他活动项仍 NOT_TESTED，`acceptance=PARTIAL`，不能覆盖运行 42 的缺项或冒充旧官方 release 迁移。
- 剩余原生观察器补强仍仅写 `tests/framework/time-review-r13-native.test.mjs`：复用同一个原生文件审阅函数，给 Reading TOC/Cookie Editor/Stay Focus 实际本地旧版本→catalog 正式版本升级添加独立隔离检查；给活跃检查点的真实强制 SW 停止/失焦/恢复添加不补记和新合法采样断言。自然休眠通过普通 page 的 ServiceWorker 状态事件及 Browser target 被动观察，明确不 attach SW、不改 0.5min alarm、不调用 Time RPC 或制造时间/数据；只接受真实 running→stopped→running，没观察到就 BLOCKED，强制停止不能替代。新增三个必需项，原 35 项保留。仅观察器总时限由 420s 调为 600s，以容纳新增 75s 观察及三次真实原生文件审阅；各单步 timeout、所有产品/SDK/原生未知副作用边界及 512KiB 预算不变。
- 自然 SW 规则依据 [Chrome 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)、[官方调试说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug#debug_the_service_worker) 和 [alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)：30s alarm 和 inactivity 阈值重合，不能用等待秒数推导休眠；实际停止/恢复的具体唤醒事件没有独立归因就不声称 alarm/点击唤醒 PASS。只读研究未替代原生证据。
- 冻结前独立 architect 审查发现四处 observer 证据缺口，已在同一驱动修正：不再以 target ID 改变代替恢复，关联 page session/registrationId/versionId 的 stopped→真实失焦→running 顺序，场景未命中记 BLOCKED；核对全部 day/host 桶不减少、非当前 host 不增长；自然链保留未过滤事件并按 worker 身份匹配错误、排除 crash/registration 删除/换版本；刷新后的持久增量使用已有 until。官方 CDP 字段核查来源 https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/ServiceWorker.pdl 。产品代码未变，未宣布新原生 PASS。
- 新观察器提交并正常推送 `ac7d7aa191c131bf28eb2fae3c505c5a6ef30d46`，未顺带推送未发布他人提交。Poincare 修正后二次只读复核 CLEAR，尚不提升为 native。该提交独立物理源码副本核对 1,753 项输入、0 差异，Node v24.16.0 实际 205/205 PASS、0 FAIL/SKIP，正式工具包/check/Production/Development/Verify 全 EXIT 0。tool-shell Production 495,305 / Development 495,545 字节（512KiB 预算不变）。新 CI https://github.com/shopable-ai/opendesk-browser/actions/runs/38475900669 触发，原生全范围运行 49 正在独立 CFT/Profile 执行，未预先登记 PASS。
- 全范围 49：固定 ac7d7aa1，真实 complete=true、36/38 PASS；原35项均 PASS，另三工具实际官方升级 PASS。naturalSwSleep=BLOCKED：同一版本 active 窗口75秒持续 running，无 stopped 事件，0 worker errors/crashes/换版本/registration删除；activeSwRecovery=BLOCKED：确实 stopped，但 running 发生在确认失焦前（284478→284490→284724ms），全部历史桶保留、失焦冻结和新合法采样通过，却未证明所需跨失焦顺序。未虚报完整 PASS。门槛在第一 after-hook 抛出后跳过后续 fixture cleanup，Node v24 子进程仍监听本轮54677；按 cwd/命令双重核对仅 SIGTERM 自己45538，原始 TAP、报告、退出码1及终止receipt全保留，CFT/Profile此前已正常清理。
- 下一验证方法明确改变：在真实暂停后关闭 Side Panel，保留被动 manager observer，45秒不调用 Time RPC，真实重新打开后验证同一 worker 自然 stopped/running 及 days/minuteDays/分类/权限完整保留；唤醒原因不独立归因。活跃 forced case 先关闭请求轮询的 Side Panel，异步运行真实 Finder 激活，让事件采集不被 spawnSync 阻塞，仍未证明顺序则 BLOCKED。原38项/安全断言/步长预算未删除。完整门槛移到 test body 最后，after-hooks仅清理和保存报告，PARTIAL仍非零且不得跳过fixture清理。生产源码及已通过Node/构建输入不变。
- 修正后的观察器/36项原生事实及原始BLOCKED已提交 `40aef3bc2e6a5aaaae8c42a731209a169c920902`。Production构建输入相对ac7d7aa1没有任何变化，按跨对话复用规则保留已有205 Node与全部构建PASS；新560项product+driver核对0差异，driver/Swift精确对应40aef3bc。运行50使用同产物、独立新Profile，方法已改变，不以重复计时窗口碰运气。
- 新原生截图缺陷已由独立审查确认，追加当前负责人写入范围 `src/ui/tool-shell.css`（仅第一方Time Review窄宽度及同名提示样式）、`src/ui/sidebar-tools.js`（仅installed列表同名ID提示）、`tests/environment/sidebar-tools-host.test.mjs`（同名分辨回归）、现有native驱动（真实200%与同名可见性断言）。写入前目标diff为空；不触及安装/Host权限/官方1.6.0包字节与SHA，也不修改共享全局账本。200%可读性及同名实际截图是通过条件。
- 运行50是真实FAIL：#refresh无法操作，UI E_HOST_STORAGE_WRITE，原记录仍可读取；当时系统同样ENOSPC。内层Chrome I/O原因未保留，只能关联磁盘故障，不能声称已证明唯一根因；后来可用空间恢复到5.7GiB，未删任何缓存/他人文件。运行51记录磁盘最低4.64GiB，另发现观察器真实缺陷：关SidePanel后readTime继续用失效side session，报Sessionnotfound，23项PASS后退出1，所有资源自动清理。已改manager读取；要自然停机需关闭全部extension UI，因此被动observer接到现有HTTP页面，只有真实看到同extension注册后才关manager，恢复仍用原manager/SidePanel。强制case先确认网站真实聚焦，只读DOM focus异步观察和同worker状态wall时间关联，缺证仍BLOCKED。原38项未删除，Chrome API/存储/事件/时间未伪造。

### R1.9 真实 UI 修复与观察边界收紧（续接，2026-10-14）

负责人：当前本地 R1.9 会话；仅 main，沿用本记录。写入范围增加 `src/ui/sidebar-tools.js` 的同名列表身份提示、`src/ui/tool-shell.css` 的原生 Time Review 极窄布局、对应 Host 回归及原生观察驱动。官方 1.6.0 安装包字节、provenance 和信任判断保持原合同。原生 49 的实际 200% 图显示分类逐字折行，同名本地包无可见 ID：宿主仅为同名项显示真实安装 ID/ARIA，低于 240 CSS px 的已有 `main.review` 分类改成单列，不影响 opaque iframe。根目录受影响 14 文件 Node 206 PASS / 0 FAIL / 0 SKIP，最终冻结构建及新图仍待执行。

保存原生 50/51 失败，不把 Node 或部分原生证据提升为完整 PASS：50 是 E_HOST_STORAGE_WRITE，同时 shell 留有磁盘不足证据，未捕获 Chrome 内部 I/O 原因，只能标记关联推断；51 为驱动读取已关闭的 Side Panel session，23 项已过，剩余未测。修复只读 storage 观察使用有效 manager session。自然生命周期仅接受 HTTP observer、全部扩展 UI 确认关闭后的真实版本状态链；失焦恢复须先确认真实失焦后仍停止的版本快照，不能用 Node 事件到达时间代替 OS 顺序。补分钟历史、稳定字段和安装 epoch 断言；缺证继续 BLOCKED，不降低原 38 项验收。下一候选使用独立物理源码副本、43272 构建锁和独立 CFT profile，日常 watcher/dist 不变。

R1.9 补充观察安全边界：同一 worker 在 confirmedStop 与真实失焦后 stopped 快照之间出现任何 running，则 activeSwRecovery 必须 BLOCKED，禁止拼接第二次停机。仅驱动变更，不重建相同生产输入；构建候选 ccee890c 与后续原生候选按生产文件/产物逐项比对。独立副本六项 Node/工具包/check/Production/Development/Verify 均退出 0，Node 206 PASS，无预算或 CSP 放宽。
