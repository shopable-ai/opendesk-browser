# 授权 UX 审计与普通操作收敛（2026-10-31）

## 本轮结果与证据范围

本轮在现有 `main` 上审计安装、启停、网站范围、开发 Run、任务/计划及 Browser SDK 的授权入口，修复已证实的普通操作逐次审阅。类型为通用 Browser Framework / SDK；业务消费者保持其真实 owner，未新建 Registry、Host、Authority 或工具副本。复用既有 `browserOperation` 元数据、`dispatchScoped`、Chrome Drivers、`createToolPermissionConsent` 与单次 intent 通道。

源码中的下一条用户操作是：已安装工具打开网页、控制自有标签页、下载指定 URL、新增/编辑/移动书签。旧可信 Sidebar 与 Host 将这些操作统一视为一次写入一次确认，连已授予的普通能力也重复审阅。本轮使下列 **12 项**复用现有授权：

- `browser.tabs.create/activateOwned/pinOwned/reloadOwned/navigateOwned/removeOwned`。
- `browser.downloads.download/cancelOwned`。
- `browser.bookmarks.createOwned/create/update/move`。

首次 Owned 书签缺少 Chrome bookmarks 或目标网站权限时仍申请。`removeOwned` 如缺 Chrome 权限，在其原有删除确认点击内申请，不增加第二次 Host 审阅。网络观察仍审阅本次采集，只在实际缺少 `webRequest` 时请求 Chrome 权限。普通 HTTP 请求已在先行提交 `369715404` 收敛，本轮保留该行为。

这是源码及定向 Node 证据。**本轮真实 Chrome 为 `NOT_TESTED`**：首次检查时原生 UI 由其他 chat 占用，未抢占、重载或安装；结束时锁已释放，但这不证明新候选已加载。没有新核验当前 Chrome 加载路径、真实扩展 ID、serve 连接或构建指纹；日常入口仍应按现有 `dist/development` watcher 合同使用。本轮未运行全量构建、生产验收、缩放/宽度矩阵或评分，也未改工具正式包。

## 授权层与复用规则

安装审阅批准工具当前包的能力；Chrome optional/host permission 仍须真实用户手势申请。网站 opt-out、全书签范围、Cookie 值/写入范围、持续采集及未来计划具有各自的数据/时间范围，不能从普通安装能力或另一个工具继承。

`requiresUserGesture` 在本仓库还承担 OpenDesk 的可信意图审阅标记，**不等同于 Chrome 对每个 API 的平台强制要求**。本轮仅从普通操作移除该标记；实际分派仍走原 scoped Host，复核包 SHA、安装代际、启停、能力、Chrome 权限、Origin、Document 与资源归属。查询状态不是授权事实；权限在查询后变化时，执行仍拒绝。

等待预算也不是授权：Owned 首次书签申请与 URL 下载的原生“另存为”保留 120 秒 Bridge 等待，其余不需前台提示的普通 RPC 使用原短预算。已发出的 Browser 写操作在 Bridge 超时或关闭时报告 `E_OUTCOME_UNKNOWN`，不将丢失回执解释成零写入，不自动重放。

## 入口清单与决定

