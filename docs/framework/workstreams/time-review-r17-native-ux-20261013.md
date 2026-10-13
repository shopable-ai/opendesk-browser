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
