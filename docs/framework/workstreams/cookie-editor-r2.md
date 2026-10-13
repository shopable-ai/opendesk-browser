## 2.0.4 当前验收结果（2026-10-14）

**已安装 Cookie Editor 的核心用户旅程已在同一隔离 CFT 候选通过**：发现安装 → 打开 Side Panel → 网站授权 → 自动读取 → 新建 → 修改 Value → 修改 Name → 保存回读 → 精确删除。默认中文、Value 默认隐藏。全仓集成仍 **FAIL**，不宣称正式交付或 95+。

本轮修复保存、精确删除和启停授权：opaque iframe 内原生表单提交被 CSP 阻止，保存改由受控按钮/快捷键入口调用；Chrome `cookies.remove(url,name)` 实际删除不同 Path 的同名 Cookie，Driver 改为精确作用域的过期写入并核验；停用/启用的安装 epoch 变化使有效网站授权失效，生命周期在既有锁内仅迁移同版本、同包、同旧 epoch 的有效授权，旧实例和旧请求继续失效。提交前复核另外复现了 Path 消失后的查询竞态，Host 现传递已审核的脱敏精确身份，Driver 不匹配即在写入前拒绝，保留相邻 Path。重命名是分步操作，**不是原子事务**。

| 用户步骤 | 原生证据 | 结论与边界 |
| --- | --- | --- |
| 发现、安装、Side Panel、授权、自动读取、新建、编辑、重命名、回读、删除 | core | PASS_SCOPED；新值无需旧值读取授权，隐藏旧值在明确获准读取后可保留 |
| 同作用域重命名冲突、隐藏旧值缺授权、同名不同 Path 删除 | conflictAndPath | PASS_SCOPED；冲突不覆盖，缺授权不写入，删除仅影响选中 Path |
| 重命名新名称成功，旧名称删除授权被取消 | partialRename | PASS_SCOPED；准确报告部分完成，两项 Cookie 均保留，无自动重放 |
| 导入、导出、清理、观察 | advanced（前一候选） | PASS_SCOPED；操作均经已安装 UI 及相应 Host 授权；观察不泄露 Value |
| 撤权、停止、启用、卸载、重新安装 | lifecycle（前一候选） | PASS_SCOPED；旧操作失效、授权按有效身份保留，卸载清理授权，重装重新授权 |
| 已安装 2.0.3 明确升级到 2.0.4 | upgrade（前一候选） | PASS_SCOPED；升级审核、旧授权不继承、重新授权后保存及删除通过 |
| 长名称、Value 隐藏、360px Side Panel | visual（前一候选） | PASS_SCOPED；网站 Zoom 100/125/150/200 已捕获，但 Side Panel 仍为 100% |

其他宽度 300/320/420/520px、Side Panel 自身 Zoom 125/150/200%、跨真实 Store/Partition、真实 Chrome 删除竞态的精确交错和未实际调用的 SDK 操作保留 **NOT_TESTED**。删除竞态有 Node 回归和独立复核，不能提升为 Native 竞态 PASS。辅助功能赋值与键盘调整未改变 360px 读回；不能将网站 Zoom 当成 Side Panel Zoom。独立 F3、ZIP 安装一致性、CWS 与正式评分均未完成。

定向测试：UI 45/45、Cookie Driver 31/31、启停生命周期 17/17。Check、隔离 Build、Build:dev、两种 Verify 通过。身份竞态修复后最终全仓集成：2292 项、2267 通过、23 失败、2 跳过，本轮 Cookie 用例无失败；[原始日志](../../../artifacts/cookie-editor-local-acceptance/20261014/npm-test-exact-identity-integration.log)。此前 2289 项 / 21 失败、早期 111 项及全部失败快照保留为历史证据。

