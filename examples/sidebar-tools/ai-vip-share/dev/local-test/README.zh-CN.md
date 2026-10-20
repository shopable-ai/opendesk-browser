# 在仓库中直接运行 AI VIP Share 本地联调

本目录已正式纳入 `examples/sidebar-tools/ai-vip-share/dev/local-test/`。**无需再下载或解压 ZIP**。
它是独立开发测试工具，不属于 Sidebar Tool 安装包，也不会连接尚未审核的商业 Provider。

在仓库根目录执行（Node.js ≥ 22）：

```bash
node --test examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.test.mjs
node examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs
```

另一个终端执行：

```bash
curl -sS http://127.0.0.1:7898/health
curl -sS http://127.0.0.1:7898/proxy.pac
```

## 当前公开 SDK 开发入口（1.3.7）

使用现有 `npm run dev` watcher 的 `dist/development`，保留扩展 ID 和 Native 配对。7897 必须已经是可用的 **HTTP CONNECT** 代理；7898 是下面的本地 fixture，不提供代理功能。若浏览器请求包含扩展 Origin，启动时绑定实际 ID：

```sh
VIP_TEST_EXTENSION_ORIGIN=chrome-extension://<实际扩展ID> node examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs
```

1. 从「扩展」安装/更新并打开 `ai-vip-share` 1.3.7，核对「本地开发」提示。该入口仅对源码锁定的候选包和 development Host 可用。
2. 点击「连接本地开发」，按可信宿主实际提示审阅网站/网络权限；会员状态应为「尚未开通」。
3. 输入演示码 `DEMO-VIP-01`，点击「预检兑换」或按 Enter，再点击「确认兑换」。界面显示「权益有效」、20 次演示额度和「本地开发代理」后，才出现可用的启用按钮。
4. 点击「启用代理」并完成可信宿主的代理确认。固定 profile 是 `http://127.0.0.1:7897`；PAC 使用 `PROXY`，不冒充 HTTPS 代理。
5. 正常访问目标网页/API，再返回并重开工具，点击「停用代理」。确认「已停止」后重开，会员仍可查询且代理保持释放，不自动再次启用。

Cookie 框架联调使用本 fixture 的 `http://127.0.0.1:7898/session/`，初始显示「未建立受控会话」。先激活该标签页，在工具可信设置中授予该站点 Cookie write，并按实际提示审阅 Chrome Cookie/网站权限；再返回工具完成兑换。兑换回执携带短时有效、固定目标的 `cookieDelivery`，只保存在当前工具内存。点击「确认写入网站 Cookie」，审阅可信宿主的精确批次，逐项 verified 后刷新目标页面，应显示「受控会话有效」。代理启停和重开工具不删除 Cookie，也不再次写入。离开工具后若交付副本已丢失，不能靠重开自动重放旧操作。

原生驱动可用 `OPENDESK_PROXY_DEV_CORE=1 OPENDESK_PROXY_DEV_COOKIE=1` 选择此流程。它在本次隔离 CfT 内把逻辑 `127.0.0.1:7898` 映射至自有 IPv6 `::1:7898` fixture，绑定实际扩展 ID，结束只关闭该 listener；现有 IPv4 fixture 账本和 Clash 7897 保留。Cookie 模式不保存截图、NetLog 或原始 Cookie 值。显式静态快照测试另加 `OPENDESK_PROXY_C1_STATIC=1` 与绝对 `OPENDESK_PROXY_C1_EXTENSION_PATH`，通过构建回执核对身份，不能当作日常 watcher 连接或 production 验收。

会员的四条 API 通过现有公开 `browser.network.request` 携带 `X-OpenDesk-Local-Test: 1`；代理通过 `browser.proxy.managed`。不在沙箱直接 fetch，不注入会员/安装/代理状态。API 路由覆盖 openai.com、anthropic.com、generativelanguage.googleapis.com 及对应网站域名；其余站点 DIRECT。API 的 401/403/405 表示实际连通后的凭据或方法限制，不证明付费调用成功。

生产商业端点仍为空。production 不会提供本地 profile；保存的本地选择不能将其启用。未知兑换回执只核对 status，不自动再次消费。fixture 使用单进程内存账本，停止服务后清空；不要在真实开发操作中随意重启。

以下保留辅助 PAC 和旧租约 fixture 的独立调试说明，**不作为当前工具接入方案**。旧 adapter 不参与当前公开 SDK 主流程。证据与正式延期项见[唯一工作记录](../../../../../docs/framework/workstreams/ai-vip-share-r54-managed-proxy-sdk-closure-20261015.md)。

