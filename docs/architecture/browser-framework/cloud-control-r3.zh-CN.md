# Cloud Control R3 · 六页签、只读控制台与执行可靠性

日期：2026-10-12。目标仓库：shopable-ai/opendesk-browser；唯一开发分支 main。

## 1. 产品和执行拓扑

正式 Side Panel：**我的｜发现｜工作流｜开发｜工具｜云控**。
仅 development：追加「调试」。调试页由 WXT MODE 门控，普通用户无法靠本地设置开启生产调试。
「我的」仅保留云控入口；「工具」不是云控安装/授权入口。
云任务沿用 Task 安装授权、Authority、Controller Run/Result、Page Worker 和唯一执行槽。

| 页面 | Host 注册 | 云领取 | 权限 |
| --- | --- | --- | --- |
| 真实 Side Panel | 原 Host | 已授权托管允许 | 配对、固定 Task 审批、托管停止及运行 |
| Task 目录或 Sidebar Tool 独立页 | 原有工具框架 | 不允许 | 目录或工具管理 |
| `ui/cloud-control.html` | **不注册** | **不允许** | 脱敏分页只读观察 |
| 开发「调试」 | 复用 Side Panel 原 Host | 不因调试操作领取 | 脱敏诊断 |
| 未来可见 Runner | 目前禁用 | 未验收不能领取 | 需原子单一 Host Owner Lease |

控制台不调用 `createHostClient()`、`RunHost`、`cloudNext`、`cloudResolve`、`host.start`。
从 Side Panel 第六页的入口打开新标签页；不会抢占原 Host，也不赋予新运行授权。

## 2. Observer 读取的安全边界

1. `cloudObserve` 是唯一 Observer 消息，位于原 Foundation Broker，不创建新的任务系统或 Run/Result 数据库。
2. Broker 校验原生 sender.id、固定扩展 URL、TAB 顶层 frame、活动文档、
   非隐身、documentId，并要求 `chrome.runtime.getContexts` 返回唯一匹配文档。
3. 服务端强制命名空间为 `tool:<extensionId>`。页面不能选择 namespace 或 registrationId。
4. 返回只含可信状态枚举、受限计数、回执是否确认、原资源是否释放及受限页码；
   **不返回** Credential、Provider URL、Executor/Host/Request/Run/Result ID、Permit、
   Task 安装清单、目标 URL、params、错误详情或原结果。
5. 每页 1–50，offset 0–1000000；控制台固定每页 20 条。
   动态列表采用 `textContent`，不用 HTML 字符串插入外部数据。
6. Observer 不能 claim、pair、approve、start、stop、grant、renew 或注册 Host。
   将来管理操作必须另立经审计的可信 RPC，不提升 Observer 身份。

连接 WSS 已认证不代表任务可执行。独立控制台不能确认 Side Panel 原生 Realm 时，
执行宿主显示「请在 Side Panel 核对」，不凭空宣称 ready。
等待宿主、等待目标、结果未知和确认回执，只能由现有可信事实驱动。

## 3. Side Panel 与历史性能

`cloudStatus({includeRequests:false})` 是 2 秒 claim 心跳的轻量只读状态探测，
不会遍历全部历史请求。详细读取 `cloudStatus({limit:5})` 返回脱敏最多 5 条与
requestTotal，支持 1–50 的页长；云控页约 5 秒拉取、其他页约 15 秒拉取，
不改变云任务原 2 秒领取检查节奏。

**R3.2 已实现的领取热路径优化**：当前授权配置在原 `frameworkKV`
保存 `pendingRequestId`，领取时按该主键读取原待执行请求，不再
每 2 秒重新 `tx.all(frameworkKV)`。领取新 Assignment 时同一事务写入指针，
原 Run 绑定时同一事务清理指针；取消托管、重新批准版本都会清理旧
`claimId` 和 `pendingRequestId`。从旧版升级时，在发现配置尚没有此字段时
只做一次历史兼容读取，找到有有效租约的原始 waiting 请求；
若仅剩过期 waiting，必须在原事务中标记 `E_LEASE` 且绝不创建新 Run。
该指针只优化领取，**不替代真正的 Request/Run/Result/retirement 幂等事实**。