工具版本 `2.0.4`，工具文件 SHA-256 `00034592e094d5a6f513a58bc04233a9793573f1d165a0e990489aead508fa9c`；当前 production Verify Hash `6650cb095517c0f0f3d77421a3efe513ebd3f5b19c9127eba2a9eacf06ec6f68`；development Verify Hash `468e117719f2fec775f7596b9aea664b7afd778700c55c80f9309be854befe73`。当前 Native 扩展 ID `igpeopfnlionaohinofebijkhfliljfp`，原生扩展目录指纹 `edb1e04566f0e3022233c99a6408bd92500fcaada783104345a3b8920ebc73e0`，CFT `155.0.8059.39`。这些 Hash 使用各自的算法，不互相替代。

候选来自既有隔离源码快照加本任务修复，**不是全部当前并行 main 改动的构建**。当前 core / conflictAndPath / partialRename 三组报告记录 `candidateUnchanged` 及 cleanup PASS；未受影响的导入导出、观察、生命周期和布局输入未变，其前一候选证据保留原身份限定复用，不能合写为全部同候选 PASS。详情、截图 SHA、原始报告及前一候选身份写在原 JSON `r33Local.nativeUi` / `priorNativeCandidate`。日常 `dist/development`、真实用户 Chrome 和其他 Agent 工作均未被替换。当前正串行复核本任务提交范围；Git/CI 结果在本账本追加。

## 核心功能优先交接基线（2026-10-14，历史）

用户最新要求：先完成真实 Cookie Editor 核心功能，停止扩大到无关全仓相关性排查。续接提示词：[Cookie Editor 核心功能优先](../prompts/cookie-editor-r33l-core-first-handoff-20261014.zh-CN.txt)。本轮状态在 JSON `r33Local`，未提交、未推送；起始及交接 HEAD 为 `349a64be5a36419a78770a1154a30db16a871fb0`。

- 原重点测试复现 31 项 / 19 通过 / 12 失败；九份专项当前 111 通过 / 0 失败 / 0 跳过，保留原 93 项并增加 18 项。UI 专项 42/42。修复以 fixture、异步判定和合同验证为主，未放宽安全检查；产品源码仅清理过期注释。
- 候选工具版本 2.0.3；工具与官方目录打包、Check 通过；隔离源码快照 Build、Build:dev、Verify 通过。工具 SHA-256：`abef8fbc408eab4cb09b74f6205253e44dd18e51f6f476a4111d5daba07dcf59`，详细身份见 `artifacts/cookie-editor-local-acceptance/20261014/package-identity.json`。
- 全仓 npm test **FAIL**：工作区 2219 项 / 2137 通过 / 80 失败 / 2 跳过；构建快照 2236 项 / 2169 通过 / 65 失败 / 2 跳过。补充 Sidebar Tools 两份测试 80 项 / 79 通过 / 1 失败 / 0 跳过。原始结果保留，不能报全仓通过；无关排查延至核心闭环稳定后。
- 隔离 Chrome 仅启动，未安装工具或完成 Cookie 操作；11 项 SDK Native 均 **NOT_TESTED**。`tests/framework/cookie-editor-r33-native.mjs` 已准备且语法通过，**从未执行**，接手先审查可信输入与实际安装路径。
- 本轮独占 CFT 已退出、Profile 已清理，`native-interactive/cleanup.json` 为 cleanup PASS。日常 watcher、日常扩展和其他工作流浏览器未被替换。原始证据目录：`artifacts/cookie-editor-local-acceptance/20261014/`。

下一步直接核对最新 main、相关 diff 与候选身份，进入已安装 Side Panel 的“安装 → 网站授权 → 自动读取 → 新建 → 修改 Value → 重命名并精确删旧 → 删除”真实旅程；有实际失败即修复。核心完成后补导入导出、清理、观察、生命周期与布局验收，再集中进行最终集成验证、安全提交推送及 CI 核查。无 Native 证据不能自评最终 95+。

## Cookie Editor R3.3 · 授权自动读取与安装升级候选（2026-10-13）

