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

`127.0.0.1:7897` 是用户自行提供的上游 HTTP CONNECT/SOCKS5 代理；`127.0.0.1:7898` 仅模拟 API 并生成 PAC。**现有 OpenDesk 可信代理启停按钮不会自动连接此 HTTP 测试服务。**

R5.3 开发联调例外：父任务的编译期开发 adapter 固定访问 `http://127.0.0.1:7898/api/{activate,verify}`，并发送 `X-OpenDesk-Local-Test: 1`。仅激活码 `LOCAL-DEV-ONLY` 返回 `{scheme:'http',host:'127.0.0.1',port:7897}`；该端点不受 `LOCAL_PROXY_PORT` / `LOCAL_PROXY_KIND` 或请求 body 内 endpoint 改写。`DEMO-VIP-01` 继续返回保留域名的合同示例。adapter 的真实 Chrome、STOP 和生命周期证据由父任务提供，Node fixture 通过不能替代。

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

正式工具的四个 `BUSINESS_ENDPOINTS` 仍为空且要求已审核 HTTPS；上面的激活 adapter 不会连接 member UI。后续浏览器 member 联调应由 Host owner 在隔离 development 候选中，通过既有 `businessSdk.request` 与工具安装存储绑定固定四条 fixture 路径，同时提供仅测试产物的配置；不要改正式 `src/main.js`、增加 fetch 通道或另建转发服务。本轮仅验证 HTTP fixture，未实施该浏览器绑定。

## 五、测试脚本及限制

```sh
node --test examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.test.mjs
```

目前覆盖：严格域名 PAC、非法相似域名、未绑定/已绑定/过期权益、无副作用预检、服务端时钟与预检过期边界、同 key 幂等与 consumed preview 拒绝、模拟 504 后只查询回执、pending/final rejected 不授予、账户切换隔离、两类激活码与固定开发端点、有界一次性 verify 延迟、Origin/请求头访问限制。`X-Fixture-Drop-Ack` 是提交后返回模拟 504，不是真实断网。

**尚未打通的正式扩展限制：** `src/ai-smart-access/provider-config.js` 的 `activateUrl/verifyUrl` 均为空并要求固定 **HTTPS** origin；`src/ai-smart-access/policy.js` 明确拒绝 `localhost` / IP 代理端点且只接受 `https` 或 `socks5`；商业工具 `main.js` 四个 BUSINESS_ENDPOINTS 也为空且必须为经审核的 HTTPS；`host-controls.js` 目前没有用户激活码入口。不能直接填写 `http://127.0.0.1:7898`，或把 HTTP 7897 伪报为 HTTPS。要做 **OpenDesk 真实按钮端到端联调**，需要一个经安全审查、development-only、仅 loopback 且隔离 Chrome Profile 的测试 adapter；正式主包、公共代理协议与正常安全校验不能因此放宽。

## 六、实施优先级

1. **P0** 直接验证本地 7897 HTTP CONNECT/SOCKS5，以及当前临时 PAC 浏览器路由；此步骤可以立即进行。
2. **P1** 用 7898 模拟会员接口、激活回执、幂等消费、掉线后核对；它验证的是模拟服务合同，不是正式认证系统。
3. **P2** 由 OpenDesk Proxy/SDK Owner 审核隔离 test adapter（localhost 白名单仅 127.0.0.1、测试包显式 opt-in、无 production fallback、可观测开/关回执、会话与 Host 权限不降级）。补全用户可操作的激活入口或测试预签发租约路径，不能绕过身份/授权；避免建立第二套生产代理引擎。
4. **P3** 在 Mac Chrome/CFT 隔离 Profile，用真实安装身份和可信按钮完成 ENABLE、网络出口检查、STOP、冲突、Worker 重启、撤销、安装升级与卸载验收；同包输入一致方可认定 NATIVE PASS。
