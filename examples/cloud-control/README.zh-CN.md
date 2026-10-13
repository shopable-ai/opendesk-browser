# 本地云控表单示例（历史兼容入口）

这是 Browser 独立 Executor 的受控开发演示：固定任务 `sample.form-fill@1.0.0`，目标只有 `http://127.0.0.1:43111/demo-form.html`。原 Task 安装/授权、Authority、RunHost/Worker、Run/Result/退休保持原职责；不是导入工具、草稿或远端脚本。**Browser 本地任务不依赖 Desktop App、Native Agent 或 Node Provider**；下面 Node 服务仅用于云端演示。

先读[架构与完成矩阵](../../docs/architecture/browser-framework/cloud-control-r1.zh-CN.md)、[唯一合同阅读入口](../../docs/contracts/execution-control/v0.2/README.zh-CN.md)和[主工作流](../../docs/framework/workstreams/cloud-control-r14-final-20261012.md)。历史 Gate1–3 是旧候选原生闭环；本轮 156 项定向首轮为 155 通过/1 断言缺陷，leader 修正原 Task 授权查询基准后单例补验 1/1；Provider/connection 11/11，均仅 COMPONENT_TESTED。此前 122/122 保留原身份，不合并成产品覆盖率。当前候选 C 已通过生产/开发构建、严格包验证和 ZIP 字节一致性（BUILD_VERIFIED）；native/F3/ZIP 安装仍 NOT_TESTED，真实 UI 工具因 Mac 锁屏 BLOCKED。六维独立评分见工作流，未宣称 95+。[正式工作流 r14Final](../../docs/framework/workstreams/cloud-control-r1.md)逐项记录五 Gate，不能宣称当前 candidate native PASS。

## 1. 资源和安装前提

需要仓库已声明的 Node >=22.12、已安装依赖、受控 Chrome >=138。先只读核对 Provider 持久目录、43112/43111、Chrome Profile 和构建输出的当前负责人；已有资源按工作流复用，不抢占、清理或创建新身份覆盖现场。

日常 Chrome 固定加载仓库 `dist/development`，由已有 `npm run dev` watcher 更新；不另起 watcher 覆盖该目录、不更换扩展 ID。最终候选的生产/开发双构建、安全扫描和独立 CFT 加载由主代理负责；包身份不能用源码 HEAD 或目录名代替。本段操作指南与本轮 leader 的原始构建/恢复证据分别记录；指南本身不构成运行或安装 PASS。

当前工程预算来自 [build-contract.mjs](../../scripts/build-contract.mjs)：生产 SW 1 MiB（512 KiB 非阻塞提醒）、开发 SW 1.5 MiB、其他固定生成 JS 512 KiB。旧 384/320 KiB SW 预算仅属历史。

## 2. 按原入口操作

1. 若资源未被占用，运行 `npm run cloud:provider`。默认只监听 `http://127.0.0.1:43112`，占用时启动失败，不抢进程。状态/独立管理凭据保存为 `.local/cloud-control/state.json`、`admin.json`（0600）。需要独立状态目录时对**每个** CLI 命令传相同 `-- --directory <目录>`；Browser 开发地址仍固定 43112，不能并行争同端口。
2. `npm run cloud:pairing` 在本机输出 providerId/pairingCode；不要把 pairingCode、credential、adminToken 发到聊天/日志/网页脚本。Browser 只接配对参数，不接管理 token。inspect 只读管理状态，但 ID/目标/结果仍按授权处理。
3. 标准网页服务只有 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`；若已有标准服务直接复用，访问 `http://127.0.0.1:43111/demo-form.html`。不沿用历史 /fixture 地址。
4. 通过原任务目录真实导入 [form-fill.v1.opendesk-task.json](../tasks/form-fill.v1.opendesk-task.json)，按原候选验证/安装流程在标准页面验证，设为本地可用并安装。在原 UI 批准网站及用户脚本权限；不要修改示例 sourceHash/manifestHash，不在「工具」中导入 Task 或用 JavaScript 草稿代替安装身份。
5. 在**「我的」→「云端托管」**填地址、providerId、pairingCode，明确允许固定本地 HTTP/WS 并配对。配对不自动运行；核对固定任务版本、网站、输出范围，勾选托管及所需回传许可，点击「批准并启用托管」。正常重连复用已有范围；范围/提供者改变须重新授权。
6. 保持真实合法可见 RunHost。分别确认连接 authenticated、已对账、Host 就绪、原槽空闲和目标条件；在线不是执行许可。用 `npm run cloud:seed:form -- --name Alice --key <本次唯一请求键>` 投递固定任务。省略姓名默认 Alice；真正新执行用新键，重试同次投递保留原键。
7. 原 Worker 在真实页面填写/提交；在「我的」原运行记录核对 runId/resultId、Result 自身 revision.sourceHash、原退休 released/@slot available，再由受限回传产生 Provider Receipt。连接、Request、Run、结果保存、退休、回执、等待/阻塞原因分别读，不能用一个“完成”推导全部成功。
8. `npm run cloud:inspect` 查询已认证管理事实。重启必须使用同目录、同受控 Profile，先对账原 Job/assignment/runRef；已完成只查或补传原结果，非终态未知保持保守栅栏，不能重新 seed 原未知 Job。