---

# AI VIP Share 本地联调辅助包（非正式 Provider / 非代理程序）

本包在 **127.0.0.1:7898** 启动 Node.js 测试服务器，同时生成一份指向 **127.0.0.1:7897** 的 PAC。它**不提供** 7897 的代理功能：需你自行运行可信、已授权的 HTTP 或 SOCKS5 代理。无需 npm 安装，Node.js >=22。

> 范围：测试环境、单进程内存账本、演示身份与测试券码。绝不放入 production dist，不对外网监听，不承载真实支付/会员、不收集第三方网站 Cookie。关闭进程会重置模拟账本。HTTP localhost 服务不符合当前 OpenDesk 正式 Provider 的 HTTPS 同源/端口安全校验，PAC 单独启动也不等于正式扩展的可信 Host/Worker 链路通过。

## 一、先测试 7897 上游代理是否真实可用

如果 7897 是 **HTTP 代理**（例如支持 HTTP CONNECT）：

```sh
curl -v --noproxy '' --proxy http://127.0.0.1:7897 -I --connect-timeout 3 --max-time 15 https://chatgpt.com/
```

如果是 **SOCKS5 代理**：

```sh
curl -v --noproxy '' --proxy socks5h://127.0.0.1:7897 -I --connect-timeout 3 --max-time 15 https://chatgpt.com/
```

只监听 7897 的 HTTP 业务 API 或健康检查接口**不是代理**，无法通过上述 HTTPS CONNECT 测试。观察 `curl -v` 是否建立代理隧道及 TLS 握手；目标站返回 403/挑战页不必然表示代理未成功，但单纯 HTTP 200 同样不能证明 Chrome PAC 真正接入。

## 二、启动测试服务器（默认占用 7898，不占用 7897）

```sh
node examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs
curl -sS http://127.0.0.1:7898/health
curl -sS http://127.0.0.1:7898/proxy.pac
```

如果 7897 是 SOCKS5：

```sh
LOCAL_PROXY_KIND=socks5 node examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs
```

如需自定义端口，可设置 `VIP_TEST_PORT`（默认 7898）、`LOCAL_PROXY_PORT`（默认 7897）、`LOCAL_PROXY_KIND`（http 或 socks5）。服务器只监听 `127.0.0.1`。`proxy.pac` 仅在五类正式 AI 网站域名及子域名使用代理，其余 DIRECT；不会修改 Chrome 系统代理设置。

## 三、单独验证 Chrome PAC（隔离浏览器，不改日常 Chrome）

Mac 上可以创建全新的临时 Chrome Profile，独立检查 PAC 能否把 AI 域名导向 7897：

```sh
PROFILE=$(mktemp -d /tmp/opendesk-proxy-test-XXXXXX)
open -na 'Google Chrome' --args --user-data-dir="$PROFILE" --no-first-run --proxy-pac-url='http://127.0.0.1:7898/proxy.pac'
```

请在此临时 Chrome 中打开 `https://chatgpt.com/`，同时查看你的本地 7897 代理日志；再打开一个不在白名单中的站点，确认未由 PAC 定向给 7897。关闭临时浏览器后可以删除这一**仅由本命令创建**的空白测试 Profile，不触碰 `dist/development`、日常 Chrome 或其他扩展的代理设置。

**重要**：此实验只验证本地代理和 PAC 浏览器路径，不经过 OpenDesk 扩展 `aiAccess.enable` 或 `chrome.proxy.settings.set`；不能算正式按钮、租约、STOP、所有权、卸载或 Worker 重启验收。

## 四、模拟会员 Provider 的 HTTP 数据

所有业务测试请求使用 `X-OpenDesk-Local-Test: 1` 请求头；禁止跨网站 Origin。测试券码 **DEMO-VIP-01**，账号为 `local-fixture-account`。

```sh
curl -sS -H 'X-OpenDesk-Local-Test: 1' http://127.0.0.1:7898/api/member
curl -sS -X POST http://127.0.0.1:7898/api/preview -H 'X-OpenDesk-Local-Test: 1' -H 'Content-Type: application/json' --data '{"code":"DEMO-VIP-01"}'
```

`/api/preview` 会返回一个 **120 秒内有效**的 `previewId`；你必须用其真实返回值及随机 `idempotencyKey` 调用 `/api/redeem`。请求体：

