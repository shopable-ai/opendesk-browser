# R18 / R16 正式实现差异与验收

2026-11-09；起始 HEAD `353cf6eb362aa2c8f4f0e7d73726dd8322f21931`，main；origin/main 起始 `5195c9ef4`（fetch 后另核）。本轮目标是既有 AI Proxy 的正式业务对齐、最小补齐和可追溯验证，不重做预览或另建扩展。唯一交互参考 `../preview/preview.html`。此文件先于运行代码修改建立；后续证据追加在本文。

## 事实与复用

现有包及配置 0.3.9；项目内起始无 dirty。复用 Single App 双 Surface、固定自身 PC 页、同一 Service / `ai-proxy.full-config.v2`、七区、四模式、ETag/ifMatch、草稿基线、unknown、STOP 及安装代际保护。历史 c1a95457b 的 398 项和 Chromium 记录只作为已完成事实，不冒充本轮候选 PASS。项目业务 owner 为 `projects/ai-proxy/`，可信 Surface 亦从同一业务树静态编译；动态 JSON 不更新 Browser 固定代码。

公共打包器、Host、tool-shell、公共文档及其他项目存在并行改动；仅只读核查，不覆盖、不纳入本轮提交。不新建分支/worktree/Root/Host/Service/存储。日常 dist/development 和 Profile 不改；专项代理验收沿原隔离 Chromium 合同，普通页面用 ego。

## 差异矩阵（初审，先映射后实现）

输入输出和持久化：C=`ai-proxy.full-config.v2`（原 CAS）；U=`uiLocale`（原受管 storage）；H=原 browser.proxy.managed Host。DONE 须有本轮充分证据，当前未实测的既有实现先记 NOT_TESTED。每个 F-ID 在本文保持稳定。

