# AI VIP Share · 独立 Sidebar Tool

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
