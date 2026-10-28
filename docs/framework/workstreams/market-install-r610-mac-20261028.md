# 应用市场 R6.10 · main 差量与隔离 Mac Chrome 验证

日期：2026-10-28（Asia/Shanghai）。Owner：本对话 R6.10。状态：`CORE_LOOP_PASS / FINAL_ACCEPTANCE_INCOMPLETE`。
代表应用真实闭环完成；八维并非各 ≥95，不能宣布 R6.10 最终 MVP 验收完成。

## 候选、环境与继承

起始 HEAD `2a733646a`；冻结基线为后续 main `f18eab63ca86aae1847ed90c561301804fdbba95`，叠加本轮差量及冻结时已存在的工作区输入。并行变化不自动触发重建。
继承 [R6.2](../../market-page-install-evidence-r62.md)、[R6.9.3](market-install-r693-mac-20261027.md) 的原架构；已读 R6.9.4 原始收据。旧安装/升级/取消/读取/卸载证据只证明旧候选，不计成本候选通过。Knowledge 历史 0.1.5 冲突未再现，当前冻结来源为 0.1.7，没有重复改版本。

本轮为 **静态 development 包**，没有持续开发连接，不是 production 验收包。普通源码快照 `/private/tmp/opendesk-market-r610-whjsrhs5`（非 Git worktree）；加载其 `dist/development`。ID `lgcfbibhbhpcigoalpcnkmgbmfoknpng`；packageHash `51d0bf0a96751abf70d0edbaaf2840bbb9aba79293892c5fb613c3173cc0167e`，构建期间 source drift 为空。

独立 Chrome for Testing 155.0.8059.39：`/private/tmp/OpenDesk Market R610 CFT.app`，bundle ID `com.opendesk.testing.market-r610`。仅修改官方副本 Info.plist 名称和身份，避免原生自动化误选其他窗口；可执行文件与官方原件一致。独立 Profile `artifacts/market-r610-mac-20261028/cft-profile`，CDP 仅监听本机并自动分配端口，没有个人书签或登录态。

