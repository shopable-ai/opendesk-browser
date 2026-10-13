# 本地云控表单示例（历史兼容入口）

需要 Node >=22.12、已安装仓库依赖和受控 Chrome >=138。固定任务 sample.form-fill@1.0.0，不修改示例摘要。

1. 在仓库运行 `npm run cloud:provider`。默认仅监听 http://127.0.0.1:43112；占用则启动失败，不抢占进程。状态和独立管理凭据保存在 `.local/cloud-control/state.json`、`.local/cloud-control/admin.json`（权限 0600）。命令 `-- --directory <目录>` 可选独立持久目录；请保持 Browser 固定开发端口 43112。
2. 运行 `npm run cloud:pairing`，在本机读取 providerId 与 pairingCode。不要把 adminToken 放入 Browser 或聊天。`npm run cloud:inspect` 查询已认证的服务端 Job、claim、Run 关联与回执；不输出 Executor 凭据。
3. 示例服务：`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。若已有标准服务，直接使用 http://127.0.0.1:43111/demo-form.html。
4. `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`，Chrome 加载本次 dist/production 或 development。打开原工具页任务目录，真实导入 examples/tasks/form-fill.v1.opendesk-task.json；在标准页面执行原验证，设为本地可用并安装，通过原 UI 批准网站和用户脚本权限。
5. 在「我的」选择已安装任务，展开「云端托管」，填写默认地址、providerId 和 pairingCode，明确勾选本地 HTTP/WS 并配对。核对已批准固定任务网站和结果范围，勾选托管授权与需要的结果回传，再点击「批准并启用托管」。首次配对不会自动启动。正常重连复用已有授权。保持真实可见 RunHost 开着。
6. 核对连接已认证、Host 就绪、原槽空闲；`npm run cloud:seed:form -- --name Alice --key <本次请求键>` 投递固定任务。省略姓名默认 Alice。任务只经原 Worker 操作页面，观察页面提交完成、runId/resultId、退休 released 和服务端回执。
7. 使用 `npm run cloud:inspect`；原结果在「我的」原运行记录，云关联在托管状态。服务端控制台只有地址/身份/目录，状态文件保留事实。关闭并用相同目录重启提供者，重开同 profile 的 Browser 后先对账，已完成任务不会重跑；非终态未知结果保持 OUTCOME_UNKNOWN。
8. 故障注入：`npm run cloud:fault -- --path /v1/admission --count 1` 或 `/v1/claim`、`/v1/receipt`，先持久提交事实再丢弃 HTTP 响应。重复原键只取回原事实。`npm run cloud:cancel -- --job <jobId>` 在运行时取消；UI「停止托管并请求取消」立即停新领取，状态保留取消处理中/退休待核对。解除配对会先撤销托管；不删除原请求、Run 和 Result。
9. `npm run test:cloud` 是真实 Node HTTP/WebSocket 持久提供者消费者测试；原 Authority 的定向事务测试在 tests/framework/k3-controller-authority.test.mjs。真实 Chrome 证据等级必须另看本工作流，不能用该命令代替。

服务端 admin API 为 POST /admin/state、/seed、/cancel、/fault，需独立 Bearer adminToken。/seed 只接受 requestKey、params、固定 demo-form 目标；固定包由仓库内部读取，不接受任意源码或文件路径。Executor API 为 POST /v1/pair、/auth、/capabilities、/claim、/admission、/renew、/cancellation、/receipt、/reconcile；WS /v1/events 只认证/心跳/通知。

mac24dev 旧 Midway 运行项目目前只绑定回环，HTTP/Socket.IO 18001/18002 从本机 LAN 不可达。其旧直接脚本接口不能替代本合同；本轮没有修改或部署该服务器。


## Cloud Control R3 · Observer-only 控制台及验证

正式 Side Panel 仍为「我的 / 发现 / 工作流 / 开发 / 工具 / 云控」；
开发构建另外增加「调试」。云控页增加「在新标签页打开只读云控控制台」入口，
对应扩展内部 `ui/cloud-control.html`，不是 Sidebar Tool 或任意外部网页。

该控制台**不注册 Host**，只能通过验证 Chrome TAB/documentId 的
`cloudObserve` 接口查看连接、执行槽、队列计数和分页脱敏请求；每页最多
50 条，UI 默认 20 条。控制台不会 claim、start、授权、停止或执行。
正式配对、安装 Task 审批和停止托管仍在原 Side Panel 进行。

原 Side Panel 轮询继续 2 秒检查可执行任务，但使用
`cloudStatus({includeRequests:false})` 跳过历史扫描；
云控页详细读取使用 `cloudStatus({limit:5})`，另返回 requestTotal。
**注意**：详细读取和 Observer 仍扫描 frameworkKV 后分页，尚未是原生 IDB
索引/游标分页；大量历史数据性能需后续迁移验收。

专项回归使用：

- `node --test tests/environment/cloud-control-console-r3.test.mjs`
- `node --test tests/environment/cloud-control-debug-r14.test.mjs`
- `node --test tests/environment/cloud-control-sidebar-r28.test.mjs`
- `node --test tests/environment/sidebar-tab-memory.test.mjs`
- `node --test tests/framework/k3-controller-authority.test.mjs`
- `npm run test:cloud`
- `npm run check && npm run build && npm run build:dev && npm run verify`

GitHub Actions 专项工作流为 `.github/workflows/cloud-control-r3.yml`。
Linux CI 构建不能替代 Mac Chrome Gate 4 真实停止、副作用后中断恢复、
原 IDB 故障和执行宿主关闭验收。没有原生证据时保持 NATIVE_PENDING。
控制台关闭不应结束 Side Panel 正在执行的原 Run；Side Panel 关闭后也
**不承诺继续挂机**。长期 Runner 正式开关仍未实现。


## R3.2 · 任务领取主键、控制台筛选与本机验收入口

- Side Panel 2 秒轮询现在同时避免了**读取全部云请求状态**和**每次领取前搜索全部历史请求**：`cloudStatus({includeRequests:false})` 只读连接/槽；`cloudNext` 使用配置中的 `pendingRequestId` 按原 `frameworkKV` 主键查询未执行请求。
- 对旧版本没有该字段的配置，只做首次兼容读取，优先保留仍在有效期的原 waiting Assignment。新 Claim、Run 的原子准入、Stop 与重新批准会维护该指针；过期而未运行的请求只能记为 `E_LEASE`，不能复用失效许可执行 Worker。
- 独立控制台状态筛选固定为：全部、waiting、prepared、permitted、finished、cancellation-pending、cancelled、OUTCOME_UNKNOWN。分页 `matchingTotal` 表示筛选结果条数；`requestTotal` 才是全历史条数。没有后端事实不模拟等待目标或 Host 就绪。
- `src/cloud-control/host-owner-lease.js` 的单一 Host Owner Lease 仅是 dormant 测试基础，尚未连接实际 RunHost；**无法凭此文件关闭 Side Panel 持续挂机**。
- 详细历史界面虽然限制了单次响应条数，但目前仍从原 `frameworkKV` 全表读取后筛选；大数据量原生游标/索引和内存性能仍待后续实施。
- 受检生产/开发包必须核对自己的源码 SHA 和 packageHash。不能以已通过 Node CI 替代 Mac Chrome 真实运行中的 UI Stop、权限撤销及副作用后中断恢复。

可供本地 Codex 直接执行的 R3 原生最终测试修复 GOAL：
`docs/framework/prompts/cloud-control-r3-final-mac-chrome-acceptance.zh-CN.md`。
先读取历史 `docs/framework/workstreams/cloud-control-r1.json` 的未完成
`pendingUnknownCase`；禁止重新投递或重跑那个原副作用请求。

## Cloud Control R4 · 同一 IDB 内的真正有限历史分页（源码候选）

> R3.2 上文描述的是当时的已知缺口；以下 R4 实现为后续增量，原 R1/R3 事实和旧 CI 证据保持原样。

- 独立控制台仍使用 `cloudObserve`，无云任务 claim/start/approve/stop 权限。Side Panel 的管理和领取权限仍要求真实 Chrome SIDE_PANEL sender。
- 新的 `src/cloud-control/history-index.js` 在现有 v2 `frameworkKV` 里保存按命名空间、创建时间和状态排列的**脱敏派生索引**和同事务状态总数；原云 request、Run、Result 和回执的持久主键与数据库均不变。
- 首次详细 Cloud 状态读取会在已授权 Side Panel 中原子建立历史索引；Observer 不执行任何迁移。已迁移后 `cloudStatus({includeRequests:true})` 和 `cloudObserve({state,offset,limit})` 通过原生 IDB 有界游标读取，不再先克隆全部 `frameworkKV`。
- 查询最多返回 50 个脱敏条目；状态计数按持久索引维护，不能返回原请求 ID、目标 URL、params、credentials 或结果体。历史非常深的 offset 仍需要游标推进，不保证 O(1)。
- 如果旧 schema、只读恢复或迁移前的索引尚未存在，查询可以沿用只读兼容读取；正式 Chrome Quota/回滚和 100/1,000/10,000 条真实耗时/内存测量仍为 `NATIVE_PENDING`。
- **这不是“关闭 Side Panel 仍能云端挂机”**：`HostOwnerLease` 尚未接入云 Run admission/Worker，Scheduled 可见 Runner 没有获得 Cloud RPC 执行权限，跨本地/云端 FireId 幂等尚未完成。

R4 架构与验收清单：
`docs/architecture/browser-framework/cloud-control-r4.zh-CN.md`
和 `docs/framework/workstreams/cloud-control-r4-20261012.md`。

后续新增专项 CI：`.github/workflows/cloud-control-r4-idb.yml`，以独立 Linux Chrome for Testing 对**真实 IDB 引擎和 R4 游标代码**进行数据量与回滚微基准。此验证不安装完整扩展、不运行 Task、不替代 Mac Chrome Gate 4。


## R5.1 通用 Controller Task 投递（覆盖上文固定表单示例限制）

本节为最新合同；以上 /admin/seed 只能调用固定表单的叙述仅适用于旧版 seed:form 兼容模式。R5.1 Provider 允许管理员从本地已校验 Task Package 登记多个不可变任务 manifest；**不上传、保存或下发源码**。必须先在浏览器独立完成验证、发布、安装、启用，Provider 登记不能代替这些本地授权。

保持原本的 Provider 运行，在本机受控终端输入：

    node scripts/cloud-control/cli.mjs register --package examples/tasks/form-fill.v1.opendesk-task.json
    node scripts/cloud-control/cli.mjs register --package examples/tasks/modern-search.v1.opendesk-task.json
    node scripts/cloud-control/cli.mjs tasks

在 Side Panel「云控」→「连接与授权」选择多个已安装任务，逐项核对 taskId、固定 version、manifestHash、sourceHash、网站 origin、安装代际及结果回传许可。新增任务和升级版本默认不批准。点击批准前必须确认总授权；任一 Task 允许结果回传还必须再次明确勾选。修改现有授权前先停止托管。

在两个不同 Task 已在浏览器完成真实安装及许可、并且**未与另一个 Agent 的 43111/43112 或 Chrome Profile 争用**时，可使用通用投递：

    node scripts/cloud-control/cli.mjs seed --package examples/tasks/form-fill.v1.opendesk-task.json --target http://127.0.0.1:43111/demo-form.html --params '{"name":"Alice"}' --key r51-form-001
    node scripts/cloud-control/cli.mjs seed --package examples/tasks/modern-search.v1.opendesk-task.json --target http://127.0.0.1:43111/demo-form.html --params '{"keyword":"OpenDesk"}' --key r51-search-001

还可显式提供 --task、--version、--manifest-hash、--source-hash 取代 --package。传入目标必须是包 manifest 已批准网站 origin 内的规范化 HTTP(S) URL；参数必须通过该 Task 的闭合 Schema，同一 requestKey 同规范化内容返回原 Job，不同内容返回 E_REQUEST_CONFLICT。管理员 API 现在包含 /admin/register 和 /admin/tasks，原 /admin/seed 同时兼容固定表单和通用身份；Executor 不可通过 /v1 路由登记、上传或传递脚本。

遗留原 Run/Result、retirement、Provider admission/receipt 和 OUTCOME_UNKNOWN 保护不变。Node HTTP/WebSocket 组件通过不等于真实 Chrome 已执行。对应 R5.1 工作流见 docs/framework/workstreams/cloud-control-r5-01-generic-task.md 和同名 JSON；必须获得两个不同 Controller Task 的真实 Worker 与 Run/Result 回执才可标记 NATIVE_PASS。

## R5.2 · 指定浏览器的安全远端调用（本节覆盖 R5.1 的旧投递命令）

**使用界面**：在「我的」安装、验证并启用 Task；在「云控」连接可信 Provider，选择一个或多个任务，核对固定网站 Origin、参数与版本，默认不勾选结果正文回传；点击「批准并启用」。Cloud 仍使用原 RunHost，Side Panel 关闭后不保证持续运行。

**必须指定目标浏览器**：R5.1 上方没有 `--executor` 的 `seed` 示例现已过时。先在提供者管理终端执行 `executors` 查看已配对的 Executor ID，再由维护者向指定 ID 投递。浏览器只领取与当前 **Executor + Pairing + Grant** 同时匹配、且确实在本地安装批准的固定 Task；旧无归属队列不自动派发。

```bash
# Provider 管理员在其本机操作；以下是 127.0.0.1 演示，不是公网部署。
node scripts/cloud-control/cli.mjs executors
node scripts/cloud-control/cli.mjs register --package examples/tasks/form-fill.v1.opendesk-task.json
node scripts/cloud-control/cli.mjs register --package examples/tasks/modern-search.v1.opendesk-task.json
node scripts/cloud-control/cli.mjs seed --executor EXECUTOR_UUID \
  --package examples/tasks/form-fill.v1.opendesk-task.json \
  --target http://127.0.0.1:43111/demo-form.html \
  --params '{"name":"Alice"}' --key r52-form-001
