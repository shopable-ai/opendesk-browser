# Bookmark Manager R1.2 · 首批可信源码交付与待验收事项

日期：2026-10-14；目标分支：`main`。本记录只说明书签管理独立范围，不覆盖其他 Agent 的工作流或总验收账本。

## 已写入 main

- `prototypes/sidebar/bookmark-manager-preview.html`：用户反馈后的 R1.2；单一文件树（文件夹与书签混排）+ 搜索 + 一行三个主要操作，左右仅为设计评审模拟画布，UI 不修改 Chrome 书签。
- `src/bookmark-manager/{model,service,trusted-ui}.js`：固定、经审计源码的第一方书签树 / Chrome Bookmarks 操作 / 真实用户授权 / 视图和表单；用户导入/AI 动态包仍走原 opaque iframe，不因此获 Chrome 特权。
- `src/ui/{bookmark-manager.css,tool.html,sidebar-tools.js}`：独立工具入口和宿主最小接线，不新建 Runner、安装器、Browser SDK 或权限存储；`bookmarks` 已是 manifest optional permission，不扩大范围。
- `tests/environment/bookmark-manager-r1.test.mjs`：管理树/权限/CRUD/受管理根目录/过期状态/非空目录删除子树更新等单元场景。
- `src/bookmark-manager/README.zh-CN.md`：使用说明、各职责和定向验收命令。
- `docs/product/bookmark-manager-feature-universe-r12.zh-CN.md`：P0→P3 产品宇宙，AI 整理、知识图谱、阅读回顾、社区/服务市场与商业模式；Chrome 扩展私有浏览画像定向广告标 `NO-GO`。
- R28 跨 Tab 布局规范、两份工具 Skill 及 R1.1 历史说明已同步 R1.2 的“同一文件树免拆区”例外。

## 当前验证分级

- `PROTOTYPE_CHROMIUM_PASS`：受控 Chromium 的交互原型测试，覆盖单行按钮和 320/360/420px、折叠/展开、目录增改移动删除/确认、创建书签、搜索、危险 URL 拒绝、无 JS 异常。截图与临时本地 QA 在本轮对话工作空间中；不表示扩展原生成功。
- `NODE_LOCAL_PASS`：本轮单独构建的书签树/Chrome Mock 服务定向测试 7/7 通过，包括新增子节点后的删除拒绝。**需在正式仓库候选中重新执行提交后的测试**，不能以本地副本代替当前 main 的 CI 原始记录。
- `SOURCE_WIRED`：官方 GitHub `main` 已存在 Tool Tab 按钮、真正第一方源码和作用域 CSS，初始授权/拒绝/撤权由可信 UI 和 Chrome optional permission gate 处理。
- `REPO_NODE / BUILD / PACKAGE / REAL_CHROME / MAC_PROFILE / 200%_ZOOM`：**NOT_TESTED / PENDING**，等待真正项目 checkout、CI / Mac Codex 中的定向验证。未在当前会话调用本机 `npm run build` 或加载你的 Mac Profile，不能声称质量 95+ 正式产品验收。
- GitHub Actions 会因 main 提交异步排队；任何尚未完成/不属于同候选的动作不能当成通过证据。

## 立即验收清单（核心先于扩展宇宙）

1. 取得最新 `main` 及并行工作区状态，核对本任务文件/构建资源的写入所有权，不覆盖其他 Agent 的修改。
2. `node --test tests/environment/bookmark-manager-r1.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/sidebar-tools.test.mjs`；随后 `npm run check`、真实构建和包验证。优先修构建失败或不可信权限判定。
3. Mac Chrome 扩展 `dist/development` 的正确 ID 路径加载；在「工具 → 书签管理」点击授权，真正创建并编辑一个临时书签和子文件夹，返回重开核对数据；同 Chrome 多窗口修改、撤销 `bookmarks` 权限、系统/受管节点、非空目录下新增子书签后尝试删除；失败必须保留原始行为。
4. 真实 320/360/420px、浅深主题、键盘 Tab / Esc 与浏览器 **200% 真缩放**，确认三个操作入口、树节点管理与表单可见。
5. 普通动态工具仍无法获得完整书签树；导入/卸载、Time Review、其他既有工具不能被误识别为书签内置功能。
6. 同候选 Node、构建、真实 Chrome 原始日志/截图和身份绑定后才能将相应阶段标 PASS、评 95+。

## 非本次交付

AI 整理、访问频率追踪、历史权限、定时清理、自动链接检测、社区、在线同步、商业市场、个性化广告全部未在 P0 开发，也未申请 `history` 权限。需求实验与政策风险见功能宇宙文档。

