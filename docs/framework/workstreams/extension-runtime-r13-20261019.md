# OpenDesk Browser 扩展运行环境 R1.3：真实实施与证据

日期：2026-10-19。仅直接安全提交真实 `main`，不新建 Runner、SDK、Host、Worker、分支、PR 或 Worktree。

## 五种使用场景

| 场景 | 当前有的正式入口 | 尚未交付的能力 |
| --- | --- | --- |
| 1. 网页自动化 | 开发 → Controller + local-controller 示例；「我的」安装 Task | 关闭可见 RunHost 后无人值守派发 |
| 2. 网页增强 | 开发 → Page USER_SCRIPT / React / Vue；local-page-ui；固定 Page 安装 | 非受管脚本全部副作用通用 Stop |
| 3. 应用界面 | Sidebar Tool 原有打包器、安装器、沙箱和 SDK | 关闭 UI 不一定停用已授权后台 |
| 4. 后台服务 | 固定 SW/Alarm、Cloud Connection、经审核持久规则 | 普通作者不能安装任意后台特权 JS 或独立更新后台算法 |
| 5. 组合式应用 | Prompt Shortcuts、Stay Focus、AdBlock 等真实多个职责项目 | 尚无跨入口原子安装、升级、停用及卸载包 |

触发来源（手动、匹配网页、浏览器事件、计划、云端通知）不是运行环境。开发技术（JS/React/Vue、单文件/多文件）也不是权限。组合式应用不要求第五套 Runtime。

## 实际源码变更

- `src/cloud-control/connection.js` 修复云端能力 ACK 前对账及并发 `notify` 丢失：待 ACK 完成后首次对账；通知合并为一次串行补偿；Stop/换代不派发旧工作。新增三项行为测试，提交 e595b0202c450a689887310885d63e49fa45a568。
- `tests/cloud-control/r52-product-ui.test.mjs` 随已有 Cloud React 迁移修正过时的仅 HTML 断言，改为同时核对 React 首次连接/历史/概览及原 HTML 授权表单。提交 950726a953602cba5ae21f0ba04fe58a40007d7c、ccd510ed68233525700a6b9a3d5b0f2d1030f955。
- 五场景划分、真实云控执行限制、开发入口和 Skill 路由写回既有文档、工作流与 Skills，不创建第二份权威规范。

## 云控执行链及重要限制

1. 「我的」固定安装且验证 Controller Task，「云控」批准版本、网站、结果回传。
2. 固定 MV3 SW WebSocket 仅接收 notify，Cloud Service 核验并持久化经授权 Assignment；不是接收后执行任意远程 JS。
3. 可见 Side Panel 的 cloud-hosting.js 才使用 cloudNext → cloudResolve → host.start 调用原有 RunHost/受控 Worker。
4. 由原始 Run/Result 与权限回执核对恢复，撤销或未知副作用不得盲目重放。

**Side Panel 关闭后，即使 WebSocket 在线，也没有可靠可用的 Controller 执行宿主保证。** src/cloud-control/host-owner-lease.js 明确尚未接线；不能宣传完整 Playwright 远控或无人值守能力已经实现。

## 证据与不足

Cloud R5.2 GitHub Actions [#39157673765](https://github.com/shopable-ai/opendesk-browser/actions/runs/39157673765) 已 **SUCCESS**：云控协议/安全组件 85/85 PASS、Controller Authority 121/121 PASS，并通过受影响 Cloud Side Panel 验证。该组件/合同 CI 不等于真实 Chrome 原生验收或无人值守 Controller 验证。真实 Chrome/Mac/Native、独立安装更新、后台恢复、授权撤销、全部场景逐项实机验证、组合应用原子生命周期：**NOT_TESTED 或 NOT_IMPLEMENTED**，不报 95+。

后续重点是把后台公共能力与组合生命周期变成真实可用的独立安装协议，并实现可见且 fenced 的无人值守 Controller 宿主；不得用文档或 Mock 代替交付。
