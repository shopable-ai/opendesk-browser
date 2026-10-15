# Platform UI R32 · 方案沉淀与容量政策修订

日期：2026-10-15。负责人：本次 ChatGPT 网页对话 UI 平台方案保存任务。
状态：IN_PROGRESS。起始只读基线：`1c2d2623eeec0b74182e0ab185c328e7ef43bccf`；实际提交前重新核对 main 与目标文件 SHA。

## 授权、文件与资源

用户要求直接把已讨论的 UI 平台方案保存进仓库，并修订“工具包上限不可调整”的旧提示词。仅 main 正常提交；无分支、worktree、PR、强推、正式发布。本轮只修改 Markdown / Skill，不修改运行时代码、依赖锁、CSP、安装身份或容量常量。

预期写入：
- `docs/architecture/browser-ui-r23.zh-CN.md`：在既有架构文档中保存现行平台方向、待决技术选型与容量调整政策。
- `.agents/skills/opendesk-sidebar-tool-package/SKILL.md`：接入容量复核和全链一致性要求。
- `.agents/skills/opendesk-ui-preview/SKILL.md`：接入平台组件原型与设计决策持续保存。
- `docs/framework/prompts/goal-ui-platform-r32.3-document-driven.zh-CN.md`：新的网页版增量续接提示词。
- 本工作流：来源追溯、实际写入、验证等级和交接。

资源：GitHub 远端文档读取与串行 main 更新；不占用用户 Mac 的 watcher、dist/development、端口、Chrome Profile、SDK 或构建资源。记录不是全局锁，不覆盖其他负责人工作流。

## 已确认的来源线索

`src/ui/sidebar-tools/package.js` 当前包含 JS 220000 的字符串长度检查与整体 JSON 320000 UTF-8 字节检查，二者单位不同。

首版提交 `59153b6460c453cd2f548cc23586d91a5c2959ef` 中已包含这些常量；同提交 `docs/product/sidebar-custom-tools-r1.zh-CN.md` 明确写明“容量是 R1 的预算，扩大时须复核整个消息与存储链”。因此这些是可复核的 R1 产品预算，不能当作 Chrome 官方固定工具包上限，也不能当作反对 React 组件化的不可变前提。

具体新容量和 UI 库仍待代表性原型与构建实测决定；本轮不伪造原始 AI 内部推理、用户此前批准或性能数据。最终记录将在本次保存完成后补齐。
