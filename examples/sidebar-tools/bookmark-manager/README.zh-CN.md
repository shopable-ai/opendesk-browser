# Bookmark Manager · 正式 React 与 Classic 兼容工具

## R2.2 共享 Header 当前页短标题（2026-10-26，现行覆盖历史 R2.1）

共享 Browser Host 正式代码修正了双 flex span 将「书签管理 / 设置」拉出大段空白的问题。**当前可见**：根页「书签管理」、可信设置「设置」、新建书签/文件夹 Sheet「新建」、编辑书签/文件夹 Sheet「编辑」；完整「书签管理 / 编辑书签」等原业务标题保留在悬浮提示与 ARIA。可信设置内部冗余「工具设置」H2 已去除，原返回、草稿确认、保存中拦截不变。此变更只涉及 Browser Host，**没有修改书签 React 业务源码、0.3.12 JSON 包或权限**；需要在 Chrome 更新包含新 Host 的 Browser 才生效。下文 R2.1「父/子同时可见」及 R2 设置全路径均属历史描述，而非现行规范。本次真实 Mac 安装效果尚未验证：`NOT_TESTED`。

## 0.3.12 安装包同步（2026-10-26）

当前源码样式已领先于 `0.3.11` 正式 JSON；通过既有 `app:update` 流程升至 **0.3.12**，候选测试后晋升目录内唯一正式包，并同步既有 React 准入版本锁。权限保持 `browser.bookmarks.full`、`currentPage.read`，包 SHA-256 为 `06972e1420b0c43d8d0474fb91540bd5a405b96599861dabfb741587ee458383`。包及 React 来源定向检查共 13 项通过，`--check-project` 确认同源；现有开发 watcher 已同步 `dist/development` 官方市场资源，包字节一致，未另启构建或替换 Profile。

日常 Chrome 现场打开的仍是 Classic 兼容界面；**本轮 Chrome 安装更新未完成**。浏览器工具拒绝访问扩展协议页面后停止自动安装，未绕过策略。请在 OpenDesk 官方应用市场打开「书签管理」，审阅并确认 `0.3.12` 更新；不要先卸载。更新后版本、正式 React 界面和书签读取仍须确认，当前不能宣称安装成功。检查记录见[本次包同步记录](evidence/local-update-20261026.json)。下文均为历史版本证据。
## R2.1 正式 React 业务子页与长标题（2026-10-26）

**已修改实际业务代码**：`src/react/App.jsx` 使用新建的 `src/react/navigation.js`，将真实的新建/编辑书签或文件夹 Sheet 注册为宿主可返回的业务子视图，标题显示「书签管理 / 新建书签」「书签管理 / 编辑书签」等。共享顶部返回会调用原本的 `requestCloseSheet()`：正在保存时不能返回，草稿已修改或写入结果未知时显示原有确认；编辑输入用 `draftRef.current` 同步记录，避免快速输入后立即返回时读到旧草稿；保存/关闭后回到「书签管理」。仅选择书签而出现的详情 PreviewPane、弹出菜单、文件夹选择与确认框**不**注册宿主子页。可信「设置」优先显示「书签管理 / 设置」，关闭设置仍回到当前编辑 Sheet，不擅自放弃草稿。

标题采用原 `src/ui/react/tabs/tool-host.tsx` 标题位，`src/ui/tool-shell.css` 的 `flex:1 1 0; min-width:0` 自动使用两侧按钮之间的剩余空间，父扩展名与当前页名分段渲染；父名称先省略，标题可用宽度 ≤100px 时仅显示子页名称，右侧固定按钮不被压缩。只有极窄面板/200% 放大沿用既有 Header 自然换行；无新 Nav/面包屑栏。完整路径仍保留在标题的实际文本、ARIA 与悬浮提示中。

