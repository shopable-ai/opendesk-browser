# OpenDesk Browser R15.2：AI 工作流 Side Panel 多状态与对话优先设计合同

> 2026-10-10。取代 R15.1 中“把全部表单顺序排列”的可见 UI 布局；不替代其 WorkflowDefinition、Compiler、RunHost、Task v1 安全协议。原型是 UI_SIMULATION，不能作为真实 AI、Chrome、保存或安装证据。

## 核心问题与设计决定

R15.1 已包含单 origin 工作流模型、生成器、版本持久化、AI Provider 适配和 Controller RunHost 消费者，但可见顺序为：版本管理 → 名称/用途/网站 → AI Provider → 步骤 → 参数/Schema → 代码 → 结果。普通用户描述需求之前需要穿过大量开发者表单，违背对话式编排目标。

**决定：默认是一屏 AI 工作流对话；有实际步骤后显示语义步骤；运行前有必要时才显示参数与确认；版本、Schema、源码、Task Candidate、技术身份只在用户主动展开“历史”后出现。** 保留底层能力、已有权限系统和版本数据，不增加第二套执行器。

## 真实 UI 与原型

- 正式 DOM：src/ui/tool.html；样式：src/ui/tool-shell.css。
- 仅展示层状态：src/ui/workflow/view-state.js；完整业务：src/ui/workflow/workflow-view.js。
- **现行多状态原型**：prototypes/sidebar/workflow-r15-stateful-preview.html，共十种 UI 场景。
- 历史原型：prototypes/sidebar/workflow-r15-interactive-preview.html，仅供追溯此前“三场景”的设计。
- 协议与编译：src/framework/workflow/{contract,compiler}.js 与 src/platform/tasks/contract.js。
- 验收测试：tests/environment/workflow-ui-states.test.mjs、tests/environment/workflow-r15.test.mjs；真实 Chrome 的结果必须另行验证。

## 九种显示状态与一个二级管理场景

这些只是 UI 的 presentation state，不是 RunHost、Controller、Revision、Result 或 Authority 的替代品。

| 状态 | 进入条件 | 默认可见 | 必须隐藏或避免 |
| --- | --- | --- | --- |
| ai-unconfigured | 无步骤且模型信息未填 | 欢迎语、需求输入、模型设置、手动创建 | 伪造建议、版本表单 |
| empty | 无步骤、模型信息在会话中已填 | 欢迎语、需求输入 | 授权/结果/Schema |
| planning | 用户发起 AI 请求并等待 | 明确的规划中提示 | 伪造结果、自动执行 |
| proposal | 模型返回并通过 Schema 校验 | **自然语言步骤清单**和“采用这份计划” | 原始 JSON 大表单、自动批准 |
| draft | 手工添加或明确采用步骤 | 默认折叠的语义步骤、必要参数、运行与保存 | 常驻 Locator / JSON Schema |
| running | RunHost 开始当前运行 | 真实运行状态、原 Stop 所有权 | 重新选择当前 active tab |
| result | 成功取得 Durable Result | 动态结果摘要，敏感原值按需展开 | 静态模拟的返回字段 |
| failed | 规划/准入/执行失败或效果未知 | 明确的错误和恢复建议 | 自动重试危险副作用 |
| saved | 原有 Controller Revision 与源码哈希匹配 | 已保存版本状态及再次运行 | 宣称已 Verified / Installed |

**历史管理**是第十个原型场景，只在用户点右上角“历史”后显示。这里才有版本选择、刷新、名称、用途、网站、Schema、源码和 Candidate。新建会清空当前可见会话，不删除已保存版本，不运行代码。

## 默认界面顺序

1. 顶部：工作流标题或“AI 工作流”、当前网页简要身份、“历史”与“新建”。
2. 中部：欢迎语 / 对话 / AI 建议；已采用或手动创建后才出现语义步骤，每个步骤默认折叠，点击才编辑。
3. 条件区：存在运行参数或填写/点击操作时，才展示本次参数和显式确认。
4. 底部：固定需求输入与“AI 设置 / 生成步骤”。无 AI Provider 时不能假装生成成功；点击按钮应引导配置。
5. Dock：沿用既有 RunHost 的 Run/Save/Stop。空白会话隐藏无意义的禁用 Dock，真正运行仍检查精确 CurrentPageTarget、权限和版本。
6. 结果：运行后按实际返回值动态呈现；错误及未知效果明确可见。

实现必须使用同一个 WorkflowDefinition 和同一个运行所有者；仅调整 DOM 可见性和人机交互，不在不同 UI 状态之间复制授权与任务执行系统。

## 正式与模拟隔离

- 所有 prototypes/sidebar HTML 原型只是离线 UI_SIMULATION，不连接真实 AI、权限或跨站任务。
- AI 必须由用户真实点击并在明确发送内容范围授权后才能访问显式 HTTPS Provider。
- 当前 Task v1 只允许一个精确 origin；任何跨 origin 步骤仍被原合同拒绝。不能因原型中出现多个网站就取消这个检查。
- Run 前从用户可信点击冻结目标、源码和参数，要求站点授权、准确 document 二次验证、已有 RunHost/Controller 的持久结果。
- 执行失败、paused_unknown 或没有 Durable Result 时显示错误/未知，不自动重放可能已发生的网页效果。
- 退出 AI 后已经正确保存的版本仍可从现有代码执行；保存不等于已验证或已安装。

## 独立专家评审与反方审核

分别独立评审（每项满分 100，不使用加权平均）：信息架构、九个状态加历史管理、普通用户任务创作、模型安全与隐私、语义步骤可理解性、版本与重复执行、权限与 RunHost 正确性、错误恢复、320/360/420/520px 响应式及 200% 缩放、真实 Chrome Side Panel。

每项要给出证据、分数、缺口及是否 ≥95；未测试的项目必须标记 NOT_TESTED，而不能以理论高分冒充实测。当前提交是源码和原型整改，不代表同一 SHA 的真实 Chrome 原生验收已通过。