- **新候选版本 2.0.2**：正式安装器拒绝同版本自动替换，因此真实源码修复必须从旧 2.0.1 升级版本；已安装旧包不会被 GitHub 源码自动覆盖。官方 Catalog 仍是 optional，依正式打包生成当前候选资源。
- **授权变化自动检查**：现有 Bridge 发送的 `opendesk-cookie-grants-changed` 清空敏感值、旧列表和旧编辑意图；已授权时通过唯一公开 SDK 重新读取，撤权则返回授权拒绝，不显示成“空 Cookie”。
- **并发与简化 UI**：Host 操作未完成时禁用网址切换及模式切换；手动网址编辑清除旧范围缓存，恢复确认的网址会刷新；异步网页切换重置控件。仅删除、清理等危险确认使用红色按钮。
- **历史发行残留定位**：`official-tools/releases/r5-20261012-cookie-editor-1.0.0.json` 的描述明确是“本地临时工作区、真实浏览器 Cookie API 待接入”。最新源文件不是该离线历史版；Chrome 已安装旧版需审阅升级，不能仅以源码删除文字替代升级。
- **CI 事实**：R3.2 首次 run `38412243566` 为 `completed/cancelled`，不是 Node / Build PASS。R3.3 变更 SHA 独立组、取消自动终止，补 `npm test`；运行结果以 GitHub Actions 最终回执为准。
- **验收级别**：此处新增源码与 Node 回归用例属于 `SOURCE_WIRED`。本环境无用户 Mac 工作目录及 Chrome GUI，现阶段新候选 `NODE_PASS`、`BUILD_PASS`、`NATIVE_PASS` 均不可冒领。旧可信 Cookie UI 等新工具真实 Chrome 完整替代验收后才考虑移除。

---

## Cookie Editor R3.1 · 实际核心修复续接（2026-10-13）

本节覆盖下方 R3 / R2 旧快照，**不表示 Native PASS**。

- **Cookie 分区是真实查询，不是空筛选**：新 `scopedLiveCookies` 分别调用正式 `cookies.getAll({url})` 与已获批准的 `cookies.getPartitionKey/getAll({url,partitionKey})`，按精确身份合并且有界；任一必要范围读取失败则不把部分结果冒充完整站点数据。真实含值导出也用相同双范围逻辑。
- **真实导入预览不再依赖旧列表**：最多 10 条，先验证批准 Store / Partition；再按每条 Cookie 的实际 Path 调用 `getAll` 检查新增或覆盖，所有原生写入参数预校验后才出现确认。
- **整站授权撤销原子化**：`cookieCapability:'all',enabled:false` 仅是原受信 Host 内部的撤权操作，并非第三方 SDK 公共方法。一次存储确认撤销该站点全部读/值/写/清理/观察；拒绝一次性全开放权限。新增能力不能悄然将早期授权迁移到另一个 Cookie Store/Partition。
- **原生同名多 Path 删除回执修复**：复用 `src/platform/chrome/cookies.js`，把删除后的 `cookies.get()` 非精确判断改为对被删除 Name/Domain/Path/Store/Partition 的 `getAll()` 精确回读。清理每条 Cookie 同样按精确身份校验；同名其他 Path 仍存在是正确结果，不是失败。Native `getAll` 即使返回更宽范围，清理前仍二次按 Store/Partition/HostOnly 限定。
- **未知副作用绝不误报成功**：Cookie Editor 新增/删除/清理/批量导入只有在收到结构完整的真实确认后才自动刷新。失败或 `E_OUTCOME_UNKNOWN` 明确提示手动核查，不重复写入。Domain Cookie 写入确认提示可能影响子域名。
- **真实列表效率**：按名称、域名、Path 和过期日期排序，保留搜索/筛选；高风险批量操作仍放在折叠区，不抢首屏。

