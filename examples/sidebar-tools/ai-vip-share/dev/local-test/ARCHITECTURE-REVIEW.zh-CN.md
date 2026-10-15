# AI VIP Share 代理架构与本地联调专家审阅 · 2026-10-15

## 核心判断

**现行代理是浏览器范围的 Chrome `proxy.settings` PAC，而非独立工具内 HTTP tunnel、操作系统 VPN 或每个 Tab 的私有代理。** `src/ai-smart-access/policy.js` 使用固定五组 AI 网站域名与 `pac_script.mandatory=true`，匹配目标返回 `HTTPS host:port` 或 `SOCKS5 host:port`，其余 `DIRECT`。现有公共 Managed Proxy SDK 尚未批准，因此这是过渡 Host/Worker，不宜成为第二套长期 SDK。

**当前生产用户并不能直接操作 127.0.0.1:7897：** `src/ai-smart-access/provider-config.js` 的 `activateUrl/verifyUrl` 都是 `null`；`service.js` 的 Provider 配置只支持相同来源的固定 HTTPS、无非常规端口；`policy.js` 的端点校验禁止 localhost/IP 和 HTTP 代理 scheme；可信 UI `host-controls.js` 只有代理启停，没有与必须的 `aiAccess.activate({code})` 对应的可用激活输入/用户流程。即使本地 7897 已运行，这些检查也会安全阻止启用。切勿通过 production 设置一个 debug URL 伪装线上服务。

## 分层与归属

| 层 | 正式来源 | 本地联调 | 保护要求 |
| --- | --- | --- | --- |
| 会员账号/SKU/权益/兑换 | `examples/sidebar-tools/ai-vip-share/src/main.js` | `127.0.0.1:7898/api/{member,preview,redeem,status}` 的 JSON mock | 不写商业逻辑到 Host；使用 `serverNow`、账号绑定、幂等回执、unknown-effect 恢复；正式 HTTPS/auth 合同未完成 |
| 激活/租约 | `src/ai-smart-access/service.js` 过渡实现 | `127.0.0.1:7898/api/{activate,verify}` 的**格式示例** | `leaseId` 非长期凭据；失效、所有权、安装身份与 STOP 独立；mock endpoint 不等于真实 7897 |
| 可信控制 | `src/ai-smart-access/host-controls.js`、`tool-host.js` | 可独立验证可信点击与工具身份 | 不能从 sandbox/URL 直接申请 global proxy；仍缺完整激活入口/SDK contract |
| PAC/Chrome | `policy.js`、`lifecycle.js`、`service.js` | `GET 127.0.0.1:7898/proxy.pac` 供独立 Chrome 测路 | 正式 host ownership、持久 STOP、Web Lock、回执再核对与 Worker 恢复不得退化 |
| 真正转发网络流量 | 用户合法使用的 HTTP CONNECT / SOCKS5 / 生产 HTTPS proxy | **用户自己提供 `127.0.0.1:7897`** | 只允许 loopback 测试，不能启动开放的通用中继；不要在测试包里造第二套生产代理网络服务 |

## 已知危险边界 / 必验内容

1. PAC 指令 `HTTPS proxy:port` 要求 **代理连接本身有 TLS**；对普通 HTTP CONNECT 代理，应使用 `PROXY 127.0.0.1:7897`；SOCKS5 用 `SOCKS5 127.0.0.1:7897`。不得根据目标网站是 `https://` 就把上游误配为 HTTPS 代理。
2. `chrome.proxy` 对当前 Chrome 实例的代理设置有全局影响，PAC 只是按域名路由。STOP 只能释放证明属于当前安装的配置，不能写入 `DIRECT` 以清理其他扩展的设置。
3. 仅返回 JSON `{endpoint:{...}}` 的 7898 mock 不是代理。真实 7897 必须能处理协议层请求：HTTP CONNECT 隧道或 SOCKS5 握手。Chrome 必须在独立 Profile 测试，并用本地 proxy 日志与浏览器 netlog 交叉证明。
4. 当前 R2.1 代理生命周期/Web Lock 在仓库综合测试中有 18 项历史失败；不能以会员兑换 23/23 PASS、PAC 生成代码存在或临时 Chrome 的访问成功代替其通过。
5. 真实 AI 网站可能依赖未纳入五组 PAC 域名的认证、静态资源或其他网络域名。须在真实 Chrome 中复核请求链、DNS、WebSocket、HTTP CONNECT、错误行为，并通过权限评审后才能扩充静态域名集，不能让 Provider 任意下发远程 PAC。
6. 安装升级/撤权/账户切换不自动恢复代理，也不得在联网失败时悄悄降为目标站 DIRECT。服务端必须审查账号权限与代理租约，不能把会员状态=代理开关。

