# 隔离本地持久业务测试站（有界原型）

这是供 T00/T01/T02 后续验证使用的**本地测试地址，不是外部生产业务站**，也不是第二套云控平台。当前只提供账号登录、已有 Provider 的 BFF，以及目标业务记录 create/update/read。Provider、PostgreSQL 环境、两个固定 Controller Task 的创建/授权/安装及 Chrome 操作均由父任务负责；此目录不拥有这些组件，也不访问其他仓库。

## 启动合同

```js
import {openLocalBusiness} from './examples/cloud-control/local-business/server.mjs';

const site = await openLocalBusiness({
  pool,                    // 父任务已有 pg Pool；close() 不会结束此 Pool
  providerUrl,             // 合法 HTTPS origin，例如 https://127.0.0.1:<tls-port>
  providerCa,              // 父任务 Provider 证书的 CA PEM/Buffer
  accounts,                // 仅在服务端传入，见下方
  taskActions: {           // 可信启动配置；只映射固定 taskId，不能从表单覆盖
    'local.record-create': 'create',
    'local.record-update': 'update'
  },                       // 以上为默认值；其他 Task ID 必须显式映射
  portalPort: 0,           // 默认临时端口；正式固定 Task 前应选空闲固定端口
  recordsPort: 0,
  businessId: 'local-r201-fixture' // 可选，默认 UUID；重启复用此值可读回记录
});
// site.portalUrl / site.recordsUrl / site.portalOrigin / site.recordsOrigin
// site.portalPort / site.recordsPort / site.businessId
// await site.close(); // 仅关闭本站两台 HTTP server，清除内存 session
```

`accounts` 每项严格为 `{username,password,subjectId,tenantId,clientCredential}`。这些都是专用本地测试账号；每个账号必须使用独立 Provider client credential、username 和 tenant/subject 组合，不传 admin/executor 凭据。凭据仅在 BFF 服务端使用，不注入页面。账号主体由此映射，API 不接受 caller 自报 tenant/subject。请勿把账号密码/凭据写入已提交文件或终端日志。

两台 server 均仅绑定 `127.0.0.1`。前端只请求自身 origin，不开放 CORS；Host/Origin 校验、不同名的 `od_local_portal` / `od_local_records` HttpOnly SameSite=Strict cookie、防 CSRF token、30 分钟固定 session expiry 和登录后 session 轮换用于隔离两站。Cookie 不以端口隔离；不同名字及服务端独立 session map 是必要条件。HTTP cookie 仅用于 loopback 测试，不应部署到外网。未做生产级登录限流或多实例 session 分发。

Provider 必须使用 HTTPS、显式 CA 验证、8 秒总截止时间及 1 MiB 回包上限；不跟随重定向，不使用 TLS 绕过变量。Provider 错误以 `E_PROVIDER` 返回，状态可能未知时只用原 requestKey 重试，不能推断副作用没有发生。

两个业务表通过传入 Pool 创建：`opendesk_local_business_records` 保存唯一实际业务数据；`opendesk_local_business_requests` 只保存 BFF requestKey/固定输入/job ACL 和 execution_key 绑定，不新建 Run/Result 库。业务查询均绑定 businessId、tenantId、subjectId；执行 token 查询按 businessId 定位后严格核对登录 tenant/subject；不同主体的同名 recordKey 是独立记录。相同主体重复 create 同 key 同内容幂等返回，相异内容返回 409；更新须显式走 update。Pool 及数据库清理由调用者管理，不删除共享表。

稳定测试需保留 businessId、账号映射、Provider 原状态/凭据和 records 固定端口。重启保留数据库记录和 job 绑定，登录 session 必须重新建立。端口变化意味着 Task origin/pin 必须重新批准，不能将旧 origin 的批准沿用到新地址。

## API

两站共同提供：

- `GET /api/session`：返回 `csrf`、当前 `username`（未登录为 null）、`expiresAt`；初次请求设置匿名 cookie。
- `POST /api/login`：`{username,password}`，登录成功轮换 cookie 和 csrf。
- `POST /api/logout`：`{}`，退出并返回新的匿名 csrf。

所有 POST 要求同 origin 的 `Origin`、JSON content type 和 `X-CSRF-Token`；后续请求携带本站 cookie。除 session/login 和静态页外均要求登录。API 错误结构为 `{error:{code}}`。

Portal：

