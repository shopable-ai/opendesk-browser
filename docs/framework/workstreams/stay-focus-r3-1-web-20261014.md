# Stay Focus R3.1 · 网页实施审计与交接

日期：2026-10-14。负责人：本轮 GitHub 网页实施 Agent，唯一写入分支 `main`。未申请独占 Mac Chrome、CFT profile、端口或共享 dist。禁止修改其他 Agent 的并行工作文件。

## 变更所有权与依赖

- `src/ui/sidebar-tools.js`、`src/ui/tool-shell.css`：官方包的预编译能力准入门槛与 Stay Focus 首屏可信授权，复用 Time Review 的并列显示布局，不增加第二 Host。
- `src/stay-focus/host-controls.js`：停用工具不请求原生权限；原有信任手势与 DNR 调用保持在扩展。
- `examples/sidebar-tools/stay-focus/`：真实沙箱 UI 停用 CTA 引导可信设置，并正式升级工具包至 `1.0.1`。
- `.agents/skills/opendesk-sidebar-tool-dev/SKILL.md`：固定无需项目源码的发行体验、能力检测、功能验证与证据分级。
- `tests/environment/sidebar-tools-host.test.mjs`、`stay-focus-r1.test.mjs`、`stay-focus-boundary-r1.test.mjs`：缺失 Host、首次授权、停用按钮及已停用权限测试。

## 不改动的能力

保留既有 Catalog、installer、Browser SDK、Quick Notes、Time Review、Stay Focus MV3 计时/DNR 与独立卸载事务；不把安装工具包的脚本在 SW 提权执行，不新增运行器。

## 验证状态

源码已修改；Node 与远端 CI 必须按最终 commit SHA 核验。真实 Mac Chrome 原生权限弹窗、每日真实计时、DNR 导航、提醒、SW/浏览器重启、卸载清理及多工具隔离均为 `NOT_TESTED`，留交本地 Codex，不能凭源码自评 95+。