所有真实运行须绑定同候选源码/包、扩展 ID、Profile、任务 hash、原 Run/Result/退休和 Receipt；手工观察、Node 组件与原生证据等级分别登记。完整五 Gate 尚未正式关闭前不写最终 PASS。

## 3. 产品和开发诊断

最新 [tool.html](../../src/ui/tool.html) 已将原云端托管控制完整移回「我的」，移除独立 Cloud Tab；五个正式 Tab 是「我的、发现、工作流、开发、工具」，development 的「调试」为**第六 Tab**，production 隐藏且导航拒绝进入。历史 cloud Tab 偏好映射到 tasks，见 [sidebar-tab-memory.js](../../src/ui/sidebar-tab-memory.js)。原 R1.4 文档/旧布局曾出现“第七”，不能作为当前操作定位；新布局原生交互验证仍以主工作流为准。

调试页只经可信 `cloudStatus({})` 读取同一个已安装任务/原 Host 的脱敏状态；刷新不 claim、不取 Permit、不建 Run、不配对、不撤销。[UI 工作流](../../docs/framework/workstreams/cloud-control-r14-ui-20261012.md)记录状态投影组件证据，不能替代当前 Mac Chrome 窄宽度、125%/200% 缩放、键盘/焦点和最终包测试。切换 Tab 不建第二执行器；关闭 Side Panel 不承诺无人值守。

UI 区分等待/运行/停止中、Result 已保存、资源待释放/已释放、Receipt 待确认、脱敏原因。completed+released 后租约不覆盖原 reason；真实 stopped/failed/interrupted 保留。预留 resultId 不等于已保存。旧历史取消噪声仅在 finished+completed+released+receipt 全部满足时隐藏。

## 4. 取消、解除配对与故障恢复

- `npm run cloud:cancel -- --job <jobId>` 取消服务端原 Job；UI「停止托管并请求取消」持久停新领取并走原取消栅栏。Stop/取消不等于网页效果回滚；必须等待原退休证明。
- 解除配对本机立即停止新执行；离线时显示“本机已停止；服务端撤销待确认”，`cloudStatus.revocation` 为 pending。旧 credential 暂存 IDB **仅供 revoke 重试**，不能用于新执行或新配对；server confirmed 后才同事务删 config。不能把 pending 写成“凭据已失效”。原请求/Run/Result 不删除。
- Provider 已实施 pairingId/generation、完整 assignment/permit identity、严格 runRef、持久 revoke、旧 ticket/socket 拒绝、无 Permit 禁 renew、assignment/current permit 双 lease 同事务更新。Browser 仍重验本机 Grant/权限与 epoch；Provider 在线不能绕过本机 Authority。
- `npm run cloud:fault -- --path /v1/admission --count 1`，或 /v1/claim、/v1/receipt，故意在持久提交后丢 HTTP 响应；同键只重取事实。仅在资源 owner 安排的新测试任务上使用，不能对历史未知现场盲重放。
- Receipt pending 后仍在发送前再次核对网站、Task 和 output 授权。上传失败只补交原结果/回执；撤权后停止敏感发送。unknown effect、旧 owner/document/incarnation、缺原生 ack 均保守阻断。

