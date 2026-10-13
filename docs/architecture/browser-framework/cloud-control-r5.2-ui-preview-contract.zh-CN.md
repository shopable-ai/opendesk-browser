# OpenDesk Browser Cloud Control R5.2 · UI 预览与产品实施合同

日期：2026-10-13。权威设计规范：`docs/architecture/ui-layout-conventions-r27.zh-CN.md`（尺寸、间距与唯一 Tokens）、`docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md`（多功能区的 Index → Detail/Form/Review）、`src/ui/design-tokens.css`。唯一生产入口为 `src/ui/tool.html` 的 `#workbench-cloud`。

## 0. 设计产物及验收身份

- **唯一 R5.2 可交互 HTML**：`examples/ui/cloud-control-r5.2-preview.html`，不新建第二个 Side Panel/Cloud Product。
- **功能和工程既有账本**：`docs/framework/workstreams/cloud-control-r5-02-product-closure.{md,json}`。历史 R1–R5.1 及失败证据不可覆盖。
- **用户操作手册**：`examples/cloud-control/README.zh-CN.md`，其中 R5.2 小节优先于旧版未指定 Executor 的 CLI 示例。
- **生产映射源文件**：`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/cloud-hosting.js`、`src/ui/cloud-status-presentation.js`、`src/cloud-control/service.js`、`scripts/cloud-control/provider.mjs`。现有 Controller Authority / Installer / RunHost / Worker / 原 Run/Result/receipt 不新增替代品。
- **HTML 性质**：纯本地静态 fixture 和内存状态；模拟的任务、权限、Provider、历史和回执都没有产生 Chrome 或公网副作用。HTML 点击成功 **不代表 Task 安装、网页执行、Provider ACK 或持久化**。

## 1. UI 核心产品决策（已经固定）

**用户从最重要的事情开始阅读：** 当前是否可以执行 → 允许远端调用哪些已安装 Task → 最近具体执行了什么 → 如何修改/停止/解除配对。

- 一级导航沿用已有「我的 / 发现 / 工作流 / 开发 / 工具 / 云控」，不新建一级 Tab。云控本身仅在真实 SIDE_PANEL Host 可见时执行；详细控制台可以沿用当前受信扩展只读 Tab。
- 首屏不再把完整 Provider URL/ID/配对码、技术 SHA、参数 JSON、6 个平均权重的统计项同时堆叠。首页仅有简短总状态、任务列表、最近请求和两个高频入口。
- **原有 Task 权限不被第二套许可取代**。用户在「我的」完成真实安装，云控只为现有固定版本建立**远程调用的附加许可**；还必须服从 Chrome 网站权限、安装代际和原 Host/Authority。
- 用户可以逐任务开关「允许远程执行」和额外的「允许回传结果正文」。**默认仅最小完成状态回传**（经原始已释放 Result 校验）；状态不包含网页正文、Cookie、URL、valueWire、原始错误。
- 每次正式批准必须有一次明确的**审批确认**，展示 Task、版本、网站、参数与正文回传范围。如含正文回传，需单独明确确认。原 `cloudApprove({tasks})` 仍是权威接口。
- 正在托管时不静默变更权限。调整 Task 范围需经原 `cloudStop` 栅栏，再重新批准并产生新 `grantId`。云控 Stop 和解除 Provider 配对是不同动作；停止时必须区分「本地已停」和「Provider 已确认暂停」。
- 「结果待核对」不是重试按钮，不能给用户暗示可安全自动重放未知副作用。关闭 Side Panel 后不保证常驻后台执行，R5.2 不实现新 Runner。
- 外部调用客户端的 Token 和 Executor/Grant/Task scope 仍由 Provider 的既有持久状态负责。**此 HTML 预览未模拟客户端授权管理**；但 R5.2.4 已在真实 Side Panel 使用原 Executor bearer 及当前 Task/Grant 委托实现受限的客户端创建、分页查看和单独撤销（源码见 `src/ui/cloud-hosting.js`、`src/cloud-control/service.js`、`scripts/cloud-control/provider.mjs`）。它不是 Admin API，也不允许网页或只读控制台颁发令牌；当前实现还需准确的 CI 与 Mac Chrome 原生验收。

## 2. 信息架构、交互和状态