- `GET /api/catalog` → `{tasks,target}`；调用现有 `/v1/client-scope`，带 `includeTaskSchemas:true`。仅返回 taskActions 配置允许、Provider 已批准且 siteOrigins 明确包含当前 records origin 的 Task schema/pin，不返回源码。
- `POST /api/submit`：`{requestKey,taskId,version,params}`；由服务端从 catalog 选定 manifestHash/sourceHash，固定 `target:{mode:'owned',url:site.recordsUrl + '?executionKey=<server-token>'}`，提交 `/v1/submit`。禁止附加 JS/shell/CDP/program/target。本站参数严格为 `{recordKey,name,status}` 三个非空白 string，最大长度依次为 150/200/80；禁止额外字段（包括 subjectId、tenantId、executionKey）。Provider 继续校验固定 schema/pin/权限。
- `GET /api/jobs` → 当前主体的 `{jobs:[{requestKey,jobId}]}`（最多 100 条）。刷新页面后从 PG 恢复。
- `POST /api/job-status` / `/api/job-cancel`：`{jobId}`；先检查本站 job ACL，再调用 Provider 对应接口。

requestKey 在浏览器按账号保存，提交前保存表单；后端按业务命名空间和账号生成稳定 Provider requestKey。requests 表以 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS execution_key TEXT` 原位扩展，并建立 `(business_id, execution_key)` 唯一索引。首次 INSERT 由服务器生成 32 字节随机 token；同 requestKey INSERT 冲突时复用原行 token。规范化 input 保存固定 Task pin、服务器映射 action 及稳定键序参数，字符串保留原值，不 trim 或隐式转换。input 和 token 在首次 Provider submit **之前独立提交**。已绑定 key 变更输入返回 409，同内容复用原 token/target/Provider requestKey/job；Provider 超时或 DB 提交结果未知时保留原 key 重试，不自动新建请求。Portal 仅人工点击查询/Stop，不自动重放任务或轮询。

Records：

- **只读** `GET /api/execution?executionKey=<server-token>` → `{action,params}`；只返回与当前登录 scope 匹配的已批准操作和参数，不返回 tenant/subject/credential。格式错误返回 400；未知 token 或其他账号返回 403。
- `POST /api/records/create`：`{recordKey,name,status,executionKey?}`。
- `POST /api/records/update`：同上；不存在/不属于当前主体返回 404。
- **只读** `GET /api/records?recordKey=<exact-key>` → `{records:[{recordKey,name,status,updatedAt}]}`；不传 key 时最多列出 100 条。刷新页面重新查询 PG。
- **只读** `GET /api/verification-context?jobId=<id>` → 原 BFF intent 的 requestKey/jobId/executionKey、固定 Task pin、action/params；必须属于当前 Records 登录主体，且 Job 只对应一项 intent。
- **只读** `GET /api/verify?jobId=<id>` → 独立验证状态。服务器仅转交当前 Records cookie 给固定 Records origin 的 GET，不创建或刷新登录；不接受 subject/tenant/allowResult 参数。页面「独立只读验证」调用此接口，默认隐藏正文与 token。

带 executionKey 的 create/update 在写入前重新核对登录 scope、action 和规范化参数 SHA-256 摘要；不符返回 403（无写入）。执行查询等待期间 session 被轮换/过期时拒绝写入。无 executionKey 是正常手工业务操作，不代表云 Task 模式。前端只从目标 URL 读取 token 并在 Task 模式 POST 附带，不提供 token/subject/tenant 表单输入；不记录 token 日志。旧请求行不补造 token；旧请求同 key 输入不匹配时返回 409，不自动重放。

只读接口也要求 records 登录 cookie；可信 verifier 必须使用对应主体会话读回真实数据库数据。它不能绕过 ACL，也不接受主体 query 参数。

`verifier.mjs` 导出 `verifyBusinessResult({recordsOrigin,jobId,sessionFetch,allowResult=false,expectedTask})`。调用者提供合法固定主体的 GET 会话包装器，模块不获取凭据。依次读取原 intent、execution、唯一实际记录，核对固定 pin/action/参数；8 秒总截止、32 KiB 每响应上限、拒绝重定向。状态为 VERIFIED/MISMATCH/INCONCLUSIVE/NOT_RUN；VERIFIED 的 `causation` 始终是 NOT_PROVEN，不结算 Receipt、不改 Run/Result、不重放。只有显式可信调用参数 allowResult:true 才投影业务字段；本站 UI 路由固定 false。

本站新请求显式提交 `controlProtocol:2`，已有 job 绑定不会重发或升级；Provider 不支持时保留原稳定 key 并失败，不降级协议。

## 父任务创建两个固定 Controller Task 时使用的 selectors

目标必须使用 BFF dispatch 的完整 URL（包含稳定 executionKey），不能把它改回裸 `site.recordsUrl`。需先在 records 独立登录；Portal 登录不能代替 records 登录。Controller 保持现有 `page` API 和 Authority，不在本目录增加 Runner/安装器。推荐 schema：`recordKey/name/status` 均为 required string，长度分别不超过 150/200/80。

| 操作 | selectors |
| --- | --- |
| 登录 | `#login-username`, `#login-password`, `#login-submit` |
| 开始填写前必须等待 | `#execution-context[data-state="ready"]`；手工模式登录完成也为 ready；未登录、错误 token 或账号不匹配为 blocked，隐藏 business 并禁用业务输入/按钮 |
| 执行详情 | `#execution-params` 展示已批准 action/参数；只有对应 create/update 表单可用 |
| 确认登录 | `#identity`, 可见 `#business` |
| Task 创建记录 | `#create-recordKey`, `#create-name`, `#create-status`, 点击 `#create-submit` |
| 创建持久保存提示 | `#create-result`（包含 `已持久保存：<recordKey>`） |
| Task 更新记录 | `#update-recordKey`, `#update-name`, `#update-status`, 点击 `#update-submit` |
| 更新持久保存提示 | `#update-result`（包含 `已持久保存：<recordKey>`） |
| 页面查询 | `#search-recordKey`, 点击 `#search-submit` |
| 数据行 | `#records-list tr[data-record-key]`；单元格 `[data-field="recordKey"]` / `name` / `status` / `updatedAt` |
| 操作错误 | `#message` |