```json
{
  "previewId": "（/api/preview 返回的值）",
  "accountId": "local-fixture-account",
  "idempotencyKey": "（生成一个新的 UUID）"
}
```

 `/api/redeem` 只在一次有效预览下给出 `redeemed` 结果，重复同一 `idempotencyKey` 返回同一回执，改变同一键所绑定的 `previewId` 则返回 `409`。可以附加请求头 `X-Fixture-Drop-Ack: 1` 模拟“已消费但响应丢失”，接着只使用 `/api/status` 查询，不重试兑换 POST。未找到事务返回 `unknown`，不是“未兑换”的权威证明。还可在第一次 `/api/redeem` 提交时用 `X-Fixture-Outcome: pending` 模拟处理中、用 `X-Fixture-Outcome: final-rejected` 模拟服务端明确 `rejected + final:true`；两者都不会授予权益。

技术租约 mock：`POST /api/activate` 输入 `{"deviceId":"local-device","code":"DEMO-VIP-01"}` 返回 `{leaseId,expiresAt,endpoint}`；`POST /api/verify` 输入 `{"deviceId":"local-device","leaseId":"..."}` 返回 `{active:true,lease}`。`endpoint` 使用保留测试域名 `proxy.fixture.test` 及 `socks5`，**仅验证生产消息形状，无法连接你的 127.0.0.1:7897**，不要当成真正代理节点。代理实际联通请使用前述 PAC。

### R5.3 开发租约的 STOP race 控制

复用同一个 7898 服务；无需另起 server/proxy。现有服务若在修改前启动，由其负责人重启后再使用新行为。所有控制仍要求测试请求头，拒绝任何 `Origin`（包括 localhost 和 `null`），没有 CORS 放行。SW 请求使用 `credentials: omit`，不发送 Origin。

```sh
curl -sS -X POST http://127.0.0.1:7898/api/fixture/verify-delay \
  -H 'X-OpenDesk-Local-Test: 1' -H 'Content-Type: application/json' \
  --data '{"delayMs":3000}'
curl -sS -H 'X-OpenDesk-Local-Test: 1' http://127.0.0.1:7898/api/fixture/verify-delay
```

POST 只接受整数 `delayMs`（0–5000ms）；0 清除待用延迟，其他字段拒绝。它在下一次有效 `LOCAL-DEV-ONLY` 租约 verify 开始时消费，DEMO 租约不受影响。GET 返回 `{nextVerifyDelayMs,verificationsInFlight}`，后者统计当前被延迟的响应。父任务可先确认进行中，再通过真实可信按钮 STOP，核对晚回执没有重开代理。也可在单个开发 verify 请求加 `X-Fixture-Verify-Delay-Ms: 3000`，同样有界；它覆盖并消费待用延迟。进程内 API 为 `setNextVerifyDelay(ms)` / `getVerificationState()`。这些控制仅延迟模拟验证响应，不模拟可信 STOP，也不证明 native race 已通过。

### member 回归注入与浏览器接入边界

`createLocalFixture({now, getMemberState})` 可注入服务端时钟及 `{account,entitlements}` 快照；默认仍为原 bound 演示账号和真实服务端时间。未绑定账号使用正式 member schema 的 `{state:'guest'}`。测试切换账号时，preview/redeem/status 及账本历史按当前账号隔离；时钟控制不修改设备或 production。测试只创建一个 loopback 随机端口实例，不占用父任务 7898。

生产的四个 `BUSINESS_ENDPOINTS` 仍为空且要求已审核 HTTPS。当前开发接入已经按上方入口通过公开 SDK 完成，固定四条 loopback 路径；旧激活 adapter 与独立 PAC 只保留测试用途。

## 五、测试脚本及限制

```sh
node --test examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.test.mjs
```

目前覆盖：严格域名 PAC、非法相似域名、未绑定/已绑定/过期权益、无副作用预检、服务端时钟与预检过期边界、同 key 幂等与 consumed preview 拒绝、模拟 504 后只查询回执、pending/final rejected 不授予、账户切换隔离、两类激活码与固定开发端点、有界一次性 verify 延迟、Origin/请求头访问限制。`X-Fixture-Drop-Ack` 是提交后返回模拟 504，不是真实断网。