**真实发行边界（R2.1 实施时）**：可信 React 业务源不是 `bookmark-manager.opendesk-tool.json` 动态沙箱 JS。此改动经原 `scripts/bundle-provenance.mjs` 的受审 Git Blob 锁批准并由 Browser 固定 React 入口编译，该轮不改变原工具 ID、`0.3.11` JSON、书签权限、SDK、Host 写入操作或 Chrome 书签数据；当前 `0.3.12` 包同步状态见上文。旧版/非官方同 ID 包仍走原隔离沙箱，不接收可信页面回调。本轮仅执行源文件与回归合同核对，**Node 构建、同源码 Chromium/原生 Chrome 视觉与读写测试仍为 `NOT_TESTED`**；不得因源码提交而声称全部 95+ 验收通过。

定向检查入口：`tests/environment/bookmark-manager-title-navigation-r1.test.mjs`、`sidebar-tool-header-title-r2.test.mjs`、`sidebar-tool-hierarchical-back-r12.test.mjs`，以及既有 `bookmark-manager-r32-formal-source.test.mjs` 的来源锁校验。

## 书签管理设置页标题与返回（2026-10-26）

该轮实施时正式工具配置为 `0.3.11`，当前包同步状态见上文。从书签管理右上角进入可信“设置”页时，宿主应在原有顶部一行显示 **「书签管理 / 设置」**；返回后恢复「书签管理」和先前的书签工作区，保留未保存草稿与现有权限。根页只显示应用名，不再增加 Nav。**上一轮的历史状态**是所有 Sheet 仅保留内部标题，不改宿主返回栈；上方 R2.1 已把真实新建/编辑 Sheet 纳入可返回层级，详情 PreviewPane 仍不是。

上一轮仅修复可信设置标题，该问题的 owner 是公共 `src/ui/sidebar-tools.js` 的 Host 标题投影，新增纯文本 `src/ui/sidebar-tools/title-path.js`；不是 Bookmark CRUD、SDK 或 React Service 缺陷。**该历史阶段未改书签业务代码；上方 R2.1 已接入可信 React 编辑子页。** 本轮及上一轮均未修改 `tool.config.json`、正式 JSON 包或能力声明，绝不以相同版本重打安装包。 需要 Browser 包含更新后的 Host 才能生效；未执行本地 Chrome 操作前均标记 `NOT_TESTED`。后续依照[导航合同 R2](../../../docs/architecture/sidebar-tool-navigation-contract-r1.zh-CN.md)与[产品 UI 规范](../../../docs/product/sidebar-ui-spec.zh-CN.md)维护，业务层若真的新增全页子视图须同步标题与真实返回事件。


## 0.3.11 重装后列表与正式界面恢复（2026-10-24）

书签管理是官方目录中的 **optional 可选应用**，不是默认预装。本次现场已安装最新 `0.3.11`，包 SHA 正确但来源未记录，因此进入 Classic 兼容界面。市场现提供「审阅官方来源 → 确认官方来源」：仅在完整包与固定官方发行一致时，通过原安装器补回来源；保留包、安装代际、数据及已有授权，同版本不同内容和降级仍拒绝。包字节及版本未改变。

另修复公共工作流 UI 快照误包含控件 Proxy、抛出 `DataCloneError`，导致侧栏启动中断、扩展列表停在“正在读取扩展…”的问题。复用现有 `dist/development` watcher，真实 Chrome 已恢复 11 项扩展、正式 React 书签树、刷新、设置往返和返回重开；原书签授权保持有效。来源原先为何缺失尚未确认，本轮未再卸载或修改真实书签。定向快照/来源审阅 11 项及精确可信准入 1 项通过；既有工作流静态断言误匹配 `workflowSession.append()` 的失败保留，未扩大修复。详细身份、操作与未验证项见[恢复记录](evidence/list-recovery-20261024.json)。

## 0.3.11 本地更新与安装测试（2026-10-24）

已通过现有官方市场将日常 Chrome 中的 `0.3.10` 更新为 `0.3.11`，详情读回版本、官方来源与 SHA-256 `86cc68f413ab421ec7895b4faecb061d81b005f4b363efdd72e6a8e833cdb4cf` 一致。唯一正式 JSON 已通过候选构建、定向检查、晋升和 `--check-project`；本次包差异为当前样式与 PATCH 版本，能力不变。同步静态 React 准入版本锁，仍校验完整包、官方来源和安装代际。

