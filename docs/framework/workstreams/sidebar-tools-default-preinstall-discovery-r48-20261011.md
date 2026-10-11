# OpenDesk Browser R4.8：可信默认预装、轻量发现与一致性验收

日期：2026-10-11。工作分支：`main`。工作范围：官方 Catalog → 可信 SW 首次安装意图 → 原安装器 → Side Panel 工具入口 → 既有离线市场。

## 本轮实际实现范围

- `official-tools/catalog.json` 是唯一可信预装策略的源码声明。首次安装预装 `reading-toc`（阅读目录）和 `quick-notes`（网页笔记）；`web-markdown-clipper`、`markdown-workbench`、`knowledge-inbox` 保持 `optional`。发行 Catalog 通过现有构建生成，不维护第二份 ID 名单。
- `src/sidebar-tools/preinstall-intent.js` 只在 Service Worker 登记首次安装意图；`src/sidebar-tools/default-preinstall.js` 由后台固定 classic 资源直接执行预装，Side Panel 同时提供恢复入口。仅由 `runtime.onInstalled(reason='install')` 写入 `opendesk.sidebar-tools.bootstrap.v1` 意图，启动恢复只继续已有同版本固定计划。不把“扩展本身有文件”解释成已安装；实际状态仍在 `opendesk.sidebar-tools.installed.v1`。旧 Profile（包括已存在的空安装记录）、update、restart、Side Panel 打开均不凭空补装。
- 使用 `loadOfficialCatalog/loadOfficialTool` 验证扩展本地 HTTPS 以外不可替代的固定资源身份、版本、能力、字节和 SHA-256；可信宿主调用已有 `installReviewedSidebarTool`，复用 Web Locks、容量、卸载撤销代际、来源和事务日志。不会授权任何网站，不会运行代码或打开 iframe。失败后的固定计划可恢复；未知写入结果保留 `attention`，停止自动重放。
- 「工具」Tab 内为「我的工具」与「发现工具」；已安装列表优先渲染，未安装官方工具在轻量发现里支持搜索和可安装/全部，已安装版本不会重复推荐，更新提示就地出现，复杂详情/版本/套装/存储仍由原市场 `ui/marketplace.html` 完成。全局启停需跨全部运行入口落实可信拦截，不发布不生效的开关。
- 本轮未改动 Chrome 主权限或独立安装数据库，不重写旧 R4.5 的测试记录或截图。

## 已设置的测试入口及验收证据状态

新增 `tests/environment/sidebar-default-preinstall-r48.test.mjs`，覆盖新安装、旧 Profile、并发初始化、部分失败、安全恢复、卸载保护、损坏记录及回执丢失后的禁止盲重放。扩展 `tests/environment/official-tools-catalog-r45.test.mjs`、`tests/environment/sidebar-tools-host.test.mjs`，并更新 `tests/framework/app-market-r3-native.test.mjs` 的首次两项预装/其余三项审阅场景，保留人工导入/权限/批量/容量/重启原场景。既有 `.github/workflows/app-market-r3.yml` 在相关路径 push 到主分支后执行 Node 目标测试、check/build/build:dev/verify/pack、市场生成、Linux Chrome for Testing 原生测试和 npm test，并保存真实截图与证据。

