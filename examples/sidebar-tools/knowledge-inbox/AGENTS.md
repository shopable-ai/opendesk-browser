# 知识收件箱：AI/Codex 就近开发规则

**适用范围：`examples/sidebar-tools/knowledge-inbox/**`。先遵守仓库根 `AGENTS.md`；本文件是本目录的补充，不是替代。

## AI 开始改代码前

按顺序读：仓库根 `AGENTS.md`、`docs/framework/testing-guide.md`、当前目录 [DEVELOPMENT.zh-CN.md](DEVELOPMENT.zh-CN.md) 与 [README.zh-CN.md](README.zh-CN.md)、[公共 Side Panel API](../../../docs/api/sidebar-tools.zh-CN.md)。跨工具开发可参考 [opendesk-sidebar-tool-dev Skill](../../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)。

- 界面源码只改 `src/index.html`、`src/style.css`、`src/main.js`；正式打包输入为仓库根 `src/sidebar-tools/knowledge-inbox.opendesk-tool.json`。
- 页面按钮改 `src/knowledge/page.js`；可信存储与校验改 `src/knowledge/model.js`、`service.js`、`policy.js`；工作区交接改 `src/knowledge/workspace-handoff.js`。如涉及这些根目录之外的文件，先说明实际依赖与测试影响。
- `page.capture`、`knowledge.store`、`knowledge.*` 为本工具受信任内部路径，**不得**擅自宣传或实现为三方通用公开 API。
- 不绕过单独网站授权、真实 sender/document、可信点击、包哈希、共同锁、撤权、版本及容量校验。不从沙箱直接访问 `chrome`、网页 DOM 或 Native；不注入远端 JS。
- 不把用户个人对话、凭证、公司数据、绝对目录写入包或测试 fixture；不静默截断数据、不用新捕获覆盖用户已整理的草稿。
- 交接/载入 Markdown 不是写盘；必须有用户授权、明确的创建、回执及读回才能宣称写入。云盘同步须单独验证。
- 仅在安全的 `main` 和已协调的测试资源上作业，不强推/重置/清理其他 Agent 的修改、Profile、证据。不编造验收 PASS。

## 源码交付必须完成

1. 修改相应真实源码而非直接修改序列化 JSON。
2. 执行 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/knowledge-inbox --out examples/sidebar-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json`；审核内容后同步到 `src/sidebar-tools/knowledge-inbox.opendesk-tool.json`。
3. 运行 `npm run check`、知识工具与宿主定向测试、`npm run build`、`npm run build:dev`、`npm run verify`；原生 Chrome 的现有 CI 入口为 `.github/workflows/knowledge-inbox-r1.yml`。
4. 人类可读行为变化更新本目录 README；通用 API 变化更新 `docs/api/sidebar-tools.zh-CN.md`；产品路线更新 `docs/product/chatgpt-knowledge-inbox-r1.zh-CN.md`；候选和原始证据记入 `docs/framework/workstreams/knowledge-inbox-r1-20261011.md`。
5. 汇报时分开列 `PASS / FAIL / BLOCKED / NOT_TESTED`，附 commit、构建包哈希和测试范围；不把受控 DOM 冒充线上 ChatGPT，不把 SW 启动冒充 Native 文件写入。
