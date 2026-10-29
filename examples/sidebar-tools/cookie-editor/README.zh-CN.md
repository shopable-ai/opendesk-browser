# Cookie Editor · 正式 Cookies SDK 安装工具

## R3.1-S3 配置分享接线候选（2026-10-30，未完成正式交付）

**同日续跑：** 已修正 Analytics 的 Reading TOC 旧导入，复核并更新五项仅修正相对导入深度的迁移源码锁；`projects/` 中未经精确审查的源码现在与 `examples/` 一样拒绝进入可信包，迁移不再意外绕过准入。定向迁移与保护检查 10/10、Analytics 导入图 1/1、Cookie 来源保护 6/6 通过。另一台真实 Mac 已用显式证书信任经 LAN HTTPS 从原 Relay 领取一份无 Cookie 测试配置（创建 201、领取 200、次数归零），默认未信任证书则校验拒绝。**这只证明双机 HTTPS API 传输**，没有修改系统／Chrome 信任，也没有经过 OpenDesk 接收 Host、Cookie 恢复或网站登录。已有开发 watcher（PID 62841）仍报目录合同错误、疑似使用迁移前缓存，且由其他任务持有，未擅自停止或启动第二个 writer；最新开发产物和原生验收仍待恢复。详细续跑证据已追加到下述同一证据文件。

**后续阻断核对：** watcher 已推进到 `preinstall-intent` 并暴露另一处 Reading TOC 旧导入，现已最小改为 `projects/reading-toc/trusted/existing-tabs.js`；语法和四项相对依赖解析通过。目录虽已有部分 SW，但仍缺 `manifest.json` 和开发发布指纹，不能视为完整可加载候选。原重启确认未获明确答复，没有停止其他任务服务。非导出私钥恢复阻断连续三轮未解除，目标仍未完成并等待所需协调；不重复宽回归或把 TLS API 领取提升为 OpenDesk／登录验收。

当前开发源码为 **2.0.55**，目录内唯一正式包仍为 **2.0.54**，没有覆盖或晋升。正式包与当前源码检查明确失败；本次源码提交不能当作用户已安装、已更新或跨设备登录成功。

现有六 Tab 中「账号 → 更多操作 → 分享账号配置」已接入原 Relay：发送端输入真实可信 HTTPS 服务地址，创建配置邀请，查看真实 URL、到期时间、剩余领取数，复制、查询、撤销，并可重新查看已保存邀请。「账号 → 领取分享配置」支持粘贴邀请、检查网站和状态、保存独立 alias；空 Cookie 账号可分享，重名新增而不覆盖，原网站会话不变。接收页面需先打开邀请的网站。过期、撤销、安装身份、真实点击、Chrome 服务地址授权与未知结果继续拒绝；失败不自动重新领取。并发保存冲突只重新读取状态，已领取配置可由下一次明确点击继续本地保存。

这次**只接通配置**。设备会话分享明确返回 `E_SHARE_DEVICE_KEY_STORAGE_REQUIRED`：现有 Foundation `captureBackup` 对真实非导出 `CryptoKey` 拒绝 `E_VERSION / Unsupported backup value`，安全持久化与恢复合同尚未闭合。没有增加导出私钥、明文 Cookie 分享或第二套 Runtime。配置领取、Cookie 写入读回、网站真实登录分别记录，不能相互替代。

最终定向 Node 158/158、React 候选编译和候选来源检查通过；独立审查发现的撤权窗口、已删除账号假成功、容量消耗领取及冲突后旧 revision 已修复。共享 Host 初次回归仍有失败，其中三条 Cookie 测试在 HEAD 原 Host 对照同样失败；完整 SW 编译被 `src/analytics/host.js` 的 Reading TOC 旧路径阻断。Cookie 服务组件 121492 B **不是完整 SW 体积通过**。因此保留旧正式包，不以候选或组件检查替代正式晋升。

本机 Relay 曾在 `127.0.0.1:8713` 以开发 HTTP 启动并通过 `/health`，不是 LAN HTTPS。最新候选的 Mac Chrome 本机 A/B URL 切换、两 Profile、320/360/400/440/520px、200% 缩放、双设备 HTTPS、配对、会话恢复及网站登录均为 `NOT_TESTED`，不继承历史候选 PASS。本轮不评分，不宣称达到 95。证据、命令和下一步见 [`evidence/r31-s3-finish-20261030.json`](evidence/r31-s3-finish-20261030.json)。

## 账号保存状态与分享配置排版 · 2.0.54（2026-10-29）

新建或首次关联账号后，固定可信服务在保存成功后按原文档、授权和完整 Cookie 快照再核对一次。确认相同时，账号页顶部显示账号名和「当前快照（保存时已核对）」，列表显示「已核对」；空快照、页面变化、撤权、版本变化或无法核对时只保留保存结果，不猜测当前账号，也不声称网站已登录。状态仅限当前应用会话，普通账号元数据不能建立这项确认。

分享配置修复单选框继承通用输入框全宽样式导致的错位，统一标题留白、两种邀请方式、有效期与领取次数对齐；低频说明折叠展示，进入分享页聚焦标题，返回后恢复原账号操作焦点。真实分享服务仍未上线；同源交互预览使用虚构数据，不产生分享权限。

唯一正式包 [`cookie-editor.opendesk-tool.json`](cookie-editor.opendesk-tool.json) 为 **2.0.54**，SHA-256 `58a102a648c71321c9b4fad42bb744694e79b0d197eb686a1a8fe2dafb047b2d`，ID／权限列表不变。原 Vite 编译、15 项账号回执消费者测试、71 项可信账号服务测试、10 项受影响共享域／分区捕获回归、共享样式及编译来源漂移保护、8 项原打包门禁、候选晋升和源码一致性核对通过。同源 JSX + Mock SDK 已实际操作新建账号、两种邀请方式及返回焦点；本机截图为 `artifacts/cookie-account-ui/account-created.png` 和 `share-layout.png`。

可信服务 Git blob `2efe25ce9ac264bf3ac0e5bad1978375a9ef7280` 经独立只读审查后更新原固定来源锁。精确 SW 来源准入、其他目标拒绝、字节漂移及符号链接拒绝已定向核对；没有放宽固定来源规则。

**PACKAGE_READY_INSTALL_NOT_TESTED / SYSTEM_CHROME_NOT_TESTED**：本轮没有替换日常 `dist/development` 或安装本包；真实 Chrome 的加载路径、开发连接和新版本原入口尚未验证。新增状态核对属于随 Browser 固定编译的可信账号服务，仅更新 JSON 不会更新该服务。production、完整验收及评分继续延期；上述预览不作为原生证据。

## 网页状态解析与导航恢复 · 2.0.53（2026-10-29）

本轮按系统 Chrome 反馈修复核心状态链，未进入 production 验收或评分。已复现并修复三类源码缺陷：

- 共享目标解析器先检查加载状态，导致仍报告 loading/unloaded 的受限地址被误分类为 `E_DOCUMENT_UNRESOLVED`。现在先检查当前／待导航地址类型；受限页不查询主文档，也不产生可管理目标。
- 刷新进入 resolving/unavailable 后丢失事件筛选用的 Tab ID，后续导航通知可能被忽略；也未监听主文档完成事件。现在私有事件路由独立保留，并在活动标签切换时同步更新，防止旧标签后台导航取消新查询。事件只触发重新观察，准入仍须完整 URL、Origin、活动主文档及二次活动标签核验。
- Cookie 适配器的共享原因变量可被迟到旧请求覆盖。现在每次原子返回目标和原因，Controller 在代次核验后使用同次结果；旧网站 Cookie 回执不能恢复到新网站。

公共缺口已由 `tests/environment/current-page-target.test.mjs` 的失败用例证明：链路为 `src/ui/current-page-target.js → src/ui/sidebar-tools.js currentPage.info → app/adapters/browser-sdk.js → app/controller/cookie-controller.js → CookieEditorApp.jsx`。公开 `currentPage.info` 在不可用时不提供可操作目标，沙箱不能自行调用 Chrome 重新分类，因此仅在原共享解析器修复通用导航问题，没有增加 API、权限、Host 或单工具分支。

受限页仍只显示顶部说明卡片，六个产品 Tab 保留。未解析状态改为「暂时无法确认当前网页」，隐藏无效编辑区，只保留手动「重新检查」，不再显示「离线文件」。其他可恢复错误保留原有恢复入口；没有增加轮询重试或放宽文档绑定。

唯一正式包 [`cookie-editor.opendesk-tool.json`](cookie-editor.opendesk-tool.json)：**2.0.53**，SHA-256 `7aff388a393da03159a77ff90354d2411bab6b4ca6f7911f62ef938f63b71062`。应用原 Vite 编译通过，buildId `50d7021e1c3352b1e3838687b3219358606f4a8046fbd167ed7c06103555cbd4`；经原 `app:update`／打包器生成候选、门禁、显式晋升与源码一致性核对，ID／权限列表不变。

本轮最小验证：共享目标与导航 18/18、真实卡片组件渲染 3/3、Cookie Controller 62/62、适配器权限及分页隔离 4/4、受影响账号回执消费者 11/11、编译产物／来源漂移保护 2/2、原打包门禁 8/8 通过。新增竞态与分类用例先复现失败再修复。同源 JSX + Mock SDK 浏览器预览确认受限／无活动网页无操作按钮、未解析状态单一重查、正常工作区恢复、缺少权限时写入禁用；截图在本机 `artifacts/cookie-editor-page-state-20261029/restricted-card.png`，属于虚构数据证据。2.0.52 记录的三条无关历史静态断言未修改、未重跑，不计为本轮通过。

