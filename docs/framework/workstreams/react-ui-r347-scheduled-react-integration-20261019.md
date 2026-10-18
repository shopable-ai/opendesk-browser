# R34.7 Scheduled Tasks × R35 React：业务复用审计与原生验收交接（2026-10-19）

## 执行身份与约束

- 负责人/对话：R34.7 Scheduled Tasks 业务兼容性收尾；仅检查 GitHub `main`，不创建分支、Worktree、PR。
- 起始只读 HEAD：`86be294692587c04bcdc11e446f117132475e9d5`；写入前再查 HEAD：`bdfbcb3992ad691677cda38c1f7f7b725373aea4`（提交后以 GitHub 返回 commit 和当时 main 为准）。
- R34.6 可信业务基线：`dee07a22e48b6c9de3a434025f373f49270df6eb`；其改动为 `src/ui/scheduled-task-workbench.js`、`tests/environment/scheduled-task-ui-r1.test.mjs` 与 R34.6 记录。
- 写入范围仅本工作记录。没有改动 Scheduler、Task Registry、Host、R35 React Shell、其他独立扩展或测试。没有占用用户 Mac 工作区、Git index、Chrome profile、dist/watcher、原生端口。
- 审计依据：GitHub `compare_commits(R34.6,main)`、相关正式源码与 R35.2 工作记录、GitHub Actions workflow run 的 `head_sha`、Jobs 和原始失败日志。**未执行最新 main 的本地 Node、构建和 Chrome；不能借用历史结果声称最新 package 已验收。**

## 已继承的 R34.6 业务验证（原候选 PASS）

全部七个 Actions Run 的 `head_sha` 均为 `dee07a22e48b6c9de3a434025f373f49270df6eb`，Jobs 状态 success：