node scripts/cloud-control/cli.mjs seed --executor EXECUTOR_UUID \
  --package examples/tasks/modern-search.v1.opendesk-task.json \
  --target http://127.0.0.1:43111/demo-form.html \
  --params '{"keyword":"OpenDesk"}' --key r52-search-001
```

**实际外部 HTTPS/WSS**：以下真实网络示例使用**自己的 HTTPS 网站 Task Package**，其 manifest 必须确实允许 `https://approved.example`；不能拿仅允许 `127.0.0.1` 的内置演示包投递任意网站。

**实际外部 HTTPS/WSS**：Provider 可选在第二个 TLS listener 对外发布 `/v1/pair`、`/v1/auth`、`/v1/events`、`/v1/submit`、`/v1/job-status` 等受保护协议。管理接口始终限制于其本机 `127.0.0.1` 的 `/admin/*`；不能通过反向代理把 Admin 转发到公网。部署需要用户明确授权的可信 HTTPS 服务器、有效证书、网络 ACL、速率限制和凭据保管；仓库中的 Linux 本机 TLS 组件测试**不是公网原生 Chrome 验收**。

```bash
# 服务维护者：启动同一 Provider 的本机 Admin 和受保护 HTTPS/WSS。
node scripts/cloud-control/cli.mjs provider --directory .local/cloud-control \
  --port 43112 --public-port 443 --public-host 0.0.0.0 \
  --tls-key /secure/provider.key --tls-cert /secure/provider.crt

# 只在 Provider 本机管理终端创建受限外部客户端：
# 先登记用户已验证的 HTTPS 网站 Task，然后为指定 Executor 建立客户端授权。
# 凭据直接保存为模式 0600 的独立文件，不输出到普通终端日志。
node scripts/cloud-control/cli.mjs register --package /secure/approved-https-task.opendesk-task.json
node scripts/cloud-control/cli.mjs client:grant --executor EXECUTOR_UUID \
  --package /secure/approved-https-task.opendesk-task.json \
  --allow-result false --token-out /secure/external-client.token

# 如需为同一可信客户端授权两份 Task，可改用：
# --packages examples/tasks/form-fill.v1.opendesk-task.json,examples/tasks/modern-search.v1.opendesk-task.json

# 在获批准的外部系统中执行；目标必须是已安装 Task 所允许的网站。
node scripts/cloud-control/cli.mjs submit:remote --url https://provider.example/ \
  --token-file /secure/external-client.token \
  --package /secure/approved-https-task.opendesk-task.json \
  --params '{"name":"Alice"}' \
  --target https://approved.example/form --key remote-user-action-001

# 返回 {jobId} 后可用相同客户端凭据查询自己的任务状态。
node scripts/cloud-control/cli.mjs status:remote --url https://provider.example/ \
  --token-file /secure/external-client.token --job JOB_ID

# 随时撤销外部客户端凭据。
node scripts/cloud-control/cli.mjs client:list
node scripts/cloud-control/cli.mjs client:revoke --client CLIENT_UUID
```