**PACKAGE_READY_INSTALL_NOT_TESTED / SYSTEM_CHROME_NOT_TESTED**：系统 Chrome 清单可见扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；扩展页面此前被浏览器工具策略拒绝，本轮未绕过该限制。实际加载路径、Cookie 工具版本、开发服务连接及用户故障时的 URL／reasonCode 仍未实读，不能把上述源码复现当作该实例的运行时根因证明。未安装本包，未重编或替换日常 `dist/development`；工具 JSON 仅包含应用代码，共享解析器修复还须经原 Browser 开发更新生效。下一条未验证操作仍是：系统 Chrome 原入口核对身份后，打开受限页的 Cookie Editor，再切换普通 HTTP(S) 网站，确认卡片与真实工作区恢复、旧网站数据清除。production、全量回归及评分继续延期。

## 受限页面提示优化 · 2.0.52（2026-10-29）

Chrome 内部页、扩展页、隐身窗口及没有活动网页时，Cookie 页正文顶部仅显示一张提示卡片，不再附带「离线文件」按钮或整套禁用的 Cookie 编辑区。卡片复用共享样式，统一标题、正文换行与 12px 留白；普通网站、授权流程及可恢复错误原有操作保留。

唯一正式包 [`cookie-editor.opendesk-tool.json`](cookie-editor.opendesk-tool.json) 已通过原 Vite 编译、候选包门禁、显式晋升及源码一致性核对；版本 **2.0.52**，SHA-256 `aeb83b15cdabb3f070b60d2d58c4579a89cb164682e59a5d7b49bea7bf752042`。本轮只修改应用界面与包，不修改 Browser、SDK 或可信 Cookie 服务。

同源 JSX + Mock SDK 预览已检查受限页、无活动网页、正常列表恢复、权限缺失恢复操作和深浅色显示；源码/样式定向检查 18 项及打包门禁 8 项通过。原静态测试另有 3 条既有失败（导入区/导出区表达式缺少现有 `cookieReady` 条件、文件导入断言仍要求立即导入），已核对修改前 HEAD 同样不成立，本轮未改写这些断言。预览截图位于本机 `artifacts/cookie-editor-restricted-card-20261029/restricted-card.png`。

**PACKAGE_READY_INSTALL_NOT_TESTED**：浏览器安全策略拒绝读取 `chrome-extension://` 页面，本轮未安装或复测真实扩展页面。虚构数据预览不作为 Chrome 原生通过证据；下列 2.0.50 等记录仅证明各自历史候选。

## R2.8-LOCAL · 2.0.50 正式包与增量验收（2026-10-29）

原 R2.8 的六 Tab、极简授权弹窗与可信 Host 实现沿用 `93d6fba88`、`59345ab97`、`5d1fb2e1e`，未重新设计页面或修改已确认原型。此次仅对齐版本、通过原打包器晋升新包，并修正不再符合当前审阅流程的测试断言。

- 唯一正式包 [`cookie-editor.opendesk-tool.json`](cookie-editor.opendesk-tool.json)：**2.0.50**，225953 字节，SHA-256 `fe9ec22597abdc3309ef15211bc79cbe1df32be1d4188fd4945af97efc80865e`。`--check-project` 已确认与当前 React 源码／编译收据一致；ID 和权限列表未变。
- React 编译收据 buildId `32e3afe4a14772df4012b6f8800ae9847bc3f52212f140911316d09e3d267c05`；JS 144463 字节、CSS 60750 字节。工具包不包含可信 Host，Host 仍随 Browser 固定编译。
- 独立源码快照的 **production MV3 构建及原包验证 PASS**，最新 main 候选（源码 `abc56d3fd`，包含远端 `6bcaf4d67`）packageHash `c251e98e9f3086b9bbfe0ab5c4bfe39085adf22f4d5f61a3ecaf4f10da76612b`，117 个产物哈希全匹配。内置 Catalog 的 Cookie Editor 版本、大小、SHA 和包原文均匹配本次正式 JSON。可信账号四项来源 pin 全部匹配，未重置哈希或放宽来源校验。
- Mac CFT 155.0.8059.39 已从真实 Chrome 扩展菜单进入 production Side Panel，实读工具版本 2.0.50。首次弹窗后方六 Tab 可见；关闭后顶部显示小「授权」，企业页可浏览，Cookie 新建／导入／导出保持禁用；单击授权后自动恢复真实 Cookie 操作，无需另行启用或手动刷新。
- **本地原生核心流程 PASS**：虚构 Cookie 新建、编辑、重新读取及删除；JSON 导入预览／确认／值读回（最新候选）；下载文件逐字段核对（首次候选，未冒充新候选下载复验）；账号保存、重开持久化与可信切换回执。Host 撤权及 Chrome 网站访问开关关闭后，旧 Cookie 和值清除，六 Tab 保留且写入禁用。缺少 Chrome 权限时，一次点击只出现一个原生弹窗；拒绝、Escape 取消均不假成功，允许后自动恢复真实列表。切换 `127.0.0.1 → localhost` 后旧值消失，重开工具无需再次授权。
- **首次候选剪贴板补验 PASS**：首次 production 候选的新临时 Profile 中，原生复制／粘贴读回 `od_r28_clip_probe` 的完整真实 JSON，导入预览 1 条可导入、0 条跳过。显式点击文本区后正常；此前驱动焦点／其他文本异常保留为历史观察，未据此修改产品代码。2.0.45 已移除口令／锁定 UI，本轮不恢复旧设计；新存储、旧会话密钥迁移、锁定遗留密文保护定向 3/3 PASS，原生旧密文迁移未测。
- 最新 main 候选已在独立 Mac Chrome Profile 复验核心流程，扩展 ID `hkohjjlflpkfjagakmamniddcmljdmmd`、Host `c85fa694-5769-456d-a746-0761fca5e70e`。24 条带 UTC 时间的 [原生 AX 摘录](evidence/r28-latest-main-native-20261029.json) 分别关联授权、撤权、拒绝／取消、切站、真实 CRUD、复制／确认导入、账号保存／切换和实际加载路径。共享 Host 三项回归 3/3；远端 Fingerprint 新增的 Browser `debugger` 权限未用于 Cookie。新旧候选身份与下载证据分开保留。
- 最新候选独立八维评分平均 **94.5/100**（历史 91.5／93.625 保留），每维 ≥95 的目标仍未达成，未发现已证实的本轮核心交付阻断。 用户已明确选择「按本轮范围交付，保留评分差距」；本轮交付收尾，评分和未测项不改写。
- Node、MV3、来源审核和原生观察分别记录；官方目录全组另有无关 `quick-notes` 正式包与共享 CSS 不一致的断言失败，未修改该包或删除保护。

完整分层结果、资源归属、评分与剩余操作见 [R2.8 本地验收记录](evidence/r28-local-20261029.md)，结构化身份和原生观察转录见 [`evidence/r28-local-20261029.json`](evidence/r28-local-20261029.json)。原始构建／测试日志在本机 `artifacts/sidebar-tools/cookie-editor/r28-local/`；**PASS 仅限已记录的本地核心流程，不代表所有高级场景或全站正式验收通过**。

## 共享域账号快照与恢复修复（2026-10-29）

固定可信账号服务通用支持合法共享域 Cookie，例如在 `www.csdn.net` 保存包含 `.csdn.net` 的账号，保留原 Domain、literal Path、Store、Partition 及 HostOnly 属性。同名同 Path 的 HostOnly 与 Domain Cookie 分别保存和切换。复用已有全站完整管理授权，或当前站点与精确父域各自的管理授权，并核对 Chrome 权限；共享 Cookie 本身仍会影响使用它的其他子域会话。

保存会检查已授权父域的各 Path，不再要求该域先有匹配当前页面路径的 Cookie。域候选以 Chrome 返回的当前文档 schemeful site 为界，不猜“最后两级域名”，不将兄弟主机或其他 Partition 纳入快照。注销后即使所有实时 Cookie 已消失，也可恢复可信服务此前保存的账号；快照不提供新权限，仍须通过当前授权、Store、Partition 和原文档核验。

未分区与原生当前精确分区分别读取，避免 Chrome 默认查询只返回未分区 Cookie 而静默漏收；保留分区的 topLevelSite 与 hasCrossSiteAncestor。保存、切换和写入回读时重新检查安装及授权代际，缺失或变化时停止；未知写入不自动重试。精确删除按完整身份选取和回读，避免同名 Cookie 的原生单条选择或 URL 规范化阻挡合法操作。Cookie 值继续仅留在可信服务和 Foundation 存储。

本轮修复在 Browser 固定可信后台及原 Cookie 驱动；只导入工具 JSON 不会更新后台。**真实 CSDN / Chrome 扩展界面仍为 NOT_TESTED**：此前 Computer Use 安全策略已阻止访问扩展页面，本轮不绕过。源码、定向回归、独立审查、来源校验及产物状态见 [本轮工作记录](../../../docs/framework/workstreams/cookie-editor-csdn-20261029-01a183bf.md)。并行 UI/工具包更新单独维护，不作为该后台修复已生效的证明。

## 当前核心增量：R2.6 · 2.0.46（2026-10-29）

按最新要求，本轮只完成账号核心闭环和相关增量验证。修复可信保存回执访问已脱敏 Cookie 数组的问题：计数在 Vault 内计算，React 只收到 `cookieCount`。预览复用正式 JSX，经原 Vite 流水线重建，生成字节与当前 HEAD 一致；未维护第二套 JSX。

