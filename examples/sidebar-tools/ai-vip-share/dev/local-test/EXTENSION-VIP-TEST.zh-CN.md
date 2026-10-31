# AI VIP Share：完善扩展到模拟 VIP 网站的真实操作链

## 目标与当前阶段
继续实施 AI VIP Share。用户追问“有通过扩展测试这个页面吗”，并要求继续完善、保留对应 Markdown。本轮已完成下面记录的**新实验真实扩展链**：扩展 → AI VIP Share → 选择已批准网站 → 获取授权会话 → 原网站授权、写前复核与可信 Cookie 批次确认 → 设置并打开网站 → 目标站服务端显示脱敏账号、有效模拟 VIP、等级和到期时间。旧实验 unknown 仍未恢复；HTTP、原生及历史证据分别列明。

仓库 /Users/shopme/Documents/workspace/opendesk-browser，业务 owner examples/sidebar-tools/ai-vip-share/。当前是核心开发与最小验证；商业接入、production、正式发布、全量原生矩阵、评分、宽度/缩放及代理流量研究延期。仅用现有 main，不创建或切换分支、worktree、PR，不推送。先读当前 AGENTS、opendesk-sidebar-tool-dev Skill、公开 SDK 和原项目说明；证实公共缺口才按 opendesk-extension-runtime 处理平台范围。

## 2026-10-31 19:43 新实验真实扩展链已通过

用户在下方具体处置方案展示后回复“需要我什么配置，需要你继续完善，知道完成。你有权继续推进”，本轮据此执行该已展示范围。不需要真实账号、Cookie、付费会员或代理配置。**这是封存后的新实验，不是旧 unknown 的恢复。** 下方 19:17 及更早的 BLOCKED、服务与待授权说明均为历史观察。

### 封存与安装身份

- 先从原可信扩展页面只读备份本工具完整 namespace、已安装包、安装代际及其他工具的 ID/版本；未直接修改 Chrome Storage。受限备份为 `/Users/shopme/.codex/backups/ai-vip-share-20261031-current-profile/ai-vip-share-sealed-backup-20261031.json`，129,825 字节，SHA-256 `266b7e70e47aa2c44eadadb06a6a3c698f9d06976f1e7716b64e50833508294a`，目录 0700 / 文件 0600，不提交原始数据。
- 备份的四个键为 `aiVipCookieDeliveryR137`、`aiVipLocalDevelopmentR136`、`aiVipRedeemR52`、`aiVipSiteSelectionR1`；原 journal schema 2，四次状态为 success / success / success / unknown，最后一条仍 pending。原 journal validator 与已安装包 validator/hash 离线核对通过。
- 备份核对后，经原管理界面卸载“AI VIP Share 及其本地数据”，界面确认清理成功；其余四个工具保留。再从本项目唯一正式 JSON 经原导入审阅链安装同 ID 1.4.8，界面确认无需二次启用。没有删除网站 Cookie，也未操作其他 Profile 的 1.4.3 unknown。
- 重装后只读核对已安装完整包为 122,995 字节，SHA-256 `4a96ffbe5b308a2022e192b5abdd4a8cedec98e974a7e774ad777d5dbca34bd2`，与磁盘正式包相同，六项能力不变。旧代际 `d9b432eb-94ff-47fc-aa84-08f31dbaf45b`，新代际 `a1b76f70-f00c-4666-bbab-a815d24094f2`，不得混称原事务解锁。

### 实际操作与可见结果

| 本轮原生操作 | 观察结果与证据边界 |
| --- | --- |
| 原浏览器与扩展 | Google Chrome for Testing / `AI VIP Core 20261030`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；`chrome://extensions` 再次显示加载本仓库 `dist/development`，未更换 Profile、ID、来源或包 pin |
| 原批准站点 | 仅运行 `http://localhost:7901` 的当前 ordinary factory。原服务和 dev writer 在本轮操作前已不在监听，并非本轮主动终止；原内存账本没有恢复。未重启 7898、7902，也未触碰 58251 或其他项目服务 |
| 写入前页面 | 原浏览器打开 `http://localhost:7901/session/` 显示“未登录”“模拟 VIP：未验证 / 不可用”，没有账号；页面未替工具设置 Cookie |
| 精确网站授权 | 原工具设置显示 `http://localhost:7901 · 未授权`，经原“授权访问”后显示已授权；先完成该授权，再获取和写入会话。没有全站授权 |
| 获取与写前复核 | 原工具选择“普通工作台 1”，在安全凭据字段输入本机临时测试凭据，点击“获取授权会话”；显示 `o***@fixture.test` 及有效交付。普通站独立于会员、额度和代理；未点击“连接本地开发”，未启动会员服务 |
| 可信批次确认 | 点击“设置并打开网站”，原可信提示明确为 `http://localhost:7901`、两条 Cookie、当前已授权 Store/Partition、不可自动重试；确认后两项均显示“已写入并核验”，随后通过原单次开页确认 |
| 新打开的目标页 | 19:39:11 北京时间观察：“受控会话有效”，脱敏账号 `o***@fixture.test`，模拟 VIP“有效”，等级“本地体验 VIP”，生效 `2026-10-31 19:38:09`，到期 `2026-10-31 20:35:37`（北京时间）。已在本对话显示真实原生截图；不是 HTTP 手工 Cookie、预览或 58251 页面 |
| 退出并重开工具 | 保留“普通工作台 1”选择和两项成功结果，安全凭据为空，无待提交会话。重开前后来源授权 GET 均为 2、会话 POST 均为 1；之后只读安装核对也只有一条 count 2 / success / receipt 的 journal。没有再次确认或派发 Cookie，也没有启用代理 |
| 服务端撤权 | 19:40:32 在同一 fixture owner 调用原 `revoke('ordinary-subject')`，返回 true；19:40:36 原页面自动显示“授权已撤销或失效”“模拟 VIP：未验证 / 不可用”，不再展示账号或等级。没有清 Cookie、重新授权、重放或创建第二次交付；19:43:47 仍为失效状态 |

