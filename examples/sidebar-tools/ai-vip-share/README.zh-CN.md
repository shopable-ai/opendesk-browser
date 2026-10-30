# AI VIP Share · 独立 Sidebar Tool

最新产品方向见 [网站快速登录与 Cookie 会话方案](ROADMAP.zh-CN.md)：核心是方便快速登录、受控设置 Cookie，AI 网站仅为首批场景。通用网站能力不依赖 AI 额度或会员模型；以下单站任务和历史证据保留，执行优先级以该最新纠偏为准。方案不代表多站功能已经实现。

<a id="core-function-goal-20261030"></a>

## 当前执行目标与关键测试条件（2026-10-30）

**目标：完善 AI VIP Share，让用户能在现有「扩展」入口完成打开工具、查询会员、兑换激活、取得服务器分配的网站会话、确认 Cookie 交付、启停 AI 网站访问代理以及关闭重开后的恢复。允许以本地模拟服务器替代尚未配置的商业后端。** 本节是本轮执行与完成条件；下方各轮记录只提供历史证据，不恢复正式发布、全量验收或评分目标。

**当前阶段：本地服务与激活闭环已在真实 Chrome 跑通，Cookie 成功交付和代理启停仍待实测，目标保持进行中。** 已修复正式 React 缺少首次开发接入入口的问题：可选视图位于 `dev/local-test/connection.js`，仅在公共 SDK 返回精确获审开发 profile 时创建，生产和错误来源不创建。真实操作又复现了取消 Cookie 可信确认后被误记为 unknown、无法再次确认的问题；1.4.4 对明确未提交的取消保留手动重试，其他取消/超时/丢回执继续禁止重放，旧 unknown 不自动清除。

当前唯一正式包及同源候选均为 **1.4.4，92,704 字节，SHA-256 `b0f5c9605c755d60e20209a23e97b600ced61705954abd0fcc40a7a3857b1917`**；已经过独立源码审阅、候选晋升和 `--check-project`。开发 profile 仅批准该摘要，生产 profile 仍为空。真实「管理 → 审阅新版 → 确认更新」已完成 1.4.3 → 1.4.4，界面核对完整摘要与权限未变化；原安装数据保留。

| 当前证据 | 状态与观察 | 验证级别 / 候选 |
| --- | --- | --- |
| 本地接入、会员、预检取消与明确兑换 | PASS：Enter 单次预检；Escape 取消时消费 0；再次明确确认后仅消费 1 次，服务端分配 shared-a，界面额度 20、记录 1 条 | 真实 Chrome + 7898 模拟服务器；1.4.3 `cbd6545446d5a178fe805dab15190e5059b610e7569e8d7ba9e3878e293fcfe6` |
| 同 ID 更新和非空恢复 | PASS：1.4.4 更新后重新查询仍显示额度 20、记录 1，服务账本消费总数仍为 1；开发偏好与旧 Cookie unknown 保留，没有重复消费、写入或自动启用代理 | 真实 Chrome + 同一未重启模拟服务；当前 1.4.4 摘要见上 |
| Cookie 未授权、取消与未知保护 | PASS：未授权写入被拒；授权后取消精确两项确认，目标 `/session/` 仍未建立会话。旧版因此误记 unknown；当前版保留该记录并阻止重放 | 真实 Chrome 1.4.3；unknown 跨 1.4.4 更新恢复。取消后可重试的修复尚无当前原生证据 |
| Cookie 修复和核心状态回归 | PASS：四个工具定向文件 94/94；新增 Host 用例证明确认前取消零派发、再次明确确认仅写一次、派发后取消仍未知 | Node/VM、挂载真实 Host 测试夹具；1.4.4，不代替原生成功交付 |
| 开发批准、代理范围和生命周期 | PASS：5/5，错误摘要、production/未知 MODE 禁用、安装撤销、所有权、在途 STOP 与晚响应保护 | Node/VM；1.4.4。原生 START / 真实流量 / STOP 仍为 NOT_TESTED |
| 模拟服务单次消费与会话校验 | PASS：10/10，会员与预检、并发消费、完整双 Cookie、A/B 替换、旧/混合/伪造会话拒绝、丢回执查询、pending/拒绝、账号隔离及来源限制 | Node HTTP 服务夹具；当前源码，独立随机端口，不重启安装态账本 |
| 两个推广入口未配置 | PASS：在当前 1.4.4 分别点击商品与桌面客户端，出现各自“网址尚未配置或未通过审核”提示；标签页仍为原 3 个，没有导航 | 真实 Chrome；当前 1.4.4，生产获审地址为空，未伪造正式目标 |
| 实际代理端可达 | PASS：既有 127.0.0.1:7897 CONNECT 200，公开无认证 API 请求返回 401；没有改动所属服务 | 终端网络探测，只证明转发端可达，不证明 Chrome PAC 或付费访问 |
| 下一条真实操作 | NOT_TESTED：隔离未登录配置 `AI VIP Core 20261030` 已建立，尚未加载扩展。需在此验证 Cookie 取消后再确认、完整会话及代理启停，保留旧配置 unknown | 当前安装候选已准备；隔离安装和新增代理权限待明确确认 |