| 用户操作 / 实际消费者 | 当前授权或确认、生命周期 | 本轮决定与依据 |
| --- | --- | --- |
| 安装 Sidebar Tool 后打开；`lifecycle.js`、安装器 | 缺省启用；用户主动停用及损坏记录继续拒绝。安装不自动运行沙箱 | 无通用二次“启用”缺陷；保留主动管理。安装内容/能力变化仍须原安装审阅 |
| 基础网页摘录；`projects/web-markdown-clipper/trusted/page.js`、Sidebar `clip.*` | 安装批准 `page.clip` 后默认站点准入，保留逐站 opt-out；Chrome 网站权限独立；精确文档、包/代际在宿主与接收端复核 | 未发现功能性逐站二次授权。市场旧文案改为安装后可用，不修改正文读取/传输边界 |
| ChatGPT 保存按钮；`knowledge/policy.js`、`knowledge/service.js` | 安装批准 `page.capture` 后在支持网站显示；Chrome 网站权限、真实点击、精确顶层文档和安装身份继续检查 | 无新增启用关卡；市场文案同步实际合同，不扩展支持网站或采集范围 |
| 工具声明的右键菜单；`context-menus.js` | 默认采用已安装包的动作/匹配范围；缺 Chrome 菜单/网站权限才申请，主动停用保留。领取须真实原生点击、60 秒票据及同文档 | 不增加按站启用；不把显示菜单或启动工具当作交付选区的授权 |
| Controller / Page 草稿 Run；`controller-draft-run.js`、`page-component-remote.js`、`page-preview-flow.js`、`page-dependencies.js` | Run 意图内自动 prepare/固定依赖锁/approve/load；保留来源权限、精确版本、SHA、执行世界和源码变化检查 | 未发现逐库勾选作为 Run 前置。高级依赖管理中的手动入口不等于正常 Run 必经步骤 |
| 固定任务 Run；`task-workbench.js`、`workflow/workflow-view.js` | 用户 Run、当前固定 Revision、已授予网站/Native 能力；实际缺权限才申请 | 保留任务身份和既有 Authority；未证实必须移除的第二个同义 Run 确认。未执行原生任务 |
| 创建/编辑未来计划；`scheduled-task-workbench.js`、`schedule-service.js` | 审阅固定任务身份、网页和触发规则后保存，授权的是未来执行而非立即 Run | 保留一次明确计划审阅及草稿/删除保护；Chrome 不强制所有这种产品确认，依据是未来副作用范围 |
| 打开/聚焦/固定/重载/导航/关闭工具标签页；Cookie Editor HTTP 服务跳转、AI VIP Share、SDK 示例 | 安装 `browser.tabs`；创建/目标网址检查与有效自有 tabRef，导航/重载令旧引用失效 | 移除六项逐次 intent；任意 tabId、其他安装引用、导航竞态和未知副作用仍拒绝/禁止重放 |
| 下载指定 URL、取消自有下载；SDK 验收示例 | `user.export` + Chrome `downloads`、受控 URL 和 downloadRef；Chrome 自身保存或危险下载提示保留 | 移除两项逐次 intent；120 秒原生保存等待独立保留，不开放 `downloads.open` |
| 收藏指定网址；`browser.bookmarks.createOwned` | 安装 Owned 能力、Chrome bookmarks 与目标网站权限；仅缺权限时可信点击申请 | 移除普通收藏逐次 intent；首次申请后复用，撤权后不能写入 |
| 全书签新增/编辑/移动；`projects/bookmark-manager` | 独立 Full 范围授权绑定包/版本/安装代际，不能由 Owned 或全局 Chrome 权限替代 | 移除三项逐次 intent，所有消费者走同一合同，删除旧可信 Bookmark Save 专属绕过分支。原树节点签名/读回/并发与 unknown 保护保留 |
| 删除自有/全书签、递归删目录；Bookmark Manager | 可信 Host 单次删除审阅；递归删除还校验短期子树票据与预期签名 | 保留。Bookmark UI 的 Delete 直接到 Host，没有第二个 React 同义确认。缺 Chrome 权限的自有删除合并为同一确认点击 |
| 本工具普通存储与整库清空；Browser storage Driver | get/set/remove 按自有 namespace；clear 有整库破坏性单次审阅 | 普通存储无新增确认；保留 clear。后者是产品破坏性保护，不宣称是 Chrome 每次强制手势 |
| 剪贴板及文本导出；通用沙箱 Bridge | 同一真实点击可直接消费一次封闭通道；异步准备可用已有 `prepareText`；合成/后台/迟到请求不能证明点击 | 已有单次点击复用，未新增提示。异步/后台回退审阅、Cookie 工具特殊导出保护及未知不重放继续保留 |
| Cookie 读取/值/写入/导入/清理/导出/观察；官方 Cookie Editor、AI VIP Share | 站点/Store/Partition、值读取与写入/监听范围分开；官方真实点击桥接 exact Host intent。普通工具不能自报已确认 | 官方保存/导入/清理已消费原点击并避免同义 Host 重复框，无需再改。其他工具未证明具有可信同一意图时保留审阅；不能只凭沙箱按钮文字或 `approved:true` 放行 |
| 被动 HTTP 元数据观察及导出；网络观察 Driver | 精确 Origin/文档、有界时长与会话，开始/导出敏感审阅；状态、读事件、停止按自有会话 | 保留采集审阅；已授予 `webRequest` 不重复调用申请。只读/停止不新增采集授权 |
| 可见网页截图；Screenshot Host + 私有 PNG 保存 | 单次可信审阅、当前可见自有文档与权限首尾复核、原生保存；PNG 字节不返回沙箱 | 保留敏感屏幕采集意图；公开文档从过时 HOST_ONLY 改为当前源码实现，原生仍未验收 |
| 受管代理 enable/disable；`projects/ai-proxy` | 审阅精确路由/端点及浏览器级影响，包/代际/Host/配置单次 intent，精确自有读回及 unknown journal | 保留。安装声明不是当前精确路由意图；其他 owner 的代理模式/schema/工具改动不纳入本提交。未证实消费者 custom PAC 提示与受管配置审阅为同一合法动作 |
| AI Provider 数据发送；通用 `ai.generate`、可信 Prompt Send | 通用沙箱发送前审阅接收方和实际数据；可信编译的 Send 路径已有自己的真实意图传递 | 保留当前数据外发边界；能力声明不等于用户选择本次文本与接收方，未新增外发信任桥 |
| 时间记录、站点预算、环境/指纹；`time.start` 与 Sidebar 对应分支 | 采集网站/保留明细、持续后台策略或调试会话范围各自审阅；已授权范围与当前启动意图不同 | 保留采集/未来策略/高风险控制范围。不是 Chrome 对所有操作的通用逐次要求；本轮未以删确认框代替这些授权合同 |
| 历史、Native、Provider 配对与工作流发布 | 真实手势申请相应 Chrome 权限，以及原有连接身份/发布/固定代码/能力审阅 | 仅检索确认入口存在；未证实同一意图重复授权，不改认证、配对或已安装 Revision，也不冒称原生闭环通过 |

