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

## 本轮候选 CI 诊断与定向修正（2026-10-25）

- 首个提交 `c7421c06a0cfbfc0ab1520211983aeaa00e0c3de` 的 Shared AI CI [40187010883](https://github.com/shopable-ai/opendesk-browser/actions/runs/40187010883) 对应 Node **198/199**，唯一失败为 `opendesk-conversation-r14-dock.test.mjs` 对历史 `sidebar-tool-header-more` 的静态正则；Bookmark Agent CI [40187010862](https://github.com/shopable-ai/opendesk-browser/actions/runs/40187010862) 同一过时断言，**333/334**。日志中新增三项 Prompt R2.4 恢复测试均 PASS。
- 最新正式 `tool-host.tsx` 保留唯一 `TrustedConversationHeaderSlot`，但管理控件已由并行 Extension UI 调整为 `sidebar-tool-header-actions` 内直接显示工具设置及卸载两个图标；无旧 `sidebar-tool-more-menu`。此处归类为 **TEST_BUG / 旧 UI 断言过时**，而非恢复旧菜单的产品需求。只更新这一测试对现有正式 React 所有权的断言，业务源及并行 UI 文件保持不变。
- 同候选 Bookmark Manager Chromium [40187010891](https://github.com/shopable-ai/opendesk-browser/actions/runs/40187010891) 单独报“收藏当前页”工具栏按钮不可点击；属于独立 UI 风险，**未验证与本次 Shared AI 修复的因果关系，保持 FAIL/NEEDS_REVIEW**。其他工作流失败不合并归因；没有伪造通过。
- 本修正后的新候选必须重新读取实际 Actions/Job 原始退出码；Mac Chrome/Native/四入口业务读回继续 NOT_TESTED。
