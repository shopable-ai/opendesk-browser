# R3.2 / R4.5 Mac Chrome 验收与交付记录

日期：2026-10-11。会话：01a12a35-7473-7a21-bab9-527ec10dab9d。默认中文。

本轮生产 MV3 官方安装生命周期 **PASS**，包含 13 阶段、26 次真实确认、两次正常 Chrome 完整重启。定向 Node 107/107；完整 `npm test` 1119 项，1117 PASS、0 FAIL、2 SKIP。源码检查、双构建、verify、pack 和市场站点构建通过。独立完整 F3 和正式 ZIP 安装为 **NOT_TESTED**，没有产品评分或正式发布声明。

## Git、现场与资源

起始 SHA：`51d8526c05b2940274114366c0d5086fc8041627`；首次 fetch 的 origin/main：`a9117d2340752ae44f2d705e4e0fd3fa3b6a6ac7`。本地与远端分叉，不能 fast-forward。用户明确批准普通 merge，保留双方提交与未提交文档；另一对话先合并到 `4f3a035b8b783a8f007cb03b9501fc1fefa107f4`，本轮继续普通 merge 集成后续可信快照，没有 reset、clean、强推、分支、worktree 或 PR。

最后 fetch 的 origin/main：`5c390e5ab5812c30508384755ef6bc0846a7039d`；最终验收源码 SHA：`0d922c195a8c4227d27d81f20081168f6fff8173`。原始 Chrome 记录的 base SHA 是 `e5238175210500491047d51d428a1b2bc786cc7c`，其受测文件字节与最终源码通过 `delivery-candidate/candidate-binding.json` 绑定，所有构建输入与 dist 文件漂移为零。当前分支 main，ahead/behind：`10	0`。未推送；更晚上游提交不能沿用本轮 PASS。

本报告的证据提交 SHA 不回写到自身提交；本机 `.runtime/tests/app-market-mac-01a12a35/delivery.json` 在提交完成后记录最终交付 SHA、分支和推送状态。也可用 `git log -1 --format=%H -- docs/framework/workstreams/app-market-mac-01a12a35.zh-CN.md` 查询证据提交。机器报告：`app-market-mac-01a12a35.json`。

两份他人未提交文档 `unified-mac-01a1297c.zh-CN.md` 和 `goal-unified-mac-01a1297c-handoff.zh-CN.md` 原始哈希一致，未纳入本轮提交。没有控制 PID 1091、32890、42366 的 CFT，未抢占日常 Profile、43111 演示服务或其他候选。串行使用根 dist/.wxt，所有新 build receipt、ZIP、市场站点、截图均输出到本任务目录，不刷新旧回执。最后资源清理的 ps、Profile、端口及根构建进程观测见 `delivery-candidate/cleanup.json`。

## 版本、包及发行身份

Node `v24.16.0`，npm `11.13.0`，macOS 26.5.1 / 25F80、arm64，CFT 155.0.8059.39。实际扩展 ID：`efhcmggbgamacpfhhmooelgdkepdcghh`，这是本地受测路径对应 ID，不能作为已登记的稳定公网生产 ID。二进制和每次实际 argv/Profile/PID 见机器报告及 Chrome 原始记录；Mac 仅对独立 CFT 使用 `--use-mock-keychain`。

- production packageHash：`e9b507662fed529f745197c9f2b65a18af75fcda01e5af350082999bae0f8a34`。
- development packageHash：`5cf422d0df66ba45c61e1098f8141f7f9a485e78569b63519977d6e6defae37f`。
- 正式生产 ZIP SHA-256：`a7beda1574d158d96f6f7d19f8c621a3fdd4a7eacfe00c0c3f17dd2530e5e844`，579362 B。
- ZIP 每个文件与受测 production 字节相同；**仅包一致性 PASS，ZIP 安装 NOT_TESTED**。
- 官方资源权威为 `official-tools/catalog.json` 和各项目配置，正式包由构建器生成到 `dist/production/official-tools/`。没有恢复 `src/sidebar-tools/` 旧包或手工复制生成包。

| 应用 | 实际发行版本 | 正式能力 | 安装及主动打开 | 最终状态 |
| --- | --- | --- | --- | --- |
| 阅读目录 | 1.0.2 | page.toc | PASS | 已卸载，重启后无记录 |
| 网页剪藏 | 1.0.0 | page.clip,user.export | PASS | 已卸载，重启后无记录 |
| 网页笔记 | 1.1.5 | storage.local,currentPage.read,tasks.open | PASS | 已卸载，重启后无记录 |
| Markdown 工作台 | 1.0.0 | user.export | PASS | 已卸载，重启后无记录 |
| 知识收件箱 | 1.1.2 | page.capture,knowledge.store,user.export | PASS | 已卸载，重启后无记录 |