**双重结果授权**：Browser 用户对每个已安装 Task 选择 `resultAllowed`；Provider 管理员另在客户端 `--allow-result true` 中明确许可读取结果内容。两者都批准、任务按原授权完成并持有完整 Result receipt 时，`status:remote` 才可能返回 `result.valueWire` 或用户允许的错误正文。否则外部客户端只能读到它自己 Job 的最小状态和回执是否确认。另一个客户端的 Job 直接返回 `E_JOB`，不会暴露目标 URL、参数、网页、Cookie 或 Run ID。

**不确定结果和撤权**：Provider 在收到合法终态 receipt 前，不能将已经 admitted 但租约过期或被取消的网页副作用重新投递；状态保守报告 `OUTCOME_UNKNOWN`。停止托管使本地授权失效；重新批准产生新授权代际，旧未领取队列隔离。解除配对需要确认 Provider 撤销，断线时不能假报远端凭据已失效。配对撤销或新的任务审批也会使相关旧客户端凭据失效。原始 Run/Result/receipt 历史不删。

**验收等级**：R5.2 专属 `.github/workflows/cloud-control-r52-contract.yml` 对 Provider HTTP/HTTPS/WSS、双 Executor、隐私、Authority 和 Side Panel 组件做独立 CI；真实双 Task Chrome Worker、原始 Run/Result/retirement、Provider 回执、宽度/缩放截图和真实跨公网终端仍必须分别保存证据。状态见 `docs/framework/workstreams/cloud-control-r5-02-product-closure.{md,json}`。


