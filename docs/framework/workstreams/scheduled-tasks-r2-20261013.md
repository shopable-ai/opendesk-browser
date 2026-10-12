# OpenDesk Browser Scheduled Tasks R2 · 产品化与验收记录

日期：2026-10-13。目标仓库 `shopable-ai/opendesk-browser`，唯一写入分支 `main`。

> 本文件是 R2 增量追踪，不取代 R1 历史证据。GitHub Actions 的某个过去 SHA PASS 不等于未来候选或用户真实 Mac Profile PASS。仓库可以经 GitHub 连接器操作，本会话无法访问用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser` 目录。

## 继承的 R1 可信候选

- 固定 SHA `7bd735259379478200b896223ecd5212b72ee163`
- Linux CFT baseline + lifecycle PASS：[38269870084](https://github.com/shopable-ai/opendesk-browser/actions/runs/38269870084)
- macOS CFT baseline PASS：[38269870147](https://github.com/shopable-ai/opendesk-browser/actions/runs/38269870147)
- 两个可见 Host 同 FireId 唯一领取、无 Host 进入 WAITING_HOST、重新打开 Side Panel 执行原 FireId、原 Run/Result 实际 DOM 效果与 `retirementState=released` 是已有真实证据。用户 Mac Profile 仍 NOT_TESTED。

## R2 任务树和提交

| 优先级 | 功能 | SHA | 源码/验收状态 |
| --- | --- | --- | --- |
| P0 | 独立运行页运行概览、中文优先、RunId 高级详情、现有侧栏不新增 Tab | `db579429` | SOURCE_IMPLEMENTED；Linux/macOS CFT baseline PASS，Linux lifecycle PASS |
| P0 | 已安装版本权限状态、URL/JSON/时间内联错误、固定版本保存前确认 | `e5b7c261` | SOURCE_IMPLEMENTED；Linux/macOS CFT PASS；新增组件测试曾有错误 |
| P0 | 修正组件断言、编辑过程防止异步竞态、表单取消浏览器原生校验提示 | `eff2406e` | SOURCE_IMPLEMENTED；组件/package + Linux/macOS CFT PASS |
| P1 | IDB 前缀游标、每计划初始最近20条、受鉴权历史分页 API | `7d64df4b` | SOURCE_IMPLEMENTED |
| P1 | 历史按需加载、135 条 Fire 定向回归和 API UI 合同 | `f75fddf3` | SOURCE_IMPLEMENTED；组件/package + Linux/macOS CFT PASS |
| P1 | 完整 Chrome 关闭及受控同一 Profile 重启原生测试入口 | `6d7957ba` | TEST_IMPLEMENTED；测试通过前不得写 PASS |
| P1 | UNKNOWN、副作用防重放、授权身份及 Alarm 重建专项单元测试 | `cc6aff21` | TEST_IMPLEMENTED，待对应 CI 确认 |
| P2 | 用户本人 Mac Chrome Profile、多缩放、多屏宽/键盘和真实网站撤权 | — | NOT_TESTED |
| P1 | Fire 历史按审计策略压缩或安全清理、长期大量记录响应时延基准 | — | NOT_IMPLEMENTED |

## 源码影响范围

- UI：`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/tool-shell.js`、`src/ui/scheduled-task-workbench.js`。
- 调度数据与受限 RPC：`src/platform/tasks/schedule-repository.js`、`schedule-service.js`；仅向原 `src/platform/host/authority.js`、`broker.js` 增加 `listScheduleHistory` 白名单路由。
- 测试：`tests/environment/scheduled-task-ui-r1.test.mjs`、`scheduled-tasks-r1.test.mjs`、`tests/framework/scheduled-tasks-r1-native-mac.test.mjs`，以及独立新增 `.github/workflows/scheduled-tasks-r2.yml`。
- 本次不重建 Controller、Cloud Control、Time Review、Task 作者验证、RunHost/Worker 或原 `runs/@slot`。

## 已知证据 URL

- [`db579429` 组件、生产/开发构建及包验证 PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38276990569)
- [`db579429` Linux CFT baseline + lifecycle PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38276990574)
- [`db579429` macOS CFT baseline PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38276990893)
- [`eff2406e` 组件与包验证 PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38278206008)
- [`eff2406e` Linux CFT PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38278206091)
- [`eff2406e` macOS CFT PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38278206077)
- [`f75fddf3` 组件/package PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38279057885)
- [`f75fddf3` Linux CFT PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38279057784)
- [`f75fddf3` macOS CFT PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38279057771)
- [`6d7957ba` 独立 Chrome 整进程重启验收](https://github.com/shopable-ai/opendesk-browser/actions/runs/38279452373)（仅通过后才可视为 PASS）
- [`e5b7c261` 组件断言失败历史，不能抹除](https://github.com/shopable-ai/opendesk-browser/actions/runs/38277470519)

## 未完成及验收闸门

1. 独立 Chrome 完整重启测试必须严格确认进程 PID 变化、同一临时 Profile、持久计划与 Alarm、重新打开真实合法可见 RunHost、新网页 DOM 原生效果、原/新 FireId 与 Run/Result 幂等、释放资源；其中任一步失败则结果 FAIL，不得更改为 SUCCESS。
2. 真实 Chrome 网站访问权限撤销、Task 安装更新和 generation/hash 修改尚需专用原生案例；Node fake 测试不能替代。
3. `frameworkKV` 中 Fire 历史仍可能长年增长，R2 首先实现索引式读取与分页，**没有执行自动删除**，不得因此宣称数据保留策略完成。
4. 320/360/420 宽度及 Chrome 125/150/200% 实际缩放、中文长名称/长 URL、键盘与可访问性专项截图尚需验收，不得给虚构的独立 95 分。
5. 用户本人 macOS Chrome Profile 不可访问；与 GitHub runner 的全新临时 Profile 是不同安全和功能验收项。
6. 不使用 `--no-sandbox` 作为 Chrome 沙盒安全合格证据；Linux CFT 的 AppArmor 沙盒例外仅适用于隔离 CI。

## R2 独立质量评定（保守）

视觉、信息架构、交互、功能完整性、长期可靠性、异常与恢复、可访问性、规模性能、权限安全和用户 Mac 原生验收都不能因一次 CI PASS 自动评分 95。缺专项证据时保持 `NOT_TESTED` 或 `PARTIALLY_TESTED`；不计算平均分绕过某一项未达标。