原历史恢复现场不得重新 seed：Job `584bcbd1-eefa-4f78-8c52-8761a004dd4e`，Request `cloud:ed794251-e8b3-4345-8dfc-6e98e15181ab`，Run `afd37543-f456-45f6-9e12-ea3548e65d4d`，Result `0b388df6-783c-47b0-a8f9-3e9fd2df20a3`。已原生观察 **1 Run/1 Result、无中断后新 dispatch**；interrupted、workerRetired=true，但退休 fenced、旧 incarnation owned target creation-unknown、slot held、无 Receipt，继续 **BLOCKED**。见[恢复摘要](../../docs/framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-recovery-summary.json)，不伪造释放。

原 credential 通过 auth 补 legacyPairing 映射，只保留同 grant/namespace/pair 的旧 requestKeys；旧 rows/digest/缓存 body/lease 与原 Run/Result/Receipt 不改。远端已有 RunRef、本机没有关联时只查原运行，禁止用新键制造第二 Run。TaskRef/ProviderJob.task 是固定产物引用，本机 installation/generation/builtin/dependency identity 仍由原安装/Revision/资源 owner 复核；本示例不新增协议字段。

恢复后[稳定性复查](../../docs/framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-stability-1791799143631.json)仍为原 singleRun interrupted/fenced/@slot held、无 Receipt、无新 dispatch，绑定旧 package44c6cfa…。[关闭资源观察](../../docs/framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-resource-stop-observed.json)确认旧 Provider/CFT 已关闭、43112 不监听，Profile/state/IDB 保留；关闭进程不等于资源 released，BLOCKED 未解决。

只读诊断中 siteAuthorization 来自真实 Chrome Grant 查询，不申请权限；slotState/pendingResources 表示原槽与待退资源，与连接分别判断。paused_unknown，或 interrupted 加原 controller-operation/controller-navigation 的 dispatched/effect_unknown 才诊断未知效果；fenced 独自不等于 unknown。五 productTabs + 开发 sixthDebug 保留，生产隐藏并阻止进入；下面既有 Observer 控制台仍无执行权限。

## 5. 命令和证据入口

命令定义见 [package.json](../../package.json)、参数实现见 [cli.mjs](../../scripts/cloud-control/cli.mjs)。以上是静态核对；本次未执行这些有副作用命令。

| 已有入口 | 用途/边界 |
| --- | --- |
| cloud:provider / cloud:pairing / cloud:inspect | 启动持久回环服务 / 本机配对参数 / 管理事实查询 |
| cloud:seed:form / cloud:cancel / cloud:fault | 固定示例投递 / 取消原 Job / 持久后丢响应；保留同次请求键 |
| test:cloud | Node HTTP/WebSocket Provider/连接消费者组件；不代替 Chrome Gate |
| tests/framework/k3-controller-authority.test.mjs | 原事务/安装授权/Permit/结果/恢复等定向组件；156 首轮 155/1 与 direct-query 单例补验 1/1 分开记录，见正式 r14Final |
| npm run check / build / build:dev / verify | 源码检查、双构建/包验证，由候选负责人执行并绑定身份；本 writer 未运行 |

Executor 当前 HTTP 路径及 /v1/revoke、WS 首帧、管理认证说明只维护于[合同 README](../../docs/contracts/execution-control/v0.2/README.zh-CN.md)。开发 Node 文件服务不等于正式 Provider 认证、数据库队列/事务 unique/outbox/inbox/audit。Desktop/Mobile 只列后续计划。本轮未修改或部署 mac24dev 旧 Midway 项目，不使用其旧直接脚本接口代替本合同。

## Cloud Control R3 · Observer-only 控制台及验证

正式 Side Panel 为「我的 / 发现 / 工作流 / 开发 / 工具」；
开发构建增加第六个「调试」。在「我的」云端托管区可使用「在新标签页打开只读云控控制台」入口，
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
原 IDB 故障和执行宿主关闭验收。没有当前同身份原生证据时保持 NOT_TESTED。
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
