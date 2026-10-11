# 官方工具 Catalog R4.5

日期：2026-10-11。状态：`IN_PROGRESS`。本任务仅在 `main` 工作；本工作区由主 Agent 串行写入，三个子 Agent 仅只读审计。

## 开工身份与资源

- 初始远端/检出：`7d5e4b94df7f229b6eecb2db86c325066c2a039f`；工作树干净。
- 首次 fetch 后安全快进到：`2265df8586e1a81946512434ace46885b3090960`（新增市场 R3 原生驱动与 CI）。未覆盖其他会话修改。
- 本任务工作目录：`/workspace/scratch/1a7d964a05cb/opendesk-browser`。构建只使用本目录 `.wxt/`、`dist/`，原始证据写本工作流独立目录。
- 不占用其他会话的 Chrome Profile、端口、dist 或已有验收证据。本地浏览器资源尚未确认；真实 Chrome 证据计划优先复用现有隔离 CFT / CI 驱动。用户 Mac、已登录网站、整体 F3/ZIP 当前 `NOT_TESTED`。

## 最新源码审计

实际官方发行包含阅读目录、网页剪藏、网页笔记、Markdown 工作台、知识收件箱，共五个工具；侧栏快捷入口原有三个，市场 R3 已有五个入口。不能按早期只含三个工具的方案覆盖最新市场代码。

复用现有 `buildSidebarTool`、`validateSidebarToolPackage`、`installReviewedSidebarTool`、`SIDEBAR_TOOL_STORE`、独立网站授权与 sandbox 会话合同。迁移旧 `src/sidebar-tools/*.opendesk-tool.json` 及示例中的正式生成副本；版本/能力继续来自各项目 `tool.config.json`。

## 验证范围与复用判断

- `AFFECTED_INPUTS`：官方包构建、固定资源校验、源输入指纹、开发 watcher、侧栏官方安装/更新、已实现市场的发行来源和公开站点构建。
- R4.4 历史 Chrome PASS 保留绑定 `07b39e043f13208e743eec67a523f1ccf28f60a1` / Actions `38116275393`；本轮不冒充新候选通过。
- 先执行定向 Catalog、打包、安装与 TOC/剪藏/知识组件，再执行双构建、verify 和受影响原生驱动。仅针对具体剩余风险扩大验证。

最终变更、精确源码 SHA、测试日志、CI/Chrome 身份、未测试项及资源释放状态将在执行后追加。

## 并行集成与源码保留

- 第二次快进：`2265df8586e1a81946512434ace46885b3090960` → `96812e6ed942fd256eb9f44d071093dc204ff554`。保留旧编辑状态、条件写入、开发复制失败以及 Native 焦点等修改。应用前的本地 checkpoint 为 `c4d55282103c497b235e6c45021f131ba6ceee0b`。
- 第三次快进：`96812e6ed942fd256eb9f44d071093dc204ff554` → `e83738816d108506e13f28bd3d4e3be48ac30e4e`，18 个并行提交，包含知识收件箱 R24 v1.1.0、恢复原文后继续编辑修复、R3.1 批次独占锁/持久 journal/中断恢复和 Native 授权失效修复。应用前 checkpoint 为 `007fc1efdeea40581e5e0aa6a5f00ff1396d577c`。两个 checkpoint 均保留；没有 reset、clean、强推或覆盖原始证据。
- `fab7631131d9c23e1f665e83bfbe7dc5ee22e876` 新增批量市场消费者也迁移到可信 Catalog；保留 `ifAvailable` 批次锁、未决事务防覆盖、派发前 journal 和 queued→interrupted，只读恢复不重放。历史身份校验不构成安装权。
- R24 的源码、配置和两份旧生成包逐字节一致（v1.1.0，42,219 字节，SHA-256 `3d3ff1e913e884e31ef6fbec37dde3185cc788ee352808a747b7fd58a87f965e`），再移除旧生成文件。其 UI、测试及修复均保留，不把 R24 回退到 v1.0.0。

## 目录与模块变更