唯一正式包为 **2.0.46**，223877 bytes，SHA-256 `255f1f5f793683c956229fb0914d6aa314e9b016ef9c0157a4bc43b3f97006fa`，已通过原打包器的候选、定向检查、晋升及 `PROJECT_PACKAGE_MATCH`。预览测试 28/28、账号/回执/Vault 41/41、来源保护 6/6、包定向 3/3、正式 JSON 1/1，以及 R2.6 Chromium + Mock SDK 3/3 通过。

真实 Mac CFT 155 加载原 `dist/development`，开发服务已连接，实际工具版本 2.0.46。新增“新账号 1 / 2”、顶部保存、不同 Cookie 快照切换与 Chrome 回读、无变化更新提示、非当前账号禁用更新、工具重开持久化、网站隔离及默认匿名分享未上线禁用均已实际执行。完整浏览器重启被启动器退出超时阻断，记 `NOT_TESTED`；专用进程已退出、Profile 已清理。原生故障注入、value-only 更新、production、全视觉/尺寸矩阵及八维评分延期。当前来源锁匹配，视觉仍有差异，不标视觉 PASS。

本轮命令、指纹、实测边界与本机截图索引见 [`evidence/r26-local-20261029.json`](evidence/r26-local-20261029.json)。以下旧版本只证明各自候选。

## 历史 2.0.45：移除本机加密仓库（2026-10-28 · 2.0.45）

按用户要求删除账号页的「本机加密仓库」、设置口令、解锁和锁定交互。现在点击「＋」后直接命名并保存当前网站账号，继续保留原有账号切换、重命名、更新、删除及权限校验；本轮未修改 HTML 原型。

账号快照使用已有 Foundation `frameworkKV`，仅由固定可信 Worker 访问，Cookie 值不写入 Sandbox 元数据或普通 `chrome.storage.local`。升级不删除旧密文：已有可信会话密钥可读取时自动迁移；否则保留原字节并明确提示未迁移，可重新保存当前网站账号。新流程不再创建口令或加密仓库。

唯一正式文件 [`cookie-editor.opendesk-tool.json`](cookie-editor.opendesk-tool.json) 为 **2.0.45**，SHA-256 `82158bf3a33fb8fd6f6661335ff2b8a9b07664a19cbc919fe54201f5e036ef96`。原 React 编译、候选包门禁、晋升及 `PROJECT_PACKAGE_MATCH` 通过；账号存储/切换、回执与界面定向测试通过。源码 Chromium + Mock SDK 已实际完成「首次点击＋ → 命名 → 保存」，页面无口令或仓库控件；本机证据为 `artifacts/cookie-editor-remove-vault-20261028/`。

**状态为 `PACKAGE_READY_INSTALL_NOT_TESTED`。** 可信账号存储同步修改了 Browser 固定代码，使用新流程还需更新对应 Browser 代码；仅导入 JSON 不代表可信代码已更新。本轮没有替换现有扩展、覆盖共享 dev 输出或执行真实 Chrome 安装复测。下面各版本原生证据仅对应原候选，不能升级为 2.0.45 PASS；production、全量验收及独立评分继续延期。

通用视觉审计器自检被现有原型来源锁拒绝：配置仍固定 `020adbf22005cba219af4ff27cd3f3e492978bed`，并行合入的原型为 `6d1eaace4113dc574b07f71c3faa2977c3e68041`。未改写锁或把该项记为通过；本轮无口令保存的独立 Chromium 用例不依赖该审计器，已通过。

## 历史可安装包与原生复测（2026-10-28 · 2.0.44）

当时的正式包 **2.0.44** 已在专用 CFT 155 中通过原官方审阅入口从 2.0.43 更新，并读到实际运行版本。六个页面已逐页截图核对主要布局；列表内联导入经「预览 → 确认 → 独立 Cookie 回读」通过。认可 HTML 保持原字节，工具 ID 和能力列表不变。唯一正式文件现已替换为顶部的 2.0.45。

本轮恢复企业、市场、定制和圈子的认可文案及换行，校准卡片、图标、间距和表单样式；保留账号示例、真实仓库状态和权限保护。当前为持续开发环境：加载本仓库 `dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，复用已有 dev watcher。仅操作移交的专用 Profile，不替换日常 Chrome。实际更新后仅通过原设置入口授权本地测试站点。

包为 **221911 字节**，SHA-256 `421bea2335b3d4c448873a604a5b0b212838a806db156de620567490644e51f1`；原打包器候选、8 项包门禁、晋升和最终 `PROJECT_PACKAGE_MATCH` 通过。布局/有效期 12 项、账号占位/可信回执 15 项定向测试通过。记录见 [`evidence/ui-native-2044-20261028.json`](evidence/ui-native-2044-20261028.json)。

**六页主要布局已可见核对，但完整视觉一致性仍为 `GAP`。** 单场景源码预览对照无执行错误、空图标或直接选择器结构/样式差异；通用 DOM 清单仍报告文字、图标、控件及几何/样式差异，不能把包成功或测试数量当成完全一致。原生账号完整切换流程复用下方 2.0.42 的历史证据，本轮未在 2.0.44 重配仓库复跑。production、全量回归和独立评分继续为 `NOT_TESTED` / `NOT_SCORED`，宽度缩放矩阵为 `OUT_OF_SCOPE`。

本机截图：`artifacts/cookie-editor-ui-01a18212/installed-2044-six-pages.png`；源码对照：同目录 `preview-current/report-light-380.json`。专用实例停留在 Cookie 页，保留一条虚构 Session Cookie；重启前的其他 Session Cookie 正常结束，不作为包数据丢失。以下旧版本记录仅证明各自候选，不代表当前正式包身份。

## 历史手动测试包（2026-10-28 · 2.0.43）

当时的正式包 **2.0.43** 包含下述账号/企业布局增量和内联导入实现。该版补齐 App 根容器白底，防止真实 Sandbox 透出灰底；导入样式同步为列表内联区，不再沿用底部 Sheet 定位。认可 HTML 保持原字节。该包先由 2.0.44 替换，当前文件见顶部 2.0.45。

当时的手动安装入口为 OpenDesk「扩展 → 更多操作 → 导入本地工具包」，核对 ID 和版本后确认更新；无需先卸载。仅刷新浏览器扩展不会自动替换已安装工具包；当前文件版本以顶部记录为准。

本次布局、导入预览/确认与可信意图定向检查 **23/23 PASS**，通用包门禁 **8/8 PASS**，正式 JSON 同源检查 `PROJECT_PACKAGE_MATCH`。包为 219938 字节，SHA-256 `31665bfdddd35db1c1e6c55d22c0d7ed086fd753b34bd94df13dac3c1c01ba26`。精简记录见 [`evidence/ui-package-2043-20261028.json`](evidence/ui-package-2043-20261028.json)。

**当时状态为 `PACKAGE_READY_INSTALL_NOT_TESTED`**：该交付时点 2.0.43 尚未实际导入 Chrome，六页视觉一致性尚未完成；下述 2.0.42 原生记录不升级为新包 PASS。后续先完成真实更新和同状态截图核对，再继续修复明显差异；production、完整矩阵和独立评分继续延期。

## 历史布局增量（2026-10-28 · 源码开发）

该轮目标是让账号和企业页恢复原交互 demo 的布局层次，保留无业务数据时的演示区域。实际业务继续限于 Cookie 与账号；企业、市场、定制、圈子保持静态介绍和本机交互占位，不接入企业后台、交易或社群服务。本节描述历史源码，其中仓库交互已由 2.0.45 删除；下面的 2.0.42 原生记录保留为此前候选的证据。

- 账号始终保留状态卡、自动刷新选项、已保存列表与会员区域。首次设置/解锁收进默认折叠的「本机加密仓库」，点击保存会展开并聚焦口令输入；至少 12 字符，提交或收起后清空输入，沿用原加密和授权链。
- 空数据时显示工作、个人、备用三行「账号示例」，明确标注非真实账号，所有示例操作禁用，不计入保存数量，也不传入真实快照回调。锁定且无法读取数量时显示「—」。有真实账号后以真实列表替换示例。
- 企业资源概览始终保留四行虚构资源、席位/预算数值和用量条，并显示「虚构示例 · 非实时」及未接入说明；不再因正式模式无后台数据而删去整块布局。定制、圈子保留原本机交互并补充占位说明。

当前通过既有 [源码预览](http://127.0.0.1:43134/dev.html) 与 [原 demo 对照](http://127.0.0.1:43134/a-b-dev.html) 检查，使用独立无扩展 CFT 154 和 Mock SDK，不读取真实 Cookie。账号空数据、首次保存展开与聚焦、企业四行资源和说明已可见核对。组件状态与原账号回执/导出授权的 15 项定向测试通过；JSX 编译及差异格式检查通过。

本机截图与结果位于 `artifacts/cookie-layout-01a18138/`。此前 source 检查中的导入文件断言仍预期旧的直接导入流程，与任务开始前已有的导入预览改动不一致，记录延期；该布局工作未改此并行流程或断言。该轮当时未打包，后续已纳入 2.0.43 手动测试包；最新安装更新及真实 Cookie 复测见上方 2.0.44 记录，production 和独立评分仍未执行。

## 历史核心开发与原生验证（2026-10-28 · 2.0.42）

**六页正式 React Sidebar App 已通过本轮核心原生流程。** 在本对话独立、可见的 CFT Profile 中，通过原安装审阅链从旧包更新到 **2.0.42**；使用实际 SDK / Host / Chrome Cookie，未使用 Mock。当前是持续开发环境，不是 production 验收或全站兼容结论。本节状态仅对应 2.0.42；当前候选以顶部记录为准。

### 安装身份与复测入口

- 唯一正式包：[`cookie-editor.opendesk-tool.json`](cookie-editor.opendesk-tool.json)，217608 字节，SHA-256 `d8a2b428bceaf6e5208bb7240268c6df2c81e90b13b30a50f00f2059477e7590`。实际安装详情及运行目录 Catalog 均匹配；工具 ID、能力列表不变。
- 当前编译回执 buildId：`5b2e1605dd09b2a93ebdb440241e25e19e1a8e27dd5d3c9a72b437dd48662880`。原 dev watcher 已按原 React 编译器更新产物；本轮复用该 writer，使用原打包器候选→定向门禁→`--promote-from`→`--check-project`，没有第二个 Browser build writer。
- CFT **155.0.8059.39**；专用 Profile：`/Users/shopme/.opendesk-browser/dev-profiles/cookie-core-01a17e8d-b047a7c92bda`，启动名 `cookie-core-01a17e8d`。本轮仅操作此实例，保留日常 Chrome、其他 Profile、现有 watcher 与测试服务器。
- Chrome 扩展详情实读加载目录为本仓库 `dist/development`，真实扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。可信“调试→本地开发服务”实读已连接，观察时构建指纹 `dad9e5434729`；后续 dev 更新可改变指纹。
- 标准核心页面：`http://127.0.0.1:43111/demo-form.html`。所有 Cookie、名称与场景均为本轮虚构数据；没有读取个人 Profile 或真实站点登录信息。自动切换另使用同一测试服务器的根路径，以满足既有根 Fragment 合同。
- 结束时保留三个 `od_core_01a17e8d_*` 测试 Cookie、Core Alpha / Core Beta Renamed 两条加密快照；自动触发已关闭，仓库已锁定。测试口令仅适用于此虚构仓库：`fictional-cookie-core-01a17e8d`。