本轮实际环境为现有 `npm run dev` 的 `dist/development`，开发客户端已连接；未进行 production 验收。原安装来源未记录，打开的是兼容沙箱；本次经官方来源更新后进入正式 React。更新版本按原设置界面重新批准同范围 Full Bookmarks，随后从日常侧栏再次打开无需重复授权。真实书签树读取、搜索、文件夹新建表单取消、重新打开与 AI 对话面板开合均通过；未发送模型请求，未保存或删除真实书签。

书签与准入定向检查通过。额外全目录检查的三项失败涉及 Stay Focus 生成包漂移及 Catalog 旧 Schema 断言，保留失败记录，未扩大修复。实际 CRUD 写入、模型执行和完整生产验收仍为 `NOT_TESTED`。本轮身份、操作和检查范围见[安装测试记录](evidence/local-install-20261024.json)。下文均为历史候选记录。

## R3.5.1-LOCAL 本地修复验证（2026-10-20）

**原生 200% 工具栏溢出已修复，本地核心验证通过；六维平均 92.5，未达到每项及平均 95，未宣称完整正式验收或发布通过。** 保持 `0.3.8` 和已有 React Root、Model、Service、SDK、Host、共享 Button/IconButton 与 44px 虚拟行。

- 本次修复：360px 面板原生 200% 后实际为 180px，工具栏改为自然换行，四个按钮完整可命中，未隐藏操作或缩小触屏目标。保留先前 44px 搜索定位、保存样式、动态断点焦点、深色对比和文件夹原生按钮语义修复。
- 正式 React JS **219,665 / 220,000 B**，CSS **19,082 B**。production `tool-shell.js` **1,048,041 / 1,048,576 B**，静态 development **1,048,447 B**（余 129 B）；预算和来源锁均未放宽。正式 JSON 字节未变，`--check-project` 通过；未晋升临时 React 预览包。
- `check` 检查 937 个文件；128 项源码专项和 2 项新候选构建来源校验通过。正式 App/CSS 的 Mock Host Chromium 覆盖原 320/360/400/440/960px、15 项深色/粗指针/CSS 放大场景，另补 180px 普通/粗指针工具栏；共享按钮、SVG、44px 虚拟滚动、焦点与键盘无已知回归。Mock 与 CSS 放大不代替原生证据。
- 同一隔离 Mac CFT 新候选 `2224969b…` 已验证真实 CRUD、移动、搜索/折叠、危险删除一次可信确认、关闭重开、Authority 撤权/再授权、0.3.7→0.3.8 升级保留书签、第三方沙箱、真实 lost-ack 禁重放及 Chrome 重启读回。普通保存无第二次确认。原生 per-origin 200%（DPR 4、180×407）保存、直接取消、脏草稿关闭后继续编辑/放弃均通过；测试后恢复 DPR 2 并关闭自有探针 Tab。
- “取消”按现有合同直接放弃，右上关闭脏草稿才确认。旧驱动等待取消确认，以及滚动后把离屏顶部计为裁切，已与真实横溢出区分；原始 FAIL 和新 PASS 均保留。更新时 `runtime.reload()` 未重建 worker，已同 Profile 重启恢复并核验数据；失败过程未改成 PASS。
- 六维独立评分：UX **93**、React/CSS **93**、无障碍与触屏 **92**、安全 **96**、测试与原生 **93**、可维护性 **88**；合计 **555**，平均 **92.5**。删除确认目标文案及既有维护性 P2 留后续，未为评分扩大重构。VoiceOver、物理触摸/软键盘、长期人类使用、未知写入完整显式恢复链、Chrome optional permission 实际移除仍为 `NOT_TESTED`。
- 运行模式是隔离 **STATIC_DEVELOPMENT**、`watcherConnected=false`，production 仅作编译证据；未覆盖日常 `dist/development` 或接触个人 Chrome。候选冻结后其他 main 工作不属于该候选验证。修复提交为 `6d69e619c`，证据提交为 `486b8c9fd`；双方提交已通过普通合并 `dd3806fee` 保留，本次合并与推送已获明确授权。最终推送 SHA 及其 CI 结果见交付答复和账本指向的原始 API 收据；旧 CI 不代表新提交 CI。