| 范围 | 变更及实际职责 |
| --- | --- |
| `official-tools/catalog.json` | 五个 optional 官方源码项目，登记稳定 ID、可信仓库、固定项目和类型；不登记版本、能力或用户状态 |
| `src/sidebar-tools/official-catalog.js` | 可信框架模块，校验源码/发行 schema、固定扩展资源、字节长度、SHA-256 和安装状态；不含工具 payload、不初始化安装记录 |
| `scripts/build-sidebar-tool.mjs` / `src/ui/sidebar-tools/package.js` | 提取现有包生成和规范序列化，保留同一 validator 与原包格式 |
| `scripts/build-official-tools.mjs` | 按可信源码生成资源；固定身份、路径/符号链接、源码漂移、经典 JS、内嵌静态资产和字节上限校验；确定性包、清单与摘要 |
| `prepare-public` / `build` / `verify-package` | 自动生成暂存资源、跟踪真实源码输入、重新生成逐字节验证；禁止旧目录副本、额外资源和预算漂移 |
| `wxt-development` / `dev` | 官方源码与 Catalog 进入现有 watcher；失败保持失败状态，恢复后发布；目录新增/删除经现有 WXT restart；共享安全写入器不跟随输出符号链接 |
| `sidebar-tools.js` / `tool.html` / CSS | 五个统一动态官方入口，状态取自 Catalog 与原安装记录；读取失败不伪装成功；审核及提交分离 |
| `installation.js` | 保留原 registry/锁/数据；来源接管确认，能力与网站授权交集，未知 ACK 绑定原操作/版本/字节，不重试批准 |
| `marketplace/{catalog,page,batch}.js` | 展示文案与版本来源分开；统一 release 解析；固定套装历史版本不替换；新批次只接收当前可信发行 |
| `build-market-site.mjs` | 静态详情/固定版本页面复用相同真实发行；缺失历史版本显示不可用，不输出失效安装承诺 |
| 环境测试 / 既有 framework 驱动 / 五个 workflow | 从真实源码或实际 dist 读取包；新增 Catalog、版本/字节、按需安装、并发/取消/未知结果和 dev 恢复回归，扩展现有 Chrome 驱动 |
| 现行 API、产品入口、各工具 README、开发 Skill | 统一路径和安装教程；未来系统默认初始化仅写合同，不实现第二套安装器 |

最终资源路径为 `dist/{production,development}/official-tools/catalog.json` 及 `official-tools/<id>/<id>.opendesk-tool.json`。`.wxt/public/official-tools/` 是自动生成暂存资源；单工具默认输出 `artifacts/sidebar-tools/<id>/<version>/<id>.opendesk-tool.json`，整套独立生成默认输出 `artifacts/official-tools-release/`。

已移除 `src/sidebar-tools/` 五份官方生成 JSON，以及 examples 中 clipper、notes、workbench、inbox 四份生成副本。运行框架 `bridge.js`、`sandbox.html` 保留。源码中不再维护第二套正式 JSON；固定 Git 历史版本回归引用保留，不属于当前发行副本。

## 安装、数据与权限语义

Official Bundled、Installed、Site Authorized、Active 是独立事实。五个工具均按需安装，启动扩展/打开侧栏/加载 Catalog 不写 `SIDEBAR_TOOL_STORE`、不授权网站、不执行工具代码。审核不是安装；提交再次检查固定包字节和原审核基线，共用原安装器、Web Lock、持久存储和运行实例。

旧安装包和私有数据不因资源目录迁移删除。网页笔记源码当前 v1.1.5，旧 `src/sidebar-tools` 副本实际还在 v1.1.1；新目录消除这类漂移，用户仍须审核更新。`reading-kit` revision 1 保留 notes v1.1.1，不静默换为当前版本；不可用成员保持 blocked，其他成员按预检处理。官方更新、旧本地来源接管与新增能力仍需确认；安装不等于网站访问。卸载清理既有工具数据、来源及授权；后续启动不重新安装。

未来默认系统能力遵守独立核心功能合同：可信持久迁移标记、只初始化一次、幂等恢复，用户卸载/停用优先，浏览器网站权限仍独立。本轮没有默认安装 TOC 或新增双安装器。

## 已取得的本地证据（中间候选）

以下本地结果不等于最终 CI 或 Chrome 验收，早期结果仍绑定其源输入：

- `npm ci --ignore-scripts --no-audit --no-fund` 成功；Node 24.19.0 / npm 11.9.0。依赖锁未因本轮改变。
- `npm run check`：367 个源码/测试/构建文件、入口、CSP/MIT 检查通过。
- 整合 96812e6 后 Catalog/host/market/dev 定向 68/68 通过；确认后 ACK 丢失、提交后刷新失败及审核后包缺失用例通过。
- 整合 e837388 后 Catalog、market、batch、knowledge R1/R24、host、dev 定向 **98/98 通过**，零 skipped/cancelled。
- 早期 production 构建包哈希 `bcd9b5772338827637f51b998dffe983bb6f586808a7e121ab01bd04b86debc0`；development `9d26c0ae9af1f5ddf129b385a6392dfbbf25167cf7bcc65f10e137177936594b`。迁移 CSS 后 production `5c170d3660bfcbcc7072fd6ec4610eaa9c2595e30b5951767bda4f64410dab4b`。这些都早于 e837388 新包，不复用为其原生证据。
- 五个修改后的 workflow YAML 解析、全部变更 Markdown 相对文件链接检查、开发 Skill `quick_validate.py`、原生驱动语法检查通过。语法/静态检查不代表 Chrome 通过。
- 失败记录保留：早期定向测试出现等待 ready 的测试 fixture 及固定事件循环次数问题，已改为明确状态等待；早期知识 fixture 缺少 session storage 已补齐。初次 dev build 遇到本执行器已退出 PID 被下一命令复用的旧本地 fence，先核对自己已退出的 build session、成功 receipt、独占端口空闲及精确 token，记录后仅清理自己的 fence。没有清理其他 Profile/证据/构建锁。
- 本地 HTTPS Git 推送 dry-run 因未提供终端凭据失败；后续通过已连接 GitHub 的 Git 数据/受限 ref 更新接口提交，不建立新分支或 PR。

