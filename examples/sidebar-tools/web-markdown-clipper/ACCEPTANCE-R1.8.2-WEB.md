# Web Markdown Clipper R1.8.2-WEB · 验收与发布关口

## 基线及范围

- 唯一仓库/分支：`shopable-ai/opendesk-browser` / `main`。
- 源码核查基线：`31da04d38722ad3512b9ac9926bc9e19192efb5b`，核查起点版本 `1.2.0`，此后并行上游已经发布 `1.2.1` 富选区。
- 本轮 `tool.config.json` 候选版本：`1.2.2`。最新提交 SHA 和 CI 结果以 GitHub 回执为准。
- 保留 Host、存储结构、工具 ID 与所有已具备的功能；产品尚未上线，不执行旧安装数据迁移。

## 修复点

1. 重复点击当前模式直接返回；切换其他模式仅更改显示，不自动请求 Host。
2. 当前网页会话至多四种模式结果；选区与引用共享一次真实选区提取，文章不会进入选区，链接只由可信标题及来源生成。
3. 未提取的目标模式显示空状态且禁止导出；同页有效模式允许直接恢复。
4. `currentPage.info`、可信 Host 来源与页面变化事件协同约束缓存；拒绝旧网页内容、跨网页来源和迟到请求。
5. `composeMarkdown` 从原始正文一次性组合 `footer` / `yaml` / `none`，预览、源码、保存、复制和下载共用输出。
6. `notes.js` 在用户发起保存时冻结请求正文、标题和来源，回执之前禁止重复保存及改变模式；便签编辑草稿独立保存，不被网页导航清空。

## 已执行的检查与待执行的验收

| 检查 | 状态 | 证据 / 约束 |
| --- | --- | --- |
| GitHub 源码核查 | PASS | 核对 `clip.*`、`currentPage.info`、正式源码和现有测试 |
| 内嵌 JS 模拟交互 | PASS | 对真实 `main.js` 运行 11 项独立模拟，均通过；不是 Node 或 Chrome 实机 |
| UI 模拟执行仓库测试 | PARTIAL | 先行运行 24 项，23 项通过；一条旧断言违反新页面身份约束，已更新但仍需正式 Node 重跑 |
| 正式 Node 测试 | NOT_TESTED | GitHub 连接不提供仓库 Node 执行环境；已新增测试 |
| 正式 `npm run build` | NOT_TESTED | 需真实构建回执 |
| App CI / Chromium | NOT_TESTED | 推送 main 后应读取该提交对应的 App CI 工作流回执 |
| Mac Chrome 与原生右键 | NOT_TESTED | 必须实际安装、授权、导航并检查右键及保存回读 |
| `1.2.2` 正式包晋升 | BLOCKED | 只能从已验证 App CI 候选经 `app-release` 晋升，禁止手工编辑 `.opendesk-tool.json` |
| 旧数据兼容 | NOT_APPLICABLE | 本工具尚未上线 |

## 真实验收命令

```bash
node --test examples/sidebar-tools/web-markdown-clipper/tests/*.test.mjs
npm run build
node scripts/app-ci.mjs build web-markdown-clipper
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project
```

正式发布需验证最新 main SHA、App CI 对应的候选 SHA-256、Linux/Chromium 及按 profile 要求的 macOS Chrome 实测、`app-release` 晋升结果和 1.2.1 正式包完全一致。任何未实际执行的检查不得标记 PASS。

## 并行更新处理

本轮最初核查后，main 上游并行新增富右键选区 `selectionMarkdown`、嵌套列表 Markdown 预览，以及 1.2.1 正式包。此轮从最新 main 重新合入这些特性、保留上游测试并将模式安全修复独立升级为 1.2.2 源码候选。1.2.1 旧正式包不代表 R1.8.2 已发布。
