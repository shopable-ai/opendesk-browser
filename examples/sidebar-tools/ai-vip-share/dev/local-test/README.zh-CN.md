# 在仓库中直接运行 AI VIP Share 本地联调

本目录已正式纳入 `examples/sidebar-tools/ai-vip-share/dev/local-test/`。**无需再下载或解压 ZIP**。
它是独立开发测试工具，不属于 Sidebar Tool 安装包，也不会连接尚未审核的商业 Provider。

当前工具版本、安装与浏览器证据见[工具 README](../../README.zh-CN.md#current-status)。本目录只定义受控开发协议，不是已恢复的商业后台协议。下述 HTTP 测试通过不代表已安装扩展完成可信 Cookie 写入或网页登录；两个真实产品入口由主线程验证。商业后台、日常 Chrome 与 production 正式验收仍为 `NOT_TESTED`。

**先复用现有 7898 服务，不重启账本。** fixture 使用单进程内存存储，重启会丢失演示权益、预检及幂等/未知事务记录；升级工具或 Host 不要求重启它。先在仓库根目录只读检查：

```bash
curl -sS http://127.0.0.1:7898/health
```

以下启动命令仅供服务尚未运行且端口空闲时使用（Node.js ≥ 22）；它不是每次更新都要执行的步骤，也不是本次文档任务的执行记录：

```bash
node --test examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.test.mjs
node examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs
```

另一个终端执行：

```bash
curl -sS http://127.0.0.1:7898/health
curl -sS http://127.0.0.1:7898/proxy.pac
```

## 服务端分配与两个激活入口（受控开发协议）

小目标是让手动输入激活码与允许 URL 触发汇入同一流程：`/api/preview` → `/api/redeem` → 必要时 `/api/status` 查询回执 → 取得当前分配 → 可信审阅与原 Host 写入完整 Cookie 批次 → 目标页核对身份。权益到账或技术代理启用不代表目标网站登录。客户端不提供账号选择器，也不能指定分配对象。

- `DEMO-VIP-01` 由服务器分配 `shared-a`（公司共享账号 A）；`DEMO-VIP-02` 分配 `shared-b`（公司共享账号 B）。一张码在整个 fixture 账本中只消费一次，不能通过新预检、新 key、其他会员或权益过期再次产生权益或交付。
- 手动入口使用上述演示码。URL 入口为 `http://127.0.0.1:7898/activate?activation_code=DEMO-VIP-01` 或对应的 `DEMO-VIP-02`。`GET /activate` 只返回静态开发说明页，不执行脚本、不兑换、不写 Cookie、不回显参数；响应固定 `Cache-Control: no-store`、`Referrer-Policy: no-referrer` 与禁脚本 CSP。只接受一个有效的 `activation_code`，缺失、空值、非法码、重复参数或多余参数返回 400；其他 path 不构成该入口。已安装工具仍需独立校验准确 origin/path/参数并进入原可信授权链。
- 最新成功兑换决定该会员的唯一当前分配。`GET /api/member` 的 `sharedAccounts` 保留 `schemaVersion/companyId/accounts`，新增 `assignedAccountId/redemptionId`；`accounts` 只含当前分配一项，条目的 `id/label/targetUrl/cookieScope` 不变。过期或撤权后不返回可用分配，不退回历史分配。历史兑换摘要只含脱敏码。
- `POST /api/status` 的共享会话请求严格为 `{operation:'sharedSession',accountId,redemptionId,requestId}`，拒绝 `sharedAccountId` 和其他多余字段。认证会员、当前兑换和服务端分配必须一致。响应为原 `{schemaVersion,accountId,sharedAccountId,requestId,serverNow,cookieDelivery}` 加 `redemptionId`；`sharedAccountId` 仅是服务端结果。
- `requestId` 绑定会员与 `redemptionId`。有效期内重试返回同一交付；更换绑定返回 409，旧分配、撤权与会员过期返回 403，已过写入期限的同一请求返回 `409 E_DELIVERY_EXPIRED`，绝不自动刷新该交付。当前分配有权限时可用新 requestId 请求一份新交付，不重新消费码。
- 每份交付包含相同的两个固定 HttpOnly Cookie 槽位：`opendesk_fixture_session` 与 `opendesk_fixture_context`，路径均为 `/session/`。新分配完整覆盖这两项，不清空无关站点数据；写入期限 120 秒，Cookie 生命周期 1 小时。`/session/` 检查两项来自同一交付、属于当前分配、Cookie 未过期且权益未撤销，才显示明确的 A/B 身份。新的分配立即使旧分配所有交付失效，包括晚到旧响应；写入期限不缩短已成功安装 Cookie 的生命周期。
- `/api/redeem` 同 key 返回原回执，`/api/status` 原兑换查询保持不变。已消费码重新预检返回 `409 E_CODE_CONSUMED`；消费前并行生成的其他 preview 也不能再兑换。`pending` 预留该码（`409 E_CODE_PENDING`），未知结果只能查询原事务；明确 `rejected + final:true` 不授予权益。查询历史回执不重新授予旧分配的写入权限。

可通过 `isSharedAccessAllowed({accountId,sharedAccountId,redemptionId,serverNow})` 注入撤权。Cookie 只在进程内；页面与启动日志均不输出 Cookie 值或激活码。多个浏览器可分别持有同一分配的完整 Cookie 对；这不代表单个 Cookie store 可并发隔离多个账号。`/api/activate` 及 `/api/verify` 仍为独立技术代理协议，不消费这些兑换记录，也不授予网站会话。

**保留已有服务与账本。** 新源码不会热更新已运行的 Node fixture。旧 7898 服务缺少新协议时，由主线程原生驱动在 `[::1]:7898` 创建自有 fixture，并只将该隔离浏览器的 127.0.0.1:7898 映射至 IPv6，不停止 IPv4 服务、不清空其账本。本轮不启动常驻服务；原生入口以主线程最新驱动为准，验证手动码与 URL 激活及服务器分配，旧选择器测试不再适用。Cookie 值和激活码不进截图、NetLog 或日志。日常扩展仍固定 `dist/development`，复用现有 watcher。

以下 1.3.8 章节是上轮操作记录；它不能证明新共享账号合同或当前包原生通过。

## 历史公开 SDK 开发入口（1.3.8，需匹配对应 Host）

既有可信开发 pin 已在源码同步并完成对应 Node 检查；**实际 Host 必须以 development MODE 编译，并批准 1.3.8 精确包 hash。** profile 按编译 MODE 与包 hash 判断，合法静态 development 快照也可测试；不要求 watcher 已连接。旧 Host 不随 JSON 导入更新；production、旧 pin 或包来源不匹配时不会返回开发 profile，界面应说明演示不可用，不能靠重复导入或手改 pin 解决。匹配新版开发 Host 后可点击「重新检测代理状态」。

日常源码迭代仍遵守 `dist/development` 与 `npm run dev` watcher 政策，保留原扩展 ID 和 Native 配对，不以静态快照替换日常扩展。该历史记录当时观察到 43119/43120 均无监听，旧 `development.lock` 已不存在；不能据此判断本轮服务状态。日常 Chrome 实际加载路径、真实扩展 ID 与已安装工具包在该记录中均未验证，与 SDK 是否批准 profile 分开判断。

7897 必须已经是可用的 **HTTP CONNECT** 代理；7898 是下面的本地 fixture，不提供代理功能。仅在确需首次启动服务、且浏览器请求包含扩展 Origin 时绑定实际 ID；不要据此重启现有服务：

```sh
VIP_TEST_EXTENSION_ORIGIN=chrome-extension://<实际扩展ID> node examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs
```

1. 从「扩展」安装/更新并打开已晋升、同源的 `ai-vip-share` **1.3.8**，匹配新版 development Host。先看始终可见的「功能与接入状态」，展开六类入口说明，核对本地演示可用性；没有入口时先处理 Host/来源匹配，不盲目导入。
2. SDK profile 可用后才显示「连接本地开发」及 `DEMO-VIP-01` 步骤。点击连接，按可信宿主实际提示审阅网站/网络权限，观察「本地开发」和真实 fixture 账号；新账本应为「尚未开通」，现有账本以查询结果为准。
3. 未消费过的演示码 `DEMO-VIP-01` →「预检兑换」（或 Enter）→ 核对账号与权益 →「确认兑换」。真实回执后应显示「权益有效」、20 次演示额度和开发代理功能，才可启用代理。已有兑换记录时只核对结果，不重启账本；结果未知只用「核对上次兑换」，不再次提交消费。此码不同于离线预览的 `DEMO-ACCESS-2026`。
4. 点击「启用代理」并完成可信宿主的代理确认。固定 profile 是 `http://127.0.0.1:7897`；PAC 使用 `PROXY`，不冒充 HTTPS 代理。
5. 正常访问目标网页/API，再返回并重开工具，点击「停用代理」。确认「已停止」后重开，会员仍可查询且代理保持释放，不自动再次启用。

Cookie 框架联调使用本 fixture 的 `http://127.0.0.1:7898/session/`，初始显示「未建立受控会话」。先激活该标签页，在工具可信设置中授予该站点 Cookie write，并按实际提示审阅 Chrome Cookie/网站权限；再返回工具完成兑换。兑换回执携带短时有效、固定目标的 `cookieDelivery`，只保存在当前工具内存。点击「确认写入网站 Cookie」，审阅可信宿主的精确批次，逐项 verified 后刷新目标页面，应显示「受控会话有效」。代理启停和重开工具不删除 Cookie，也不再次写入。离开工具后若交付副本已丢失，不能靠重开自动重放旧操作。

原生驱动可用 `OPENDESK_PROXY_DEV_CORE=1 OPENDESK_PROXY_DEV_COOKIE=1` 选择此流程。它在本次隔离 CfT 内把逻辑 `127.0.0.1:7898` 映射至自有 IPv6 `::1:7898` fixture，绑定实际扩展 ID，结束只关闭该 listener；现有 IPv4 fixture 账本和 Clash 7897 保留。Cookie 模式不保存截图、NetLog 或原始 Cookie 值。显式静态快照测试另加 `OPENDESK_PROXY_C1_STATIC=1` 与绝对 `OPENDESK_PROXY_C1_EXTENSION_PATH`，通过构建回执核对身份，不能当作日常 watcher 连接或 production 验收。

**上段是既有驱动说明，不是 1.3.8 已执行记录。** 1.3.7 旧原生结果仍有效，仅绑定 `artifacts/managed-proxy-r19/cookie-core-snapshot/dist/development`（静态快照，`connected:false`）与 `cookie-native-8` 日志/回执/完整性清单；不能代表用户日常 Chrome 或新包通过。Node 历史检查数量也不代表六类产品需求完成度。

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

所有业务测试请求使用 `X-OpenDesk-Local-Test: 1` 请求头；默认拒绝浏览器 Origin。演示码 **DEMO-VIP-01 / DEMO-VIP-02** 分别分配 A/B，会员账号为 `local-fixture-account`。仅明确配置的隔离扩展 Origin 加测试请求头可以访问；这不是 CORS 放行。

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

 `/api/redeem` 只在一次有效且未消费的码预览下给出 `redeemed` 结果；同一码的其他 preview 或新 key 不能再次消费。重复同一 `idempotencyKey` 返回同一回执，改变同一键所绑定的 `previewId` 则返回 `409`。可以附加请求头 `X-Fixture-Drop-Ack: 1` 模拟“已消费但响应丢失”，接着只使用 `/api/status` 查询，不重试兑换 POST。未找到事务返回 `unknown`，不是“未兑换”的权威证明。还可在第一次 `/api/redeem` 提交时用 `X-Fixture-Outcome: pending` 模拟处理中、用 `X-Fixture-Outcome: final-rejected` 模拟服务端明确 `rejected + final:true`；两者都不会授予权益。

技术租约 mock：`POST /api/activate` 输入 `{"deviceId":"local-device","code":"DEMO-VIP-01"}` 返回 `{leaseId,expiresAt,endpoint}`；`POST /api/verify` 输入 `{"deviceId":"local-device","leaseId":"..."}` 返回 `{active:true,lease}`。`endpoint` 使用保留测试域名 `proxy.fixture.test` 及 `socks5`，**仅验证生产消息形状，无法连接你的 127.0.0.1:7897**，不要当成真正代理节点。代理实际联通请使用前述 PAC。

### R5.3 开发租约的 STOP race 控制

复用同一个 7898 服务；无需另起 server/proxy，本轮不为历史控制项重启服务或清空账本。旧进程若不支持该控制，记录该项不可用并由所属负责人后续协调，不阻塞当前核心操作。所有控制仍要求测试请求头，拒绝任何 `Origin`（包括 localhost 和 `null`），没有 CORS 放行。SW 请求使用 `credentials: omit`，不发送 Origin。

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

定向 HTTP 测试覆盖：静态激活 URL 的精确参数与隐私响应头、服务端 A/B 分配、全账本单码一次消费与并行预检、当前分配单项目录、新分配替换和旧响应失效、完整两 Cookie 目标身份核对、部分/混合/重复/伪造 Cookie 拒绝、精确共享会话请求和幂等绑定、撤权/过期/禁止回退、模拟 504 后查询回执、pending 保留与 final rejected、会员身份隔离，以及原 PAC/代理/verify 延迟/Origin/CLI 回归。只运行上面的单个测试文件；测试自行创建并清理随机端口临时实例，不操作已有 7898 服务。HTTP PASS 不证明真实扩展写入、URL 自动触发或商业后台 PASS。`X-Fixture-Drop-Ack` 是提交后返回模拟 504，不是真实断网。

**历史实现限制（不适用于文首 1.3.8 开发入口）：** `src/ai-smart-access/provider-config.js` 的 `activateUrl/verifyUrl` 均为空并要求固定 **HTTPS** origin；`src/ai-smart-access/policy.js` 明确拒绝 `localhost` / IP 代理端点且只接受 `https` 或 `socks5`；商业工具 `main.js` 四个 BUSINESS_ENDPOINTS 也为空且必须为经审核的 HTTPS；`host-controls.js` 当时没有用户激活码入口。不能直接填写 `http://127.0.0.1:7898`，或把 HTTP 7897 伪报为 HTTPS。历史上做 **OpenDesk 真实按钮端到端联调**，需要一个经安全审查、development-only、仅 loopback 且隔离 Chrome Profile 的测试 adapter；正式主包、公共代理协议与正常安全校验不能因此放宽。

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
