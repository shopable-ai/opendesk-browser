# OpenDesk Browser Scheduled Tasks R1 — 实施与证据追踪

日期：2026-10-12。工作仓库：`shopable-ai/opendesk-browser`，目标分支 `main`。该工作流与 Cloud、Time Review 等其他工作流独立保存记录；不得覆盖它们的历史证据。

## 产品目标与语义需求

让用户在 Side Panel「我的」中选择**已真实验证并安装授权**的 Controller Task，保存一次/每天/每周/间隔计划，浏览器允许并且存在合法可见 RunHost 时自动开始真实脚本。计划与运行历史在关页和重启后仍可追踪；未知页面副作用必须停止自动重试。

- 来源选择框右侧仅两个固定、可访问的图标按钮：新建脚本、管理任务；不把管理项混进下拉选项，也不增加一级 Tab。
- 创建脚本走已有开发、保存、真实验证、Available、安装与授权链，不能让未验证的 JS 定时执行；完成安装的 Host 事件可回到创建计划的表单。
- 任务管理可搜索、筛选、停用/启用、复制到开发、卸载、查看版本/站点和计划关联，并从任务卡创建定时计划。
- 独立运行页使用扩展自己的 `tool.html?scheduledRunner=1`，保留可见标签页；Side Panel/运行页都关闭时不启动，不能通过强制 Side Panel、隐藏页或 SW 保活规避 MV3。
- 定时发生的唯一 FireId 包含计划 ID、编辑代次和原始触发时点；一旦 `ADMITTED` 绑定原 `RunId/ResultId`，从此不二次启动。多个 Host 争抢仍通过既有 `runs/@slot` 原子仲裁。

## 目标源码清单

- 定时计划 Schema、DST/时区及状态：`src/platform/tasks/schedule-contract.js`、`schedule-time.js`、`schedule-repository.js`、`schedule-service.js`。
- Authority/RunHost/SW 接线：`src/platform/host/{authority,broker,controller-methods,client}.js`、`src/run-host.js`、`src/sw.js`。
- Side Panel 与独立运行页：`src/ui/{tool.html,tool-shell.js,tool-shell.css,task-workbench.js,scheduled-task-workbench.js,scheduled-task-host.js}`、`src/tool-document-url.js`、`src/ui/sidebar-tools/navigation.js`。
- 定向测试和 CI：`tests/environment/scheduled-tasks-r1.test.mjs`、`.github/workflows/scheduled-tasks-r1.yml`。
- 原型 `examples/ui/scheduled-tasks-r1-preview.html` 保留不动。

## 测试记录与证据级别