| Feature ID | 预览入口/状态 | 正式代码 | 用户动作 | 数据契约 | 预期行为 | 初审状态 | 证据 | 负责人/改动范围 | 本轮操作 |
|---|---|---|---|---|---|---|---|---|---|
| F01 | 顶部快捷动作 | src/App.jsx Workspace; environment.ts toolNavigation | 点击/Enter | headerActions 完整快照；不授权 | 原导航动作、旧 Host fallback | PARTIAL | 固定四项已存在 | 项目；公共导航只读 | 复用并增加用户配置 |
| F02 | 常用动作选择/顺序 | 当前无配置 UI/持久化 | 选择、调整、保存、重开 | 原 storage，限定动作 ID | 保存可回读；不执行脚本 | MISSING | App 固定数组，无用户配置 | 项目 | 最小补齐 |
| F03 | 四模式 | QuickPanel.tsx modes/useMode; service SELECT | 选择 | C.selection | 仅保存，不应用 | NOT_TESTED | 现有 SELECT 实现 | 项目 | 定向复验 |
| F04 | 运行摘要、待应用 | ui/Status.tsx; service view/routeSignature | 读状态/刷新 | H + activeSelection | 已选与实际运行分开 | NOT_TESTED | 现有 Host 确认逻辑 | 项目 | 定向复验 |
| F05 | 我的代理列表 | QuickPanel orderedProfiles/visibleProfiles | 选择 A/B | C profiles/endpoints | A运行选B保留A运行，不虚报 | NOT_TESTED | activeSelection 独立 | 项目 | 复验与视觉对齐 |
| F06 | 添加代理/空态 | QuickPanel beginAdd/saveProxy | 输入/保存 | SAVE_ENDPOINT 原子创建+C | 校验、保存选择、不启用 | NOT_TESTED | 原 Service/表单 | 项目 | 复验 |
| F07 | 明确申请/切换 | QuickPanel apply; service APPLY | 主动申请 | H 审阅/STOP→Enable | 精确旧线路释放后重新审阅 | NOT_TESTED | 原 validateApply/STOP | 项目 | 隔离验证 |
| F08 | 停止 | service STOP | 主动停止 | H release + C.managed | 独立释放，回读system | NOT_TESTED | stopFinalizationPending | 项目 | 隔离验证 |
| F09 | 错误/无权限/未知 | Status/useProxy/environment | 失败/刷新/拒绝 | runtime.outcomeUnknown | 不自动重放，保留真实状态 | NOT_TESTED | 原 unknown 锁 | 项目 | 定向回归 |
| F10 | 当前网站规则 | QuickPanel beginSiteRule/saveSiteRule | 新增/编辑 | C.rules; currentPage.info | 域名规范化，保存不应用 | NOT_TESTED | 原规则表单与 Service | 项目 | 复验 |
| F11 | 管理全部/规则 | QuickPanel openOptions | 点击图标 | openOwnPage settings/section | 原应用固定可信 PC 栏目 | PARTIAL | 现为文字入口，预览为图标 | 项目 | 最小图标对齐 |
| F12 | 订阅/诊断底部 | QuickPanel r86Bottom | 主界面展示 | 无数据副作用 | 不重复常驻 | PARTIAL | 正式代码仍有两按钮 | 项目 | 移除，保留管理栏目入口 |
| F13 | 草稿/取消/焦点 | App Confirmation; environment draftBases | 离开/取消/保存 | 实例内 draft revision | 保留草稿，旧回执不清新输入 | NOT_TESTED | 原 guard | 项目 | 定向回归 |
| F14 | busy/重复点击 | useProxy; environment pending | 连续操作/导航 | 原 pending/unknown | 不重复副作用 | NOT_TESTED | 既有防重入 | 项目 | 定向回归 |
| F15 | 双 Surface 身份 | main.jsx; trusted/Surface.jsx; environment | 侧栏打开PC | 同安装ID/原storage | 独立路由/草稿，提交数据可回读 | NOT_TESTED | 0.3.9历史证据 | 项目/原公共框架 | 复用/复验 |
| F16 | profiles | Settings saveProxy/delete; service | CRUD | C + draft ifMatch | 校验、回读、旧ETag拒绝 | NOT_TESTED | 原原子创建/CAS | 项目 | 定向回归 |
| F17 | 认证输入 | Settings credentials; service | 保存凭据 | 未接入 | 明确拒绝，不假成功 | NOT_TESTED | E_NOT_CONNECTED | 项目 | 复验拒绝 |
| F18 | rules | Settings saveRule/default; config.ruleFrom | CRUD/默认规则 | C.rules/defaultTarget | 域名/子域/优先级/引用有效 | NOT_TESTED | 既有规则实现 | 项目 | 定向复验 |
| F19 | subscriptions | ui/SourcesPage/SubscriptionReader; service | 本地管理 | C.sources | 本地保存；联网限制明确 | NOT_TESTED | download E_NOT_CONNECTED | 项目 | 复验 |
| F20 | 导入备份 | Settings backupImport/exportConfig | 导入/导出 | IMPORT/EXPORT + validateConfig | 非法不覆盖，导出无凭据 | PARTIAL | 现名称与参考需核对 | 项目 | 文案及定向复验 |
| F21 | diagnostic | ui/DiagnosticsPage; service previewOnly | 诊断 | 原模拟快照 | 不冒称真实HTTP成功 | NOT_TESTED | E_NOT_CONNECTED/模拟标签 | 项目 | 保留边界/复验 |
| F22 | general | Settings general; LocaleProvider | 语言/重开 | U | 原storage读回，不更改代理 | NOT_TESTED | 原语言持久化 | 项目 | 复验；增加快捷配置 |
| F23 | official | OfficialServicePage/environment official | 打开服务 | configured:false | 未接入，不伪造账号/权益 | NOT_TESTED | 原明确未开放 | 项目 | 保留/复验 |
| F24 | PC 独立布局 | styles/management.css; Settings presentation | 七区导航/窄窗 | 原本地路由 | 左导航/内容独立、长表单可用 | NOT_TESTED | 原 R16 接线 | 项目 | 视觉复验 |
| F25 | 多PC冲突 | environment draftBases; service editConfig | 旧窗口保存 | C ETag/ifMatch | 冲突保留草稿，不丢更新 | NOT_TESTED | 历史053d01d已修 | 项目 | 原测试/受影响复验 |
| F26 | 生命周期 | environment dispose/原Host | 撤权/替换/关闭 | installEpoch+sender | 旧实例不得写回/重新接管 | NOT_TESTED | 原公共合同 | 项目/公共只读 | 定向回归 |
| F27 | App CI | app.ci.json（缺失） | inspect/build/node/browser | opendesk.app-ci.v1 | 真实非空浏览器profile并执行 | MISSING | 本轮文件不存在 | 项目 | 补配置与真实入口 |
| F28 | 唯一正式包 | tool.config/vite/原packer | 编译/晋升/更新 | 同ID/版本/源码哈希 | 同源、升级保留数据 | NOT_TESTED | 现0.3.9 | 项目/原packer只读 | 变更后升PATCH与验证 |
| F29 | 主题/三语/可访问性 | i18n/styles/ProxyIcon | 切语言/键盘/窄屏 | 原Tokens及语言 | tooltip/名称/焦点清晰 | NOT_TESTED | 现三语资源 | 项目 | 受影响视觉验证 |
| F30 | Browser与JSON关系 | trusted/source-lock + 原构建 | 实际打开 | 固定静态React与动态包分别验证 | 不以JSON代替Host升级 | NOT_TESTED | 原固定可信Surface | 项目构建来源 | 独立输出构建/核对 |