共享 SDK 修改范围仅为 `src/ui/sidebar-tools.js` 现有 `browser.cookies.setMany` 的可信审阅 Promise：通用 `E_CANCELLED` 同时用于提交前取消和提交后文档关闭，工具自身无法安全地区分。新增 `E_COOKIE_NOT_SUBMITTED` 只在精确批次尚未派发的位置产生，适用于所有批次消费者；不增加 API、权限、Host 或业务特判。公开错误语义见 [`browser-sdk.zh-CN.md`](../../../docs/api/browser-sdk.zh-CN.md#cookie-批次确认取消2026-10-30)，挂载 Host 回归验证这条边界，原始未知保护不放宽。

本机非秘密证据位于 `artifacts/ai-vip-share-core-20261030/`：`server-observations.json`、`tool-regression.tap`、`cookie-cancel.tap`、`development-profile.tap`、`server-core.tap`。额外抽查的旧 Cookie Editor 用例 `R5.37 development Cookie package grants declared capabilities for current site, never all sites` 在授权操作前的 frame 隐藏断言失败；当前 VIP 使用未被该断言阻断，保留为独立待核对项，不报告整组 Host 测试通过。

### 先完成的用户操作

1. 从真实「扩展 → AI VIP Share」打开，核对当前安装包与开发环境，记录最短操作链的首个失败或未验证点。
2. 通过合法开发接入连接本地业务服务器，看到服务器查询返回的会员状态；缺少接入时先定位入口、当前候选来源审阅或 profile 的具体阻塞。
3. 输入演示码 → 预检 → 核对账号与权益 → 明确确认 → 查看兑换结果、权益和历史。下一步才验证网站会话与代理，避免先跑整组回归。
4. 按服务器分配获取会话 → 可信确认精确 Cookie 批次 → 打开受控目标页核对会话；然后验证代理启用、访问、停用及工具重开恢复。

默认只修改本工具项目和直接相关的定向测试。沙箱 UI 使用原 `OpenDeskTool` / Browser SDK，可信适配仍在已有 `trusted/`；共享 Framework `src/` 只读。若现有公共 SDK 或可信开发配置确实阻断当前操作，先记录文档、复现、跨工具价值和最小修改范围，按对应平台 owner 合同处理，不通过新增业务特判、绕过来源锁或扩大权限解决。

### 模拟服务器与测试前提

- 复用 [`dev/local-test/local-fixture-server.mjs`](dev/local-test/local-fixture-server.mjs)；它已有会员、兑换预检/提交/状态、单次消费账本、服务器 A/B 分配、短时 Cookie 交付与 `/session/` 目标页。优先补确实缺少的场景，不另造 Provider 协议、安装器或 Host。模拟数据不进入 production，也不把 `preview/sdk-fixture.js` 的成功回执当作真实服务器联调。
- 每次自动测试创建自有 loopback 随机端口实例和全新账本；安装态联调按可信 profile 的固定地址接入。默认 fixture 为 `127.0.0.1:7898`，只允许测试请求头及获审的精确扩展 Origin；不放开任意 Origin，不占用或重启其他 owner 的服务。进程退出会清空内存账本，不能用重启抹掉 pending/unknown 事务后宣称恢复成功。
- 演示码 `DEMO-VIP-01` / `DEMO-VIP-02` 用于服务器分配 A/B。正常成功、已消费、待确认、最终拒绝、回执丢失、未绑定账号、到期/额度耗尽、断线及重新连接应能用测试夹具或受控响应稳定复现；失败注入仅覆盖本节的关键行为。
- 7898 业务服务器和 `/proxy.pac` **不提供转发代理**。代理测试需要独立、获准的本地 HTTP CONNECT/SOCKS5 实例，或已有可用代理；可以补隔离的测试代理和受控目标，但不替换用户全局代理、不放宽固定域名范围。不具备实际转发与 Chrome 回读证据时，代理访问仍为 NOT_TESTED。
- 安装态必须走现有来源、版本与权限审阅链，匹配当前候选字节和开发 profile；不得只替换旧 hash 制造准入、注入会员权益或伪造 Chrome 回执。日常扩展固定 `dist/development`，复用可用 watcher；启动时实查扩展 ID、路径与连接状态，不覆盖并行输出。正式产品不增加 Fixture 开关或工程面板。

### 关键测试条件

下列条件是待验证标准，**均未因本文创建而获得 PASS**。按当前操作顺序执行，失败后最小修复并只复验受影响项。

| 用户操作 / 条件 | 必须观察到的结果 | 关键证据 |
| --- | --- | --- |
| 打开与状态加载 | 当前安装的正式 React 正常显示；初始查询能结束；会员与记录来自同一模拟服务。未配置、未登录和服务错误有明确状态，不虚构已激活、到期或额度 | 安装包摘要、真实入口操作与服务请求记录 |
| 会员与历史刷新 | 时间、额度、功能权益按服务端时间与绑定账号正确展示；无权益、有效、到期、耗尽各不混淆。刷新或断线不清空最后核验历史，不继续允许新副作用 | 受控服务状态、界面回读与对应定向断言 |
| 激活码预检与取消 | 非法/空码不提交；Enter 只触发一次预检；显示当前账号和待兑换权益。取消或 Escape 不消费兑换码，焦点能回到输入框 | 预检/兑换请求数及服务器账本；取消时消费数为 0 |
| 确认兑换与幂等 | 明确确认后才消费；写前记录持久化成功后才提交。重复点击、同码的新预检/新幂等键及并发请求均不能重复发权益；成功后会员、记录和服务器账本一致 | 单次消费账本、幂等键关联、界面与刷新结果 |
| 兑换回执丢失与恢复 | 服务端已消费但客户端超时后显示结果未知；重开仍保留事务。只查询原事务状态，不自动重提；pending 继续锁定，权威最终结果才能解除 | 丢失回执场景、重开前后 journal、提交总数仍为 1 |
| 激活链接 | 仅合法来源与固定规则的链接带入草稿，不自动预检/兑换；用户确认仍不可省。伪造来源、重复参数和过期页面不产生副作用 | 当前页面来源验证、草稿与请求记录 |
| 服务器分配网站会话 | 用户不能任意选共享账号；A/B 由服务端分配并绑定会员与兑换。重新分配替换完整会话，新旧 Cookie 混配、旧分配及晚响应均不能冒充新会话 | 服务器分配、受控目标页的有效/拒绝状态；不记录 Cookie 值 |
| Cookie 明确授权与结果 | 未授权或取消时写入数为 0；授权后仅在用户明确意图与可信精确批次确认下，向固定目标写入完整 Cookie 对。逐项回执及目标页验证成功才展示可用 | 原 SDK 调用、可信确认、逐项结果和目标页会话回读 |
| Cookie 部分/未知与撤权 | partial、unknown、存储失败、交付过期或撤权均如实显示；不得宣布完整成功、自动重放或跨目标写入。重开保留阻断信息，秘密值不进入日志、React 状态或持久 journal | 对应负例、重开后记录及无额外写入的证据 |
| 代理启用与实际访问 | 有效权益、获审 endpoint/域名及可信确认同时满足后才 START；Chrome 回读为本安装持有。用代理端请求记录与受控访问证明允许目标经代理，范围外 DIRECT，不将 401/403 当成付费功能成功 | Chrome ownership/配置回读、转发记录和目标请求结果 |
| 代理停止与异常 | START 在途可 STOP，晚 START 不覆盖停止；重复点击不重复操作。断网、权益到期或 Provider 缺失仍能停用自有代理；控制权冲突不覆盖他人。释放未确认时保留 STOP，不虚报已停止 | START/STOP 顺序、Chrome 释放回读、冲突与未知状态 |
| 关闭重开与数据恢复 | 关闭/重开后已兑换权益可重新查询，非空偏好、兑换事务和 Cookie journal 不丢失；不重复消费、写 Cookie 或启用代理。工具停用/权限撤回后旧实例响应不能继续新增副作用 | 重开前后非秘密状态、请求增量与安装 epoch/权限定向用例 |
| 商品与客户端推广入口 | 各自只有一个入口。获审固定地址从真实点击打开正确标签页；未配置时如实提示且不导航，不阻塞兑换、会话或 STOP。不得从页面参数注入正式目标 | 两个独立目标的打开记录或未配置时的零导航记录 |

### 执行顺序、证据与完成判定

- **第一步**重查真实入口与当前候选，定位下一条用户操作的阻塞；已有有效证据可复用。优先接通模拟服务器下的会员 → 预检 → 确认 → 结果闭环，再处理会话/Cookie、代理和重开恢复。
- **第二步**以直接相关测试固定实际失败。模拟 Provider 对应 [`dev/local-test/local-fixture-server.test.mjs`](dev/local-test/local-fixture-server.test.mjs)；会员/兑换对应 [`ai-vip-share-r51-member.test.mjs`](../../../tests/environment/ai-vip-share-r51-member.test.mjs)；链接、会话与 Cookie 对应 [`ai-vip-share-local-development.test.mjs`](../../../tests/environment/ai-vip-share-local-development.test.mjs)；代理按钮和 STOP 对应 [`ai-vip-share-r59-proxy-ui.test.mjs`](../../../tests/environment/ai-vip-share-r59-proxy-ui.test.mjs)。按具体行为筛选，不因存在文件就整组执行；仅文档变更不启动产品测试或浏览器。
- **第三步**修复后在同一当前候选的真实工具入口复验核心路径。构建仅在相关源码改变且需要新产物时执行；正式可导入交付触发时，沿唯一打包器的候选验证、同源核对、晋升和源码同步提交合同执行，不新增重复正式 JSON。
- 每项结果分别登记 `PASS / FAIL / NOT_TESTED / BLOCKED`，注明 `Node/VM`、`Mock SDK 预览` 或 `真实 Chrome + 模拟服务器`、候选完整摘要、复现步骤与非秘密证据。不能把其他候选、旧测试数或页面截图当当前完整操作证明。
- **基础功能完成**要求上表适用核心路径在当前候选跑通，且没有未处理的重复消费、越权写入、未知结果重放、停止失败或重开丢失。商业配置为空的推广/生产入口按明确禁用条件验证；真实 SDK 的 Cookie 与代理若尚未跑通，必须保留对应未完成项，不能仅凭模拟成功宣布全部基础功能可用。
- 商业部署、真实付费账号/支付、生产发布、独立 95+ 评分、全量故障注入及宽度/缩放矩阵延期，不构成本轮核心完成条件。用户授权模拟服务器，不代表这些项目已完成。

## R2.11-LOCAL · 当前候选已真实升级和打开，业务验收仍未完成（2026-10-29）

**真实 Mac Chrome 安装 / 打开为 PASS；1.4.1 → 1.4.2 同 ID 升级为 PASS；正式发布为 BLOCKED。** 本轮使用新窗口，通过现有「扩展 → 导入扩展」安装仓库正式 1.4.1，再通过「管理 → 审阅新版 → 确认更新」升级到当前 1.4.2，未卸载重装、未操作第二次通用启用。升级审阅显示权限未变化，新旧完整摘要分别与候选、正式 JSON 一致。当前候选不是下方 R2.8 或 R2.3 的旧 1.4.2 字节。

- 当前候选：`artifacts/sidebar-tools/ai-vip-share/candidate.opendesk-tool.json`，91,195 字节，SHA-256 / packageHash **`bb5c0ead515ba9c8dcaaa091dc86a6cae48550270344e024d2193b64166400b0`**；React buildId `98ab726877cda3bbffb4290bb3d665e6d6a6ebf3a2bdc92ab37ec1f97e35e292`。原打包器验证 build-ready，并确认当前源码可重现相同规范包字节。
- 真实环境：Mac Chrome for Testing **149.0.7827.55**，Profile `/Users/shopme/Library/Application Support/Google/Chrome for Testing/Default`；扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。从 Chrome 扩展详情页核对加载目录为本仓库 `dist/development`；调试页显示开发服务已连接，观察到 revision `1a5ac4781d617bd4840f371e53602423fb865f46966dfa1a78785142380994c9`。这是持续开发环境，不是冻结 production 验收包。
- 已安装的正式 React 页面真实显示会员、兑换、商品、AI 网站访问和客户端推广区；未观察到白屏。服务未配置时如实显示会员信息不可用，不推断未激活或到期；兑换输入、清空和预检禁用。点击代理状态刷新后仍不能启用；两个推广按钮分别提示网址未配置 / 未审核，没有导航或虚假成功。
- Side Panel 真实关闭重开后，新 Host instance 下仍可打开同一 1.4.2 和未配置状态。Cookie 网站设置保持未授权；没有授予站点权限、写入 Cookie 或启用代理。该观察不等于 Host 拒绝非法写入、Cookie unknown 恢复或代理 STOP 已测。

**剩余必要前提：** 四项 `BUSINESS_ENDPOINTS`、生产激活链接规则及 `COOKIE_TARGETS` 为空，批准的生产代理 endpoint / profile 缺失；开发 profile 仍仅匹配已审阅 1.4.0 的 `043e97c5…`，没有借用旧批准或修改来源 pin。因此当前候选的真实会员 / 额度 / 历史、兑换输入与人工确认、专属链接、未知事务禁止重放、Cookie 授权 / 恢复、代理 START / STOP / 冲突 / 未知释放仍为 **BLOCKED / NOT_TESTED**。本轮旧版没有可操作的非空业务配置和事务，升级后的非空数据及 Cookie journal 保留为 **NOT_TESTED**；整浏览器重启也未测。

| 八维 | 本轮证据与缺口 | 正式评分 |
| --- | --- | --- |
| 真实安装与启动 | 原安装器安装、升级、React 打开和面板重开 PASS | NOT_SCORED |
| 会员状态正确性 | 未配置状态 PASS；真实账号 / 权益 / 额度 NOT_TESTED | NOT_SCORED |
| 兑换交互与事务安全 | 未配置入口禁用 PASS；真实事务及人工确认 NOT_TESTED | NOT_SCORED |
| Cookie 授权与恢复 | 未授权 UI 状态可见；真实拒绝 / 交付 / unknown 恢复 NOT_TESTED | NOT_SCORED |
| 代理控制与 STOP | 状态刷新与未配置限制 PASS；START / STOP / 冲突 / 恢复 NOT_TESTED | NOT_SCORED |
| 升级与持久化 | 同 ID 升级和面板重开 PASS；非空旧数据及 journal 保留 NOT_TESTED | NOT_SCORED |
| React 与 SDK 运行一致性 | 当前包真实渲染及代理状态刷新 PASS；有副作用的 SDK 分支 NOT_TESTED | NOT_SCORED |
| 构建、权限与发布质量 | 候选同源、安装摘要与权限差异核对 PASS；当前冻结 production 与业务发布门禁未完成 | NOT_SCORED |

不以局部 PASS 代替完整维度，不生成缺乏完整实测的分数或算术平均分。历史 157 项 Node 与 12 状态 Chromium 结果按原验证级别保留，本轮没有重复执行完整矩阵。

按用户随后要求复用既有测试程序，本轮定向运行会员、local-development 和代理 UI 三个现有测试文件中的 **24 个核心安全用例，24/24 PASS**。覆盖两步兑换与取消、未知兑换和写前持久化、激活链接仅填草稿及来源拒绝、Cookie 明确意图 / 撤权 / unknown 禁止重放，以及 START 晚响应、Provider 缺失 / 过期时 STOP、未知控制权恢复。该运行只在 Node/VM 与内存 fixture 中执行，不启动浏览器或端口，不修改安装包、来源 pin 或真实 Cookie / 代理；**不替代上述真实 Provider、Cookie 交付、代理 START/STOP 或非空升级数据的 NOT_TESTED**。本机完整日志为 `artifacts/ai-vip-share-r211-local-20261029/core-safety-node.tap`。

Cookie Editor 的 `account-service.js` 在本轮只读检查时通过现有 `describeBundle` 来源准入；该快照中未复现旧哈希阻断，**不代表全仓构建 PASS**，也没有因此修改其源码 / pin 或重建共享输出。其他 owner 后续修改不在本次准入结论范围内。

本轮未复现需修复的 AI VIP Share 业务源码问题，仅补充本节验收事实。原生界面观察与截图位于本次 Codex 对话工具记录；本机 `artifacts/ai-vip-share-r211-local-20261029/observations.json` 是带候选身份的代理观察摘要，不冒充原始 AX dump 或独立原生复测。唯一正式 JSON 仍为 **1.4.1**，SHA-256 `70cd5025eb63940cb678ffe47f4d2c580aeff6e2807e8dddfebef8544b3c2827`；未晋升、未发布。下一步由业务和可信配置 owner 提供当前候选获审的服务 / 目标 / 代理范围，再补上述核心分支及非空升级恢复证据。

## R2.8 扩展内安装续接状态（2026-10-28）

**下一步仍是 OpenDesk Browser「扩展」内审阅安装 / 同 ID 升级并打开工具，当前为 `BLOCKED / NOT_TESTED`。** 本轮浏览器能力清单没有 Side Panel 安装控制入口；交接中记录的 `chrome://extensions/` 安全策略拒绝未解除，未换用其他浏览器面、CDP、命令或私有接口绕过。没有执行新的扩展安装或新窗口核心操作，也没有确认实际启用扩展的 ID、加载目录或持续开发连接。约定日常目录仍为 `dist/development`；其他 owner 的浏览器、Profile、watcher 和输出均保留。下方 R2.3 的旧候选原生证据不适用于本候选。

已用唯一打包器从当前有效 `dist/build-ready.json` 生成临时候选 `artifacts/sidebar-tools/ai-vip-share/candidate.opendesk-tool.json`：**1.4.2，89,127 字节，SHA-256 / packageHash `2b7e5fc5a31d288d159fdcf9d731960cb63983774daf8e12d499b777b26812bf`**，`validated: true`、`installed: false`。相对 1.4.1 六项 capabilities 不变，新增固定 `opendesk.react-ui.v1` UI Runtime。React buildId 为 `b58b5e2e61d0868d8df02469ee36f87a1a9955786df9baabb344a51c70f5ad6c`。正式 1.4.1 JSON 的 SHA-256 仍为 `70cd5025eb63940cb678ffe47f4d2c580aeff6e2807e8dddfebef8544b3c2827`；未执行晋升、覆盖或发布。认可的 `preview/design.html` 未改。

**来源与业务阻断：** 开发特权来源锁仍只批准 1.4.0 的 `043e97c5b92685d4865b03b36d45896777153709e8b32f7fca9530828c40ddfe`；当前 1.4.2 不得借用旧批准。生产托管代理名单为空，会员 Provider、Cookie 目标、代理 endpoint 和两个推广 URL 仍未配置 / 批准。候选包校验不会授予这些权限，也不证明会员、兑换、网站登录或代理成功。需先由现有可信配置 owner 审阅当前候选及固定测试范围，再通过可获允许的真实扩展安装入口继续。

本次移交差量修复了 Cookie journal 尚未读完 / 读取失败时兑换可能提前放行的问题；读取完成前禁用预检与确认，unknown / partial 继续禁止重放。另修复应用 CSS 中四处无效颜色、深色推广小字可读性和窄屏会员数字 / 单位拆行，以及旧 CI 缺少 React 构建前置、失效的样式来源断言。预览外壳、截图和源码摘要核对只属于辅助测试，不进入第二套产品或授权流程。

证据位于 `artifacts/ai-vip-share-r28-20261028/`：继承 `node-final.log` 的 104/104 与最后差量 `node-final-delta.log` 的 39/39，二者不是一次最终全量运行，也不能相加成去重数量。本轮重核 `chromium/report.json` 的 24 个源码 / 产物摘要，并确认正式 React build-ready 的全部源码摘要与该预览回执一致，见 `evidence-reuse-current.json`；未重跑有效矩阵。原 118 张截图仍为 Chrome 156.0.8078.48 的 **Mock SDK 同源预览**；`installed`、`nativeCookie`、`nativeProxy`、`provider` 均为 false，200% 项仅是 CSS zoom。当前候选与正式包身份见 `package-current-identity.json`，新打包回执见 `package-current.log`。新的远程 CI 尚未验证。

独立 diff 审阅未发现阻塞性问题，新增恢复门禁、推广与 CI 的 12 项定向 Node 用例通过，另核对旧 Host 接线用例和 7 个 JS/MJS 的语法。审阅指出的仅匹配 import 变量名问题已收紧为检查实际 `<style>` 注入，随后 R5 受影响套件 6/6 通过，见 `node-r5-current.log`；预览 build-ready 的损坏 / 缺失回执负向用例仍为低优先级待办，未为此扩展浏览器矩阵。

| 八维 | 已有证据 | 当前缺口 | 正式评分 |
| --- | --- | --- | --- |
| 视觉一致性 | 同源预览、认可 HTML 与修复后截图 | 最后候选独立视觉复核及安装态对照 | NOT_SCORED |
| 响应式布局 | 六宽、浅深色预览及数字 / 单位几何断言 | 当前安装态、真实 GUI 缩放 | NOT_SCORED |
| 交互体验 | 预览明文输入、清空、取消与 Escape 焦点 | 扩展内同候选操作 | NOT_SCORED |
| 功能正确性 | Node 兑换恢复、推广错误与 STOP 定向证据 | 合法服务和真实 SDK 核心链 | NOT_SCORED |
| 无障碍 | 预览真实键盘与深色 CTA 对比度证据 | 当前安装态焦点与辅助技术复核 | NOT_SCORED |
| React 架构 | 单 Root、固定 Shared UI、源码与产物摘要一致 | 当前安装沙箱运行 | NOT_SCORED |
| 安全边界 | Cookie 恢复门禁、未知不重放及来源锁保留 | 当前包获审、原生权限及撤权 | NOT_SCORED |
| 真实安装质量 | 规范候选及版本 / 能力差异已核对 | 安装 / 升级、数据保留和打开均未执行 | NOT_SCORED |

有 `NOT_TESTED` 项，不计算正式八维平均分，不宣称 ≥95 或产品验收完成。

## R2.7 当前正式源码与验证边界（2026-10-28）

**现行 UI 契约：** [`preview/design.html`](preview/design.html) 是已认可的独立 HTML 视觉参照；真正可安装的 React 组件仍只有 [`src/App.jsx`](src/App.jsx)，入口 [`src/main.jsx`](src/main.jsx)，公共 SDK 事务控制器为 [`src/main.js`](src/main.js)。正式同源预览为 [`preview/index.html`](preview/index.html) + [`preview/main.jsx`](preview/main.jsx)，经 `npm run build:preview --prefix examples/sidebar-tools/ai-vip-share` 编译；不可把历史设计原型或受控 SDK fixture 当作已安装业务。

- 会员主卡、兑换区、真实记录折叠区、AI 网站访问和新增的桌面客户端推广卡保留同一个 React Root，不添加内部商品商城或支付页。
- **激活码输入框现为普通文字，内嵌清空按钮，不再有密码眼睛按钮**。旧 R2.2 及历史章节中的“默认遮蔽”描述只属旧版本；原预检、明确确认、恢复与 Cookie unknown journal 未重写。
- 商品卡恰好一个“查看更多商品”入口；AI 网站访问下方独立的“推荐 AI 代理电脑客户端”推广入口。只有被审核写入源码常量 `PRODUCT_CATALOG_URL` 和 `DESKTOP_CLIENT_URL` 的 HTTP/HTTPS 地址，才能通过公共 `browser.tabs.create` 打开。**两个正式地址当前均为空**；按钮保留可见，点击仅如实提示未配置，不导航、不报业务成功。商务 Provider 的 HTTPS 严格校验、Cookie、代理和兑换不受两个推广入口影响。
- 色彩以公共 `@opendesk-shared-design` 语义令牌为唯一来源，紫色在 App CSS 内从官方色板混合推导，不引入私有原始色值、全局按钮皮肤、第二套主题或宿主 CSS 修改。和设计参照的像素差异必须通过 Chromium A/B 截图人工复核；不得声称自动像素完全一致。
- 源码目标仍是 1.4.2；仓库历史 `ai-vip-share.opendesk-tool.json` 仍是 1.4.1。必须通过来源锁、候选同源、公开 SDK 与真实 Chrome 审阅后才能进行版本晋升；本文本身不构成安装/发布批准。
- 专用验收：`npm run build --prefix examples/sidebar-tools/ai-vip-share`，`npm run build:preview --prefix examples/sidebar-tools/ai-vip-share`，`node --test tests/environment/ai-vip-share-r5-ui.test.mjs tests/environment/ai-vip-share-r51-member.test.mjs tests/environment/ai-vip-share-r59-proxy-ui.test.mjs tests/environment/ai-vip-share-ui-parity.test.mjs tests/environment/ai-vip-share-local-development.test.mjs`，`node examples/sidebar-tools/ai-vip-share/preview/test-react-chromium.mjs`。**其中 Chromium 是 Mock SDK 同源预览而非 Mac 安装验收。**

本节为 R2.7 唯一现行解释；下方 R2.3、R2.2、R1.x 长期保留为历史真实证据，其旧 UI、版本摘要和测试结果不得推断为 R2.7 当前版本的通过结论。

## R2.3 当前验收 · 安装升级已原生验证，业务验收仍阻塞（2026-10-27）

**P2 安装升级为 `NATIVE_VERIFIED`；完整业务验收尚未通过，正式交付仍为 `BLOCKED`。** 用户确认商业服务尚未配置，本轮只验收获批准的受控环境。隔离 Chrome for Testing 154.0.8037.92 经原可信安装器完成正式 1.4.1 → 当前 1.4.2 同 ID 审阅升级，未卸载重装；审阅页核对旧、新完整摘要及权限未变化。升级前用公共存储 API 准备了非空测试偏好、1.4.1 未确认兑换和 Cookie unknown journal，升级及关闭重开后，三项值与 ETag 全部不变。它们是非秘密的兼容性测试状态，不是业务成功回执。

当前安装态为 React 19.2.0、Shared UI、一个 `tool-app` Root；沙箱 origin 为 `null`，访问父文档被 SecurityError 拒绝，无 `chrome.runtime`。服务未配置、兑换恢复锁定及 Cookie 未知禁止重放均真实显示，没有虚构有效会员。Tab → Enter 刷新代理状态曾丢失焦点，本轮仅修复其异步焦点恢复；最终候选原生复验按钮保持焦点，Escape 不清除恢复状态。定向代理 UI 回归 8/8（含不抢其他控件焦点、START 在途 STOP、晚响应和未知释放保护），源码语法及规范包同源核对通过。

最终候选 SHA-256 为 `5d48f78d0f5daf7e5687487aedacecdf5fc77426fef6fe6c803e6295462a433e`；React buildId 为 `7ff0a06b8043a2a2b099991a44dc21e647b518877dd57fe99c7e2635d1236f3f`。唯一正式 JSON 仍为 **1.4.1**，SHA-256 `70cd5025eb63940cb678ffe47f4d2c580aeff6e2807e8dddfebef8544b3c2827`，未晋升或覆盖。复用的 production 宿主摘要为 `20b36f47e95ffd37b518d70eb557bcd8a853e57de4e2a156afaa9e3f987d07c8`，来源及 115 个文件与原构建回执匹配；没有重建或覆盖共享宿主。自有 Chrome 实例与临时 Profile 已清理，其他浏览器、服务和用户日常配置保留。

**剩余阻断：** development profile 的可信批准仍仅对应旧 1.4.0 摘要，当前候选没有匹配批准；正式 React 也没有本地开发切换入口。应由既有可信配置 owner 审阅上述最终候选、固定本地目标与合法入口，交付匹配 Host，不能只替换 hash、注入偏好/权益或借用旧批准。会员查询 → 预检 → 明确确认 → 结果/历史、URL 激活、Cookie 精确批次及网站身份回读、代理启停/冲突/撤权仍为 `BLOCKED/NOT_TESTED`。Stay Focus 来源锁未修改。

此前五档 320/360/400/440/520px × 浅深色和 50 条历史的同源 Chromium 差量是 **Mock SDK 预览**；布局输入未变，可限定复用。当前安装态仅核验 360px 浅色的未配置、恢复锁定和 Cookie unknown 状态；完整 Sandbox 尺寸/主题、200%、其余状态与键盘矩阵仍 `NOT_TESTED`。不把预览、旧 A/B 或 Cookie 写入回执当当前业务 PASS。十维正式评分均未完成，不产生 95+ 或综合分。

本机完整来源及十维缺口见 `artifacts/ai-vip-share-r23-native-20261027/acceptance.json`，最终原生审阅、存储前后读回和截图在其 `native-final/`。早先文件选择阻断已用原生键盘路径选择解决，属于驱动问题，未修改安装器。旧候选 `94f580…` 的 P2 及焦点失败证据保留在 `native-keyboard-retry/`，不替代上述最终候选。

## R2.3 · 去掉独立「我的权益」区块（2026-10-27）

正式 React 会员主卡只呈现会员状态、账号、主要权益指标、有效期和真实兑换记录；不再重复出现「我的权益」标题及完整列表。若服务端还返回额外额度、时间或功能权益，主卡底部只提供简洁的辅助信息，不复制主要权益，不删除服务端数据、校验、兑换记录或持久化 journal。预览与正式 React 同源；模拟权益仅用于验证排版，真实服务未配置时依旧关闭敏感入口。本轮 1.4.2 仍为网页源码候选，任何 Native/正式包晋升都需单独通过门禁。

## 当前 R2.2 产品决定（2026-10-27）

**正式业务界面只有四个核心入口：AI 会员、兑换激活、兑换记录（会员卡内折叠）和 AI 网站访问。** 仅收到经批准的合法网站会话后，额外条件显示「网站会话」并请求可信 Cookie 操作；不再有“公司共享账号”卡片或 A/B 选择器。服务端账号与会话归属校验、旧恢复 journal、A/B 测试夹具保留在非展示层，不能因 UI 精简绕过身份或撤权保护。

- 激活码输入框采用一个完整输入控件，右侧内嵌显示/隐藏与清空按钮；输入默认遮蔽，且必须先预检、明确确认才兑换。
- 完整预览使用同一 `src/App.jsx`、`src/main.js` 和 `src/style.css`。外部仅保留一次「虚构数据」标识；模拟场景切换在 `preview/`，不会打包进正式工具。
- 预览会员标题采用正常产品用语，不再在字段或 SKU 中拼接“演示网站访问”等字样。它们仍是模拟数据；真实商业 Provider、批准目标和商品服务未上线。
- 当前仅为 **1.4.2 网页源码候选**；未经同 SHA 定向 CI、打包和原生安装验收不能将旧正式 1.4.1 JSON 视为已更新。曾通过的 A/B Cookie CfT 是历史技术证明，不是现行产品/网站登录成功的证明。

以下是历史开发和真实测试记录，不构成现行页面结构要求。

---


**2026-10-22 · 可信界面归属：** 旧 `aiAccess.control` 可信适配区的状态、代理操作按钮、错误与本地测试说明已从通用 React 设置页归还 [`trusted/react-controls.tsx`](trusted/react-controls.tsx)。原固定 Host、lease/STOP、`browser.proxy.managed.*` 与敏感数据审批保持原合同；此文件仍经精确来源锁编入 Browser，不能由安装 JSON 替换。当前 1.4.1 包已使用沙箱 SDK 界面，旧可信区保持隐藏。本次没有修改正式工具包字节，也没有补齐生产服务配置或完成动态后台迁移。候选及验证边界见 [R1.4 记录](../../../docs/framework/workstreams/dynamic-app-runtime-r14-local-20261022.md)。

## 当前包同步 · 1.4.1

本次用原打包器同步当前共享设计 CSS，并将持久回执版本更新为 1.4.1、追加恢复兼容版本，保留全部旧版本记录。工具身份、6 项能力和业务流程保持不变；JS 仅更新上述两处发布元数据。

在 Chrome 156.0.8078.4 的独立 production Profile，经原可信安装器完成 **1.4.0 → 1.4.1** 审阅升级，并核对真实 SIDE_PANEL 入口、自然内容布局与安装版本。Browser 候选 SHA-256 为 `642430bddfa2ec8cb087174f625652a3b831934a9b228de54e588b2160c1a092`。限定结果为 PASS；旧版非空数据保留、完整尺寸/业务验收仍为 `NOT_TESTED`，生产服务仍未配置。原始审阅、截图和 DOM 在本机 `artifacts/sidebar-full-height-r13-local-closeout/package-native-closeout/`。下方 1.4.0 测试与原生记录仅属旧版本。

## 1.4.0 历史核心交付（2026-10-20）

本轮小目标：手动激活码和允许网站 URL 两个入口，均由服务器分配账号，经现有 Cookie Host 审阅与逐项写入后，在真实目标网页核对相同身份。不再提供账号选择器，会员权益、兑换回执、代理状态分别展示，均不等于网站登录。

生产指定网站、参数、激活接口与 Cookie 目标仍未确认，生产配置保持空，`NOT_TESTED`。当前仅采用 [本地受控开发协议](dev/local-test/README.zh-CN.md)：

1. 在匹配来源的 development 扩展安装/升级唯一正式 JSON，审阅新增的 `currentPage.read`（读取当前目标标题/URL）；打开工具并选择「连接本地开发」。这只是本地服务选择，不是安装后的通用启用步骤。
2. 手动入口：输入 fixture 的第一张测试码，预检、确认激活。服务器分配公司共享账号 A，工具自动请求该次分配的结构化会话。
3. URL 入口：保持工具打开，访问开发协议 `http://127.0.0.1:7898/activate?activation_code=<测试码>`。第二张码由服务器分配公司共享账号 B。仅接受这个精确 origin/path、一个合法 `activation_code`；其他站点、路径、重复参数、额外参数或 hash 不触发。
4. 两个入口取得交付后，按现有工具设置授予精确目标站点 Cookie 权限，点击「确认写入网站 Cookie」，在可信 Host 审阅本次批次。写入成功后由原 SDK 打开目标站点 `/session/`；以该网页显示的服务器分配身份为准。写入/打开失败时不能视为登录成功。

URL 检测只在已打开的安装工具中运行，不启动后台沙箱。关闭工具时访问 URL 的后台唤起尚不支持；不以第三方页面消息或远程 `scripts` 执行替代。激活 URL 按无原始码的盐化摘要记录防重复标记，首次请求前 CAS 保存并读回；同码重复打开、重开工具或未知结果不会自动消费/写入。兑换仍沿用服务端幂等事务与终态查询，Cookie 值只在内存。部分写入、未知结果、范围/身份变化、过期或撤权均停止，不清空无关 Cookie。

关键验证限于两个入口、URL 边界、分配/范围绑定、晚响应和恢复，以及受影响的定向测试、包同源检查与开发版真实扩展链路。商业后台、日常用户 Chrome、production 安装验收与独立评分均 `NOT_TESTED`。下文旧版本记录仅为历史。

1.4.0 当时验证结果（历史）：

- 手动码 → 服务器分配 A → 原 Host 两项 Cookie 逐项写入/核验 → SDK 自动打开网页显示 A：真实 CfT PASS。
- 允许 URL → 自动激活并分配 B → 同一 Host 链写入 → 工具自动打开网页显示 B，旧 A 页面刷新显示 B：真实 CfT PASS。
- 重复 URL、经「我的 → 扩展」销毁旧沙箱后重开：不重复消费、申请交付或写入，真实 CfT PASS。
- 五类无效 URL 的原生边界步骤 PASS，绑定同一包、SW 和开发 revision。该次整轮因共享「返回」按钮没有离开工具而 `NATIVE_UI_BLOCKED`；最终核心整轮改用正常 Tab 往返重开并通过。共享返回按钮问题保留证据，未扩大平台源码修改。
- 工具定向测试 80/80、development 来源 pin 5/5、fixture HTTP 31/31；HTTP 仅保留实际执行摘要，其余原始日志在证据目录。

当时正式包版本 **1.4.0**，SHA256 `043e97c5b92685d4865b03b36d45896777153709e8b32f7fca9530828c40ddfe`。当时 `--promote-from` 与 `--check-project` 同源检查通过。实际测试加载 `dist/development`、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，开发服务已连接；revision `fe05bfd9e2e5077259298858b1603e96d1f89ea38e218549770af8c4f7dbdecb`，SW SHA256 `08c997ef580809610ebb6444c2db90082ebdbf8b51dedaec4e19bbf5da41630d`。

证据索引：仓库本机 `artifacts/ai-vip-activation/result.json`；最终整轮 `native-core-8-receipt.json` / `native-core-8.log`，同候选 URL 边界步骤 `native-core-6-receipt.json`，定向测试 `targeted-node.log` / `pin-node.log`，fixture 执行摘要 `fixture-result.json`。所有诊断删去原始激活码、URL 参数值与 Cookie 值。运行所用 IPv6 fixture / CfT profile 已清理，既有 watcher 和代理服务保留。


正式工具 ID：`ai-vip-share`；源码目录：`examples/sidebar-tools/ai-vip-share/`。
用户从 OpenDesk Browser「扩展」安装，不需要持有浏览器项目源码；本工具不提供任意节点、PAC 编辑器、任意 Cookie 会话移植或常驻日志；仅接收经批准目标的受控 Cookie 交付。

<a id="current-status"></a>

## 1.3.9 历史观察

旧候选 `1.3.9`（SHA256 `5ada3db027303b3b07077699625c11048b29546ecee3d7ea631b9318979c23b4`）曾在独立 CfT 中通过原 Host 写入两项 Cookie，目标页显示公司共享账号 A。旧整轮结果为 `NATIVE_UI_BLOCKED`，不能报告整轮通过；证据保留在 `artifacts/ai-vip-share-switch/`。手动账号选择与 A→B→A 已被服务端分配需求取代，不再作为操作说明或验收要求。

## 当前接线合同与历史来源

唯一可导入包为本目录的 [`ai-vip-share.opendesk-tool.json`](ai-vip-share.opendesk-tool.json)，由唯一打包器验证候选后晋升。正式顺序为会员 → 兑换 → Cookie 交付 → 商品 → 代理；沿用原控件 ID、opaque-origin 沙箱、现有安装存储和公共 Browser SDK。当前 v2 能力为 `storage.local`、`network`、`browser.tabs`、`browser.proxy.managed`、`browser.cookies.write`、`currentPage.read`；R2–R5.2 下文关于旧 `aiAccess.*` 与 `SDK_BLOCKED` 的描述仅是历史，不能当作当前接线。

代理仅显示一个启停主按钮。START 等待期间可主动 STOP；晚到 START 与旧状态读取不能覆盖 STOP，未证明释放时保留停用入口与待确认提示。停用不依赖会员、商业 Provider 或合法启用端点。会员核验成功后会同步刷新启用条件，失败信息不会被普通重绘吞掉。兑换继续先预检、再本人确认；持久事务读回按已验证字段比较，写入等待后再次检查预检时限。存储暂时读取失败可主动重试；未知事务不自动重发、清除或认定成功。

production 的 `BUSINESS_ENDPOINTS` 四项（`member`、`voucherPreview`、`voucherRedeem`、`voucherStatus`）、`PRODUCT_CATALOG_URL`、`APPROVED_PROXY_ENDPOINT` 及 `COOKIE_TARGETS` 仍为空。商业会员、专属激活 ticket 的安装意图续接和带凭据的付费 API 尚未完成；兑换恢复记录不代表安装续接。

在持续 development 构建中，可信 SDK 仅向源码审阅锁定的本工具包返回固定本机 profile。用户主动选择「连接本地开发」后，工具经公开 `browser.network.request` 访问 7898 的会员、预检、兑换及回执 API；输入 `DEMO-VIP-01` 并确认兑换，真实 fixture 回执才授予演示权益。之后可以通过公开 `browser.proxy.managed` 启停 **HTTP 127.0.0.1:7897**，不使用旧 `aiAccess.*`。界面明确显示「本地开发」，不是付费会员。生产构建不提供该 profile，也不读取或复用本地选择来启用代理。

具体运行方式见[本地联调说明](dev/local-test/README.zh-CN.md)；开发原生证据及尚未验证项只维护在[Managed Proxy 工作记录](../../../docs/framework/workstreams/ai-vip-share-r54-managed-proxy-sdk-closure-20261015.md)。旧候选历史见 [R5.9 工作记录](../../../docs/framework/workstreams/ai-vip-share-r59-formal-core-20261016.md)，不代表当前 production 验收。

<a id="cookie-delivery-137"></a>

## Cookie 交付：1.3.7 历史证据与合同（2026-10-20）

本节保留 **1.3.7 Cookie 交付轮次**的受控流程、数据合同与历史证据，不是同日 1.3.8 的验证结果。1.3.8 指定受控范围见顶部；新包真实 Cookie 写入仍为 `NOT_TESTED`。

受控流程：连接本地开发 → 预检并确认兑换 → 收到服务端 `cookieDelivery` → 核对目标与替换当前会话的提示 → 点击「确认写入网站 Cookie」→ 由原可信宿主确认本次精确批次 → 显示逐项回执 → 在目标页面核对会话。缺少 Chrome Cookie/网站权限或工具站点 write 授权时，先在原可信设置授予该目标；不借用 Cookie Editor 的全站或特殊批量身份。此确认是具体 Cookie 副作用意图，不是通用的二次启用。

当前只有开发来源 pin 允许的 `http://127.0.0.1:7898/session/` 是受控交付目标。生产 `COOKIE_TARGETS` 为空；真实 AI VIP 后台、目标站点和所有者授权均尚未知。历史 CSDN 消费者返回 `scripts[0]`，不能视为 AI VIP Cookie JSON 合同；本工具不会执行服务端脚本。以下为测试协议，不是线上服务协议：

```text
已验证的 redeemed 回执（匹配 accountId、idempotencyKey、redemptionId）
  cookieDelivery:
    schemaVersion: 1
    deliveryId: 有界且稳定的交付标识
    targetUrl: 固定批准的完整 URL
    expiresAt: Unix 毫秒；必须在当前服务端时间后 5 分钟以内
    cookies: 1–50 项；整批 <= 12000 UTF-8 字节
      name, value, path（必填）；domain、secure、httpOnly、sameSite、expirationDate（可选）
```

`expirationDate` 使用 Unix 秒，不沿用旧实现的「统一延长一天」。SameSite 采用 Chrome `unspecified/lax/strict/no_restriction`；Secure/前缀约束照公共 SDK。domain 只允许目标 hostname（可有前导点），拒绝跨域、错误 store/partition、未知字段、重复 identity、失效及超限数据。工具不请求全站权限，不自动改变 Store/Partition，也不允许危险请求头或沙箱 fetch 绕过 SDK。

原始值通过既有 SDK 的受控消息交给 Chrome 原生 Cookie 存储；交付副本仅留沙箱与测试服务内存，不进入工具存储、URL、页面文本、日志或截图。工具存储只保留有界交付标识、目标、账号、操作标识和脱敏逐项回执，写前 CAS+读回确认。完整 verified 回执才显示写入成功；部分成功不会自动回滚、清除或重放，未知/不完整回执及丢失应答都保留禁止重放状态，返回重开不自动发起写入。确定未调用接口的失效操作记为未提交；SDK 在写入前明确拒绝的权限、格式或容量错误记为未写入，仅可由用户修复后主动重试，交付过期则拒绝。

Cookie 写入与代理各自保留状态：启停代理不删除 Cookie，写 Cookie 不启动代理；同 Profile 共用 Cookie 存储，新增 Clash 端口不能隔离它。正常复用 7897。受控页面显示「受控会话有效」才是 1.3.7 该候选的页面证据，不能据此认定第三方登录或付费会员成功。

## 产品设计与原型（R4）

会员账号、权益、专属激活链接、安装引导及更多商品的历史产品规范：[`DESIGN.zh-CN.md`](DESIGN.zh-CN.md)。
可离线交互的 HTML 评审页：[`preview/ai-vip-share-r4-preview.html`](preview/ai-vip-share-r4-preview.html)，仅供审查，不接入真实账号、支付或代理。

## 本地构建与验证

```sh
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-vip-share --out artifacts/sidebar-tools/ai-vip-share/candidate.opendesk-tool.json
node --test tests/environment/ai-vip-share-r5-ui.test.mjs tests/environment/ai-vip-share-r51-member.test.mjs tests/environment/ai-vip-share-r59-proxy-ui.test.mjs tests/environment/sidebar-tools.test.mjs
# 仅在门禁通过且候选仍与源码逐字节匹配后：
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-vip-share --promote-from artifacts/sidebar-tools/ai-vip-share/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-vip-share --check-project
```

## 安装身份迁移

### 导入提示“工具能力声明超出当前支持范围”

本包需要支持 `browser.proxy.managed` 的 OpenDesk Browser。请在 Chrome 扩展详情中核对实际加载目录与扩展 ID；扩展显示 `0.1.0` 不能区分不同时间生成的源码。

2026-10-16 已定位的一例来自 **OpenDesk Schedule Demo CFT 的历史 production 验收候选**，其导入白名单没有这项能力。日常 Google Chrome 加载本仓库 `dist/development` 的实例已支持当前四项声明，并通过正式文件审阅、打开、返回及重开验证。使用日常开发实例时保留现有 ID 与 Native 配对；历史验收候选由所属工作流单独升级，不能覆盖旧候选或删减工具能力。Standard/Developer 名称本身不是支持能力的判断依据。

已安装相同包时，导入面板显示“已安装相同工具”，直接取消导入并打开现有工具即可保留数据。商业会员、商品、兑换和代理 Provider 尚未配置；本地演示路径按下文主动选择，导入通过本身不授予权益。

`ai-vip-share` 是新的独立安装身份，不能自动继承 `ai-smart-access` 的安装授权、epoch、激活租约或启用状态。
旧版工具应在代理释放后明确卸载，再审核安装新版。旧版卸载只能清理旧身份数据，不能覆盖新版可能持有的代理设置。

## 历史过渡架构与阻塞（R2，已被公共 SDK 迁移取代）

新目录目前承载 UI 和声明式包配置；Chrome 全局代理控制仍由旧的宿主
原 `src/ai-smart-access/` 的 R1 可信模块已迁入本工具 `trusted/`（仅编译期可信适配，不随 JSON 动态加载）。`aiAccess.*` 只是内部过渡协议，
**不属于已正式批准的公共 SDK Managed Proxy Capability**。
后续须把域名、激活、服务商配置等业务迁入此工具，复用 SDK R11 审核通过的公共代理框架，并删除专用 Host/Service。
不得借更名重复开发 SDK 或授予沙箱 `chrome.proxy` 权限。

正式服务未配置：`PROVIDER_BLOCKED`；受控 Chrome 网络、重启与生产激活需在 Mac/CFT 补齐原生证据。
R2.1 核查（2026-10-15）：R11 的批准 Registry 没有 Managed Proxy，发现目录的 `chrome.proxy` 不等于对工具开放；本工具仍为 `SDK_BLOCKED`。不能把内部 `aiAccess.*`、独立 UI 目录或受控 PAC 网络测试当作业务解耦完成。1.0.1 将后台错误/迁移原因显示到状态区，未添加第二个代理开关。

恢复旧安装时必须保留尚在运行的旧身份代理保护，不将旧租约迁给新身份；显式停止/卸载只能清理已证明属于该身份的资源。无法区分所有者、存储失败或缺失回执时保留待处理状态，不自动退回直连。逐文件缺口、测试及候选身份见 [R2.1 工作流](../../../docs/framework/workstreams/ai-vip-share-r21-01a13df4.md)。

历史基线：`docs/framework/workstreams/ai-smart-access-r1.md`。

## R5 正式 UI（1.1.0）

正式已安装工具从 `src/index.html`、`src/style.css` 与 `src/main.js` 展示会员主卡、兑换激活与更多商品入口。CSS 构建时抽取官方 Design System；不复制原型 CSS。代理唯一启停按钮位于现有宿主的可信卡片，紧随隔离 UI 之后；旧 `aiAccess.*` 仍为过渡协议，公共 Managed Proxy 仍是 `SDK_BLOCKED`。

正式会员/兑换/商品 Provider 没有部署，因此展示未核验与未配置，不收取兑换码、不显示伪造时长、订单或兑换成功。专属 ticket 安装续接仍 `PROVIDER_BLOCKED`；离线 R4.2 不是生产接线。

「查看更多商品」设计为**外部商品目录标签页**，不是弹窗。工具内 `PRODUCT_CATALOG_URL` 保持空；取得已审核 HTTPS 商城 URL 后，应升级 v2 包、单独审阅 `browser.tabs` 能力，通过已有 Browser SDK `browser.tabs.create` 打开，不能在 opaque sandbox 中绕过宿主。

状态、测试与阻塞以 [R5 工作流](../../../docs/framework/workstreams/ai-vip-share-r5-production-ui-20261015.md) 和同候选 CI 为准；R4.2 33/30 是历史离线数据。

## R5.1 · 正式源码交互与业务边界（1.1.1）

正式可安装版本已升级为 `1.1.1`。会员中心在经过服务端验证的情况下按商品权益类型显示：时间类按服务端时间与 `expiresAt` 展示剩余天数/到期日；额度类显示 `remaining/total/unit`；功能类显示具体商品功能说明，绝不将所有权益转换成月数。兑换记录只读取服务端已脱敏的账号与券码信息，列表为空或核验失败会明确区分。

兑换码采用 **预检 → 本人确认 → 服务端幂等回执 → 刷新权益**。预检后不在输入框留存原始兑换码，确认前可取消；POST 结果未知时只引导核对记录，禁止自动重复兑换。客户端不会用旧技术 `aiAccess.activate` 代替商业兑换。已准备严格的数据响应和账户一致性验证，但**没有正式商业 Provider，当前发布包仍停用兑换/权益刷新**，没有新申请网络权限，也没有预置生产域名。

未来正式服务的三个固定 HTTPS 端点须经过业务与安全评审后填写到 `src/main.js` 的 `BUSINESS_ENDPOINTS`，并升级为 v2 工具、声明已批准的 `network` 能力，依据既有 SDK `browser.network.request` 走可信宿主授权；不得改变 `sandbox.html` 的 `connect-src 'none'` 安全限制。前端读取服务端版本化数据（`schemaVersion:1`、`serverNow`、`account`、`entitlements`、`redemptions`）；预检返回与账号绑定的短效 `previewId`，消费操作带唯一 `idempotencyKey`，确认回执必须含匹配账号/事务号与真实授予权益。这是**客户端拟接线边界**，不表示后端合同已批准或服务端已部署；最终结构应由审核后的 Provider 决定，必要时同步调整客户端与测试。

「查看更多商品」优先外部 HTTPS 新标签页，`PRODUCT_CATALOG_URL` 仍为空。配置经过审核的无长凭据 URL 后升级 v2 `browser.tabs` 能力，并经既有 `browser.tabs.create` 与受信点击批准。短效激活 ticket、官方安装/回跳仍被正式服务与可信安装合同阻塞，不读取任意网页 URL 来冒充安装/会员授权。

可信代理卡在启用请求尚未返回时允许用户发起停用；只由原可信 Host/Worker 串行处理，晚到启用应答不可覆盖新 STOP 状态。仍保留旧 `aiAccess.*` 协议兼容及所有 Owner/撤权保护，旧 `src/ai-smart-access/` 重复业务目录已删除；公共 Managed Proxy SDK 未正式批准，`SDK_BLOCKED`。真实启用还依赖旧代理技术 Provider 的已批准租约服务；无该服务时不能声称代理可连通。

定向验证与 GitHub 同候选证据详见 [R5.1 工作流](../../../docs/framework/workstreams/ai-vip-share-r51-source-first-20261015.md)。真实 Mac Chrome 安装与原生停止/重启：`NOT_TESTED`。

## R5.2 · 兑换持久事务恢复（生产 Provider 仍阻塞）

正式独立工具版本由 `1.1.1` 升为 `1.2.0`，新增需由用户安装/升级审阅的 `storage.local` 能力；保留 `ai.access`，未新增 `network` 或 `browser.tabs`。通过既有工具专属 `OpenDeskTool.request('storage.get/set')`、CAS ETag 及可信宿主锁，**在兑换 POST 之前写入并读回**最小恢复记录（账号 ID、幂等键、提交时刻、版本/工具 ID）。不保存完整兑换码、Cookie、密码、长期 Token 或代理租约。

发生请求超时、丢失回执、页面关闭、浏览器重启、安装权限变更、账号切换时，未知兑换不重试。重新打开只显示待核对状态，用户点击「核对上次兑换」后，需经同一个经过批准的 HTTPS Provider 的专用终态查询返回相同账号/幂等键的完整已兑换回执，或明确 `rejected + final=true` 的终局拒绝，才安全解除锁定。历史账本缺少对应行并不意味着消费失败。宿主已负责卸载清理本工具命名空间、撤权和旧安装版本隔离；本工具对非本版本恢复记录保持锁定而非继承。

`BUSINESS_ENDPOINTS` 保持四个空值（`member`、`voucherPreview`、`voucherRedeem`、`voucherStatus`）；**此接口形状仅是消费端待审核边界，不代表已批准或部署商业认证服务**。现有 Browser SDK 网络请求默认不附带会员登录 Cookie，因此不得只填写 URL 就启用支付或兑换。只有正式 Provider 身份、无副作用终态查询及授权合同经 Owner 审核后才接入，并办理工具升级所需浏览器权限。商品外链、短效 ticket 安装回跳和真实代理联网仍为各自独立阻塞，不提供假数据。

## 本地联调服务器（仅开发测试，不进入扩展安装包）

本仓库已内置 [本地测试说明与服务器](dev/local-test/README.zh-CN.md)，无需单独下载 ZIP。优先复用现有 7898 服务，勿为新版文档或重复演示重启内存账本。以下仅是 Node.js ≥ 22、服务尚未运行且端口空闲时在**仓库根目录**使用的独立命令，不是本次文档任务执行记录：

```bash
node --test examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.test.mjs
node examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs
```

默认 `127.0.0.1:7898` 提供演示会员 API 与辅助 PAC；本轮公开 SDK 开发路径固定使用用户已有的 **HTTP CONNECT 127.0.0.1:7897**，不支持把 SOCKS5 或 HTTPS 填进这个 profile。安装工具后按本地联调说明操作；辅助 PAC 本身不等于公开 SDK 原生证据。


## R5.8 · 正式工具与 R5.7 主 HTML 原型的 UI 对齐（1.3.1）

本轮仅更新独立 ai-vip-share 工具：正式主视图采用已评审原型的品牌头部、紧凑会员主卡（脱敏账号、会员类型、已核验指标、权益和折叠兑换记录）、兑换卡（显示/清空、Enter 预检、明确确认/取消与未知回执核对）、独立「查看更多商品」入口、常驻单个 AI 网站访问代理按钮及折叠网络说明。只迁移设计和交互，不复制 preview/index.html 的实验台、示例会员、演示码、虚构回执或代理状态机。

src/main.js 保留原有 Browser SDK、可信服务端会员数据、存储 CAS 兑换事务账本和安装 epoch，新增单按钮 STOP 优先与用户在启用期间显式请求 STOP 的续接。商品 SDK 调用直接发生在可信点击内。旧 1.2.0 / 1.3.0 未确认兑换记录在 1.3.1 中继续受保护，不会被版本升级自动解除。

**现实边界：** BUSINESS_ENDPOINTS、PRODUCT_CATALOG_URL 和 APPROVED_PROXY_ENDPOINT 仍没有已审核生产配置。正式工具的默认状态是「服务未配置」，不是原型中的演示已开通；兑换、商品打开和代理启用均 fail-closed，已有代理的 STOP 只由可信 SDK ownership 检查决定。专属链接、商户、Chrome Native/Mac 安装/视觉 95+ 尚未验证，不能将源码对齐当作真实商业闭环。

新增静态与构建回归：

    node --test tests/environment/ai-vip-share-ui-parity.test.mjs
    node --test examples/sidebar-tools/ai-vip-share/preview/test-r41.mjs examples/sidebar-tools/ai-vip-share/preview/test-ui.mjs
    npm run build:sidebar-tool -- examples/sidebar-tools/ai-vip-share

上述构建生成候选包到 artifacts/sidebar-tools/ai-vip-share/1.3.1/，不代表已安装或已更新正式产品。必须在 Mac 上经安装包身份/版本/权限审核、真实已安装 OpenDesk Browser「扩展」Tab 更新、320/360/390px 深浅色对比截图、键盘与 STOP 生命周期复验；通过后再按仓库候选包晋升规则发布。宿主 src/ 业务代码不得为此新增。

## R5.9.1 视觉修复与真实性边界

正式 UI 使用公共主题，调整内容区域与原型接近的 16/17px 内边距，并在 345px 及以下改用 12px 左右边距，修正折叠兑换记录和网络说明的多余 margin。保留 SDK、单代理按钮及正式服务 fail-closed 行为。未确认 1.2.0/1.3.0/1.3.1 兑换事务仍受保护。历史紫色 HTML 原型与公共蓝色主题有色值差异；未取得 1.3.2 真实安装、原生 STOP 或商业 Provider 成功证据。

## R5.9.2 · Chromium 截图驱动的紧凑化迭代（1.3.3）

比对同源正式打包 UI 的真实 Chromium 图片后发现代理「重新检测」单独占用一整行，商品、兑换和代理区的无 Provider 提示存在重复。刷新调整到代理标题右侧的公共图标按钮，保留原 ID、原生用户点击和原公共 SDK 状态回读；短化重复提示而保留正确禁用、STOP、持久事务保护与折叠网络说明。原型紫色与正式公共蓝色设计系统的色值仍需产品 Owner 决议；真实已安装 1.3.3、商业服务、原生代理和 Mac 本地均不可用这些模拟图片声称通过。

## R5.9.3 · 键盘预检与重复信息收敛（1.3.4）

沿用 R5.9.2 正式结构及公共 Design Tokens：预检成功后聚焦「确认兑换」，可信 Escape 与取消按钮共用不提交的取消路径，并恢复兑换输入框焦点；收敛「兑换记录」重复标题及会员未配置时的技术重复文案，优化折叠说明点击高度。原兑换 journal 仍支持 1.2.0/1.3.0/1.3.1/1.3.2/1.3.3/1.3.4。STOP、SDK 权限和未配置商业服务均保持不变。

**证据分级：** 正式源码、同源包及 VM/打包 Chromium 的通过记录不能证明 1.3.4 已在 Mac 日常 Chrome 真实 Side Panel 安装。缺少实际安装、沙箱截图、宿主存储回读之前记录 `INSTALLED_NOT_TESTED`；商业 Provider 与可信代理仍 `PROVIDER_BLOCKED` / `REAL_PROXY_BLOCKED`，不可复用 1.3.1 证据冒充本版本。

## R1 业务源码清理（2026-10-19）

原 R1 `ai-smart-access` 六个可信模块已统一归属本工具 `trusted/`；主扩展 Service Worker / Side Panel 可信入口仍会静态编译这些受限旧协议适配器，不通过安装包授予网页沙箱 Chrome 代理权限。当前正式工具优先使用既有公共 `browser.proxy.managed` SDK。旧数据身份、停用与卸载清理仍须保留；业务 JS 不能只靠更新可安装 JSON 热替换。未经真正测试的旧与新代理链隔离不标记 PASS。


## R2 · 正式 React + Shared UI（网页阶段候选，待同 SHA 验证）

AI VIP Share 从历史 HTML 模板切换为 `src/App.jsx` 单一业务 React Root（`src/main.jsx`），继续在原 opaque Sandbox 中运行。Button/IconButton/Card/CardContent 为公开 `@opendesk/ui`，由已有 Host 提供，不导入 Cookie Editor 的 Controller，也不把应用逻辑提升至可信宿主。正式 JS/CSS 由项目 `vite.config.mjs` IIFE 构建，`dist/build-ready.json` 对源码和编译产物签收。安装身份、capabilities 与公共 SDK 保持原样。

**迁移阶段限制：** `src/main.js` 中已验证的兑换事务/Cookie journal/服务器分配/STOP 流程暂作为 React DOM 兼容控制器，在 React commit 后挂载，防止未经回归的业务算法重写。后续以单独最小差量提取数据状态与订阅，再移除 DOM 耦合；本阶段不能声称业务表现已完全解耦。所有 Cookie 值保持在独立业务闭包，不进入 React props/state；React 只持有固定布局和元素 ID。卸载 React Root 会停止激活页轮询，旧实例异步副作用仍由现有 revision/Host 撤权栅栏约束。

开发与同源预览见 [`preview/README.zh-CN.md`](preview/README.zh-CN.md)。生产商业 Provider/批准 Cookie 目标/付费权益尚未配置，正式产品始终 fail closed。2026-10-27 网页阶段待真实 CI 验证期间，不以 `1.4.2` 源码宣称旧 `1.4.1` 正式 JSON 已更新，也不将 Fixture 演示当 Chrome 原生通过。


## R2.1 · 正式产品 / 交互预览 / 开发调试分界

正式业务 React `src/App.jsx` 只提供「AI 会员 → 兑换激活 → 共享会话 / Cookie 交付（条件展示）→ AI 网站访问」。它不重复 Side Panel 可信应用标题，不放置“功能与接入状态”、本地开发入口、功能清单、Fixture 或工程步骤。

`preview/index.html` 是独立的同源产品预览外壳，默认只有一行演示标题和折叠的场景设置；其内仍由正式 `App.jsx` 与原业务 Controller 提供可操作组件。预览 SDK Fixture 仅保存在 `preview/`，不会进入正式安装 JSON。历史 `1.4.1` 正式包在未满足候选晋升条件前继续保留。

原 Controller 的本地开发选择、兑换恢复键、Cookie journal、代理 STOP 逻辑仍保持不变；相关旧测试由测试工具自行建立隐藏的开发面板节点，绝不将这些节点重新加进用户 React 页面。生产 Provider、Cookie 目标及代理入口未批准时仍 fail closed。开发轮次不能冒充真实 Chrome 的 A/B 切换、Cookie 写入或代理验证。
