# GOAL：OpenDesk Browser Scheduled Tasks R1 正式实施
## 按确认的 HTML 原型接入 Side Panel、完整任务管理、Chrome Alarms、原 RunHost、持久记录与 Mac Chrome 验收

日期：2026-10-12。默认中文。

目标仓库：https://github.com/shopable-ai/opendesk-browser
本地目录：/Users/shopme/Documents/workspace/opendesk-browser
**唯一允许写入的分支：main**

你担任 Chrome MV3、WXT/Vite、Side Panel UI/UX、Controller Task、Authority/RunHost、IndexedDB 事务、可靠调度、测试及 Mac Chrome 验收负责人。

**本任务明确要求直接检查、修改真实插件源码、编写测试、运行构建、修复、更新文档，并在安全条件满足后直接提交和推送远端 main。不得只输出设计、再次制作静态原型或仅提供下一份提示词。**

## 一、先核对事实与安全边界

1. 首先阅读 AGENTS.md、docs/framework/testing-guide.md、docs/framework/parallel-development.md，按仓库真实规则执行。
2. 必须先读并以此为产品基准：
   - examples/ui/scheduled-tasks-r1-preview.html（已确认交互原型）
   - docs/architecture/browser-framework/scheduled-tasks-r1-design.zh-CN.md
   - examples/ui/README.zh-CN.md
   - docs/architecture/browser-framework/plugin-capability-architecture-r8-adr.zh-CN.md（尤其 Background/Cron R8.4）
   - docs/architecture/ui-layout-conventions-r27.zh-CN.md
   - docs/architecture/sidebar-design-system-r20.zh-CN.md
3. 检查 git status、HEAD、origin/main、其它写入 Agent 对相同目录/测试资源的占用与当前最新代码。只在 main 操作；不创建分支、Worktree 或 PR，不强推、不做破坏性 reset/clean、不覆盖其他 Agent 未提交内容。存在真实并行写入冲突时说明受影响文件并停止冲突文件写入，不擅自切换工作区；不冲突任务可安全继续。
4. 首先进行差异盘点：把每项标为 ALREADY_IMPLEMENTED / PARTIAL / MISSING / NOT_TESTED，避免把已经完成的代码重做。**原型和文档提交成功不等于正式插件定时任务功能已实现**；不能把 mock、预览按钮和成功 toast 当作 Chrome Run/Result。
5. 禁止新建第二个任务数据库、执行器、Authority、Run/Result、全局槽或云调度系统；延续现有 Task v1、原 RunHost、Controller/Worker/ChromePage、runs/@slot、commandJournal、frameworkKV、Cloud Control 适配。

## 二、必须落实的真实 UI：严格遵循已确认原型

主要修改现有 src/ui/tool.html、src/ui/task-workbench.js、src/ui/tool-shell.js、src/ui/tool-shell.css；尽量复用 src/ui/script-editor.js、任务管理与安装能力。文件可按实际职责小幅增补，不把 4 万字节原型直接复制成产品 JS。

**一级选项卡保持原有「我的 / 发现 / 工作流 / 开发 / 工具」**；定时计划在「我的」内部作为管理视图，适当提供时钟图标入口。不要创建新的一级 Tab，也不要影响侧栏选项卡记忆、工具安装、云控和已有任务列表。

1. 「定时计划」真实视图：新建、查看列表、编辑、启用/暂停、删除、下次预计时间、上次实际 Run/Result、运行记录、当前等待原因、运行页状态。计划 Switch 仅表示计划启停，不用来切换源码类型。
2. **执行任务选择行：**左侧是已安装且启用、明确支持排程的任务选择器；右侧紧挨两枚等尺寸纯图标按钮——「新建脚本」(file-plus-2)、「管理任务」(list-todo 或现有对应图标)。**下拉框下方不显示「新建脚本」「管理任务」的重复文字说明。** 不在 option 内塞新建/管理入口。两按钮需 title/aria-label/可见 focus。尺寸优先遵守真实 R27 的 --od-icon-size / 36px 表单高度，不死抄原型 38px，360px 侧栏也不能溢出。
3. 新建脚本：进入已有「开发」流程，支持单文件编辑或复用现有本地项目导入。完成源码保存、真实验证、固定版本安装和权限审批后，返回原计划表单自动选中这项安装；返回时保留原来的计划名、时间、目标及参数。**未安装草稿/粘贴的任意 JS 不能直接成为定时任务**。若用户只保存草稿则显示“需验证并安装”，不能假装安装成功。开发路径需要按实际 Task v1 合同桥接，禁止直接把普通开发草稿提升为可信 Task。
4. 管理任务：点击右侧管理图标打开可见的「我的 → 任务管理」内部视图，包含搜索、全部/已启用/已停用筛选、任务版本与授权网站、关联计划数量、真实启停、设置定时、复制到开发、真实卸载。复用当前 task-workbench 管理 API 与已有完整任务目录，不建立第二套安装/版本数据。卸载采用页面内明确确认，不调用 window.confirm/alert/prompt。被停用、卸载或改权的任务，不再作为新计划可执行来源；已存在计划显示「需要处理」并停止派发，历史不删除。
5. 创建/编辑表单：计划名称、任务与固定版本、任务参数、执行一次/每天/每周/间隔、IANA 时区、可读的下次预计时间、固定 HTTP(S) 目标 URL（必须落在批准网站范围），可选“未找到页面时允许新开本次自有标签页”；高级折叠错过处理/执行等待。默认等待上限 5 分钟，默认错过跳过，可选只补最近一次且在 1 小时内。编辑已暂停计划不能默默重新启用；暂停计划与“停止本次 Run”是两个不同操作。
6. 状态明示：已启用、已暂停、等待宿主、等待目标、执行槽占用、运行中、成功、失败、需要处理、已错过、未知结果等；不仅靠颜色区分。隐藏高级诊断，首屏紧凑、无多余说明和原生弹窗。
7. 必须遵守设计 tokens 和 R27/R20：od-page/od-toolbar/od-stack/od-surface/od-field/od-icon-button；不引入 Side Panel Tailwind Preflight，避免 CSS 覆盖工具沙箱与页面脚本。检查 320/360/420px、200% 缩放、键盘、焦点与长中文。