## 执行优先级

先复验 F03–F09/F25–F26，不重写既有状态机。补 F01/F02/F12/F27，做 F11/F20 的最小对齐。用户配置只从白名单选择排列已有导航动作，经原 storage CAS 保存；公共 API 已支持最多6项动作，不需要新增 Framework API。随后按 SOURCE/NODE/BUILD/CHROMIUM/PACKAGE 记录候选身份及 T01–T24，完成角色化审查，按真实结果提交/推送。

## 本轮验证与交付（待追加）

整体状态：执行中。尚未将任何历史 NOT_TESTED 转成 PASS。production、公网出口及未接入联网功能不伪报。

## 2026-11-09 用户纠偏与交接观察

用户最新要求优先确保真实扩展 UI 与主文件 `preview/preview.html` 一致，随后指出 PC 打开 `chrome-extension://…/sidepanel.html` 且携带 Browser 五 Tab 整壳，质疑严重漂移，并要求创建新对话继续完善。当前结论 **PARTIAL**，不再以 CI/评分替代这一产品问题。下一 owner 首先复现侧栏→设置/管理→PC，厘清紧凑侧栏内设置与独立 PC 的展示边界；PC 不能仅复制整个 Side Panel 工作台壳。R16 的七个业务栏目继续保留。URL scheme 本身正常，不能仅因扩展 URL 判错；壳结构与入口才是当前待修问题。

本轮源码：复用原 Service/Host/SDK/安装身份、四模式、七区、CAS/unknown/STOP；补白名单 Header 可见性/排序/CAS 保存/恢复重读及空列表设置入口，移除底部重复订阅/诊断，紧凑管理图标，PC 模式前移/图标/215px 菜单/列表卡片，R18 蓝底选中态/高级入口，订阅下载明确未接入；五处 DELETE 使用确认前视图 ifMatch。App/Settings/environment 等另有未知并行 owner 的异步确认修改，完整 diff 不能全部归本轮。

- 主预览未改，SHA-256 `3e43c52564b702830979b21994d35a3fc16ab6afa4700dcce2119f3a6910ea40`；不恢复旧 R18/R16 文件名为另一标准。
- 当前源码/唯一 JSON 0.3.11，经原打包器候选→299 项项目测试→晋升→check-project；JSON 961664 bytes，SHA-256 `3ec7be6a4fdfb2901e751bca564824dc2af53d294f4ba47a9a55e04fc9d91ec0`。未提交、未推送，尚非最终验收通过。
- Vite PASS；61 项 trusted source-lock 同源检查 PASS。独立普通源码快照 `/private/tmp/ai-proxy-r18-build-9tm5xsxg`（不是 worktree）在 committed public HEAD `44a9c6d31` 上覆盖本项目，静态 development Browser 构建 PASS，packageHash `80aca31a3cdc4da997bc353e17b41b23fadbc57b6097a33bc83612c6220c5275`。公共 dirty 不在该 Browser 候选，不代表最终并行整合通过。
- App CI inspect/build/browser 实际执行 PASS；浏览器是原真实组件/Host DOM、内存 Service fixture，8 组断言，不冒称真实安装或网络。App CI node 342 项：341 PASS / 1 FAIL；仅 `sidebar-tool-enable-r26.test.mjs` 的 Reading TOC `E_OFFICIAL_FIXTURE_PIN`，不放宽其断言。AI Proxy scoped PASS / repository CI BLOCKED；未有本次提交的远端 CI。
- 隔离 CFT155、扩展 ID `adhcbimagiihfpoghoedffengcackkpl`、专属 Profile `/private/tmp/ai-proxy-r18-ui-z5Kt20`：真实 Side Panel/PC 保存本地测试代理→侧栏重开读回；只保存未应用，原生仍 direct、controllable。原安装器真实审阅 0.3.10→0.3.11、权限不变、同数据字节保留；新版真实 SIDE_PANEL 回读成功、无 iframe、蓝底选中态/高级折叠可见。**.11 PC 最终外壳、跨 Surface Header 配置、真实代理申请/流量/STOP 未验**。
- 已知公共 P1：`src/ui/sidebar-tools.js::mountTool` 的 installed version 与 bundledPresentationFits 整包 gate 阻止旧 0.3.9 在新固定组件进入 trusted；实际观察落沙箱空白。阻止 trusted 的原因已定位，沙箱空白根因未确认。不能用伪造版本或削弱安装身份修复。公共文件正有未知并行 owner，未覆盖。
- 角色化独立审查发现并已补 Header 恢复同步与 DELETE CAS；最新审查因用户纠偏收束，PC 整壳、Header hook render/effect 生命周期风险待核。未给最终 ≥95 或无 P1 结论；同模型角色化审查不是外部专家。