## R1.3 · GitHub 源码修复与独立证据（2026-10-14）

### 写入范围 / 并行资源

- 执行人：本对话经连接的 GitHub 直接写入，仅允许 `main`，只修改本工作流的书签源码、CSS、README、定向测试与专属 CI；未修改共享 Tool Host/Browser SDK、其他 Agent 工作流、全局 owner 或历史证据。
- 启动时核对的远端 `main` 为 `89f608f7a9786c190695a7d7150260b7673d6122`（此前用户给的 `68badfe4...` 仅历史定位）；其后 `main` 有并行的独立提交。每次目标文件写入均基于刚读取的 blob SHA，避免覆盖同路径修改。
- 当前环境 **无用户 Mac 本地文件和 Chrome Profile / GUI 权限**；未占用本机 Chrome、端口、`dist/development`、共享浏览器测试资源，不能核查 Mac 的未提交工作区状态。远端当前文件可核查，不等价于本地 `git status`。

### 已实施的核心修复

- `src/bookmark-manager/model.js`：`projectBookmarkRows` 对全部可见树节点 / 全树搜索做投影，并支持 200 项分批加载；`parentFolder` 拒绝只有 `folderType=managed` 标记的只读父文件夹。
- `src/bookmark-manager/service.js`：监听并解绑 `bookmarks` 可选权限的 onAdded/onRemoved，忽略不相关权限事件，保留所有写操作前的再次授权检查。
- `src/bookmark-manager/trusted-ui.js`：统一树的「显示更多」交互、受管理目录只读提示、首次权限检查占位/读取失败重试、中文 IME 输入保护、键盘 Escape 与树操作焦点恢复；重开新实例时以 session 阻止旧异步结果污染新 UI；「收藏当前页」要求同步调用现有可信 `currentPageTarget.capture()`，写入前必须 `revalidate(captured)`，缺绑定或页面漂移则失败关闭。
- `src/ui/bookmark-manager.css`：分页按钮布局、极窄视口下按钮可换行、长目录缩进上限，保留 320px 以上的一行三操作。
- `tests/environment/bookmark-manager-r1.test.mjs`：增加 550 项树投影/全量搜索、managed 无 unmodifiable、权限新增/撤销监听释放、可信 UI 420 项加载/搜索/撤权/重授权、当前文档切换前后收藏的 Mock 正反例。
- `src/bookmark-manager/README.zh-CN.md` 与 `.github/workflows/bookmark-manager-r13.yml`：更新产品边界，并添加隔离的真实仓库 Node → check → production build → package CI。没有加入第二套 Runner/Host/数据库或 Chrome 权限。

### 测试与原始证据（各阶段互不替代）

