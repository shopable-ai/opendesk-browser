# OpenDesk Browser · Cloud Control R5.2 完整产品功能树（单一权威索引）

日期：2026-10-13。唯一写入分支：`main`。对应机器账本：[`cloud-control-r5-02-function-matrix.json`](../../framework/workstreams/cloud-control-r5-02-function-matrix.json)。

## 一、这份文档管什么、不管什么

此处是**整个 Cloud Control 的产品能力目录**，包括从 AI Task 验证安装，到 Provider/Executor/Client 授权、投递、真实 Chrome 执行、Result/receipt、Stop、故障恢复、用户 UI、远端部署与验收。**与已有 UI 39 项不是相加关系**：现有 `cloud-control-r5.2-ui-preview-contract.zh-CN.md` 的 39 项是 UI 交互验收叠加矩阵，其中许多映射了本文功能，不能声称“110+39 项独立产品功能”。

- **架构不再二选一**：唯一 Task Package/Installer/Resolver、Cloud Service/Provider、原 Authority/RunHost/Worker/Run/Result/receipt/History Index。Executor ID + Pairing + Grant + Task 固定身份是任务归属主键。
- **用户价值**：AI 协助创建/选择任务、验证并安装一次，之后通过授权外部系统重复调用。用户不需要为了日常操作编写 JS、部署 npm 或使用 CLI。
- **明确排除**：不创建第二套执行器、第二调度器、第二权限库；不投递任意代码；不在本轮实现 Side Panel 关闭后的新长期 Runner；不擅自购买服务器/域名。
- **证据级别**：`SOURCE_IMPLEMENTED` 只表示当前仓库有源码入口，`NOT_IMPLEMENTED` 表示生产交互尚缺；未绑定最新 SHA 验证就记 `NOT_VERIFIED`，原生 Chrome 缺证据记 `NATIVE_PENDING`，公网端到端缺证据记 `REMOTE_NATIVE_PENDING`。**功能数量不等于完成百分比，更不是 95 分。**

## 二、功能数量与拆分

**110 项可追溯功能/质量检查点，分 10 个业务域**，其中质量/交付项也作为工作项，但不是新的用户产品按钮。

| 业务域 | 功能项 | 默认源码职责 | 当前整体证据 |
|---|---:|---|---|
| AI Task 来源、验证与安装 | 11 | `src/platform/tasks/{contract,service}.js` | 精确 CI / Native 证据另见账本 |
| Provider、浏览器身份与配对 | 10 | `scripts/cloud-control/provider.mjs` | 精确 CI / Native 证据另见账本 |
| Cloud 托管授权和安全边界 | 10 | `src/cloud-control/service.js` | 精确 CI / Native 证据另见账本 |
| 外部应用委托与凭据管理 | 11 | `scripts/cloud-control/{provider,cli}.mjs` | 精确 CI / Native 证据另见账本 |
| 外部投递、队列与任务领取 | 12 | `scripts/cloud-control/provider.mjs` | 精确 CI / Native 证据另见账本 |
| 原 Chrome Worker 执行与许可 | 10 | `src/cloud-control/service.js` | 精确 CI / Native 证据另见账本 |
| 结果隐私、状态回执与历史 | 11 | `src/cloud-control/{service,history-index}.js` | 精确 CI / Native 证据另见账本 |
| Stop、撤权和故障恢复 | 12 | `src/cloud-control/{service,connection}.js` | 精确 CI / Native 证据另见账本 |
| Side Panel 云控产品界面与交互 | 11 | `src/ui/{tool.html,tool-shell.css,cloud-hosting.js,cloud-status-presentation.js}` | 精确 CI / Native 证据另见账本 |
| 远端部署、质量与发布证据 | 12 | `scripts/cloud-control/cli.mjs` | 精确 CI / Native 证据另见账本 |

另有 **39 项 UI 检查**（6 组：7 / 5 / 9 / 7 / 5 / 6），在 [现有 R5.2 UI 设计合同](cloud-control-r5.2-ui-preview-contract.zh-CN.md) 里逐项编号。该 UI 合同属于界面设计和视觉验收，不负责定义新 Provider / RunHost 协议。

