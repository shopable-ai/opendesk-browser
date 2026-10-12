# OpenDesk Browser Scheduled Tasks R1 — 实施与证据追踪

日期：2026-10-12。工作仓库：`shopable-ai/opendesk-browser`，目标分支 `main`。该工作流与 Cloud、Time Review 等其他工作流独立保存记录；不得覆盖它们的历史证据。

## 产品目标与语义需求

让用户在 Side Panel「我的」中选择**已真实验证并安装授权**的 Controller Task，保存一次/每天/每周/间隔计划，浏览器允许并且存在合法可见 RunHost 时自动开始真实脚本。计划与运行历史在关页和重启后仍可追踪；未知页面副作用必须停止自动重试。

- 来源选择框右侧仅两个固定、可访问的图标按钮：新建脚本、管理任务；不把管理项混进下拉选项，也不增加一级 Tab。
- 创建脚本走已有开发、保存、真实验证、Available、安装与授权链，不能让未验证的 JS 定时执行；完成安装的 Host 事件可回到创建计划的表单。
- 任务管理可搜索、筛选、停用/启用、复制到开发、卸载、查看版本/站点和计划关联，并从任务卡创建定时计划。
- 独立运行页使用扩展自己的 `tool.html?scheduledRunner=1`，保留可见标签页；Side Panel/运行页都关闭时不启动，不能通过强制 Side Panel、隐藏页或 SW 保活规避 MV3。
- 定时发生的唯一 FireId 包含计划 ID、编辑代次和原始触发时点；一旦 `ADMITTED` 绑定原 `RunId/ResultId`，从此不二次启动。多个 Host 争抢仍通过既有 `runs/@slot` 原子仲裁。

## 目标源码清单

- 定时计划 Schema、DST/时区及状态：`src/platform/tasks/schedule-contract.js`、`schedule-time.js`、`schedule-repository.js`、`schedule-service.js`。
- Authority/RunHost/SW 接线：`src/platform/host/{authority,broker,controller-methods,client}.js`、`src/run-host.js`、`src/sw.js`。
- Side Panel 与独立运行页：`src/ui/{tool.html,tool-shell.js,tool-shell.css,task-workbench.js,scheduled-task-workbench.js,scheduled-task-host.js}`、`src/tool-document-url.js`、`src/ui/sidebar-tools/navigation.js`。
- 定向测试和 CI：`tests/environment/scheduled-tasks-r1.test.mjs`、`.github/workflows/scheduled-tasks-r1.yml`。
- 原型 `examples/ui/scheduled-tasks-r1-preview.html` 保留不动。

## 测试记录与证据级别

本轮通过 GitHub 连接器检查远端 `main`；会话容器无法访问用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser`，无法使用该机器上的 Chrome/Profile、既有资源租约或真实 Playwright。**绝对不能将未执行的 Mac Chrome 步骤记为 PASS。** 本轮将代码结构与纯函数试算和后续 GitHub CI、Mac 真实验收分别列出。

| 项目 | 目标验收 | 当前独立结论 |
| --- | --- | --- |
| 1. UI 视觉、320/360/420、200%、键盘 | 三宽度、缩放、可访问性实测，无阻塞弹窗 | NOT_TESTED：待真实浏览器截图和键盘证据 |
| 2. 任务选择和双图标 | 精确图标、按钮非下拉项、合法任务过滤 | SOURCE_IMPLEMENTED；真实交互 NOT_TESTED |
| 3. 任务管理完整性 | 搜索、筛选、启停、复制、卸载、版本、权限、关联计划 | SOURCE_IMPLEMENTED；真实交互 NOT_TESTED |
| 4. 新建→验证→安装→返回 | 正向真实验证回执与固定安装身份 | SOURCE_IMPLEMENTED；实际全链路 NOT_TESTED |
| 5. 时间正确性 | 四频率、IANA/DST、错过窗口 | 纯函数试算和 Node 专项测试待 CI 绑定；真实 Alarm NOT_TESTED |
| 6. 持久化/并发 | 重启保留、原子 FireId、双 Host 不能双跑 | SOURCE_IMPLEMENTED；真实竞态 NOT_TESTED |
| 7. MV3/Host 生命周期 | 关 Side Panel / 有可见运行页 / 都关闭 / 恢复 | SOURCE_IMPLEMENTED；Chrome 实测 NOT_TESTED |
| 8. 原有执行链兼容 | 共用 Authority、RunHost、@slot、Run、Result | 源码复用；Cloud / Time Review 回归 NOT_TESTED |
| 9. 权限/安全 | 固定 Task 身份、来源 URL、拒绝未验证及权限撤销 | 源码校验；实测撤权和竞争 NOT_TESTED |
| 10. 真实 Chrome 验收 | demo-form 正向原生效果、Result、资源释放及重启 | BLOCKED：本会话无法操作用户 Mac Chrome |

**逐项 95 分目标是验收门槛，不是当前声称已经达到的评分。** 当前没有原生证据的项目不给假高分，失败项保持开放。

## 在 Mac 上的最小专项验证

在检查没有并行资源占用和改动覆盖风险后，于本地仓库 `main`、本工作流独立端口/Profile 下执行：

```bash
node --test tests/environment/scheduled-tasks-r1.test.mjs
node --test tests/environment/task-package-flow.test.mjs tests/environment/task-workbench.test.mjs tests/environment/tool-ui-tab.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
```

再按 `docs/framework/testing-guide.md` 使用实际打包扩展和 `examples/tasks/demo-form.html`，完成真实安装任务的一次触发、每天/每周/间隔边界、暂停/恢复、独立可见运行页、关 Side Panel、双 Host、重启、撤权、版本变化、超时/Stop/未知回执等测试。每次原生成功需记录实际页面效果、`FireId/RunId/ResultId`、目标 Tab/Document、原 Run 状态、Result 原始存储、Worker 释放和当前包 hash；仅 Alarm 回调/Mock/静态原型不计入成功。

## 当前阻塞与交付原则

本环境不能直接读写用户 Mac 工作区，也不能占用/核对 Chrome Profile、Mac 端口或独立运行中的 Agent；在没有这些证据前，**不宣称完成“Mac Chrome Final”**。GitHub connector 可以原子直接提交远端 `main`，但必须再次确认当前 HEAD、相关文件 SHA 并且拒绝与其他 Agent 重叠的写入。后续在工作流中追加真实 CI workflow URL、日志、Git commit SHA 和结果；不要替代历史证据。
