# OpenDesk Browser · 定时计划 R1：产品交互与调度设计

> 2026-10-12。状态：**LINUX_CFT_BASELINE_LIFECYCLE_PASS / MACOS_CFT_BASELINE_PASS / USER_MAC_F3_NOT_TESTED**。固定源码 `7bd735259379` 的真实 Linux CFT 双宿主、无宿主恢复与真实 macOS CFT 基础定时闭环均有原 Run/Result 和页面原生效果证据；整 Chrome 重启、撤权、完整缩放与用户 Mac 验收未通过最终闸门。
> 主分支预览： [examples/ui/scheduled-tasks-r1-preview.html](../../../examples/ui/scheduled-tasks-r1-preview.html)。

## 1. 任务来源：采用下拉框 + 右侧两个等尺寸图标按钮

- **选择已有：**下拉列表仅包含已安装、拥有固定版本和可用执行能力的任务；展示名称及版本，选择后显示授权网站、任务类型等只读信息。
- **图标 ① 新建脚本（文档＋）：**放在下拉框右侧，与管理按钮同为 38×38px（窄侧栏可缩至 36×36px），aria-label「新建脚本」、title「新建脚本 · 打开开发编辑器」。进入现有「开发」路径，支持编辑代码/导入项目；保存草稿、执行验证、安装授权后返回计划表单并选中新任务。未验证源码不能直接定时运行。
- **图标 ② 管理任务（清单勾选）：**紧挨「新建脚本」图标，aria-label「管理已安装任务」、title「管理任务 · 查看、停用、复制编辑或卸载」。点击打开「我的 → 任务管理 / 已安装任务」专属管理视图；不在下拉选项中混入创建/管理命令。不会额外增加一级 Tab。
- **一行三列：**Select 弹性占余宽 + 两枚固定宽度 icon button；**选择框下方不显示「新建脚本」「管理任务」等重复说明文字**。通过按钮自身的 title / aria-label 解释含义。即使 Side Panel 约 360px，也要保持同一行、文本省略而非按钮掉行。
- 不增加用来切换任务来源的 Switch。Switch 只用于启停已有计划，避免把开关语义混成任务类型选择。
- 任务数量增多后可以增加搜索式选择器，但保持「新增」「管理」独立；不把导入脚本文件作为下拉选项。
- 管理视图需提供搜索、全部/已启用/已停用筛选、启停 Switch、版本和网站/关联计划详情、「设置定时」「复制到开发」「卸载」；卸载采用页面内明确确认区域，不使用原生 confirm/alert。
- 当前安装版本不可直接覆盖编辑。「复制到开发」只复制源码到现有编辑器，保存/验证/安装新版本之后才允许新计划选择，不默默改变既有计划引用。
- 从计划表单进入管理视图并返回，保持原有计划名称、时间、网页参数。任务被停用/卸载后，来源选择器不再把它当作可运行项，原计划保留并显示「需要处理」，而不是静默继续执行。
- 原型中的「模拟验证并安装」只更新原型页面内存，不触发真实浏览器脚本、不保存源码，也不证明验证通过。

## 2. 正式产品入口

Side Panel 保留「我的 / 发现 / 工作流 / 开发 / 工具」现有一级 Tab，不为定时增加新的一级 Tab。

- 「我的」提供定时计划入口（时钟图标或二级导航），可查看全部计划及其状态。
- 已安装任务详情提供「定时运行」动作，自动带入该任务、版本、授权范围与参数。
- 开发页面完成保存/验证/安装后支持「设置定时」回到计划表单。
- 可排程工具动作需要声明类型化可执行入口；纯 UI 工具不得把整个挂载程序重复定时注入网页。

## 3. 计划表单与默认值

- **执行哪个任务：**计划名称、已安装任务选择、一行内两个图标入口（新建/管理）和固定版本摘要。
- **什么时候运行：**一次、每天、每周、每隔一段时间，按用户本机 IANA 时区保存；预览可给出下一次时间。真实算法必须处理 DST gap/fold 与设备时区变化。
- **在哪里运行：**输入精确 HTTP(S) URL，必须属于任务已经批准的网站 origin；不能在到点时默默切换到当前活动标签。
- 默认先使用已打开且明确符合条件的网页；只有用户勾选「允许自动打开目标网页」时才创建由本次任务管理的标签页。
- **高级选项：**默认等待执行条件最长 5 分钟；错过默认跳过，可选在恢复后 1 小时内只补最近一次。准点闹钟实际延迟不应误判为错过。并发上限沿用现有唯一执行槽。
- 计划暂停只拦截未来和未开始的触发；已启动原 Run 独立提供「停止本次」。恢复计划不补暂停期间错过的时间；删除计划保留历史引用。
- 无需每次重复确认弹窗；计划创建是一次持续授权意图，执行时仍必须重新检查真实权限、网站及安装版本。

