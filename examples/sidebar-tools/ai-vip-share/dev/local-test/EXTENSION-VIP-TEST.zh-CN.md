# AI VIP Share：完善扩展到模拟 VIP 网站的真实操作链

## 目标与当前阶段
继续实施 AI VIP Share。用户最新追问“有通过扩展测试这个页面吗”，并明确要求创建新对话继续完善、保留对应 Markdown。准确答案是：新 VIP 页只有 HTTP 测试与浏览器未登录展示证据，尚未通过原扩展 Cookie 写入验证。现在优先完成或解除这条真实用户操作的实际阻塞：扩展 → AI VIP Share → 选择已批准网站 → 获取授权会话 → 原网站授权、写前复核与可信 Cookie 批次确认 → 设置并打开网站 → 目标站服务端显示脱敏账号、有效模拟 VIP、等级和到期时间；缺失、混配、到期或撤权后不能显示有效 VIP。不要停在方案，也不要再次询问是否继续。

仓库 /Users/shopme/Documents/workspace/opendesk-browser，业务 owner examples/sidebar-tools/ai-vip-share/。当前是核心开发与最小验证；商业接入、production、正式发布、全量原生矩阵、评分、宽度/缩放及代理流量研究延期。仅用现有 main，不创建或切换分支、worktree、PR，不推送。先读当前 AGENTS、opendesk-sidebar-tool-dev Skill、公开 SDK 和原项目说明；证实公共缺口才按 opendesk-extension-runtime 处理平台范围。

## 2026-10-31 续接结果

**新 VIP 页经原扩展写入仍为 BLOCKED / NOT_TESTED。** 本轮从既有 `AI VIP Core 20261030` Profile 的「扩展 → AI VIP Share」重开原工具，确认已安装 1.4.8，普通工作台 2 已选择、来源凭据为空、获取会话被禁用，仍显示恢复记录未确认和 Cookie unknown 禁止重放。没有请求新会话或派发 Cookie；打开工具触发的会员 GET 可信确认已取消。

这是持续开发环境：`chrome://extensions` 确认 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载本仓库 `dist/development`；调试 → 本地开发服务显示已连接，观察时 revision 为 `55f7998525a10032a6b4c0a052d0bcd47f78bb7abcd2a9f72d3000273e2feeb5`。未重载或重装扩展、未改变安装身份或授权。7898/PID92522、7901+7902/PID93579、58251/PID35117 与唯一 dev writer/PID11774 仍在监听，全部保留。

**已完成的独立修复：新 Cookie 批次在可信侧栏缺少精确网站 write 授权时，明确返回 `E_COOKIE_NOT_SUBMITTED`。** 拒绝仍发生在批次审阅、批准 RPC 和 Cookie Host RPC 之前，保留精确网站授权提示。单项写入、删除、监听不改码；派发后 Host 的 `E_SITE_GRANT_REQUIRED`、取消或丢回执均保持原码与未知语义。没有补权、自动重试、放宽权限或改写旧 journal。工具源码及唯一正式包未变，继续为 1.4.8。

### 公共缺口与范围依据