原始证据在 `artifacts/ai-proxy/r18-r16-alignment/`：`reference-r18.png`、`reference-r16.png`、`installed-r16-profiles.png`、`installed-r16-layout-trial.png`（.10 临时 CSS）、`final-r18-saved.png`（.11 真实安装）、`handoff-runtime.json`、`project-node-final.tap`、`browser-build-final.log`、`app-ci-*-final.log`；App CI fixture 在 `artifacts/app-ci/ai-proxy/chrome/report.json`。暂存证据目录不是正式发布记录。

交接前已关闭本任务 headless CFT，保留 Profile 数据与快照；受控站点54378/代理54379已关闭，流量记录为空，本轮未启用代理。预览服务器43269已关闭。ego TaskSpace17已被用户接管，finish 返回 hard stop，未夺回控制/重试，接收方不得擅自接管。日常 dist/development、系统代理、个人 Profile、其他 watcher 未改。原对话 `01a1c075-dad4-7dd2-a35f-146101649504` goal 实读仍 active；创建新对话不等于暂停/迁移/完成，未操作其状态。交接后旧 owner 不重复编辑或验收已交出的资源。

## 2026-11-09 PC 公共壳修复与当前运行结果

当前阶段仍是核心开发。真实入口已跑通：专属 CFT 中的实际 SIDE_PANEL → 已安装 AI Proxy →「我的代理」右侧管理图标 → PC 管理页。先复现了 Browser Tab 栏、ToolHost 标题和业务框架三层叠加；临时样式验证有效后，将最小修正写入原 `src/ui/tool-shell.css` 与唯一 React 根 `src/ui/react/main.tsx`。

- PC 页隐藏 Browser Tab 栏并归零外围 gutter；仅固定 React 组件声明自身拥有页头时隐藏重复 ToolHost 标题。原 Host、权限/确认链和动态包 iframe 边界继续使用原实现，Side Panel 仍保留原工具头部。
- 七个业务栏目均真实点击切换成功，1054px PC 视口无横向溢出。PC 与侧栏分别输入不同未保存草稿，路由、输入和焦点未互相覆盖；关闭测试 PC 文档后，侧栏草稿仍保留。测试草稿未保存，本地配置前后逐字节一致，原受控代理 A 仍可回读。
- 本轮没有申请/停止代理或发送测试流量。重开测试 Chrome 后实际状态为 `mode: system`、`controllable_by_this_extension`；这是本轮实读，取代交接时的 direct 状态观察，不表示本轮修改过系统代理。
- 隔离静态 development 构建 PASS，packageHash `4950299c861207cdb460a5fc8fbf56bc94eac5f85d8a390cb5e4cc4e23b029fc`。输出仍为 `/private/tmp/ai-proxy-r18-build-9tm5xsxg/dist/development`，使用原专属 Profile 和扩展 ID。它基于交接快照加本轮公共壳修改，不包含当前 main 的其他并行 UI-confirm/Header 整合。
- 实际安装仍为 0.3.11，内容与快照唯一 JSON 完全相等，原 JSON SHA-256 不变。公共壳属于 Browser 固定代码，重新导入同一 JSON 不能更新它；日常 `dist/development`、watcher 和个人 Chrome 均未操作。
- 当前源码定向 Node 25/25 PASS，包含页头标记释放、Side Panel 保持原头部，以及 Header store 的 render/Effect/StrictMode/迟到读写隔离。Header 生命周期修正在当前源码，**不在上述已安装 .11 候选中**；未据此宣称新的业务包或整合 Browser 通过。