## 4. 技术架构：复用而非重建

推荐唯一数据与执行链：

    已安装 Task 与不可变 Source Revision
        └─ ScheduleDefinition（既有 frameworkKV 命名空间）
            └─ Chrome alarms（短促唤醒、启动与更新时重建）
                └─ FireId／到期时间／开始截止时间（原 IDB 事务 CAS）
                    └─ 既有 Authority、RunHost、Worker、ChromePage
                        └─ 既有 runs/@slot、commandJournal、Run、Result、retirement

- 不建立新的 Run/Result DB、权限中心、第二套执行器或云控调度器。
- ScheduleDefinition 应冻结 scheduleId、generation、安装身份、taskId/version、manifestHash、sourceHash、参数摘要、IANA timezone、triggerKind/triggerSpec、nextDueAt、paused、targetUrl、openIfMissing、misfirePolicy 和 timestamps。
- FireId 由 scheduleId + generation + 原计划发生时点确定，发生记录与 Run 准入之间需要幂等的持久绑定。Host 通知只是提示，不构成授权或已执行证明。
- SW 不运行任意持久用户 JS；Chrome alarms 并不保证绝对准时，也不能在关闭浏览器时继续执行。SW/扩展启动与更新时从持久记录对账恢复，不清除云控或 Time Review 所拥有的闹钟。
- 用户已打开的 Side Panel 和已授权的独立扩展运行页都可以沿用原 RunHost；没有合法宿主时记录 WAITING_HOST 和明确提示「打开运行页」，不得伪造 sender、强行打开 Side Panel、创建隐蔽的常驻运行器。
- 同一触发如果已发出不可确定副作用而回执丢失，状态必须是 UNKNOWN，不自动重试 POST/点击/创建等操作；成功需要绑定原 Result 和资源释放回执。
- 浏览器本机调度不依赖 Desktop、Native Agent 或云 Provider；将来启用跨端云托管时，需要显式切换计划触发来源与代次，避免本机与云端重复派发。

## 5. 分期实施与正式验收

### R1 · 本机 Controller Task

实现：已安装任务过滤、创建/修改/暂停计划、时间及目标规则、durable FireId 与 alarms、真实 Host 派发、原运行结果展示和错过/恢复策略。

验收：一次/每天/每周/间隔、DST、延迟触发、SW/浏览器重启、重复 alarm、多 Host、原执行槽占用、关闭侧栏、运行页关闭/恢复、网站变更、权限撤销、版本更新、未知效果、停止与最终资源释放。须在真实 Chrome/CFT 中提供同一候选 SHA 的证据；不允许只用 mock 或构建成功代替。

### R2 · Page Script 与 Tool Action

提供类型专属的可排程动作，分别验证页面重复注入、文档身份、卸载和撤权语义。不把 Controller Run 的测试结果挪用作 PageScript 证明。

### R3 · 桌面与云托管

复用 Desktop 已有调度以及 Cloud Control Provider 及 Browser/Desktop/Mobile 独立 Executor；明确触发所有权、执行前提和迁移后无重放。

## 6. 当前交付边界

- 已实现（设计级）：可交互离线 HTML 原型，带已安装任务下拉、右侧两枚 icon-only 按钮、可进入的任务管理页面（搜索/筛选/启停/复制编辑/卸载确认/关联计划）、新建脚本演示后返回自动选中、表单草稿保留、时间和网站范围表单、计划启停、模拟运行与记录。
- 尚未实现（产品级）：扩展正式计划管理、持久定义、闹钟派发、真实脚本执行与 Chrome 原生验收。**不得把原型操作称为产品功能完成。**

参考已有设计：[R8 ADR](plugin-capability-architecture-r8-adr.zh-CN.md)、[Cloud Control R1](cloud-control-r1.zh-CN.md)、[UI 原型索引](../../../examples/ui/README.zh-CN.md)。真实代码归属：src/ui/task-workbench.js、src/ui/script-editor.js、src/platform/tasks/contract.js、src/platform/host/controller-methods.js、src/platform/storage/idb.js。

## 7. R1 交互审计与逐项完成门槛（2026-10-12）

评分指 **原型设计评审目标**，不是产品上线验收分数。不可用综合分掩盖任一项目未通过的情况。每项都必须有功能证据且不低于 95 分才可把原型设计冻结；实际插件还有独立的 Chrome Native 验收门槛。

