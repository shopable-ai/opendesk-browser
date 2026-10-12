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


## E. R3.2 源码/组件/构建证据补充（2026-10-12）

### 经核查的同提交 CI

- **源代码候选**：`e9e4fd513cc117360b44ab80d1a0919d37f26866`。
- **R3 Actions**：https://github.com/shopable-ai/opendesk-browser/actions/runs/38249509707
  - `cloud-r3-component`：**completed / success**。所有定向 Node 检查通过，
    分项 4 + 6 + 4 + 2 + 11 + 41 + 7 + 7 + 110 + 9 = **201 PASS、0 FAIL**。
    包括 6/7 页签、只读 sender/Observer、真实 Cloud Hosting 控制器手势、
    选项卡记忆、Task/Workflow/Tools、原 Controller Authority、
    durable receipt、Provider HTTP/WebSocket 与 dormant owner lease。
  - `cloud-r3-package`：**completed / success**。
    真实 GitHub Runner 上执行 `npm run check`、`npm run build`、
    `npm run build:dev`、`npm run verify`，Production/Development 固定资源、
    CSS/HTML/Manifest/CSP 检查均通过。
    - 生产包 packageHash：`e14999103d090de93c3a540ce1109501b9070061dd6320093f4d6a31e1751a98`。
    - 开发包 packageHash：`1b5d89bd2bfcc0ceb77c99b54fb8c7850da9afc0bd00a6f1b26a6bd674eb1572`。
- 相关更早失败结果仍保留：R3 CI `38238873750` 的 K3 测试错误把
  Task Authority 必要的 KV 检查也当作 Cloud 扫描禁止；后续已按请求主键
  精确断言修复。状态筛选变更时 `38248005424` 的旧 Console 测试
  夹具缺 `cc-filter` 元素，修复后新候选已通过。
- 证据等级：**COMPONENT_TESTED + BUILD_VERIFIED（仅上述精确 SHA/包）**，
  不等于 Windows/Linux/Mac 正式 Chrome 用户操作 PASS，也不构成
  新 main HEAD 的相同 packageHash。之后的并行修改须按影响范围重查。

### R3.2 实际新增的可靠性与性能变化

- `src/cloud-control/service.js`：`pendingRequestId` 与原批准 grant 同库存储，
  云控领取时直接按主键读取 waiting 请求，避免正常 2 秒热路径反复
  `tx.all(frameworkKV)`。已有旧配置首次恢复做一次兼容扫描；
  已过期且未执行的原 assignment 只进入 E_LEASE，不送原 Worker。
- 新 claim response、原 Run 原子绑定、托管停止/取消和重新批准时更新指针
  与 `claimId`；旧授权代次和别的 namespace 的请求/Result 不改写。
  新的测试证明源数据与授权校验仍走原 Authority。
- `src/cloud-control/host-owner-lease.js`：原 frameworkKV/commandJournal 上
  具备 atomic ownerKind/registrationId/documentId/generation/fencingEpoch/TTL
  claim/renew/release/assert，**尚未接入真正的 RunHost 派发**。
  不发布 Runner，也不承诺关 Side Panel 后运行。
- 控制台 `cloudObserve` 限定状态枚举过滤、matchingTotal 和只读分页；
  UI 包括筛选器，不能触发 Host 注册或云任务领取。Side Panel 「在大页面打开」
  行为已有真实控制器组件测试。
- **长期数据缺口仍然存在**：Observer/详细历史读取虽不暴露完整原请求、
  RPC 已有 1–50 行白名单限制，但底层仍遍历全量 KV。
  待实现经过升级/失败回滚验证的索引/游标或持久聚合查询。
- R3 定时任务衔接仍需复用实际已经开发的本地 ScheduleDefinition/FireId，
  **没有启用跨本地+云端重复派发**；云端同计划唯一来源代次尚未实现。

### 验收状态快照（不得自动晋升）

| 验收层 | 状态 | 限定 |
| --- | --- | --- |
| 源码实现 | SOURCE_CONFIRMED | 上述精确文件、提交和读写边界 |
| 云控节点/Authority/Host 控制器测试 | COMPONENT_TESTED | `38249509707`，201/201 |
| 生产+开发 WXT 包 | BUILD_VERIFIED | 两个 packageHash 精确绑定 |
| Linux 静态 Chrome 视觉/交互 | NOT_TESTED | 本次 Cloud R3 专项 CI 未产生这一级原始证据 |
| Mac Chrome 原生 Side Panel/Console | NATIVE_PENDING | 同提交真实 Profile/截图/结果缺失 |
| 副作用中断原请求恢复 | NATIVE_PENDING | 按 R1 原 job/request/run 保留，绝不重播 |
| Host Owner Lease 真实转交 | NOT_IMPLEMENTED | 目前仅 dormant 原子存储组件 |
| 24 h/72 h 长期 Runner | NOT_TESTED | 不开启未经验证的持续托管模式 |

任何专家评分涉及真实网页执行、视觉缩放、Host 转交或最终安全性时，
缺少对应原始证据必须标记 **NOT_VERIFIED**，不能根据 CI 通过填 95 分。