- 历史 `NODE_LOCAL_PASS 7/7` 是 R1.2 Mock，保留历史级别，**不升格**为 R1.3 同候选 PASS。
- GitHub Actions [R1.3 首轮失败记录](https://github.com/shopable-ai/opendesk-browser/actions/runs/38555943292)：`ed76668e4aed730d5b36d3a40d7c0ed580ca74ef`，Node 96 项中 94 PASS / 2 FAIL。均为新增测试的树顺序/受管子目录计数预期有误，已修正测试断言而非放宽功能，详见后续 `3abecf42...`、`44faf3e...` 提交。该旧候选的后续 check/build/package 为 SKIPPED。
- 本轮更新后的工作候选：`15ee2d9562ffef11e7600561e91fa8610f3426c3`；[本候选 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38556852913)。记录时仍为 `QUEUED`，**不能标 PASS**，须核对后续完整日志、Node 结论、check、build 与 package。
- `NODE_CURRENT / CHECK_CURRENT / BUILD_CURRENT / PACKAGE_CURRENT`：等待同一候选 GitHub Actions 的最终结论，当前暂记 `NOT_TESTED/QUEUED`。
- `REAL_CHROME / FIRST_GESTURE_PERMISSION / PROFILE_BOOKMARK_CRUD / MULTI_WINDOW / PERMISSION_REVOKE / CHROME_200_PERCENT / RESPONSIVE_SCREENSHOTS / DYNAMIC_TOOL_ISOLATION_NATIVE`：本会话均 `NOT_TESTED`。代码审计与 Mock/CI 不能替代安装过的扩展真实用户操作。

### Mac 本地 Codex 最小接力（优先核心，按此顺序）

1. 与其他写入者协调 `main` 最新本地工作区，核查书签本轮提交和现有 `dist/development` 负责人；只在获授权的正确 Chrome Profile 中加载真实扩展，保存扩展 ID、manifest、dist 与 commit/package 哈希，禁止覆盖共享 watcher。
2. 首次授权：工具 → 书签管理 → 真实手势 Chrome 弹窗 → 原 Profile 真正的书签树；拒绝后重新授权、已授权不重复提示；撤权必须拒绝 CRUD，保存权限记录与错误屏。
3. CRUD：使用独立测试目录收藏当前 HTTP(S) 网页，创建书签/子目录，修改 URL/标题，移动书签/目录，重进后检查 Chrome 自身数据；别把已有个人书签作为可删除测试样本。
4. 删除与变化：删除测试书签、空/非空测试目录；确认页打开后在另一个 Chrome 窗口新增子项，确认必须拒绝并保留数据；更换活动网页后原收藏动作应被拒绝；对受管目录和非 HTTP(S) 历史数据仅作安全观察。
5. 用真实 Side Panel 在 320/360/420 CSS px、浅/深主题及 Chrome 真 200% 缩放中验证三按钮、500+ 项显示更多/全量搜索、深层目录、长文件名、中文输入法、Tab/Shift+Tab/Enter/Space/Escape、错误恢复和关闭重开；留截图、操作日志。
6. 确认普通动态工具的 sandbox 无 `chrome.bookmarks` 直读权，已有工具启停/卸载与 Time Review 未发生新回归。全部测试用临时目录并清理，避免触碰用户个人资料。

### 六维独立质量评估（严禁凭源码预评分）

| 核心功能正确性 | 树和操作效率 | 权限/隔离 | 并发/生命周期 | 响应式/可访问性 | 维护性/回归 |
| --- | --- | --- | --- | --- | --- |
| NOT_TESTED (Chrome) | NOT_TESTED (Chrome) | NOT_TESTED (Chrome) | NOT_TESTED (Chrome) | NOT_TESTED (Chrome) | NOT_TESTED (最终 CI) |

所有维度目标仍是独立 ≥95，必须先具备同一当前构建的原始证据。P1 重复/失效/老化诊断、P2 AI 整理/知识树、P3 社区/市场/广告等均只保留为规划，未实施。书签数据不会因这次修复新增同步、上传或广告画像。

### R1.3 最终源码候选 GitHub CI · VERIFIED（2026-10-14 11:35 UTC）

本节覆盖上文记录的阶段性 `QUEUED` 状态；保留历史失败与观察时间，不改写旧候选原始结果。

- 对应源码/CI 候选 commit：[`15ee2d9562ffef11e7600561e91fa8610f3426c3`](https://github.com/shopable-ai/opendesk-browser/commit/15ee2d9562ffef11e7600561e91fa8610f3426c3)（包括安全收藏当前网页的 document capture + revalidate 及其新增正反 Mock 验证）。
- 原始 GitHub Actions：[Bookmark Manager R1.3 #38556852913](https://github.com/shopable-ai/opendesk-browser/actions/runs/38556852913)，job `115828031733`，结论 `completed/success`，`2026-10-14T11:35:23Z`。
- `REPO_NODE_PASS`：Ubuntu / Node 22 环境执行三份定向测试共 **96 tests / 96 pass / 0 fail**，其余两份属于现有 Side Panel Host 和动态工具基线测试。Mock 仅证明组件/契约而非真实 Chrome 用户操作。
- `CHECK_PASS`：`npm run check` 完成，相关 Security/source 检查保持开启。
- `BUILD_PASS`：`npm run build` WXT **production standard** 通过，`assets=96`；`packageHash=a0a9651e1ea8f7383681e00480f82e866235066c52692740c93bed07ea05e37b`。
- `PACKAGE_PASS`：`node scripts/verify-package.mjs dist/production` 输出 `status=passed`、`manifestVersion=3`，与同一个 CI job 的构建步骤绑定。CI 还保留 artifact `bookmark-manager-r13-build-15ee2d9562ffef11e7600561e91fa8610f3426c3`（artifact ID `11891115270`；截至记录时未过期）。**未在 Mac 安装该包、未验证生产包与 Mac development 包一致。**
- 警示但非本次 CI FAIL：build 输出 `BUILD_SIZE_CRITICAL ui/tool-shell.js 501780/524288`，余量 `22508` bytes；`sw.js 592202 B` 超过软提醒阈值但低于硬限额。书签本轮没有调整预算，也未借此声明产品原生通过。
- CI 环境未提供真实 Chrome Side Panel/扩展 ID/Profile/本机截图；`REAL_CHROME`、真实授权、收藏/移动/删除、真实竞态、320/360/420 与真 200%、动态工具隔离原生验证**仍为 `NOT_TESTED`**。浏览器扩展 ID、Mac Profile、development package hash：`NOT_TESTED`。**本轮六项专家最终产品评分均 `NOT_TESTED`，不虚设 95+。**

状态：当前网页版能力范围内的主要源码修复与独立 GitHub Node/check/build/package **已闭合**。**P0 整体产品不可宣布完成**：只剩 Mac 真实 Chrome 安装、授权与 CRUD、并发/响应式/隔离闭环需要独立实测，若实测发现缺陷再做最小修复及同候选影响回归。

## R1.4 · 非空目录删除内容快照强化（2026-10-14）

- 历史 R1.3 commit `15ee2d9562ffef11e7600561e91fa8610f3426c3` 的 Node 96/96、Check、Build、Package 均有同候选 GitHub CI 成功记录；不得与最新提交混同。
- 实际源码缺陷：以前仅比较子节点 ID。其他窗口在确认后修改既有子书签标题或 URL 时，ID 不变，可能仍然删除已变化的内容。
- 本次修复：删除目录要求提供原确认时整棵子树的签名（ID/父节点/标题/URL/受管标记/文件夹类型），缺失签名或内容/结构变化时安全拒绝；空目录也必须提供显式空快照。保持已有可信 UI、bookmarks 可选权限与服务架构，不新增运行时。
- 定向回归：新增“不改变 ID 的子项编辑”拒绝删除和“空目录必须明确快照”场景，保留原新增子节点竞态检查。请以本次提交 SHA 的 CI 为准。
- Chrome `removeTree` 没有原子条件删除功能，校验后的极小并发窗口仍不能从 API 层彻底消除。须以真实 Mac Chrome 多窗口验证与用户数据保护为准。
- Mac 本地工作区、实际 Chrome Profile/扩展 ID、真实授权/CRUD、视觉缩放、动态工具原生隔离尚 `NOT_TESTED`。六项最终产品评分均待真实证据，不提前给 95+。

### R1.4 同候选 GitHub Actions CI · VERIFIED（2026-10-14）

- 被验证的**书签修复源码候选**：[`6f5e7ff36e1e8cbf60f8be85180e0fc78689f572`](https://github.com/shopable-ai/opendesk-browser/commit/6f5e7ff36e1e8cbf60f8be85180e0fc78689f572)，其六处变更仅涉及书签 model/service/trusted-ui、专项测试、README 和工作账本。
- 同 SHA 工作流：[`Bookmark Manager` #38564426496](https://github.com/shopable-ai/opendesk-browser/actions/runs/38564426496)，job `115853357349`，最终 `completed/success`。
- `NODE_CURRENT_PASS`：Node 22 / GitHub Ubuntu，三份定向测试共 **99 tests / 99 pass / 0 fail**。包含新增子书签内容变化、空目录快照回归；这仍是 Node Mock，不是安装扩展的原生 Chrome。
- `CHECK_CURRENT_PASS`：`npm run check`。
- `BUILD_CURRENT_PASS`：`npm run build` (WXT production)。
- `PACKAGE_CURRENT_PASS`：`node scripts/verify-package.mjs dist/production` 输出 `"status":"passed"`、`"manifestVersion":3`。该 CI 记录的包哈希 `89dc28b266bd407252c90f8b2a387553c9a0a391b5fbc747cdeda8fd43677ec9`；artifact `bookmark-manager-r13-build-6f5e7ff36e1e8cbf60f8be85180e0fc78689f572` (ID `11894255336`)。
- 共享构建容量风险：该构建记录 `ui/tool-shell.js` 为 518100 B，接近现有 524288 B 预算，尚余 6188 B。此次没有改变全局构建预算、共享文件或工具 Host；应交由相应构建工作流处理。
- `REAL_CHROME`、权限原生弹窗、当前 Chrome Profile CRUD、跨窗口内容变化删除拒绝、320/360/420 CSS px、真 200% 缩放、动态安装工具原生隔离，依然全部 **NOT_TESTED**。需要在用户 Mac 安装本 SHA 对应的 development 扩展后验证，严禁把 CI 成功当作 Chrome 用户验收通过。
- 原生特别场景：在测试专用文件夹展开确认删除后，从另一 Chrome 窗口只更改原有子书签的**标题或 URL**（不增删节点），返回确认删除应提示已变化并完整保留该目录与修改后的内容；随后新建子节点再试也应拒绝。
