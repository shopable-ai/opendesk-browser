# Shared AI Chat R2.4 · 四入口边界收敛（2026-10-25）

**Owner / 会话：** 本轮共享 AI Chat 四入口增量修复。**状态：** SOURCE_IMPLEMENTED；本次写入文件范围提交后释放，Mac 验收未执行。

**原目标：** 「我的」「工作流」「Bookmark Manager」「Prompt Shortcuts」复用 ToolShell 唯一 Provider Runtime、可信 React Root、ConversationSession/Frame/Sheet；各自仍由原 Adapter/Service/SDK/Host/RunHost 做确认、执行及独立读回。唯一 main；不创建分支、PR、Worktree、Host、存储、权限或 Provider。

**起点：** main@52fc19e7e0fbce1ba3e86c1747ddacb03da00b97。原审计起点 1571de6 后，由并行 main@52fc19e7 单独修复了 provider-consumer.js 中两处 Workflow 专用设置文案，故本次直接复用，不重复修改或占用该文件。远端代码核对不等于 Mac 本地工作区或已安装浏览器验收。

**本轮写入文件：**
- `src/ui/conversation/prompt-controller.js`：仅 Prompt Adapter 管理 UNKNOWN 的 ETag 人工核对；版本变化必须重新读回。
- `src/ui/react/components/conversation.tsx`：通用 Dock 仅依赖业务恢复结果和展示文案，移除业务 ETag。
- `src/ui/react/main.tsx`：只在 Prompt 可信入口建立并按实例关闭恢复 Adapter。
- `tests/environment/opendesk-conversation-r17-prompt-recovery.test.mjs`：二次确认、版本变化、并发、实例销毁和 Frame 边界定向检查。
- 本记录。未修改权威架构合同、Extension UI Showcase、Workflow/Task/Bookmark/Prompt Host 或生成预览。

**合同与安全：** 可信 Prompt Controller `reconcile()` 可返回 `nextActionLabel`；原 Host `reconcile({acknowledgeEtag})` 是唯一持久状态裁决，不扩权、不增存储和模型接口；首次读回不明确时，要求人工核对后第二次真实点击，版本变化不接受旧确认，UNKNOWN 不自动重放。Provider Lease / installEpoch / Native thread/Stop 的既有职责不动。

**测试复用与资源：** 不访问 Mac Chrome/CFT/Profile、Native、watcher、dist/development、端口或本地 Git 索引；历史 `shared-ai-r231-local-20261024.md` 的真实「我的」Run/Stop、Workflow 中文会话按旧候选限定复用，不冒充本轮四业务全链路 PASS。远端源码写入不等于本地差异已合并。

**候选后续验证：** Node `opendesk-conversation-r17-prompt-recovery.test.mjs`、`opendesk-conversation-r14-dock.test.mjs`、`shared-ai-conversation-r22/r23.test.mjs`；真实 Chrome 执行 Prompt「你好」保存重启、Bookmark 创建/编辑真实 ID/树读回、「我的」查询确认运行 Stop、Workflow 先复用已安装→不匹配时规划→RunHost 核验。核对 HTTPS 切换、撤权、Native thread、Stop/UNKNOWN 和正式包升级。**Mac Chrome/Native/安装升级 NOT_TESTED**；旧 CI 不证明本候选。