## 三、持久计划、到期计算与可靠调度

**首版范围：已安装并授权的 Controller Task v1。** Page USER_SCRIPT 的文档自动运行、第三方工具自带 UI 的持续挂载，不应误认为同一类定时执行；后续分期接入，不以首版没做全部 runtimeKind 为由重做架构。

1. 在既有 frameworkKV 内，以带版本的命名空间保存 ScheduleDefinition：scheduleId、generation、installationId、taskId/version、sourceHash/manifestHash、params、已批准精确网站、timezone、triggerKind/spec、nextDueAt、paused、misfirePolicy、startDeadline、timestamps。若已有等价存储接口，直接复用。新类型必须校验字段并有 CAS、序列化和容量上限；无需另建 IndexedDB。
2. 四种重复方式提供确定性 occurrence 生成，UTC 内部时点 + IANA 时区。每日/每周按本地日历，明确 DST gap/fold；间隔任务需固定 anchor，不能因每次 SW 醒来而漂移。提供 fake clock、跨天、夏令时、时间跳跃、闰年、时区变更测试。
3. Chrome alarms 只是持久计划的唤醒提示。创建专用命名空间的到期 alarm（可有必要的低频对账），不得调用 clearAll，不能清除现有 Cloud Control/Time Review 的 alarm。Chrome 最低版本 138，不能无条件传入 Chrome 150+ 的 persistAcrossSessions；启动/更新/计划编辑/恢复后重读持久期望状态并对账。闹钟可延迟、休眠不会唤醒电脑，不承诺秒级或浏览器关闭后后台执行。
4. 每次 occurrence 固定 fireId = (scheduleId,generation,scheduledAt) 的稳定摘要/键。事务记录 due/wait/claim/run linkage，保证一次发生不会因 alarm 重入、SW 重启、双窗口 RunHost 或 host registration 更换而重复准入。**不能仅使用 host.registrationId + requestId 作为唯一跨宿主去重键**。在原 Authority/Controller 准入时以可信 FireId 和持久 ScheduleDefinition 做原子版本/授权校验及绑定；外部 UI/不可信消息不能自行伪造 FireId 得到额外执行权限。
5. 运行前检查已安装且启用的 task、固定 revision/hash、参数 schema、真实 Chrome 网站权限、目标文档/导航代次和原全局 runs/@slot。若缺运行条件，记录明确 WAITING_HOST / WAITING_TARGET / WAITING_SLOT 等状态。到达开始截止时间后持久标记 SKIPPED/MISSED，不能无限排队。单计划与全局槽均禁止重叠执行；已退休释放后才允许下一轮。
6. 缺失结果或存在已派发副作用时保留 UNKNOWN / EFFECT_UNKNOWN，禁止盲重放 POST、点击、下载、创建标签等操作；本地 CAS 最多准入一次不代表外部副作用 exactly-once。成功必须绑定原 runId/resultId 和 retirement released 后呈现。暂停/删除不得撤销已经产生的网页副作用。
7. 如果现有 controllerMethods/startControllerRun 只接受手工或 cloudRequestId，按现有 Authority 合同加**最小受控本机 scheduledFireId 适配**：复用原保存资产、原 Worker、Stop、Run、Result 和持久 retire，不能开发并行的 scheduled-runner 引擎，也不能复制整个 cloud permit 机制。

## 四、真正可用的浏览器执行宿主