候选身份、原始收据、历史失败、独立评分与同步状态见[本轮唯一验证账本](evidence/r351-local-20261020/summary.json)。下文 R3.4 及更早内容均为各自历史候选，不覆盖本轮状态。

## R3.4 当前验证（2026-10-20）

**当前状态：本地 Mac 原生 A–H 核心流程通过；`BOOKMARK_MANAGER_RELEASE_BLOCKED`，尚未宣称十维 95+ 或正式发布。** 下文 R2/R3 历史 `NATIVE_NOT_TESTED` 仅描述当时状态。

- 官方 `0.3.8` 正常安装并独立授权后默认进入正式 React；沿用唯一 React Root、`BookmarkR2Model/Service` 与原 Browser SDK/Host。旧版及非官方身份包保留原沙箱路径。
- 本轮修复：撤权/关闭后的迟到回程、未知写入重试保护、事件缺口快照恢复、收藏当前页的迟到填充与目录选择，以及 React 工具视图漏转发卸载方法造成的真实运行阻断。保存期间禁重复提交，删除保留一次 Host 审批及递归删除票据。
- 同一生产候选在隔离 **Mac Chrome for Testing 155** 完成原生 CRUD、搜索及 3,000+ 书签规模、跨窗口原生界面修改、事件溢出、授权撤销/恢复、停用/恢复、正常卸载、历史 `0.3.7` Classic 导入后官方升级 `0.3.8`、侧栏关闭重开和 Chrome 重启。未操作个人 Chrome Profile。
- 补测并修复移动成功、后续更新取消时未明确提示部分写入的问题；实际终止已完成原生创建但尚未回执的 Worker 后，确认未知结果保留草稿、禁重试，Enter 不产生第二条书签。两项恢复均由用户显式刷新核对。
- 正常打开工具标签页完成 360/400/960、浅深色、实际浏览器 200% 缩放及键盘/ARIA 定向检查；CI 预览的 55 项 Chromium 检查明确使用 Mock Host，不能替代上述原生证据。
- 正式包保持 `0.3.8`，SHA-256 `0d018dc9fdf46fe8380e25cf0089de7ee746ede63b832b9fa9a53047b32d9c76`。同一打包器逐字节晋升目录唯一 JSON，与生产 Catalog 一致；沙箱包字节及能力未变，未仅修改版本号。
- [候选身份、A–H 原始结果与剩余发布条件](../../../docs/framework/evidence/bookmark-manager-r34-20261020/summary.json)。未知写入及部分写入恢复的定向回调测试与真实原生故障注入分别记账；十维评分无充分证据时保持 `NOT_SCORED`。


> **R2.8 历史状态：SOURCE_MIGRATED / OFFICIAL_OPTIONAL_REGISTERED / NATIVE_NOT_TESTED。** 已纳入官方源码目录，不代表用户设备已安装，也不代表 Chrome 原生验收通过。

本项目 `examples/sidebar-tools/bookmark-manager/` 是唯一独立书签工具业务源码：`tool.config.json`、`src/index.html`、`src/style.css`、`src/model.js`、`src/service.js`、`src/main.js`。继续使用官方 Sidebar Tool v2 打包器、Opaque Origin iframe 和 `OpenDeskSDK.browser.bookmarks.*`；没有私有 Host、第二套 SDK 或直接 `chrome.*` 调用。


## 需求与预览归档入口（2026-10-15）

- **[正式产品与交互需求](REQUIREMENTS.zh-CN.md)**：记录书签树、只读选择、显式编辑、脏草稿保护、权限和安全删除，以及后续改进的验收边界。
- **[当前 R3.0.5 React 离线预览](preview/index.html)**：由独立候选通过 Chromium 回归后自动晋升；仍使用 Mock，不代表 R3.1 正式 UI 替换或原生安装。
- R2.8 历史候选初始 SHA-256 为 `16792a707abfba8b1d6564fa0ad7b671e59aea4e3679594fd5c4bc259e8765b2`，只在 Git 历史中保留；当前 `preview/index.html` 不再是该旧快照。正式 UI 仍由 `src/` 和 `tool.config.json` 决定。
- 下一轮视觉优化先对照这个保存版本提出新候选并征得确认，不得误删、迁移到非扩展目录或无理由覆盖归档版本；所有评审、版本和来源都记录在 `REQUIREMENTS.zh-CN.md` 中。

