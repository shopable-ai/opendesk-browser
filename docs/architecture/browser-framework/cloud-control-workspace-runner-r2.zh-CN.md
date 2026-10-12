# OpenDesk Cloud Control R2：独立云控控制台、长期任务宿主与运行恢复

日期：2026-10-12。状态：**ARCHITECTURE_DECISION / IMPLEMENTATION_PENDING**。
本文件针对 Browser 产品规划，不表示独立控制台或挂机能力已经交付。上位总体协议归属 `shopable-ai/opendesk/docs/architecture/execution-control-r02.zh-CN.md`；Browser 真正的执行事实仍由原 Authority / RunHost / Worker / ChromePage / IDB 拥有。

## 一、决策：三层入口，避免七个 Side Panel 顶级页签

| 界面 | 可用环境 | 职责 | 明确不能做 |
| --- | --- | --- | --- |
| Side Panel「我的」 | 正式/开发 | 已安装 Task、上次结果、云托管摘要与停止/跳转 | 展开长期日志、承载全部云运维操作 |
| 独立「云控控制台」扩展标签页（待实现） | 正式/开发 | 配对/授权与范围、队列、运行中/等待中、历史结果、计划、Host 状态和可靠恢复 | 绕过本地 Authority、另建 Task/Run 数据库或执行器 |
| Side Panel「调试」第六页 | development，仅受限只读 | 可信诊断快照、故障定位、只读证据与脱敏导出 | 在生产公开控制、领任务、注入远端脚本或伪造回执 |

不将 Cloud Control 做成用户须安装的 `.opendesk-tool.json`，也不再增加一个 Side Panel 一级 Tab。完整控制台建议落点 `src/ui/cloud-control-console.*` + 受信 `ui/cloud-control.html`，使用现有 token 和布局原语，独立响应式，不复用 Side Panel 的窄窗口结构。

Sidebar「我的」只增加一个“打开云控控制台 ↗”操作，采用 `chrome.runtime.getURL` + 明确可信点击打开扩展内正式页面；不得让 URL query、localStorage 或普通工具获得云控管理权。正式控制台初期**只读**，通过真正的 Host 注册和经过批准的身份接口获取状态。云控管理动作在可信 RPC 做当前本机授权、配对和代次复核。

## 二、R1 当前缺口与立即修复

`src/ui/cloud-hosting.js` 当前内置 2 秒轮询；原来 `refresh()` 在读取状态后即可能 `cloudNext → cloudResolve → host.start`。**点击“核对状态”及任何用户主动读取不应该隐式领取任务**，应分离 `refresh()` 只读与 `dispatchNext()` 派发。

同一个 `tool.html` 也是完整任务目录和工具详情的新标签页；不能因为打开了这个窗口，就生成第二个会自动领取云任务的 Host。本轮将 `createCloudHosting()` 的自动轮询限制在实际 Side Panel；完整 Chrome 标签页不初始化领取驱动。该修复仅防止错误来源，不表示已经支持关闭 Sidebar 后挂机。

`cloudStatus()` 当前读取本地所有 `cloud-request-v1` 并返回全部请求，然后 UI 对最近 2000 条聚合。长期队列必须演进为受限、分页、仅字段白名单的只读聚合 API，按状态/日期/来源查询，不应无限增长单次 UI RPC、暴露结果正文或枚举所有 IDB。

## 三、云控控制台信息架构

首页：当前连接/配对状态、最近对账、正在运行、等待理由、已确认回执、设备/运行宿主状态。不要把连接在线=业务可执行。
队列：等待授权、等待 Host、等待目标、等待槽、待许可、运行中、取消处理中、结果未知、回执等待；运行中显示步骤、最近检查点、耗时及有限日志。
任务：绑定已经安装的 Task ID+version+manifestHash+sourceHash，筛选当前可批准网站/结果字段；只在本地确定身份后启用托管。禁止从服务器下发源码、任意 Shell/CDP 或静默安装。
计划：接入已有 `scheduled-tasks-r1-design.zh-CN.md` 中的 ScheduleDefinition/FireId 与 Chrome alarms；云端调度/本机调度需要唯一 source ownership 和 generation，避免重复触发。
历史：原 runId/resultId、retirement、provider receipt、取消、撤权、恢复与聚合统计，按时间分页且脱敏；UI 不伪造成功证据。
连接与设置：已配对提供者、换服务端前解除配对/明确重批、执行模式与浏览器能力说明、带时限的运行许可；生产 HTTPS/WSS，只有固定受控回环可用 HTTP/WS。
诊断：普通控制台显示人类可读的错误原因与修复操作，深层跟踪、故障注入与开发身份仅在受限 debug/CLI。

## 四、单一 Browser Executor 与“挂机”分级

