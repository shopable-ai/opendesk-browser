# OpenDesk Browser R15.1 语义工作流合同

> 2026-10-10。以 \`main\` 中实际源码为准；本合同描述初次 R15.1 工作流实现与安全边界。凡尚未附有同一候选原生浏览器收据的项目均不能称为真实 Chrome 验收通过。

## 1. 产品与数据

正式 Sidebar 五个页签：**我的 / 发现 / 工作流 / 开发 / 工具**。原型 \`prototypes/sidebar/workflow-r15-interactive-preview.html\` 只作为 UI 参考；模拟商品数据与按钮不会成为真实执行。

工作流固定 \`format:opendesk.workflow.v1\`，包含 \`workflowId\`、\`title\`、\`description\`、单一 \`siteOrigin\`、严格 \`paramsSchema\`、最多 32 个带稳定 \`stepId\` 的 \`steps\`。支持浏览器已实现的 \`navigate\`、\`observe\`、\`fill\`、\`click\`、\`wait\`、\`extract\`、\`assert\`。\`confirm\` 仅作为受限合同占位：**编译时必须拒绝，不默许跳过，更不能视为已授权。** 不支持任意 JavaScript 或动态操作名进入编译器。

编译产物 \`{workflow,sourceUtf8,sourceHash,stepIds}\` 中代码可按 \`// workflow-step: <stepId>\` 追踪原步骤，参数从运行时 \`params\` 读取。用户输入经 \`JSON.stringify\` 成为 JavaScript *数据字面量*，永不直接拼接为可运行表达式。Controller 负责源码的最终 SHA 和冻结版本，编译器不得修改 \`ChromePage / Locator\` API 兼容语义。

## 2. 唯一运行及授权链路

\`\`\`text
Sidebar Workflow（语义定义与参数）
  → 校验 → 编译（不运行）
  → 用户明确点击 Run（如果包含填写/点击，先勾选该次操作）
  → CurrentPageTarget.capture，origin 必须匹配
  → 在可信用户点击里 permissions.request
  → revalidate exact window/tab/document/url
  → existing RunHost.start({source:draft 或 saved, params, borrowed target})
  → existing Controller / Authority / Sandbox Worker
  → existing Durable Result + 原身份读取
\`\`\`

整个运行冻结 \`sourceUtf8\`、参数、目标身份；编辑器改变只影响下一次。RunHost 插槽不能被 UI 所有权转移、重放或跨站伪装。Sidebar 关闭复用已有 Host 生命周期停止；不新增独立后台运行器。结果未知或回执缺失不得自动重试。所有网页返回值用已有 \`presentTaskValue\` 和 \`decodeValue\` 显示；技术信息在可展开区域中，默认不泄漏原始敏感结果。

## 3. 版本及安装事实

- **Draft**：\`chrome.storage.session\` 窗口作用域的可恢复草稿；不是可信脚本、不是安装。
- **Compiled**：\`validateWorkflow → compileWorkflow\` 的只读源码和哈希，无网页运行。
- **Saved**：\`commitControllerScript\` CAS 原子提交固定 JavaScript revision；WorkflowRevision 元数据另存于现有 \`chrome.storage.local\` 命名空间，加载时必须重新编译、比对源码和哈希，否则拒绝运行。
- **Tested**：该相同源码经真实浏览器执行、有精确 \`runId\` 及 Durable Result 的事实。一次成功不等于 Task v1 已验证。
- **Candidate → Verified → Available → Installed**：仅单 origin 工作流能生成 \`opendesk.task.v1\` 包并调用已有 \`importTaskPackage\`。后续在独立完整目录，核对原生运行效果回执，调用原有 \`verifyTaskCandidate\`、\`makeTaskAvailable\` 和 \`installTask\`。成功安装后只在「我的」重复执行，不依赖 AI。

**限制：** 当前 WorkflowRevision 元数据与 Controller Revision 之间不是单个跨储存事务。可能出现 Controller 已提交而 UI 元数据写入失败；这种情况禁止自动假设“未保存”，应检查 Controller head 后人工协调；不允许无条件重放。

## 4. 多文档与多 origin

同文档 SPA / 同 origin 全文档导航沿用 **现有** \`page.goto\` 的 RunHost/Controller 导航交接。每一步新创建定位器，不能重用旧 document 上的 Locator。是否能通过完整真实导航必须保留与本次包绑定的原生证据。

跨 origin、多 tab 尚无可信 \`WorkflowCoordinator\` 合同与独立 CFT 证据；\`navigate.url\` 的 origin 不等于 \`siteOrigin\` 时 Schema 直接拒绝，不能申请一个宽泛权限后当作已实现。不改写单 origin Task v1。未来必须独立设计逐 origin 审批、tab/document handoff、取消、effect unknown 和新版本 Package 合同。

## 5. AI 安全

Provider 可选，未配置就手工创建步骤。用户必须输入 HTTPS 接口与本次密钥、勾选需求发送许可、点击真实按钮申请服务 origin 权限。只发**用户填写的任务描述、精确 origin、现有步骤和参数结构**，不上传自动提取的网页正文。API key 只驻留当前输入控件，不放进工作流、日志或持久化版本。返回只认严格 JSON 的 \`title/description/paramsSchema/steps\`；再次经 \`normalizeAiProposal/validateWorkflow\` 限权。AI 输出永不直接进入 \`eval\`、Controller source 或授权列表。即使 Schema 通过也必须由用户审阅并明确采用，且不表示 Locator 已实测。

## 6. 证据与审计

运行前阅读 \`AGENTS.md\`、\`docs/framework/testing-guide.md\`。只复用相同输入/合同的旧证据。质量评审按 12 个轴逐一记分，未完成原生验证标记 \`NOT_TESTED\`，不得靠加权总分或模拟执行提升到 95。工作流专属记录：\`docs/framework/workstreams/r15-1-workflow.md\`；不建立第二份 188 能力矩阵。