## 当前 R11.2 合同与安装状态

2026-10-15 的 R11.2 提交 `b63c9e3c` 为正式 Registry、Schema、Host、独立 `browser.bookmarks.full` 和安装工具的可信书签授权按钮完成了**源码接线**。独立 Full 与 Owned 的 `browser.bookmarks.createOwned/removeOwned` 是不同权限；Chrome manifest 已声明 optional `bookmarks`，安装工具的声明并不等于用户已批准 Full 或 Chrome 权限。

- 当前工具版本 **0.3.8**（R2.8 待原生验收）：`capabilities: ["browser.bookmarks.full", "currentPage.read"]`。安装包更新需按现有流程重新审阅；Full Bookmarks 授权和 Chrome optional 权限仍独立申请。
- **已在 `official-tools/catalog.json` 正式登记为 optional**。发行构建器必须生成签名固定的本地官方资源，用户通过「扩展」中心审阅、安装、授权、打开。源码登记不等于在用户 Chrome 中安装；Node/CI 成功也不是 Native PASS。
- 不满足 Full Capability 状态、Host 权限、包身份或可信回执时，客户端失败关闭并隐藏已失权树；新增识别 `E_BOOKMARK_FULL_CONSENT_REQUIRED` / `E_TOOL_CHANGED` / `E_OWNER` 并在写入失败时清屏，不会回退至 Owned 能力伪造全量结果。
- **已删除旧 `src/bookmark-manager/` 及内置书签面板与专属 R1 CI**。业务消费者仅存在于独立工具，公共 SDK / Host / Chrome Drivers 仍保留；Git 历史保存旧实现，不创建兼容副本。

## 消费端功能

| 需求 | 正式 SDK 方法 / 消费端边界 |
| --- | --- |
| 全量树、搜索与读取 | `getTree({limit:100,cursor?})` 按单一 `snapshotRef` 分页；Host 同时限制每页 100 节点/10.5 KB，可能返回更少节点；`get({id})`、`search({query})` 属于独立 Full 能力 |
| 新建/更新/移动/删除 | `create`、`update`、`move`、`remove`；读取预期节点快照并由 Host 复验 |
| 非空目录递归删除 | `prepareRemoveTree({id,snapshotRef,expected,descendantCount})` → 一次性短期 `ticket` → `removeTree({id,ticket})`；并发子树变化由 Host 拒绝 |
| 跨窗口变动 | `observe.start/read/stop` 有界事件；缺 `gapCount/droppedCount`、丢失事件或 Worker 会话失效时重新读取完整树 |
| 500+ 条书签 | 分页最多 20,000 节点；客户端完整投影和搜索，不把首屏 200 条显示上限当成搜索范围 |
| 当前网页收藏 | 公开 `browser.page.getContext()` 返回当前文档的 Host-issued 不透明 `tabRef/documentRef`，`create({sourcePage})` 在原生写入前复核活动 Tab / Document / URL / 工具与授权；Native 尚待实测 |

业务状态保存在浏览器原生书签中；工具卸载不删除 Chrome 原始书签。界面保留单树、搜索、文件夹、紧凑编辑与确认，不创建第二套 UI。

0.3.1 修复刷新与写入生命周期：先订阅再读取分页快照，读取期间的变更触发后续全量同步；
编辑或移动期间刷新保留原始已审阅节点，外部修改不会被新的快照静默批准覆盖。
Host 快照池仍最多 8 份，达到上限时仅回收同一安装身份的最旧快照；旧游标明确返回
`E_SNAPSHOT_EXPIRED`，重新刷新即可，不跨工具回收。写入前再次检查撤权代际、已观察到的
书签变更及删除票据期限。Chrome 没有原子的 compare-and-swap；未被监听器观察到的最终
读写间竞态仍存在，不能宣称绝对并发原子安全，真实时长尚未测量。