| 项目 | 设计目标 | 原型证据 | 正式产品状态 |
|---|---:|---|---|
| 任务来源选择的可理解性 | ≥95 | 下拉仅列可用任务，旁边新建/管理两图标各有 title、aria-label，帮助文字保留 | NOT_IMPLEMENTED |
| 管理页面可发现性与深链 | ≥95 | 右侧管理图标直达「我的 → 任务管理」，不是下拉选项；「我的任务」左侧入口也直达同页面 | NOT_IMPLEMENTED |
| 管理功能覆盖与版本安全 | ≥95 | 搜索/启停/复制到开发/计划创建/网站和关联计划/卸载确认；源版本不可原地修改 | NOT_IMPLEMENTED |
| 新建脚本与返回状态 | ≥95 | 新建→模拟验证安装→原计划自动选中；从管理复制→开发→返回管理；返回时保留表单输入 | NOT_IMPLEMENTED |
| 禁用/卸载后的执行阻断 | ≥95 | 下拉排除禁用任务；既有计划明确提示「需要处理」，演示运行不可点击；不静默换目标 | NOT_IMPLEMENTED |
| 计划暂停/编辑语义 | ≥95 | 编辑暂停计划不会隐式启用；计划暂停不等同于停止正在执行的 Run | NOT_IMPLEMENTED |
| 触控/键盘/缩放响应 | ≥95 | 固定尺寸图标、可见 focus、侧栏模式及窄宽媒体查询；**仍需真实 Chromium/200% native 视觉核查** | NOT_TESTED |
| 调度数据一致性与可靠性 | ≥95 | 仅架构约束，未有正式任务派发 | NOT_IMPLEMENTED |
| 安全授权与原生执行 | ≥95 | 明确不得从原型模拟晋升真实结果或越过 Authority | NOT_TESTED |

**交互模拟回归**已覆盖：初始列表、从计划进入管理/返回保留草稿、新建模拟安装后自动选择、管理搜索筛选、任务停用使计划待修复、重新启用并新建计划、编辑暂停计划后仍暂停、无弹窗卸载及孤儿计划提示、从管理复制脚本到开发并返回管理。JavaScript 语法、DOM ID 唯一性和静态 ID 引用检查通过。所有模拟测试只能证明离线原型交互，不证明真实 Chrome 产品完成。

### 正式代码映射和未解决缺口

- 当前真实「我的任务」：src/ui/tool.html 的 workbench-tasks 区域、src/ui/task-workbench.js；任务启停/卸载在「更多操作 → 任务管理」里。
- 真正的源码编辑：现有「开发」Tab 和 src/ui/script-editor.js；导入/安装任务从「我的」/完整任务目录进入。
- 新的「我的 → 任务管理」图标直达视图、从开发返回计划的身份绑定与排程都还 **未写入正式 src/ui 页面**。
- 创建后立即可排程仍需冻结已安装 Task 的安装身份、版本/源哈希/参数/网站，并在原 Authority 持久 CAS 核验，不因为模拟下拉可选就宣称任务已获批准。


---

## R1 源码接线记录（2026-10-12，候选待 Chrome 验收）

本节是对原 R1 设计的**增量实现说明**；保留上文设计、原型和安全边界。**源码写入或组件验证不等于 Mac Chrome 真实定时执行已经通过。**

### 模块与执行链

- `src/platform/tasks/schedule-time.js`：once / daily / weekly / interval 及 IANA 时区规则；春季 DST 跳时落在第一个存在的当地分钟，秋季重复时间只取较早一次；重复补跑有一小时上界。
- `src/platform/tasks/schedule-contract.js`：封闭输入 Schema、FireId、精确 HTTP(S) 目标 URL、安全时间上限。
- `src/platform/tasks/schedule-repository.js`：直接复用 `frameworkKV` 保存计划定义和发生实例；CAS 代次、防重复 FireId、运行关联与状态；用 `runs`/ResultId 回显原有执行证据，不创建第二套结果库。
- `src/platform/tasks/schedule-service.js`：受 Run Authority Host 认证的固定 RPC、Chrome Alarms 精确名字空间对账、启动恢复、到期唤醒。Chrome Alarm **不是脚本完成回执**。
- `src/platform/host/controller-methods.js`：`scheduledFireId` 在 Controller admission 的**同一 IndexedDB 原子事务**校验；再次核对安装版本、来源 Hash、网站、参数与 Task 授权，随后复用原 `runs/@slot`、Run、Result 及原 Worker。第二个 Host 不能再次领取已经 ADMITTED 的同一 FireId。
- `src/ui/scheduled-task-host.js`：只有可见的 `tool.html` 注册宿主才会执行定时任务；可复用仍有效的精确 URL 页面，或仅在用户明确允许时创建 owned 目标。Side Panel 关闭且用户保留独立运行页时可继续处理；两个 Host 仍由 Authority/slot 去重。
- `src/ui/scheduled-task-workbench.js`：在「我的」内置计划列表、创建/编辑/暂停/恢复/删除、历史状态、任务管理、双图标按钮，以及保存源码后安装回跳。

