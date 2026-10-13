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
