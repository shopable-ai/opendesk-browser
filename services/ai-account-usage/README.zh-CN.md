# OpenDesk Browser · AI 账号额度管理中心 R1.4-LIVE（后端核心）

**进度：单账号 Codex OAuth 已真实查询成功；Cookie-only 保留 403 / challenge 的独立失败记录；双账号隔离仍 `NOT_TESTED`，R1.5 正式 React 数据接线尚未就绪。** 本文档不把模拟 HTTP 测试当作真实账号查询，也不把 OAuth 成功改写为 Cookie-only 成功。

2026-10-29 22:29（北京时间），用户明确授权直接读取既有本机 Cookie JSON，先用 Cookie-only `GET /api/auth/session` 发现该快照的身份，再交给原 CLI 校验额度。该唯一真实请求返回 `403`、`text/html` 和 `cf-mitigated: challenge`，故未继续请求 `/backend-api/wham/usage`、未重试、未使用 Access Token 或认证替代。账号身份匹配数和额度窗口数均为 0；G1 未通过，G2 未启动。原 JSON 的 SHA-256 前后相同；Chrome 登录状态及 Cookie Editor Vault 未做独立前后验证。该结果只能证明当前 Node 出口的会话请求遇到边缘挑战，不能证明 Cookie-only 普遍不可行或必须增加 Token。两组既有测试本轮为 27/27 PASS；它们不替代真实验收。[脱敏实测证据](evidence/r14-live-20261029.json) 记录候选源码哈希、状态和停止边界，不包含 Cookie、Token、账号身份或原始响应。

## Codex OAuth 单账号真实结果（2026-10-29 23:08 北京时间）

用户授权读取既有 `~/.codex/auth.json` 后，先核对权限 `0600`、ChatGPT 模式及 ID/Access Token 中账号、主体、邮箱的一致性；这些是本机缓存声明，未独立验证 JWT 签名。随后用同一 Access Token 和账号绑定头执行一次固定主机 HTTPS GET，服务端返回 `200 application/json`，其 `user_id`、`account_id` 均与授权声明完全一致。服务端邮箱只记录存在性，未额外比对。没有刷新、重试或重定向，也没有登录/登出及认证文件写入。

| 实测字段 | 结果 |
| --- | --- |
| 认证类型 / 账号数 | `CODEX_OAUTH` / 1 |
| 服务端套餐 | `pro`，额度倍数未知 |
| 主额度窗口 | `primary`，604800 秒（7 天） |
| 已用 / 剩余 | 78% / 22% |
| 重置时间 | `2026-11-04T06:35:41.000Z`（北京时间 11 月 4 日 14:35:41） |
| 会员到期时间 | 未知；不使用额度重置或缓存订阅声明代替 |

该次本机 Python 标准库 harness 验证了真实协议；新增 Node 适配器随后通过离线定向测试，**尚未以该 Node 适配器重复真实请求**。实测只提取主 `rate_limit`，不声称穷尽额外额度桶或 ChatGPT 所有模型限额。源 auth 与 Cookie JSON 在查询前后哈希相同；Chrome 登录、Cookie Editor Vault 不变性和官方页面对照仍为 `NOT_TESTED`。没有第二份已授权 Codex 凭据，不搜索其他项目或备份补足账号。[OAuth 独立实测证据](evidence/r14-codex-oauth-live-20261029.json)。