### 六页实测结果

| 页面 | 本轮真实用户操作 | 边界 |
| --- | --- | --- |
| Cookie | 列表、搜索、新建 Session、编辑值与相对有效期、取消不写、JSON 系统剪贴板导出、预览后确认导入、错误保留输入、预览取消、单条删除及 Host-only 清理、重开回读通过 | 新建/编辑/导出最初在 2.0.40 实测；导入确认在 2.0.41 实测；2.0.42 复测导入错误/预览/取消，且账号切换真实恢复三条 Cookie。未改动的流程复用同源证据；文件下载与其他格式未在本轮原生复测。 |
| 账号 | 保存两条快照、手动 Alpha/Beta 切换并独立回读 Cookie、重命名、临时快照更新与明确删除、锁定/错误口令/正确解锁、重开持久状态通过；空站点保存返回 `E_ACCOUNT_EMPTY`，名称与错误保留，跨页与 Escape 的继续编辑恢复焦点 | 已应用标识仅表示当前会话最近一次可信快照回执，不证明网站登录；外部仅值变化不一定能由元数据检测。修复后首次空仓库配置有 Node 回归，本轮未重置已配置原生仓库重复首次配置。 |
| 企业 | 无数据明确显示“尚未接入”，进入定制通过 | 真实企业、席位、用量、预算接口未接入。 |
| 市场 | 本地搜索、分类及账号管理、自动切换设置、Expiration 跳转通过；Expiration 未自动写入 | 无在线交易、共享账号或线上市场服务。 |
| 定制 | 选择方向、生成摘要、跨 Tab 保留通过；2.0.42 的可信复制成功，系统粘贴内容与摘要逐字一致 | 关闭或刷新不承诺持久化；没有自动发送、建单或配置商务联系方式。 |
| 圈子 | Telegram / Discord / 微信展开、切换、收起通过，明确显示待公布 | 真实邀请与联系方式未接入，未对外发送消息。 |

### 本轮修复及受影响保护

1. 导入增加“预览导入→确认导入”，预览只显示名称/域/路径与数量，不写 Cookie、不取得写入 intent。值不进入 React state；输入/文件/覆盖策略变化使预览失效，未知结果禁止重试。
2. Chrome storage 回读会重排对象键。加密仓库与自动切换栅栏改为完整字段值比较，仍拒绝缺失、额外、篡改和并发回执；保留冲突与未知结果拒绝。
3. 手动切换后在同一有效目标/epoch 同步元数据，保留可信已应用快照标识；切站、撤权、锁定、删除或可观察变化清除标识。仓库操作未知结果使用对应提示，不误称已写 Cookie。
4. 定制摘要与账号链接复用原有一次性导出授权；复制前后验证上下文，结束释放 intent，没有新增 SDK、Host、权限或安装路径。

原生自动切换：关闭时拒绝；只允许显式白名单；深路径拒绝；同一本地测试 Origin 的根 `/#od-account=...` 在最终可信代码中成功切到 Alpha，独立 Cookie 回读一致，栅栏回读为 `applied`。修复前未知请求没有自动重放，复测采用新明确请求。没有验证其他站点/SPA 适配。

原生撤权：可信设置撤销后，业务 Sandbox 隐藏且内容清空，读写入口不可用，实际 Cookie 不变；经原授权入口恢复后重新读取。执行世界仍是 manifest Sandbox，`chrome.runtime/cookies/permissions` 不可用，CSP `connect-src 'none'`；不是可信宿主内运行用户代码。定向 Node 回归继续覆盖权限预检拒绝、未知写入不重试和过期异步回执。

### 证据与未执行项

本机原始证据：`artifacts/cookie-editor-core-01a17e8d/results.json`、`installed-2042.png`、`import-preview-2042.png`、`final-cookie-2042.png`。可提交的精简身份及证据索引见 [`evidence/core-native-20261028.json`](evidence/core-native-20261028.json)。截图与临时包不提交。

相关回归：导入预览 9、仓库 30、账号 UI 回执/复制 10、可信切换及栅栏 10、定向 Controller/来源保护 7、包来源 3 项通过；语法、diff 与最终包同源检查通过。没有运行 Browser 全量构建、全套回归、production、跨浏览器/缩放宽度矩阵或独立评分；这些仍为 `NOT_TESTED` / `OUT_OF_SCOPE`，不影响本轮核心开发收尾。

正式源码仍在 `app/`，业务通过原 Controller / Adapter / SDK / Host / Authority。`preview/react/` 的 Mock 只用于 UI 预览，不能替代以上原生证据。2.0.40、2.0.41 是本轮被最终包替换的中间版本，工具目录只保留一个正式 JSON。此前“仅 dev、不打包/安装”的阶段记录已被本轮明确授权与实际更新取代；下文历史版本仅证明各自候选。

## 样式归属（2026-10-28）

应用主题、`--od-cookie-*` 色板与 `cookie-button--*` 专用变体保存在 `src/react.css` 的 `@scope (.cookie-editor-react)` 内，继续复用公共 `od-*` 控件。Cookie 权限界面的可信样式由本目录 `trusted/host.css` 持有，通过原可信 React 根固定引入；通用设计文件不再携带 Cookie 业务规则。

本次为源码拆分，浅深色与控件状态已进行浏览器计算样式对比。正式 JSON 保持原发行身份；源码迭代完成不表示已晋升或更新现有安装。

## 同版本发行身份漂移修复（2026-10-26）

Chrome for Testing 155 的已安装 2.0.39 摘要为 `892887021f7135301bf40e171197f1352923e7339b4fd71489bcb1ee0e0c5202`，但持续开发内置目录从当前共享 CSS 重新打包出同版本 `bd4767d5c94feb35f48083c9dbe4368f47e8a3f691ca0a5325ed910dc3e1efa8`。版本相同导致没有更新入口，可信 Host 的精确来源校验因此拒绝一键导出。

官方 Catalog 现通过已有 `packageFile` 读取本目录唯一正式 JSON，避免未晋升的开发编译改变发行身份。不修改正式包、安装记录、Host、站点权限或撤权检查。定向回归检查正式包与内置资源逐字节一致、开发 CSS/配置变化不影响发行、符号链接拒绝。原生复测结果见本轮 [工作记录](../../../docs/framework/workstreams/cookie-editor-release-identity-20261026.md)。

共用打包器同时拒绝以相同或更低版本晋升不同字节；旧正式包损坏、身份不符时保留现场并拒绝覆盖。同一份包重复晋升仍正常通过，合法新版本与既有自动 PATCH 流程继续可用。

本轮持续开发环境原生结果：CFT 155 的 chatgpt.com 上，取消「包含 Cookie 值」后的 JSON 复制与下载均成功；下载文件 2617 字节、9 条记录且无 `value` 字段。未读取或导出 ChatGPT Cookie 值。CFT 156 加载的历史 production 快照缺少 `sidepanel.html`，当前入口被阻塞；CFT 149 的当前安装列表未见 Cookie Editor。用户确认第 4 个是日常 Chrome，其当前侧栏正审阅另一个工具的安装，保留该界面，未复测导出。不能宣称四个浏览器均通过；本轮不改写历史快照或其他任务。

## 2.0.39 导出故障定位与提示修复（2026-10-24）

系统 Chrome 的 2.0.35 在官方候选更新后，一键导出被 Host 以 `E_TOOL_RUNTIME_UNAVAILABLE` 拒绝；原界面把该错误隐藏为 `E_COOKIE_EXPORT`，取消“包含 Cookie 值”后也一样失败。现通过原可信安装器同 ID 更新至 **2.0.39**，能力列表不变。工具遇到发行身份不匹配时明确提示从扩展列表审阅更新；缺少真实点击、敏感值回执不完整、容量限制、取消和结果未知也分别给出处理方式，不显示 Host 异常正文。