**历史实现限制（不适用于文首 1.3.6 开发入口）：** `src/ai-smart-access/provider-config.js` 的 `activateUrl/verifyUrl` 均为空并要求固定 **HTTPS** origin；`src/ai-smart-access/policy.js` 明确拒绝 `localhost` / IP 代理端点且只接受 `https` 或 `socks5`；商业工具 `main.js` 四个 BUSINESS_ENDPOINTS 也为空且必须为经审核的 HTTPS；`host-controls.js` 目前没有用户激活码入口。不能直接填写 `http://127.0.0.1:7898`，或把 HTTP 7897 伪报为 HTTPS。要做 **OpenDesk 真实按钮端到端联调**，需要一个经安全审查、development-only、仅 loopback 且隔离 Chrome Profile 的测试 adapter；正式主包、公共代理协议与正常安全校验不能因此放宽。

## 六、历史实施优先级（当前以文首公开 SDK 入口为准）

1. **P0** 直接验证本地 7897 HTTP CONNECT/SOCKS5，以及当前临时 PAC 浏览器路由；此步骤可以立即进行。
2. **P1** 用 7898 模拟会员接口、激活回执、幂等消费、掉线后核对；它验证的是模拟服务合同，不是正式认证系统。
3. **P2** 由 OpenDesk Proxy/SDK Owner 审核隔离 test adapter（localhost 白名单仅 127.0.0.1、测试包显式 opt-in、无 production fallback、可观测开/关回执、会话与 Host 权限不降级）。补全用户可操作的激活入口或测试预签发租约路径，不能绕过身份/授权；避免建立第二套生产代理引擎。
4. **P3** 在 Mac Chrome/CFT 隔离 Profile，用真实安装身份和可信按钮完成 ENABLE、网络出口检查、STOP、冲突、Worker 重启、撤销、安装升级与卸载验收；同包输入一致方可认定 NATIVE PASS。


## Managed Proxy SDK R1：7897 三层验证（2026-10-15）

在**用户自己创建的隔离 Chrome Profile** 测试，不能复用常用浏览器 Profile。此目录只提供本地联调材料，不参与正式工具构建、运营会员或真实授权。

**A. 原始 7897 线路（与 Browser SDK 无关）：**

```bash
# 先自行启动真实的 127.0.0.1:7897 SOCKS5 或 HTTP CONNECT 服务
node examples/sidebar-tools/ai-vip-share/dev/local-test/proxy-line-probe.mjs --socks5 --target=example.com
# 如果本机 7897 是 HTTP CONNECT：
node examples/sidebar-tools/ai-vip-share/dev/local-test/proxy-line-probe.mjs --http --target=example.com
```

此脚本要求先完成真实代理握手，再执行 HTTPS TLS 证书校验。失败即返回非零退出码。不记录代理凭据；默认只向公共测试站点 `example.com:443` 连接。A 通过**不等于** Chrome/PAC/已安装工具通过。

**B. 隔离 Chrome + 7898 PAC：**

```bash
LOCAL_PROXY_KIND=socks5 LOCAL_PROXY_PORT=7897 node examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs
PROFILE="$(mktemp -d "${TMPDIR:-/tmp}/opendesk-proxy-chrome.XXXXXX")"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PROFILE" --no-first-run --disable-extensions \
  --proxy-pac-url=http://127.0.0.1:7898/proxy.pac \
  --log-net-log="$PROFILE/netlog.json" \
  https://chatgpt.com
```

请核对 7897 真实代理日志、Chrome NetLog 以及非目标站点直连结果。7898 本地 PAC 测试只证明 **B**，并没有经过公共 SDK，也没有使用正式 AI VIP Share 工具。HTTP CONNECT PAC 指令为 `PROXY 127.0.0.1:7897`，SOCKS5 为 `SOCKS5 127.0.0.1:7897`，都不是生产允许的 HTTPS 端点。

**C. 正式 SDK + 安装工具：** 用另一个隔离 Profile 安装实际 `main` 构建的 OpenDesk Browser、安装 `ai-vip-share` v1.3.0、从工具内按下启用，经可信 Side Panel 单次确认；核验安装 ID / 包 Hash / Epoch、Proxy 状态、7897 日志及 STOP / 重启 / 卸载恢复。**当前正式 Provider 未配置，工具必须保持「无法启用」，不能用 A/B 成功冒充 C 成功。** 要真正完成 C，需通过安全审查的仅 development loopback 适配器及真实会员测试验证，生产规则绝不能放开 127.0.0.1、HTTP、原始 PAC 或伪造的权益。

所有测试结果分别记录 `A / B / C` 和 `NODE / CHROME_NATIVE`；未取得 Chrome 实际日志时记 `NOT_TESTED`。