- SW 只负责调度/权威准入/短操作，不能执行需要页面 DOM 的用户代码，也不能假设 MV3 SW 常驻。
- 复用现有 ui/tool.html 和 createRunHost/createHostClient 的受信扩展文档；有现存 Side Panel 或合法独立运行页时，从该 Host 领取到期任务，调用原正式任务运行链。
- 首次启用时允许用户主动打开/复用一个可见的 OpenDesk 运行页。关闭 Side Panel 但合法运行页仍存在时，定时任务可以工作；关闭/冻结/丢弃唯一 Host 时记录等待并提供「打开运行页」而非伪造 sender、强制打开 Side Panel、创建隐藏常驻页或自动无限 keep-alive。
- 同时打开多个 Host 不得重复启动，同一 @slot 与人工/云任务竞争必须有明确等待与截止。Host 关闭后的 run 依赖既有 fenced recovery，不得因重连就重跑未知副作用。
- **首版验收不能只证明 alarms.onAlarm 已触发；必须证明定时实例真实执行了已安装 Controller Task，并产生可核对的原 Run/Result。**

## 五、测试、构建、真实 Chrome 与证据

优先新增 tests/environment/scheduled-task-*.test.mjs（实际路径按现有 tests 结构），覆盖：
- 计划 schema/CAS、增删改/暂停和持久恢复；
- interval/once/daily/weekly、DST、过期/有限补跑、原型与正式 UI 表单的 nextDue 规则一致性；
- 同一 FireId 并发、重复 alarm、SW 重启、多 Host、宿主关闭、版本更新与卸载、权限撤销；
- @slot 与云任务/人工任务竞争、无合法目标、导航变化、host 不存在、结果 UNKNOWN 禁止重试；
- 源码进入「开发」→真正安装→返回计划自动选择；管理按钮真入口、禁用来源过滤、无弹窗卸载、表单草稿保留；
- 原型两枚 icon-only 按钮且**没有下方重复文案**；Side Panel 320/360/420px、200% 缩放。

本地按 testing-guide 复用跨对话已存在的测试证据；执行必要定向测试后做 npm run check、npm run build、npm run build:dev、npm run verify 和受影响的包预算/安全检查。请检查 scripts/build-contract.mjs 的实际体积政策：生产 SW 1 MiB 硬限、512 KiB 提醒线，不能为过检直接增大预算、弱化 CSP 或取消固定入口扫描。

真实 Chrome/CFT 请使用本仓库规定的 HTTP 演示页：
- 在本地运行 python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
- 访问 http://127.0.0.1:43111/demo-form.html
- 安装合法 Task v1，设定短周期，验证 alarm→原 RunHost→真实网页动作→Run/Result→retirement；
- 对比 Side Panel 打开/关闭、独立运行页保留、完全无 Host、Chrome 重启、权限撤销、计划暂停与恢复、未知结果。

不可伪造 Chrome Native PASS。若环境不能完成 Native 测试，保留源码与组件证据，记录 NOT_TESTED/BLOCKED、真实失败原因，并附可交给 Mac 本地 Codex 的精准验收提示词。

## 六、逐项独立质量评分（不得用综合平均值掩盖遗漏）

每一维独立要求设计与实现评审目标 **≥95/100**，但实际结论必须依赖可定位的代码和测试证据，未验证项目不得虚填 95：

1. 任务选择与双图标 UI；
2. 管理页面完整性与入口可发现性；
3. 新建脚本→验证安装→返回自动选中闭环；
4. 响应式/可访问性/无弹窗；
5. 计划类型、时区与下一次时间计算；
6. 持久事务/去重/并发；
7. Chrome MV3 唤醒与宿主生命周期；
8. 原 Task/RunHost/Authority/Result 兼容性；
9. 网站范围/安装身份/权限安全；
10. Chrome 原生端到端与安装包/构建合规。

逐项标注 SOURCE_IMPLEMENTED、COMPONENT_TESTED、BUILD_VERIFIED、CHROME_NATIVE_VERIFIED、NOT_TESTED/BLOCKED，附文件/命令/回执；任何核心 P0 未验证都不得宣布“功能全面完成”。

## 七、输出与交付

实际改动直接在 main，提交前复查 git diff/status、非本任务改动、最新 origin/main；确认安全后提交并推送远端 main，不创建分支/Worktree/PR、不强推、不覆盖并行工作。

将进度与真实证据写入 docs/framework/workstreams/scheduled-tasks-r1-20261012.md，并更新 docs/architecture/browser-framework/scheduled-tasks-r1-design.zh-CN.md 和用户使用说明。保留原始 HTML 作为视觉/行为基准，不把它当正式包入口。

最终报告必须包括：真实修改文件、功能状态、可点击产品入口、已执行测试及原始证据、每项独立评分及 BLOCKED、main 提交 SHA/推送状态、尚未完成的具体问题，以及用户如何在 Chrome 中创建第一个真实的定时任务。

**立即开始执行，不要重新只写方案。**
