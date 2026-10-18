# OpenDesk Browser React UI R34.3 — 正式构建、Scheduler/Task Manager 与 Native 证据

日期：2026-10-18。唯一目标为正式安装扩展的真实业务闭环，不以离线 React 预览替代 Host。

## 代码基线和已复用成果

本轮起点 `main`：`00ebbba41b8594c81bee41b031a54e74510df516`（R34.2）。先复用：

- `src/ui/tool-shell.js` 唯一 `mountExtensionList()` → `src/ui/react/main.tsx` 一个 React 19 Root；
- `src/ui/react/tabs/schedule.tsx` 的 `SchedulePlanRows` / `ScheduleManagerRows` 仅承载可信卡片与原生点击事件，业务仍归 `src/ui/scheduled-task-workbench.js`；
- Host `listSchedules`、`saveSchedule`、`changeSchedule`、`listTaskCatalog`、`setInstalledTaskEnabled`、`getTaskCandidate`、`uninstallTask` 均调用原服务，固定 taskId/version/installationId/generation 校验保留；
- `commitScheduledMutation()` 区分已确认写入和后续刷新失败，刷新请求序号栅栏保留；`taskWorkbench.receiveDraft()` 是复制到开发的唯一导入入口。

没有另起 Scheduler、Task Registry、React Root、Host、UI Preview 或后台执行链。

## 本轮实装提交（全部 main）

| 提交 | 精确变更及原因 |
|---|---|
| `1b82492be2fe79fb1dce4f7228c7b86d45bff32a` | 审阅 SPA 导航适配变化后，仅更新 `scripts/bundle-provenance.mjs` 的 Trusted Prompt Shortcuts `page.js` 精确 Blob Pin：`9a084feb…` → `9da4a08e…`。路径白名单、symlink 和 Blob 门禁保留 |
| `19f66d5781c11c53ced14ae5e06dd5b63f298d29` | 更新 `tests/environment/prompt-shortcuts-r14.test.mjs` 的同一来源 Blob 回归断言；随后该工作流 Node 122/122 PASS，但独立的 ChatGPT SPA Chromium 按钮重定位用例失败，**不是 Scheduler** |
| `9392a82cb53441ba2bcc5fdd8984df275799c95a` | 修正 `src/ui/scheduled-task-workbench.js` 中 Host 操作结果未知的错误反馈：`E_EFFECT_UNKNOWN` 不代表保存/删除/启停/卸载未发生；已写入后 reconcile 出错也不能证明回滚。保存保留草稿且撤销旧提交意图；删除与卸载避免残留可直接重复提交的危险确认 |
| `abc7c2fca4a6e7e496fd601973464170c58809ce` | `tests/environment/scheduled-task-ui-r1.test.mjs` 定向覆盖 Host timeout、post-commit alarm 错误、代次冲突及未知结果恢复 |
| `bc9a11c0e0df7fbbc692e05fdb7596b155b62c43`、`b747464043d4d4c0341b8df17aa56df1803caf0b` | 增加原生 Chrome 测试只读标签页与命中位置诊断，修正诊断表达式的引用 |
| `674c50dadee0f68fffbddee857747435fcd5b29e` | 确认 `#schedule-open-runner` 位于默认关闭的 `.schedule-storage-details` 中：测试的点击命中 `MAIN#workspace-content` 而非按钮；真实原生测试改为先**使用真实指针展开 disclosure**再点击按钮，不绕过用户交互、不降低断言，也不改变已审阅的产品 UI |

## 已有可核验 CI 事实

