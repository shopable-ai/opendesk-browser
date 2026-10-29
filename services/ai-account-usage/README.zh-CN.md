# OpenDesk Browser · AI 账号额度管理中心 R1.2（后端核心）

**进度：本地逻辑和模拟 HTTP 测试通过；真实单账号 Cookie-only 请求 `LIVE_NOT_TESTED`。** 本文档不把模型测试数据、HTML 模拟或本地 Node 的 HTTP 夹具当作已查询到真实额度。

## 产品边界

- 原目标：公司管理员统一掌握多个 ChatGPT / Codex 账号套餐、剩余额度、重置和订阅状态，并根据近期窗口的使用率识别长期低利用率账号。
- Cookie Editor 仍是账号/Cookie 的唯一可信存储。Node 只通过未来的可信 Host 授权读取**指定账号的一次性内存快照**；没有另一个 Cookie 仓库。绝不替换当前 Chrome 登录 Cookie。
- React 管理页为**另一条工作线**。已确认视觉入口在 `examples/sidebar-tools/cookie-editor/preview/ai-account-usage.html`，但其中数据、字段、布局均需按本后端契约重新审阅；本轮不修改原型。

## 现有源码

| 文件 | 职责 |
| --- | --- |
| `probe.mjs` / `cli.mjs` | 固定 ChatGPT 主机的单次 Cookie-only 查询，独立校验用户和工作区身份；不退化为 OAuth，不重试，不跨站，不跟随重定向 |
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

- 离线定向测试：`node --test tests/ai-account-usage-probe.test.mjs tests/ai-account-usage-backend.test.mjs`。
- 单账号真实 Cookie-only：仅在管理员自己 Mac 上，经授权从 Cookie Editor 选定的快照传入一次性 `cli.mjs`（stdin 管道，输入只保留在可信本地）。先前 `R1.1` 的 CLI 实验方式继续有效。不得把任何真实 Cookie、Access Token 或包含这些值的请求日志上传到 GitHub/ChatGPT/CI。
- `G1 LIVE_NOT_TESTED`：必须获取真实 `quotaHttpStatus/sessionHttpStatus`、确认 userId 和 quota account_id 完整匹配，且看到一组真实时窗后才能判定 Cookie-only OK。若 401/403/429，应停止尝试，不以 OAuth/Bearer 的成功冒充 Cookie-only。
- `G2 LIVE_NOT_TESTED`：至少两个真实账号、独立 Snapshot、身份无串号，并验证 Chrome 原 Cookie/登录状态/Vault 未修改。离线双账号单测不等于 G2。
- `G3 NOT_IMPLEMENTED`：正式 Cookie Editor Trusted Host → Native 的秘密数据桥接，授权绑定和撤销、后台采样启动/停用、React 同源 Session 及生产安装/升级验证。不能把测试注入提供者用于正式发布。
- 计划/订阅来源：`plan_type` 是内部响应（非官方承诺稳定的开放接口）；会员到期时间没有经过验证的可靠 Cookie-only 返回路径，因此目前仅支持管理员录入并标注来源。

**只有 G1 和 G2 的真实证据成立后，才应开放持续采集与正式 React 数据看板。**
