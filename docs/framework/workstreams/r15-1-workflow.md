# R15.1 工作流实施记录与独立审计

- 工作流：OpenDesk Browser R15.1 Workflow (main)
- 记录日期：2026-10-10
- 参考原型：`prototypes/sidebar/workflow-r15-interactive-preview.html`
- 环境：GitHub Connector 对远程 main 写入；**当前环境没有访问用户 Mac 本地 Chrome / 同包原生 CDP 的能力**。
- 原始证据：GitHub Actions 以实际提交 SHA 绑定的公开 run/job 输出。原生 Browser E2E `runId/resultId/documentId/packageHash` **NOT_TESTED**，不借用其它历史候选。
- 不宣称整个框架 603+19 / F3 / ZIP 已达到终态。

## 本轮变更

`src/ui/tool.html`、`tool-shell.css`、`tool-shell.js`、`task-workbench.js` 接入五页签及 workflow Stop owner；`src/ui/workflow/workflow-view.js` 实现创建/编辑/参数/保存/运行/结果/候选；`src/ui/workflow/ai-plan.js` 适配用户指定 HTTPS Chat Completions 服务；`src/framework/workflow/contract.js`、`compiler.js` 负责限权与确定性代码生成；`tests/environment/workflow-r15.test.mjs` 和现有 Sidebar 静态/组件回归更新；`docs/architecture/workflow-r15-contract.zh-CN.md` 与使用指南记录约束。

## 测试证据层级

- **源代码层**：GitHub 读取的 JS 模块按 import/export 剔除后的语法检查通过；37 个 Workflow DOM 查询 ID 在正式 HTML 均存在。这不是 WXT 打包或浏览器运行验收。
- **GitHub CI**：2026-10-10 已核对 commit `8e6b01dd7e393d80c5a04b6729f884c4df9d5083` 的至少六组相关 GitHub Actions 完成 `success`：Sidebar R1 P0、Sidebar user tools、Site access、Page userscript dependencies、R7 axiosx、分支清理。这只证明对应 Actions 定向步骤，并不代表新补充的 R15 测试或后续提交的最终包已经通过。
- **R15 专属单元**：在 `npm test` 全环境测试中运行；本记录写入时没有取得新候选的 CI 日志证明，状态为 **NOT_TESTED**。严禁将源码存在冒充单测 PASS。
- **新候选生产构建 / 开发构建 / verify**：本记录写入时 **NOT_TESTED**；等待包含本次最后变更的 CI 原始运行数据后更新记录。
- **真实 Chrome 工作流闭环**：`NOT_TESTED`；待 Mac 所有者执行与同一实际包 SHA 绑定的原生测试，不允许用 Node fixture 或静态预览冒充。

## 反方安全审计（源码层）

PASS（源码局部约束）：Workflow 协议白名单、单 origin 检查、`stepId` 唯一、代码文字参数 JSON 引号转义、无 `eval`、确认步骤 fail closed、AI 返回严格 Schema、真实浏览器授权只在点击处理函数中发起、页面 target 精确 revalidate 后 RunHost start、Stop 关联实际 runId、保存源码交给 Controller CAS。

仍需测试或解决：跨 origin / 多标签独立 Coordinator 尚不存在；Controller Revision 与 UI Workflow 元数据不具原子事务性；AI provider 真实服务返回、超时、注入及秘密保护尚无真实网络试验；关闭 Sidebar 导致 host 结束且结果未知时的原生收尾待验；可访问性在 200% 缩放和 320/360/420/520px 真实 Side Panel 下未测。**禁止以此审计宣布安全 95+。**

## 12 维独立评分

评分必须同时拥有源码、相同候选 CI 和必要的原生证据，暂不根据主观设计预期报 95：

| 维度 | 本次评分 | 已有证据 | 阻断缺口 | ≥95 |
|---|---|---|---|---|
| Sidebar 视觉与信息架构 | NOT_TESTED | 五标签源码、DOM 静态匹配 | 窄视图真实 CFT / 视觉 | 否 |
| AI 对话及需求规划 | NOT_TESTED | 真实 Provider 请求适配源码与 Schema | 未配置真实 Provider E2E；非多轮对话 | 否 |
| 语义步骤可理解性与编辑体验 | NOT_TESTED | 基础编辑、顺序、语义文案 | 键盘、AI 可用性用户研究 | 否 |
| 参数化和重复运行能力 | NOT_TESTED | paramsSchema 验证和现有 Task 接线 | 含持久产物的二次真实运行 | 否 |
| 编译器及生成代码正确性 | NOT_TESTED | 受限 emit、源码哈希和单测文件 | 完整跑 R15 单测及原生 Page API | 否 |
| 单站点浏览器执行可靠性 | NOT_TESTED | 现有 Host.start 准入接线 | 原生 runId/resultId 与 DOM 副作用 | 否 |
| 跨页面及跨 origin 执行能力 | NOT_TESTED | 同 origin goto emit；跨 origin 阻断 | A/B 原生导航与 C 多站 Coordinator | 否 |
| 身份、权限与安全机制 | NOT_TESTED | 当前页冻结/复验、白名单、Stop Owner | Chrome 权限撤销、多标签竞态攻击试验 | 否 |
| 保存、版本化与安装流程 | NOT_TESTED | Controller CAS / Candidate 包源代码 | Verified → Available → Installed 真 Chrome 验收 | 否 |
| 结果展示与错误恢复 | NOT_TESTED | Existing Durable Result 读取与动态格式 | 超时、unknown、UI 再打开及消费确认 | 否 |
| 可访问性及响应式体验 | NOT_TESTED | aria、focus、CSS 五列布局 | 320/360/420/520px、200% 与键盘真实证据 | 否 |
| 工程维护性与测试覆盖 | NOT_TESTED | 复用 Controller/RunHost、无新 DB、回归脚本 | 最终本轮 CI、构建、E2E、独立反方 | 否 |

下一步：定向 CI 完全绿 → 读取真实最新构建 SHA 和 packageHash → 单 origin demo-form（读、填、等、取、保存并重复执行）→ 同站导航 → 撤权/Stop/unknown → 用户明确验证安装 → 跨站独立合同与真实授权编排 → 原生视觉与独立评分。任何未产生原始证据的阶段保持 NOT_TESTED。