| 验收 | Run | 证据级别 |
| --- | --- | --- |
| 定时组件、production/development package | [39142515284](https://github.com/shopable-ai/opendesk-browser/actions/runs/39142515284) | Node + Build + Verify |
| macOS 实装 Scheduler/Alarms/RunHost | [39142515315](https://github.com/shopable-ai/opendesk-browser/actions/runs/39142515315) | CI macOS 真 Chrome（**非用户 Mac**） |
| Linux 任务生命周期 | [39142515287](https://github.com/shopable-ai/opendesk-browser/actions/runs/39142515287) | CI Linux Chrome |
| 固定 Task 身份 | [39142515188](https://github.com/shopable-ai/opendesk-browser/actions/runs/39142515188) | CI Mac/Linux Chrome |
| 整个 Chrome 进程重启 | [39142515236](https://github.com/shopable-ai/opendesk-browser/actions/runs/39142515236) | CI Mac/Linux Chrome |
| 站点权限撤销恢复 | [39142515212](https://github.com/shopable-ai/opendesk-browser/actions/runs/39142515212) | CI Mac/Linux Chrome |
| 真实详情/表单/任务管理 | [39142515326](https://github.com/shopable-ai/opendesk-browser/actions/runs/39142515326) | CI macOS Chrome + Node |

原始 `scheduled-package` Job 日志核实：production `666427335ed32d06900a13f6985f611a8511885841b1339e4a672595ec3f015e`；development `dc6a4506f91faffc722a3e65dbd2037243b4383c181ddd00a5061bbe3959e289`。**仅为 R34.6 包身份**。

对比 R34.6 至核查时 main，四个已指定业务源文件和 `src/ui/react/tabs/schedule.tsx`、`src/ui/react/main.tsx`、`src/ui/react/app-shell.tsx`、`src/ui/tool-shell.js` 均未改变。本轮无需仅因 main 更新重复构建 Scheduler 或重写已通过的 Generation / Candidate→Registry 对账。其余构建输入已有其他工作流改动，不能套用原包哈希。

## R35 接口真实状态（REACT_INTEGRATION_PARTIAL）

- `src/ui/tool-shell.js` 仍以唯一 `createScheduledTaskWorkbench({client,host,taskWorkbench,reactUI:extensionList})` 接入，`src/ui/react/main.tsx` 使用唯一 React Root；没有发现第二套 Scheduler/Registry。
- React 已负责 `SchedulePlanRows` 与 `ScheduleManagerRows` 的卡片呈现；`renderScheduledPlanRows` / `renderScheduledManagerRows` 传回点击的业务回调。搜索/筛选仍在原业务适配层，Host RPC、固定身份及存储仍在既有链路。
- 计划创建/编辑表单、计划详情/运行历史、删除与卸载确认、管理导航尚为 `tool.html` + `scheduled-task-workbench.js` 的旧 DOM 界面。R35.2 正式记录明示 `PARTIAL / NOT RELEASED`。不可宣告五 Tab React 迁移完成。
- R35 专属源级 Chromium 曾在 [39143531665](https://github.com/shopable-ai/opendesk-browser/actions/runs/39143531665) PASS，head SHA 为 `49c3e32620c7c084369d919b59493f03c939ce85`，不是新版实装 Side Panel 验收。
- [R35.2 #39145315309](https://github.com/shopable-ai/opendesk-browser/actions/runs/39145315309)（head `4a28d479b176ab9446e64e7684c82b3205f4ad4a`）两 Job FAIL：Node App Shell 合同与浏览器源码 UI 模拟子步骤 PASS；正式 production/development 构建均在 `[opendesk-fixed-page-relay] Trusted Prompt Shortcuts source changed; review and re-pin ... trusted/page.js` 处失败，安装 Chrome 步骤被跳过。归属 Prompt Shortcuts 固定可信来源/构建链，不是 Scheduler 业务失败；不得在 R34.7 中取消指纹门禁。
- 上述 CI 失败并不能证明当前 main 的完整构建仍然失败：需要新一轮同输入、同 SHA 的构建证据；R34.7 没有实际触发构建。

### R35 最小接口交接（由 R35 实现 UI，本业务保留逻辑）

1. 当前合同复用：`renderScheduledPlanRows({plans,currentRunId,canStop,onOpen,onToggle,onEdit,onStop})` 和 `renderScheduledManagerRows({rows,emptyText,canCreatePlan,onToggle,onCopy,onCreatePlan,onUninstall})`。回调必须以可信用户交互传递固定标识，不要在 JSX 发起 Host RPC。
2. 迁移余下视图时，由现有 Workbench 提供**唯一** `view/snapshot` 投影，包括 `list/detail/form/manager/runner`、固定 Task 和 plan 身份、Generation、IANA 时区、表单字节、dirty、busy、各字段验证、确认状态、Host 错误/结果未知、历史分页与运行状态。状态来源只读，不要 React 再造 Task Registry、持久化或永久并行 Controller。
3. React 回调只向原业务适配器发送创建/编辑确认、取消/返回、暂停/恢复/删除、历史分页、任务筛选/复制/卸载等动作；保留宿主对 `E_EFFECT_UNKNOWN` 的禁止重复提交策略；确认提交但刷新失败须告知“已成功，需要重读”。
4. 关键语义：Developer 草稿取消逐字节不变，复制确认后只导入不自动运行；安装身份变化 fail-closed；禁止编辑静默换绑 Task；权限撤销必须停止；关联 Run/Result 历史保留。关闭/返回/焦点/滚动、Esc 和 320/360/400/440/960px 必须真实验收。
5. 文件归属：`src/ui/tool.html`、`src/ui/tool-shell.js`、`src/ui/react/main.tsx`、`src/ui/react/app-shell.tsx`、`src/ui/react/tabs/schedule.tsx` 属 R35；发生交叉前由其负责人协调；R34.7 不抢写。

## 功能与证据矩阵（本次新 main）

| 用户行为/保障 | 源码现状 | 最新 main 正式实装 |
| --- | --- | --- |
| once/daily/weekly/interval，CRUD、IANA 时区、URL、JSON | R34.6 业务原样、原 CI PASS | NOT_TESTED（新包） |
| Fire/Run/Result、Alarms 到期、重启/撤权恢复 | R34.6 原 CI PASS | NOT_TESTED（新包） |
| Task 搜索/筛选/启停/复制/卸载与 Generation/Registry 对账 | R34.6 业务原样、原 CI PASS | NOT_TESTED（新包） |
| React 计划/任务卡片与回调 | SOURCE_WIRED，旧源 Chromium 曾 PASS | NOT_TESTED（新包） |
| React 原生表单/详情/历史/管理 | 仍为原生 DOM，未迁移 | BLOCKED_BY_R35 |
| 最新 R35 安装级 CI | 旧 run 被其他固定来源构建阻断 | BLOCKED_BY_BUILD |
| 用户本地 Mac Side Panel、安装升级与交互 | 无本轮设备访问 | LOCAL_MAC_NOT_TESTED |

不存在经本轮新复现的 P0 Scheduler 业务缺陷，因此**没有 Scheduler 代码补丁**；这不是最新产品完整验收 PASS。六项独立 95+ 专家评分均为 `NOT_SCORED`（需要最终实际产品测试，而非估算）。

## 后续执行顺序与操作入口

1. R35/Prompt Shortcuts 各自 owner 先清除当前正式构建阻断并提交独立回执（禁止改旧 R34.6 业务逻辑以通过构建）。
2. R35 交接完成 UI 视图后，针对 React 最新变更使用 `node --test tests/environment/react-sidebar-schedule-r341.test.mjs tests/environment/scheduled-task-ui-r1.test.mjs tests/environment/scheduled-task-manager-draft-r12.test.mjs`；按影响再补 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`，不可在共享 dist watcher 写入时覆盖构建。
3. Mac Codex 只在真实 `/Users/shopme/Documents/workspace/opendesk-browser` 的 `main` 且核查当前未提交与 watcher/profile 后执行 `tests/framework/scheduled-tasks-r1-native-mac.test.mjs` 的原生 Chrome 测试；选择现有 `.github/workflows/scheduled-tasks-r1-native.yml` 与 `scheduled-tasks-r3-detail-native.yml` 的实际参数，保留原始 Run/Result、浏览器 ID、候选 packageHash、日志与截图。
4. 出现实际 FAIL：先定位业务/R35/测试失效/无关扩展，修复各自 owner 的最小源码，重跑受影响测试，不恢复废弃 DOM 假 PASS。
5. 只有满足同一当前候选包的真实 Mac Chrome 及 UI/Host/数据/重启/权限回归，才能宣布 `FINAL_PRODUCT_ACCEPTED`。目前状态 `BUSINESS_PASS_R346_EVIDENCE_REUSED / REACT_INTEGRATION_PARTIAL / LOCAL_MAC_NOT_TESTED`。

**释放**：本对话未启动任何本地 watcher、Chrome、构建或任务进程；文件写入仅本工作记录。下一执行者须重读最新 `main`，不能把记录 SHA 当未来 HEAD。