导出仍必须先取得原有站点及授权代际绑定的一次性 Intent；身份、点击或授权拒绝时，不读取 Cookie 值、不尝试其他导出通道、不自动重试。JSON、Cookie Header 和无值 JSON 元数据的复制/下载经定向 Controller 测试覆盖，原分区 Cookie 的 Header 无损限制保留。未修改共享 Host、Authority 或权限模型。

唯一正式包为 `cookie-editor.opendesk-tool.json`，125893 字节，SHA-256 `892887021f7135301bf40e171197f1352923e7339b4fd71489bcb1ee0e0c5202`；经原打包器候选门禁、显式晋升及同源检查。系统 Chrome 已完成安装。旧授权记录仅包含 `https://chatgpt.com` 与 `http://127.0.0.1:43111`；用户随后明确同意新版的全站 Cookie 管理范围，当前真实入口已授权可用。2.0.38 为本轮已被 2.0.39 替换的中间安装版本，不保留第二份正式 JSON。

系统 Chrome 开发环境原生复测（扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，已连接既有开发服务；非 production 验收）：在 `http://127.0.0.1:43111/demo-form.html` 通过 Cookie Editor 新建 `opendesk_export_check=fixture-20261024`，JSON 与 Cookie Header 的包含值复制、下载均 **PASS**。复制内容粘贴至本地页面控件核对；JSON 可解析，下载文件显示完成且文件内容中的测试值一致。取消“包含 Cookie 值”后的 JSON 复制亦 **PASS**，可解析且没有 `value` 字段或测试值。未导出 ChatGPT 登录 Cookie；本轮创建的测试 Cookie 已通过原界面删除，既有本地 Cookie 保留。分区 Cookie、其他网站与 production 包未在本轮原生复测。

定向验证：

```sh
node --test tests/environment/cookie-editor-react-controller.test.mjs tests/environment/cookie-editor-export-intent.test.mjs tests/environment/cookie-editor-react-source.test.mjs
node --test --test-name-pattern 'canonical packer rejects|built React JSX' tests/environment/cookie-editor-react-build.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor --check-project
```

## 2.0.37 一次完整授权：错误处理增量交付（2026-10-24）

继承 `dd8ae879` 及最新 `main` 的完整授权事务，不修改可信 Host：一次明确管理授权包含已声明的读取、敏感值、写入、观察和清理，旧部分授权由一次明确补全完成。敏感值继续默认遮蔽，不进入 React 快照或持久化 UI 状态。

本版移除 Controller 的“独立 Cookie Value 授权”旧提示，分别报告授权不完整、无效敏感值回执、Cookie 冲突、Chrome 权限失效、Store/Partition 不匹配。Chrome 权限失效会清除列表、待处理读取及预检；保存前失败不会写入，已发出的未知写入不重试。SDK 合同测试的离线 fetch fixture 同时修正为：可选远端发行不存在时返回 404，不再错误地把本地目录当成远端发行。

本轮交付快照由 `bbaeb75980d2055c2143a87cba04df601c788818` 加本轮增量组成，**92/92 Node 检查通过**，包括真实产品 Host/Authority 行为和 React 包同源检查。快照排除了任务开始前两处互相冲突的暂存改动（取消精确 Origin 检查、恢复二次 Values 授权断言）；这些并行改动原样保留，当前工作区 Host 测试仍有 **2 项失败**，不能宣称工作区全绿。

唯一正式 JSON 由现有 React 构建、候选门禁、`--promote-from` 与 `--check-project` 生成，版本 **2.0.37**，125194 字节，SHA-256 `33b7c7a5da576a2fbbbffa6b2b752ca73f43dd8185cce8a155539bb385b37da9`。工具 ID 和能力不变；上一个已提交正式包是 2.0.35，旧 2.0.36 仅为源码候选。既有官方包匹配/加载与篡改拒绝已验证，已安装包及 Browser 的发行目录没有被静默替换。

**Mac Chrome 安装、一次授权→编辑→保存→回读→刷新/重开仍为 NOT_TESTED**：本次浏览器工具拒绝读取 `chrome-extension:` 页面，未改用其他浏览器表面或 CDP 绕过。完整 CI、Browser 发行目录重建不在本轮执行。证据和七项独立保守评分见 [交付记录](evidence/one-consent-closeout-20261024.json)；本地 Codex 定向验收命令：

```sh
codex -C /Users/shopme/Documents/workspace/opendesk-browser "读取 examples/sidebar-tools/cookie-editor/evidence/one-consent-closeout-local-acceptance.txt，执行其中限定的本轮原生验收。"
```

## 2.0.36 源码候选：清理 Cookie 仅一次确认（2026-10-23）

**产品目标：** 对当前已授权 HTTP(S) 网站执行安全清理时，先由正式 React「清理本站 Cookie」预览真实 Host-only Cookie 数量；点击其中的「清理 N 条」后，直接使用现有 Browser Host 的精确、一次性操作批准，不再额外显示「确认本次 Cookie 操作」。绝不把删除确认简化成未授权执行。

**实施链路：** `CookieClearDialog` → `CookieEditorApp` → `createCookieController.executeClear` → `createCookieSdkAdapter.beginClearIntent` → 可信 Side Panel `cookieEditor.clear.begin`（真实用户点击，绑定工具安装身份、当前 Document、URL、`previewRef`、`expectedCount`、Cookie 授权代际）→ `browser.cookies.clearSite` → 现有 `browser.intent.confirm` 一次性 Host 回执 → 原生 Chrome 清理及结果校验。无第二个通用确认面板。新 Gate 不能重放，切站、授权撤销、取消或包变更会失效；结果未知时不会自动再执行。

**兼容边界：** 仅精确匹配官方发行的 **2.0.36 及以后** 可将已审阅的 React 清理弹窗作为唯一确认；更早的正式安装版本沿用原 Host 确认以维持可用性。自定义或来源不符的同 ID 安装包不得冒用官方单击特权，用户应从「扩展」中更新官方版本。单条 Cookie 删除、保存、导入、导出已有各自的可信 Intent，不得借此更改授权、Value 单独许可或 Native Store/Partition 限制。

**交付状态：** `tool.config.json` 和 React 包已升级至 **2.0.36**；CI 将基于同源 React 构建候选，经 Node、Host、Chromium 门禁通过后才晋升为可安装的 `cookie-editor.opendesk-tool.json`。在 CI 和 Mac 真实 Chrome 安装/升级验收得到确切证据之前，分别标记 `PENDING` 与 `NOT_TESTED`，不能将源码提交当作完成升级。

**定向回归：**

```bash
node --test tests/environment/cookie-editor-clear-intent.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/cookie-editor-react-controller.test.mjs
node --test examples/sidebar-tools/cookie-editor/preview/react/preview.test.mjs
node --check src/ui/sidebar-tools.js
node --check src/ui/sidebar-tools/cookie-clear-intent.js
```

## 历史安装包 2.0.33（2026-10-23）

由 main 提交 `eec9e83a74c73ca2baf42a35d33ec98728018d1e` 的正式 React 源码，经仓库既有 Vite 构建和规范打包器生成同源候选，版本 **2.0.33**，JSON SHA-256 `6c669c3d6fb6d715e247b242bf16cbfa0a4b998f3924e67b43528f271cd0d13d`。本次明确晋升此候选为唯一正式安装 JSON，未手工修改生成的 CSS/JS。

导出采用 JSON / Cookie Header Popover 及敏感值独立开关。搜索栏位于操作工具栏上方，窄侧边栏中 Popover 不再遮挡搜索输入；查询、列表和编辑草稿仍保持。首次授权继续使用现有可信 Host 单按钮授权、持久状态读回和敏感值独立授权。

代码与安装包的正式 CI、Chromium 门禁必须在本次晋升后重新执行；历史通过的检查不自动算作新版本 PASS。真实 Mac Chrome 安装、升级与用户数据保留未取得本包证据前为 **NOT_TESTED**。

## 历史安装包 2.0.31（2026-10-22）

唯一正式 JSON 已同步当前共享设计 CSS，版本为 **2.0.31**，SHA-256 `899046b569b5f6d9f3b2f84d99e78c880d316fcececb1488452fc24902199cfb`。本次保持工具 ID、能力、HTML 和业务 JS 不变；旧 2.0.30 JSON 的 CSS 与当前源码存在漂移，现由原编译器和打包器重新构建，经定向包/设计测试后晋升，`--check-project` 同源检查通过。

请通过原可信安装器审阅同 ID 更新，保留数据；不要先卸载。在 Chrome 156.0.8078.4 的独立 production Profile，经原可信安装器完成 **2.0.30 → 2.0.31** 审阅升级，并核对安装版本、授权后的真实 Cookie 空态和工作区几何。Browser 候选 SHA-256 为 `642430bddfa2ec8cb087174f625652a3b831934a9b228de54e588b2160c1a092`；原始记录在本机 `artifacts/sidebar-full-height-r13-local-closeout/package-native-closeout/`。此限定结果为 PASS，旧版非空数据保留和完整尺寸/业务验收仍为 `NOT_TESTED`。以下 2.0.30 原生记录仅证明旧候选，不能沿用为新包 PASS。

## 2.0.30 dev 交付记录（2026-10-20，R5.30.3）

当时唯一安装包为 **2.0.30 / opendesk.sidebar-tool.v2**，使用 `opendesk.react-ui.v1`。正式入口 `app/entries/official.jsx` 与离线预览共用 `app/CookieEditorApp.jsx`，完整保留现有列表、原位编辑、导入导出与离线工作区；该轮没有重建预览或重设计界面。

