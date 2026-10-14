# OpenDesk Browser Workflow R1.7 — 工作流 Tab 精简与入口去重

- 日期：2026-10-14
- 负责人／范围：本次 ChatGPT 会话，经用户要求直接修改现有产品；唯一写入分支 `main`，不创建其他分支、PR 或发布包。
- 写入前远端参照 HEAD：`2c495db7cc9e3f9c3b9dc41f88fd053635c0c70b`（仅基线，正式提交前重新核验）。
- 本轮变更：`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/workflow/workflow-view.js`；定向回归 `tests/environment/workflow-ui-states.test.mjs`、`tests/environment/workflow-focus.test.mjs`。不修改其他 Agent 的文件与旧 evidence。
- 共享资源：通过 GitHub Connector 提交，不接触用户 Mac 工作目录、共享 Git 索引、Chrome Profile、43111 端口、dist/watcher 或 Codex 原生宿主。
- 目标：隐藏已配置后多余的隐私说明/连接诊断；成功时精简成「Codex 已就绪」；连接成功或 AI 成功响应后收起设置；顶栏唯一「＋」菜单区分「新对话（保留工作流）」与「新工作流（需草稿确认）」；保留受限版本对话不可恢复的菜单内说明；撤销授权不作为长期常驻按钮。
- 约束：完整保留 `CurrentPageTarget`、`RunHost`、工作流编译/持久化、`browser.observe` 针对文档逐次同意、Chrome `permissions.request/contains` 和 Native/Agent 会话真实性校验。无新依赖，无新协议、数据库或特权执行器。
- 写入前基本静态验证：五个文件 Git Blob 成功生成，`src/ui/workflow/workflow-view.js`、`tests/environment/workflow-ui-states.test.mjs` JavaScript 解析通过，`tests/environment/workflow-focus.test.mjs` 通过去除 import 后的异步模块语法解析；HTML 中工作流关键 id 唯一，新增测试断言保留。**这些是源码级检查，不等于 Node、构建或原生 Chrome PASS。**
- 提交后检查：以提交 SHA 为身份核对受影响 GitHub Actions；测试异常读取真实失败日志，只修复本轮相关问题；未提供 Mac/CFT 安装包身份时真实 Chrome 场景均为 **NOT_TESTED**，不得用静态检查/CI 宣布 95+ 产品验收。
- 当前本轮最终验收状态：`SOURCE_IMPLEMENTED_CANDIDATE`；组件 CI **PENDING**；真实 macOS Chrome / 宽度与 200% 缩放 / 本机 Codex 实际会话 / ZIP 安装 **NOT_TESTED**，待同候选验收并补充原始证据。