## R5.2.4 · Side Panel 自助管理外部应用授权（源码候选）

**普通用户不必持有 Provider 管理员密钥。** 在真实 Side Panel「云控」完成配对、已安装 Task 验证和「批准并启用」后，展开「外部应用授权」，填写外部应用名称，选择**一个**已批准的固定 Task，决定该应用是否可读取结果正文（默认关闭）。只有 Browser 已对这个 Task 单独批准正文回传时，才允许额外开启应用正文读取。点击「创建应用凭据」后，**只显示一次** 256 位客户端令牌；复制到经审核的外部服务的凭据管理系统，关闭面板、Stop 或解除配对后页面清除令牌，不会写入 Browser IndexedDB/localStorage/日志。重新获得令牌请撤销旧客户端并新建。

应用管理区域可以刷新、分页查看**当前 Executor + Pairing + Grant** 范围内的有效客户端和每个客户端获准调用的固定任务，也可以二次点击「确认撤销」来使指定客户端的提交和状态查询凭据失效。Stop 不能创建新外部授权，但原配对仍可查看/撤销既有客户端；解除配对会从 Provider 撤销本机凭据并间接失效关联客户端。Browser 不会向页面暴露 `/admin/*`、管理员 token 或任意脚本上传入口。

在已有可信 HTTPS Provider 环境中，外部系统拿到一次性令牌后，按上面的 `submit:remote`、`status:remote` 示例调用**自己被批准的固定 Task**。Provider 侧使用既有 `/v1/submit` 与 `/v1/job-status`，不需要新 Worker 或新 Provider。外部服务维护者负责安全保存令牌、设置正式 HTTPS 域名、证书、访问控制与凭据撤换；不要直接把密钥贴到公开群聊或命令行历史中。服务端管理员仍可以使用既有 `client:grant` / `client:revoke` 运维流程。

自助操作对应的 Provider 接口为 `/v1/client-list`（分页只读）、`/v1/client-grant`（Executor-auth、固定 Task pin、明确 allowResult）、`/v1/client-revoke`（仅能撤销同一配对/授权代际），均复用已有 Executor bearer credential 和持久 Provider clients 表。其他浏览器、外部 Client token 和旧配对不能使用这些接口管理该浏览器授权。详细拒绝性测试位于 `tests/cloud-control/remote-https-r52.test.mjs`，Side Panel UI 合同测试位于 `tests/cloud-control/r52-product-ui.test.mjs`。

**证据界限**：当前只是已提交源码/测试候选。必须等对应 SHA 的 Actions 通过，才能算 `COMPONENT_TESTED`；完整 Mac Chrome 双 Task、真实 UI 截图、远端公网服务等仍为 `NATIVE_PENDING` / `REMOTE_NATIVE_PENDING`，不使用 Node 合成 RunRef 伪造用户执行。