| 视图 / 状态 | 用户看到什么 | 关键操作 | 生产映射或缺口 |
| --- | --- | --- | --- |
| Index：首次使用 | 未配对，下一步连接提示 | 连接提供者；去「我的」验证并安装任务 | `cloudPair`、`listTaskCatalog`、原 Tab 导航 |
| Connect：配对 | HTTPS URL、Provider 身份、一次性配对码；本机 HTTP 仅在「高级」内 | 验证并配对 | `cloudPair`；不可默认启用 loopback |
| Index：配对待授权 | 已配对但不可执行、可授权安装项 | 选择任务并批准 | `cloudStatus`、`listTaskCatalog` |
| Manage：逐 Task 授权 | 可读名称/用途/版本/网站、独立结果正文许可、所选数量 | 审阅并启用 | 已有多 Task 许可数据；单独管理二级视图为 **PREVIEW_ONLY** |
| Review：审批 | 完整固定身份/网站/参数的用户可读摘要，以及正文单独确认 | 批准并启用；返回修改 | 调用原 `cloudApprove({tasks})`；Review 二级视图为 **PREVIEW_ONLY** |
| Index：已启用 | 连接、可执行、已批准数量、逐任务范围及最近请求 | 查看详情、停止、历史 | 当前实现有原投影；预览重新编排，不承诺已同步生产视觉 |
| Task Detail：权限 | Task 名称、用途、版本、允许 origin、参数；技术身份折叠 | 停止后调整、去「我的」管理安装 | Task 详情为 **PREVIEW_ONLY**；全部信息来自已认证 Catalog/Status |
| History / Request Detail | 任务名、状态、是否回执、时间、未知副作用提醒 | 状态筛选、查看详情；本地结果入口 | `cloudStatus` / `cloudObserve` 已有分页；嵌入式详情为 **PREVIEW_ONLY** |
| Stop 确认 | 停止与撤销配对的差别、原始 Result 保留、未知副作用不重试 | 确认停止 | `cloudStop` + `remoteSuspension` ACK 投影 |
| Unpair 确认 | 撤销远端凭据，不卸载本地 Task；断线不假报远端已撤销 | 确认解除配对 | `cloudUnpair`；失败必须保留必要恢复状态 |
| 异常 / 离线 / 授权失效 | 一条可理解的行动原因；旧 Job 不恢复越权权限 | 检查网络、停止、重新批准 | 现有 `cloudStatus`、Run fence、Task resolver；视觉需真实验收 |

**唯一页面层级**：`od-page` 的 Side Panel 自身负责水平 gutter；每区使用一次 `od-surface` 作为外框；内部任务行仅用边线与间距，不套多层卡。链接/按钮使用 `od-button`、`od-toolbar`、统一 Tokens。重要字号 12–14px，11px 仅次要备注；独立章节间距 `--space-4`、卡片内 `--space-3`、行内 `--space-2`。技术 SHA / InstallationId / Generation 默认折叠。

## 3. UI 功能树：6 组、39 个可追溯检查项

状态说明：`SOURCE_IMPLEMENTED` = 现有生产源码已有对应能力或组件，但不表示已经采用本次预览布局；`PREVIEW_ONLY` = 目前仅在本 HTML 模拟，需正式迁移；`NATIVE_PENDING` = 需要真实已安装 Chrome 扩展验收。任何标识均不是单项 95 分的替代品。

