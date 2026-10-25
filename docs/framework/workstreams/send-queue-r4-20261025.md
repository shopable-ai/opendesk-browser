# Send Queue R4 — 独立 Page Program 工作流

- 日期：2026-10-25
- 仓库：`shopable-ai/opendesk-browser`；**只写 `main`**
- owner：本 Send Queue 执行会话；其他并行 Agent 的原有 Page 程序、Prompt Shortcuts、Scroll Navigation、Mind Map、统一 UI 与宿主 `src/` 全都只读。
- **本轮业务写入**：`examples/programs/chatgpt-send-queue/{package.json,src/main.js,src/site.js,src/engine.js,src/view.js,assets/queue.css,tests/engine.test.mjs,README.zh-CN.md}`；唯一进度记录就是本文件。
- 执行模式：GitHub main 远程源码编辑。当前没有用户 Mac 本地仓库写入、真实已登录 Chrome/Profile、`npm run dev` watcher 访问权；不能宣称原生验收。
- 已读取：最新 `AGENTS.md`、公开 Page USER_SCRIPT / `@opendesk/ui` API、Page Schema、页面增强现有程序；R3 HTML 从用户文件库只读恢复，没有覆盖原型。
- 目标能力：页面内存队列；唯一原生编辑器保守探测；两阶段填入/点击；单次官网点击 + 新增用户消息回读确认；下一轮 AI 明确完成栅栏；提前停止须用户确认；未知停止/发送不自动重试；原生输入宽度前后检查；受管 UI 生命周期。
- 验证等级：静态语法快检 + 纯 JavaScript 状态机模拟仅属于开发期间的初步自检；尚未在用户 Mac 运行仓库 Node 测试和安装测试，不能把测试文件存在等同于 PASS。
- 不足：刷新/扩展重载恢复需要公开可信持久化能力，当前 Page USER_SCRIPT 不持有经审计的私有安全存储；不能将聊天消息明文保存到网站本地存储。目标 ChatGPT 编辑器、React 节点、按钮位置、Stop/Send 真实事件兼容性都需实测。
- 下一步：本地 Codex 针对已登录 ChatGPT 在测试对话连续两次真实发送；最优先核实 `src/site.js` 网站适配、`src/view.js` 按钮及队列的宽度/圆角，保存真实回执后再做定向回归。真实网站、正式安装、升级、停用及撤权全部 `NOT_TESTED`。

## R4.2 编辑语义精简（2026-10-25）

**产品纠偏**：不建立队列内嵌编辑器。点击某条「编辑/取回输入框编辑」后，若官网原输入框完全空白、无附件、会话身份保持且该条未处于发送中或 unknown，则将正文写回原生输入框；读回确认一致后，才把该条从待发队列删除。用户随后可在原输入框修改、手动发送，或再按蓝色按钮重新排队。

已有草稿（含空白字符）、附件、会话切换、输入控件替换、无法写入/读回或发送结果未知均**不移除队列项**；可能部分写入时保守暂停队列，避免重复发送。编辑不是删除真实 ChatGPT 对话，也不是点击后直接发送。

**修改范围**：仅 Send Queue 自有 `src/main.js`、`src/site.js`、`src/engine.js`、`src/view.js`、`tests/engine.test.mjs`、工具 README 和本记录。HTML 原型另在对话生成附件，不批量增加仓库原型版本。原生 ChatGPT 实际 DOM/React、正式安装和两轮真正自动发送仍为 **NOT_TESTED**。离线 Chromium 仅验证 320/360/400/440/700px 的队列取回、草稿保护、无横向溢出、宽度一致与 0px 间距，不得转为原生 PASS。