## 三、完整可执行功能树

每项均对应机器可检索的固定 ID；下面两列分别是用户/系统功能与必须满足的验收合同。详细所有者、测试、实施/验证等级和 Gate，见 JSON 矩阵。

### TASK｜AI Task 来源、验证与安装（11 项）

- **TASK-01 AI/工作流产出固定 Controller Task Package**：产物是固定 Task manifest + sourceHash，不作为云端任意脚本上传。
- **TASK-02 Task Manifest 结构和版本检查**：非法字段、版本和权限拒绝。
- **TASK-03 SourceHash 与 ManifestHash 校验**：篡改源码或 manifest 必须拒绝。
- **TASK-04 闭合参数 Schema 校验**：未知字段、类型、上下界不放行。
- **TASK-05 Task Candidate 导入及只读查看**：导入不等于安装或远端执行。
- **TASK-06 真实 Run/Result 证明后验证 Candidate**：缺少原始运行及权限收据不能通过验证。
- **TASK-07 验证后发布本地可安装版本**：只有 verified 版本才可 available。
- **TASK-08 安装与启用已验证 Task**：版本、来源和安装身份固定。
- **TASK-09 停用、卸载与历史结果保留**：撤权禁止新执行但不删历史。
- **TASK-10 升级、重装与 InstallationId/Generation 变更**：旧云许可绝不自动复活。
- **TASK-11 Chrome 网站 Origin 授权及撤权**：浏览器网站权限是执行前最后约束。

### PAIR｜Provider、浏览器身份与配对（10 项）

- **PAIR-01 Provider 固定身份和持久状态**：重启 ProviderId 及合法历史不改变。
- **PAIR-02 浏览器 Executor 唯一身份**：不能按相同 Task 摘要误认为同一浏览器。
- **PAIR-03 配对码验证与最小 credential**：错误码和旧 token 不能越权配对。
- **PAIR-04 重复配对明确拒绝及解除后重配**：活跃身份不可被伪造覆盖。
- **PAIR-05 PairingId 配对代际隔离**：旧配对的 Job/receipt 归属保留但不重投。
- **PAIR-06 HTTPS Provider URL 校验**：非 HTTPS 除固定开发 loopback 明确允许外均拒绝。
- **PAIR-07 WSS 一次性 ticket 认证**：过期、重放和跨配对拒绝。
- **PAIR-08 Provider 与 Executor capability 发布**：只发布已授权不可变 Task 身份。
- **PAIR-09 GrantId 授权代际及旧 Grant 墓碑**：旧连接延迟消息不能恢复已撤销授权。
- **PAIR-10 解除配对与原凭据撤销**：断线不能假报远端凭据已撤销。

### CONSENT｜Cloud 托管授权和安全边界（10 项）

- **CONSENT-01 只列出本地已安装且启用 Task**：Provider 注册的未安装 Task 不能出现在可审批项。
- **CONSENT-02 最多 32 个不同 Task 同时批准**：同一 taskId 重复审批拒绝。
- **CONSENT-03 固定 TaskId/Version/两摘要审批快照**：前后摘要或版本变化重新审核。
- **CONSENT-04 安装 ID 与 Generation 精确钉住**：重装不能继承旧 Cloud consent。
- **CONSENT-05 网站 Origin 与本机许可再验证**：云端不能扩大 Chrome 网站权限。
- **CONSENT-06 参数规则在审阅前完整展示**：默认值、枚举、上下界可审核。
- **CONSENT-07 逐任务正文回传独立许可**：默认状态-only，结果正文需额外确认。
- **CONSENT-08 批准后绑定新 grantId**：再次启用是新的授权代际。
- **CONSENT-09 托管过程中禁止未确认热更范围**：先 Stop 栅栏再重批。
- **CONSENT-10 每次 Resolve/Run 再复核 Task 与权限**：UI 勾选不是唯一权限来源。

### CLIENT｜外部应用委托与凭据管理（11 项）

