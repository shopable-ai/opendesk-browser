# R25.1 本地项目一键保存 / 本机安装 / 版本更新工作流

日期：2026-10-11。仓库：`shopable-ai/opendesk-browser`，分支：`main`。

## 已直接写入源码

- Page 默认规则从所有 HTTP(S) 收窄到实际预览协议+主机；R12 旧断言已随源码更新。
- 本地 Page 结果进入原可见 `#developer-results-panel`；Provider Epoch/项目/文档变化导致旧结果失效。
- 复用底部 `#script-save`：本地 Page/Controller 只有成功运行并具备版本身份时可进入小型安装确认；未验证不可安装。
- `src/ui/local-project-install.js` 复用现有 Page Candidate/Verify/Available/Install 与 Task v1 Import/Verify/Available/Install，不建新安装数据库。每次确认前重新解析本地源码并核对 `bindingId/providerEpoch/inputHash/sourceHash/sourceBytes`。
- Page 正式 Verify 的二次执行会在确认区明示；Controller 复用持久完成结果及原生页面操作回执。
- 「工具」从正式 Page Installed/Authority 查询和展示已安装网页脚本，提供原生授权受控的启停；Controller 安装后刷新「我的」任务。
- Page/Task 升级时保留原工具停用状态；自包含已安装代码独立于本地 Provider。
- 安装未知/错误不自动重试，必须只读核对持久安装记录。

主要修改：`src/ui/script-editor.js`、`src/ui/local-project.js`、`src/ui/local-project-install*.js`、`src/ui/installed-page-tools.js`、`src/ui/tool-shell.js`、`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/page-candidate-source.js`、`src/platform/tasks/service.js`、`src/scripting/user-scripts/installed-programs.js`、相关测试与文档。

## 测试证据等级与状态

| 项目 | 当前状态 | 说明 |
| --- | --- | --- |
| GitHub 对 `main` 的源码提交 | 已完成 | 多次受保护的精确 HEAD/文件 SHA 写入，未新建分支 |
| 源码组件与合约回归 | NOT_TESTED（等待新提交 CI 完成） | 已增加 `tests/environment/local-project-install-r251.test.mjs`，旧 R12 范围测试已修正 |
| `npm run check` / `npm test` / 双构建 / `npm run verify` | NOT_TESTED | 当前聊天执行环境不含用户 Mac 仓库，不能声称已本机执行 |
| 真实受控 Mac Chrome/CFT、真实 Native Provider | NOT_TESTED | 必须核对独立 Chrome Profile、运行回执与候选包 SHA |
| 本地保存→安装→断线→Chrome 重启→重复使用 | NOT_TESTED | 需要 Mac 原生完整 E2E |
| 明暗主题、360/400/600px、200% 缩放与 WCAG 对比度 | NOT_TESTED | 已增加窄侧栏审阅布局 CSS，需要截图与辅助技术检查 |
| 在线第三方作者市场发布 | 未实现 | 当前 Market 只支持随扩展发行的官方固定 Catalog 安装，无真实上传发行服务合同 |

历史 CI 在改变普通 Page 默认匹配后曾因旧测试仍期望 `*://*/*` 而失败；已定位并修改 `tests/environment/script-editor.test.mjs`，不能把旧失败自动升级为新候选成功。

## 接下来最小闭环

在 Mac 本地 Codex 执行 `docs/framework/prompts/goal-r251-mac-final-acceptance.md`，先定向测试、修复真实断言和权限/版本缺陷，再运行必要全量构建与受控 Chrome；记录 PASS/FAIL/BLOCKED/NOT_TESTED 与真实截图、安装数据、结果身份、最终 SHA。任何修复只能保持原有安全边界，不能跳过 Page 正式验证或伪造 Task 原生成功回执。
