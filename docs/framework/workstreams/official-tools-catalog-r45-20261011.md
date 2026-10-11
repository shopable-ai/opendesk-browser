# 官方工具 Catalog R4.5

日期：2026-10-11。状态：`IMPLEMENTED_AND_VERIFIED_WITH_SCOPE`。本任务仅在 `main` 工作；主 Agent 负责源码与 refs，三个子 Agent 负责只读审计；后段仅向一个子 Agent 独占分配 Knowledge 单个测试文件，完成后收回写入权。


## 最终交付与验收范围

本轮工程实现及 Linux Chrome for Testing 受控验收完成。最终实现提交为 [`c8b5b2ef82ea78df9b8105c17bb35d232de066ae`](https://github.com/shopable-ai/opendesk-browser/commit/c8b5b2ef82ea78df9b8105c17bb35d232de066ae)，parent `ee212afdbbdd0f2a57b5763bae528e46e9b0ea8b`，tree `060886dbee87b5af5d5519c1b138c9971582066e`。以下成功结果全部绑定该 SHA。2026-10-11 10:17:05 UTC，主 Agent 最终读取的 **13 个实际触发工作流全部 SUCCESS：12 个验证工作流、1 个维护工作流**。

[完整机器可读验收索引](evidence/official-tools-r45-20261011/verification-c8b5b2ef.json) 保存 7 个实现提交所涉及的 87 个文件、另附本次归档清单、288 个构建源码输入及 SHA-256、全部 run/job/step、生产/开发资源清单、官方发行摘要和评分依据。本文与原始截图的后续提交只归档证据，不修改已经验证的生产输入；最终文档提交 SHA 以 Git 历史为准。下方所有旧候选、失败和待运行描述按当时时点保留，不能替代本节的最终结论。

### 完成的机制与兼容性

- `official-tools/catalog.json` 统一登记五个可信 `optional` 官方候选；源码仍在 `examples/sidebar-tools/<id>/`，版本与能力只有 `tool.config.json` 和经验证的实际包一个权威来源。
- 现有打包器、validator、WXT public 生成及 verify 共同生成和验证固定路径、UTF-8 字节长度、SHA-256、身份、版本、能力和静态资产；包先发布、Catalog 后发布，源码漂移直接失败。生产与开发资源统一位于 `official-tools/<id>/<id>.opendesk-tool.json`。
- `src/sidebar-tools/` 的五份及 examples 的四份生成 JSON 已移除。框架桥与静态 sandbox 保留；旧 JSON 路径和独立 `READING_TOC_OFFICIAL_VERSION` 不再出现在现行源码/API/教程中。
- Official Bundled、Installed、Site Authorized、Active 分离。首次启动与打开 Side Panel 不写安装记录、不授权网站、不启动工具代码；卸载后即使资源仍随扩展分发，两次完整重启仍保持未安装。
- 五个正式入口共用原安装器、安装数据库、Web Locks、会话和网站授权合同。官方包提交前重验固定发行内容，取消、并发冲突、缺包、篡改、能力变化、来源冲突与未知 ACK 均有明确拒绝或恢复路径。
- 本地旧包、原私有数据和合法网站授权继续有效。升级恢复绑定固定身份及已验证旧来源快照；缺失确认不重放。孤儿数据保持原内容，可信卸载恢复日志清理后才可重新审核安装；没有日志时不静默删除或指向不存在的按钮。
- 持久撤销 nonce 防止同 ID/版本/内容重新安装后旧 iframe 重新取得数据权。较新的 epoch 通知不会被初次异步读取覆盖；Knowledge Service 同样拒绝遗漏或旧 epoch。
- 保留并整合 main 上同时进行的市场、存储、Page 固定资源与知识工具更新；没有新分支、Worktree、PR、强推、reset/clean，也没有覆盖其他 Profile、构建或失败证据。未来默认系统功能只补合同，没有默认安装 TOC 或实现第二套安装器。

### 当前官方发行资源

| 工具 | 版本 | 实际 JSON 字节 | 安装策略 |
| --- | --- | ---: | --- |
| `reading-toc` | 1.0.2 | 9,374 | optional |
| `web-markdown-clipper` | 1.0.0 | 10,209 | optional |
| `quick-notes` | 1.1.5 | 21,798 | optional |
| `markdown-workbench` | 1.0.0 | 13,016 | optional |
| `knowledge-inbox` | 1.1.2 | 42,854 | optional |

生成 Catalog 为 3,159 B，SHA-256 `8a99acc40950f00b396a41a22392b4133111e4d67dfa8808d364dc398f7cf24b`。上述五包均逐字节核对了实际 `dist/production`、CI artifact 与原生结果中的发行记录。React/Vue starter 继续是本地示例。固定 `reading-kit` 历史 revision 不会被当前 notes 版本替代，不可用旧版本保持 blocked。

### 实际 CI 与组件计数

| 范围 | 精确 run / job | 结果 |
| --- | --- | --- |
| R4.5 主闭环 | [38131130907](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130907) / `114445521189` | 104/104 定向；1/1 真实 Chrome、12 阶段、24 个匹配对话框 |
| TOC R4.1–R4.4 | [38131130981](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130981) / `114445521152` | 30/30 TOC；48/48 Sidebar；1/1 真实 Chrome |
| Knowledge | [38131130903](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130903) / `114445520975` | 121/121；1/1 真实 Chrome；38 张界面截图及 38 条布局测量 |
| Markdown/剪藏 | [38131130878](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130878) / `114445521034` | 7/7；1/1 真实 Chrome；802 B 实际正文、本地 Markdown 导入及安全预览 |
| Sidebar 包/框架 | [38131130841](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130841) / `114445520868` | 149/149；双构建、verify |
| 资源预算 | [38131130892](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130892) / `114445521086` | 25/25 + 146/146 + 10/10；原有硬预算通过 |
| Page package | [38131130926](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130926) / `114445521111` | 161/161 + 9/9 + 11/11 + 3/3；双构建/verify/ZIP 生成 |
| R21 UI | [38131130921](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130921) / `114445521140` | 109/109 + 14/14 |
| Native / 完整环境 | [38131130950](https://github.com/shopable-ai/opendesk-browser/actions/runs/38131130950) / `114445521148` | 完整 Node **1124 total / 1117 PASS / 0 FAIL / 0 cancelled / 7 SKIP** |

四条工具专项也分别执行了相同的完整 Node 套件，结果均为 1117 PASS、0 FAIL、7 SKIP；这些是重复执行的证据，不能累加为独立测试总量。独立 Native macOS Intel `114445521199` 与 ARM `114445521218` 各自通过 3/3 Native Host/IPC 和 2/2 真实 Chrome Options/CLI 诊断；这不替代官方工具的 Mac Side Panel 专项。P0、Site access、R7 和维护工作流同样 SUCCESS，完整链接见验收索引。

本地 Node 24.19.0 / npm 11.9.0 的十文件定向回归 **124/124**，无跳过或取消；`npm run check` 检查 **382** 个文件。依赖安装及本次 `npm run build`、`npm run build:dev`、`npm run verify` 均 exit 0。当前执行器不支持既有 Unix socket 全量测试，完整 Node 22.23.3 结论来自实际 GitHub runner，没有用模拟接口规避该合同。

### 真实 Chrome 闭环和原始证据

实际环境是 Ubuntu 24.04.5、headed Chrome for Testing **155.0.8059.39**；生产扩展 ID **`jhajepcnohiplmafaiokjlcagcfjgaap`**，加载目录 `/home/runner/work/opendesk-browser/opendesk-browser/dist/production`。[原始 R45 结果](evidence/official-tools-r45-20261011/native-result-c8b5b2ef.json) 的 SHA-256 为 `86881709adca11964ba0239a30741d7221b38d7b636088daedf6cad34dca459a`，未改写任何原始字段。

实际交互覆盖首次未安装、五工具市场与 Side Panel 两种入口、确认前不落盘、真实双窗口并发、网站 A/B 隔离、剪藏正文、受控旧版升级取消与新增能力审核、数据保持、Side Panel 关闭重开、额外 JSON 导入、跨站撤权、卸载清理及两次完整 Chrome 重启。受控旧包 `quick-notes@0.0.1`、`reading-toc@0.0.1` 不是历史正式发行二进制，不将其解释为所有历史版本迁移通过。

同一隔离 Profile `/tmp/opendesk-market-r45-Z4ZhaE` 的 Chrome PID 为 **5870 → 6266 → 6445**；前两代均经真实 `Browser.close` 正常退出，code 0 / signal null。第三代在成功结果保存时仍用于卸载后观察，原始 `normalExit:false` 不表示第二次重启失败。24 个原生审核对话框全部匹配，23 次接受、1 次拒绝，`dialogErrors:[]`。

安装记录、网站授权和正常工具数据由真实 UI 产生，`protectedStorageWritesFromDriver:0`。单独容量试验执行 **12 次专用键 set、1 次批量 remove**；用量为 105,827 → 11,146,717 B，第一次重启后 11,159,923 B，清理后 119,033 B。专用容量键不冒充用户安装或授权，不再使用旧的笼统“driver 零 Storage 写入”字段。

主 Agent 按 GitHub digest 下载并复算 R45、TOC、Knowledge ZIP，实际查看并原样保存以下截图：

| 可追溯截图 | 实际观察 |
| --- | --- |
| [首次可选/未安装](evidence/official-tools-r45-20261011/c8b5-fresh-optional.png) | 五张官方卡可安装，下方已安装列表为空 |
| [五个官方工具已安装](evidence/official-tools-r45-20261011/c8b5-five-installed.png) | 五张统一卡显示已安装，原安装列表有且仅有对应记录 |
| [卸载并完整重启后](evidence/official-tools-r45-20261011/c8b5-uninstalled-after-restart.png) | 资源仍存在、全部恢复“安装”、已安装区域为空 |
| [实际 TOC Side Panel](evidence/official-tools-r45-20261011/c8b5-toc-sidepanel.png) | 自动跟随回答 2，目录层次可读 |
| [Knowledge 360px 阅读页](evidence/official-tools-r45-20261011/c8b5-knowledge-reader-360.png) | 捕获正文、代码、清单和原回答入口可读 |
| [Knowledge 360px 列表](evidence/official-tools-r45-20261011/c8b5-knowledge-list-360.png) | 筛选、搜索、记录和工具条正常，无观察到的溢出 |

首次与卸载重启截图来自同一次 artifact 的不同阶段，像素完全相同，因此摘要相同；没有用一张旧截图替代另一次验收。[TOC 浏览器身份](evidence/official-tools-r45-20261011/toc-browser-identity-c8b5b2ef.json) 与 [Knowledge 原始结果](evidence/official-tools-r45-20261011/knowledge-result-c8b5b2ef.json) 同样原样保存。R45 artifact `11698668553`（363,583 B）的 ZIP SHA-256 为 `dea9ee6ad9ad4c140ba2cdeb5950f1c4a7ae452bb16bf5e71a34ae996b6aad5e`；所有 artifact、图片和原始 JSON 摘要均在验收索引中，不依赖短期 artifact 保留期才能追溯关键结果。

### 可复现构建和资源余量

| 指标 | Production | Development |
| --- | --- | --- |
| Package SHA-256 | `31916bbdc1d7af338ca82abddd4272dab6e4ffe84662be84d671db5cea3b0981` | `56ca07dec2c55c4d4b695120b64ec4ac4ac7e3859dac31af2d262e825a79da49` |
| 文件数 / 全部字节 | 54 / 1,699,398 B | 73 / 5,303,597 B |
| JavaScript / source map | 1,435,766 / 0 B | 1,440,219 / 3,599,223 B |
| SW / 硬预算 | **325,487 / 327,680 B** | 325,653 / 786,432 B |

本地与多个独立 CI 构建得到相同指纹；主 Agent 实际下载后又比较了 R45/Knowledge 双模式及 TOC production，共五份 receipt，288 个源码输入和摘要一致、漂移为空。TOC development 摘要由成功 Job 日志复核，该 artifact 只上传 production receipt。正式产物没有旧 `sidebar-tools/*.opendesk-tool.json`，官方 payload 没有进入 SW 主 bundle。

生产 SW 剩 **2,193 B**，保持 `CRITICAL`；`ui/tool-shell.js` **333,661 B** 超过 327,680 B 软审阅线，但低于 524,288 B 硬预算。没有调整预算掩盖增长，也不称体积余量充足。所有本地构建资源已释放；development 自己的已退出执行器 fence 在 session 39166 exit 0、成功 receipt、精确 token、无活跃构建/Chrome 以及独占端口核对后释放，记录 `artifacts/official-tools-r45/c8b5-owned-development-release.json`。

### 未测范围与质量评估

以下仍为 **`NOT_TESTED`**：实际用户 Mac Chrome 上官方工具完整闭环；公网/已登录业务网站；完整框架 F3；由 ZIP 安装的验收；原生工具栏 Side Panel 关闭按钮；历史正式扩展二进制升级；系统剪贴板与图片下载。本轮通过 CDP 关闭的是实际 SIDE_PANEL target。公网市场和外部安装意图桥为 `NOT_CONFIGURED`。

本 SHA 没有触发 Page no-build、installed-permissions 或 Local MCP 专用 workflow；不把其他 SHA 的成功或历史 `E_DEV_SOURCE` 失败记为本次重跑结果。Linux 完整 Node 的 7 项平台/原生二进制 SKIP 已逐名记录，独立 Mac 诊断成功不改写它们。

下表是基于本轮代码与证据的工程自评，不是独立认证或统计覆盖率。测试覆盖与可追溯性仍低于 95 分目标，保留后续跨环境验收空间。

| 维度 | 分数 / 100 | 依据与剩余边界 |
| --- | ---: | --- |
| 目录及模块职责 | 97 | 单 Catalog、9 份生成副本移除、运行框架与发行资源分离，封闭产物验证 |
| 安装生命周期 | 96 | 原安装器/锁/数据、ACK 恢复、孤儿数据与同包重装撤销回归，真实更新/卸载/重启 |
| 安全与权限隔离 | 96 | 固定来源/路径/摘要、提交前重验、epoch 会话拒绝、实际 A/B 授权隔离和撤权 |
| 构建可复现性 | 97 | 288 源码输入、五份实际 artifact receipt 与本地逐项一致；保留 SW 余量风险 |
| 开发者体验 | 95 | 原打包/监听链路、错误恢复测试、五入口统一、API/README 真实路径 |
| 向应用市场扩展的兼容性 | 96 | 统一发行解析、固定来源/版本、历史 revision 不替换；未开发公网市场 |
| 测试覆盖与可追溯性 | 94 | 13 项实际 CI、1117 全量 PASS、原始身份/截图/摘要持久保存；Mac/公网/F3/ZIP 等未测 |

开发者现行入口为 [官方 Catalog API](../../api/official-tools-catalog.zh-CN.md)、[工具 API](../../api/sidebar-tools.zh-CN.md) 及各官方项目 README。以下继续保留完整实施和故障修复时间线。

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

最终结论、精确源码 SHA、CI/Chrome 身份、未测试项和资源释放状态已汇总在本文开头；后续章节按发生时间保留原始阶段结果。

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

## 早期验收计划（历史记录）

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

## 首个正式候选与真实 CI 发现

候选 `733dba27c0a3861f13c6c89a29585c8e3d36529b` 通过已连接 GitHub 的 Git tree/commit 与 `expected_sha`、`force:false` 安全快进 main；GitHub tree `868f4ce17d79e39808c94a894e7ff2f7116f099e` 与本地已审阅 index 完全相等。本地随后核对祖先关系及完整 tree 后移动 main 到同一提交，没有改变工作区文件。

- Sidebar package/build Actions `38125458326` 与 budgets `38125458333` 成功；独立 runner 得到一致 production `ef9451ec7fa4b83d9a6766c4b7ccb623958320d634846f50f39dffa4b99dc134`、development `4b60eafcd17cac401a8e26b6fd15f8cc7652ef22c1fd31606740da1ced8e9985`。旧路径资源为空，SW 320,970 B。
- TOC `38125458357` / job `114428778048` 与 Markdown `38125458300` / job `114428777811` 中实际 Node 22.23.3 全环境测试均为 1,082 项：1,075 PASS、0 FAIL、0 cancelled、7 SKIP。本地 Unix socket 限制和原 preparation 连锁取消不再阻塞 CI。
- R4.5 `38125458376` / job `114428778086`：78 项定向通过，双构建、verify/pack 和静态市场路由通过。真实 CFT 155.0.8059.39、扩展 `jhajepcnohiplmafaiokjlcagcfjgaap` 已完成首次未安装、五工具市场安装/实际沙箱、固定旧版本不可替换和当前批次持久恢复；随后第二窗口审阅失败。旧驱动误把无 toolId 的普通任务 Catalog 标签页当作第二个 Side Panel。修复为同一 helper 通过真实点击打开两个不同 windowId 的实际 SIDE_PANEL，记录 context/target 身份；不修改产品 Catalog 合同。后续升级、网站撤权和重启阶段在这个失败候选中尚未执行。
- TOC 原生失败为驱动遗漏 `execFileSync` 导入，已补齐，未声称原生通过。
- Knowledge `38125458301` / job `114428777905` 的真实保存/删除后出现第三次未保存提示。定位上游 `setState(dirty,busy)` 不符合实际 `setState({dirty,busy})` 接口，修正两处应用调用与错误静态断言；新增运行真实 bridge 消息生成和真实宿主消费的保护测试，本地相关 40/40 PASS。保持原生“不得出现第三次提示”断言。
- Markdown 原生提取等待超时，没有足够状态日志判断提取器错误。旧包与新生成包全部字段相同，生产提取及授权代码未改；补上 Blob JavaScript ready 等待和失败现场记录。修正 iframe 附加 session 没有 close 方法的清理调用；保留正文、代码、表格断言，等待新候选真实 Chrome。
- R19 静态 workflow 缺少新生成器所需 npm 依赖，补锁定依赖安装。实际首次 R4.5 截图中文为方框，给 R19、R45、TOC、Markdown CI 补既有 Noto CJK 字体安装，不能将不可读截图视作视觉通过。
- 其他 CI 暴露原有测试门禁：P0/Controller 的闭端口重探期望落后于现行驱动，再次只读 ping 后只执行一次 url，修正测试并本地 60/60 PASS，不改 Task/Page 正式合同。R16.1 SDK 在业务 PASS 后立即删仍运行的自有 Profile 导致 ENOTEMPTY；改为等待自有 Chrome 完整 close 后清理。

以上失败及原始 Actions/artifact 保留。首个候选原生总状态为 FAILURE；后续修复须由下一精确提交的 CI/Chrome 重新确认。本地完成的开发构建锁仅在核对自有 token、已退出 session 65029、成功 receipt 和独占端口空闲后释放，记录于 `artifacts/official-tools-r45/stale-owned-development-final.json`。


## 第二候选的真实结果与第三候选修复

第二候选 `079daf744a54cb70d9a8df0b1324c520145845a1`，tree `6044bdd1f436a7da1db819e2a53fd8dca289bc2d`，由上一候选安全快进。其状态仍为部分通过，不能认定 R4.5 完成。

- Knowledge `38126123463` / job `114430743199` 真实 CFT 155.0.8059.39 闭环成功：审核安装、独立网站授权、实际采集、去重、流式保护、恢复后编辑保存、取消脏关闭、保存/删除后关闭、撤销授权；没有第三个错误提示。完整 Node 22 源测试 1,083 项，1,076 PASS、0 FAIL、0 cancelled、7 SKIP。artifact `11697541681`，ZIP SHA-256 `036b362f1a30985269c5620d65650adddec4fa230c2cad3a5ca30d6f35ab6c74`。
- Sidebar tools `38126123412`、R19 `38126123350`、P0 `38126123452`、Controller `38126123427`、R16.1 `38126123338`、SDK `38126123426`、Site access `38126123383`、Page userscript `38126123380` 和 R7 `38126123349` 成功。保留各工作流范围，不把通用 macOS Controller 通过写成本轮官方工具 Mac 验收。
- 两个独立 runner 的 production `c93cb1250828b0e24e94a9e6f9f73b37d4f3f620d2d1ce7361063dc5660dd683`、development `652970fc86bc7e452aff9563ed14edc08885831c2d7023d8b7dcfaf83c0f5385`、Catalog `e2c1a7d3849729b83a75cbfb8fc2d32bb25c6a603488dd92f249eb2171e99df5` 一致。本地第二候选 production 也得到相同指纹；ZIP 打包 `d275202b9e95628ba2c06f8288fe082772a12f56ab4776f9400791fa15f4230e`。
- R4.5 `38126123393` / job `114430743098` 在首次 `actual SIDE_PANEL context` 识别超时。已有第二个扩展页面目标，但没有记录 raw getContexts，因此不能猜测原始 windowId 值。改为点击前保存 context ID，点击后选唯一新增的正式 SIDE_PANEL，按 exact document URL attach，再以 panel 的 `windows.getCurrent()` 验证所属窗口。记录请求窗口、原始上下文、实际窗口、trusted input 与 open Promise 完成结果。没有创建假工具标签页替代 Side Panel。
- TOC `38126123346` / job `114430742806` 已打开实际 Side Panel 并进入工具页，官方按钮审阅未出现。源码发现每次 current-page 通知都替换官方按钮，存在按下/抬起之间丢失点击的窗口；该现场没有截图，不能把推断写成已实证根因。宿主现在仅在官方展示内容改变时重建按钮，并新增保留真实按钮引用且仍只进入审核的行为测试。驱动点击前等待准确文章 URL，结束前保存 DOM 状态与截图；workflow 上传整份证据目录。
- Markdown `38126123500` / job `114430743552` 在 Blob 脚本 ready 后仍没有剪藏正文。进一步定位确定的通知反馈：安全 `revalidate()` 对同一网页也发观察，宿主无条件转发 page-changed，clipper 因 reset 递增 token 而丢弃合法回复。仅宿主按状态、窗口、标签、frame、documentId、URL、origin、标题、原因变化通知；保留原 revalidate 的所有序列与身份校验、读取前后复核和最终授权检查。实际 clipper JS + 实际 current-page 对象的回归测试先失败后通过，覆盖双复核仍显示正文、未收到导航事件时识别同 URL 新文档、resolving 即刻失效和旧回复不能回填。Markdown 原生是否恢复仍由下一提交实际 CI 确认；增加日志/截图并上传原来遗漏的 JSON。
- 知识收件箱应用修复推进至 **v1.1.1**，版本唯一权威仍是 `tool.config.json`；安装了已发行 1.1.0 的用户可以明确审核补丁。保留同版本不同内容拒绝和数据保护，不通过降低校验允许静默覆盖。新增历史 1.1.0 → 当前发行 update 回归，移除 UI 测试中的第二份版本常量。
- 上述两项新增宿主行为测试在修复前 0/2、修复后通过；第三候选本地指定 Sidebar/TOC/Catalog/current-page/知识测试 **93/93 PASS**，0 skip/cancel；`npm run check` **373 个文件通过**。

### 并行来源及仍未通过的其他工作流

在第三候选前安全快进至 `d8424fee378070336696139b2feee5440929587d`，32 个 Page UI R24.1 文件与本地修改不重叠，保留其代码、测试、文档和来源输入。没有覆盖 Page/Task 正式合同。

Local directory MCP `38126123354` / job `114430743185` 在 18 项实际检查后，运行项目被既有 `E_DEV_SOURCE：本地项目状态尚未通过核对，请修复后刷新` 拒绝，随后等待 runId 超时。实际 artifact `11697546579` 截图确认运行已触发，不能归为按钮未命中。R4.5 前 `96812e6ed942fd256eb9f44d071093dc204ff554` 的 `38122560932` / artifact `11695594683`、以及 `ee34888cb69d4f755851168c035ef9e010eed7bd` 的 `38121935384` 已有相同失败。驱动、script-editor、local-project、workflow、native-agent/local-dev 无差异，9 个 verificationInputs 一致，主驱动 SHA-256 `063e530d9afe626063935a9da037adffebcd6ad8d8793a98700b0d4cf96d103e`。缺少点击瞬间 preparationError，仍记为既有 FAIL，不绕过运行准备守卫。

Native Agent `38126123322` 的 Intel macOS job `114430742923` 在原生 Swift 授权输入 `inspect-and-press` 阶段 35,052 ms 超时（SIGTERM）；实际 Chrome Options 和可信指针步骤已完成，ARM 和 bridge job 成功。不能把它写成该权限验收通过，也不修改授权流程以消除失败。本轮用户 Mac、线上业务网站、完整 F3 与 ZIP 安装继续为 `NOT_TESTED`。


第三候选提交前继续快进集成 `e2bb22a9` 与 `ab7f6fe1be8613c4d71f171dc21206aa348303fa` 的 Page URL 端口匹配修复，13 个相关文件与本地修复不重叠。`d8424fee` 加本地第三候选的实际 production 已通过（50 文件，SHA-256 `b9c875ad45f01bc03ae854c1629cd660dd2ee430c5639f6997e8363bf8108432`；SW 321,651 / 327,680 B，tool-shell 328,715 B）。该指纹早于这两个新 Page 提交；后续 CI 必须重新构建精确第三候选，不能直接沿用旧指纹。


## 第三候选证据与第四候选修复

第三候选 `6e5f1dc7bc72a64c20a3aeda7c8e1d7ebfe83437`，tree `b1ad334bbe6acfe4abb5c36f1572bb5e1f37a81d`，parent `5fb5a118274c07f718db162decfd8d4771b7c1ec`。生产/开发构建、verify、Package budgets 与工具工作流通过；本地相同源输入的双构建和 verify 也通过。两模式 packageHash 分别为 `e981b9aa432b7899ea2b5bf365c97597f4a52ec8d45a1970d3b89de41e157e91` / `b81c25acd8a70a523a951da041aa3d7cbec5063fef5204a98428f9008913d51f`，Catalog SHA-256 `91d980524ba8962d3dfcb02ff3db28dee7605de353726b2162c709d8eaf0291d`。生产 SW 321,939 / 327,680 B，剩余 5,741 B，仍保留 CRITICAL 警告；tool-shell 328,843 B，仅超软预算。

- `38127100041` / `114433628606` package/build：143/143，通过；`38127099900` / `114433628506` budgets：25/25、146/146、10/10，通过。对应 artifact `11697493476` / `11697103503`；独立 runner 与本地产物字节一致，五包均独立 JSON，无旧路径副本。
- Knowledge `38127099886` / `114433628231` 与 Markdown `38127099982` / `114433628444` 的真实 Chrome **各 1/1 PASS**。知识收件箱实物 v1.1.1，42,525 B，包 SHA-256 `9331acb4e4368b40ec39413e93af0c467b920a818c6f8a76ba87b052bf6e5f5b`。Markdown 从实际 fixture 读取 802 字节、一次独立网站批准、撤权、另一个 Markdown JSON 导入及安全预览成功，证明宿主误通知修复已越过真实失败点。artifact 分别 `11697018620`（ZIP `43fc00017e8496d8bc072bad8d6047923feffb98c1ef178fba1d5567bb395c45`）和 `11697752945`（ZIP `f72edbfa3093a64e1e4a8de1784a21de66b0561f0ee91f0a72a6f9d9ea002d48`）。
- 两专项及 TOC/Native bridge 的完整 Node22 门禁均为 **1,095 项：1,087 PASS、1 FAIL、0 cancelled、7 SKIP**。唯一失败 `local-dev.test.mjs:411` 是实际 LocalDevResolver 的受信内存图遗漏 Page R24.1 新依赖 page-program-rules.js。第四候选仅把该固定文件加入 HELPERS 和 BUILD_INPUTS，自然进入现有输入摘要、缓存身份和编译前后校验；不允许任意磁盘 fallback，不修改 Page 规则。现有失败用例在本地复现后，local-dev/preparation/managed-ui/URL 范围 **66/66 PASS**。两个相关完整测试 workflow 也纳入 native-agent/local-dev 来源变更，避免修复不触发该门禁。
- R45 `38127100042` / `114433628518` 已真实通过首次未安装、市场五包审核/实际沙箱、两种合集版本语义、官方入口、两个真实窗口并发唯一安装、A/B 网站隔离、正文读取、取消/新增能力/来源确认升级、私有笔记保持、Side Panel 关闭重开与无自动工具实例。raw context.windowId 在这版 Chrome 中实为 -1；panel 内 windows.getCurrent 精确匹配各自实际请求窗口，新的 contextId 识别经三次打开实证。随后撤权循环没有等异步 handler 完成就检查总状态，剪藏授权尚在；第四候选每次真实撤权后等待对应持久记录、撤销行消失和该工具完成提示，再进行下一次输入，不自动补点或放宽权限断言。两个完整 Chrome 重启仍未执行，不能宣称通过。R45 artifact `11697678079`，ZIP `77025f39571abf76532bc6e45a271170b0714e11de5bc2b67ca9b7ae60cf71d1`。
- TOC `38127099968` / `114433628857` 已实际官方审核、安装、授权、挂载、导航、刷新，之后驱动 `singlePage` 未声明报错。补齐单 H1 页面连接的声明与清理；保留后续 R4.4/拖拽/撤权所有原断言。artifact `11697433412`，ZIP `cea5d4f3baa9fb32b1d911a70c74dc11ecce0ca030024686a515c1961db8480e`。
- 此候选 Native Agent 两个 macOS Job 均成功，先前 Intel Swift 授权输入超时未重现；仍不能替代本轮官方工具用户 Mac 验收。Local MCP 本 SHA 没有触发，原先既有失败没有改记为通过。

第四候选前安全快进保留 `a9117d2340752ae44f2d705e4e0fd3fa3b6a6ac7` 的独立 Page framework CI，以及随后 `be3e48b0` 的 React/Vue 锁和构建限制文档；与本地修复范围不重叠，没有覆盖另一任务的依赖锁或测试证据。


第四候选提交前再次检查发现 `6d730d156b030c48a92af32e58c421c627bf1fca` 扩充真实 Knowledge 筛选/空态验收，已完整保留；`e3954ac3e0e468a71437b2fc903dfeaec8a6477d` 并行修复同一 Page helper。保留上游 `UI_RULES`/HELPERS 实现，只增补规则模块的 BUILD_INPUTS 身份校验。六个本地文件的 checkpoint `b618c3ed9455d0fa18ad7fed9c1e3421a98cccee` 保留，其他五个文件经检查后恢复，未覆盖并行修改。

## 第四候选实际通过项与第五候选输入稳定性修复

第四候选 `b2f1cc558929cab2b23b8cacb48b8a4cfc084141`，tree `f3dc32834ec58ad017447e67c806cc7a347cd5b0`，parent `dfffbf73837803de7d8b70e7c5d404c2297b4ab2`。三个受影响工具专用工作流均真实成功，R4.5 完整重启闭环仍未通过。

| 实际工作流 | Run / Job | 结果及证据 |
| --- | --- | --- |
| TOC | `38127731010` / `114435485537` | 30/30 专项、1/1 真实 CFT、42/42 Sidebar 回归；完整 Node22 为 1,095 项：1,088 PASS、0 FAIL、0 cancelled、7 SKIP。实际单 H1、R4.4 晚段标题、拖拽/位置、刷新、授权/撤权、卸载/导入和真实 Side Panel 跟随均通过 |
| Knowledge | `38127730975` / `114435485466` | 112/112 专项、1/1 真实 CFT、完整 Node22 同上；保留并通过并行新增筛选、恢复、脏关闭、删除最后一条、筛选空态和明暗主题截图 |
| Markdown | `38127730948` / `114435485380` | 7/7 专项、1/1 真实 CFT、完整 Node22 同上；一次独立授权后读取真实 fixture 正文 802 B，撤权、本地 workbench JSON 导入和安全预览通过 |
| R4.5 主闭环 | `38127730969` / `114435485419` | 82/82 专项、双构建/verify/pack/静态市场通过；原生在初次剪藏授权后的 Open 等待超时，后续升级及两次完整重启尚未执行 |

实际 Chrome 均为 Linux headed CFT `155.0.8059.39`，扩展 `jhajepcnohiplmafaiokjlcagcfjgaap`，加载本候选 `dist/production`。独立 runner 的 production/development 指纹与第三候选相同：`e981b9aa432b7899ea2b5bf365c97597f4a52ec8d45a1970d3b89de41e157e91` / `b81c25acd8a70a523a951da041aa3d7cbec5063fef5204a98428f9008913d51f`。这些指纹不能沿用为第五候选的构建证明。

TOC artifact `11698070187`（ZIP SHA-256 `3268c76e5d5c8837ed82d869456a53f4b30787868759981f4178ed0a17bbb3a1`）；Knowledge `11696854786`（`6381f651faf111af92a62b1e9ac8c3183ae60c17903043604cf5149d971d49a7`）；Markdown `11696869656`（`757497b959081314f2731c9b03ac2c92671f559f9b0638b6642f2df56c5db47a`）。R4.5 失败 artifact `11696869648`（`2f4a99c5e215f24ab1d144b72c6cf6cf9aa2b65e7c3178daefcce1480b8544e1`）保留原始 JSON/截图。主 Agent 已按摘要下载并实际查看其首次未安装截图：五个官方安装入口及空安装列表可读，中文字体正常。

原生失败现场没有 iframe target，授权 store 和两个网站按钮均已批准，提示为“已授权当前网站剪藏”，没有 importError 或异常对话框。驱动仅等待原生确认出队，未等后续持久写入和渲染完成就点击 Open；宿主还会在相同观察结果下重建已安装列表。第五候选保留真实原生输入，统一等待对应 grant、按钮和最终提示后才继续；新增 elementFromPoint 命中检查，不自动补点、不增加 iframe 超时。宿主按工具展示、busy、网站来源、展开状态及三类授权的语义签名保留未变化控件，实际权限变化仍重绘。新增行为回归在修复前失败，修复后 Catalog/host/TOC/Markdown **65/65 PASS**；`npm run check` 373 文件通过。

本候选另外 Native Agent 的 Intel/ARM/bridge、Page package、R17、P0、R7、Site access、source-check 均成功。既有 Local MCP `38127731038` / `114435485661` 仍在前 18 项 PASS 后出现同一 `E_DEV_SOURCE` 和 runId 超时，保留 FAILURE；artifact `11697599425`（`0824596b500c4f7239238754b4a5045a5fbb2e6143916121bbcaaad5b366ba0e`）。7 项完整环境 SKIP 中六项限 macOS（2 个真实 Chrome、3 个隔离 Native 安装、1 个 AppleScript 编译），一项因 Ubuntu job 没有 `OPENDESK_BROWSER_BINARY` 而跳过真实 Node-free Host；不计入 PASS。独立 macOS Job 与本轮用户 Mac Chrome `NOT_TESTED` 分别记录。

第五候选前安全快进集成 `72bcc0451294c1f709eaf667626e10d45a8eb50e` 的 Page 工作流说明与 `a44e2efcbe2df23331168cbd0099f807df4cc3a7` 的 Knowledge 证据账本，均只修改各自文档，与本地修复不重叠。

随后读到 `fd00db355b2560ab519113d5bc2fae225b55167b` 的知识收件箱 v1.1.2 界面修复与原生断言。在已运行的本地 production 构建退出 0 后才快进，完整保留新版本、去重首标题、360px 筛选调整及测试；不把先前 v1.1.1 的 Chrome 通过写为新版本通过。快进前的成功 production receipt（`66429340a1344f68fb137bcc60029259c965c9886f8e03f229edf0e53cf093c2`）另存 `builds-fifth-before-fd00/`，后续构建重算全部包与摘要。已核对自身 session 79125 退出、成功 receipt 和独占端口空闲，再按精确 token 释放本执行器复用 PID 留下的自身 fence，记录 `fifth-owned-production-release.json`。

### 第五候选本地资源记录

状态 `IN_PROGRESS`；本工作区主 Agent 独占串行构建 `.wxt/public` 与 `dist/{production,development}`，证据目录 `artifacts/official-tools-r45/builds-fifth-candidate/`。启动前核对没有 build/dev/Chrome 进程、没有 development.lock，TCP 43120 独占绑定可用。仅使用本会话输出，不占用其他 Chrome Profile 或原始证据；完成后补记 released 和精确构建指纹。

## 第五候选完整成功证据（严格绑定原 SHA）

`84b4a4f062796589d8335688253b963a9c566277`，tree `678d639570288601efed21dc882bb23681ed9ab6`，parent `fd00db355b2560ab519113d5bc2fae225b55167b`。实际触发 13 项工作流全部成功：12 项测试工作流及 1 项维护工作流。[结构化 CI 索引](evidence/official-tools-r45-20261011/ci-84b4a4f0.json) 与[原始原生结果](evidence/official-tools-r45-20261011/native-result-84b4a4f0.json) 已保存，不能将它们套用到随后更改安装器的 main。

| 范围 | Run / Job | 实际结果 |
| --- | --- | --- |
| R4.5 主闭环 | `38128395146` / `114437452567` | 83/83 定向、真实 Chrome 11 阶段成功；同一 Profile 的 PID 5579 → 5989 → 6161，前两次退出 code 0 / signal null，24 个原生对话框全部匹配，0 次 driver Storage 写入 |
| TOC | `38128395232` / `114437452768` | 30/30 专项、1/1 真实 Chrome、43/43 Sidebar 回归，单 H1、R4.4、拖拽、网页/Side Panel、授权/撤权/卸载均通过 |
| Knowledge | `38128395218` / `114437453232` | 113/113 专项、1/1 真实 Chrome，实际包 v1.1.2 / 42,854 B，38 个视觉测量及 8 类状态 |
| Markdown | `38128395250` / `114437453022` | 7/7 专项、1/1 真实 Chrome，802 B 实际正文、独立授权、撤权、本地导入及安全预览 |
| 包生成 / 预算 | `38128395306` / `114437452931`；`38128395215` / `114437452658` | 144/144；25/25 + 146/146 + 10/10，通过原预算 |
| 完整环境 | 上述四个工具工作流及 Native `38128395152` / `114437452634` | Node 22.23.3：1,096 项、1,089 PASS、0 FAIL、0 cancelled、7 SKIP；独立 Intel/ARM Native Job 同样成功 |

原生主闭环通过首次未安装、五工具两种官方入口、真实双窗口并发、A/B 网站隔离、明确剪藏、受控旧版升级与新增能力拒绝、私有数据保持、Side Panel 关闭重开、在 B 撤销 A、额外本地 JSON 导入、两次完整 Chrome 重启，以及卸载后资源可读但安装/授权/实例为空。受控旧版为 notes/toc 0.0.1，明确不是历史正式发行二进制；历史扩展二进制升级本身未测。

四条独立 CI 构建和本地 `builds-84b4a4f0/` 得到相同 production `afad45ad751ca69e7436da9ea9947f093004e15b7cdfcace061900c5485ad15c`、development `795c37c77efcd0e6eb4ea29627d25bf9f24cd114d13748bdf6f3eba1e03653fd`。本地 build/build:dev/verify exit 0，资源已 `released`；自身 fence 的精确核对记录为 `84b4-owned-{production,development}-release.json`。官方 Catalog 3,159 B，SHA-256 `8a99acc40950f00b396a41a22392b4133111e4d67dfa8808d364dc398f7cf24b`；Knowledge v1.1.2 包 SHA-256 `6c465b74f626c63ba25f816c68f20984b8d1db5bea7b23e000687c41aa7cd3c2`。SW 321,939 / 327,680 B，tool-shell 329,013 B（超过软预算，未超硬预算）。

主 Agent 按 GitHub digest 下载并实际查看本次首次空态、五工具已安装、卸载重启后空态、TOC Side Panel 和 Knowledge 360px 明暗截图。原始主闭环 artifact `11697951367`，ZIP SHA-256 `7f0920488cb184e15e16fcb0fc4801ea5ba1665a6c2c0128cfc77e063a9035f6`。最终空态五项均显示“安装”，Knowledge v1.1.2 可读。实际用户 Mac、公开网站、完整 F3、ZIP 安装、原生工具栏关闭按钮继续 `NOT_TESTED`。

## 收尾期间的并行存储整合与安全回归

收尾 fetch 发现 `4c9ff033`、`a8323800`、`672b23e2`、`b0a6d433`、`8a2c9bff`、`53b09e45036c39a3dda8f638a992677cddae0135` 继续修改了 Manifest、存储写后核对、卸载日志、知识持久化、bridge、市场恢复界面及独立 Page runtime 验收。均已保留。相同文件并行变化使用 checkpoint `bc7238d2d3d941dcd4e4c027b56e86cbb3b4484c` 保存本地五文件，再快进并按精确差异恢复；没有覆盖新存储/市场实现。

`a832` 的 R45 `38128626318`、Knowledge `38128626333` 被前置旧 ACK 断言阻断；其 TOC/Markdown 原生成功但完整环境失败。`672` Native `38128648728` 全量为 1,096 / 1,085 PASS / 4 FAIL / 7 SKIP，另外一个失败是 required permission 的旧数组尾项断言。只有仓库旧 receipt 的失败 artifact 不作为本次构建证明。

本轮新增的发布瞬间观察与清理失败注入实际复现了孤儿网站授权问题：原顺序先发布具有新增能力的包，再清理旧 grant。现在先清理并验证旧工具本来就不具有能力的残留授权，失败不发布；删除旧能力对应的合法授权在注册提交后清理，失败升级仍保留旧包、有效授权和私有数据。三项相关新增用例在修复前失败，修复后通过；版本正则同时采用并行 `b0a6` 的正确实现，不保留双重转义。

保留 `53b09e45` 的明确合同：注册写入 ACK 丢失仍进入显式恢复，即使读回包相同；成功包读取但来源/事务缺项显示 needs-finalization，不能假装全部完成。测试分别注入 ACK 丢失后的可读/不可读结果，验证一次注册写入、审核失效、无自动实例和无网站授权；显式恢复只补来源与事务，不重装。锁内任何写入前重读并比较 toolId/marketId/version/SHA-256；UI/批次还绑定各自预期固定身份，不能借另一操作 ID 核对成功。沿用并行新增的「我的应用」离线恢复和卸载清理入口，补齐批量历史版本的本机核对，不再依赖当前 Catalog 重新提供旧包。

此整合本地定向 **87/87 PASS**，`npm run check` **376 文件通过**；后续精确提交必须重新取得生产/开发构建、完整环境和四条真实 Chrome 证据。本工作流仍 `IN_PROGRESS`，第五候选成功不是这些新输入的替代。

### 整合候选：完整恢复证据与并行变更并集

继续安全快进至 `98e561627fcfbd2c196f0d21c20174cfa7da88a9`，保留 `884e7108` 的配额/离线恢复/卸载残留测试与 Knowledge 原生诊断。两个重叠测试以 checkpoint `4fedfc769da731b425e0c72274b09f73f359b772` 和三方文件保存，按用例并集整合；未删除他人的断言。其后快进至 `9eb3e4439963f1d62dd3c503195a4a0d43fcc055`，保留 Page React/Vue 交付、官方包规范化摘要复核、存储用量、真实 Chrome >10 MiB 容量试验及其他工作流文档。安装器/权限测试另存 checkpoint `05c4956c4a2083310b012bea8024b1021800dbf1` 后合并；本轮在同一孤儿授权防线中同时覆盖新安装和升级新增能力，未另建安装流程。

只读复核发现并故障注入确认：已有官方 v1 升级 v2，registry 已落盘但 ACK 丢失时，旧 v1 来源记录会令恢复永久停在 unknown。现在事务仅保存经锁内实际 baseline 版本与 canonical SHA 核对的三字段旧来源快照；新版包哈希通过且来源仍精确匹配快照时，显式恢复才补齐来源和终态。未知来源、旧日志无快照、畸形快照及等待锁期间变化继续拒绝，不重写安装包。新增测试包含正常恢复、来源冲突、无快照、畸形版本及锁中变更五条路径，并核对唯一 registry 写入、私有数据及原网站授权保持。修复前 `upgrade-recovery-before-fix.tap` 为 0 PASS / 1 FAIL，修复后该用例通过。

`post-98-targeted.tap` 在 98 基线上 **91 PASS / 0 FAIL / 0 SKIP / 0 cancelled**，`post-98-check.log` 为 376 文件通过。随后的 9eb3 整合源码有变化，必须使用新候选的构建与实际 CI；上述数字只证明对应阶段。真实 Chrome 中并行新增的容量试验只写专用随机前缀的可丢弃键，安装记录、网站授权和工具数据仍由真实 UI 产生；后续证据须区分这 12 个容量键和受保护安装状态，不能继续笼统写为“driver 零 Storage 写入”。

随后并行 main 的 Page 构建测试曾在 9eb3 暴露两项失败（框架选择与运行资源身份、前导重复声明）；已保留原始 `post-9eb3-targeted.tap` 的 97 PASS / 2 FAIL，不将其改写为通过。完整保留 Page owner 的 `b5e2beec116b4f242af29a96e79dfa44c222182c` 修复及 `09e520d5` 的损坏安装清单保护后，`post-b5e2-targeted.tap` **101 PASS / 0 FAIL / 0 cancelled / 0 SKIP**。整合 checkpoint `08d2e90545a79b9da703c9da2569c34f84225486`。继续保留 `f848433c2df7d364893b38d5d5a89566feefecd5` 的两项真实持久写入失败桥接测试，host 用例 checkpoint `3e70ef47c73372aef581cddb6d2d970954bf1e72`。所有 checkpoint 和旧测试证据保留；没有强推、清空工作区、另建分支或覆盖并行产物。

本次提交仍为 `IN_PROGRESS` 验收候选；后续实际 CI 需重新确认 production/development、包验证、完整环境及四条官方工具 Chrome 工作流。新 Page 固定 React 资源的包验证结果以实际 CI 为准，不能用本轮安装组件通过替代整个扩展构建通过。

## 整合实现 `fd6d135c` 的真实成功证据

实现提交 `fd6d135c784dbc85f204a0d62340441d3a1a1b7b`，tree `56500a97805dd87d39c917db872fcf74c780e20a`，parent `3e99ef15056916d79cd9bec0f4af11ed20f173b7`。提交前本地定向 `post-f848-targeted.tap` **118/118 PASS**。本地 main 与 GitHub tree 已逐项核对；CAS 拒绝三次过期父提交后才成功发布，没有强推或覆盖并行 main。保留 Page owner `cdad5ba3` 的固定 SHA 资源边界及 `3e99ef15` 的独立直接 IIFE 校验；不改原 WXT 包装或 Page 运行身份合同。

| 实际工作流 | Run / Job | 结果 |
| --- | --- | --- |
| R4.5 主闭环 | `38129975633` / `114442100634` | SUCCESS；100/100 定向、12 个真实 Chrome 阶段、24 个匹配原生对话框、两次完整正常退出并重启 |
| TOC | `38129975666` / `114442100756` | SUCCESS；30/30 组件、真实 Chrome 专项通过，完整环境通过 |
| Knowledge | `38129975658` / `114442100661` | SUCCESS；116/116 组件、真实 Chrome 1/1，38 条视觉测量，v1.1.2 实际包 |
| Markdown | `38129975596` / `114442100433` | SUCCESS；7/7 组件、真实 Chrome 1/1，802 B 正文、独立授权及撤权、本地 Markdown 导入 |
| Sidebar 包 | `38129975669` / `114442100761` | SUCCESS；146/146、实际双构建及包验证 |
| 资源预算 | `38129975602` / `114442280792` | SUCCESS；25/25 + 146/146 + 10/10 |
| Page package | `38129975625` / `114442100591` | SUCCESS；161 + 9 + 11 + 3 项全过，实际双构建/verify/ZIP |

四条工具工作流及 Native Linux bridge 完整 Node 22.23.3 套件均为 **1,118 total / 1,111 PASS / 0 FAIL / 0 cancelled / 7 SKIP**，其中实际执行了本轮身份变更、孤儿授权、卸载恢复和官方升级旧来源快照五分支回归。当前已确认 12/13 工作流成功，Native `38129975611` 的 Intel/ARM 独立 Job 仍在执行，尚不能写该整项成功。

主 Agent 按 GitHub artifact digest 下载并核对 R45 `11698448653`（364,484 B，ZIP SHA-256 `6e9c448b9e7fd05c8add9dca0de3f88bb32da39a96135c527b023c2db855a0aa`）、TOC `11698808341`（`08b4dc1209d5f07c11ee34151f412cb39c588a9515986e240e94cec29fbfca13`）、Knowledge `11698603465`（`356d042f79530ecd0ac4205ba8c66aef42e752354ec4c478fec0a0d094246d12`），并实际查看首次空态、五项安装、卸载重启空态、TOC 及 Knowledge 360px 明暗截图。Markdown `11698593231` 的 ZIP SHA-256 `90d82757f39336b2cd3a97b549cbc282ad2a080d0eb229949dcfd778876e8790` 也由只读审计逐字节复算。

[原始 R45 结果](evidence/official-tools-r45-20261011/native-result-fd6d135c.json) 保留原样，source commit 精确为 fd6d。实际 Linux headed CFT 155.0.8059.39、生产扩展 `jhajepcnohiplmafaiokjlcagcfjgaap`；同一 Profile 的 PID **5882 → 6279 → 6458**，前两代 `normalExit=true`、exit code 0 / signal null。两种官方入口、真实双窗口、A/B 授权隔离、控制旧版升级取消/批准、数据保留、Side Panel 关闭重开、独立本地导入、撤权与卸载后完整重启均通过。

**原始字段勘误：** fd6d 的旧 `storageWritesFromDriver:0` 不能解释为“总 Storage 写入为零”。并行容量试验实际只向随机专用前缀写 12 个键、每键 920,000 字符，并用一次 remove 清理；读回用量 **105,500 → 11,146,390 B**，重启后 **11,159,596 B**，清理后 **118,706 B**。安装记录、网站授权和工具私有数据仍全由真实 UI 产生。下一提交只将字段明确为 `protectedStorageWritesFromDriver:0`，容量对象另记 `driverSetCalls:12`、`driverRemoveCalls:1`；不修改原始 fd6d 证据、不改生产源代码或点击流程，仍重新执行现有 R45 原生驱动确认新证据。

本地 `fd6d-check.log` 382 文件通过；production/build:dev/verify exit 0，指纹分别 **`bb7474f96fa1f8910181ffdc57d490af264957b46daf21a9e18d609f6b3cee4d`** / **`2ddd107444e27421f1453048f0546d67e12477cc473efa3b8906ca60a0543cef`**，与六个独立 CI 构建记录一致；实际源码输入 288 项、漂移为空。production 54 文件，SW **325,487 / 327,680 B**（剩 2,193 B，CRITICAL），tool-shell 332,427 B 超软审阅线、未超硬预算。没有放宽预算，官方包继续为独立 JSON。资源已 released；生产正常释放，development 的执行器 PID 复用残留 fence 在核对 session 86620 exit 0、成功 receipt、空闲独占端口及精确 token 后释放，仅影响自己的 fence，记录 `fd6d-owned-development-release.json`。


### 实例撤销与旧数据保护的后续并行整合

`fd6d135c` 最终于 2026-10-11 10:02:06 UTC 确认 **13/13 workflow SUCCESS**；Native Intel/ARM 的实际 Chrome 与隔离 Native Host 均通过。随后准备证据字段修正时，发现 main 的 `5c390e5a`、`6056bbd2`、`08e8260f`、`1ceeba5fb05061d03927b5e43a0a15b7dc4e15d1` 新增孤儿数据保护、固定 Page 资源 inventory、同包重装实例撤销和 Page 原生验收。已在所有本地构建释放后安全快进；这些生产源码已变化，因此下一候选需要重新验四条工具工作流和构建，不能仅称为 fd6d 的元数据修订。

新状态在 `post-1ceeba5f-targeted.tap` 实际为 **118 PASS / 1 FAIL**：旧 Host 测试仍要求首次重装静默删除孤儿数据。现在保留数据保护行为，改为确认安装被拒绝、内容不变、无实例；完成既有可信卸载 journal 的清理后，再次审核并安装成功，仍检查键盘焦点。无 journal 的孤儿数据只提示备份核对，拒绝自动清理，也不指向不存在的恢复按钮。

另用 `epoch-before-fix.tap` 实际复现新 epoch 初次读取覆盖较新通知（0 PASS / 1 FAIL）；独立通知计数现在只阻止旧 epoch 赋值，同时保留初次安装列表。补充同内容重装时旧 iframe 即使未收到中间通知也不能读写；Knowledge Service 在真实 helper 上拒绝遗漏/旧 epoch、接受当前 epoch，并保留原文、安装记录与授权。该单文件由生命周期子 Agent 在明确独占范围补写，实际 **17/17 PASS** 后停止写入；其他源码、refs 和产物仍由主 Agent 串行管理。

继续安全快进至 `ee212afdbbdd0f2a57b5763bae528e46e9b0ea8b`，完整保留 `ba0ff363` 独立新增的 Host/Knowledge 相同包重装撤销用例及 `ee212afd` 的 API/存储文档。重叠测试先以 checkpoint `afa135ddb49b832f5cca71af80a0955b2077287b` 保存，再逐项恢复双方新增断言；三方文件留在 `artifacts/official-tools-r45/integrate-ee212afd/`，没有丢弃任一方测试。整合后的十文件定向回归 `post-ee212afd-targeted.tap` 实际 **124/124 PASS / 0 FAIL / 0 cancelled / 0 SKIP**，`npm run check` 检查 **382** 个文件通过；`git diff --check` 通过。此处的组件成功仍不替代下一精确提交的真实 Chrome、正式构建和 CI。