0.3.2 补齐观察恢复：启动或读取事件发生可重试的传输故障、会话过期或事件缺口后，
每隔 7 秒最多自动重试 3 次，只重新观察和读取快照，不重放写入。成功读取事件或用户
手动刷新后重置预算；权限或真实点击被拒绝时不自动重试。刷新及 pagehide 使旧 epoch 的
回调失效，关闭后不再展示晚到快照；授权门禁清除列表、菜单及表单中的私有内容。
后续真实 CFT 已安装 0.3.2，导入专用 2151 URL 时暴露首次全树读取的 `E_TOOL`
请求频率错误；保留该候选和失败原始证据，不将旧版本结果登记为 0.3.3 通过。

0.3.3 收敛上述 RPC 预算：加载仅首尾核验完整能力，中间页和每次事件读取直接走公开
SDK，由 Host 逐次鉴权。会话临近到期时先新建、排空旧会话（最多两页共 100 事件）、
停止旧会话，再立即读取新会话；无事件不重读全树，有事件、过期或 gap 仍同步完整快照。
交接中的撤权、关闭、草稿及未知写入保护保留。2159 节点/一分钟 RPC 预算与轮换回归是
Node VM 证据。后续真实 Native 已通过市场正式升级 0.3.3，授权复核后成功显示 2159 节点；
新建文件夹保存被隐藏 URL 输入的原生校验拦截，其他 CRUD 尚待该阻塞解除后验证。

0.3.4 仅修复该表单阻塞：新建/编辑文件夹、移动及详情中的 URL 输入不参与校验，
只有可见的网址编辑保留 `type=url` 原生校验及 SDK 的 URL 检查。写入结束解除 busy
不重新启用隐藏 URL。Node VM 覆盖上述模式与失败后恢复；0.3.4 真机 CRUD 仍为 NOT_TESTED。

0.3.5 R2.5 保存确认补充：SDK 写入调用解析成功**不会**立即显示“保存成功”。客户端重新通过 Full SDK 获取原生书签树，按原生节点 ID 与名称/URL/位置/删除结果核实；没有核实则继续保留草稿、显示未确认状态并阻止重复危险提交。未知写入结果也必须退出本次编辑、重新查看原生书签后才能决定下一次操作。该只读复核不是原子 CAS，也不是 Native 真实设备通过证据。

0.3.5 R2.5 源码候选：在既有独立工具页面新增树与选中详情的主从信息视图，`od-*` 正式设计语义样式来自构建期 canonical Token 和组件 CSS；表单不再让隐藏字段触发原生校验，校验失败显示可见错误；异步刷新时继续捕获输入草稿。危险删除确认绑定最初审阅的节点及子树签名，外部变化拒绝继续。0.3.5 仍需独立真实 Chrome 安装、写入/刷新及多设备验证，不能将源码修改标为 Native PASS。新增 `scripts/preview/bookmark-manager-mock.js`，生产包同源的 `scripts/preview/build-preview.mjs --tool bookmark-manager` 以纯内存数据展示，不拥有真实书签能力。该预览只验证设计/组件与离线事件，不代表实际安装权限。

现有公共合同限制：节点最多 20,000、深度 100、快照 8 MB、读取标题最多 256 字符、
既有 URL 最多 4,096 字符。既有非 HTTP(S) 书签可保留读取，新增 URL 仍只允许 HTTP(S)。
超出合同明确报错，不截断数据；任意长度历史书签兼容仍是后续合同扩展缺口。

## 构建与验收

```sh
node --test tests/environment/bookmark-manager-r2.test.mjs
node --test tests/environment/bookmark-manager-r24-lifecycle.test.mjs tests/environment/browser-sdk-r112-full-bookmarks.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager
# 依据 tool.config.json 当前版本查询 artifacts/sidebar-tools/bookmark-manager/ 产物
npm run check
npm run build
npm run build:dev
npm run verify
```

