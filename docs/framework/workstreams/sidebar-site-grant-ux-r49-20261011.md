# Sidebar Site Grant UX R4.9（2026-10-11）

## 本轮目的

由用户反馈驱动：移除“阅读目录”以及网页剪藏、知识收件箱站点授权操作中的重复 JavaScript 确认框；把“✓ 可用 / ⊘ 不可用”恢复为 Side Panel 普通按钮尺寸，并调整未能识别网页时的错误提示。

## 源码与并行边界

- 基线 main：`331a765e28f5fb61e97e4ebf2e7d35fd2f330e8b`。
- 隔离分支：`agent/site-grant-inline-ux-r49-20261011`，草稿 PR #61。原因：main 在本次修改期间发生多次并行提交；不得直接覆盖或推送 main。
- 修改：`src/ui/sidebar-tools.js`、`src/ui/tool-shell.css`，两份产品/权限文档，`tests/environment/sidebar-tools-host.test.mjs` 以及 Sidebar UI PR 定向测试工作流。
- 不改安装器、`manifest.json`、`chrome.permissions.request`、网页 Page/Service 权限边界、卸载和丢弃编辑草稿确认。
- 应用级授权只接受可信 UI 明确点击，仍受 per-Origin 授权、同一工具/目录 Web Lock、installed identity 与当前 document revalidate 约束。关闭或撤销权限继续保守失败。

## 校验与证据状态

- 组件新增合同：阅读目录可用/不可用一次点击，重复选择不重写；剪藏和知识收件箱单击授权/撤销，确认框调用为零；授权不会自动运行 iframe；34px 宽度随内容控制 CSS。
- PR 第一候选 `c6059d7b0af5bb67f14ed1f76a4d43ceeda22e7c`：GitHub [Site access targeted checks](https://github.com/shopable-ai/opendesk-browser/actions/runs/38141562121) 成功；Sidebar UI 合同 100 项通过、`npm run check` 源码检查通过，但其他构建相关 workflow 在 SW 固定体积上限处阻塞。
- **已知非本轮 SW 阻塞**：构建产物 `sw.js` 为 330248 bytes，上限 327680 bytes，超出 2568 bytes。本次未修改 SW 或体积预算，禁止为了获得绿色 CI 而放宽守卫。仅能报告 `BUILD_BLOCKED`，不可提升为构建或 Native PASS。
- 第二候选新增 PR 独立 Sidebar Host 单测入口，需要读取更新后 run 的原始结果；即使组件通过，仍需用户 Mac Chrome 当前真实登录网站与 Chrome 本机权限/撤权验证。
- 用户 Mac 本地工作区不可由此环境访问；没有伪造真实 Chrome PASS 或本地 Git 状态，也没有远端 main 集成。