独立 Observer 支持 `state` 固定枚举过滤和 `matchingTotal`，
界面提供状态筛选、分页和只读刷新；不能输入任意过滤表达式、
网站 URL 或 Executor namespace。

**已知未完成项**：详细 cloudStatus 和 Observer 都仍使用
`tx.all(frameworkKV)` 再过滤排序，只限制 RPC 响应体，**并未实现原生 IDB
有界扫描或索引分页**。后续需要 namespace/createdAt 索引、事务一致的聚合计数、
受限 native cursor、迁移回滚和升级测试，不能称历史百万条高性能已达标。

## 4. 原始终态与撤销

原 Run 已结束、原执行槽 retirementState 为 released 且 provider receipt 已确认时，
后续 provider lease 过期、cancel、assignment 回收、停止托管不可将历史
重新写作 E_CLOUD_CANCELLED。fence/reconcile 已增加该保护。
未确认回执、OUTCOME_UNKNOWN、释放中、撤权导致的停止继续受原 Authority 栅栏约束。
未知副作用**永不**因为恢复消息再次执行。

Gate 1–3 旧原生记录仅属于其原代码身份。不得重新 claim、改写旧 requestId、
人工更改 IDB、假造 Result，或重新跑旧副作用以求一致。

## 5. 长时间 Runner：仍禁用

Observer 不能承担 Runner，也不以隐藏 offscreen 页面绕过 MV3 生命周期。
未来 Runner 是用户明确启用的**可见**扩展页，复用原 RunHost、Run/Result，
并须实现以下原子所有权合同：

- ownerKind（side-panel / visible-runner）、registrationId、
  generation、fencingEpoch 与 TTL，存入现有事务存储；
- 一次 IDB readwrite 事务内 compare-and-swap Host Owner Lease，
  旧 generation 在 Target/Worker 真正派发前拒绝，不能用内存锁代替；
- Side Panel 与 Runner 切换先 fence 旧 owner；未知效果保留 OUTCOME_UNKNOWN；
- 关闭只读控制台不停止原任务；关闭可见执行 Host 后的 WAITING_HOST /
  OUTCOME_UNKNOWN 以原持久 Run 为准；
- SW/浏览器重启、升级、撤权、断网逐项验证；
- 相关原生验证通过前，正式挂机开关保持不可用；Native/Desktop 是后续可选端。

### 单一 Host Owner Lease 的已提交但未启用的基础设施

`src/cloud-control/host-owner-lease.js` 已提供基于现有 `frameworkKV` 和
`commandJournal` 的原子 claim/renew/release/dispatch-assert，
包含 `ownerKind / registrationId / documentId / namespace / generation /
fencingEpoch / leaseUntil`。测试覆盖两 Host 竞争、租约过期、旧 epoch、
持久事务回滚。**它目前是 dormant 模块，没有 Broker 公共 RPC、没有
Runner UI，也没有接入云端任务派发许可**。
不得据此将「关闭 Side Panel 后执行」标记为通过。
正式接线前必须将可信可见 Runner sender、RunHost/Authority 和 Owner Lease
在原 Run admission 中进行持久 fencing，完成真实 Chrome 双宿主测试。

## 6. 定时任务衔接：仍未进入正式执行

ScheduleDefinition、FireId、chrome.alarms 属于已登记的设计。
本地 alarm 与 cloud assignment 必须使用唯一 source/generation/FireId
持久去重，再进入原 Task、Authority、RunHost 与 Result。
无原子 FireId 去重时，不允许同时开启本地和云端派发同一计划。

## 7. 验收与发布

专项 CI：`.github/workflows/cloud-control-r3.yml`；
cloud-r3-component 验证页签、安全 Observer、Authority/Result、provider/WebSocket；
cloud-r3-package 验证 npm run check、build、build:dev、verify。
GitHub Actions 为 Linux Node 静态/组件/构建证据，不是 Mac Chrome 原生证据。

Gate 4 待绑定原生现场：副作用后中断恢复、原 Run 运行中真正 UI Stop、
网站权限和 Task 安装授权撤销、托管停止/解除配对、IDB Quota/rollback、
receipt 响应丢失、租约到期后原确认结果不变。每次绑定代码 SHA、
扩展包 SHA、Provider 实例、原 Run 只读身份、原生证据路径，
不能以新任务重跑旧副作用。
