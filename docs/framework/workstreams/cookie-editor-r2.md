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