表单提交成功先写 PG，再刷新列表并显示保存提示。Task 应等待对应保存提示及目标行真实值，不以 click 返回视为业务成功。避免直接把未经转义的 recordKey 插入 CSS selector。Portal 另有 `#task-select`、`#param-recordKey` / `#param-name` / `#param-status`（按批准 schema 生成）、`#request-key`、`#submit-task`、`#jobs` 和 `#job-status`。

## 最小验证及证据边界

```sh
node --check examples/cloud-control/local-business/server.mjs
# 由父任务在环境中提供真实隔离 PG URL；不要将含密码 URL 写进提交记录
node --test tests/cloud-control/local-business-r201.test.mjs tests/cloud-control/local-business-provider-r201.test.mjs
node --test tests/cloud-control/local-business-verifier-r201.test.mjs
```

真实 PG 用例优先读取 `CLOUD_CONTROL_TEST_DATABASE_URL`，未设置时自读 `.local/cloud-r201/environment.json` 的 `url`（不输出连接串），通过 `createRequire` 复用 `scripts/cloud-control` 下的 pg 依赖。未配置时 **SKIP**，不用 mock 结果补成功。用例覆盖登录/退出、CSRF/跨端口 Origin 拒绝、create 冲突、update/read、同 tenant 跨 subject 及同 subject 跨 tenant 隔离、businessId 重启持久化和基本 job ACL 拒绝；随机 namespace 清理，不删共享表。测试启动的短生命周期站点在用例结束关闭，不启动长期服务。

本轮自动验证：Node server/两个 UI 内联 JS 语法及 selectors、页面 ready/blocked 门禁、真实 PG CRUD、合法登录会话只读 verifier 与跨主体隔离，以及真实 TLS Provider BFF 集成通过（测试显式配置 `taskActions:{"local-business.create":"create","local-business.update":"update"}`）。TLS 中间跳在 Provider 已接受提交后延迟响应超过 BFF 8 秒截止时间，证实 intent/token 先提交、同 key 重试 token/job 稳定、不同内容冲突；Alice/Bob 跨账号读写、验证后切账号写入、action/参数篡改和恶意 token 被拒。只清理随机 businessId/ledgerId 数据及自身 TLS 临时目录。页面门禁的隔离 DOM 驱动不冒充 Chrome。

2026-10-24 已在真实 Mac CFT 154 的持续开发扩展安装两个 Task 1.0.1，并经 Portal 创建 A、更新同一 A、最后连接代次修复后再次正常更新；三次原 Run/Result/Receipt 均可追踪，刷新 Records 后的独立 verifier 均在当时返回 VERIFIED/NOT_PROVEN。原生细节、固定身份及未执行项统一见[唯一 Cloud 合同的本次本地核心结果](../../../docs/architecture/browser-framework/cloud-control-r5.2-interface-security-contract.zh-CN.md)。Browser 使用 HTTP/WS 固定 loopback，不能算严格 T01 HTTPS Pull / T02 WSS Native；生产及跨设备仍 NOT_TESTED。页面成功提示、Worker completed 和 Receipt ACK 各自不能替代独立业务读回。