## 最终验收待记录

最终候选提交、双构建/全量回归/verify、GitHub Actions run/job、实际 Chrome 身份、包哈希、两次正常重启、网站授权/撤销、卸载与截图将在实际运行后填写。不能以驱动存在、静态 DOM 或历史 CI 代替。

- 实际用户 Mac Chrome：`NOT_TESTED`。
- 公网业务网站及登录状态：`NOT_TESTED`；Chrome 专项使用隔离本地 fixture。
- 整体框架 F3 与 ZIP 安装验收：`NOT_TESTED`。生成并校验 ZIP 不等于加载 ZIP 安装通过。
- 公网市场部署、外部安装意图桥：未实施，本轮不发布。


### e837 构建、验证及本地全量限制

- Production：`efea0db9f0b44c1245b7d62a0e4f35142fc8d9fecc16c28dcf7352be2ff5fd20`，50 个文件。
- Development：`8db846ff3c6185badb3947108267527b90eda8c3d003cdab3b17a50b1312ceda`，69 个文件。
- `npm run verify` 两个实际产物通过；`npm run build:market-site` 五个当前版本路由生成通过；`npm run check` 371 个文件通过。
- Production `sw.js` 320,970 / 327,680 字节（剩余 6,710）；`ui/tool-shell.js` 328,512 字节，超过 327,680 的软审阅线但低于 524,288 硬预算。官方包未进入 Service Worker，软预算警告保留，不放宽预算。
- 本地全量 `npm test`：1,082 项，1,067 PASS、8 FAIL、7 SKIP、0 cancelled。8 个失败均因当前执行器拒绝 Unix domain socket `listen`（EPERM），不能据此宣布全量通过，也没有把 socket 合同改为模拟。应由支持真实本地 socket 的 GitHub Linux runner 取得该门禁结果；7 个既有 skip 的原因保留于原始 TAP。
- 再安全快进到 `3ad42a5559189d2749bd4546e7ddc2c509c675b1`，保留 `89897f0efc2905866dfd1d2f1f779a2143cbe0ce` 的 R24 恶意 Markdown 断言顺序修复及知识 CI 先原生后全量的步骤顺序。两提交仅修改测试/workflow，相关构建输入不变；保留上述实际 dist 与 receipt，不为无关提交重复构建。同步 checkpoint：`21b37585d14bc77e0d1cf3815bcc6a6f1f4db851`。


### 既有 Node 22 CI 门禁修复

只读复查历史 Actions `38124322724` / job `114425395612` 的真实日志（Node v22.23.3），首个取消是 `local-dev-preparation.test.mjs` 的后台构建加入测试：只等待纯 Promise，而后台 timer/watch 本来就是 unref，事件循环可在回调进入前结束；之后七项被连锁取消。保留生产后台退出语义，测试改用自身有界、保持事件循环的既有 `until` 等待进入 gate。没有放宽 Task/Page/Native 合同或跳过失败门禁。R4.5 市场 workflow 同样先采集真实 Chrome 专项，再执行仍严格失败的完整环境门禁，使无关门禁失败不吞掉原生诊断。

### 提交前再次集成知识生命周期修复

- 安全快进到 `a033d3b740ed39c27f1fb4fed9910d4968418d04`，保留 `5ea14829cb017b6e58fdcc65ffb125c5daf2f30d` / `fd967ba2000ac0eff1f0522e1b36e0ab9f4af379` 的真实 Chrome 关闭/授权断言，以及保存、删除后清除通用 sandbox dirty/busy 状态的源码修复。同步 checkpoint `8eb38f088e07a6c877c839edd2b92c060844fbba` 保留。
- 更新后的知识包仍为 v1.1.0，42,521 字节，SHA-256 `a3a791304203c3b3c0bf0ca3596e50353b0e779fea05243e0fa98712f97a3250`。删除两份上游生成副本前，确认它们与新生成器结果逐字节一致；源码修复没有被目录迁移覆盖。
- 该输入上的 Catalog、现行 UI 和 R24 定向测试 24/24 PASS；Node 22 门禁等待方式的本地测试 10/10 PASS（本地仍为 Node 24，Node 22 实际结果待 CI）。旧 e837 双构建指纹不代表本次知识源码输入，最终双构建与 Chrome 绑定后续候选 SHA。