页面地址 `ui/tool.html?scheduledRunner=1` 是用户主动打开的**可见运行页**，不是隐藏页面、离屏常驻或独立第二执行器。真实 URL 身份仍需经过 `toolDocumentIdentity` 和宿主注册；不得公开通配来源或由网页自行调用。页面关闭则不执行，持久记录等待合法宿主，错过窗口按规则处理，不重试未知页面副作用。

### 状态边界

- `READY` / `WAITING_HOST` / `WAITING_TARGET` / `WAITING_SLOT`：只有尚未领取且在截止时间内的发生实例才可再次尝试**准入**。
- `ADMITTED`：已有原 RunId/ResultId；不再次执行，等待原有运行历史表明完成/失败/已释放或未知。
- `UNKNOWN` / `NEEDS_ATTENTION` / `MISSED` / `CANCELLED`：停机或异常时保持证据、避免盲目重放。授权撤销或版本更新不会自动提升旧计划的权限。
- 删除计划不能抹掉原有 Run/Result 历史，暂停和编辑会递增代次并拒绝旧 FireId 的新准入。

### 测试可信度和限制

`tests/environment/scheduled-tasks-r1.test.mjs` 提供时区、DST、重复触发、CAS 和状态的 Node 组件证据；`.github/workflows/scheduled-tasks-r1.yml` 负责源码检查、回归、双构建和包校验。**这些都不能替代真实 Mac Chrome 验收。**

需用 `examples/tasks/demo-form.html` 和真实已验证/安装的 Controller Task 核对 Side Panel 运行、关闭侧栏/运行页继续、运行页关闭后等待、双 Host、浏览器重启、目标页变化、撤权、版本更替、Stop、超时、Durable Result 和资源释放。证据必须包含 RunId、ResultId、FireId、实际目标 DocumentId 与当前包 Hash，按测试指南独立记录。

注意：用户预览原型不是生产组件测试，也不能直接作为真实 Chrome 成功证据。


## 7. R1 源码实现落点与可信等级（2026-10-12）

此节是对上文设计的实施说明；前文静态原型状态只用于产品交互依据，不可提升为正式 Chrome PASS。

- 定义与触发：`src/platform/tasks/schedule-contract.js` 严格限制字段、网站、大小和安装身份；`schedule-time.js` 使用 IANA `Intl.DateTimeFormat` 转换当地日历为 UTC，DST 空白时间前进到第一个有效分钟、重复时间只选较早一次；`schedule-repository.js` 将至多 128 个活动计划保存到**原有** `frameworkKV`，以 `scheduleId + generation + scheduledAt` 组成持久 FireId。
- 闹钟：`schedule-service.js` 与 `src/sw.js` 只管理 `opendesk.schedule.v1:` 前缀；每次启动/重启、计划变更和闹钟事件都以持久计划为准进行对账，不调用 `clearAll`，不使用 Chrome 150+ 参数。
- 权威准入：`controller-methods.js` 原子事务中先经安装版本和精确网站校验，再核实 FireId、固定哈希、参数、来源安装身份、预期 URL 和截止时点，写入 Fire 的 `runId/resultId` 并保持原来的 `runs/@slot`、`commandJournal`、Controller Worker 和 retirement。**不能因为定时实例存在就直接执行。**
- Host：`src/ui/scheduled-task-host.js` 只在已打开的 `ui/tool.html` 受信扩展文档中领到期任务；Side Panel 和 `?scheduledRunner=1` 的独立可见标签均复用同一个 `scriptEditor.host`；关闭所有页面只保留等待记录。宿主每 15 秒轮询，SW 的 Port 提示可提前触发。无后台常驻任务或强开 Side Panel。
- UI：`src/ui/scheduled-task-workbench.js` 负责「我的」内部计划、表单、双图标与管理页，任务数据复用 `listTaskCatalog`、`resolveInstalledTask`、`getTaskCandidate`、`setInstalledTaskEnabled`、`uninstallTask`；开发与真实安装仍按旧 Task v1 验证流程，不以任意源码直接排程。
- 结果：持久 Fire 的 `ADMITTED` 状态只意味着获得唯一 Run 准入，不意味着网页副作用成功；列表始终从原 `runs` 查询 state、`resultId` 和 `retirementState`，若存在未知副作用则保持 `UNKNOWN`，决不盲目重派。

**已取得的原生证明：** Linux Chrome 的完整基础与双 Host / 无 Host 恢复，以及 Mac Chrome 的基础真实页面执行，均有固定候选 GitHub Actions 证据；剩余是用户 Mac Profile、真实完整浏览器重启/升级、版本和权限变更、Mac 双 Host、320/360/420 与真实 200% 视觉验收，缺证据部分仍为 `NOT_TESTED`。追踪见 `docs/framework/workstreams/scheduled-tasks-r1-20261012.md`。