**已写入对应源码与测试**：`examples/sidebar-tools/cookie-editor/src/{main.js,index.html}`、`src/platform/chrome/cookies.js`、`src/platform/chrome/context-menus.js`、`src/ui/sidebar-tools.js`、`tests/environment/{cookie-editor-ui,browser-sdk-r8-cookies,browser-sdk-r9-installed-host}.test.mjs`。其中 Driver 的精确同名 Path 删除与跨 Store/Partition 清理隔离，**本轮实际在受控 V8 引擎从当前真实源码执行了 2 项 mock 级功能测试：2/2 PASS**。对 10 个核心 JS / HTML 文件的 V8 语法/ID 静态检查 10/10 PASS。**这些不是 Node test，也不是 Chrome Native PASS**，不提供扩展包 Hash、Mac Chrome 版本或实际截图。

**并行限制**：Browser SDK R10.1 同时编辑 2.3 MB 正式接口矩阵（非 Cookies 的 Downloads 条目）。本轮不覆盖冲突的矩阵文件；当前 Cookie PartitionKey 运行时 Schema 已支持 schemeful HTTP(S)，矩阵内旧 HTTPS-only 描述需由 SDK 集成者串行合并并重新验证，不另建 Registry。最近其他 Agent 添加的 SDK 接口数量可能超过本 R3 最初快照的 40 项，必须动态以 `BROWSER_OPERATIONS` 为准。

**当前必过门槛仍为**：官方工具打包、专项 Node、`npm run check/test/build/build:dev/verify`、真实 Chrome 已安装工具的授权/读/写/值/分区/删除/清理/观察/撤权/Worker 重启/升级停用卸载、R27 多宽度及 Chrome Zoom。当前会话没有 Mac Chrome 原生环境；以上没有真实运行结果仍为 `NOT_TESTED`。旧受信 Cookie UI 与私有 `approve/execute` 暂不删除，必须等新 Consumer 的原生闭环验证安全后再迁移。

---

# Cookie Editor R3 · 当前真实源码状态（2026-10-13）

> 以下 R2 / R2.1 历史段落原文保留，但其中的「尚未有公开 SDK」「仅离线操作」「v1.1.1」均已经过时，不再代表最新 main。**此处 R3 为当前状态**；源码接线不是同候选真实 Chrome Native PASS。

## 用户价值与功能树

| 用户核心场景 | 源码 | 当前验证与保留阻塞 |
| --- | --- | --- |
| 官方发现并安装独立 Cookie Editor v2.0.0（optional） | SOURCE_WIRED | 真实 Chrome 安装、升级回执 NOT_TESTED |
| `OpenDeskSDK.browser.cookies` 11 项，统一 Registry 40 项 | SOURCE_WIRED | Node/Build/Native 最新候选 NOT_TESTED |
| 已安装普通工具按 Origin、Capability、Store/Partition 授权 | SOURCE_WIRED | 原生 Sender、跨工具、撤权、升级、停用回归 NOT_TESTED |
| 普通重复读取 Cookie 元数据，值默认脱敏 | SOURCE_WIRED | Native read/Path/Store/Partition NOT_TESTED |
| 另行授权敏感值；按需显示/下载，不写入草稿 | SOURCE_WIRED | 实际授权后原生读取和泄漏检查 NOT_TESTED |
| 创建、编辑、精确删除，真实回读及未知效果不自动重试 | SOURCE_WIRED | Native 写入/删除及同名不同 Path 拒绝 NOT_TESTED |
| JSON / Header / Netscape 离线与真实导入导出 | SOURCE_WIRED | 逐条 Chrome 写入和保存文件原生验收 NOT_TESTED |
| EXACT_HOST_HOST_ONLY 预览→确认→实际清理 | SOURCE_WIRED | ≤50；一次性 60 秒 `previewRef` 绑定完整 Cookie 身份集合；Node 和 Chrome 执行 NOT_TESTED |
| 有界 Cookie observe.start/status/read/stop 与 Cursor/Gap | SOURCE_WIRED | 跨工具/重启/撤权和事件作用域 Native NOT_TESTED |
| Side Panel R27/R20 布局、移动宽度和缩放 | SOURCE_WIRED | 300/320/360/420/520px 与 125–200% 真实 Chrome 视觉 NOT_TESTED |
| 旧可信 UI `approve/execute` 消费者及重复产品入口迁移 | BLOCKED | **暂不删除**现有唯一已知可用受信 UI，须新 Consumer 正反向 Native 通过 |
| 95+ 专家正式验收 | NOT_SCORED | 同候选完整 Node/Build/Verify/Native/生命周期证据欠缺 |