## 源码依据与平台要求

- [操作元数据](../../../src/framework/sdk/browser-contract.js)、[可信 Sidebar](../../../src/ui/sidebar-tools.js)、[唯一 Chrome Host](../../../src/platform/chrome/context-menus.js)、[权限准备与真实点击](../../../src/platform/chrome/permission-gate.js)、[沙箱 Bridge](../../../src/sidebar-tools/bridge.js)。
- [生命周期](../../../src/ui/sidebar-tools/lifecycle.js)、[基础网站 opt-out](../../../src/ui/sidebar-tools/site-grants.js)、[安装即用合同](../../architecture/browser-framework/site-permission-onboarding.zh-CN.md)。
- [摘录页面接收端](../../../projects/web-markdown-clipper/trusted/page.js)、[知识保存服务](../../../src/knowledge/service.js)、[Bookmark UI](../../../projects/bookmark-manager/src/react/App.jsx)、[Cookie HTTP 消费者](../../../examples/sidebar-tools/cookie-editor/app/domain/http-services.js)。
- [Chrome tabs permissions](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions)：创建等多数操作无需 tabs 权限；本 SDK 仍使用自有引用和网站边界。
- [Chrome downloads.download](https://developer.chrome.com/docs/extensions/reference/api/downloads#method-download) / [cancel](https://developer.chrome.com/docs/extensions/reference/api/downloads#method-cancel)、[bookmarks](https://developer.chrome.com/docs/extensions/reference/api/bookmarks#method-create)、[StorageArea.clear](https://developer.chrome.com/docs/extensions/reference/api/storage/StorageArea#method-clear)：对应权限合同没有通用每次点击要求。`downloads.open` 的要求不能套到 download/cancel。
- [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions#step-3-request-optional-permissions)：申请须在真实用户手势内；[sidePanel.open](https://developer.chrome.com/docs/extensions/reference/api/sidePanel#method-open) 要求用户操作。沙箱 postMessage 不能据此伪造原生手势。
- [Async Clipboard 安全与权限](https://web.dev/articles/async-clipboard#security_and_permissions)：平台/焦点/权限条件因环境而异；本轮沿用现有可信点击桥接，未推导任意后台剪贴板放行。

## 定向验证与未验证项

验证针对两个变更面：普通操作元数据与可信分派的授权复用；受影响的单次权限、敏感意图、所有权/撤权和丢回执保护。未运行根 `npm test` 或全量产品构建。

1. `browser-authorization-ux.test.mjs`：9/9 PASS。真实 Host 与权限服务夹具执行普通调用、首次申请后复用、拒绝零写入、删除合并一次确认、外来 ref / Chrome 撤权 / 卸载拒绝，以及网络观察复用权限、缺权限同次申请和拒绝不生成意图。
2. `browser-sdk-approval-timeout.test.mjs`：6/6 PASS。授权标记与等待预算分离。
3. `sidebar-tool-export-bridge-host.test.mjs`：57/57 PASS。新增模拟 9 秒后授权/保存仍可收回执、超时/关闭返回 unknown 且只发送一次；原真实点击桥、私有端口、原型篡改、迟到/撤权与 no-replay 回归保持通过。VM 夹具补齐现有源码依赖的 limits 与 TextEncoder。
4. 现有 Host / Driver / 消费者定向组：193 项中 191 PASS、2 项旧断言失败。执行文件为 `browser-sdk-r2-host`、`browser-sdk-r13`、`browser-sdk-r106-core-contract-gaps`、`browser-tabs-host`、`browser-sdk-p3-implementation`、`browser-sdk-p3-bookmarks`、`browser-sdk-r112-full-bookmarks`、`browser-sdk-p4-implementation`、`browser-network-permission-consent`、`browser-network-observe-host`、`bookmark-manager-r2`、`bookmark-manager-r34-save-consent`（均位于 `tests/environment/`，后缀 `.test.mjs`）。两项失败是 R10.6 launch/selection 预期缺少已有 `selectionMarkdown:null`，与本次授权变化无关，未为此修改产品或扩大修复。
5. 全 Registry/矩阵检查 5/6 PASS、1 项失败，已有五项未入矩阵：`browser.fingerprint.apply/readback/restore`、`browser.siteBudget.getStatus/setPolicy`。该检查未通过，保留错误，不放宽检查器。已有生成器对矩阵批准子集生成本轮 12 项授权元数据；未替五项补造批准状态。

本轮未提交并行 Cookie Editor、ScrapyJS、代理模式、Reading TOC、共享 React UI 等改动；共享文件仅提交本任务 hunk。真实 Chrome 网站/权限弹窗、安装/升级、Native 与 production 验收均为 **NOT_TESTED**，不能由上述 Node 数量替代。