独立市场 [43134](http://127.0.0.1:43134/)，最终 siteBuildId `18a2edc8cb7bfb9fc75abe4fe83a2ad1c4e2fa1670e7d07d76274cf286d8892e`，13 个应用、38 个发行记录。保留原 43132、其他对话 43133、日常 watcher 43119/43120 及各 Profile，不覆盖日常 `dist/development`。仅 main，无新分支/worktree/PR；不暂存或回滚其他任务文件。

## 本轮实际差量

1. `src/ui/react/tabs/tools.tsx`：顶部语言按钮移至「更多 → 语言与翻译」，保留原生事件、原回调、全局/应用语言与语言包管理。真实 Side Panel 和源码绑定预览均能打开原管理器。
2. `src/market-site/client.js`：明确结束但结果未知的交接不再提示返回已关闭的审阅；再次点击才发起新审阅，不自动重放。只读事务回执，不恢复长期安装状态同步或新建状态库。
3. `official-tools/catalog.json`：剪藏 1.2.9 使用既有 `packageFile` 机制选择已审阅的固定正式包。原阻断为共享样式领先归档版本导致同版不同字节；正式包与归档 77161 字节、SHA `f5b47c36fbd88f2f59937ab5df7b921776fa5ffa6ca3f42bf8b1b5f55c8ef311` 一致，没有批量涨版本或忽略冲突。
4. `scripts/bundle-provenance.mjs`：审阅 main 已有 Stay Focus 两处 class 名替换和六个既有可信 Host CSS 迁出；精确 blob pin、输出限制和 symlink 拒绝继续生效，只准进入原 `ui/tool-shell.js`，不扩展动态安装包可信准入。
5. 书签 `src/main.js`：真实保存/搜索后被通用 input 监听误标 dirty，卸载被拒绝。通过公开 `OpenDeskTool.setState({dirty,busy})` 在 microtask 上报实际草稿状态；真实草稿、写入中和未知结果保留保护。不改宿主。
6. 书签升 0.3.14，ID/权限不变。原打包器候选 → 定向测试 → `--promote-from` 晋升唯一正式 JSON → `--check-project`。89438 字节、SHA `ff681516aeb5826fc66f8472d69baa6557cb2722f421d3811bdaadb1655e43c7`；HTTP 实际包与正式包逐字节一致。
7. 原预览生成器成功后直接打开既有 clipper ToolHost；未知/停用不提供打开动作。修复预览 520px 最小高度使 200% 下底部不可见的问题，仅调整预览容器。生成 `prototypes/sidebar/react-preview/index.html`，保留并行 clipper `preview/stage.html` 原字节。

## 真实 Mac 操作

网页发起审阅，真实 `SIDE_PANEL` 上下文确认安装 0.3.13，本机读回并直接打开书签沙箱。首次完整书签权限由可信设置及 Chrome 原生提示批准，不调用桌面安装器。创建「R610 测试书签」，经一次可信确认，Chrome 读回 id 5；搜索一条匹配。随后错误 dirty 导致卸载拒绝：`uninstall-v13-blocked-readback.json`、`08-v13-uninstall-blocked.png` 保留失败，不计 PASS。

修复后用原市场 `OPENDESK_MARKET_PROJECTS` 支持加入独立工具 0.3.14，不改已冻结扩展产物。原审阅显示 0.3.13 → 0.3.14、权限声明不变；确认后本机读回 0.3.14。它仍走原 Classic 沙箱路径，本轮不改可信 React 准入锁，不借用历史正式 React 候选证据。

新版创建「R610 修复复验」，经一次可信确认，Chrome 原生读回 id 6 及准确 URL；搜索一条匹配。**不关闭应用、不丢弃草稿，直接确认卸载成功**：安装记录无 bookmark-manager、iframe 为 0、相关本地数据/授权键为空，Chrome 书签保留。Chrome 全局 bookmarks 权限不因单个工具卸载而撤掉其他工具所需权限。

网页卸载后显示「安装到OpenDesk」，没有误报当前已安装；已完成事务即使短暂显示成功，也明确只为历史回执。网页不承担长期安装同步。Native Messaging 在安装、使用、卸载读回中始终为 false。

## 验证与限制

原始证据：`artifacts/market-r610-mac-20261028/`。精简索引：[acceptance-receipt.json](../evidence/market-r610-mac-20261028/acceptance-receipt.json)。冻结扩展内置书签 0.3.13，网页后来提供独立 0.3.14；扩展构建、市场工具发行、安装读回及预览分别绑定身份，不合称为同一次构建通过。

| 验证 | 结果 | 原始记录 |
|---|---|---|
| 隔离 `npm run build:dev` | PASS、source drift 为空 | `build-final2.log`、`build-evidence/build-development.json` |
| 原 market builder/serve，含独立 0.3.14 | PASS | `market-serve-final.log`、`bookmark-served-identity.json` |
| 市场交接/导航/可信审阅定向测试 | 142/142 PASS | `market-targeted.tap` |
| Page 事务身份/撤权检查 | 30/30 PASS | `page-install.tap` |
| 最终 client | 32/32 PASS，与上组重叠不累加 | `client-final.tap` |
| 来源 pin/漂移/symlink/错误输出拒绝及可信控件 | 22/22 PASS | `trusted-controls.tap` |
| 剪藏固定发行选择 | 1/1 PASS | `clipper-release.tap` |
| 书签状态与包晋升门禁 | 5/5 PASS，晋升及同源检查 PASS | `bookmark-regression.tap`、`bookmark-promote.json`、`bookmark-project-check.json` |
| 本轮语言/历史 fixture/导入菜单 | 3/3 PASS | `language-targeted-final.tap` |
| owner 新提交后原三项集成检查 | 3/3 PASS | `integration-owner-commit-recheck.tap` |
| 最终预览生成合同 | 1/1 PASS | `preview-contract-final.tap` |
| 最终预览五档宽度 × 明暗 | 默认缩放 10/10、真实 200% 10/10 PASS | `preview-final-normal.json`、`preview-keyboard-footer-200.json` |
| 预览成功打开/未知停用拒绝/语言键盘 | PASS，仅 UI_PREVIEW_ONLY | `preview-open-path.json`、`preview-result-gates.json`、`preview-locale-market.json` |
| 真实更新/写入/搜索/卸载及网页状态 | PASS | `bookmark-update-readback.json`、`bookmark-v14-core.json`、`uninstall-v14-readback.json`、`website-after-uninstall.json` |

200% 每项读回 `getZoom()===2`、innerWidth 600，Tab 聚焦确认后由 `elementFromPoint` 确认按钮中心可见。旧 `preview-matrix.json` 为修复前基础检查；`preview-keyboard-footer-mixed-zoom-attempt.json` 是混合缩放尝试，不计最终 200% PASS。目视检查最终 320 深色、520 浅色 200% 截图，页脚与焦点可见。预览从不替代真实安装证明。

完整语言/交互日志 `language-final.tap` 为 **103 项：99 PASS、4 FAIL**。其中本轮菜单涉及的历史 fixture 断言已修复并单项复验，原日志不改写为整组 PASS。原另三项涉及并行 `src/ui/extension-center.js`：详情额外“打开使用”断言、dispose 源码正则、Sidebar 存储失败时 Page 读回未收敛。收尾时该 owner 已提交 `c1219d84a`；输入变化后仅重跑原三项，`integration-owner-commit-recheck.tap` **3/3 PASS**。未覆盖其源码、未改写旧日志、未据此宣称整组全绿。后到的 Cookie/导航提交不自动触发重建；原生证据仍只绑定冻结浏览器候选，未把它们冒充本候选原生 PASS。

## 独立评分与完成边界

独立只读 reviewer Hume 未发现本轮指定 diff 的新增可行动问题，结论 COMMENT，不代表整体 APPROVE。

| 维度 | 分数 /100 | 主要限制 |
|---|---:|---|
| 产品 | 95 | 原集成失败已定向通过，原生仍限定冻结候选 |
| UX | 94 | 预览不能替代全部正式交互 |
| React 架构 | 94 | 复用原根与组件，未做全架构审计 |
| 安装安全 | 96 | 原权限与精确来源保护保留，无 production/CWS 证明 |
| 生命周期 | 94 | Page 读回复验通过，后到 main 无本候选原生证据 |
| 测试证据 | 86 | 原失败均有定向复验，整组与语义类型诊断未重跑 |
| 维护性 | 92 | 事件顺序和分阶段身份需明确维护 |
| 跨对话去重 | 96 | owner 已提交，只复验原失败，资源和身份分开 |

算术平均 **747 ÷ 8 = 93.375（显示 93.38）**，并非每维 ≥95。

- `NOT_TESTED`：本候选 production 五 Tab、CWS/公网 HTTPS 发布、独立语义类型诊断；取消/失败/重复点击/未知结果的本候选原生故障矩阵未重放，Node 和历史原生证据分别保留。
- `NOT_CONFIRMED`：本轮本地差量未推送，无本提交 CI PASS；GitHub Actions 对冻结基线 f18eab63ca86aae1847ed90c561301804fdbba95 查询 total_count 0，空结果不等于绿灯。
- `INCOMPLETE`：八维门槛及冻结后相关 main 差量的原生证据；历史集成失败已定向复验通过，但整组未再次执行。没有第二市场、Installer、SDK、状态库，没有桌面安装器。

独立浏览器和 43134 服务保留供查看；具体路径/Profile/PID/端点见本机 `browser-owner.json` 和收据。代表应用闭环完成后停止扩展验收范围。

## 2026-10-28 最新 main 差量复核（01a1814f）

本次开始 main 为 `9b1b5ece00dd767e3bb2515e0f2bb168d5b6f37d`，验证输入最终核对至并行提交后的 `f81fea7b3b028d8695cbcde3225e2e3d8a8edbec`。首次远端 main 读回 `2b51fe0b2f20b5ffab490018202702b8a633a564` 是本地祖先；后续 GitHub Actions 已有 f81 候选运行。只在 main 工作，无分支、worktree、PR、桌面安装器或第二安装层。

### 已有成果与本次实际修改

- 原实现提交 `b208dbc8f` 已包含语言入口迁入「更多 → 语言与翻译」、事务回执、书签 dirty 修复及唯一 0.3.14 正式包。本次没有重复修改产品源码或安装应用。
- 核对原验收索引的 **31 份原始文件：字节数及 SHA-256 全部匹配**；书签正式包仍为 89438 字节、`ff681516aeb5826fc66f8472d69baa6557cb2722f421d3811bdaadb1655e43c7`。继承上文真实 Mac CFT155 的审阅安装、更新、写入、搜索、卸载、本机清理及 Native Messaging 为 false 的证据；没有新开浏览器或重放安装链。
- 当前 tools/client/status/external/panel/Installer 与冻结快照对应文件一致。b208 至 f81 的本任务相关产品差量仅 `extension-center.js` 两行停用说明，原生结果仍绑定原静态 development 候选，不能宣称整个最新 HEAD 的真实 Chrome 验收通过。
- 本次唯一测试修改为 `tests/environment/market-page-discovery-r61.test.mjs`：最新市场导航 CI 仍要求已退役的“安装成功以真实本机记录为准”。本机先重现失败，再改为同时核对“网页成功回执仅说明本次事务完成”和“当前安装与使用请在 OpenDesk 侧边栏核对”；保留现有 HTTP、扩展 ID、侧栏审阅和未批准语义检查，未为断言恢复长期网页安装态。

### 新执行的最小验证

- 原市场 builder 使用独立输出 `artifacts/market-r610-delta-01a1814f/site`，**PASS：13 应用、38 发行**；siteBuildId `3231bc5bb69a1586174cdb08af28075b0ff318a192314819887a91236a34333f`。80 项来源输入在 f81 后重核无漂移。Knowledge 当前推荐 0.1.7，归档 0.1.5 保留，旧同版冲突没有再现。没有启动 HTTP 服务或覆盖日常 dist。
- 市场事务/双击/卸载/Native 边界选定检查 **6/6 PASS**；停用说明的 R4.8 单项 **1/1 PASS**。
- 修正帮助断言后，执行与失败 CI 同一步骤的五文件导航组：`market-panel-navigation-r691`、`market-page-panel-navigation-r691`、`market-site-client-r5`、`market-panel-handoff`、`market-page-discovery-r61`，**139/139 PASS**。该组包含上述6项，不相加宣传覆盖率。均为 Node 检查，不能替代真实浏览器。
- `git diff --check` 通过。本次没有固定运行时代码变更，未重复扩展整包构建、全仓测试或原生矩阵。

### 语言、预览与资源边界

独立 reviewer 核对当前预览 HTML 与最终预览逐字节一致，115 项源码及两项汇总输入摘要匹配。继承五档容器宽度 × 明暗的10项默认缩放及10项实际200%预览检查、语言管理器呈现和市场入口提示；仍只标 `UI_PREVIEW_ONLY`。200%收据的浏览器 viewport 为600×530，320/360/400/440/520 是预览容器选择值，**不能据此宣称已安装 Side Panel 的物理宽度与200%重排均通过**。完整语言切换持久化、重启及语言包导入链未补测。

开始时43132为旧市场 Python PID81835，43134已由 Cookie 预览 Vite PID78587占用，日常 watcher PID7390监听43119/43120；这些是本次观察，不沿用上文旧 owner 状态，也未重启或占用它们。其他对话的 Cookie、ChatGPT、Knowledge 修改由原 owner 提交，本次未覆盖、重打包或暂存。

### CI、独立评分及完成结论

最新 f81 的市场导航 [40648679484](https://github.com/shopable-ai/opendesk-browser/actions/runs/40648679484) 原结果为138 PASS / 1 FAIL；本机139/139复验不能改写远端结果，本次补丁尚无远端 CI PASS。更广市场 [40648679359](https://github.com/shopable-ai/opendesk-browser/actions/runs/40648679359) 仍失败，原日志包含生成资源 `dist/tool.css` 缺失、观察器源码形状和旧 UI 预期等问题；未全部分类修复，不称“均与任务无关”或全绿。未为旧清单恢复全应用验收。

本次只读审计另指出基线 `external.js` 对 consumed 终态交接的保留可能累计耗尽64条容量；标 `MEDIUM / SOURCE_FINDING_NOT_RUNTIME_REPRODUCED`。它不阻断已完成代表链，本次未运行累计64次压力循环或更改容量、安全、重放规则，作为后续可靠性风险保留。

独立 reviewer Averroes 的有限范围评分（各100分，非发布批准）：

| 产品 | UX | React架构 | 安装安全 | 生命周期 | 测试证据 | 维护性 | 跨对话去重 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 94 | 94 | 94 | 94 | 93 | 90 | 92 | 97 |

算术平均 **748 ÷ 8 = 93.50**；不替换上文历史评分，不为95分扩张任务。结论仍为 **代表应用核心闭环 PASS；R6.10 八维最终验收未完成，不能宣布最终 MVP 验收通过**。最新整包原生候选、正式 production、原生异常矩阵、语义诊断及完整语言链保留 `NOT_TESTED`；公众 HTTPS/CWS 通道继续 `PUBLIC_RELEASE_BLOCKED`。

本次结构化证据：[latest-main-delta-01a1814f.json](../evidence/market-r610-mac-20261028/latest-main-delta-01a1814f.json)。本机新日志保存在 `artifacts/market-r610-delta-01a1814f/`；成功闭环不重复，收尾不启动后续自动化。