**唯一通路：** Cookie Editor v2 普通已安装工具 → `OpenDeskSDK.browser.cookies.*` → 既有 Sidebar Tool Bridge → Side Panel 安装与授权 Authority → 原 Browser Dispatcher/Host → 原 `createTrustedCookieHost` + `createCookieService` → Chrome Native。没有第二套 Cookies Host、Cookie Service、安装器或权限数据库。

**当前 GitHub main 源码记录（不等于验收 PASS）：** SDK `994e7b2`；安装工具受限 Host `69859eb`；Dispatcher `58dcda2`；受信逐站 UI `54f6abc`；Cookie Editor 包 v2 `d0964a8`；真实操作 UI `7883280` / `213b393`；正式矩阵 `0dbc459`；总账 `1ed1641`；专项 Node 测试已编写 `dee77be`；预览身份快照 `6d6c4ac`；正式预览合同 `ee4d906`；通用 Cookie 工具权限设置 `725f31a`；原受信 UI 仍保留。

**实际验证边界：** GitHub 源码已写入，部分 JavaScript 在隔离 V8 引擎进行过语法解析（不是 Node 测试）；当前工作环境不提供用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser`、Chrome GUI/Profile、Node 构建工作目录。正式 `node --test`、`npm run check`、`npm test`、`npm run build`、`npm run build:dev`、`npm run verify` 与 Mac Chrome 实际安装均未在本候选执行。历史 R2 V8 冒烟只是旧候选组件证据，不可继承 R3 Node/Native PASS。Chrome 真实版本、扩展包 SHA、Cookie Editor 包 SHA 和截图均不得虚构。

**下一关键任务：** 实际 Node /官方工具打包/Verify → 修复真实失败 → Mac Chrome 真实安装、逐站授权与撤权、真实 CRUD、敏感值、Clear、Observe、重启、升级/停用/卸载 → 基于通过证据迁移旧可信 UI 并移除重复入口 → 才能评分或标记 Native PASS。

---

# Cookie Editor R2 · 真实产品边界与源码进度

日期：2026-10-13；目标：`shopable-ai/opendesk-browser` / `main`。

## 源码事实

- 核查公开 `src/framework/sdk/browser.js`、`browser-contract.js`：**无 `browser.cookies.*`**（无正式工具 Host 读取、写入与 values 授权）。
- 核查 `src/ui/sidebar-tools/package.js`：当前允许 Capability 白名单中**无 `browser.cookies.*`**；普通工具声明该能力会安装失败。
- 因此 R2 不能安全宣称已提供真实读写。这是 **SDK R9 BLOCKED**，不新建 Cookie Host、RPC、权限库，不向 Cookie Editor 特许 BUILTIN_TRUSTED。
- 原有可选官方安装入口存在；本轮不修改 `official-tools/catalog.json` 的 `optional` 策略。

## 本轮拥有的源码变更

- `src/index.html`：真实/离线双模式导航；明确网站 URL 选择与当前页；权限信息折叠；真实元数据专属列表与阻塞态。
- `src/style.css`：长网站名/URL 省略、窄屏选择器折行、Side Panel 紧凑密度、独立模式状态与焦点。
- `src/main.js`：独立内存所有权、站点选择与 Epoch 失效、只读公开 SDK 适配入口 `cookies.getAll`、授权状态先检查、返回值无条件脱敏。离线格式逻辑保留；**不调用任何真实 Cookie 写/删**。
- `tool.config.json`：提升版本至 1.1.0，仍只声明当前安装器接受的旧权限，功能描述准确标记未接通。
- `README.zh-CN.md`：用户可用的离线功能、真实阻塞、R9 集成合同及测试说明。
- `tests/environment/cookie-editor-ui.test.mjs`：补接口隔离、URL sanitization、敏感值脱敏、真实写入禁用负向断言。

## 状态与证据（不得混级）

| 项 | 状态 | 依据 |
| --- | --- | --- |
| 已有离线功能与 UI 双模式 | SOURCE_WIRED | 远端 GitHub 源码及静态 JS 语法核对 |
| 公开 SDK 消费者 `getAll` | BLOCKED | 无正式 SDK、Host、Capability；该适配入口默认禁用 |
| 元数据默认脱敏 | SOURCE_WIRED | 客户端 `redactMetadata` 丢弃值；仍依赖 R9 Host 强制权限 |
| 真实写/删、Cookie 值、clearSite/observe | BLOCKED | 只能由 R9 正式接口与授权生效后接通 |
| Node 测试 | NOT_TESTED | 无用户 Mac 工作目录及依赖环境访问 |
| V8 受控组件/SDK 拒绝冒烟 | COMPONENT_SMOKE_PASS | 虚拟 DOM + SDK stub：无授权不读取、授权后只读元数据、丢弃 value、未确认网址拒绝读取；不是 Node/原生 Chrome |
| 官方工具打包、Build、Verify | NOT_TESTED | 未运行仓库构建命令；不伪造包 SHA |
| Native Mac Chrome/CFT | NOT_TESTED | 无真实扩展安装、授权与截图回执 |
| 完整产品 95+ | NOT_SCORED | 关键 SDK 阻塞与原生验收缺失 |

### R9 必须交付的阻塞合同

1. Public `browser.cookies.getAll/get/set/remove` 参数与结果、Host only site Store/Partition 和精确 Cookie ID。
2. 可用的普通 Sidebar Tool Capability 白名单与审阅、Origin grant、Chrome Permission、撤权、工具安装身份/epoch、升级包 hash。
3. 独立 values capability 强制 Host 默认脱敏，敏感值不会泄漏给只读工具。
4. `clearSite` 精确范围预览+单次确认及失败/剩余数回执；observe 有界脱敏事件。
5. 接入后在真实 Mac Chrome 测试多个 Path、Store、Partition、HttpOnly、前缀、撤权和副作用未知场景。

**并行约束：** 本轮仅写 Cookie Editor 自有文件、专项测试和 R2 工作流。没有访问用户 Mac `git status`，不能判断本机是否有其他 Agent 未提交修改；禁止覆盖本地工作。GitHub 远端仅在目标 Blob 未变时条件提交，不修改 SDK R9 工作流及核心代码。

## R2.0.1 小修正（2026-10-13）

- 当用户编辑目标 URL 而未点击「选择」时，禁用真实读取，避免读取原网站的 Cookie。
- 在读取权限的异步等待期间切换站点，禁止旧请求继续落到旧网址；不在失败或未知效果时自动重试。
- 持久 Cookie 元数据附带过期时间（有原始值时）；补充 Node 合同测试源码用例。
- 本次通过 V8 受控组件冒烟及语法检查，`node --test`、Build/Verify、真实 Mac Chrome 仍 **NOT_TESTED**。


## R2.1 调用链重新核查与产品修正（2026-10-13）

- 底层原生驱动：`src/platform/chrome/cookies.js` 已存在，受信代码可访问真实 Chrome Cookie。
- Host-only 11 项：`src/platform/chrome/browser-cookie-host.js` 登记 Cookie get/getAll/set/remove/clearSite/store/partition 和 observe 四项，`src/ui/trusted-cookie-workbench.js` 通过私有 `browser.cookies.approve/execute` 消费。
- 普通已安装工具：`src/framework/sdk/browser.js` 尚无公开 `cookies` 命名空间；`src/ui/sidebar-tools/package.js` 尚无 Cookie Capability，故 Cookie Editor **BLOCKED**，不能把受信 Host 原始值直接交给工具沙箱。
- 当前工具页另有一个可信内置「Cookie 管理」面板，这与官方可选 Cookie Editor 是两个真实界面。未来统一到正式 SDK 后再删除重复产品入口；R2 不先破坏唯一能调用真实 Cookie 的可信入口。
- 关键合同不匹配：可信 Host `getAll` 为当前活跃 Tab/Document 且返回 `{cookies,scope}`；Cookie Editor 需要按独立授权网站 `getAll({url})`，采用一份 Chrome Native First 返回合同。必须由 R9 的唯一 Host/Authority 正式接通；不能使用私有 approve/execute 或绕过当前 Tab/Store/Partition 限制。
- 可信 `clearSite` 当前是 CURRENT_URL_MATCHES，并非 Exact Host Host-only 预览+确认+≤50 条，不可原样暴露为公开批量清理。
- 本次 Cookie Editor 修正：v1.1.1；按浏览器/离线模式正确展示网站身份；用户主动刷新时经正式 SDK 授权门控再读；输入目标网址未确认时禁止显示过期异步结果；保留分区的 `hasCrossSiteAncestor` 元数据；精简用户可见阻塞文案。
- V8 隔离组件模拟检查已通过（授权拒绝、预留公开读取、脱敏、分区元数据、手动刷新、站点切换）。这属于 **synthetic component**；Node、Build、Verify 与真实 Mac Chrome 均 **NOT_TESTED**。没有可绑定最终候选的 Native 证据，不给 95+ 正式评分。
# 2026-10-14 核心用户旅程续接

- 负责人：当前 Codex App Cookie Editor 核心旅程；接手前 ownerReleased=true。
- main 核对：本地与 origin/main 均为 89c3b298；保留全部其他 Agent 未提交改动。
- 本轮写入：原 Cookie Editor MD/JSON/README、Cookie Editor 自有源码与对应定向测试、`tests/framework/cookie-editor-r33-native.mjs`。Host/SDK 若真实失败才声明具体文件并复核 diff 后修复。
- 资源：复用 127.0.0.1:43111 标准受控网页服务；独占新 CFT/Profile；复用 `artifacts/cookie-editor-local-acceptance/20261014/build-workspace/dist/production`，不覆盖日常 dist/development；新原始证据只追加到既有证据根。
- 顺序：真实发现/安装/授权/自动读取/新建/Value/Name/回读/精确删除；现有 111 项与隔离构建证据按身份复用，全仓 FAIL 保留。
- 原生不同 Path 删除暴露真实 Host 缺陷，扩展写入范围为 `src/platform/chrome/cookies.js` 与 R8/R9 Cookie 定向测试；读取当前 diff 确认这些文件无其他未提交修改。继续沿用现有 Driver/Authority，仅替换不精确的原生删除动作，保留原始失败快照和未知结果保守规则。
- 停用再启用暴露持久授权 epoch 未迁移的问题，新增精确写入范围 `src/ui/sidebar-tools/installation.js`、`tests/environment/sidebar-tool-enable-r26.test.mjs`；当前 diff 为空。保留同包、同旧 epoch 的有效授权，继续更新撤销标识以拒绝旧实例/请求，失败保持停用。
- 提交前独立复核复现删除竞态：Host 审核的 Path 消失后，Driver 再次 URL 查询可能选择同名父 Path。新增写入范围 `src/platform/chrome/browser-cookie-host.js`（读回 diff 无本地修改）；由 Host 传递已审核的脱敏精确身份，Driver 不匹配则执行前拒绝。定向回归由 Codex 原生子 Agent 独占 `tests/environment/browser-sdk-r9-installed-cookies.test.mjs`，其余文件由当前负责人落盘；冻结候选与原生结果保留，修复后另建独立候选输出并仅补受影响验证。