| 模式 | 生效前提 | 关闭 Side Panel 后 | 关闭 Chrome / 设备睡眠时 |
| --- | --- | --- | --- |
| 临时 Side Panel Host（已有） | 已授权 Task、当前合法 Host/目标 | 不保证持续执行 | 不执行 |
| 持续浏览器运行页 Host（下一阶段） | 用户主动启用、可见且保持打开的扩展运行页、目标与权限保持有效 | 可以继续持有原 RunHost，但须真实 Chrome 验证 | 不承诺执行；恢复后先对账 |
| 本机 Native/Desktop Agent（将来可选） | 用户单独安装/配对、OS 明确授权并具备常驻能力 | 独立于 Sidebar | 取决于 OS 服务运行和休眠策略 |
| 云端 Provider | 用户批准后保存请求与调度 | 可保存请求/继续计划，不代替浏览器访问网页 | 仅排队、重排安全任务/等待端侧；不能代替已离线 Browser 操作 DOM |

核心目标：Browser 本身是独立 Executor，不应要求安装 Desktop 才能做已支持的网页任务。要获得关闭 Side Panel 仍可工作的长时间 Browser 模式，需要**明确由用户开启的可见持久运行页**以及原 RunHost 所有权，不能把 offscreen document 当作任意网页自动化/隐身运行器。Chrome 扩展 Service Worker 默认可中止；WebSocket 保活不等于执行许可或 24/7 保证。

### Host 所有权收敛

任何时刻同一个 Browser executor 的可派发 owner 至多一个（Single-Owner Lease），Side Panel、正式控制台和专属运行页不能各自轮询自动 claim。持久 `HostOwnerLease` 需要 ownerKind、registrationId、documentId、generation、leaseUntil 和 fencingEpoch，并通过现有真实 Host sender/IDB CAS 进行认领、续租与失效处理；这只是派发权，不得替代原 `runs/@slot` / Authority / Task 安装授权。

关闭运行页后记录 `WAITING_HOST`；若已发生原生副作用且终态未确认，进入 `OUTCOME_UNKNOWN` / 等待对账，不自动重新执行。用户切换控制台、换网页或重启 SW 时只读观察器不影响派发身份；显式换 owner 要进行同一原 Run 的检查/收敛，而不是简单创建第二个 Run。必须验证双窗口、旧租约迟到、重连代次竞争。

### 长时间任务类型

- 长期监控/重复执行：使用短促事件触发 + 耐久队列 + 已批准 Task，每次 Run 持久化并拥有唯一 FireId / requestId。推荐优先支持，避免单个脚本无限循环。
- 有界长 Run：运行宿主、目标文档及资源都需要保持合法有效；执行拆成可提交检查点/短步骤，持久记录部分进度，失败时复核已发生效果。
- 真正需 24/7 的任务：前置说明浏览器必须保持打开、网络可用且设备不睡眠。若要浏览器退出后执行网页自动化，需要用户明确选择其他常驻执行端；云端服务本身不会自动取得本机浏览器授权。

## 五、执行顺序与验收门槛

| 阶段 | 交付 | 禁止提前宣称完成的证据 |
| --- | --- | --- |
| P0 当前入口硬化 | 只读 refresh、不让全尺寸任务目录成为云端领取者；补 Node/回归 | 不能把 UI 改动算成原生挂机通过 |
| P1 云控原生 Gate4 | 副作用后中断恢复、运行中取消、授权撤销、真正 IDB 失败窗口、终态 reason 清理 | 不能凭旧候选取代新候选 |
| P2 独立 Cloud Console | 独立受信扩展标签页、只读分页列表/队列和安全配置；「我的」只留摘要/跳转；开发调试复用投影 | 不重做配对协议或第二套 Host |
| P3 可见运行页与持久 owner | 明确持续运行许可、单 owner/lease/fence、Host 转移、关闭 Sidebar/运行页恢复 | 不能假设 offscreen/SW 保障后台一直运行 |
| P4 定时与多端计划 | 复用既有 ScheduleDefinition、FireId、原运行结果、云 Provider 幂等与 source ownership | 不让本地/云重复触发 |
| P5 长期可靠性 | 24h/72h 受控运行、SW重启/浏览器重启/睡眠/断网/升级、成千请求分页、延迟与资源预算 | 无真实 Chrome/CFT 与原始 run/receipt 不可声明产品级 PASS |

在 Mac 真实安装的同一候选内验证 Side Panel 关闭/完整标签页打开、长任务 1h/24h、同一 Task 结果和 slot retirement、不安全重播 0、额外 Host 领任务 0；多端后台能力应按各端单独分级。任何 P0/P1 安全缺陷或关键项 NOT_TESTED 不得用加权平均专家分 95 覆盖。

## 六、持续遵守的现有约束

- 只写 `main`，不新建分支/PR/worktree，不强推、不丢并行工作，修改前读最新 HEAD/工作流与独占资源。
- 复用 `docs/architecture/ui-layout-conventions-r27.zh-CN.md` 的 4px 间距、token、可读性和宽屏排版，不让 Tailwind Preflight 进入 Side Panel 或工具沙箱。
- 保留上位唯一统一协议、原 IDB/RunHost、原 `docs/framework/workstreams/cloud-control-r1.md/json` 的证据记录与独立 Gate，不覆盖旧日志；遵循用户当前可见的实际权限。