- **CLIENT-01 Provider 管理员本地注册固定 Task Manifest**：任何上传源码/Javascript/shell/CDP 被拒。
- **CLIENT-02 浏览器用户自助创建受限外部客户端**：原 Side Panel 可信 Sender / 原 Host 权限。
- **CLIENT-03 外部客户端名称和 Task 选择**：只绑定本浏览器已批准的固定任务。
- **CLIENT-04 客户端可用 Task Pin 白名单**：不允许访问未委托的已安装 Task。
- **CLIENT-05 客户端结果正文读取单独选择**：客户端许可与 Browser Task 许可必须同时满足。
- **CLIENT-06 256-bit 客户端 Token 一次性展示/复制**：不写浏览器 IndexedDB/localStorage/普通日志。
- **CLIENT-07 客户端分页列表和必要元数据**：只显示当前 Executor/Pairing/Grant 下的客户端，不泄漏 token。
- **CLIENT-08 用户按指定 Client 二次确认撤销**：旧 token 后续提交/状态查询立即拒绝。
- **CLIENT-09 管理员本机客户端授予和撤销**：不可从公网直接使用 Admin 接口。
- **CLIENT-10 凭据撤销竞争窗口二次校验**：认证后入队的旧请求不能在撤销后成功。
- **CLIENT-11 令牌轮换/重新创建的用户恢复路径**：遗失令牌不能再显示明文，撤销旧后创建新。

### DELIVERY｜外部投递、队列与任务领取（12 项）

- **DELIVERY-01 可信 HTTPS 外部客户端提交固定 Job**：只有 /v1/submit 且必须通过受限 Client 身份。
- **DELIVERY-02 管理员本机固定 Task 演示投递**：本机 Admin 与外部 HTTPS 协议隔离。
- **DELIVERY-03 任务固定 manifest/source 摘要校验**：错误版本或摘要拒绝。
- **DELIVERY-04 Task 参数与网站 Origin 白名单校验**：禁止额外参数、跨 Origin、凭据型 URL。
- **DELIVERY-05 Job 绑定 Executor + Pairing + Grant**：浏览器 B 安装同 Task 也不能领取 A Job。
- **DELIVERY-06 同 Client requestKey 同内容返回同 JobId**：不重复执行未知副作用。
- **DELIVERY-07 同 requestKey 异内容冲突**：拒绝请求摘要漂移。
- **DELIVERY-08 不同 Executor/Client requestKey 空间隔离**：租户之间不共享请求幂等记录。
- **DELIVERY-09 单客户端提交速率和待领取队列上限**：限流不破坏原幂等答复。
- **DELIVERY-10 WSS notify 不包含执行内容**：只通知接收方拉取。
- **DELIVERY-11 合法 Executor claim 严格选中目标 Job**：其他 Executor/撤销身份无法取得 Assignment。
- **DELIVERY-12 旧无归属 Job 保守隔离**：迁移后不得仅凭相同 Task 重新派单。

### EXEC｜原 Chrome Worker 执行与许可（10 项）

- **EXEC-01 只复用原已验证 Task Resolver**：Cloud Provider 不承载用户可运行源码。
- **EXEC-02 Side Panel 合法 Host 身份与 Slot**：只读控制台不能自动运行。
- **EXEC-03 复用唯一 RunHost / Worker**：切换 Tab 不创建第二执行器。
- **EXEC-04 Assignment ID / RunRef / Grant 精确对应**：无合法 admission 不创建 Target/Worker。
- **EXEC-05 Provider permit 必须是当前租约**：过期或错 RunRef 拒绝实际网页操作。
- **EXEC-06 固定网页目标/精确 Document 与网站授权**：导航及跨文档导致保护栅栏。
- **EXEC-07 真实 Task A 表单填充并提交**：必须留真实网页变化及原 Worker 证据。
- **EXEC-08 真实 Task B 关键词搜索并取得内容**：不得改名复用 Task A 的代码和效果。
- **EXEC-09 原 RunId + ResultId + sourceHash 可追溯**：结果和安装版本一一对应。
- **EXEC-10 Worker retirement released 可验证**：执行槽释放且原 Result 持久不丢失。

