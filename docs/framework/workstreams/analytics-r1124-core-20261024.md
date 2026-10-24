# Analytics R1.12.4 — App Service 坏 Fire 独立隔离（2026-10-24）

- 写入范围：`src/analytics/authority-projection.js`、`tests/environment/analytics-r11-authority.test.mjs`、本记录；唯一写入 `main`，禁止其他分支/Worktree/PR。
- 开始前主线 HEAD：`b01fe99680423285faaec07794f211cb534c42cd`；R1.12.3 Analytics 源码修改与后续 Prompt Shortcuts 提交均保留。
- 真实问题：App Service `validScheduledRun` 直接 `canonical(binding)` / `canonical(fire.appBinding)`；损坏的嵌套字段可能抛出 `E_SCHEMA`，使整个 Authority `READ_FAILED`，遮蔽同一投影中的合法 Scheduler/Page 执行。
- 最小源码修复：在原 `validScheduledRun` 内对不合法绑定返回 false；将 canonical 的异常限制为当前 Fire 拒绝，外层原有 `projectionGap` 记录覆盖缺口；不增加采集事件、安装身份、SDK、Host 或 Consent 类别。
- 新反例：将 App Service Fire 的 `sourceIdentity.corrupt` 设为不可 JSON 序列化的 `undefined`，保留另一条独立有效 Scheduler Fire/Run/Result；要求坏 Service 不计成功、合法 Task 仍完成 1 次、投影标记覆盖缺口。
- 历史 CI `40068219852`：95 项、91 PASS、4 FAIL；R1.12.3 已提交相应四项修复，新候选 CI `40071712379` / `40070900430` 于本次核查仍为 QUEUED。本文不声明新增反例 PASS。
- Linux/Node 回归、真实 Chrome Native、Cloudflare D1 开发环境、PostHog 云端：以各自最新候选及原始日志为准；本记录不提升证据等级。生产接收 URL 继续关闭，Consent v8 不变。