## 建议实施任务树（不是已完成的产品验收）

- **P0：无需改正式产品，即刻可验**：验证 7897 端口类型、curl CONNECT/SOCKS5、7898 mock 合同与临时 Chrome PAC。预计输入：已有 `node`、本地 7897、可运行 Chrome；必须记录代理日志/目标域名/关闭窗口回执。
- **P1：本地 test adapter 审核**：由 Managed Proxy/SDK Owner 在 development-only/isolated build 中显式启用 localhost 测试能力，单独支持 HTTP `PROXY` 以及 SOCKS5 local endpoint；仅固定 `127.0.0.1`、批准端口、安装 hash/epoch 与受信 UI，不允许通过网页、URL query 或用户脚本开启。正式验证器和正式 `main` 发布包绝不能接收 localhost/HTTP。
- **P2：补正式激活体验**：确定会员 Provider 是否通过已批准账号身份生成租约，或采用单独一次性激活票据；不能重复开发认证框架。唯一受信按钮先触发经批准的激活→确认租约→明确启用，STOP 可以不依赖 Provider 在线状态。消费端仍与 Proxy SDK 分离。
- **P3：端到端防回归**：单服务启停、两工具竞争/被其他扩展控制、STOP 抢先、ENABLE 晚回执、Worker 重启、租约过期、Service 离线、浏览器退出重开、失去 proxy 权限、旧安装卸载、无直接回落和代理日志消失，结合 AdBlock 固定源码门禁解除后同候选 Browser/Native 验收。

## 本地 mock API 的确切数据职责

| 操作 | 请求 | 成功/重要响应 |
| --- | --- | --- |
| GET `/api/member` | 无 body | `{schemaVersion:1,serverNow,account:{state:'bound',id,displayNameMasked},entitlements,redemptions}` |
| POST `/api/preview` | `{code}` | `{previewId,accountId,skuTitle,grantSummary,voucherPreviewMasked,expiresAt}`；必须无消费副作用 |
| POST `/api/redeem` | `{previewId,accountId,idempotencyKey}` | `{status:'redeemed',accountId,idempotencyKey,redemptionId,redeemedAt,grantedEntitlements:[...]}`，相同 key 不重复入账；可以模拟响应丢失 |
| POST `/api/status` | `{accountId,idempotencyKey}` | 精确匹配事务，`redeemed` / `pending` / `rejected + final:true` / `unknown`；unknown 不表示未消费 |
| POST `/api/activate` | `{deviceId,code}` | `{leaseId,expiresAt,endpoint:{scheme:'https'\|'socks5',host,port}}`（生产合同形式） |
| POST `/api/verify` | `{deviceId,leaseId}` | `{active:true,lease:{leaseId,expiresAt,endpoint}}`（生产合同形式） |

时间为 epoch **毫秒**。生产 `expiresAt` 租约必须大于当前时间至少 60 秒且不超过 3 天；R5.2.1 前端对预检最多接受 5 分钟时限。生产 Provider 验证账号认证、SKU 和撤权，不接受任何来自浏览器环境、未授权脚本或 URL 参数的不可核验业务状态。这个 mock 的硬编码演示账号与进程内账本**不能**承担生产授权、重启持久账本或多人并发付款。

## 验收结论边界

本包只有本地独立 fixture 与独立 PAC；已经通过它自己的 Node 测试，但 Chrome/7897 的实际测试必须在用户 Mac 上完成，无法在此环境访问 Mac 的 loopback。本包对正式 OpenDesk 安装、真实 Provider、Proxy SDK、R2.1 历史失败和 Native/Chrome 产品评分均 **NOT_TESTED**。不可将静态架构设计或本地 mock 测试自评为 95+ 产品验收。