本轮通过 GitHub 连接器检查远端 `main`；会话容器无法访问用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser`，无法使用该机器上的 Chrome/Profile、既有资源租约或真实 Playwright。**绝对不能将未执行的 Mac Chrome 步骤记为 PASS。** 本轮将代码结构与纯函数试算和后续 GitHub CI、Mac 真实验收分别列出。

| 项目 | 目标验收 | 当前独立结论 |
| --- | --- | --- |
| 1. UI 视觉、320/360/420、200%、键盘 | 三宽度、缩放、可访问性实测，无阻塞弹窗 | NOT_TESTED：待真实浏览器截图和键盘证据 |
| 2. 任务选择和双图标 | 精确图标、按钮非下拉项、合法任务过滤 | SOURCE_IMPLEMENTED；真实交互 NOT_TESTED |
| 3. 任务管理完整性 | 搜索、筛选、启停、复制、卸载、版本、权限、关联计划 | SOURCE_IMPLEMENTED；真实交互 NOT_TESTED |
| 4. 新建→验证→安装→返回 | 正向真实验证回执与固定安装身份 | SOURCE_IMPLEMENTED；实际全链路 NOT_TESTED |
| 5. 时间正确性 | 四频率、IANA/DST、错过窗口 | 纯函数试算和 Node 专项测试待 CI 绑定；真实 Alarm NOT_TESTED |
| 6. 持久化/并发 | 重启保留、原子 FireId、双 Host 不能双跑 | SOURCE_IMPLEMENTED；真实竞态 NOT_TESTED |
| 7. MV3/Host 生命周期 | 关 Side Panel / 有可见运行页 / 都关闭 / 恢复 | SOURCE_IMPLEMENTED；Chrome 实测 NOT_TESTED |
| 8. 原有执行链兼容 | 共用 Authority、RunHost、@slot、Run、Result | 源码复用；Cloud / Time Review 回归 NOT_TESTED |
| 9. 权限/安全 | 固定 Task 身份、来源 URL、拒绝未验证及权限撤销 | 源码校验；实测撤权和竞争 NOT_TESTED |
| 10. 真实 Chrome 验收 | demo-form 正向原生效果、Result、资源释放及重启 | BLOCKED：本会话无法操作用户 Mac Chrome |

**逐项 95 分目标是验收门槛，不是当前声称已经达到的评分。** 当前没有原生证据的项目不给假高分，失败项保持开放。

## 在 Mac 上的最小专项验证

在检查没有并行资源占用和改动覆盖风险后，于本地仓库 `main`、本工作流独立端口/Profile 下执行：

```bash
node --test tests/environment/scheduled-tasks-r1.test.mjs
node --test tests/environment/task-package-flow.test.mjs tests/environment/task-workbench.test.mjs tests/environment/tool-ui-tab.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
```

再按 `docs/framework/testing-guide.md` 使用实际打包扩展和 `examples/tasks/demo-form.html`，完成真实安装任务的一次触发、每天/每周/间隔边界、暂停/恢复、独立可见运行页、关 Side Panel、双 Host、重启、撤权、版本变化、超时/Stop/未知回执等测试。每次原生成功需记录实际页面效果、`FireId/RunId/ResultId`、目标 Tab/Document、原 Run 状态、Result 原始存储、Worker 释放和当前包 hash；仅 Alarm 回调/Mock/静态原型不计入成功。

## 当前阻塞与交付原则

本环境不能直接读写用户 Mac 工作区，也不能占用/核对 Chrome Profile、Mac 端口或独立运行中的 Agent；在没有这些证据前，**不宣称完成“Mac Chrome Final”**。GitHub connector 可以原子直接提交远端 `main`，但必须再次确认当前 HEAD、相关文件 SHA 并且拒绝与其他 Agent 重叠的写入。后续在工作流中追加真实 CI workflow URL、日志、Git commit SHA 和结果；不要替代历史证据。


## 2026-10-12｜远端首次集成、CI 证据与后续修复

**可核验源码提交**：[`7dbcf8b391e93a08e69ad971c2b2331d02857ae8`](https://github.com/shopable-ai/opendesk-browser/commit/7dbcf8b391e93a08e69ad971c2b2331d02857ae8)，已经写入 `main`，不是压缩包或独立静态原型。

GitHub Actions [Scheduled Tasks R1](https://github.com/shopable-ai/opendesk-browser/actions/runs/38238873516) 中，基础候选的：
- 定时计划 Node 专项：**6/6 PASS**（四类触发、DST gap/fold、参数边界、FireId 原子绑定、取消/补跑）。
- 原 Task 包专项：**8/8 PASS**；其他选定旧组件也有成功记录。
- `scheduled-package`：**PASS**，确实执行 `npm run check`、`npm run build`、`npm run build:dev` 和 `npm run verify`。输出的 `ui/tool-shell.js` 生产体积 **456729 B**，低于 524288 B 硬限，但超过 327680 B 软提示，需要持续观察。
- `scheduled-components`：**FAIL（1/105）**，失败来自共享 K3 Controller/Cloud 回归的 `Unbounded Cloud KV scan`，并非定时计算 6 项失败。完整失败位于该 run 的 `scheduled-components` job 日志。
- 这项共享回归对应原 `assertInstalledTask` 对全体 `frameworkKV` 无界遍历的问题；远端 `main` 后续提交 [`d18b57f7`](https://github.com/shopable-ai/opendesk-browser/commit/d18b57f7f555fa1942224ecde1b20dc2b26d9216) 已将安装身份改为精确主键读。**修复源码已确认，修复后的同候选 K3 通过证据仍待新的 CI。**

后续增量修复遵循并行安全：从最新 `main` 读取每个被改文件的完整内容，在其基础上添加而非覆盖其他 Agent 工作；采用单独原子树提交，并用预期 HEAD 非强制更新。针对新增计划的活跃数量上限、变更安装身份／撤销网站权限后的「需要处理」投影，以及 `retirementState` 未 released 前不把完成态当成功，新增回归覆盖。专项 UI 源码合同和用户说明与已有原型保持分离。

**原生验收仍然 NOT_TESTED**：尚无此候选在用户 Mac 的实际 Chrome `demo-form.html`、Alarms→可见 RunHost→页面 Native 效果→原 Run/Result→released、Side Panel 关闭/恢复、双宿主不重复、实际 320/360/420/200% 的证据。不得把 GitHub CI 包验证提升为 Native Chrome Final。

### 后续原生验收如何执行

按仓库测试指南确认最新 commit SHA、单个 Mac Chrome Profile 与端口资源独占，先在本地 `main` 运行新专项 Node + 两构建 + verify，再安装**确实构建自同一 SHA** 的生产或开发包；使用 `examples/tasks/demo-form.html` 安装经 Native 回执验证的 Controller Task。分别在 Side Panel 打开、Side Panel 关闭而可见运行页保留、唯一运行页关闭和恢复、多 Host 同时开启、浏览器重启、撤权/更新/停止/超时/未知效果场景下采集独立证据，并逐项提交报告。全部真实证据齐备前，十项专家分数继续标 `NOT_TESTED` 或 `BLOCKED`，不填虚高分。


### R1.1 GitHub Actions 回执（eb4b3f7c83）

[本候选工作流](https://github.com/shopable-ai/opendesk-browser/actions/runs/38242914514) 的已完成 job：

- `scheduled-package`：**PASS**。Node 22、`npm ci`、`npm run check`、生产 `npm run build`、开发 `npm run build:dev` 和 `npm run verify` 均确实执行并成功。
- `scheduled-components`：**FAIL（定位为新增静态断言拼写）**。计划时间、FireId、Host 缺席、授权投影、Result 退休专项 **9/9 PASS**；新增 Side Panel 结构/URL 静态断言 **4/5 PASS**，唯一失败的测试将真实 CSS `#scheduled-panel [hidden]` 错写为 `schedule-panel [hidden]`。这不是产品源码 selector 不存在，而是测试中少写一个字母。
- 先前 K3 `Unbounded Cloud KV scan` 的源码修复在本候选已存在，但该 job 因静态测试提前失败，K3 回归命令未执行。因此 K3 **NOT_TESTED on eb4b candidate**，不得直接填 PASS。
- 下一次提交只改正静态测试选择器，并重跑原工作流；Mac Chrome 真实验收仍为 **NOT_TESTED**。


