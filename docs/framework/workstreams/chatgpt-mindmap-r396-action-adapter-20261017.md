# ChatGPT Mindmap R3.9.6 · 官方回复操作组适配

- 日期：2026-10-17
- 负责人：本会话 bounded executor（继承当前模型）
- 状态：COMPLETE / RELEASED
- 分支 / 起始 HEAD：`main` / `1fdb1cd43691e83c6a332d566fae3500f0cda4de`
- 类型与所有权：现有 Page USER_SCRIPT Program；仅业务项目 DOM adapter，不涉及 Browser Framework / SDK。
- 主 Skill：`.agents/skills/opendesk-script-authoring/SKILL.md`；已读业务 `README.zh-CN.md`。

## 写入范围与协作

1. `examples/programs/chatgpt-mindmap/src/chatgpt-adapter.js`
2. `examples/programs/chatgpt-mindmap/tests/chatgpt-adapter.test.mjs`
3. 本记录。

`answer-registry.js` / `view.js` 由其他 Agent 修改，本任务不写入。保持 `inspectAnswer()` 的 `{ok,root,turn,content,bar}` 合同：`bar` 返回官方操作组原始 DOM 元素，由 leader 负责组内插入。

资源仅为本地 Node/linkedom 定向测试，无端口、Profile、dist 或 watcher 占用。不建分支/worktree，不暂存、提交、推送或安装。本轮是业务源码开发及 DOM 验证，未连接或切换扩展构建环境。

## 实施与通过条件

- 优先当前 assistant 回复内的 `[data-assistant-message-actions][data-message-actions][role="group"]`，不依赖混淆 class、aria 标签语言或复制按钮文案。
- 保留基于稳定数据属性的旧结构回退；不唯一的操作组拒绝绑定。
- 定向回归中文/英文 aria、标签/文案变化、多个回复不串组、官方组优先以及旧结构回退。
- 验证：先补回归并观察旧实现失败，再修复并运行适配器定向测试、语法及 diff 检查。

## 验证结果

- 新增回归先在旧实现得到 `3 PASS / 4 FAIL`，四项失败对应语言变化、官方组优先、重复组拒绝以及本地化复制标签不再作为定位依据。
- 修复后执行 `node --test examples/programs/chatgpt-mindmap/tests/chatgpt-adapter.test.mjs`：`8/8 PASS`，无跳过。涵盖中英文 aria、标签/文案变化、多回复独立绑定、官方组优先、重复组拒绝、正文/注入 UI 排除、流式状态及旧稳定属性结构。
- 适配器与定向测试 `node --check`：PASS；两文件 `git diff --check`：PASS。
- `bar` 保持为官方组原始 DOM 元素；未修改 registry、view、iframe 列表层级或其他 Agent 文件。leader 可继续构建 candidate5。
- 首次失败报告因 DOM 对象差异格式化耗时，已终止本任务两条测试进程并将新增断言改为布尔身份比较；最终验证正常结束，无遗留测试进程或资源占用。
- 本记录位于仓库忽略的工作流目录，文件已落盘；未修改忽略规则、Git 索引或提交。
- 写入范围与测试资源已释放。真实 ChatGPT / Chrome 与安装：`NOT_TESTED`；由 leader 的核心流程集成验证负责。