最终实际截图：`artifacts/ai-proxy/r18-r16-alignment/final-shell-r16.png`、`final-shell-r18.png`；实读回执 `pc-shell-runtime.json`。唯一主预览 SHA-256 仍为 `3e43c52564b702830979b21994d35a3fc16ab6afa4700dcce2119f3a6910ea40`，未修改。专属 CFT 保留干净 PC 页供查看；关闭其标签页可回到原侧栏。

独立延期事项：旧/本地包的固定 UI 展示版本/整包 gate 仍为 P1；移除它须同时保留用户原包界面选择，不能按相同 ID 静默替换自定义 UI。并行合并后的 Header 存在 `ai-proxy.header-actions.v1` 与 `full-config.v2.headerActions` 两套草稿/存储入口，当前 App 优先前者；本轮未迁移或删改另一 owner 的数据。正式候选整合、这两项 P1、代理流量、production 和评分均不在本次壳验证 PASS 范围内。

## 2026-11-09 合并后 Header 收敛与 0.3.12 实装

用户确认可以直接完善后，继续处理已合并代码的 Header 遮蔽。PC 壳已独立提交 `0996d9d3a`；以下结果更新上一节 Header 延期及“源码未入安装候选”的状态，不扩大为生产验收。

Header 编辑器现在只使用一个 App-owned 草稿 store，读写原 Service 的 `ai-proxy.full-config.v2.headerActions`，保存携带已接受读取的 `configEtag/ifMatch`。新字段缺失时，只读回退旧 `ai-proxy.header-actions.v1`；没有自动迁移写入或删除。原四项默认值及可选“官方网络”保留，校验复用 domain 单一白名单；删除了第二份即时保存编辑器、备用订阅和无消费者样式。render 不注册监听；StrictMode 重挂、迟到回执、dirty、冲突和 unknown 保护继续生效。

- 先复现新字段被旧 store 忽略，再修正。相关 Header、Service、导航、配置、环境、设置、QuickPanel 和准入检查共 **212/212 PASS**；不是根全量 CI。定向源码复核未发现本次 Header 路径的 P0/P1，未评分。
- 项目 Vite PASS；固定源码 lock 审核与校验 PASS。原打包器候选→定向门禁→晋升→`PROJECT_PACKAGE_MATCH` 完成。唯一正式包 **0.3.12 / 964650 bytes**，SHA-256 `32c6d9a6f0b41eb18bad302a2d2b079707fd5d05a38faa2c76e1ed2e7b88acb1`，原三项权限未变。
- 相同专属 Profile、扩展 ID 和隔离输出，Browser 静态 development 构建 PASS，packageHash `ef84e9d5b8c51e4aac38429b7eede9f210ce576e0a9a8170fbc3fbd53db7babf`。候选包含当前完整 AI Proxy .12 源码及公共壳修正，仍不包含当前 main 的其他并行框架改动。
- 通过扩展中心原「审阅新版」链真实更新 **.11→.12**，原应用数据完全保留，实际安装内容与唯一正式 JSON 完全相等。PC 保存“管理设置→添加代理→官方网络”，重开侧栏读回相同顺序；重新加载 PC 后也读回相同配置。随后经 UI 保存恢复默认四项，其余配置与更新前一致。
- .12 真实 PC 仍只有一个业务框架、七个栏目，1054px 视口无横向溢出；Side Panel 保留原紧凑工具头。实际代理保持 `system / controllable_by_this_extension`，没有调用 Enable/Disable 或进行网络测试。

最新证据：`header-0.3.12-runtime.json`、`upgrade-0.3.12-review.png`、`header-0.3.12-saved.png`、`header-0.3.12-sidebar-readback.png`、`final-0.3.12-r16.png`、`final-0.3.12-r18.png`（均在原 artifacts 目录）。主预览仍未改。日常 Chrome、原 watcher、根 `dist/development` 及 Native 配对未动；只导入 JSON 不能更新 Browser 固定壳。专属可见 CFT 留在干净候选供查看。

仍延期：旧/本地包的固定 UI 展示 gate、当前并行框架整合、production、代理流量和独立评分；不将 .12 开发候选视为这些项目已通过。