首次在可信设置点击「允许管理所有网站 Cookie」，明确批准 HTTP/HTTPS 范围，之后切站复用授权。该范围仅授予精确匹配官方目录及来源记录的安装包，绑定版本、包摘要、安装代际和 Store；旧单站授权不会自动升级，其他工具不能继承，也不会自动枚举全部网站 Cookie。撤权同时清除本工具旧单站授权。

导出继续使用原 React 工作区。复制、下载在原点击期间取得一次性 Intent，仍经 Host 精确确认操作与回执，不再重复显示「允许本次导出」。只读加载或写入前预检遇到切站时安全取消并重新读取；只有实际写入或导出已经发出才保留未知结果警告，连续事件不能清除该警告，也不会重放操作。

持续开发仍加载 `dist/development`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，复用已有 `npm run dev`。**watcher 不会自动替换已安装工具**：通过「扩展 → Cookie Editor 管理 → 审阅新版 → 确认更新」同 ID 升级。真实 Mac Chrome 测试 Profile 已从 2.0.29 更新到 2.0.30，包 SHA-256 为 `52a78930efae167db0d2482332f9a84e879b19fad81e61bdcbe1fdc653885ac3`；A/B/C 及同域切换无需点重新读取，原位保存重开、工作区导出、单击复制下载、撤权清空均通过。同 Profile 重启后包摘要和授权代际不变，无需重新授权或手动重读；测试 Cookie 已清理。[定向证据](../../../docs/framework/workstreams/evidence/cookie-editor-r5303-20261020/result.json) 分别记录 Node、开发连接及原生操作。用户个人 Chrome 的本次工具升级、最终 production 候选及完整发布验收仍为 `NOT_TESTED`。

## 历史版本说明

以下保留旧版入口和验证记录；其中 2.0.23、2.0.29 等版本及其逐站授权说明不覆盖当前 2.0.30。2.0.29 曾在日常 Chrome 完成更新与核心读写；该历史事实不证明本次个人 Chrome 已升级。

**入口：** Side Panel「扩展」→ **Cookie Editor → 打开**。首次安装浏览器扩展时，可信离线目录自动预装工具包，不运行工具代码、不自动授权 Cookie 网站；旧 Profile 未安装时，直接在「扩展」列表点击「安装」进行可信审阅，然后打开。也可将本目录源码打包为 JSON 后手动导入。默认中文，官方目录为 `installationPolicy: preinstalled`；工具包 **2.0.23 / opendesk.sidebar-tool.v2**。**历史 2.0.4 隔离 CFT 候选**曾通过真实发现、安装、授权、读取、编辑、新建、保存回读和精确删除；该记录仅适用于当时的工具包。**当前 2.0.23 在用户系统 Chrome 的升级及导入仍为 NOT_TESTED**；不能将历史截图、回执或分数延用为当前版本的 PASS/95+。所有 Cookie 修改均从已安装工具 UI 发起。

## 手动导入报错与安装版本（2.0.23）

系统 Chrome 可能仍安装 2.0.19：它会因一条过期记录拒绝整份输入，还保留真实导入 10 条限制，并统一显示 `E_COOKIE_IMPORT`。更新扩展的 `dist/development` **不会自动更新已安装工具或当前 iframe**。在「扩展」中通过原有官方候选的「更新」，或「更多操作 → 导入本地工具包」选择本目录唯一 JSON，核对同 ID `cookie-editor`、版本 **2.0.23** 后确认更新，再主动打开；不要卸载或清数据。更新前保留自己的输入，不能从目录版本推断当前运行版本。

新版逐条区分可导入、过期和无效记录；过期跳过，不改变有效期。预检失败分别指出存储区查询、分区查询、回执校验或已有 Cookie 查询，并保留已知安全错误码（例如 `E_COOKIE_STORE`、`E_COOKIE_PARTITION`、`E_SITE_GRANT_REQUIRED`）；未知错误码回退 `E_COOKIE_IMPORT`，不会显示 Host 异常正文。原输入和格式保留，可在同一输入框修改后重新预览，失败预检不会写 Cookie。不要为排错删除 Store/Partition 或扩大权限。

此前“当前 OpenDesk Browser 尚不支持批量 Cookie 写入”来自当前沙箱公开 SDK 缺少 `cookies.setMany` 的检查，位于写入请求之前。**2.0.23 自动选择已有公开写入接口**：支持 `setMany` 时保持自动分批、每批可信确认；缺少它但支持 `set` 时逐条导入，每条仍需在 OpenDesk 可信窗口确认并回读。界面提前说明确认次数，用户无需判断 iframe 实现；仅两种写入接口均缺失时提示刷新扩展。工具 JSON 与 Chrome 扩展脚本仍分别更新，不从磁盘包版本推断活动文档版本。

两种路径都保留原 Store/Partition 和有效期，遇到拒绝、坏回执、未知结果或目标/授权变化立即停止，不重放剩余记录；批量调用已经发出后不会切换为逐条写入。失败保留原文，需先核对实际 Cookie 后重新预览。日常开发的安全刷新也可能因任务、原生请求或工具未保存输入而延后，不跳过这些保护。

## 快速开始：使用已安装扩展，或编译本地 JSON

**路径 A：使用内置官方工具，不需要单独编译本工具。** 全新 OpenDesk Browser 安装自动预装 Cookie Editor：Side Panel →「扩展」→ Cookie Editor → **打开**；首次使用在工具可信「设置」中独立批准网站和所需 Cookie 权限。对于已有 Chrome Profile，更新版本、重启、访问「扩展」或主动卸载后不会强制补装；如果未安装，会作为默认可见的可信预装候选，选择 **安装 → 审阅能力 → 确认安装 → 打开**。工具安装不运行 Cookie 代码，也不自动批准任何网站。若正在运行的旧版扩展缺少官方候选，仍须让原 `dist/development` 开发构建正确更新；修改 GitHub 源码并不会自动更新已加载的扩展。

**路径 B：安装本地正在开发的版本（推荐用于修改 UI、JS、CSS）。** Node.js 要求 **≥22.12.0**；在仓库根目录运行：

```bash
npm ci --ignore-scripts --no-audit --no-fund  # 初次准备依赖；已有依赖可省略
# 先构建忽略目录下的稳定临时候选，不覆盖根目录的可安装包
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor \
  --out artifacts/sidebar-tools/cookie-editor/candidate.opendesk-tool.json
# 执行本工具的专项 Node、存储、权限和包测试；只有受影响测试 PASS 后才能晋升
node --test tests/environment/cookie-editor-ui.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor \
  --promote-from artifacts/sidebar-tools/cookie-editor/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor --check-project
```

**项目目录已附带可直接导入的 `cookie-editor.opendesk-tool.json`。** 克隆或下载该目录的开发者不需要 Node.js 就能安装测试。它是从 `tool.config.json` 和 `src/` 通过原打包器生成的可移植快照；修改源码后先编译临时候选，完成受影响测试，再按上述 `--promote-from` 显式晋升并将唯一正式包和源码同步提交；失败不覆盖旧正式包，`--check-project` 会检查当前生成字节与提交包一致。不要手工编辑生成的 JSON。

然后在当前 Chrome 的 OpenDesk Side Panel →「扩展」→ **更多操作 → 导入本地工具包**，选择目录内的 `cookie-editor.opendesk-tool.json`（或原 `artifacts/` 输出文件） → 核对 ID `cookie-editor`、版本、文件来源和 Cookies 敏感能力 → **确认安装/更新** → 在已安装列表中点击 **打开**。如果原有同 ID 工具已经安装，应走“更新”而不是先卸载（卸载会清除工具本地数据及授权）。每次改完本工具的 `src/...` 后重新执行上述打包并**明确导入确认**；正式发布更新时同步评审并提高 `tool.config.json` 版本。导入动作本身不运行代码，也不自动授予某个网站的 Cookie 访问权限。

**两个 JSON 的区别：** `tool.config.json` 是构建配置，不能直接导入；`cookie-editor.opendesk-tool.json` 才是可直接安装的发布包。后者由原有 `scripts/build-sidebar-tool.mjs` 生成，`artifacts/sidebar-tools/<id>/<version>/` 是保留的本机输出。随项目提交的预生成 JSON **不是第二份业务源码**，所有修改应从 `src/` 重新打包，自动一致性测试能防止包与代码漂移。该工具是 **OpenDesk Sidebar App**，不是能通过 `chrome://extensions`「加载已解压的扩展程序」直接安装的 Chrome Manifest 扩展。

**什么时候才需要更新整个 OpenDesk Browser？** 日常开发复用既有 `npm run dev` watcher 和固定 `dist/development/`，核对 Chrome 实际加载路径、扩展 ID 及「调试」中的开发连接/构建指纹；不要另起静态构建覆盖 watcher。工具包仍需按同 ID 正式更新。**只有本目录 UI/JS/CSS 变化时，不需要重编整个扩展**。验证真实 Cookie 读写前先打开普通 HTTP(S) 网站，并在已安装工具的可信「设置」明确授权管理所有网站 Cookie；不要把“工具已安装”误当作“已经有 Cookie 权限”。

用于不安装的只读预览：`node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/cookie-editor`。它会生成 `STAGED_NOT_INSTALLED` 快照，**不能**替代正式安装、授权或真实 Chrome 验收。

## 用户能完成什么