选择单次 GET 的依据是与 CLI `0.164.0` 对应的官方源码提交 `6aaac694803004a63c6f393d153c96d22521a6b9`：[固定 usage 路径](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/backend-client/src/client/rate_limit_resets.rs#L124-L128)、[认证与账号头](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/backend-client/src/client.rs#L269-L289)、[服务端双 ID 比对](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/request_processors/account_processor.rs#L1227-L1237)。这是官方客户端的内部协议实现证据，不是稳定公开 HTTP API 的承诺。

本轮没有启动认证 App Server：[该版本会后台发现工作区](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/request_processors/account_processor.rs#L151-L160)，且[发现过程在 401 后可恢复认证并重放](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/request_processors/account_processor/workspace_routing.rs#L388-L423)，不符合本轮禁止隐式刷新/重放的要求。[官方 App Server 文档](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt) 的窗口字段用于解释语义，文档示例值没有进入本次结果。

同一真实快照已由现有 `HistoryStore` 保存到本机 `~/.opendesk/ai-account-usage/history-v1.json`，alias 为 `codex_local_01`，目录/文件分别 `0700`/`0600`；重开存储和受认证本机只读 API 均读回相同额度。此操作重放的是脱敏采集结果，不再联系上游，也不代表 Node 网络传输已实测。没有新建凭据 Vault。

R1.5 最小剩余工作：取得第二个独立授权的账号后验证真实隔离与账号切换不变性；验证 Node 在目标网络中的传输路径和认证生命周期；完成可信账号提供者与 React 同源会话接线。当前不启动自动采样、完整看板、正式安装或全量验收。官方文档对本机/开源 App Server 与商业/托管集成作了不同说明；未来部署方式须按实际官方授权渠道确认，不能把本轮本机查询当作商业服务授权。

## 产品边界

- 原目标：公司管理员统一掌握多个 ChatGPT / Codex 账号套餐、剩余额度、重置和订阅状态，并根据近期窗口的使用率识别长期低利用率账号。
- Cookie Editor 仍是 Cookie 的唯一可信存储；OAuth 使用用户另行授权的既有 Codex 认证来源。Node 只接收**指定账号的一次性内存快照**；不另建 Cookie/Token 仓库，不替换当前 Chrome 登录。
- React 管理页为**另一条工作线**。已确认视觉入口在 `examples/sidebar-tools/cookie-editor/preview/ai-account-usage.html`，但其中数据、字段、布局均需按本后端契约重新审阅；本轮不修改原型。

## 现有源码

| 文件 | 职责 |
| --- | --- |
| `probe.mjs` / `cli.mjs` | 固定 ChatGPT 主机的单次 Cookie-only 查询，独立校验用户和工作区身份；不退化为 OAuth，不重试，不跨站，不跟随重定向 |
| `codex-oauth.mjs` | 显式 `CODEX_OAUTH` 单次 HTTPS 查询；本机 Token 声明与真实服务端双 ID 绑定；无刷新、重放及认证持久化 |
| `domain.mjs` | 归一化计划类型、管理员补录的订阅时间、独立额度窗口、历史周期闭合、重置前未使用估计和不足证据状态 |
| `history-store.mjs` | 本机持久化**脱敏额度历史和非认证元数据**；目录 0700 / 文件 0600；原子覆写，拒绝 symlink、异常 Schema |
| `collector.mjs` | 可信主进程按 alias 授权查询一次账号；拒绝未授权身份，永不传出 Cookie 快照 |
| `sampling.mjs` | **显式 opt-in 的纯采样计划及单次 tick**：正常约 2h；接近预计重置约 10min；401/身份异常/429/Schema 异常暂停，无静默自动重放 |
| `read-api.mjs` | `127.0.0.1` 仅本机监听，随机秘密令牌认证，Host/Origin 限制，GET-only，JSON-only，不开 CORS；不会公开原始服务端响应 |

## 字段来源必须区分

- `providerPlan.family/code/multiplier/source`：来自**真实通过身份校验的额度响应** `plan_type`。若只返回 `pro`，只能知道 Pro，不得猜 5x、10x、20x；只有上游代码明确包含档位才确认 `providerPlan.multiplier`。
- `subscription.tierLabel/multiplier/membershipExpiresAt/nextBillingAt/source`：管理员**手工录入** `ADMIN_ENTERED`，与服务端证据独立显示。会员有效期与下一账单日是两回事；没有数据就 `null`，不得用 quota `resetsAt` 伪造。
- `windows[]`：每个 `windowKey` 包括 `slot`、`kind`（按窗口长度区分）、`durationSeconds`、`usedPercent`、`remainingPercent`、`resetsAt`、`observedAt`；不合并不同限额窗口。历史可保留其他时长旧窗口，但账号当前视图仅显示**上次成功请求**真实返回的窗口。
- `lastAttempt.status` 与 `lastSuccessAt` 分开：新一次读取失败，旧结果仍可查看，但属于过期历史，不代表当前实时额度。
- `lastAttempt.mode` 和每条历史窗口的 `mode` 区分 `COOKIE_ONLY` / `CODEX_OAUTH`；`limitId` 来自官方 `metered_feature`，主桶为 `codex`。旧历史默认解释为 Cookie-only，独立桶不合并。OAuth 失败会暂停采样计划，不能后台重放。
- `rollovers[]`：比较前后服务端预计重置时间。仅在跨过先前预计时间、重置预告时间向后显著移动，且使用计数下降（或保持零使用）三者同时满足时，标记 `CROSSED_PREDICTED_RESET`；证据不足分别标记 `CROSSED_BUT_UNVERIFIED` 或 `FORECAST_MOVED_UNCONFIRMED`。不能据此宣称“官方主动重置”。
- `nearResetUnusedEstimatePercent`：只有采样接近预期重置时间（短窗口 ≤15min、长窗口 ≤2h）并在后续观察到跨越时才写入；否则 `null`。这是**重置前最后观测剩余额度的近似估计**，不是确切浪费数量。
- `insights[]`：按账号、按窗口，提供最近 N 个闭合周期的近重置样本均值、≥80% 的次数、缺失证据次数；不同额度窗口与不同账号不能简单汇总为一个“浪费百分比”。

## 本机只读接口（无公网暴露）

通过可信进程调用 `startReadApi({store})` 后，默认绑定 `127.0.0.1` 随机端口；返回给可信进程的 `secret` **仅供可信 Native/Node 调用，不可传给 React 或网页**。目前没有开放给普通浏览器的认证桥接，也不支持在网页传 Cookie/Token。

| 路由 | 返回内容 |
| --- | --- |
| `GET /api/v1/accounts` | 脱敏账号元数据 + 上次结果 + 当前额度窗口 |
| `GET /api/v1/accounts/:alias` | 单个脱敏账号的类型、会员信息、额度状态 |
| `GET /api/v1/accounts/:alias/history?limit=100&windowKey=...` | 账号历史采样及观察到的跨窗口事件，最长 500 条 |
| `GET /api/v1/insights?cycles=5&threshold=80` | 近 N 个周期的近重置未使用估计与证据量 |

所有路由 GET-only，并要求可信本机客户端带一次性、不可猜的服务令牌；未知 Origin、Host、无令牌、敏感 Query 参数均拒绝。未来 React 的连接方式必须走独立可信配对/HttpOnly 同源 Session，**不能直接把此服务令牌或上游认证请求头交给页面**。

### 最小可信主进程使用示例

```js
import {HistoryStore} from './history-store.mjs';
import {createCollector} from './collector.mjs';
import {startReadApi} from './read-api.mjs';
const store = new HistoryStore();
await store.register({alias:'acct_01',displayName:'管理账号',subscription:null});
const collector = createCollector({store,loadAuthorizedAccount: async alias => {
  // TODO: 必须由固定 trusted Host 验证单账号授权并返回内存快照；
  // 未接线前禁止返回模拟/伪凭据。
  throw new Error('E_AUTH_REQUIRED');
}});
const api = await startReadApi({store});
// api.url、api.secret 只保存在可信本机进程，且不输出到网页或日志。
// await collector.refresh('acct_01') 仅在受控授权后由 Native 触发。
// await api.close() 关闭本机接口。
```

本示例不会获取任何真实 Cookie。`store.register` 只保存非敏感管理员元数据，不重复存储 Vault Cookie。

## 本机验证和真实闸门

- 离线定向测试：`npm test --prefix services/ai-account-usage`（本轮 38/38 PASS，包含 OAuth 身份/停止边界、旧 Cookie 行为和历史兼容）。
- 单账号真实 Cookie-only：仅在管理员自己 Mac 上，经授权从 Cookie Editor 选定的快照传入一次性 `cli.mjs`（stdin 管道，输入只保留在可信本地）。先前 `R1.1` 的 CLI 实验方式继续有效。不得把任何真实 Cookie、Access Token 或包含这些值的请求日志上传到 GitHub/ChatGPT/CI。
- `G1 NOT_PASSED`：本次身份预检为 403 / challenge，额度接口 `NOT_TESTED`。仍须获取真实 `quotaHttpStatus/sessionHttpStatus`、确认 userId 和 quota account_id 完整匹配，且看到一组真实时窗后才能判定 Cookie-only OK。若 401/403/429，应停止尝试，不以 OAuth/Bearer 的成功冒充 Cookie-only。
- `G2 LIVE_NOT_TESTED`：至少两个真实账号、独立 Snapshot、身份无串号，并验证 Chrome 原 Cookie/登录状态/Vault 未修改。离线双账号单测不等于 G2。
- `G3 NOT_IMPLEMENTED`：正式 Cookie Editor Trusted Host → Native 的秘密数据桥接，授权绑定和撤销、后台采样启动/停用、React 同源 Session 及生产安装/升级验证。不能把测试注入提供者用于正式发布。
- 计划/订阅来源：`plan_type` 是内部响应（非官方承诺稳定的开放接口）；会员到期时间没有经过验证的可靠 Cookie-only 返回路径，因此目前仅支持管理员录入并标注来源。

**只有 G1 和 G2 的真实证据成立后，才应开放持续采集与正式 React 数据看板。**

### 显式使用 OAuth 适配器

可信主进程须指定 `createCollector({store, mode:'CODEX_OAUTH', loadAuthorizedAccount})`；提供者只在内存返回 `{alias, authorized:true, snapshot, expectedIdentity}`，并由授权记录固定 alias 与同一账号的绑定。`snapshot` 形状为 `{authMode:'chatgpt', accessToken, idToken, accountId}`，`expectedIdentity` 为 `{userId, accountId, email?}`；不传 Refresh Token。提供者尚未正式接线，不能由普通网页或 HTTP Query 提供这些数据。

原 CLI 默认 Cookie-only；可信 stdin JSON 只有显式 `mode:'CODEX_OAUTH'` 才调用 OAuth。无任何自动认证降级。Node 默认传输使用单次原生 `https.request`，不发现系统代理、不复制 Codex 配置；本机真实 harness 则显式沿用系统 `127.0.0.1:7897`。因此当前 Node 默认网络路径仍需目标环境验证，不能把 Python harness 的联网成功外推给 Node 或自动切换代理。

## 套餐命名与使用条款注意

截至 2026-10-29，官方说明采用 Pro 100 / Pro 200 / Pro 500 等订阅名称；历史资料或实际账号也可能使用 Pro 5x / 10x / 20x 等额度倍数描述。两者不是可无证据互换的字段。当前归一化器保留原始服务端 plan_type，只有明确标注倍数才填写 multiplier；其他以管理员录入值及来源显示，不推断价格或会员有效期。

OpenAI 当前 Pro 说明明确提示：共享账号登录凭据、转售访问和自动抽取数据可能违反使用条款。**本后端代码并不代表获准自动采集，也不授权账号共享。**在开启持续轮询或商业部署前需核对适用协议、账号管理权限和官方可用的授权数据渠道；当前采样计划器不自动启动。