新实验资源为忽略目录 `artifacts/ai-vip-share-native-20261031-authorized/` 的临时 owner harness 与非秘密计数，终端 session 78320（不保证跨对话可控）；仅复用现有 factory 的 in-process 授权/撤权/观察，没有新增 HTTP 管理接口。临时凭据未写入工具存储或日志；私有中转文件已删除，字段已清空，剪贴板已替换为普通站 URL。服务暂保留撤权后的现场，打开[当前目标页](http://localhost:7901/session/)应看到失效状态；不能把本次成功截图理解为撤权后仍有效。

### 验证范围与剩余限制

本轮只改变测试运行状态与这两份说明，工具源码、正式包和三个页面实现模块均未改。真实正向链、未登录页面、撤权失效、重开不重放及安装身份已新鲜核对；缺失单枚、混配、重复、到期、授权换代及共享账号分配失效复用下方原 54 项 HTTP 证据，**没有宣称本轮全部原生矩阵通过**。文档只核对差异、链接与证据一致性，不重跑输入未变的测试，不重打工具包。

运行环境在服务退出后已变为**保留的静态开发产物 / serve 未连接**，不是 production 验收，也不是新静态构建。为恢复原持续开发入口仅尝试一次 `npm run dev`，在 `scripts/build-cookie-editor-react.mjs:30` 遇到并行 Cookie Editor 的 `Cookie React exceeds installer budget`，未进入 WXT 启动。该任务并未修改 Cookie Editor 源码、预算或绕过门禁，也未再构建、强制扩展重载；保留的原宿主实际完成了上述链。持续开发服务恢复由该并行构建问题解决后再执行，不阻塞本轮已观察到的核心结果。

**本轮核心完成：新实验原生链 PASS。** 旧 unknown 为 `UNKNOWN_NOT_RECOVERED`，备份保留；第二站新实验、商业服务、production、全量原生矩阵、评分、缩放/宽度和代理流量研究均未执行，不自动进入下一阶段。

## 2026-10-31 19:17 接收核对与待决定的处置

接收对话 `01a191aa-c8d2-77f0-81fd-04c168cbeb43` 先实读原生 goal 为 null，随后建立本文件所述核心目标，无 token 预算。目标仍为 **active / 未完成**；下面的原生观察不满足登录完成条件，也没有暂停、迁移或完成其他对话的目标。

### 实际入口、复用与本轮证据

这是原沙箱 Sidebar Tool 的既有登录链，业务 owner、`src/main.js` / `src/App.jsx`、唯一 1.4.8 包和原 `OpenDeskTool` / Browser SDK / Host / Authority 全部复用，不另建项目或运行器。本轮没有发现可自主实施、能解除下面两个阻塞的新源码修复。

| 只读核对 | 2026-10-31 19:17 北京时间观察与限制 |
| --- | --- |
| Git / 写入范围 | 开始时 main HEAD `f1fbb9cad`；本工具与 `tests/environment/sidebar-tools-host.test.mjs` 无未提交改动，索引为空。共享平台及其他项目仍有大量并行修改，本轮仅维护本 MD 和工具 README |
| 原 Profile / 扩展 | `/Applications/Google Chrome.app` 实际窗口为 Google Chrome for Testing / `AI VIP Core 20261030`。`chrome://extensions` 显示启用 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载本仓库 `dist/development` |
| 持续开发 | 原侧栏「调试 → 本地开发服务」显示已连接；当前完整 revision `311299080ee88a5b063d6bf101048e2dc2f0bd4379c1d5e7dda68efbd5f68424`。没有强制重载或重装；这不是 production 候选 |
| 原产品操作 | 「扩展 → AI VIP Share」打开原 1.4.8。普通工作台 2 已选择，来源凭据为空，「获取授权会话」禁用；可见“恢复记录仍需核对”与“Cookie 操作结果未知或恢复记录未确认；已禁止重放”。设置只列出 `http://localhost:7901` 的 Cookie 网站授权。未获取新会话、未点击批次写入、未补网站授权 |
| 包身份 | 磁盘唯一正式包 SHA-256 重新核对仍为 `4a96ffbe5b308a2022e192b5abdd4a8cedec98e974a7e774ad777d5dbca34bd2`；版本 1.4.8、六项能力未变。UI 观察到 1.4.8；本轮未通过非公开存储读取已安装完整字节，不把磁盘摘要冒充新的安装核验 |
| 服务 | 只读 lsof 仍见 dev writer PID11774 /43119、43120；会员 PID92522 /127.0.0.1:7898；普通站 PID93579 /[::1]:7901、127.0.0.1:7902；展示页 PID35117 /[::1]:58251。全部保留，未读进程参数或终端秘密 |

当前 UI 足以确认写入屏障。未新增会话 POST 或 Cookie 写入调用；本轮没有读取运行中闭包的服务计数，因此不报告新的计数值或“所有网络请求为零”。1.4.3 unknown 仍仅有历史证据，本轮未操作它所在的其他 Profile。

最小源码核对复用上轮关于静态导入与无热升级入口的结论，不重复搜索未来控制面：原 journal 的 `planCookieReceipt` 只接受原精确批次的回执或当次明确未派发事实；`planCookieAttempt` 对任何 unknown/partial 保留全局屏障。普通站 factory 的授权、交付和请求账本在闭包内，`close()` 会清空；没有导出/导入或 renderer 升级合同。会员 factory 暴露给原进程 owner 的对象也不能由新进程访问。新 SDK 错误码不能反证任何旧批次。

### 具体处置方案（尚未授权，尚未执行）

当前只有两个依赖，均无已证实的自主路径：**旧 Cookie 事务无可验证终态；旧普通站进程无保账本页面升级入口。** 在现有安全合同内继续补权、切站、请求新会话或重启都会绕过已知限制，故受影响副作用分支停止。下面是可供用户决定的“封存旧实验、重新开展原生测试”方案，**不是旧事务恢复方案**。

| 涉及对象 | 拟执行动作及严格范围 | 风险 / 恢复限制 |
| --- | --- | --- |
| 本 Profile 的 `ai-vip-share` 安装数据 | 先用原安装存储的合法只读路径取得本工具非秘密 journal、完整键归属、安装代际与摘要，保存可核对的受限备份和非秘密说明；核对备份前不删除。再经原管理界面的「卸载 AI VIP Share 及其本地数据」和原包审阅链，在同一 Profile 重装同 ID、同 1.4.8 包。此动作须单独得到明确批准 | 当前 `aiVipCookieDeliveryR137` 的旧 unknown 保留在封存证据中，不能改成 failed / not-submitted / success。重装将产生新的安装代际，不能称为原事务解锁或恢复；本工具网站授权、偏好、恢复记录等本地数据会失去原在用状态。当前无已验证的一键备份/还原入口，不能承诺恢复原安装代际；若无法安全取得备份与归属，先停在该步，不删除 |
| 普通站 PID93579、7901/7902 | 备份与批准到位后，仅正常停止本任务的该进程；按现有 factory 在原两个固定 Origin 启动当前源码。该进程同时持有两站，不能把重启描述成只影响 7901；不修改固定来源或精确包 pin | 两站内存授权、交付和请求账本均会丢失，现有授权凭据与旧 Cookie 不再被新服务认可。没有已实现导出/导入，已有非秘密记录不能恢复这些账本。新授权与新交付明确属于新实验，不证明旧 unknown 的结果 |
| 旧 1.4.3 unknown、7898 会员服务、其他资源 | 不处置其他 Profile 的旧 unknown；保留 PID92522 的会员/兑换账本、PID35117 展示页、dev writer、代理和其他项目服务；不删除任何浏览器 Cookie，不用 Cookie Editor 清理数据 | 本轮只争取 `localhost:7901/session/` 的新实验链；7898 与 7902 的同主机 Cookie 槽位冲突保护继续生效。若原管理链发现额外共享影响或 unknown 仍存在，不扩大清理范围 |
| 新实验的真实验证 | 正式重装后经原可信权限审阅，仅对原批准的普通工作台 1 发起新授权会话、写前复核及两枚 Cookie 确认；查看服务端脱敏身份、VIP 等级和期限，再核对本次实际影响的失效保护与重开不重放 | 安装权限必须重新按原链确认，不继承已失效授权。新页面完整链尚未执行；仅成功后记为“新实验原生链 PASS”，旧实验仍为 unknown / 未恢复。失败后保留现场，不重复重置 |

**用户待决定的具体动作：是否接受旧普通站内存账本不可恢复，允许在保留旧 unknown 证据后，对本 Profile 的本工具做上述备份门禁下的卸载重装，并重启同时承载 7901/7902 的 PID93579，开展明确标记的新实验。** 未明确批准前维持原现场，不把“继续完善”解释成该处置授权。不要求用户手工安装、运行测试或提供秘密。

本轮仅增加现场与处置文档，故只核对差异、相对链接、事实和格式；不重跑输入未变的 54 项 HTTP、Host/journal 检查，不构建 Browser 或重打包。上轮有效证据继续保留；新 VIP 页真实扩展链仍为 **BLOCKED / NOT_TESTED**，原生 goal 仍 active，等待该具体决定。

## 2026-10-31 19:11 上轮续接结果

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