**CI 阶段记录**：commit `dece60a8` 的定向 Node 回归 114/115（1 条搜索期望错误，已修正）；commit `24146f21` 的定向回归 115/115，但生产 SW 构建因固定体积预算 `348997 > 327680` 中止。现已拆分 SW 意图与 Side Panel 安装器，需重新构建及 Chrome 验收。当前未完成的 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`、`npm run pack`、`npm test`、真实 CFT 验收状态仍以对应 commit 的 CI 为准，`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`、`npm run pack`、`npm test`、真实 CFT 都标记 `PENDING_CI`，不能写成 PASS。GitHub Actions 验收严格关联本轮实际提交 SHA；Mac Chrome 因环境不在本会话中为 `NOT_TESTED`。真实 CFT 截图位置仅在工作流成功生成后才能填写，不能编造路径已存在。

## 安全与限制

- 已验证原则：预装只限可信扩展自带目录，包仍通过原安装器和原校验，不自动扩大站点权限；`optional` 保持人工审核；源码不执行构建包的任意 JS。
- `bootstrap.v1` 是单次进度，不是权限或工具清单。升级不会静默添加新增默认工具，卸载/撤销代际优先，不允许未知结果重复提交。
- P1 待验：真实 Chrome 320/360/400/420px、键盘焦点和所有安装生命周期/并发边界；上述覆盖由真实驱动和 CI 结果决定。
- P2 未实现：跨 Side Panel、新标签页及网页入口的全局启停强制拦截，因此不暴露假的“停用工具”状态。
- 此文档不是 Chrome PASS 回执，也不代替原 603+19、B05、F3 和 ZIP 的正式验收合同。

## 与历史证据隔离

基于 2026-10-11 的 `main` 工作快照并持续复核并行提交。历史 R4.5/CFT 以及 R4.1 记录不被本轮修改为新版结果；真正的 SHA、测试计数、截图和失败诊断以新工作流 CI 原始记录为准。


## R4.8 构建架构修复（2026-10-11）

- 之前 SW 直接导入安装器：生产 SW 348997 / 327680 字节，CI 拒绝发布；分离基本意图代码后仍超限（330248 / 327680），均保留原 CI 失败。
- 修订为既有 **固定 WXT classic script** 路径：`src/entrypoints/preinstall-intent.js` 按现有 `scripts/build-contract.mjs` 注册，输出 `sidebar-tools/preinstall-intent.js`。SW 只以 `importScripts()` 装载经本扩展打包的静态资源，不下载执行远程代码；只有 `onInstalled(reason='install')` 登记意图。
- `src/sidebar-tools/preinstall-intent.js` 不依赖安装器，`src/sidebar-tools/default-preinstall.js` 只被受信 Side Panel 宿主加载。正式包必须按原固定资源合同、哈希和大小审核，不能提高 320 KiB SW 门槛规避问题。
- CI 新候选需要重新验证 Node、production+development build、verify、pack、市场路由和真实 Chrome。原 603+19/F3 不因本阶段通过而提升验收等级。


## 后台固定资源进一步治理

2026-10-11 新增的固定预装意图资源已通过定向 Node 阶段，但生产 SW 仍为 `328457/327680` 字节（CI run 38142184936），因此不能将它宣告为构建通过。为保持原硬上限与功能完整性，将环境健康探针的**原有协议和真实 sender 校验**从 SW 主包搬到专门的 `agents/health-host.js` 固定经典资源：`src/entrypoints/health-host.js` 通过现有 WXT 入口及 `scripts/build-contract.mjs` 注册。只有 `opendesk.environment.v1` 交由此资源处理；`opendesk.foundation` 仍由主 Service Worker 保持其原有授权和调度。网页发起的请求不获得新权限。

两个 classic 资源均由受信扩展静态打包并由 SW `importScripts` 加载，不从网络更新、下载或运行第三方代码。此拆分预期缩小 SW 主包，但**必须以当前 commit 的 CI 生成结果验证**，不预先判定通过。必要时核对 `k4-background-services`、`environment` 等协议回归与正式原生 Chrome 测试。


## 当前 CI 实际结果与阻塞（2026-10-11）

- R4.8 的受信预装意图固定资源、既有健康探针固定资源已在 `674622fe10c3e4144c0837bf86363210e4621eb9` 进入 `main`，后台 `importScripts`、原协议检查和包固定资源注册已完成。此改动通过先前 777 字节 SW 超限阶段；后续 CI 继续进入最终包安全扫描。
- `4670bdf1cbbd0035a8bd0e9763c9d8dfc35c4f1a` 将 R4.8 一次性预装专项测试加入市场 CI 的第一阶段。实际运行 [GitHub Actions #38142789235](https://github.com/shopable-ai/opendesk-browser/actions/runs/38142789235)：目标 Node **123/123 PASS（0 fail）**，`npm run check` PASS；生产构建已经越过 SW 大小门槛，但在 `scripts/verify-package.mjs` 包安全扫描失败，报 `Unapproved dynamic constructor reference in libs/packages/crypto-js.js offset=518`，未生成合格发行候选。
- 此 `crypto-js` 固定库由独立 R15.8 依赖工作流在 [a42819c](https://github.com/shopable-ai/opendesk-browser/commit/a42819caf9dc936796989dd4d5e70ae8ab2390cb) 引入；不是 R4.8 官方内置工具依赖。按照多 Agent 所有权及禁止放松 CSP/校验器规则，R4.8 **未对其修改，也未放宽验证器**，应由负责固定第三方库的工作流修复并产出同版本验收。
- 因上述真实 FAIL，`npm run build:dev`、`npm run verify`、`npm run pack`、`npm test` 全套环境回归以及真实 Linux CFT/真实 Mac Chrome 均 **NOT_TESTED**（当前候选）。原历史 PASS 不能转移到 R4.8 新候选；专家评分不得标为 95+，产品交付应保持 **部分实施 / 原生未验收**。
- 阻塞消除后应重新确认同一 SHA 的两种 WXT 包、固定资源哈希、真实 fresh Profile 首次安装的两个工具、网站授权保持为空、手动安装/去重、卸载后重启、用户权限和数据安全，以及 CI 归档的截图。Mac 需要独立本地实际 Chrome 验收。


## 后台即时预装的新实现（当前待验收）

R4.8 现已通过固定 classic 资源 `src/entrypoints/preinstall-intent.js` 完成可信新安装意图登记后，立即复用 `resumeDefaultPreinstall` 安装两项官方默认工具。MV3 Worker 重启仅尝试恢复已有的同版本可信意图；Side Panel 保留同一 Web Locks 下的幂等恢复入口。此流程不执行工具 JS，不自动授予网站权限，也不修改原安装清单 Schema。

之前 `123/123` 定向通过属于 `4670bdf1`；这一后台即时安装调整必须重新绑定新提交的 CI 结果。当前生产包仍受 R15.8 第三方 `crypto-js` 输出的严格动态构造安全扫描失败所阻塞，禁止放松 CSP 或冒充 CFT PASS。
