# Market R6.9.2 · 网页状态收口与安装后打开真实应用（2026-10-27）

- Owner：本轮应用市场最小修复；只在 `main`，未使用本地 Mac/Chrome/dist 资源。
- 问题：公开市场显示卸载前的“已安装”；市场安装成功后的“查看应用”错误进入 ExtensionDetail 技术信息页，而不是目标应用的真实 ToolHost。
- 修复：`src/market-site/client.js`、`src/market-site/templates.mjs` 仅保留发现/发起审阅/恢复未决事务回执，停止当前应用安装状态的自动查询和“打开已安装”动作。`src/marketplace/install.js`、`src/ui/market-install-sheet.js`、`src/ui/tool-shell.js` 在成功审阅后，用户明确点击“打开使用”时复用 `extensionCenter.openInstalledMarketApp`，再次检查包身份、版本、启用状态和现有 ToolHost 保护。
- 回归：`tests/environment/market-site-client-r5.test.mjs`、`market-trusted-install.test.mjs`、`market-install-sheet.test.mjs`、`market-panel-navigation-r691.test.mjs` 更新断言；不新增 Registry、同步系统或额外授权。
- 已执行：目标模块语法检查 PASS；网页内存协议流程 `PROBE → OPEN_INSTALL_REVIEW → GET_INSTALL_STATUS(installed) → OPEN_INSTALL_REVIEW` PASS；无 `GET_APP_STATUS`/网页 `OPEN_INSTALLED_APP`。
- 尚未执行：仓库 Node 定向测试、真正的 Mac Chrome/本地 Side Panel 安装→打开书签→卸载验收：`NOT_TESTED`。历史候选的已通过证据不能替代本轮候选实测。
- 恢复风险：结果未知、身份变化、已停用仍需可信宿主明确拦截；不自启、不二次安装。