| 功能编号 | 用户可感知功能 | 现阶段判断 / 实施要点 |
| --- | --- | --- |
| A01 | 云控当前是否可执行 | `SOURCE_IMPLEMENTED`，首页需整合为一条主状态 |
| A02 | Provider 在线 / 重连状态 | `SOURCE_IMPLEMENTED`，纯状态不能触发执行 |
| A03 | Host / 执行槽可用性 | `SOURCE_IMPLEMENTED`，首屏只在不可用时解释 |
| A04 | 已批准任务数量 | `SOURCE_IMPLEMENTED` |
| A05 | 手动刷新只读取状态 | `SOURCE_IMPLEMENTED`，严禁触发 claim |
| A06 | 首次未配对的一步式下一步引导 | `PREVIEW_ONLY` 独立内容设计 |
| A07 | 「我的」安装入口、已有六 Tab 导航 | `SOURCE_IMPLEMENTED`，无任务 CTA 映射实际 My Tab |
| B01 | HTTPS Provider URL 校验 | `SOURCE_IMPLEMENTED`，不在首页常显技术配置 |
| B02 | Provider 身份固定核对 | `SOURCE_IMPLEMENTED` |
| B03 | 一次性配对码与遮盖 | `SOURCE_IMPLEMENTED` |
| B04 | 固定 loopback 开发模式显式授权 | `SOURCE_IMPLEMENTED`，高级折叠 |
| B05 | 解除配对必须得到远端撤权确认 | `SOURCE_IMPLEMENTED`，断线不得假报解除 |
| C01 | 仅列出本地已安装 Controller Task | `SOURCE_IMPLEMENTED` |
| C02 | 未验证、停用或过期版本禁止勾选 | `SOURCE_IMPLEMENTED` |
| C03 | 多 Task 独立勾选（最多 32） | `SOURCE_IMPLEMENTED` |
| C04 | 显示已选数量和允许正文的数量 | `SOURCE_IMPLEMENTED` |
| C05 | 逐 Task 结果正文许可默认关闭 | `SOURCE_IMPLEMENTED` |
| C06 | 以可读语言展示参数约束、网站范围 | `SOURCE_IMPLEMENTED`，预览缩短主列表内容 |
| C07 | 版本与技术双 SHA / 安装代际按需折叠 | `SOURCE_IMPLEMENTED`，预览新增 Task Detail 层次 |
| C08 | 独立审批 Review、条件式正文二次确认 | `PREVIEW_ONLY`，需保持 `cloudApprove` 全固定字段 |
| C09 | 升级/重新安装/网站撤权后重新审批 | `SOURCE_IMPLEMENTED`，不静默复活 |
| D01 | 请求历史明确显示 Task 名称 | `SOURCE_IMPLEMENTED`，仅可信 Side Panel 投影 |
| D02 | 等待、准备、运行、完成、失败、取消、未知文案 | `SOURCE_IMPLEMENTED`，补充产品 UI 测试 |
| D03 | 状态回执与结果正文严格区别 | `SOURCE_IMPLEMENTED`，UI 按结果许可解释 |
| D04 | 筛选/分页及只读大页面 | `SOURCE_IMPLEMENTED` 的 `cloudObserve` 控制台，预览布局为新样式 |
| D05 | 同 Tab 内展开请求详情 | `PREVIEW_ONLY`，需决定是原控制台入口还是本页二级 View |
| D06 | OUTCOME_UNKNOWN 明确不能自动重试 | `SOURCE_IMPLEMENTED`，保留原持久结果和副作用保护 |
| D07 | 到「我的」查看原始 Run/Result 的可理解路径 | `PREVIEW_ONLY` 链接行为，禁止新建 Result DB |
| E01 | Stop 立即撤销本地 Cloud grant | `SOURCE_IMPLEMENTED` |
| E02 | Stop 的远端暂停确认 / Pending 差异 | `SOURCE_IMPLEMENTED`，原型演示离线恢复语义 |
| E03 | 托管启用时不能无确认热改授权 | `SOURCE_IMPLEMENTED`，先 Stop，再 Review 新 grant |
| E04 | Unpair 离线不得假报已完成 | `SOURCE_IMPLEMENTED`，仍需真实原生故障矩阵 |
| E05 | 重启/重复 requestKey 与未知副作用保守恢复 | `SOURCE_IMPLEMENTED`，原生可靠性 `NATIVE_PENDING` |
| F01 | 300/320/360/420/520 CSS px 无整体溢出 | **预览 Chromium 已测**，生产 `NATIVE_PENDING` |
| F02 | Chrome 真正 125% / 200% 缩放无溢出 | `NATIVE_PENDING`（CSS 模拟不等于浏览器 Zoom） |
| F03 | 键盘焦点、原位勾选与返回链路 | 原型增强；生产 `NATIVE_PENDING` |
| F04 | 语义标签、ARIA 状态通知和可读错误 | 原型具备基础；生产 `NATIVE_PENDING` |
| F05 | 不向只读观察者/Provider 泄露敏感结果 | 既有协议 `SOURCE_IMPLEMENTED`，必须拒绝性测试 |
| F06 | 同一 Host / Worker，不新建永久后台 Runner | 架构约束；真实 Chrome `NATIVE_PENDING` |

### 39 项的任务归口