这些命令用于产生静态/Node/Build 证据；GitHub CI 不能替代用户设备上的真实 Chrome 安装、权限手势、事件、并发和生命周期验收。官方 Catalog 和旧宿主清理已在源码阶段执行；原生验收结果仍应独立标记 NOT_TESTED，未经运行不能宣称 95+。

SDK 公共前置项仍跟踪 [Issue #75](https://github.com/shopable-ai/opendesk-browser/issues/75)，本工具的审计与各候选历史在 [Bookmark Manager R2 workstream](../../../docs/framework/workstreams/bookmark-manager-r2.md)。九维 95+ 仅能根据同一最终候选的 Chrome 原生实测分别评分。


## R2.8：书签只读选择与外部预览诊断（0.3.8 源码候选）

0.3.8 修复用户反馈的“点击其他书签仍显示编辑弹窗”问题：普通书签/文件夹行只是**选择并查看详情**，不会隐式进入编辑。仅详情的「编辑信息」或明确行菜单的「编辑」进入修改模式。当前表单没有改动时，点击条目可直接回到只读详情；当前有未保存修改时，新选择会触发可见的草稿决策，旧节点和输入暂时保留，点击「继续编辑草稿」或 Escape 恢复输入焦点；只有明确放弃草稿才能切换到新书签的**只读**详情。保存仍必须经 Full Bookmarks SDK 原生读回，错误/撤权/未知结果不得自动重放写入。

离线 HTML 预览分为两个严格隔离部分：模拟 Side Panel（\`iframe#opendesk-preview-frame\` 内是正式包同源业务 UI）和模拟设备**之外**的「预览测试辅助工具」折叠区。后者属于 \`scripts/preview/\`，仅发送明确列举的 Mock 内存诊断，绝不进入 \`tool.config.json\` 的 \`files\`、独立安装 JSON、浏览器宿主源码或 Side Panel 生产 UI。其辅助操作只用于复现写入失败、未知结果、跨窗口冲突、读取超时、撤权等场景。

回归优先使用既有 \`scripts/tests/bookmark-manager-r26-preview-chrome.mjs\`，覆盖真实 Chromium 两视口下正常选择、编辑、草稿切换、外部诊断界面与被隔离 iframe 的边界。测试状态只称 \`MOCK_BROWSER_INTERACTION_PASS_NOT_INSTALLED\`；没有 Mac 正式安装、Full Bookmarks 授权及 Native CRUD 证据时，\`NATIVE_NOT_TESTED\`、Issue #75 OPEN、专家逐维 95+ NOT_SCORED。

## R3.2 · 正式 React 源码唯一来源（非发布候选）

- **正式 UI 唯一维护位置**：`src/react/App.jsx`、`src/react/style.css`。生产可信 Host 在 `src/ui/react/main.tsx` 静态编译导入，沿用唯一 React Root、既有 Bookmark Model/Service、Full Bookmarks SDK 和原 Host；不从安装包动态执行 JSX。
- **Preview 只是 Adapter**：`preview/react/src/main.jsx` 与 `preview/react/src/formal.jsx` 均导入上述同一 JSX/CSS，不含独立业务实现。切换到 `preview/react/` 执行 `npm ci`、`npm run preview:build`、`npm run preview:check`、`npm run preview:chrome`，自动生成被 Git 忽略的 `preview/dev.html`。该预览使用 Mock Fixture，不等于 Native PASS。
- **保留历史审核入口**：`preview/index.html` 尚未晋升为 R3.2 交互 HTML；此阶段不更换该文件，也不覆盖 `bookmark-manager.opendesk-tool.json`、官方 Catalog 或工具版本 `0.3.8`。Classic `src/main.js` 仍是已安装动态沙箱工具的兼容入口，直至独立原生验收批准。
- **预算范围分离**：可信 JSX 走 WXT 固定 Host 的 1 MiB `ui/tool-shell.js` 硬限；`npm run preview:budget` 测试的是独立 IIFE Sidebar Tool 可行性，当前旧动态工具 JS 220,000 bytes/完整包 320,000 bytes，`BUDGET_BLOCKED` 不等于可信 WXT 失败。没有新动态工具业务的必要性，不扩大整个安装框架。
- **真实验证**：Node/CI 测试、Chromium Mock 与 Mac 原生独立分栏报告。隔离 Profile 的真实 Full Bookmarks 授权、2,159+ 书签、130+ 文件夹、CRUD、危险删除、撤权、跨窗口更新和新标签页事件尚无本版本证据时为 `NOT_TESTED`；正式版本不提前发布。

## R3.3 · 默认 React 入口源码接线（待隔离 Profile 原生验收）

- 正常安装的 Side Panel 打开「书签管理」时，不再要求 Debug 或 `bookmarkReactPilot=1`。Controller 先核对已安装工具、官方发行目录、固定包 SHA、启用状态、来源证明与撤权代际；**全部一致后**才通过既有 React Root / Portal 执行正式 `src/react/App.jsx`。非官方/旧版本或身份不符的包仍回退隔离 iframe，不承接可信 JSX 权限。
- 首次进入尚无完整书签许可时，展开既有 Full Bookmarks 授权控件；Chrome optional 权限和 Host 内的 Full Consent 仍为单独的用户授权。授权成功且没有未保存或进行中的写入时，仅重新挂载经过校验的界面，以重新订阅观察事件后读取原生树。
- SDK 仍经 `requestTrustedBookmark` → `dispatch` → 既有 Browser Host，原生书签存储和危险目录删除票据未绕过。Classic `src/main.js` 和正式 0.3.8 安装包尚保留兼容沙箱路径；**没有通过 Mac Chrome 前不得提升产品版本或宣称正式交付通过**。
- 静态回归：`node --test tests/environment/bookmark-manager-r33-default-react.test.mjs tests/environment/bookmark-manager-r306-trusted-react.test.mjs tests/environment/bookmark-manager-r32-formal-source.test.mjs`。已有 CI WXT/Chromium 通过只证明源码和模拟操作，不是隔离 Profile 的真实 Chrome CRUD、升级或撤权证据。
- 删除 UX 源码已去掉 React 的第二层确认：菜单删除直接进入原有 Host 的**单次操作审批**；既有 Service 子树签名、短时一次性删除票据与写入后完整树读回未取消。React 预览只验证 Mock 单次提交，不模拟真实 Host 审批结果。
- 本阶段待原生验收重点：保存/移动是否仍有多次 Host 审阅、真实 Chrome 删除时是否只出现一次 Host 确认、真实 2,000+ 树与观察会话刷新、权限撤销中的草稿保护、100%/200% 缩放及正式包升级一致性。出现任何失败，先在同一 `main` 修复，再升级正式包和 Catalog。

**当前状态：SOURCE_DEFAULT_REACT_ENABLED / NATIVE_NOT_TESTED / BOOKMARK_MANAGER_RELEASE_BLOCKED。**

## R3.4 · 官方 React 保存不再重复审阅（2026-10-20）

正常安装、独立授予 Full Bookmarks 的官方书签管理，在真实点击保存或按 Enter 保存时，创建、编辑、移动书签及文件夹直接完成；一次保存包含移动、名称和 URL 修改也无需再点 Host 确认。每次写入仍由原 Host 签发并消费绑定操作、参数、安装身份和代际的一次性票据，保存后按原生 ID 读回，重复点击、未知回执及部分写入保护保留。

此策略仅适用于通过既有官方包/SHA/来源/启用/代际准入的静态 React UI。合成保存事件被拒绝；第三方和沙箱路径仍需原 Host 审阅。Full Bookmarks 独立授权、撤权、Chrome 权限及危险递归删除的票据与确认没有取消。正式工具 JSON 与 Catalog 保持 0.3.8 原字节。

本次与历史候选的真实 Chrome、Mock、构建和 CI 状态分别记录在仓库的 `docs/framework/evidence/bookmark-manager-r34-20261020/save-consent-release.json`；旧候选的 PASS 不自动代表当前候选，排队中的 CI 不算发布通过。