### R1.2 正式组件与包验证已完成（2026-10-12）

**正式候选提交：** [`6ae0e6eea92eb6cc28dff5e1b9d9202cfba1b920`](https://github.com/shopable-ai/opendesk-browser/commit/6ae0e6eea92eb6cc28dff5e1b9d9202cfba1b920)。

**最终同候选 GitHub Actions：** [Scheduled Tasks R1 · run #38243526235](https://github.com/shopable-ai/opendesk-browser/actions/runs/38243526235)，`completed / success`，`scheduled-components` 与 `scheduled-package` 两个 job **均 PASS**。

| 定向组件 | 真实 Node CI 回执 |
| --- | ---: |
| 定时计划、时间、持久 Fire、状态与结算 | 9/9 |
| Side Panel/双图标、无弹窗、可信可见 Host 的静态源码合同 | 5/5 |
| 原 Task 固定包、真实安装身份与授权组件 | 8/8 |
| 原 Task Workbench 兼容组件 | 41/41 |
| 原网页工具入口与 Host URL 组件 | 5/5 |
| 原 Sidebar 产品合同 | 8/8 |
| 原 Controller Authority / Cloud K3 回归 | 105/105 |
| **合计** | **181/181 PASS** |

构建与包验证（同一 SHA）：

- `npm ci`、`npm run check`：PASS；后者检查 545 个源码/测试/构建文件、固定入口、CSP 与许可证。
- `npm run build`：PASS，WXT production 输出 89 资产，包指纹 `c8355736c9b8e4894ef9ddadbf0cec77b5269a3bcec55d6f5312b62d230f09d1`。
- `npm run build:dev`：PASS，WXT development 输出 123 资产，包指纹 `c3ed59a4fc7b0b93866a42900ba636c88b2d1445a565bab112039ba4f50687ed`。
- `npm run verify`：PASS，对 production 与 development 分别执行固定入口、CSP、SDK/内置资产与哈希校验。
- 生产 `ui/tool-shell.js` 460,324 字节，低于 524,288 字节硬限，但超过 327,680 字节软提醒；开发包为 460,564 字节，仍在硬限内。生产 `sw.js` 346,654 字节，低于 SW 的 1 MiB 硬限。

**先前失败保留为历史而非抹除：** `38242914514` 的一条 UI 静态选择器断言笔误已由 `6ae0e6ee` 修复；此前独立 K3 回归的无界 Task KV 查询已由 `d18b57f7` 修复。本次同候选的 UI **5/5** 与 K3 **105/105** 均真实复验通过。

**Native Chrome 仍是 BLOCKED / NOT_TESTED：** 以上回执只能证明 Node 组件与安装包的可构建、可校验，不能证明定时 Alarm 在真实 Chrome 中已使获准任务实际操作网页、产生原始 Run/Result/页面效果并完成 `retirementState=released`。Mac Side Panel 关闭后保留可见运行页、完全无 Host、双 Host、Chrome 重启、撤权/版本更新、320/360/420px 和真实 200% 缩放，仍需要本机独占 Chrome Profile 的原生 E2E。十项独立专家评分不得以 181/181 或构建 PASS 直接换算成 95+，未经 Native 的维度继续为 `NOT_TESTED`。

#### 本地 Mac Codex 后续精准验收

在获得本地唯一写入者/Chrome Profile/43111 端口使用权、确认无并行冲突后，于 `main` 核对 HEAD 与最新 `origin/main`，不要覆盖其他 Agent 的未提交改动。仅在安全情况下 `git pull --ff-only origin main`，然后运行：

```bash
node --test tests/environment/scheduled-tasks-r1.test.mjs tests/environment/scheduled-task-ui-r1.test.mjs
node --test tests/environment/task-package-flow.test.mjs tests/environment/task-workbench.test.mjs
node --test tests/framework/k3-controller-authority.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

用与最终候选 SHA 绑定的 `dist/production` 或 `dist/development` 在受控 Mac Chrome 加载 OpenDesk；打开 `http://127.0.0.1:43111/demo-form.html`。验证真实 Controller Task 的**原生网页成功回执→固定版本安装/授权→保存短期一次计划→Chrome Alarm→可见 Host 领取→真实 DOM 动作→原 RunId/ResultId→retirement released**，再测试上述 Host 生命周期、重复 Alarm/双 Host、停止、撤权、未知效果与 UI 宽度。原始证据应保留候选 SHA、包 hash、Profile 身份、目标 Tab/Document、截图/视频、Run/Result、Alarm/FireId、Worker 释放和原生日志；只读 Mock/组件/截图不能替代完整 Native 成功。


## R1.3 — 可执行宿主识别修复与 Mac Chrome 原生专项（2026-10-12）

**明确需求：** Side Panel 和带 `scheduledRunner=1` 的可见扩展标签才是定时领取 Host。普通完整 Task Catalog、工具标签、隐藏页/冻结文档虽然可能已经注册 Controller Host，却不运行定时轮询，**不能**被计入 `activeHost`，否则 Side Panel 关闭时会错误显示“有运行宿主”。

- `src/platform/tasks/schedule-service.js` 以 Chrome `runtime.getContexts({})`、可信 `toolDocumentIdentity`、确切 `documentId`、`SIDE_PANEL` 或 `TAB+scheduledRunner=1` 共同识别可执行宿主，拒绝普通 Catalog / 工具 / 混合 URL / OFFSCREEN / cached 文档。Chrome API 失败时不假定存在宿主；确定性旧测试环境没有该 API 时保留兼容输入。
- `src/platform/tasks/schedule-repository.js` 的原 IDB 事务仍负责 Fire 状态，但 `WAITING_HOST` 由已核实的可执行宿主集合决定；宿主恢复时用**原 FireId**转回 `READY`，不重生成 occurrence、不重复分配执行槽。
- `tests/environment/scheduled-tasks-r1.test.mjs` 补充恶意/非执行 Host 排除、Catalog 留存、可见 Runner 恢复后原 FireId 不变的定向回归。
- 新增 `tests/framework/scheduled-tasks-r1-native-mac.test.mjs` 和 `.github/workflows/scheduled-tasks-r1-native.yml`，由独立 macOS runner 的 Chrome for Testing 加载**真实 WXT production 包**，通过 CDP 原生鼠标、键盘及 Chrome 文件选择器走原产品 UI：Task JSON 导入→同源码网页 Native 试运行→可信 Run/Result 回执→Candidate Verified→Available→安装→创建每分钟计划→保留可见运行页并关闭 Side Panel→Alarm→正式受控 Controller Run→网页 `#done` 与姓名变化→原 `runId/resultId`/retirement released→暂停。
- Native 读浏览器真实 IndexedDB 仅使用 `readonly` 事务用于身份与效果交叉核对，不直接注入 JS 执行任务、不伪造 FireId、Chrome 权限或 Native ACK。原始截图和结果即使失败也写入专属 artifact。

**验收证据：当前状态 `SOURCE_PREPARED / NOT_TESTED`。** 必须等这一 SHA 在 `Scheduled Tasks R1 component and package` 和 `Scheduled Tasks R1 installed Task real macOS Chrome` 两条工作流产生真实 Job 结果后才可升级。Mac CI 通过仍是独立 CI CFT 环境，不能伪称用户 Mac Chrome Profile 的最终人工/正式 F3 验收。


### R1.3 验收分层与 Linux CFT 预检

- Chrome 原生驱动沿用**同一份** `tests/framework/scheduled-tasks-r1-native-mac.test.mjs`，根据 CI 平台只改变 Mac Command-A / Linux Ctrl-A 与 Linux `--headless=new` 的实际键盘、窗口环境，不改变 Task 导入、Native 操作、FireId/RunId/ResultId 和 Worker 释放的成功判据。
- `.github/workflows/scheduled-tasks-r1-linux.yml` 在 Ubuntu 上构建真实 WXT package 并启动隔离 Chrome 155，提供更快的浏览器预检。它的成功只能记为 `LINUX_CHROME_NATIVE_VERIFIED`，**不能**当作 `MAC_CHROME_NATIVE_VERIFIED`。
- 原 `.github/workflows/scheduled-tasks-r1-native.yml` 独立 macOS runner 仍按相同受控 DOM/结果证据执行。GitHub 任务在排队时状态是 `QUEUED / NOT_TESTED`，不替换为 PASS。
- 每个原生场景必须由 UI 真实按钮、Chrome 原生输入和真实用户安装身份进入 RunHost；CDP Runtime.evaluate 仅用于观察 IndexedDB 的 readonly 投影，不可拿来调用启动方法、设置 DOM 值、授权网站或伪造 Native 回执。


### R1.4 实际 Chrome 原生第一轮失败与修复（不可把失败掩盖）

- [macOS CFT #38248468806](https://github.com/shopable-ai/opendesk-browser/actions/runs/38248468806)：**NATIVE FAIL**，真实 Chrome 155 成功启动已安装 WXT 包，获取正确扩展 ID 和 `SIDE_PANEL` 原生文档 ID，JSON/JS 导入已越过阻塞，但到 `#script-params` 的原生文本替换时，CDP 普通 macOS Command-A 未确保选中全部原值；尚未运行已安装任务，更不能宣称 Alarm/RunHost Native PASS。
- [Linux CFT #38249409647](https://github.com/shopable-ai/opendesk-browser/actions/runs/38249409647)：**ENVIRONMENT FAIL**，Ubuntu Chrome 155 在 `--headless=new` 启动阶段收到 signal 6，未产生 `DevToolsActivePort`，没有获取扩展/网页原生证据。
- 后续改用 CDP 原生 `Input.dispatchKeyEvent.commands=['selectAll']` 与实际 selection/focus 回读验证，再调用原生 `Input.insertText`；**禁止**通过 `Runtime.evaluate` 改 `element.value` 或派发 synthetic input 来让测试过关。
- Linux CI 改为 `xvfb-run` 真实桌面显示服务，并延长失败 Chrome stderr/退出码留档。保留 Mac 与 Linux 单独 CI 结果与原始失败，修复前后的源码、包和浏览器证据不可混算。

新 Chrome 作业实际通过前，`scheduled-native-macos`、`scheduled-cft-linux` 都保持 `NOT_PASSED`。


### R1.5 Linux CFT 原始失败根因与受限兼容

在 GitHub Actions [#38250058359](https://github.com/shopable-ai/opendesk-browser/actions/runs/38250058359) 中，Linux 已使用独立 `xvfb-run`，但真实 `native-report.json` 记录 Chrome 155 在读取 DevTools 端口前以 `SIGTRAP` 退出，stderr 明确为 `zygote_host_impl_linux.cc:130 No usable sandbox!`。这是 Ubuntu GitHub runner 的 AppArmor/user namespace 限制，**没有形成任何可验证的网页或定时执行证据**。不是通过注入数据或放宽 OpenDesk CSP 能解决的问题。

为了获得浏览器执行预检，Linux 流水线现在**仅在**实际 `linux`、`CI=true`、`GITHUB_ACTIONS=true` 和显式 `SCHEDULE_NATIVE_CI_NO_SANDBOX=1` 同时成立时，对该单次隔离 Chrome for Testing 进程追加 `--no-sandbox`。非 CI / Mac 环境不接受这一开关；正常扩展权限、CSP、Authority 和 MV3 都未改变。**该 Linux 结果不评价 Chrome OS sandbox 安全性，更不能代替 Mac 真实 Chrome 验收。** 原失败 artifact 仍保留，不改写为通过。


### R1.6 Linux CFT 真实执行正向验收（2026-10-12，固定候选）

[Linux Chrome for Testing CI #38250781773](https://github.com/shopable-ai/opendesk-browser/actions/runs/38250781773)，候选源码 `f58d6a8c35a458440f4a8f8028d1934d44cd9e0a`，`scheduled-cft-linux=completed/success`。正式 WXT production 的固定包指纹：`645486f79e3638577f0810b0e797726039776c1bd7af61580af42b72ceb5a9db`。Chrome for Testing 155.0.8059.39，独立 Xvfb + 临时 profile，Linux CI-only 关闭 OS sandbox（**不支持 Chrome Sandbox 安全验收**）。

[CI 原始证据包](https://github.com/shopable-ai/opendesk-browser/actions/runs/38250781773) artifact 名称 `scheduled-tasks-r1-linux-f58d6a8c35a458440f4a8f8028d1934d44cd9e0a`，包含 `native-report.json` 与 4 张真实 Chrome 截图。经读取报告和真实 CI 日志核对：
- `manualTaskVerification=PASS`：用户 UI 载入 `form-fill.v1.opendesk-task.json`、将完全一致的源码通过真实 Chrome 文件选择器导入 Developer，原 Chrome Page 发生表单输入/提交，并取得原 `Run/Result`、Native effect receipt、worker retired/released；
- `verifiedInstallation=PASS`：Candidate 通过原 `verifyTaskCandidate`，设为 Available，固定版本安装并授权；
- `nativeScheduleCreation=PASS`：在原 `我的` 内创建 `interval=1m` 持久计划；
- `sidePanelClosedRunnerLive=PASS`：通过 UI 打开可见 `scheduledRunner=1` TAB，并真实关闭 `SIDE_PANEL` 目标；
- `actualScheduledNativeEffect=PASS`：Chrome 到期之后原 Controller `RunId=26b36080-c307-49c2-bd87-766f2ab700b6` 与 `ResultId=9a4c5b9d-d9a9-4431-9c4c-82e926b5a6f2` 绑定持久 FireId `sched:901cc494-e5ee-4236-a593-487af7c33967:1:1791809194502`；原 `run.state=completed`、`retirementState=released`、`workerRetired=true`，有真实 Controller native receipt，网页 `#name` 为 `Scheduled Native` 且 `#done` 存在；
- `nativePause=PASS`：最后通过可见扩展 UI 暂停计划，持久 `nextDueAt=null`；
- 按固定源码实际执行的原生测试 **1/1 PASS**。该结果不是 Node 模拟、只触发 Alarm 回调或访问静态原型。

**仍需核对：** macOS CFT 工作流在 runner 队列中，不能把 Linux CFT 提升为 `MAC_CHROME_NATIVE_VERIFIED`；多 Host 同时竞争、Host 全部消失及恢复、Chrome 整浏览器重启、真实撤权/版本变更/未知后效、Side Panel 真实 200% 缩放均没有此候选的正式原生证据。Linux 截图缺 CJK 字体，不能据此进行中文视觉 95 分评分。新增功能与旧稳定候选不得混同为系统最终 F3/ZIP 验收。


### R1.7 定时视图所有权与独立真实 Linux 回归（2026-10-12）

- [macOS Chrome CI #38250781643](https://github.com/shopable-ai/opendesk-browser/actions/runs/38250781643) 的实际失败已经进一步定位：同一原生 SIDE_PANEL 完成真实 Task 运行、Native 回执、Verified、Available 与固定版本安装，随后由于 macOS 原生 `<select>` 弹出菜单吞掉 CDP 键盘事件，`#schedule-task-select` 未选择成功。此候选**尚无 macOS Alarm→Run/Result 原生通过证据**。
- 提交 [`0ef8f175e163`](https://github.com/shopable-ai/opendesk-browser/commit/0ef8f175e1635a30a468c8367ff59126e78f88a6) 已改为真实键盘 Tab 聚焦关闭状态的下拉框，然后 Home/ArrowDown/Enter，回读实际 selectedIndex/value；绝不写入 `element.value`、调用模拟 `change` 或直接触发执行。
- 读取此前 [macOS CI 截图](https://github.com/shopable-ai/opendesk-browser/actions/runs/38250781643) 发现「定时计划」页面保留了无关的手动「运行任务」固定底栏。提交 [`b842a2e873`](https://github.com/shopable-ai/opendesk-browser/commit/b842a2e873f321947e993184f87092bf21ade57b) 增加 `setScheduledSurfaceActive` 和 `setScheduledRunOwner`；定时页面空闲时隐藏无关底栏，正在进行的真正手动 Task 仍保留自己的 Stop，定时 Run 不冒充 Developer/Workflow 所有者。
- **与上述 UI 修复同 SHA 的 GitHub Actions [Linux CFT #38255899212](https://github.com/shopable-ai/opendesk-browser/actions/runs/38255899212) 已完成 success**，原始 `native-report.json` 包含 `manualTaskVerification`、`verifiedInstallation`、`scheduledDockIsolation`、`nativeScheduleCreation`、`sidePanelClosedRunnerLive`、`actualScheduledNativeEffect`、`nativePause` 均为 `PASS`。浏览器真实页面出现 `#done`，姓名为 `Scheduled Native`，FireId/RunId/ResultId 精确关联，`retirementState=released`，且截图已证实无多余手动底栏。
- 同 SHA 的 [Scheduled Tasks R1 组件和包 CI #38255898825](https://github.com/shopable-ai/opendesk-browser/actions/runs/38255898825) 中：11+5+8+42+5+8+111 = **190/190 定向/共享组件 PASS**；`scheduled-package` job 已 `completed/success`，生产/开发构建与包校验通过。
- **macOS 未自动升级结论**：本次最新 [Mac CI #38255899093](https://github.com/shopable-ai/opendesk-browser/actions/runs/38255899093) 尚未取得终态原生回执；它独立于 Linux，必须读取 job 日志、真实截图、候选 SHA 与持久 Run/Result 后才能标记通过。
- Linux GitHub CI-only `--no-sandbox` 和缺失 CJK 字体仍不能用于评价 macOS Chrome OS sandbox 或中文视觉 95 分。多 Host、无宿主后恢复、浏览器整进程重启、网站撤权/版本变更及 200% 缩放仍为专项未验证项。
