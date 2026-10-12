# OpenDesk Browser · 定时计划 R1：产品交互与调度设计

> 2026-10-12。状态：**DESIGN / INTERACTIVE_PREVIEW_COMMITTED**；尚未接入正式调度器、权限执行链，也没有真实 Chrome 验收。
> 主分支预览： [examples/ui/scheduled-tasks-r1-preview.html](../../../examples/ui/scheduled-tasks-r1-preview.html)。

## 1. 任务来源：采用下拉框 + 独立新建与管理入口

- **选择已有：**下拉列表仅包含已安装、拥有固定版本和可用执行能力的任务；展示名称及版本，选择后显示授权网站、任务类型等只读信息。
- **＋ 新建脚本：**放在下拉框右侧。进入现有「开发」路径，支持编辑代码/导入项目；保存草稿、执行验证、安装授权后返回计划表单并选中新任务。未验证源码不能直接定时运行。
- **管理任务与脚本 ↗：**位于选择框下方，与表单输入区分开；进入已有「我的任务」及「开发」入口，查看已安装版本/复制草稿/管理任务，不在下拉选项中混入管理命令。
- 不增加用来切换任务来源的 Switch。Switch 只用于启停已有计划，避免把开关语义混成任务类型选择。
- 任务数量增多后可以增加搜索式选择器，但保持「新增」「管理」独立；不把导入脚本文件作为下拉选项。
- 原型中的「模拟验证并安装」只更新原型页面内存，不触发真实浏览器脚本、不保存源码，也不证明验证通过。

## 2. 正式产品入口

Side Panel 保留「我的 / 发现 / 工作流 / 开发 / 工具」现有一级 Tab，不为定时增加新的一级 Tab。

- 「我的」提供定时计划入口（时钟图标或二级导航），可查看全部计划及其状态。
- 已安装任务详情提供「定时运行」动作，自动带入该任务、版本、授权范围与参数。
- 开发页面完成保存/验证/安装后支持「设置定时」回到计划表单。
- 可排程工具动作需要声明类型化可执行入口；纯 UI 工具不得把整个挂载程序重复定时注入网页。

## 3. 计划表单与默认值

- **执行哪个任务：**计划名称、已安装任务选择、新建脚本入口、管理入口和固定版本摘要。
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

- 已实现（设计级）：可交互离线 HTML 原型，带已安装任务下拉、右侧新建脚本入口、独立管理入口、脚本演示后返回自动选中、时间和网站范围表单、启停、模拟运行与记录。
- 尚未实现（产品级）：扩展正式计划管理、持久定义、闹钟派发、真实脚本执行与 Chrome 原生验收。**不得把原型操作称为产品功能完成。**

参考已有设计：[R8 ADR](plugin-capability-architecture-r8-adr.zh-CN.md)、[Cloud Control R1](cloud-control-r1.zh-CN.md)、[UI 原型索引](../../../examples/ui/README.zh-CN.md)。真实代码归属：src/ui/task-workbench.js、src/ui/script-editor.js、src/platform/tasks/contract.js、src/platform/host/controller-methods.js、src/platform/storage/idb.js。