### RESULT｜结果隐私、状态回执与历史（11 项）

- **RESULT-01 执行状态与结果正文两个概念**：用户能区别执行完成和分享网页内容。
- **RESULT-02 最小状态-only 回执**：禁止 valueWire、页面正文、URL、Cookie 和原始错误正文。
- **RESULT-03 正文回传需 Browser Task consent**：未批准结果正文不离开本机。
- **RESULT-04 外部 Client 结果读取需额外 consent**：其他 Client 不能取得查询结果。
- **RESULT-05 Result revision/sourceHash 固定核对**：不匹配原 RunRef 的 Result 拒绝上传。
- **RESULT-06 ReceiptKey 必须等于原 ResultId**：无法换键覆盖已确认结果。
- **RESULT-07 Receipt 丢包重试与 digest 幂等**：只补原收据不重新执行 Worker。
- **RESULT-08 外部只查询自己 Job 状态**：状态脱敏且不能读取他人 Job。
- **RESULT-09 Cloud History Index 分页/筛选**：可见历史不全量 clone 大量 KV。
- **RESULT-10 Side Panel 最近记录显示任务可读名称**：用户区分不同 Task、不泄漏原始 ID。
- **RESULT-11 UNKNOWN 保守显示并不暴露结果正文**：结果未知不能误显示已安全完成。

### RECOVER｜Stop、撤权和故障恢复（12 项）

- **RECOVER-01 Stop 当场撤销本地 grant**：不会仅停一个 UI 计时器。
- **RECOVER-02 Provider suspend ACK 与本地 pending 区别**：本地停机不假报远端已确认。
- **RECOVER-03 Stop 后拒绝新 Job 投递和 claim**：已停止授权不接受新副作用。
- **RECOVER-04 旧 requestKey 仍可查询原 JobId**：Stop 不删除已接受的幂等记录。
- **RECOVER-05 Unpair 必须完成 Provider 远端 credential 撤销**：离线保留必要恢复状态。
- **RECOVER-06 已确认终态 Result 不因迟到取消被改写**：released + durable Result 保持原完成事实。
- **RECOVER-07 Provider 重启保留 Job/Result receipt**：不清空状态伪造成功。
- **RECOVER-08 WebSocket 重连与 SW 重启不重复执行**：重连先对账、再继续合法授权。
- **RECOVER-09 Chrome 关闭或 Side Panel 关闭保守处理**：不承诺新的长期无人值守 Runner。
- **RECOVER-10 Task 升级/禁用/网站撤权栅栏**：旧 grant 不得继续访问。
- **RECOVER-11 已发生网页副作用但结果未知**：OUTCOME_UNKNOWN 不自动重放。
- **RECOVER-12 Provider 入库/磁盘故障原子回滚**：只读状态可查询、写入失败不出虚假 Job。

### UI｜Side Panel 云控产品界面与交互（11 项）

- **UI-01 连接与可执行状态优先展示**：首屏能理解是否可执行及下一步。
- **UI-02 未配对首次引导**：一键进入配对表单，默认安全 HTTPS。
- **UI-03 无 Task 空状态前往「我的」**：必须指向真实 tab-my-tasks。
- **UI-04 多个已安装 Task 卡片与可读用途**：主列表不展示长 SHA。
- **UI-05 逐任务是否允许远端执行及正文回传**：未授权项不能在 UI 被批准。
- **UI-06 批准前用户可读 Review 确认**：显示网站/参数/版本和正文二次确认。
- **UI-07 已授权 Task 详情和变更指引**：技术身份只在高级展开。
- **UI-08 请求历史、详情、原始结果入口**：一页能区分等待、失败、未知、已确认回执。
- **UI-09 Stop、Unpair、Client revoke 后果区别**：按钮含义和危险确认清楚。
- **UI-10 外部应用自助创建/复制一次性 Token**：不泄露、不持久化在 Browser。
- **UI-11 移动窄宽、键盘、ARIA 和 Zoom 200%**：真实已安装 Chrome 300–520px/125%/200% 完整矩阵。

### OPS｜远端部署、质量与发布证据（12 项）

