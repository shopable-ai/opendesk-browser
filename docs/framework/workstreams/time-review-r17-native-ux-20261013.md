# Time Review R1.7 · Native permission-control UX closure

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
