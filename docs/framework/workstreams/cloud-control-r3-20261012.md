# Cloud Control R3 · 工作流推进与原生待验收事项

日期：2026-10-12。写入分支 main，禁止新分支/Worktree/PR/force push。
本轮起始观察身份：`9e5a65fcec8cd4b0e1785424863b1b7ffed1421f`；
期间并行 Agent 多次推进 main，所有修改均经 GitHub 内容 SHA/当前 HEAD 安全提交，
没有触碰用户 Mac、Chrome Profile、原生 Provider、端口或 IDB 数据。

## A. 已写入的真实代码（SOURCE_CONFIRMED）

1. 更新 `cloud-control-debug-r14.test.mjs`、`sidebar-tab-memory.test.mjs`：
   新断言针对 `isActualSidePanelContext` 与真实 Side Panel 优先判定；
   修复后续重复 const start 产生的 Node 语法错误。
2. `src/cloud-control/service.js`：在原服务添加 `cloudStatus({includeRequests:false})`
   快速状态、限量脱敏 `limit/offset`、requestTotal，
   抑制已释放且已确认回执的原 Run 被租约过期和 cloudStop 改成取消。
3. `src/ui/cloud-hosting.js`：2 秒 claim 节奏保持，但不每轮遍历历史；
   可见云控页约 5 秒、其他页约 15 秒读取历史；添加控制台新标签入口。
4. `src/ui/cloud-status-presentation.js`：展示真实历史总计，不把 5 条样本当总量。
5. `src/platform/host/cloud-observer.js`：独立 Observer 的精确 TAB/documentId
   sender 检查，以及原云控管理和领取必须来自真实 SIDE_PANEL 的检查。
6. `src/platform/host/broker.js`：新增经过原生 sender 验证的只读
   cloudObserve 专用路由；所有云控敏感/领取 RPC 强制 Side Panel。
7. `src/ui/cloud-control-console.js`、`src/ui/cloud-control.html`、
   `src/ui/cloud-control-console.css`、`src/entrypoints/cloud-console.js`：
   独立受信任扩展控制台；只读观察、原结果已确认、20 条分页，
   不注册 Host、不停止或运行任务；复用现有 R27 设计 Token。
8. `src/ui/tool.html`、`src/ui/tool-shell.css`：第六页打开控制台入口。
9. `scripts/build-contract.mjs`、`scripts/prepare-public.mjs`、
   `scripts/verify-package.mjs`：固定构建输出、HTML 引用白名单、CSP/资源检查和新 CSS 安全扫描。
10. `tests/framework/k3-controller-authority.test.mjs`：
    有界状态、租约终态保护、Observer 脱敏/命名空间隔离的组件回归。
    `tests/environment/cloud-control-console-r3.test.mjs`：
    Observer sender 伪造拒绝、Side Panel 专属管理、无第二 Host、
    固定构建入口和只读 UI 文本渲染。
11. `tests/environment/sidebar-ui-preview.test.mjs`：
    修复六页签后以旧第五页作为 Tool 截断边界的错误，保留原真正的工具语义断言。
12. `.github/workflows/cloud-control-r3.yml`：
    分为专门的 Component 与 Source/Production/Development Package 两套门禁。

## B. 已实际看到的 CI 回执（不同 HEAD，不得混为最终通过）

- 早期候选 `7c165bad` 在 Sidebar 组件流水线包含多数通过的 Controller/Cloud
  回归，但仍受历史工具区段边界断言影响；后来已单独修正该断言。
- 后续 `2a4e7961` 的 GitHub Actions 表明早前新增的测试语法错误已经消失；
  仍有并行 React 页面脚本 `tests/environment/script-editor.test.mjs:602`
  对只读 Proxy revalidate 的测试失效，非本轮云控代码。
- 新的 cloud-r3-component / cloud-r3-package 仅在对应 GitHub Action 真正
  completed + success 后才可标记 COMPONENT_TESTED / BUILD_VERIFIED。
  不能将 queued/cancelled、较早 SHA 或 Linux CI 冒充新 Mac Chrome 验证。

## C. 未完成 / 阻断状态

| 项目 | 当前状态 | 阻断与后续动作 |
| --- | --- | --- |
| 独立控制台页面源码和入口 | SOURCE_CONFIRMED | 等同 SHA 的 CI 与真实 Chrome 交互/键盘/窄屏 |
| 隔离的只读 Observer RPC | SOURCE_CONFIRMED | 等组件回归和真实 Chrome sender 身份验证 |
| Side Panel 自动领取与 Stop | SOURCE_CONFIRMED（原架构） | 运行中真实 Stop 属 Gate 4 NATIVE_PENDING |
| 云状态有限响应和频率优化 | SOURCE_CONFIRMED | **IDB 仍全表扫描**，需原生索引和游标分页 |
| 终态已确认回执保护 | SOURCE_CONFIRMED | 等新的 Gate 4 Provider 过期原生对账 |
| Gate 4 原副作用中断恢复 | NATIVE_PENDING | 不重跑原请求，不修改 IDB，不伪造 Result |
| Gate 4 撤权 / 存储失败 | NATIVE_PENDING | 原 Authority / Quota / 回执原生测试 |
| 独立可见 Runner | NOT_IMPLEMENTED | 原子 ownerKind/registrationId/generation/fencingEpoch 与 Host handoff 未完成 |
| 定时任务执行衔接 | NOT_IMPLEMENTED | FireId 单来源持久去重 / generation 未接入 |
| 300/360/420/520 宽度与 125/200% | NATIVE_PENDING | Mac Chrome Side Panel 与独立控制台分开录证 |
| 全面生产/开发资源和 CSP | CI_PENDING | 等对应提交工作流双构建并检查 artifacts |

## D. 原生验收顺序

1. 先确认最终 main 的 Git SHA、build fingerprint、独立 Console 的包内位置；
   保留已经占用的 Mac 原生 Profile 和 Provider，不启动竞争资源。
2. 静态真实 Chrome：6/7 tabs、生产 debug 不可进入、键盘/缩放/全局溢出；
   单独控制台只读，不因打开控制台而新增第二 Host。
3. Gate 4 原现场：副作用后中断请求只读恢复 -> 运行中 Stop ->
   revoke 权限/授权 -> IDB Quota/rollback -> provider receipt 与租约一致性。
4. 若全部原生门槛通过，再设计独立可见 Runner 的
   atomic Host Owner Lease/handoff，继续禁用尚未验收的挂机开关。
5. 再验证本地/云端 ScheduleDefinition + FireId 单源去重；
   对旧的原生失败和证据保留，不修改原始日志。

质量分数均在有对应证据之后单独给出；没有实施或没有验证的条目写
NOT_VERIFIED，不将书面设计自动评为 95。