1. 在实际 Chrome 打开要管理的网站 → 首次点击「允许管理所有网站 Cookie」。以后读取、保存、导入复用已批准范围，可一键撤销；安装或选择网址不自动授权。Host 继续核对 Chrome 网站权限与每次操作身份。
2. `OpenDeskSDK.browser.cookies.getAll({url})` 读取真实 Chrome Cookie 元数据，显示 Cookie 名称、Domain/Path、Secure/HttpOnly/SameSite、Session/Expiration、Store/Partition。真实值默认隐藏；必须包含 `values` 授权才可按需显示或导出。
3. `cookies.set/remove` 实际新增、编辑、精确删除；原位操作通过真实点击绑定的 Host Intent 验证，原生回读和结果未知不自动重试。Name 可直接修改，并按先新建核验再精确删除旧名称执行（非原子）。未改动的隐藏 Value 仅在获准敏感值权限后临时读取保留；也可主动提供新 Value。未授权时绝不静默写空值。
4. `clearSite` 只清理选定主机的 Host-only Cookie、批准的 Store/Partition、最多 50 条。先生成含 **60 秒、一次性 `previewRef`** 的预览；清理前核对精确 Cookie 身份集合，数量相同而内容改变也拒绝。实际删除仍需可信点击；Worker 重启、撤权会使旧预览不可用。
5. `observe.start/getStatus/read/stop` 手动启动最长 15 秒的有界脱敏变化观察，携带 cursor/gap。事件不传 Cookie 值。
6. 文本或文件可自动识别 JSON 数组、带 `cookies` 的对象、单条记录、名称值字典、Cookie Header 和 Netscape。支持 UTF-8 BOM、`Cookie:` 前缀、分号/换行及值中的等号。预览逐条列出新增、覆盖、过期及无效原因，确认时仅写可导入项并明确统计跳过数；错误后保留原文供修改。JSON 导出可直接回导。真实导出 JSON 默认含值，复制或下载仍需已有敏感值授权与本次最终确认；仅导出属性放在「更多选项」。

### 2.0.20–2.0.23 导入范围

- 真实导入没有每批 10 条、预览 500 条、离线工作区 200 条等用户条数限制；系统自动分批，用户无需拆文件。原文与离线规范数据采用独立的 8 MiB 暂定内存保护预算，超限明确提示并保留输入，不截断。它不是 Chrome Cookie 数量上限。
- 优先使用公开 `cookies.setMany`，系统按 SDK 单请求 12,000 字节合同保留余量，自动分为不超过 11,500 字节 / 50 条且同 Store/Partition 的批次，用户无需拆文件；每批一次可信操作确认。当前 SDK 只有 `cookies.set` 时使用该已有接口逐条导入、逐条可信确认，不因缺少批量 facade 而拒绝整个导入。
- 列表与导入预检使用公开 `cookies.getAllPage` 自动读取全部页；每页按响应字节预算裁切，游标绑定同一快照，数据变化则要求刷新，不拼接不同快照。旧扩展缺少分页接口时仅能使用原单次读取。导出仍受现有公共剪贴板/文本下载 150,000 字节合同约束，不能把该传输预算用于限制导入。
- 每条复用现有 Cookie Service 的写入与 Chrome 原生精确回读。保留有效记录的值、安全属性、路径、过期时间及分区；缺省 Domain/Path/Store 依当前站点和格式语义补齐。显式外域、其他 Store/Partition、重复身份均显示为无效，不改写身份。已过期记录跳过，不延长过期时间或改成会话 Cookie。
- 批次遇到失败或未知结果立即停止，显示已确认数量和原始记录序号，保留原文，不自动重试。预览后发生过期则要求重新预览。

## 唯一架构及授权边界

```text
已安装的普通 Sidebar Tool (不可信 sandbox)
  → OpenDeskSDK.browser.cookies.*
  → 原 Sidebar Tool Bridge
  → Side Panel 真实安装身份/包摘要/Install Epoch/用户明确授权范围
  → 原 Browser Dispatcher / Host
  → 原 createTrustedCookieHost / createCookieService
  → Chrome Native Cookies API
```

任何声明 Cookie Capability 的普通已安装工具都使用同一受信工具设置入口，不因 Cookie Editor 官方来源获得 BUILTIN_TRUSTED 特权。Host 校验真实 Sender、Chrome Cookies + Host Permission、明确 Origin、Store、Partition、Capability、版本/包摘要/Epoch；Page SDK、开发预览和跨工具不得继承授权。敏感值只在当前用户请求中临时显示，不自动写入工具 Storage、草稿、遥测或云端。

**旧内置可信 Cookie 管理 UI 尚保留。** `browser.cookies.approve/execute` 只供历史可信 UI 内部防重放使用，不是工具 SDK；正式 Cookie Editor 在真实 Chrome 通过正反向与生命周期验收后再迁移和去除重复产品入口，避免现有原生 Cookie 功能倒退。

## 验收（真实结果与缺口）

