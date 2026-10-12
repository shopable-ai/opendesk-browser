# 本地云控表单示例 — R1.4 Final

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