- [Scheduled Tasks R1 component and package](https://github.com/shopable-ai/opendesk-browser/actions/runs/39120829229)：`abc7c2f` 的 `scheduled-components` 和 `scheduled-package` 均 SUCCESS。正式 WXT 打包门禁可通过（这不是安装/CRUD 全部 PASS）。
- [Extension package budgets and library boundaries](https://github.com/shopable-ai/opendesk-browser/actions/runs/39120787246)：`9392a82` SUCCESS。没有关闭固定源码 provenance。
- [Six-tab source-bound preview](https://github.com/shopable-ai/opendesk-browser/actions/runs/39120787152)：`9392a82` 的 `six-tab-preview` SUCCESS；构建脚本返回 640963 bytes、`inputSha256=0db8cc370943bed475972aa261523c8e31a6fcc8f57b5960fc19d03b12439361`，并通过 Chromium 预览交互。仅代表 PREVIEW。
- [真正安装的 macOS Chrome](https://github.com/shopable-ai/opendesk-browser/actions/runs/39120787276) 和 [Linux CFT](https://github.com/shopable-ai/opendesk-browser/actions/runs/39120787240) 在 `9392a82` 实测：成功建立实际 Side Panel/Host 原生上下文、完成真实 Controller Run/Result 回执、验证并安装固定任务、创建持久计划且注册真实 Chrome Alarm；随后因未展开 disclosure，测试“新运行标签页被观察到”失败。诊断显示 `buttonHitId=workspace-content`、`buttonHitContains=false`，原生指针未触发按钮。针对该根因已提交 `674c50d`；**其 native 全流程回归待以 CI 最新结果重新判定，不能沿用历史 PASS**。
- [Prompt Shortcuts scoped workflow](https://github.com/shopable-ai/opendesk-browser/actions/runs/39120246509)：固定 Blob 测试已通过，但另有 SPA Chromium fixture 超时。该文件有独立开发工作流，本轮不在 Prompt Shortcuts 业务内重复修改。
- 本轮无法使用用户的本地 `/Users/shopme/Documents/workspace/opendesk-browser` 和正在运行的 Mac Chrome；本机安装/升级测试必须明确为 `NATIVE_NOT_TESTED`。CI macOS 的真实 CFT 是另一种证据，不能冒称用户本地 Mac PASS。

## 正式执行状态（本文件创建时）

| 维度 | 状态 | 证据/限制 |
|---|---|---|
| React 唯一 Root 及 Scheduler/Task Portal | `SOURCE_WIRED` | 静态业务链审阅；未改 UI 架构 |
| 正式可打包 | `PACKAGE_PASS`（CI `abc7c2f`） | 有完整 package CI；最新 `674c50d` 只更新测试，仍应取最新 CI |
| 同源生成预览 | `SOURCE_BOUND_PASS`（CI `9392a82`） | `prototypes/sidebar/react-preview/index.html` 不在 GitHub main，需在本地/CI 按脚本生成并 `--check` |
| 真实计划 CRUD 完整 | `BLOCKED` | CI 已有计划创建和 Alarm 实证，但计划编辑/暂停恢复/删除、Run/Result 端到端尚未全部确认 |
| 真实任务管理完整 | `NOT_TESTED` | Source 接线和 Node 合同具备；缺真实安装浏览器各操作实测 |
| CI Linux/macOS Chrome 完整闭环 | `BLOCKED` | 修复了 disclosure 前置交互；最新流程尚未证实通过 |
| 用户本地 Mac 正式安装验收 | `NATIVE_NOT_TESTED` | 当前会话不能访问本地 Mac、Chrome Profile 或实时 Host |
| 输出的 HTML SHA256 | `NOT_TESTED` | 仅有 CI 来源输入 SHA256；未拿到输出原始 HTML 的准确文件 hash |

源文件与构建证据能够支持工程阶段性进展，但**目前不宣称正式业务产品 95+ 或 `REAL_SCHEDULE_RPC_PASS`、`REAL_TASK_MANAGER_PASS`**。六个独立维度（正式 React、计划功能、任务管理、错误恢复、UI、构建交付）在缺完整用户流程实证之前均记为 `NOT_SCORED`。

## 下一步最短闭环

1. 查 `674c50d` 的 Scheduled Tasks R1 原生 CI，必须完整穿越“展开 → 创建运行页 → 注册 Host → 到期执行 → 原 Run/Result → 释放”并以日志和报告为证；不能放宽断言。若失败，沿新报告继续修正确切阻塞。
2. 正式 Chrome 环境操作计划新建/编辑/暂停/恢复/删除、详情与真实历史；任务管理启停/复制到 Developer/卸载，保存草稿和关闭重开检查。至少一个成功、一个失败/结果未知恢复路径。不得自动替换不可用的固定版本。
3. 本地 Mac Codex 根据本次对话独立交付的验收提示词运行 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 与原生 Chrome 测试；维护当前 main、保护其他 Agent 的 dist/Profile/未提交文件。
4. 使用 `node scripts/preview/build-sidebar-six-react-preview.mjs` 与 `--check` 生成唯一的 `prototypes/sidebar/react-preview/index.html`，在本地取得 SHA256。只从正式 JSX/HTML/CSS 源生成，不复制旧 HTML 原型。
5. 附原生 Extension ID、安装构建 hash、CI 链接、真实 Host 回执、截图和 6 项分别有证据的评分。未验证项始终 `NOT_SCORED`。