- 公开合同为 [Cookie 批次确认取消](../../../../../docs/api/browser-sdk.zh-CN.md#cookie-批次确认取消2026-10-30)；修复前专用未派发码只覆盖可信确认取消/确认前超时。1.4.8 第二站历史操作在可信缺授权 gate 返回通用 `E_SITE_GRANT_REQUIRED`，预存 journal 留下 unknown，本轮原入口仍锁定。
- 沙箱无法观察可信派发边界，同名授权错误也可能来自已派发的 Host，故工具内不能安全推断零写入。任何持久化 `cookies.setMany` 意图的工具均有同类需求。
- 最小公共范围是 `src/ui/sidebar-tools.js` 既有 gate、原公开文档和 `tests/environment/sidebar-tools-host.test.mjs`。复用现有码，无新 RPC、权限、存储、Host、授权层或 AI VIP Share 特判，安装身份、精确来源、撤权、部分回执和未知保护均保留。
- 新事实只绑定本次被拒绝的新请求，不能追溯结清旧 unknown。补授权后仍须交付有效、无其他未知屏障，并由用户重新明确确认；不自动调用。
- 编码前已记录缺口并取得共享文件串行移交：Cookie HTTP owner 已提交 `d2f89afe4` 并释放 `sidebar-tools.js`；AI Proxy owner 明确释放该文件与公开 SDK 文档。本任务只提交 Cookie hunks，保留其 Proxy 改动。

### 本次最小验证

这些检查只验证此次改变的“可信拒绝零派发”与受影响的未知保护，不重跑输入未变的 54 项页面 HTTP 检查，也不构建 Browser 或打包工具。

| 检查 | 本轮证据与限制 |
| --- | --- |
| Sidebar Host：缺精确授权、确认取消/派发后错误、请求预算 | 3 项 PASS。新缺授权用例先因原通用码失败，修复后通过；确认无批准及 Cookie RPC，已派发授权拒绝/取消/transport timeout 不重标 |
| 工具 Cookie journal | 3 项 PASS：只有显式未派发能结清，partial/unknown 保留，端口不能隔离 Cookie 槽位 |
| 既有内存控制器 | 2 项 PASS：可信未派发确认取消可由用户重试；通用取消保留 unknown，重开不重放 |
| 另 2 项普通站 HTTP 控制器检查 | ENV_BLOCKED：测试尝试监听固定 `[::1]:7901`，因原账本服务占用而报 `EADDRINUSE`，尚未进入目标行为。来源合同内含端口，未换端口或改固定配置制造通过，未停止旧进程 |
| 语法与差异 | 可信侧栏及 Host 测试语法检查、任务 diff 空白检查通过 |
| 独立限定审阅 | 未发现阻塞性安全问题；核对派发边界、身份授权和旧 unknown 无追溯解锁。审阅仅静态，未独立重跑测试或 Chrome |
| 原生新批次与新 VIP 页写入 | NOT_TESTED；本轮原生证据仅为原入口、已安装身份/连接及旧 unknown 仍锁定 |

对应命令（已执行，不是后续全量清单）：

```sh
node --test --test-name-pattern='Cookie batch missing exact|Cookie batch review cancellation|sandbox Browser RPC honors Registry' tests/environment/sidebar-tools-host.test.mjs
node --test --test-name-pattern='only explicit pre-dispatch|partial/unknown item|ports do not isolate|ambiguous SDK result|trusted pre-dispatch cancellation' examples/sidebar-tools/ai-vip-share/tests/cookie-journal.test.mjs examples/sidebar-tools/ai-vip-share/tests/controller-ordinary.integration.test.mjs
node --test --test-name-pattern='explicit Cookie confirmation cancellation|generic SDK cancellation' tests/environment/ai-vip-share-local-development.test.mjs
node --check src/ui/sidebar-tools.js
node --check tests/environment/sidebar-tools-host.test.mjs
```

journal 的 3 项最初与上述 2 项 HTTP 控制器合并执行；HTTP 环境阻塞后改用不占端口的既有内存控制器检查。未重复无变化检查。

### 下一条实际操作与阻塞

下一条未完成操作仍是原工具获取授权会话、写入并打开**新 VIP 页**。当前有两个独立阻塞：旧 unknown 没有可核验的合法恢复依据；旧 7898/7901/7902 进程静态导入旧页面并闭包持有内存账本，没有已实现的 renderer setter、watcher、动态 import、信号或升级路由。刷新页面不会加载磁盘新 renderer，重启会丢失账本。本轮未预建未来控制面。

保留 BLOCKED，不重启清账、不把 58251 新账本当作旧事务恢复、不换 Profile/来源/请求 ID 绕过屏障。只有取得旧事务真实可核验恢复依据，以及保留账本、身份和授权的合法运行升级入口后，才可继续原链。新 SDK 修复不满足这两个条件。独立查看地址仍为 [未登录模拟页](http://localhost:58251/session/)，不代表扩展登录成功。

## 原交接事实（历史观察）

本文件由交出对话写入并与新对话首条正文核对，现由接收任务维护，README 保留发现入口。以下保留交出时事实；当前状态以本次续接结果为准。

以下为交出时观察，开始时重查相关状态：
- main HEAD f425785c3 已提交 7 个本工具文件，未推送：共用 vip-session-page.mjs、ordinary-site-fixture.mjs / local-fixture-server.mjs、对应两个 .test.mjs、工具与本地测试两个 README。之前的 689f5ed28 / dbf8a42f7 保留。工具目录在本次交接文档写入前无未提交修改。
- 两个原 /session/ 复用自己的完整 Cookie 对、私有账本、服务端时钟、来源授权及当前分配核验；共用渲染器只接收非秘密展示数据，不接收 Cookie payload、Bearer 或真实账号。普通站 o***@fixture.test / 本地体验 VIP 独立于工具会员、额度和代理；共享账号 A/B 为 a***@fixture.test / 模拟标准 VIP、b***@fixture.test / 模拟高级 VIP。
- 页面显示本地模拟、服务器核验时间、生效/到期；无 Cookie、缺失/混配/重复、到期、撤权/授权换代/分配失效均不显示有效 VIP 或身份。HTML 无脚本、无 localStorage、不读取 HttpOnly Cookie、不输出秘密、不通过 Set-Cookie 代替原扩展。no-store，CSP 仅允许固定 CSS 摘要。每 5 秒普通导航只读重新核验，临近已知到期提前刷新；撤权在下次成功核验时反映，浏览器挂起/断网不保证即时更新。
- 两个受影响 fixture 文件共 54 项 HTTP 检查通过；新增3项曾先失败再实现通过，补充 A/B 及分配失效断言后定向单项通过。3个实现模块语法、diff 检查通过；独立限定源码审阅未发现具体缺陷。HTTP 手工 Cookie 请求头不证明 Chrome 接受或 SDK 写入，未执行项不能宣称原生 PASS；相关输入未变不重复全组测试。
- 独立查看地址 http://localhost:58251/session/，PID35117，exec session61325（不保证跨对话可操作）。已在交出对话 IAB 实际看到未登录/模拟 VIP 不可用和核验时间自动更新。该实例未签发授权、未安装 Cookie、未纳入工具固定开发来源；截图 artifacts/ai-vip-share-vip-page-20261031/not-logged-in.jpg。不能把“打开此页”说成“通过扩展登录”。
- 唯一正式包 ai-vip-share.opendesk-tool.json 仍为1.4.8，122995字节，SHA-256 4a96ffbe5b308a2022e192b5abdd4a8cedec98e974a7e774ad777d5dbca34bd2，身份与六项 capabilities 未变；本轮仅改 fixture，没有重打包或改批准摘要。
- 历史原生证据必须分开：1.4.8 曾在 AI VIP Core 20261030 Profile 经原审阅链升级，扩展 ID ccfcjegpkdlgbclopjmadlcjedelidmf，实际加载 dist/development；localhost:7901 旧页曾经原链写两枚 Cookie 后显示受控会话有效。会员非法码、预检/取消、明确兑换、丢回执后原事务查询也曾通过。这些不证明新 VIP 页面原生通过。
- 127.0.0.1:7902 的1.4.8操作在 Cookie Host RPC 前缺本站 write grant，返回 E_SITE_GRANT_REQUIRED；工具已预存 unknown，全局 Cookie 写入屏障生效，重开仍锁定。历史1.4.3 unknown亦保留。新 VIP 页面原扩展写入目前 BLOCKED / NOT_TESTED，交出对话未重试、未清记录。
- 交出对话01a19173-39de-71c2-a3b1-af082f98a57d当前 get_goal实读为null；前序01a19147-a7c6-7973-afb1-9f01443ee291历史实读null，其他对话goal未知。创建本新对话不暂停、完成或迁移任何旧goal，不用本对话空goal推断其他对话生命周期。

## 交接时任务（历史，当前结果与下一步见上）
1. 先只读核对 main、本工具 diff、最新公开 Cookie 合同、实际已安装版本/ID/加载目录和 serve 连接，以及已有 unknown 当前状态。通过原“扩展 → AI VIP Share”的最短核心链定位下一条失败/未验证操作；已有明确写入屏障时只读观察，不自动请求新会话或重复派发 Cookie，不先跑全仓测试或 Browser build。
2. 核对“新页面运行在哪里、原批准目标如何使用它”这一真实依赖。7901/7902/7898旧 Node进程未因磁盘源码修改升级，仍持有原内存账本与旧页面；58251是全新只读演示实例。找到能保留原账本、身份、授权与 unknown 的合法升级/接线方式再行动；不得重启旧进程清账、把新账本当旧事务恢复，或机械修改固定来源、端口和包hash制造通过。没有合法运行升级通道时如实记录该具体阻塞，其余独立实现继续。
3. 已有公共缺口是可信层对“确定未派发的拒绝”缺少可核验结果。若它仍是当前用户操作的实际阻塞，先写清公开SDK缺项与文档、可复现失败、工具内无法解决的原因、跨工具价值、最小源码/测试范围和权限/生命周期影响，再由平台owner按原框架补最小可信事实与定向回归。src/ui/sidebar-tools.js存在他人并行改动，先协调真实重叠，不覆盖；独立工具/文档工作继续。禁止在工具中把所有 E_SITE_GRANT_REQUIRED 一律转成零写入。
4. 平台未来修复只能为新操作生成可核验事实，不能追溯为旧 unknown 造证明、自动清锁或重放。旧记录无法合法恢复时保留 BLOCKED，不借换窗口/Profile、来源或请求ID绕过。安全条件成立后才完成原链对新 VIP页的真实扩展验证，记录已安装候选、网站、服务端可见状态和非秘密证据；若仍阻断，清楚交付具体原因和已完成的独立修复，不能伪报整条链通过。
5. 更新本MD与工具README，明确每项 SOURCE/HTTP/真实扩展证据和当前下一操作。仅运行变更触发且证明本次用户行为或受影响安全保护的最小检查，保留有效旧证据，不为了统计重跑54项。

## 必须保持的边界
复用原 OpenDeskTool、Browser SDK、Host、Authority、安装器与唯一打包器，业务留本工具；不新建第二套Provider、授权层或用户脚本。`E_COOKIE_NOT_SUBMITTED` 证明可信批次确认取消/确认前超时，或本轮新增的可信缺精确网站授权 gate 的零派发；普通取消、SDK关闭、超时、派发后撤权/丢回执仍unknown。保留 partial/unknown、CAS、精确来源、安装身份、授权、撤权及未知副作用保护。

Cookie不按端口隔离，127.0.0.1:7898与:7902的槽位冲突保护保留。目标页未登录、补授权、切站、到期和重开都不能解除unknown。生产来源仍为空；固定开发代理仍是127.0.0.1:7897和原七个AI域，不改系统代理或把代理测试当前置。仅fixture/文档变化不升工具版本、不打包；确实改工具包时，才按原候选→相关检查→同源晋升→check-project与必要来源审阅流程，不增加第二正式JSON。

## 并行文件、服务与所有权移交
本新对话接收本工具、模拟页及本任务测试资源的实施所有权；交出对话不再重复操作这些文件、Profile、fixture和输出。服务是历史内存账本，接收owner不代表获准重启清空。
- 本次18:39左右只读lsof仍见：唯一Browser dev writer PID11774、43119/43120、dist/development；会员fixture PID92522 /127.0.0.1:7898；普通站 PID93579 /[::1]:7901和127.0.0.1:7902；独立页面PID35117 /[::1]:58251。保留全部，不启动第二dev/build覆盖共享输出，不擅停watcher。源终端session91939/29251/61325不保证可跨对话，不能依赖它们取得凭据或输出进程参数中的秘密。
- 其他服务和浏览器保持：7897代理、43271预览、43111测试页及Cookie Editor、AI Proxy任务；本轮未重查它们的PID。只操作本工具已移交页面/Profile，不接管其他任务弹窗。
- 当前其他Agent有大量未提交修改，包括DESIGN.md、docs/api/browser-sdk*、src/framework/sdk/browser-contract.js /browser-schemas.js、src/platform/chrome/browser-managed-proxy.js、src/ui/sidebar-tools.js、src/ui/design-system.css、src/ui/react/components/conversation.tsx及相关根测试；Cookie Editor、ScrapyJS、AI Proxy、Reading TOC项目和预览也有修改/新增/删除；另有未跟踪chatgpt-mindmap、bookmark-manager和proxy配置/测试。开始时以git status实读为准，不覆盖、回滚、暂存或提交这些文件，不创建分支/worktree规避并行约束。
- 原交接仅新增EXTENSION-VIP-TEST.zh-CN.md与README发现链接；接收任务已维护此文档并完成上方独立修复及最小验证。共享Git索引/HEAD操作串行，仅提交本任务精确路径和 Cookie hunks，不推送。

## 完成与交付
优先交付“原扩展设置并打开目标模拟网站，目标服务端显示真实核验后的脱敏身份和模拟VIP”的可观察结果，并验证本次实际变更影响的失效/撤权保护；HTTP或未登录截图不能代替原生链。旧unknown必须保留，无法合法继续时报告具体BLOCKED与可安全完成部分。输出实际修改文件、可打开地址、原入口操作说明、相关验证、真实扩展是否通过及剩余阻塞；源码改变后按授权在main安全提交本任务文件，不推送。核心操作与最小验证收尾后停止，不自动进入延期验收、评分或代理研究。
