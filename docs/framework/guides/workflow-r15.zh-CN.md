# OpenDesk Browser 工作流 R15.1 使用指南

1. 在 Chrome 加载当前真实构建的扩展（开发模式可执行 \`npm run dev\`），打开可运行的 HTTP(S) 网页，比如测试站 \`http://127.0.0.1:43111/demo-form.html\`。启动此站：\`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks\`。
2. 打开 Chrome Side Panel 的「工作流」，点击「新建」。工作流自动绑定当前页面的**精确 origin**，以后可在同站不同页面复用；跨 origin 不会偷换目标。
3. 在「执行步骤」添加观察、填写、点击、等待、提取、断言或打开同站页面。编辑每步的定位器及参数。参数 Schema 可展开填写闭合 JSON Schema，运行区自动产生参数表单。建议先做“观察页面”和“提取文本”这种只读步骤。
4. AI 为可选项。需要 AI 时自行配置实际 HTTPS Chat Completions API、模型和仅本次会话的 API Key，核对共享的数据范围后勾选许可，点击「生成建议计划」，检查 Locator 后点击「采用并编辑步骤」。没有 Provider 不能“模拟 AI 已完成”。
5. 展开「生成的 JavaScript 与源码哈希」检查脚本。点击「保存版本」将 JS 提交给已有 Controller 的 Script Revision，同时保存 WorkflowRevision。关闭 Sidebar 重新打开可在「已保存的工作流版本」里选择并打开（加载时重新核对脚本哈希）。
6. 在工作流支持的网站页面填写运行参数。若包含填写或点击，需确认本次操作，再点击「运行工作流」。Chrome 授权后执行冻结脚本，返回内容来自真实 Durable Result；可以展开技术身份和完整原值。发生超时、停止或未知结果时不要盲目再次运行，应先核对页面已有副作用。
7. 若要在「我的」重复使用：先「提交为待验证 Task 候选」，再在独立完整任务目录用**相同源代码的真实运行 runId** 完成 Verified → Available → 安装。安装成功后「我的」可不依赖 AI 运行。不允许从草稿一步跳过验证强行安装。

**限制**：未实现跨站和多标签的连续工作流；\`confirm\` 步骤当前会被编译器拒绝。此文档是使用说明，非 Chrome 真实运行验收证明。