各包 SHA-256、字节数、详情 DOM、作者 OpenDesk、版本、适用范围、能力审阅文字及真实截图见 `delivery-candidate/mac-accepted/native-result.json` 的 `releases` / `appDetails`。五款初始均未安装，发行包实际可取且摘要匹配；每款先看独立详情，再审阅确认，安装后无工具实例、无网站授权。市场和 Side Panel 两个正式入口均验证，主动打开后实际 sandbox ready。最终卸载用于验证清理，不能把空 registry 误报为安装失败。

## 原始 CI、历史复用与缺陷归因

旧候选 `5c9589db` 的 [38123374442](https://github.com/shopable-ai/opendesk-browser/actions/runs/38123374442) 原始 jobs、artifact 和成功 JSON 已读取，状态 **REUSE_RECORDED_PASS**。它证明对应 Linux 候选的五款安装、套装 skip/success 和重载核对；本轮直接复用这份历史基线，未重跑旧候选。源码、包和 Mac 环境已变化，因此没有把它升级为当前 PASS，也没有用它替代本轮 Mac 测试。

`733dba27` 的 [38125458376](https://github.com/shopable-ai/opendesk-browser/actions/runs/38125458376) 保留 **FAIL**：Markdown 审阅等待发生于错误的扩展 tab；上游 `079daf74` / `6e5f1dc7` 已修正 actual SIDE_PANEL 身份及导航观察/重绘行为，实际目录与包不是缺失。

随后 [38127100042](https://github.com/shopable-ai/opendesk-browser/actions/runs/38127100042) 在撤权后仍看到剪藏 origin。本轮 Mac 原样复现，DOM、registry、grants、截图和 Console 都保留。真实原因是 native mouseReleased / confirm 完成不代表异步安装锁、storage 写入和最终 UI 已完成；下一次坐标点击还可能跨越重绘。驱动现在在输入前验证元素稳定且无遮挡，仅派发一次真实鼠标输入；每次撤权/授权等待真实存储及最终界面。没有固定延时制造 PASS、跳过断言、安装重放、DOM 状态赋值或伪造点击结果。

最后调查到 [38129784328](https://github.com/shopable-ai/opendesk-browser/actions/runs/38129784328) 在 Chrome 前因 `libs/page-frameworks/react-19.2.0.js` expression IIFE 校验失败，原始 jobs/log 保存在 `final-candidate/latest-ci-*`。后续上游 `3e99ef15` 对 SHA 固定的框架表达式 IIFE 单独严格验证，保留 WXT bundle 守卫；已随最后快照合并，本轮双构建和 verify 证明修复后的输入通过。该失败 CI 的原回执仍为 FAIL，尚无本轮本地提交对应的远端 CI PASS。

早期 Node 全量出现的 LocalDev `page-program-rules.js` 内存快照解析失败已由上游 `e3954ac3` 修复；本轮没有重构 Page。中间两个默认 provenance 失败是因为旧默认 receipt 与本轮隔离 dist 不匹配；显式 `OPENDESK_BUILD_EVIDENCE_DIR` 后消除，没有重写历史 receipt。新的恢复合同、unlimitedStorage 和孤立数据保护使旧断言过时：本轮保留等待明确恢复、禁止重写 registry、保留原笔记、提示恢复清理的有效断言。相关失败、修复前后日志全部保留，没有只留绿色结果。

本轮直接修改 `scripts/pack.mjs`（隔离输出，保留默认行为）、共享 Chrome 驱动（稳定输入、持久结果、错误/DOM/registry 证据、Mac 启动、详情/布局/焦点/拒绝授权验证）及必要的三个环境测试合同。安装存储、目录迁移和 React 修复是明确合并的上游工作，没有第二套 Catalog、数据库、Runner 或安装桥。

## 真实操作与覆盖边界

Side Panel 打开复用原驱动的受控启动器：扩展页临时按钮经真实 CDP 鼠标输入调用 `chrome.sidePanel.open`，再按 `getContexts` 核对实际 SIDE_PANEL 身份；启动器不修改安装界面状态。文件导入使用真实 Chrome 文件选择器与现有 `DOM.setFileInputFiles` 适配器。关闭/重开由 CDP 关闭实际 Side Panel target，Chrome 工具栏关闭按钮未测试。

五款正式应用逐个安装并打开；两真实窗口的 Side Panel 对同版本只保留一条记录。固定 reading-kit revision 1 中缺失的网页笔记 1.1.1 被明确阻断，未替代成 1.1.5。个人套装结果为两个 succeeded、三个 skip，完成后重载保留 operationId。阶段起始的真实安装列表及来源在 `phases[].registry` / `provenance`，最终 registry 为空。

受控来源 A/B 验证独立站点授权、两次明确拒绝、目录只在 A 出现、主动读取 A 正文、切换 B 后撤销 A 授权并移除目录。受控本机 0.0.1 工具仅是隔离升级 fixture，**不是历史发行包**；来源接管、新增能力拒绝/确认、笔记数据保留及重启后实际数据核对均通过。卸载删除对应工具数据、授权和来源；第二次正常重启没有自动安装或运行。R4.5 目录迁移相关存储合同已在组件与受控旧工具数据验证，真实旧版 Profile 原地升级仍 NOT_TESTED。

容量实测使用 12 个专用键，每个 920000 B，真实 Chrome storage.local 使用量 11146390 B，重启后 11159596 B，清理后 118706 B。这 12 次驱动直接 fixture 写入如实记录，保护的安装 registry/工具私有数据写入为零；工具数据通过原生输入保存。正常重启不能证明崩溃或 Service Worker 中断后的恢复。

已 attach 的页面与 sandbox Console error / Runtime exception 各 0，CFT stderr 原文仍保留。最后一代 Chrome 的 raw receipt 保存早于 after-hook 清理，不能把其 `normalExit:false` 改成正常重启；两次重启的 exit=0 有原始证据，最终清理由独立 ps/Profile/端口记录证明。

320、360、400px 的真实扩展 CSS viewport 无横向溢出，实际七个控件原生 Tab、Shift+Tab 与 focus-visible 通过。市场 200% 使用真实 `chrome.tabs.setZoom/getZoom`。这些证据不等于物理侧栏拖动或缩放快捷键。已人工核看真实截图；市场详情中的内置示意图有明确“非真实截图”标签，不用它给应用评分。

| 场景 | 状态 | 证据等级与限制 |
| --- | --- | --- |
| 五款独立详情及发行信息 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 审阅后安装且不运行不授权 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 市场与 Side Panel 安装及主动打开 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 相同版本跨真实窗口去重 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 固定套装缺包阻断且不替换版本 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 个人套装部分成功及同版本跳过 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 完成后的市场刷新恢复核对 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 旧本机工具受审阅升级且保留数据 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 新增能力拒绝及确认 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 网站授权拒绝与独立批准 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 切换网站与从另一来源撤权 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 工具数据与网站授权重启持久化 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 卸载清理数据授权来源且重启不重装 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 真实本地存储超过10MiB及重启后保留 | PASS | Production MV3 + real CFT/CDP native input; observations use actual Chrome storage. |
| 320/360/400px 实际扩展 CSS viewport | PASS | CDP metrics override; scrollWidth <= width. Physical sidebar divider dragging is not tested. |
| 实际控件原生 Tab/Shift+Tab 和可见焦点 | PASS | Seven controls; Chrome native UI outside the document is excluded from tab-order assertions. |
| 市场200%浏览器缩放 | PASS | Actual chrome.tabs.setZoom/getZoom, not native shortcut or physical Side Panel zoom. |
| 坏包摘要身份来源容量及恢复守卫的组件回归 | PASS | Node/component level only; includes no registry replay and explicit recovery. |
| ZIP与受测生产目录字节一致 | PASS | Archive bytes compared for every entry. This is not ZIP installation acceptance. |
| 公网 HTTPS/稳定扩展 ID 外部安装入口 | BLOCKED | No domain or stable production ID; externalInstall NOT_CONFIGURED, no onMessageExternal added. |
| Chrome坏包/篡改摘要/错误身份实测 | NOT_TESTED | This round does not elevate component, historical, graceful restart or unpacked-extension evidence into this claim. |
| Chrome安装在途刷新 | NOT_TESTED | This round does not elevate component, historical, graceful restart or unpacked-extension evidence into this claim. |
| Chrome批次部分失败与取消 | NOT_TESTED | This round does not elevate component, historical, graceful restart or unpacked-extension evidence into this claim. |
| Chrome丢失同一事务回执后恢复 | NOT_TESTED | This round does not elevate component, historical, graceful restart or unpacked-extension evidence into this claim. |
| Service Worker或浏览器异常中断恢复 | NOT_TESTED | This round does not elevate component, historical, graceful restart or unpacked-extension evidence into this claim. |
| ChatGPT真实回答采集及各工具全部业务功能 | NOT_TESTED | This round does not elevate component, historical, graceful restart or unpacked-extension evidence into this claim. |
| 旧R4.4已安装Profile原地迁移 | NOT_TESTED | This round does not elevate component, historical, graceful restart or unpacked-extension evidence into this claim. |
| 物理侧栏拖动与侧栏缩放快捷键 | NOT_TESTED | This round does not elevate component, historical, graceful restart or unpacked-extension evidence into this claim. |
| 独立完整F3 | NOT_TESTED | This round does not elevate component, historical, graceful restart or unpacked-extension evidence into this claim. |
| 正式ZIP安装验收 | NOT_TESTED | This round does not elevate component, historical, graceful restart or unpacked-extension evidence into this claim. |

## 命令和证据

以下证据路径均相对于 `evidence/app-market-mac-01a12a35/delivery-candidate/`。构建使用 `OPENDESK_BUILD_EVIDENCE_DIR`，打包使用 `OPENDESK_PACKAGE_OUTPUT_DIR` / `OPENDESK_PACKAGE_EVIDENCE_DIR`，站点使用 `OPENDESK_MARKET_SITE_OUTPUT`，Chrome 使用 `OPENDESK_NATIVE_ARTIFACT_DIR`，各自指向本任务目录。

| 命令 | 结果 | 原始证据 |
| --- | --- | --- |
| `node --test tests/environment/app-market-r3.test.mjs tests/environment/app-market-batch-r3.test.mjs tests/environment/official-tools-catalog-r45.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/dev-service.test.mjs tests/environment/permission-gate.test.mjs tests/environment/sidebar-storage-unlimited.test.mjs` | PASS | targeted-pass.tap |
| `npm run check` | PASS | check.log |
| `npm run build` | PASS | build-production.log |
| `npm run build:dev` | PASS | build-development.log |
| `npm run verify` | PASS | verify.log |
| `npm run pack` | PASS | pack.log |
| `npm run build:market-site` | PASS | market-site.log |
| `CHROME_BIN=可信 CFT OPENDESK_NATIVE_HEADED=1 node --test --test-concurrency=1 tests/framework/app-market-r3-native.test.mjs` | PASS | mac-accepted/native-result.json |
| `OPENDESK_BUILD_EVIDENCE_DIR=独立证据目录/builds npm test` | PASS | npm-test-final.tap |

完整 Node 的两个 SKIP：bare renderer/CDP 对照缺少 `CHROME_FOR_TESTING_BIN` 选择；Node-free Native Host CLI 模拟 Chrome 场景缺少 `OPENDESK_BROWSER_BINARY`。同一完整 Node 日志另有真实 Mac packaged extension、可信 Options 点击、Native CLI 握手与撤权 **PASS**，CFT 同为 155；它仍不等于完整框架 F3。

实际截图：`mac-accepted/market-catalog-200-percent.png`、`mac-accepted/market-catalog-320.png`、`mac-accepted/market-catalog-360.png`、`mac-accepted/market-catalog-400.png`、`mac-accepted/market-detail-knowledge-inbox.png`、`mac-accepted/market-detail-markdown-workbench.png`、`mac-accepted/market-detail-quick-notes.png`、`mac-accepted/market-detail-reading-toc.png`、`mac-accepted/market-detail-web-markdown-clipper.png`、`mac-accepted/market-my-apps.png`、`mac-accepted/r45-five-official-installed.png`、`mac-accepted/r45-fresh-optional.png`、`mac-accepted/r45-revoked-from-other-origin.png`、`mac-accepted/r45-uninstalled-after-restart.png`、`mac-accepted/side-panel-keyboard-focus.png`、`mac-accepted/side-panel-tools-320.png`、`mac-accepted/side-panel-tools-360.png`、`mac-accepted/side-panel-tools-400.png`。全部实际文件、SHA 和字节在 `evidence-manifest.json`，不存在的名称不能作为证据。失败候选目录和旧 CI ZIP 未删除。

## 打开方式与剩余交付

在专用 Chrome for Testing 中打开 `chrome://extensions`，启用开发者模式，加载本仓库 `dist/production`；点击 OpenDesk 图标进入正式 Side Panel，选择“工具”→“应用市场”。也可在该受控浏览器打开 `chrome-extension://efhcmggbgamacpfhhmooelgdkepdcghh/ui/marketplace.html`。当前 ID 与路径绑定，不保证其他机器相同。手工网页统一入口为既有 `http://127.0.0.1:43111/demo-form.html`，服务启动方式见 `examples/tasks/README.zh-CN.md`；本轮未占用或关闭其他任务的现有服务。

本地重跑采用上述 CFT 二进制、独立 evidence/profile 和动态端口，命令见机器报告与现有驱动。静态市场构建目录是 `delivery-candidate/market-site/`，无正式 HTTPS 域名/稳定 ID，外部安装入口 **BLOCKED**；未新增 onMessageExternal 或远程脚本执行桥。

剩余最少工作：在获授权的远端集成窗口推送正常 main 并核对新 CI；补 Chrome 在途刷新、批次失败/取消、回执丢失和异常中断恢复；执行独立完整 F3 与正式 ZIP 安装。当前预算仍提示 SW 325487 / 327680 B、余 2193 B，以及 tool-shell 超软预算。没有为消除这些风险擅自重构其他功能。