| 项目 | 当前等级 |
| --- | --- |
| 11 项公开 SDK、Schema、Host 与 Tool Capability | SOURCE_WIRED |
| 真实读/值/写/删/清理/观察的 UI 调用 | SOURCE_WIRED |
| V8 JavaScript 语法检查 | PASS（仅语法，不是功能或 Chrome） |
| Cookie/SDK Node 专项测试 | **2.0.6 CI 148/148 PASS**（[原始运行](https://github.com/shopable-ai/opendesk-browser/actions/runs/38566962748)）；旧版通过记录按旧候选保留 |
| 官方工具打包、Check | **2.0.6 CI PASS**；工具包 SHA-256 `4c33f88df17b92331dba197cc4c63535940e6117647267458a7fc1024b5284e9`（CI 候选，不是 Mac 已安装包） |
| Build、Build:dev、Verify | **2.0.6 CI PASS**（未替换或验收 Mac 日常扩展） |
| 完整 npm test | **2.0.6 CI FAIL：2418 PASS / 1 FAIL / 9 SKIP（共 2428）**；唯一失败为旧 Time Review R1.5.1 静态断言，不属于 Cookie Editor；不删除/降低断言 |
| Mac Chrome 安装、真实授权、核心操作/导入导出/清理/观察/撤权/启停/卸载/升级 | **2.0.6 NOT_TESTED**。历史 2.0.4 隔离 CFT 核心流程为 PASS_SCOPED，但不能升级为本版结论 |
| 宽度与 Zoom | **2.0.6 NOT_TESTED**：300/320/360/420/520 CSS px、Side Panel 自身 Zoom、明暗模式均需同包原生截图；旧版 360 px 记录仅供历史参考 |
| 八项产品级专家评分 | NOT_SCORED |

可在真实 Mac 工作区运行：

```bash
node --test tests/environment/browser-sdk-r9-installed-cookies.test.mjs tests/environment/browser-sdk-r7-trusted-cookies.test.mjs tests/environment/browser-sdk-r8-cookies.test.mjs tests/environment/cookie-editor-ui.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor --out artifacts/sidebar-tools/cookie-editor/candidate.opendesk-tool.json
node scripts/build-official-tools.mjs --out artifacts/official-tools-release
npm run check && npm test && npm run build && npm run build:dev && npm run verify
```

测试只使用虚构 Cookie。运行命令及真实 Chrome GUI/CFT 证据必须绑定对应源码输入、工具包 SHA-256 和扩展构建 Hash；不能用 DevTools 直接调用 `chrome.cookies` 冒充用户安装路径验收。R2/R2.1 历史阻塞与组件冒烟保留在原工作流中，不替代 2.0.4 的同候选原生报告。

R3.3 新候选：授权变化后经已有 Bridge 自动检查当前网站；拒绝与读取失败显示独立状态；未完成 Host 操作期间锁定网站与模式控件；普通确认不再采用危险操作红色样式。正式产品默认不进入离线工作区。历史 1.0.0 官方发行仍是离线包，已安装用户必须在「发现工具」明确升级；不能静默同版本替换。

2026-10-14：上述核心旅程、导入导出、清理、观察、升级和生命周期已取得隔离 CFT 的限定原生证据；宽度、Side Panel 自身 Zoom、真实跨 Store/Partition、F3/ZIP 等缺口与全仓 FAIL 继续保留。当前核心、Path 隔离及部分重命名绑定身份保护修复后的候选；未受影响项保留前一候选身份限定复用。本轮原始证据和 Git/CI 状态见原工作流 `r33Local` 与 [续接提示词](../../../docs/framework/prompts/cookie-editor-r33l-core-first-handoff-20261014.zh-CN.txt)。

## R4.3 视觉基准与 2.0.7 源码归属（2026-10-15）

- **已确认的原版 HTML：** `preview/cookie-editor-r4.3-preview.html`，保持已评审的独立 HTML/CSS/JS 原文（模拟数据、无真实 Chrome 授权）。不得把模拟 Cookie 或演示脚本打进 Sandbox 安装包。
- **正式产品：** `src/index.html`、`src/style.css`、`src/main.js`。R4.3 紧凑 Cookie 列表、原位单条编辑、常显导入/导出/新建、展开筛选和导入/导出表单；Browser SDK、Host 原生读写、权限及撤权按已有合同执行。
- **可安装包：** `cookie-editor.opendesk-tool.json` 经既有 packer 的 canonical schema/serializer 与当前 `src/` 一致，版本 2.0.7（历史 R4.3 版本）。`preview/` 不属于发布包。
- **授权边界：** 模拟 HTML 的“允许查看与编辑”不等于真实 Chrome 授权；正式首次授权须经可信工具设置/Host 的真实用户手势。Sandbox 不自行申请或伪造 Cookie 权限。
- **分级验收：** Node、CI、安装包一致性与 Mac Chrome 原生各自记录。2.0.7 无同候选原生证据前标记 `NATIVE_NOT_TESTED`。

## R4.4 源码对齐与验收边界（2026-10-15）

- 黄金原版：`preview/cookie-editor-r4.3-preview.html`；Git Blob `7a129f509814805ab78827eaccbc77a64b20010f`。不得改写、打包模拟数据或复制原型实验台。
- 正式产品：`src/index.html`、`src/style.css`、`src/main.js`。已对齐列表标题右侧高频导入/导出/新建、紧凑名称和 Domain/Path、轻量筛选按钮、原位单条编辑、折叠高级属性、编辑内敏感值显示和精确删除、行内导入导出。宿主已经提供返回/标题/设置，因此不在 Sandbox 内复制演示页首。
- 权限安全：仅真实 Browser SDK/可信 Host 的 Chrome Cookie 读取、写入与删除；网站权限在可信设置中一次明确授权，覆盖本包声明的读取（含敏感值）、写入、观察与清理；可一键撤销。撤权、网站改变、列表失效时立即清除显示出的敏感值；未知写入结果不自动重试；重命名仍先核验写入新名再精确删除旧名。
- 构建规则：先构建忽略的候选，跑完定向测试，再执行当前脚本的 `--promote-from`，最后 `--check-project` 校验源包字节完全一致。不可手工覆盖可安装包。
- 验收状态：R4.4 新候选的 `NODE_NOT_TESTED`、`NATIVE_NOT_TESTED`、`CI_NOT_VERIFIED` 在对应真实执行或 CI 证据建立前始终有效；早期工具包截图或模拟事件不作为通过证据。

### R4.4.1 384px 栅格兼容补丁（2.0.9）

- 修正 R4.4 筛选按钮组沿用了旧四列 Grid 布局的问题：主筛选按钮独占一行，附加排序使用下一行右对齐；确保 384px Side Panel 不挤压控件。
- 这次仅调整正式 CSS、更新三段式版本、重新生成官方安装包及定向断言；黄金预览仍保留原始 Blob，Cookie Host/SDK 业务逻辑不变。
- 2.0.9 仍需真实 Node/CI 和 Chrome 原生截屏验收后才能声明最终通过。

### R4.5 空白草稿误报修复（2.0.10，2026-10-16）

- 新建/编辑时记录字段快照；仅实际变更时发出 dirty。撤销修改后自动 clean；无需因为打开窗口、聚焦、选择导入格式等动作提示未保存。
- 已有 Cookie 未修改就点击保存会关闭编辑面板，不向 Chrome 发起写入或敏感值授权；对敏感值字段，未触碰空白代表保留旧值；明确编辑后清空代表写入空值，且必须触发未保存提醒。
- 预览 R4.3 保持视觉布局，仅修改草稿检测。原始文件保留在 Git 历史。
- 提交的安装包版本 2.0.10，使用同一工具 ID。验收命令：`node --test tests/environment/cookie-editor-r43-parity.test.mjs tests/environment/cookie-editor-ui.test.mjs` 和 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor --check-project`。
- 当前仅为源码与候选包修改，Mac Chrome 已安装文件不会自动覆盖；须明确更新安装包，真实 Chrome 验收仍为 NOT_TESTED。

### R4.5.1 兼容性闭环（2.0.11，2026-10-16）

- 保留 Chrome Cookies SDK 既有显式写入空字符串契约；被遮蔽的值输入框仅在未编辑时才代表保留原值。编辑后清空是明确写入空值，必须显示未保存状态。
- 导出 MIME 类型继续由 `browserTextDownloadUrl` 公共 SDK 实现，CI 测试验证正式宿主调用及 JSON 文件的真实 MIME 映射，不再断言旧宿主文件中必须存在 MIME 常量。
- 与 R4.5 相同，未做 Mac 已安装工具与真实网站 Cookie 原生验收。版本 2.0.11 需通过手动更新同 ID 安装包验证。

### R4.8 复制与下载（2.0.12，2026-10-16）

- 正式 Chrome Cookie 导出区仅显示「复制」「下载」两个主要按钮，顶部关闭仍可取消；预览同名操作同步，320px 起使用两列布局。
- 两者共用授权范围与序列化；默认 JSON 元数据不含值且无法恢复，含值备份每次最终确认，读取走独立敏感值授权。
- 复制复用 `OpenDeskSDK.browser.clipboard.writeText`，下载复用 `OpenDeskSDK.browser.downloads.text`；错误不回显不可信 SDK 文本，跨网站及授权变化时废弃旧异步结果。
- GitHub 源码与静态校验不等于本机 Node 测试或真实 Chrome 验收，安装后必须在 Mac 进行原生验证。

### R4.8.1 双按钮精简布局（2.0.13，2026-10-16）

- 正式导出区域与 HTML 预览只保留并列的「复制」「下载」两个操作按钮，不增加按钮下方逐项功能说明；小宽度下均分空间。
- 导出格式说明、敏感 Cookie 值读取授权与最终操作确认仍沿用原有机制，不新增提示弹窗或业务接口。
- 以 DOM 静态回归断言守护按钮数量、名称与无附属说明；真实 Mac Chrome 安装仍需单独验收。


## R4.10 · 正式 UI 迁移与 SDK 约束（2026-10-16）

- R4.9.2 获用户确认的紧凑列表、原位唯一编辑器、左 Label / 右 Input、Value 右侧显示按钮和行内放弃提示，已迁入现有原生 JS Sandbox；**没有**迁移 preview 的虚构 Cookie、授权或 Blob 下载实现。
- 正式导出默认选 JSON 含值备份；「更多选项」可以改成无值属性清单。每次敏感复制/下载均先进行可信确认，随后独立通过 `OpenDeskSDK.browser.cookies.*` 请求本网站已授权 Value，才调用正式 `browser.clipboard.writeText` / `browser.downloads.text`。
- 真实导入继续使用同一解析/预检/Store-Partition 身份保护/逐条 Host 确认路径；格式默认为自动识别，低频手动指定收于折叠项。
- React 19 预览 CI [38895344576](https://github.com/shopable-ai/opendesk-browser/actions/runs/38895344576) PASS，但压缩后 UI JS **219999 / 220000** 代码单元、离线 HTML 317263 字节，还不包括正式业务；故正式 UI 使用原生 JS。该 CI 不能证明正式安装。
- R4.8「默认仅属性」属于历史方案，**不是**当前正式产品合同。正式 JSON 默认包括经本次授权读取的可导出 Cookie 值；不具有未经授权的全浏览器备份能力。
- Node / CI / 同源包体积 / Native Chrome 的验收状态须以 2.0.16 同一提交的实际执行结果为准；未执行不得沿用旧版本 PASS。

### R4.10.1 · SDK 错误回执脱敏加固（2.0.16，2026-10-16）

- 正式 Cookie 保存/重命名、删除、清理、观察、导入预检/部分成功，以及离线剪贴板/下载异常，不再向 UI 直接回显 SDK/Host 的未经脱敏错误字符串或代码；仅显示已知代码与受控提示。
- 新增 3 项虚构 Cookie 值的异常回执测试，检查草稿保留及意外敏感值不进入状态文本。已批准 R4.9.2 界面和公开 SDK 调用不改动。
- 最新 Mac Chrome 安装、同 ID 升级、系统剪贴板及宽度/缩放矩阵仍为 NOT_TESTED，必须取得同一候选原生证据。

### R4.10.3 · 已核实删除后的编辑器收尾（2.0.17）

- 本机真实 Chrome 复现：精确删除已由 Native 回读确认，紧凑列表清空，但旧编辑器仍显示失效草稿。
- 仅在 Host 返回 `removed: true / verified: true` 且目标仍有效时，调用现有编辑器清理；取消、未知结果和目标变化仍保留原有安全处理。
- 原 R4.9.2 UI、工具 ID、SDK、权限及安装合同保持原状。最终同候选测试与原始 Native 回执见本轮 `cookie-editor-r4103-local-mac-01a14571` 工作记录；旧 2.0.16 证据不提升为本版 PASS。

### R4.10.3 · 2.0.19 安全回归

Store 绑定后重复身份在写入前拒绝；隐藏已编辑值时同步清除旧值显示；切站 UNKNOWN 提示保留到人工核对；关闭导入或选择新文件会作废旧的异步读取。5 个行为回归先复现后修复。2.0.17 的真实 Mac CRUD 13/13、历史 2.0.15 同 ID 升级 9/9 与导入导出逐项回执保留在本地工作流，不能替代本版本原生验收。

R4.10.3 文件读取回归补充：普通文件 input/change 冒泡不会取消本次读取；关闭、修改文本或选择新文件仍使旧异步结果失效。2.0.18 候选因冒泡回归拒收，其构建证据不代表产品验收；2.0.19 原生验收待绑定当前候选。

### 当前网站一次授权

在可信设置中点击一次「允许管理本站 Cookie」，即可复用本工具声明的网站权限，不再逐项点击授权按钮。授权后同一位置提供「撤销本站授权」。只作用于当前网站和当前安装身份；删除与敏感导出仍保留操作确认。常规验收聚焦真实写入、文件导入和原生回读，不反复执行授权边界矩阵。

本轮本地验收：Chrome for Testing 155.0.8059.39 的 production 候选（源码 `6087d273`）已通过同一 Profile 的 9/9 项短流程：正式安装、当前网站一次授权、保存、macOS 文件选择器 JSON 导入、原生回读、精确清理及撤权。production/development、verify、check 均通过。按用户要求停止反复授权矩阵；完整导出、升级、宽度/缩放和十维 95+ 未在此候选重新验收，不标为 PASS。