- Gate UI-1：A01–A07 + B01–B05（12 项）——完成初次连接、导航、状态文案、只读刷新，保留原 Host 身份。
- Gate UI-2：C01–C09（9 项）——完成多 Task 选择、逐项隐私与审阅确认；必须有安装代际/网站授权拒绝性测试。
- Gate UI-3：D01–D07（7 项）——完成可识别的请求记录、Unknown、只读历史、已有 Run/Result 路径。
- Gate UI-4：E01–E05（5 项）——Stop/Unpair 边界、离线恢复、重启、原 requestKey 幂等和未知副作用。
- Gate UI-5：F01–F06（6 项）——响应式、键盘、色彩对比度、截图、共享构建与原生 Chrome 闭环。

## 4. 生产源码映射：避免“美观原型但功能无法实现”

| HTML 预览交互 | 生产唯一入口 / 数据流 | 注意 |
| --- | --- | --- |
| 点击「连接提供者」并确认 | `src/ui/cloud-hosting.js` → `client.cloud.cloudPair({url,providerId,pairingCode,allowLoopback})` | 预览使用演示数据，生产必须真实握手、校验 Provider ID |
| 已安装 Task 清单、固定身份及版本 | `client.request('listTaskCatalog',{})` → `projectCloudInstalledTasks` | 不能从 Provider 下发可运行 JS、不能跳过 Installer |
| 审阅并批准多个 Task | `cloudApprove({tasks:[{taskId,version,manifestHash,sourceHash,installationId,generation,siteOrigins,resultAllowed}]})` | Backend 再次 resolve 已安装 Task + Chrome Site grant，不受 HTML checkbox 单独授权 |
| 当前状态及历史样本 | `cloudStatus({limit:5})`、`projectCloudStatus`、`projectCloudRequestSamples` | 手动刷新只读；不在 UI 触发 `cloudNext` |
| 查看全部历史 | 原 `cloud-open-console` 打开受信只读 `ui/cloud-control.html` / `cloudObserve` | 是否新增同 Tab 详情是 UI 迁移决策，不要新建第二个历史数据库 |
| Stop / Unpair | 原 `cloudStop` / `cloudUnpair` | Stop 立即本地 fence，Provider suspend confirmation 可 pending；Unpair 失败保留恢复能力 |
| 任务继续执行 | 原 Worker / Controller Authority / RunHost / receipt | 预览无执行按钮，没有新的 Scheduler/RunHost |
| 外部客户端 Token / Job 状态 | Provider 的 scoped client 与 `/v1/job-status` | R5.2.4 真实 Side Panel 已新增 `cloudClients/cloudClientGrant/cloudClientRevoke` 可信 Host RPC；静态 HTML 预览不声称实现该操作，也不因此具备远程授权能力 |

## 5. 预览验收与独立评分（真实级别须分开）

此次 HTML 在隔离 Chromium 环境经 `page.set_content` 渲染（因测试容器直接导航本地 `file:` 与 `127.0.0.1` 被策略限制）：主面板 300 / 320 / 360 / 420 / 520 CSS px `scrollWidth === clientWidth`；场景包括首次配对、待授权选择、额外正文批准、正常连接、历史 Unknown、离线停止和解除配对失败关闭；运行 JS 无 `pageerror`。以上是 **HTML_PREVIEW_TESTED**，不等于真实已安装扩展。机器不会通过本文件建立生产 Provider、Chrome Run/Result 或真正互联网连接。

独立质量目标（非虚构实测评分）：布局统一、首屏可读性、授权理解、任务操作效率、中文文案、响应式、可访问性、安全隔离、功能架构复用、真实证据，各项最终目标 `≥95/100`。在没有真实 Chrome 和真实外部服务证据时，`IMPLEMENTATION_SCORE` 与 `VERIFICATION_SCORE` 一律为 `NOT_VERIFIED`；原型的设计评审分数与真实产品评分不得相加或取平均。

**正式迁移步骤**：先在对话中审阅此 HTML 与上述功能树 → 确认 Index / Connect / Manage / Review / History 的结构 → 只修改真实 `src/ui/tool.html`、`src/ui/cloud-hosting.js`、`src/ui/tool-shell.css`（R27/R28）→ 完成原契约测试 → `npm run test:cloud` + Authority/UI targeted → 同候选 `npm run check/build/build:dev/verify` → 在**独占** Chrome Profile 下进行 300–520 px / 125%、200% / 键盘和两份不同已安装 Controller Task 的真实执行验收。

R5.2 完整产品功能（Provider 多 Executor 隔离、状态-only receipt、HTTPS/WSS、失效栅栏等）仍由既有工作流作为权威；此文件专门冻结其 **Side Panel 用户体验映射**，不创建第二套执行规范和权限系统。