- **OPS-01 同一 Provider 本机 Admin 仅绑定 127.0.0.1**：未经加固管理口不能公网暴露。
- **OPS-02 可选受信 TLS HTTPS/WSS listener**：使用真实证书/安全配置，不降级公网 HTTP。
- **OPS-03 CLI 固定 Task 注册、受限 Client 和状态查询**：服务维护者能管理，不要求普通用户懂命令行。
- **OPS-04 远端 Client 身份与服务器权限保护**：只允许访问授权 Task/Executor，不使用 Admin token。
- **OPS-05 正式公网环境与外部客户端跨网连通**：需要获批准的服务器/证书/账号端到端记录。
- **OPS-06 Cloud 独立 CI 定向组件测试**：保留精确固定 SHA、PASS/FAIL、失败原件。
- **OPS-07 Controller Authority 组件稳定性**：同 SHA 不能因测试 mock 递归造成 OOM。
- **OPS-08 check + production/development 双构建 + verify**：固定 512 KiB 预算且保留 PackageHash。
- **OPS-09 真实双 Task Chrome Worker + 网页效果验收**：与本机 Node 模拟 RunRef 严格区别。
- **OPS-10 真实双 Executor/Stop/重启/未知副作用原生故障矩阵**：两个独立浏览器证据不能由 mock 代替。
- **OPS-11 Cloud UI 视觉、键盘和 Zoom 原生验收**：真实扩展截图、AX、溢出和焦点记录。
- **OPS-12 十五维独立专家质量门槛**：各维 ≥95 才可宣布最终产品闭环。

## 四、与 UI 39 项、旧文档和工程实现的关系

| 材料 | 作用 | 唯一性 |
|---|---|---|
| **本文 + 对应 JSON** | Cloud Control 全产品功能树、任务编号与开发/测试交付目录 | **唯一完整产品功能索引** |
| [UI 39 项 / HTML 设计合同](cloud-control-r5.2-ui-preview-contract.zh-CN.md) | 界面信息架构、六场景、五档宽度、UI 39 项 | UI 领域规范，不重复 Provider 设计 |
| [R5.2 当前工作流](../../framework/workstreams/cloud-control-r5-02-product-closure.md) | 实际 commit、CI、失败/原生证据和责任边界 | 事实账本，不被本目录覆盖 |
| [R5.2 一次性执行手册](../../framework/cloud-control-r5.2-execution-manual.zh-CN.md) | Gate 0–6、优先级、具体修改/测试/签收 | 后续 AI **按手册执行，不重做架构** |
| [用户 README](../../../examples/cloud-control/README.zh-CN.md) | 正常用户与 Provider 维护者的真实使用步骤 | 不替代验收 |
| [独立专家评分表](../../framework/workstreams/cloud-control-r5-02-expert-scorecard.json) | 15 维 DESIGN/IMPLEMENTATION/VERIFICATION，不平均抵消 P0 | 估计分与真实评分明确分开 |

## 五、结论与严禁误报

1. 仓库已有源码的项目**不自动等于通过真实 Chrome**。本机 Node/TLS 里的人工 RunRef 与 receipt 只算组件证据。
2. 最新可确认的 R5.2.4 [CI #38379208965](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379208965)：Cloud 45/45 PASS、Authority 已执行 105 项后 OOM，整体 FAIL；[package CI #38379209138](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379209138) 为 CANCELLED，无该 SHA PackageHash。这不是完整 R5.2 通过。
3. 后续已在 `main` 修复 K3 测试模拟 `cloudStop` 触发 `/v1/suspend` 递归的问题（提交 `90e1651eeb2ad364e4ced4fc44e9d155ddcfc708`），但需要对应新 SHA 的 CI 实测才能认定 OOM 关闭。
4. 用户 A/B 的两个真实已安装 Task 不串单、原 Worker/Run/Result/retirement/receipt、真实 300–520 CSS px/125%/200% Chrome 截图、用户批准公网跨网执行，必须保持 `NATIVE_PENDING` / `REMOTE_NATIVE_PENDING`，不能拿预览、组件统计或主观打分抵充。
